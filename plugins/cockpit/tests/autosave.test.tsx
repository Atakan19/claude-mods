import { expect, mock, test } from 'claude-code/testing'

const usage = (percent: number) => ({
  startedAt: 0,
  context: { tokens: percent * 2_000, window: 200_000, percent },
  rateLimits: [],
  cost: { usd: 0 },
})

test('past the threshold Claude saves first, then the session clears once', { options: { language: 'en', autoSaveAt: 80, pane: false, sounds: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let percent = 50
  const submitted: string[] = []
  const commands: string[] = []
  const filled: string[] = []
  on('session.usage', () => ({ value: usage(percent) }))
  on('settings.read', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: null }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('command.run', (_, e) => {
    commands.push(e.command)
    return {}
  })
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  const turn = (id: string) => $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: id, reason: 'answer' })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await turn('t1')
  expect(submitted).toHaveLength(0)

  percent = 85
  await turn('t2')
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('handoff')
  expect(commands).toHaveLength(0)

  // The save turn ends: /clear runs, and the box offers to pick up again.
  await turn('t3')
  await clock.advance(10)
  expect(commands).toEqual(['clear'])
  expect(filled).toEqual(['Read the handoff note and continue from there.'])

  // Fresh context: watching again, nothing more fires below the threshold.
  percent = 5
  await turn('t4')
  expect(submitted).toHaveLength(1)
})
