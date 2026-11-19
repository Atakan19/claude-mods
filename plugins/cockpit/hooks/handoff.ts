import type { EngineInterface, On } from 'claude-code'

import type { HandoffState } from '../types'
import { t } from './i18n'
import { getHandoff, setHandoff } from './state'

// Every turn re-sends the whole context, so a long session pays its full size on each call.
// Past a size the band recommends /handoff; nothing happens until the person runs it, at a
// point they choose. /handoff writes a brief, clears the conversation and leaves the pick-up
// prompt in the box; `/handoff compact` keeps a summary instead of clearing.

export const SAVE_PROMPT = (note: string) =>
  [
    'Handoff: the conversation will be cleared after this turn. Save a brief a fresh session can continue from without re-reading.',
    'Start with "Where we stopped": the user\'s last request in their own words, what you answered or did last, and what was about to happen next.',
    note ? `The user says about where we stand: "${note}". Put this first and trust it over your own reading.` : '',
    'Then: 1. the goal and what done looks like, 2. what is done, 3. the next step, then the other open steps,',
    '4. path:line facts, one each, 5. limits: what not to touch, 6. the test command, first for the files that changed,',
    '7. background runs still going (tests, builds, servers), so they are awaited, never started again;',
    'also decisions with their reasons and open questions. Write it in the language the user writes in.',
    'Save it to your persistent memory as one project memory named "handoff" (replace an older one) and link it in MEMORY.md;',
    'without a memory directory, write HANDOFF.md in the working directory instead. Then answer with one line saying where it is.',
  ]
    .filter(Boolean)
    .join(' ')

export const RESUME = 'Read the handoff note, start from "Where we stopped", and continue.'
const COMPACT_KEEP = 'Keep the goal, the open steps, the decisions, the last exchange and where the handoff note was saved.'

// The size that brings the hint, in tokens; 0 is off. The option is in thousands (200 = 200k).
export function handoffTokens(option: unknown) {
  return typeof option === 'number' && option > 0 ? Math.round(option * 1000) : 0
}

// `/handoff`, `/handoff compact`, `/handoff <note>`, `/handoff compact <note>`.
export function parseArgs(args: string): { mode: HandoffState['mode']; note: string } {
  const text = args.trim()
  const m = text.match(/^(clear|compact)\b\s*/i)
  return { mode: m?.[1]?.toLowerCase() === 'compact' ? 'compact' : 'clear', note: (m ? text.slice(m[0].length) : text).slice(0, 500) }
}

// What the band asks: show the hint now?
export function handoffDue(h: HandoffState, ctxTokens: number, threshold: number) {
  return threshold > 0 && h.armed && h.phase === 'watching' && ctxTokens >= threshold
}

// Called from the one session.start hook in data.ts.
export async function startHandoff($: EngineInterface) {
  await $.command.register({ name: 'handoff', description: t().handoffCommand, argumentHint: '[compact] [note]' })
}

async function finish($: EngineInterface, mode: HandoffState['mode']) {
  if (mode === 'compact') {
    await $.command.run({ command: 'compact', args: COMPACT_KEEP })
    return
  }
  await $.command.run({ command: 'clear', args: '' })
  // Left in the box, not sent: the person reads it and presses Enter.
  await $.prompt.fill({ text: RESUME })
}

export function registerHandoff(on: On) {
  on('command.run', { command: 'handoff' }, async ($, e) => {
    if ((await getHandoff($)).phase !== 'watching') return { text: t().handoffBusy }
    const a = parseArgs(e.args)
    await setHandoff($, { phase: 'saving', mode: a.mode })
    // The save turn starts once the command has printed and the session is idle.
    $.clock.after(0, () => void $.prompt.submit({ text: SAVE_PROMPT(a.note) }).catch(() => setHandoff($, { phase: 'watching' })))
    return { text: t().handoffSaving(a.mode) }
  })
}

// The main loop's turn ended; called from the one turn.complete hook in data.ts.
export async function handoffAfterTurn($: EngineInterface, e: { reason: string; isAborted: boolean }, used: number, threshold: number, toasts: boolean) {
  if (threshold === 0) return
  const h = await getHandoff($)
  if (h.phase === 'saving') {
    if (e.reason !== 'answer') {
      await setHandoff($, { phase: 'watching' })
      return
    }
    await setHandoff($, { phase: 'finishing', armed: false, toasted: false })
    // The command runs after this hook, once the session is idle.
    $.clock.after(0, () => {
      void finish($, h.mode)
        .catch(() => $.ui.toast(t().handoffFailed))
        .finally(() => void setHandoff($, { phase: 'watching' }))
    })
  } else if (h.phase === 'watching' && !e.isAborted) {
    if (used < threshold) {
      if (!h.armed || h.toasted) await setHandoff($, { armed: true, toasted: false })
    } else if (h.armed && !h.toasted && toasts) {
      await setHandoff($, { toasted: true })
      $.ui.toast(t().handoffHint(Math.round(used / 1000)), { timeoutMs: 10_000 })
    }
  }
}
