import type { EngineInterface, On } from 'claude-code'

import type { Plan, Step, StepStatus, ToolPlan } from '../types'
import { FOLD_MS } from './progress'
import { bumpTick, getPlan, setBars, setPlan } from './state'

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

// When the last step of a plan ended.
export const lastEnd = (p: Plan) => Math.max(p.startedAt, ...p.steps.map(s => s.endedAt ?? 0))

// The progress tool's call: steps (re)make the plan, keeping finished steps by label; next and done move it.
// A finished plan sent again starts over. A string is the refusal the model reads.
export function fromTool(prev: ToolPlan | null, args: Record<string, unknown>, now: number): ToolPlan | string {
  const id = typeof args.id === 'string' ? args.id.trim().slice(0, 40) : ''
  if (!id) return 'progress: id is required, like "release".'
  const base = prev && !planState(prev).done ? prev : null
  let p: Plan | null = base
  if (Array.isArray(args.steps)) {
    const labels = args.steps.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().slice(0, 24))
    const items = labels.map(content => ({ content, status: base?.steps.find(s => s.title === content)?.status ?? ('pending' as StepStatus) }))
    const first = items.find(i => i.status === 'pending')
    if (first && !items.some(i => i.status === 'in_progress')) first.status = 'in_progress'
    p = fromTodos(base, items, now)
  }
  if (!p) return `progress: no bar "${id}" yet; create it with title and steps.`
  if (args.next === true) p = fromAppPlan(p, { advance: true }, now) ?? p
  if (args.done === true) p = finishPlan(p, now) ?? p
  const title = typeof args.title === 'string' && args.title.trim() !== '' ? args.title.trim().slice(0, 40) : (base?.title ?? id)
  return { ...p, id, title }
}

const TOOL = 'progress'
// What the model reads: when to use it and how to name the stages, since the labels are all the bar shows.
const TOOL_DESCRIPTION = `Live progress bar above the prompt, one per id. Use it for work with 3 or more distinct stages (for example build, deploy, verify), alongside your task list.
Create: {id, title, steps}. steps are the stage labels the bar shows: 1-2 words, at most 12 characters, in the user's language, the key word first ("Build", "Deploy", "Tests"), never a sentence. title: at most 4 words. The first step starts active.
Move: {id, next: true} when the active step is finished; {id, done: true} when all is finished. Resend steps under the same id when the plan changes; finished steps keep their state by label.
Never describe the bar to the user.`

// Option planTool, called from the one session.start hook in data.ts. Off by default, as the
// tool's description rides every request.
export async function startPlanTool($: EngineInterface) {
  await $.tool.register({
    name: TOOL,
    description: TOOL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Bar id, reused for updates' },
        title: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Stage labels, 1-2 words each' },
        next: { type: 'boolean', description: 'Active stage finished, start the next one' },
        done: { type: 'boolean', description: 'All stages finished' },
      },
    },
  })
}

// Serves the progress tool once startPlanTool registered it.
export function registerPlanTool(on: On) {
  on('tool.call', { tool: `mcp__cockpit__${TOOL}` }, async ($, e) => {
    const args = e as unknown as Record<string, unknown>
    const now = await $.clock.now()
    const res: { out: ToolPlan | string } = { out: '' }
    await setBars($, list => {
      const id = typeof args.id === 'string' ? args.id.trim().slice(0, 40) : ''
      res.out = fromTool(list.find(b => b.id === id) ?? null, args, now)
      if (typeof res.out === 'string') return list
      // Finished bars long folded away make room.
      const kept = list.filter(b => b.id !== id && !(planState(b).done && now - lastEnd(b) > FOLD_MS))
      return [...kept, res.out]
    })
    const p = res.out
    if (typeof p === 'string') return { deny: p }
    const { done, finished } = planState(p)
    // A finished bar folds away a few seconds later: draw once more then.
    if (done) $.clock.after(FOLD_MS + 100, () => void bumpTick($).catch(() => {}))
    const active = p.steps.find(s => s.status === 'in_progress')
    return { result: `${p.id}: ${finished}/${p.steps.length}${done ? ', done' : active ? `, active "${active.title}"` : ''}` }
  })
}

// A finished plan stays on screen until the person sends the next prompt.
export async function clearDonePlan($: EngineInterface) {
  const p = await getPlan($)
  if (p && planState(p).done) await setPlan($, () => null)
}

// The tools that keep the list; calls to them are not counted as work past it.
export const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up'])

// Claude touched the list: the count of calls past it starts over.
async function movePlan($: EngineInterface, fn: (prev: Plan | null) => Plan | null) {
  await setPlan($, prev => {
    const next = fn(prev)
    return next && next !== prev ? { ...next, idle: 0 } : next
  })
}

// A step looks left hanging after many calls without a move on the list, or a few over a long time:
// Claude often works on and ticks everything off only at the end.
const STUCK_CALLS = 15
const STUCK_MS = 10 * 60e3
export function stuckStep(p: Plan | null, now: number): Step | null {
  const step = p?.steps.find(s => s.status === 'in_progress')
  if (!p || !step) return null
  const idle = p.idle ?? 0
  return idle >= STUCK_CALLS || (idle >= 3 && step.startedAt !== undefined && now - step.startedAt >= STUCK_MS) ? step : null
}

// Reads Claude's own task tools after they ran; the tool's result is returned whatever happens here:
// a drawing must never cost a task call. Only while a step hangs does one line reach the model's prompt.
export function registerPlan(on: On) {
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const p = await getPlan($)
    const step = stuckStep(p, await $.clock.now())
    if (!step) return r
    const text = `Your task list still shows "${step.title}" as in progress after ${p?.idle ?? 0} tool calls. If you moved on, update the list now; if not, carry on.`
    return { ...r, sections: [...r.sections, { id: 'cockpit:stuck', text, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await movePlan($, prev => fromTodos(prev, e.todos, now))
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
        await movePlan($, prev => addTask(prev, id, subject, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await movePlan($, prev => updateTask(prev, e.taskId, { status: e.status, subject: e.subject }, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await movePlan($, prev => fromAppPlan(prev, e, now))
      }
    } catch {}
    return r
  })

  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) {
        const now = await $.clock.now()
        await movePlan($, prev => finishPlan(prev, now))
      }
    } catch {}
    return r
  })
}
