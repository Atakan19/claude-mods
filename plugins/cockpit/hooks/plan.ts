import type { EngineInterface, On } from 'claude-code'

import type { Plan, Step, StepStatus } from '../types'
import { getPlan, setPlan } from './state'

// Where the plan stands: the step under way (or the next open one), and whether all are done.
export function planState(p: Plan) {
  const done = p.steps.length > 0 && p.steps.every(s => s.status === 'completed')
  let current = p.steps.findIndex(s => s.status === 'in_progress')
  if (current < 0) current = p.steps.findIndex(s => s.status !== 'completed')
  const finished = p.steps.filter(s => s.status === 'completed').length
  return { done, current, finished }
}

// Share of the plan done: finished steps, plus half of the one under way.
export function planShare(p: Plan) {
  const { done, finished } = planState(p)
  if (done || p.steps.length === 0) return done ? 100 : 0
  const half = p.steps.some(s => s.status === 'in_progress') ? 0.5 : 0
  return ((finished + half) / p.steps.length) * 100
}

const isStatus = (s: unknown): s is StepStatus => s === 'pending' || s === 'in_progress' || s === 'completed'

// Keeps a step's start and end times as its status moves.
function stamp(old: Step | undefined, status: StepStatus, now: number): Pick<Step, 'startedAt' | 'endedAt'> {
  const startedAt = old?.startedAt ?? (status !== 'pending' ? now : undefined)
  const endedAt = status === 'completed' ? (old?.endedAt ?? now) : undefined
  return { ...(startedAt !== undefined ? { startedAt } : {}), ...(endedAt !== undefined ? { endedAt } : {}) }
}

// TodoWrite hands the whole list each time.
export function fromTodos(prev: Plan | null, todos: unknown, now: number): Plan | null {
  if (!Array.isArray(todos)) return prev
  const steps: Step[] = []
  for (const t of todos) {
    if (!t || typeof t !== 'object') continue
    const { content, status } = t as { content?: unknown; status?: unknown }
    if (typeof content !== 'string' || !isStatus(status)) continue
    const old = prev?.steps.find(s => s.title === content)
    steps.push({ id: content, title: content.slice(0, 60), status, ...stamp(old, status, now) })
  }
  if (steps.length === 0) return null
  return { title: prev?.title ?? 'Aufgaben', steps, startedAt: prev?.startedAt ?? now }
}

// TaskCreate adds one step; a finished plan makes way for a new one.
export function addTask(prev: Plan | null, id: string, subject: string, now: number): Plan {
  const base = prev && !planState(prev).done ? prev : { title: 'Aufgaben', steps: [], startedAt: now }
  return { ...base, steps: [...base.steps, { id, title: subject.slice(0, 60), status: 'pending' }] }
}

export function updateTask(prev: Plan | null, id: string, patch: { status?: unknown; subject?: unknown }, now: number): Plan | null {
  if (!prev) return prev
  if (patch.status === 'deleted') {
    const steps = prev.steps.filter(s => s.id !== id)
    return steps.length > 0 ? { ...prev, steps } : null
  }
  return {
    ...prev,
    steps: prev.steps.map(s => {
      if (s.id !== id) return s
      const status = isStatus(patch.status) ? patch.status : s.status
      const title = typeof patch.subject === 'string' && patch.subject !== '' ? patch.subject.slice(0, 60) : s.title
      return { id: s.id, title, status, ...stamp(s, status, now) }
    }),
  }
}

// The desktop app's own list (mcp__ccd_turn__update_plan): a whole list, or moves on it by 1-based step.
export function fromAppPlan(prev: Plan | null, args: Record<string, unknown>, now: number): Plan | null {
  let p = Array.isArray(args.items) ? fromTodos(prev, args.items, now) : prev
  if (!p) return p
  const set = (i: number, status: StepStatus) => {
    const s = p!.steps[i]
    if (s) p = { ...p!, steps: p!.steps.map((x, j) => (j === i ? { ...s, status, ...stamp(s, status, now) } : x)) }
  }
  if (args.advance === true) {
    const i = p.steps.findIndex(s => s.status === 'in_progress')
    if (i >= 0) set(i, 'completed')
    set(p.steps.findIndex(s => s.status === 'pending'), 'in_progress')
  }
  if (Array.isArray(args.done)) for (const n of args.done) if (typeof n === 'number') set(n - 1, 'completed')
  if (typeof args.start === 'number') set(args.start - 1, 'in_progress')
  return p
}

// wrap_up checks the app's list off.
export function finishPlan(prev: Plan | null, now: number): Plan | null {
  return prev && { ...prev, steps: prev.steps.map(s => ({ ...s, status: 'completed' as const, ...stamp(s, 'completed', now) })) }
}

// A finished plan stays on screen until the person sends the next prompt.
export async function clearDonePlan($: EngineInterface) {
  const p = await getPlan($)
  if (p && planState(p).done) await setPlan($, () => null)
}

// Reads Claude's own task tools after they ran: nothing is added to the model's tools or prompt.
// The tool's result is returned whatever happens here: a drawing must never cost a task call.
export function registerPlan(on: On) {
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await setPlan($, prev => fromTodos(prev, e.todos, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError && r.result?.task) {
        const { id, subject } = r.result.task
        const now = await $.clock.now()
        await setPlan($, prev => addTask(prev, id, subject, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await setPlan($, prev => updateTask(prev, e.taskId, { status: e.status, subject: e.subject }, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await setPlan($, prev => fromAppPlan(prev, e, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await setPlan($, prev => finishPlan(prev, now))
      }
    } catch {}
    return r
  })
}
