import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Activity, AgentRow, Env, Goal, Live, Plan, Running, SessionEvent, Shell, Subchat, Touch, Turn } from '../types'

export const PANE = 'cockpit'
// The history, opened as a dialog from the pane.
export const HISTORY = 'cockpit-history'

// The scan only follows atoms used in the file that declares them, so every
// part reads and writes the cockpit's state through these functions.
const live = atom({ plugin: 'cockpit', key: 'live' } as const, null)
const turns = atom({ plugin: 'cockpit', key: 'turns' } as const, [])
const running = atom({ plugin: 'cockpit', key: 'running' } as const, { tools: 0, agents: 0 })
// Tagged: rows stored before agents had a state read as none.
const crew = atom({ plugin: 'cockpit', key: 'crew' } as const, [], { shape: 'crew-2' })
// Tagged: a plan stored by the earlier plan tool has another shape and reads as none.
const plan = atom({ plugin: 'cockpit', key: 'plan' } as const, null, { shape: 'plan-2' })
// Bumped every 30 s so countdowns redraw without a turn.
const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, 0)
// Tagged: an env stored before the repo card lacks its fields and reads as none.
const env = atom({ plugin: 'cockpit', key: 'env' } as const, null, { shape: 'env-5' })
const tally = atom({ plugin: 'cockpit', key: 'tally' } as const, { turns: 0, tools: 0, since: null })
// The pane groups the user folded shut.
const folded = atom({ plugin: 'cockpit', key: 'folded' } as const, [])
// The pane's open tab.
const tab = atom({ plugin: 'cockpit', key: 'tab' } as const, 'session')
const shells = atom({ plugin: 'cockpit', key: 'shells' } as const, [])
const subchats = atom({ plugin: 'cockpit', key: 'subchats' } as const, [])
// Every agent of the session for the Agents tab; the band's crew forgets finished batches.
const roster = atom({ plugin: 'cockpit', key: 'roster' } as const, [])
const touches = atom({ plugin: 'cockpit', key: 'touches' } as const, [])
const activity = atom({ plugin: 'cockpit', key: 'activity' } as const, [])
const events = atom({ plugin: 'cockpit', key: 'events' } as const, [])
const goals = atom({ plugin: 'cockpit', key: 'goals' } as const, [])
// Whether the repo card's details are folded open.
const repoOpen = atom({ plugin: 'cockpit', key: 'repoOpen' } as const, false)

export async function getRoster($: EngineInterface) {
  return read($, roster)
}
export async function getTouches($: EngineInterface) {
  return read($, touches)
}
// One row per path and kind, counted; the newest 100.
export async function addTouch($: EngineInterface, path: string, kind: Touch['kind'], at: number) {
  await update($, touches, list => {
    const old = list.find(t => t.path === path && t.kind === kind)
    const rest = list.filter(t => t !== old)
    return [...rest, { path, kind, count: (old?.count ?? 0) + 1, at }].slice(-100)
  })
}
export async function getActivity($: EngineInterface) {
  return read($, activity)
}
export async function addActivity($: EngineInterface, row: Activity) {
  await update($, activity, list => [...list, row].slice(-80))
}
export async function getEvents($: EngineInterface) {
  return read($, events)
}
export async function addEvent($: EngineInterface, event: SessionEvent) {
  await update($, events, list => [...list, event].slice(-20))
}
export async function getGoals($: EngineInterface) {
  return read($, goals)
}
export async function addGoal($: EngineInterface, goal: Goal) {
  await update($, goals, list => [...list, goal].slice(-10))
}
export async function endGoals($: EngineInterface, now: number) {
  await update($, goals, list => list.map(g => (g.endedAt === null ? { ...g, endedAt: now } : g)))
}
export async function getRepoOpen($: EngineInterface) {
  return read($, repoOpen)
}
export async function toggleRepoOpen($: EngineInterface) {
  await update($, repoOpen, open => !open)
}

export async function getEnv($: EngineInterface) {
  return read($, env)
}
export async function setEnv($: EngineInterface, value: Env) {
  await update($, env, () => value)
}
export async function getTally($: EngineInterface) {
  return read($, tally)
}
export async function getFolded($: EngineInterface) {
  return read($, folded)
}
export async function toggleFold($: EngineInterface, key: string) {
  await update($, folded, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
}
export async function getTab($: EngineInterface) {
  return read($, tab)
}
export async function setTab($: EngineInterface, key: string) {
  await update($, tab, () => key)
}
export async function getShells($: EngineInterface) {
  return read($, shells)
}
export async function addShell($: EngineInterface, shell: Shell) {
  await update($, shells, list => [...list.filter(s => s.id !== shell.id), shell].slice(-10))
}
// The engine lists what still runs; every other shell has ended by now.
export async function endShells($: EngineInterface, running: string[], now: number) {
  await update($, shells, list => list.map(s => (s.endedAt === null && !running.includes(s.id) ? { ...s, endedAt: now } : s)))
}
export async function getSubchats($: EngineInterface) {
  return read($, subchats)
}
export async function addSubchat($: EngineInterface, chat: Subchat) {
  await update($, subchats, list => [...list, chat].slice(-5))
}

export async function getLive($: EngineInterface) {
  return read($, live)
}
export async function getTurns($: EngineInterface) {
  return read($, turns)
}
export async function getRunning($: EngineInterface) {
  return read($, running)
}
// Read while drawing so the drawing redraws on each tick.
export async function getTick($: EngineInterface) {
  return read($, tick)
}

export async function setLive($: EngineInterface, fn: (prev: Live | null) => Live) {
  await update($, live, fn)
}
export async function addTurn($: EngineInterface, turn: Turn) {
  await update($, turns, list => [...list, turn].slice(-50))
  await update($, tally, t => ({ turns: t.turns + 1, tools: t.tools + turn.tools, since: t.since ?? turn.at - turn.seconds * 1000 }))
}
export async function setRunning($: EngineInterface, patch: Partial<Running>) {
  await update($, running, r => ({ ...r, ...patch }))
}
// Counted inside the update: agents spawned side by side would each read the same total.
export async function countAgent($: EngineInterface) {
  await update($, running, r => ({ ...r, agents: r.agents + 1 }))
}
export async function getCrew($: EngineInterface) {
  return read($, crew)
}
// Adds the agent, or patches it in place; its start time stays the first one.
export async function upsertCrew($: EngineInterface, row: Partial<AgentRow> & { id: string }) {
  const merge = (list: AgentRow[]) => {
    const old = list.find(a => a.id === row.id)
    if (!old) return [...list, { description: 'Agent', type: '', state: 'running' as const, tool: '', startedAt: 0, endedAt: null, ...row }]
    return list.map(a => (a.id === row.id ? { ...a, ...row, startedAt: a.startedAt } : a))
  }
  await update($, crew, merge)
  await update($, roster, list => merge(list).slice(-30))
}
// Drops the finished rows that ended before the given time.
export async function dropDoneCrew($: EngineInterface, before: number) {
  await update($, crew, list => list.filter(a => a.endedAt === null || a.endedAt >= before))
}
export async function getPlan($: EngineInterface) {
  return read($, plan)
}
export async function setPlan($: EngineInterface, fn: (prev: Plan | null) => Plan | null) {
  await update($, plan, fn)
}
export async function bumpTick($: EngineInterface) {
  await update($, tick, n => n + 1)
}
