import { expect, test } from 'claude-code/testing'
import { pick } from '../hooks/route'

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
