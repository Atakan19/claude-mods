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

export function registerRoute(on: On, agentModel: string) {
  on('agent.spawn', async ($, e, next) => next({ ...e, model: pick(e.subagentType, e.model, agentModel) }))
}
