import type { Color } from 'claude-code'

import type { Limit, Live } from '../types'
import type { Tone } from './look'

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600e3, seven_day: 7 * 86400e3 }

// 1M, 1.2M, 107k, 98.3k, 950: one decimal only when it matters.
export const k = (n: number) => {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e5) return `${Math.round(n / 1e3)}k`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`
  return `${Math.round(n)}`
}

export const usd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

export const bar = (pct: number, width: number) => {
  const full = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '━'.repeat(full) + '─'.repeat(width - full)
}

export const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60e3))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

export const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// claude-opus-5-5 -> Opus 5.5; a settings alias ("opus") -> Opus
export const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  if (!m || !m[1]) return id ? `${id[0]!.toUpperCase()}${id.slice(1)}` : '–'
  return `${m[1][0]!.toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length < 3 ? `.${m[3]}` : ''}`
}

// Share of the limit's window already elapsed, or null when unknown.
export const elapsedOf = (l: Limit, now: number) => {
  const windowMs = WINDOW_MS[l.kind]
  if (!windowMs || !l.resetsAt) return null
  return 100 * (1 - (Date.parse(l.resetsAt) - now) / windowMs)
}

// Calm while usage runs at most 5 points ahead of time, fast beyond, alert when 15 ahead or past 90%.
export const paceOf = (l: Limit, now: number): Tone => {
  if (l.percentUsed >= 90) return 'alert'
  const elapsed = elapsedOf(l, now)
  if (elapsed === null) return l.percentUsed >= 75 ? 'fast' : 'calm'
  const ahead = l.percentUsed - elapsed
  return ahead > 15 ? 'alert' : ahead > 5 ? 'fast' : 'calm'
}

// Terminal colors: none while calm.
export const toneColor = (t: Tone): Color | undefined =>
  t === 'alert' ? 'error' : t === 'fast' ? 'warning' : undefined


// shortcut: TTL guessed from the plan (rate limits only come with a subscription = 1 h,
// else 5 min); read it from the engine once mods can see the real cache lifetime.
export const cacheTtlMs = (l: Live) => (l.limits.length > 0 ? 60 : 5) * 60e3

// Time left on the prompt cache, or null before the first reply.
export const cacheLeft = (l: Live, now: number) =>
  l.lastRequestAt ? l.lastRequestAt + cacheTtlMs(l) - now : null

