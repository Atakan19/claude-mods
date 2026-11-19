import { expect, test } from 'claude-code/testing'
import { pick, pickSession } from '../hooks/route'

const SONNET = 'claude-sonnet-5-5'

test('a fresh side session without a model starts on the routed one', () => {
  expect(pickSession({ prompt: 'fix X', initiation: 'user_asked' }, SONNET)).toBe(SONNET)
  expect(pickSession({ prompt: 'fix X', context: 'fresh' }, SONNET)).toBe(SONNET)
})

test('an explicit model, a fork, cloud, a preset, a title alone or inherit stay as they are', () => {
  expect(pickSession({ prompt: 'x', model: 'claude-opus-5-5' }, SONNET)).toBeUndefined()
  expect(pickSession({ prompt: 'x', context: 'fork' }, SONNET)).toBeUndefined()
  expect(pickSession({ prompt: 'x', target: 'cloud' }, SONNET)).toBeUndefined()
  expect(pickSession({ prompt: 'x', preset: 'mine' }, SONNET)).toBeUndefined()
  expect(pickSession({ title: 'X', initiation: 'offer' }, SONNET)).toBeUndefined()
  expect(pickSession({ proposal_id: 'task_1' }, SONNET)).toBeUndefined()
  expect(pickSession({ prompt: 'x' }, 'inherit')).toBeUndefined()
})

test('search agents without a model run on the routed one', () => {
  expect(pick('Explore', undefined, 'sonnet')).toBe('sonnet')
  expect(pick('general-purpose', undefined, 'haiku')).toBe('haiku')
})

test('an explicit model, an agent of its own, Plan, a fork or inherit stay as they are', () => {
  expect(pick('Explore', 'opus', 'sonnet')).toBe('opus')
  expect(pick('lean:scout', undefined, 'sonnet')).toBeUndefined()
  expect(pick('Plan', undefined, 'sonnet')).toBeUndefined()
  expect(pick('fork', undefined, 'sonnet')).toBeUndefined()
  expect(pick('Explore', undefined, 'inherit')).toBeUndefined()
})

test('the hook sets the model on the spawn', { options: {} }, async ($, on) => {
  const seen: (string | undefined)[] = []
  on('agent.spawn', (_, e) => {
    seen.push(e.model)
    return { agentId: 'a1', model: e.model ?? 'claude-opus-5-5' }
  })
  await $.agent.spawn({ prompt: 'find X', description: 'Find X', subagentType: 'Explore' })
  await $.agent.spawn({ prompt: 'plan', description: 'Plan it', subagentType: 'Plan' })
  expect(seen).toEqual(['sonnet', undefined])
})

test('the hook sets the model on a side session start', { options: {} }, async ($, on) => {
  const seen: unknown[] = []
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, (_, e) => {
    seen.push(e.model)
    return { result: 'started', isError: false, text: 'started' }
  })
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', prompt: 'fix X', title: 'Fix X', initiation: 'user_asked' })
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', prompt: 'fix X', title: 'Fix X', initiation: 'user_asked', context: 'fork' })
  expect(seen).toEqual([SONNET, undefined])
})
