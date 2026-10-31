import { expect, mock, test } from 'claude-code/testing'

const usage = (tokens: number) => ({
  startedAt: 0,
  context: { tokens, window: 1_000_000, percent: tokens / 10_000 },
  rateLimits: [],
  cost: { usd: 0 },
})

const setup = (on: Parameters<Parameters<typeof test>[2]>[1], size: () => number) => {
  const log = { submitted: [] as string[], commands: [] as string[], filled: [] as string[] }
  on('session.usage', () => ({ value: usage(size()) }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => {
    log.submitted.push(e.text)
    return { text: e.text }
  })
  on('command.run', (_, e) => {
    log.commands.push(e.command)
    return {}
  })
  on('prompt.fill', (_, e) => {
    log.filled.push(e.text)
    return { isFilled: true }
  })
  return log
}

const turn = ($: Parameters<Parameters<typeof test>[2]>[0], id: string) =>
  $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: id, reason: 'answer' })

test('past the token size Claude saves a brief, then clears and carries on by itself', { options: { handoffAtTokens: 200, handoffResume: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let tokens = 150_000
  const log = setup(on, () => tokens)

  // 15 % of a 1M window: a percent threshold would not fire, the token one does at 200k.
  await turn($, 't1')
  expect(log.submitted).toHaveLength(0)

  tokens = 210_000
  await turn($, 't2')
  expect(log.submitted).toHaveLength(1)
  expect(log.submitted[0]).toContain('path:line')

  await turn($, 't3')
  await clock.advance(10)
  expect(log.commands).toEqual(['clear'])
  expect(log.submitted.at(-1)).toBe('Read the handoff note and continue from there.')
  expect(log.filled).toHaveLength(0)

  tokens = 30_000
  await turn($, 't4')
  expect(log.submitted).toHaveLength(2)
})

test('without carry on the pick-up prompt waits in the box', { options: { handoffAtTokens: 200 } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const log = setup(on, () => 250_000)

  await turn($, 't1')
  await turn($, 't2')
  await clock.advance(10)
  expect(log.commands).toEqual(['clear'])
  expect(log.filled).toEqual(['Read the handoff note and continue from there.'])
})
