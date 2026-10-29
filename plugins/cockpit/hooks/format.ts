import type { Color } from 'claude-code'

import type { Limit, Live } from '../types'

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600e3, seven_day: 7 * 86400e3 }
const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

export const limitLabel = (l: Limit) => LABEL[l.kind] ?? l.kind

export const k = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`

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

// Calm by default: color only when something needs attention.
export const fillTone = (pct: number): Color | undefined =>
  pct >= 90 ? 'error' : pct >= 75 ? 'warning' : undefined

// A limit is "ahead" when its share used outruns the share of its window elapsed.
export const limitTone = (l: Limit, now: number): Color | undefined => {
  if (l.percentUsed >= 90) return 'error'
  const windowMs = WINDOW_MS[l.kind]
  if (!windowMs || !l.resetsAt) return fillTone(l.percentUsed)
  const elapsed = 100 * (1 - (Date.parse(l.resetsAt) - now) / windowMs)
  const ahead = l.percentUsed - elapsed
  return ahead > 15 ? 'error' : ahead > 0 ? 'warning' : undefined
}

// shortcut: TTL guessed from the plan (rate limits only come with a subscription = 1 h,
// else 5 min); read it from the engine once mods can see the real cache lifetime.
export const cacheTtlMs = (l: Live) => (l.limits.length > 0 ? 60 : 5) * 60e3

// Time left on the prompt cache, or null before the first reply.
export const cacheLeft = (l: Live, now: number) =>
  l.lastRequestAt ? l.lastRequestAt + cacheTtlMs(l) - now : null

export const cacheTone = (left: number): Color | undefined =>
  left <= 0 ? 'error' : left < 10 * 60e3 ? 'warning' : undefined
