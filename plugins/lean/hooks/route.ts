import type { On } from 'claude-code'

// Searching and reading need no Opus. Built-in agents without a model of their own inherit the
// parent's, so a session on Opus runs every search on Opus. Agents that name a model (scout,
// builder) keep it; an explicit `model` on the Agent call always wins; forks always inherit.

// Built-ins that carry no model of their own; Plan stays on the parent's, it designs.
export const ROUTED = new Set(['general-purpose', 'Explore'])

export function pick(subagentType: string, model: string | undefined, agentModel: string): string | undefined {
  if (model !== undefined || agentModel === 'inherit' || !ROUTED.has(subagentType)) return model
  return agentModel
}

export function agentModelOption(options: Record<string, unknown>): string {
  return typeof options.agentModel === 'string' && options.agentModel !== '' ? options.agentModel : 'sonnet'
}

// A side session without a model inherits the parent's. Only a brief that starts fresh here can
// take one: a fork, a cloud run or a preset brings its own, and a title alone is only a question.
export function pickSession(input: Record<string, unknown>, sessionModel: string): string | undefined {
  if (sessionModel === 'inherit' || input.model !== undefined || !input.prompt) return undefined
  if (input.context === 'fork' || input.target === 'cloud' || input.preset !== undefined) return undefined
  return sessionModel
}

export function sessionModelOption(options: Record<string, unknown>): string {
  return typeof options.sideSessionModel === 'string' && options.sideSessionModel !== '' ? options.sideSessionModel : 'claude-sonnet-5-5'
}

export function registerRoute(on: On, agentModel: string, sessionModel: string) {
  on('agent.spawn', async ($, e, next) => next({ ...e, model: pick(e.subagentType, e.model, agentModel) }))
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async ($, e, next) => {
    const model = pickSession(e, sessionModel)
    return next(model ? { ...e, model } : e)
  })
}
