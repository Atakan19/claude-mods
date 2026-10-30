import { expect, mock, test } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  context: { tokens: 68_000, window: 200_000, percent: 34 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
  cost: { usd: 1.25 },
}

test('band and reply line show one turn', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: USAGE }))
  on('settings.read', () => ({ value: { model: 'opus' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: null }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-haiku-4-5' }))
  on('tool.call', (_, e) => ({ result: e.tool === 'Bash' ? { backgroundTaskId: 'b1' } : {} }))
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

  // A spawned subagent gets a strip with its latest tool; an engine fork does not.
  const spawn = { tool_use_id: 'u1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false } as const
  await $.agent.spawn({ ...spawn, prompt: 'look', description: 'Explore code', subagentType: 'Explore' })
  await $.agent.spawn({ ...spawn, prompt: 'fork', description: 'compact', subagentType: 'fork' })
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' })
  // A command left running and a chat started from here hang off the session in the pane.
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server', run_in_background: true })
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', title: 'Pane tabs' } as never)
  // Files the tools touched, and a goal Claude proposed.
  await $.tool.call({ tool: 'Edit', file_path: '/work/hooks/pane.tsx', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/work/hooks/data.ts' } as never)
  await $.tool.call({ tool: 'ProposeGoal', condition: 'All tests pass' } as never)

  // Desktop: the pills, then the agents' bar with one strip.
  const band = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect(await band.find({ type: 'Text', text: '68k' })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: '42%' })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: '1 aktiv · 1' })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: 'Agents' })).toBeTruthy()
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts.filter(a => a.startsWith('agent '))).toEqual(['agent Explore code: running, Grep'])
  await band.unmount()

  // Terminal: the same figures as text.
  const line = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect(await line.find({ type: 'Text', text: /cache/ })).toBeTruthy()
  expect(await line.find({ type: 'Text', text: /Explore code · Grep/ })).toBeTruthy()
  await line.unmount()

  for (const surface of ['desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({
      plugin: 'cockpit',
      component: 'Pane',
      requestId: 'cockpit',
      surface,
      props: { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    if (surface === 'terminal') expect(await pane.find({ type: 'Text', text: 'Opus 5.5' })).toBeTruthy()
    for (const leaf of ['Start dev server', 'Pane tabs', 'Explore code', 'Turns', 'All tests pass']) expect(await pane.find({ type: 'Text', text: new RegExp(leaf) })).toBeTruthy()
    await pane.unmount()
  }

  // Each tab draws, and draws what it holds.
  const props = { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
  const pane = await $.ui.mount({ plugin: 'cockpit', component: 'Pane', requestId: 'cockpit', surface: 'desktop', props })
  for (const [tab, want] of [['agents', /Explore code/], ['files', /pane.tsx/], ['session', /Diese Session/]] as const) {
    await pane.press({ key: `tab-${tab}` })
    expect(await pane.find({ type: 'Text', text: want })).toBeTruthy()
  }
  // The 🕘 folds a small card open; its 'show all' opens the whole history.
  await pane.press({ key: 'open-history' })
  expect(await pane.find({ type: 'Button', key: 'history-all' })).toBeTruthy()
  await pane.press({ key: 'history-all' })
  const history = await $.ui.mount({ plugin: 'cockpit', component: 'Pane', requestId: 'cockpit-history', surface: 'desktop', props })
  expect(await history.find({ type: 'Text', text: /^hi$/ })).toBeTruthy()
  await history.unmount()
  // An agent's card folds its details open.
  await pane.press({ key: 'tab-agents' })
  await pane.press({ key: 'agent-a1' })
  expect(await pane.find({ type: 'Text', text: 'Gestartet' })).toBeTruthy()
  await pane.unmount()

  const reply = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AssistantMessage',
    surface: 'desktop',
    props: { text: 'All done.', isFirstOfReply: false },
  })
  expect((await reply.find({ type: 'Text', text: /⏱/ }))?.text).toBe('⏱ 14s · 0 Tools · +0 Context · Cache 90%')
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

test('English, with a tab and a pill switched off', { options: { language: 'en', tabFiles: false, pillCache: false } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: USAGE }))
  on('settings.read', () => ({ value: { model: 'opus' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: null }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'Done.', durationMs: 2_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const props = { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
  const pane = await $.ui.mount({ plugin: 'cockpit', component: 'Pane', requestId: 'cockpit', surface: 'desktop', props })
  expect(await pane.find({ type: 'Text', text: 'This session' })).toBeTruthy()
  expect(await pane.find({ type: 'Button', key: 'open-history' })).toBeTruthy()
  expect(await pane.find({ type: 'Button', key: 'tab-files' })).toBeFalsy()
  await pane.unmount()

  const band = await $.ui.mount({
    plugin: 'cockpit',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).not.toContain('Cache')
  expect(alts.some(a => a.startsWith('5h limit'))).toBe(true)
  await band.unmount()
})
