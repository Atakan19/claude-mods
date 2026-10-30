import { expect, mock, test } from 'claude-code/testing'

import { addTask, finishPlan, fromAppPlan, fromTodos, fromTool, planShare, planState, stuckStep, updateTask } from '../hooks/plan'

test('TodoWrite lists become a plan and keep step times', async () => {
  const a = fromTodos(null, [
    { content: 'Read', status: 'completed', activeForm: 'Reading' },
    { content: 'Fix', status: 'in_progress', activeForm: 'Fixing' },
    { content: 'Test', status: 'pending', activeForm: 'Testing' },
    { content: 42, status: 'pending' },
  ], 100)
  expect(a?.steps.map(s => s.title)).toEqual(['Read', 'Fix', 'Test'])
  expect(planState(a!)).toEqual({ done: false, current: 1, finished: 1 })
  expect(planShare(a!)).toBe(50)
  const b = fromTodos(a, [
    { content: 'Read', status: 'completed', activeForm: '' },
    { content: 'Fix', status: 'completed', activeForm: '' },
    { content: 'Test', status: 'completed', activeForm: '' },
  ], 200)
  expect(b?.steps[1]).toEqual({ id: 'Fix', title: 'Fix', status: 'completed', startedAt: 100, endedAt: 200 })
  expect(planState(b!).done).toBe(true)
  expect(fromTodos(b, [], 300)).toBe(null)
})

test('TaskCreate and TaskUpdate build, move and finish a plan', async () => {
  let p = addTask(null, '1', 'Lesen', 0)
  p = addTask(p, '2', 'Planen', 0)
  p = updateTask(p, '1', { status: 'in_progress' }, 10)!
  expect(planState(p).current).toBe(0)
  p = updateTask(p, '1', { status: 'completed' }, 20)!
  p = updateTask(p, '2', { status: 'bogus', subject: 'Folien planen' }, 30)!
  expect(p.steps[1]).toEqual({ id: '2', title: 'Folien planen', status: 'pending' })
  p = updateTask(p, '2', { status: 'completed' }, 40)!
  expect(planState(p).done).toBe(true)
  // A new task after a finished plan starts a new one.
  expect(addTask(p, '3', 'Neu', 50).steps).toHaveLength(1)
  expect(updateTask(addTask(null, '9', 'X', 0), '9', { status: 'deleted' }, 1)).toBe(null)
})

test("the desktop app's update_plan list moves step by step", async () => {
  let p = fromAppPlan(null, { items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }, { content: 'C', status: 'pending' }] }, 0)
  p = fromAppPlan(p, { advance: true }, 10)
  expect(p?.steps.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending'])
  p = fromAppPlan(p, { done: [2], start: 3 }, 20)
  expect(p?.steps.map(s => s.status)).toEqual(['completed', 'completed', 'in_progress'])
  expect(planState(finishPlan(p, 30)!).done).toBe(true)
  expect(fromAppPlan(null, { advance: true }, 0)).toBe(null)
})

test('the band shows the task list a TaskCreate call made', { options: { language: 'de' } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('settings.read', () => ({ value: { model: 'opus' } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: 0 } },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'Folien planen' } } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Folien planen', description: 'x' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({
      plugin: 'cockpit',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /Aufgaben/ })).toBeTruthy()
    await band.unmount()
  }

  const pane = await $.ui.mount({
    plugin: 'cockpit',
    component: 'Pane',
    requestId: 'cockpit',
    surface: 'desktop',
    props: { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: 'Diese Session' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Folien planen/ })).toBeTruthy()
  await pane.unmount()
})

test('the progress tool makes, moves and restarts a plan by id', async () => {
  expect(fromTool(null, {}, 0)).toBe('progress: id is required, like "release".')
  expect(typeof fromTool(null, { id: 'release', next: true }, 0)).toBe('string')
  let p = fromTool(null, { id: 'release', title: 'Release pipeline', steps: ['Build', 'Deploy', 'Verify'] }, 0)
  if (typeof p === 'string') throw new Error(p)
  expect(p.steps.map(s => s.status)).toEqual(['in_progress', 'pending', 'pending'])
  p = fromTool(p, { id: 'release', next: true }, 10) as Exclude<typeof p, string>
  expect(p.steps.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending'])
  // A changed plan keeps what is done by label.
  p = fromTool(p, { id: 'release', steps: ['Build', 'Deploy', 'Tests', 'Verify'] }, 20) as Exclude<typeof p, string>
  expect(p.steps.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  expect(p.title).toBe('Release pipeline')
  p = fromTool(p, { id: 'release', done: true }, 30) as Exclude<typeof p, string>
  expect(planState(p).done).toBe(true)
  // Sent again after it finished, it starts over.
  const again = fromTool(p, { id: 'release', steps: ['Build', 'Deploy'] }, 40) as Exclude<typeof p, string>
  expect(again.steps.map(s => s.status)).toEqual(['in_progress', 'pending'])
})

test('with planTool on, each progress plan gets a bar of its own', { options: { language: 'de', planTool: true } }, async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('settings.read', () => ({ value: { model: 'opus' } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: 0 } },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__cockpit__progress', id: 'release', title: 'Release pipeline', steps: ['Build', 'Deploy', 'Verify'] })
  expect('result' in r && r.result).toBe('release: 0/3, active "Build"')
  await $.tool.call({ tool: 'mcp__cockpit__progress', id: 'docs', title: 'Doku', steps: ['Lesen', 'Schreiben'] })

  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({
      plugin: 'cockpit',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /Release pipeline/ })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: /Doku/ })).toBeTruthy()
    await band.unmount()
  }
})

test('a step counts as hanging after many calls, or a few over a long time', async () => {
  const p = fromTodos(null, [{ content: 'Build', status: 'in_progress' }, { content: 'Ship', status: 'pending' }], 0)!
  expect(stuckStep({ ...p, idle: 14 }, 1000)).toBe(null)
  expect(stuckStep({ ...p, idle: 15 }, 1000)?.title).toBe('Build')
  expect(stuckStep({ ...p, idle: 3 }, 9 * 60e3)).toBe(null)
  expect(stuckStep({ ...p, idle: 3 }, 10 * 60e3)?.title).toBe('Build')
})

test('a list left standing gets one line in the prompt until Claude moves it', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('command.register', () => ({ value: { command: 'cockpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('settings.read', () => ({ value: { model: 'opus' } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: 0 } },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const todos = [
    { content: 'Build', status: 'in_progress', activeForm: '' },
    { content: 'Ship', status: 'pending', activeForm: '' },
  ]
  await $.tool.call({ tool: 'TodoWrite', todos })
  const input = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] }
  const stuck = async () => (await $.prompt.compose(input)).sections.some(s => s.id === 'cockpit:stuck')
  for (let i = 0; i < 15; i++) await $.tool.call({ tool: 'Read', file_path: '/a' })
  expect(await stuck()).toBe(true)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ ...todos[0], status: 'completed' }, { ...todos[1], status: 'in_progress' }] })
  expect(await stuck()).toBe(false)
})
