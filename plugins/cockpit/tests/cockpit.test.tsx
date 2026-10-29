import { expect, mock, test } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  context: { tokens: 68_000, window: 200_000, percent: 34 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
  cost: { usd: 1.25 },
}

test('band and reply line show one turn', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({
    answer: 'First part.\n\nAll done.',
    durationMs: 14_000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' },
  })

  const band = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect((await band.find({ type: 'Text', text: /34%/ }))?.text).toContain('68.0k/200.0k')
  expect(await band.find({ type: 'Text', text: /Cache 1h$/})).toBeTruthy()
  await band.unmount()

  const reply = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AssistantMessage',
    surface: 'desktop',
    props: { text: 'All done.', isFirstOfReply: false },
  })
  expect((await reply.find({ type: 'Text', text: /⏱/ }))?.text).toBe('⏱ 14s · 0 Tools · +0 Context · ≈ $0.00 · Cache 90%')
  await reply.unmount()

  const other = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AssistantMessage',
    surface: 'desktop',
    props: { text: 'Something else.', isFirstOfReply: true },
  })
  expect(await other.find({ type: 'Text', text: /⏱/ })).toBeFalsy()
  await other.unmount()
})
