import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Live, Running, Turn } from '../types'

export const PANE = 'cockpit'

// The scan only follows atoms used in the file that declares them, so every
// part reads and writes the cockpit's state through these functions.
const live = atom({ plugin: 'cockpit', key: 'live' } as const, null)
const turns = atom({ plugin: 'cockpit', key: 'turns' } as const, [])
const running = atom({ plugin: 'cockpit', key: 'running' } as const, { tools: 0, agents: 0 })
// Bumped every 30 s so countdowns redraw without a turn.
const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, 0)

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
}
export async function setRunning($: EngineInterface, patch: Partial<Running>) {
  await update($, running, r => ({ ...r, ...patch }))
}
export async function bumpTick($: EngineInterface) {
  await update($, tick, n => n + 1)
}
