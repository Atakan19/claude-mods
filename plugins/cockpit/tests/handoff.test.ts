import { expect, mock, test } from 'claude-code/testing'

import { handoffTokens, parseArgs, SAVE_PROMPT } from '../hooks/handoff'

const usage = (tokens: number) => ({ startedAt: 0, context: { tokens, window: 1_000_000, percent: tokens / 10_000 }, rateLimits: [], cost: { usd: 0 } })
const done = (turnId: string) => ({ answer: 'ok', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })

test('args: mode first, the rest is the note', () => {
  expect(parseArgs('')).toEqual({ mode: 'clear', note: '' })
  expect(parseArgs('compact')).toEqual({ mode: 'compact', note: '' })
  expect(parseArgs('Compact tests still red')).toEqual({ mode: 'compact', note: 'tests still red' })
  expect(parseArgs('mid refactor of X')).toEqual({ mode: 'clear', note: 'mid refactor of X' })
  expect(handoffTokens(200)).toBe(200_000)
  expect(handoffTokens(0)).toBe(0)
  expect(SAVE_PROMPT('tests red')).toContain('"tests red"')
  expect(SAVE_PROMPT('')).toContain('Where we stopped')
})

test('past the size it only recommends; /handoff saves, clears and leaves the pick-up prompt unsent', { options: { language: 'en', pane: false, handoffAtK: 200 } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let tokens = 250_000
  const toasts: string[] = []
  const submitted: string[] = []
  const commands: string[] = []
  const filled: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage(tokens) }))
  on('settings.read', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: null }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('command.run', (_, e) => {
    commands.push(e.command)
    return {}
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete(done('t1'))
  await $.turn.complete(done('t2'))
  // One toast, and nothing else happens on its own.
  expect(toasts.filter(x => x.includes('handoff'))).toHaveLength(1)
  expect(submitted).toEqual([])
  expect(commands).toEqual([])

  await $.command.run({ command: 'handoff', args: 'tests still red' })
  await clock.advance(1)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('"tests still red"')

  // The save turn ends: clear, then the pick-up prompt waits in the box.
  tokens = 20_000
  await $.turn.complete(done('t3'))
  await clock.advance(1)
  await clock.settle()
  expect(commands).toContain('clear')
  expect(filled[0]).toContain('handoff note')
})


