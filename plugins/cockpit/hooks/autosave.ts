import type { EngineInterface, TurnCompleteInput } from 'claude-code'

import { t } from './i18n'

export type AutoSaveMode = 'clear' | 'compact'

// What Claude is asked to write down before the context goes; memory is read again after a clear.
const SAVE_PROMPT = [
  'The context is nearly full and will be cleared after this turn. Save everything needed to continue:',
  'the goal, what is done, the open steps, decisions and their reasons, files touched, open questions.',
  'Write it to your persistent memory as one project memory named "handoff" (replace an older one) and link it in MEMORY.md;',
  'without a memory directory, write HANDOFF.md in the working directory instead. Then answer with one line saying where it is.',
].join(' ')

const COMPACT_KEEP = 'Keep the goal, the open steps, the decisions and where the handoff note was saved.'

// Off below 1; above 100 never reached.
export const autoSaveAt = (option: unknown) => (typeof option === 'number' && option > 0 ? option : 0)

// The whole flow once the save turn has ended: the command, then the box primed to pick up again.
async function finish($: EngineInterface, mode: AutoSaveMode) {
  await $.command.run(mode === 'clear' ? { command: 'clear' } : { command: 'compact', args: COMPACT_KEEP })
  if (mode === 'clear') await $.prompt.fill({ text: t().autoSaveResume })
}

export type AutoSave = { at: number; mode: AutoSaveMode }

// Where the flow stands; a reload starts it over.
let phase: 'watching' | 'saving' | 'finishing' = 'watching'

// At `at` % context: one turn to save the state, then /clear (or /compact). Once per fill-up.
// Called from data.ts's turn.complete hook after a main-loop turn: one hook per event.
export async function autoSaveAfterTurn($: EngineInterface, e: TurnCompleteInput, { at, mode }: AutoSave) {
  if (phase === 'saving') {
    if (e.reason !== 'answer') {
      phase = 'watching'
      return
    }
    // The save turn ended; the command runs after this hook, once the session is idle.
    phase = 'finishing'
    $.clock.after(0, () => {
      void finish($, mode)
        .catch(() => $.ui.toast(t().autoSaveFailed))
        .finally(() => (phase = 'watching'))
    })
  } else if (phase === 'watching' && !e.isAborted) {
    const percent = (await $.session.usage()).context.percent ?? 0
    if (percent < at) return
    phase = 'saving'
    $.ui.toast(t().autoSaveAt(Math.round(percent), mode === 'clear' ? '/clear' : '/compact'), { timeoutMs: 10_000 })
    void $.prompt.submit({ text: SAVE_PROMPT }).catch(() => (phase = 'watching'))
  }
}
