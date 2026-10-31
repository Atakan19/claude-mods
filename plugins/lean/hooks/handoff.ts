import type { EngineInterface, On, TurnCompleteInput } from 'claude-code'

// Every turn re-sends the whole context, so a session at 500k pays 500k per call. Past a size,
// one turn writes a brief, then /clear starts over small and the brief is read back.

// What Claude writes before the context goes; memory is read again after a clear.
export const SAVE_PROMPT = [
  'The context is large and will be cleared after this turn. Save a brief a fresh session can continue from without re-reading:',
  '1. the goal and what done looks like, 2. what is done, 3. the next step, then the other open steps,',
  '4. path:line facts, one each, 5. limits: what not to touch, 6. the test command; also decisions with their reasons and open questions.',
  'Write it to your persistent memory as one project memory named "handoff" (replace an older one) and link it in MEMORY.md;',
  'without a memory directory, write HANDOFF.md in the working directory instead. Then answer with one line saying where it is.',
].join(' ')

export const RESUME = 'Read the handoff note and continue from there.'

const COMPACT_KEEP = 'Keep the goal, the open steps, the decisions and where the handoff note was saved.'

export type HandoffMode = 'clear' | 'compact'

// tokens: context size that triggers it (a 1M window makes % too coarse); resume: send RESUME so a session nobody watches keeps working.
export type Handoff = { tokens: number; mode: HandoffMode; resume: boolean }

// Off unless handoffAtTokens (in thousands) is set: it clears the conversation on its own.
export function handoffOptions(options: Record<string, unknown>): Handoff | undefined {
  const k = typeof options.handoffAtTokens === 'number' && options.handoffAtTokens > 0 ? options.handoffAtTokens : 0
  if (k === 0) return undefined
  return { tokens: k * 1000, mode: options.handoffMode === 'compact' ? 'compact' : 'clear', resume: options.handoffResume === true }
}

// Where the flow stands; a reload starts it over.
let phase: 'watching' | 'saving' | 'finishing' = 'watching'

async function finish($: EngineInterface, { mode, resume }: Handoff) {
  await $.command.run(mode === 'clear' ? { command: 'clear' } : { command: 'compact', args: COMPACT_KEEP })
  if (mode !== 'clear') return
  if (resume) await $.prompt.submit({ text: RESUME })
  else await $.prompt.fill({ text: RESUME })
}

// Past the size: one turn to save the state, then /clear (or /compact). Once per fill-up.
async function afterTurn($: EngineInterface, e: TurnCompleteInput, h: Handoff) {
  if (phase === 'saving') {
    if (e.reason !== 'answer') {
      phase = 'watching'
      return
    }
    // The save turn ended; the command runs after this hook, once the session is idle.
    phase = 'finishing'
    $.clock.after(0, () => {
      void finish($, h)
        .catch(() => $.ui.toast('lean: handoff clear/compact failed'))
        .finally(() => (phase = 'watching'))
    })
  } else if (phase === 'watching' && !e.isAborted) {
    const used = (await $.session.usage()).context.tokens ?? 0
    if (used < h.tokens) return
    phase = 'saving'
    $.ui.toast(`lean: context at ${Math.round(used / 1000)}k, saving a handoff, then /${h.mode}`, { timeoutMs: 10_000 })
    void $.prompt.submit({ text: SAVE_PROMPT }).catch(() => (phase = 'watching'))
  }
}

export function registerHandoff(on: On, h: Handoff) {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // Main loop only: a subagent's turn says nothing about this session's context.
    if (e.agentId === undefined) await afterTurn($, e, h).catch(() => {})
    return r
  })
}
