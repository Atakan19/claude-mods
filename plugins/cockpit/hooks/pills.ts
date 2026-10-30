// The pill row, drawn as augiefra's token-weather-usage draws its band on the desktop: icons,
// tints, gauge, weather and turn bars follow https://github.com/augiefra/claude-mods
// (Apache-2.0, see NOTICE and LICENSE-APACHE-2.0), ported to TypeScript and cut to the
// context, 5h, cache and agents pills.

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE

const SPANS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 7 * 24 * HOUR }
const PACE_ALERT = 15
const USED_ALERT = 90
export const CACHE_SOON = 10 * MINUTE
export const GOOD_HIT = 90

export const FORECAST = [
  { upTo: 25, id: 'clear', icon: '☀', color: 'yellow', word: 'Klar' },
  { upTo: 50, id: 'cloudy', icon: '☁', color: 'cyan', word: 'Bewölkt' },
  { upTo: 75, id: 'showers', icon: '☂', color: 'blue', word: 'Schauer' },
  { upTo: 90, id: 'storm', icon: '☇', color: 'magenta', word: 'Gewitter' },
  { upTo: Infinity, id: 'compact', icon: '↯', color: 'red', word: 'Bald kompaktieren' },
] as const
export type Forecast = (typeof FORECAST)[number]
export const forecastFor = (percent: number): Forecast => FORECAST.find(b => percent < b.upTo) ?? FORECAST[FORECAST.length - 1]!

const SPARK = { height: 14, bar: 5.5, gap: 2 }
export const SPARK_HEIGHT = SPARK.height
const PAST_BAR = 'rgba(127,127,127,0.45)'
const SPARK_COLORS: Record<string, string> = { yellow: '#e0b000', cyan: '#1ba1c4', blue: '#2f68c0', magenta: '#b04fc0', red: '#d64545' }

export const WEATHER_ICON_SIZE = 15
const WEATHER_ICONS: Record<string, (c: string) => string> = {
  clear: c =>
    `<circle cx="12" cy="12" r="4.5" fill="${c}"/><path fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  cloudy: c =>
    `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M7 18.5a3.75 3.75 0 0 1-.4-7.48A5.6 5.6 0 0 1 17.2 9.6a4.45 4.45 0 0 1 .3 8.9z"/>`,
  showers: c =>
    `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M7 14.5a3.25 3.25 0 0 1-.35-6.48A5 5 0 0 1 16.2 6.8a3.85 3.85 0 0 1 .3 7.7z"/><path fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>`,
  storm: c => `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M13.5 2 5 13.5h6.5L10.5 22 19 10.5h-6.5z"/>`,
  compact: c =>
    `<path fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="M14 2 7 12h8l-5 9M14.5 18.8 10 21l-.5-5"/>`,
}
const WEATHER_ICON_COLORS: Record<string, string> = { clear: '#e0b000', cloudy: '#8ea3b8', showers: '#2f68c0', storm: '#b04fc0', compact: '#d64545' }
export const weatherSvg = (id: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WEATHER_ICON_SIZE}" height="${WEATHER_ICON_SIZE}" viewBox="0 0 24 24">${WEATHER_ICONS[id]?.(WEATHER_ICON_COLORS[id] ?? '#8ea3b8') ?? ''}</svg>`

export const SEP = '│'
export const GAUGE = { width: 68, height: 9 }
export type Tone = 'calm' | 'fast' | 'alert'
export const TONES: Record<Tone, { svg: string; text: string }> = {
  calm: { svg: '#3fa66b', text: 'green' },
  fast: { svg: '#d9962b', text: '#a8690a' },
  alert: { svg: '#d64545', text: 'red' },
}
const TRACK = 'rgba(127,127,127,0.2)'
const HATCH = { back: 'rgba(127,127,127,0.16)', line: 'rgba(127,127,127,0.6)' }
export const TINTS: Record<string, [string, string]> = {
  context: ['rgba(47,104,192,0.10)', 'rgba(47,104,192,0.28)'],
  five_hour: ['rgba(63,166,107,0.13)', 'rgba(63,166,107,0.32)'],
  calm: ['rgba(27,161,196,0.11)', 'rgba(27,161,196,0.30)'],
  fast: ['rgba(217,150,43,0.14)', 'rgba(217,150,43,0.36)'],
  alert: ['rgba(214,69,69,0.12)', 'rgba(214,69,69,0.36)'],
  none: ['rgba(27,161,196,0.11)', 'rgba(27,161,196,0.30)'],
  agents: ['rgba(196,80,127,0.11)', 'rgba(196,80,127,0.32)'],
}
export const ICON_SIZE = 16
export const SMALL_ICON = 14
const ICONS: Record<string, (c: string) => string> = {
  gauge: c =>
    `<g transform="translate(0 0.5)"><path d="M3.6 18.5a9.5 9.5 0 1 1 16.8 0" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M12 14.5l4.3-4.6" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="14.5" r="1.7" fill="${c}"/></g>`,
  clock: c =>
    `<path d="M4.2 13A8 8 0 1 0 6.6 6.2" fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round"/><path d="M3.4 3.6v4.2h4.2" fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4.6l3 1.8" fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round"/>`,
  bolt: c => `<path d="M13.2 2 4 13.6h7.2L10.4 22l9.2-11.6h-7.2z" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`,
  agents: c =>
    `<rect x="4" y="7.5" width="16" height="12.5" rx="3.5" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="2"/><path d="M12 7.5V4M2 12.5v3M22 12.5v3" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="3.2" r="1.3" fill="${c}"/><circle cx="9" cy="13" r="1.5" fill="${c}"/><circle cx="15" cy="13" r="1.5" fill="${c}"/><path d="M9.5 16.8h5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
}
export const ICON_COLORS: Record<string, string> = { five_hour: '#3a9a62', calm: '#1b9cbe', none: '#1b9cbe', fast: '#d9962b', alert: '#d64545', agents: '#c4507f' }
export const iconSvg = (name: string, color: string, size = ICON_SIZE) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[name]?.(color) ?? ''}</svg>`

const bound = (percent: number) => Math.max(0, Math.min(100, percent))

// 3h02, 42 min, 2d23h.
export function duration(ms: number) {
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return `${minutes} min`
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d${String(hours).padStart(2, '0')}h`
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

export function clockTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 1M, 1.2M, 107k, 98.3k, 950: one decimal only when it matters.
export function short(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 100_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}

export type Gauge = { kind: string; label: string; used: number; elapsed: number | null; tone: Tone; value: string; when: string; resetAt: string }

export function gaugeOf(limit: { kind: string; percentUsed: number; resetsAt?: string }, now: number): Gauge {
  const used = Math.max(0, limit.percentUsed)
  const resetMs = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  const span = SPANS[limit.kind]
  const left = Number.isFinite(resetMs) ? Math.max(0, resetMs - now) : null
  const elapsed = span && left !== null ? bound(((span - left) / span) * 100) : null
  const pace = elapsed === null ? 0 : used - elapsed
  const tone: Tone = used >= USED_ALERT || pace > PACE_ALERT ? 'alert' : pace > 0 ? 'fast' : 'calm'
  const when = left !== null ? duration(left) : ''
  const resetAt = left !== null ? clockTime(resetMs) : ''
  return { kind: limit.kind, label: '5h', used, elapsed, tone, value: `${Math.round(used)}%`, when, resetAt }
}

// Solid bar up to the share used; the gap with elapsed time is hatched, grey after the bar
// (margin left) or in the bar's color (ahead of time).
export function svgGauge(g: Gauge) {
  const { width, height } = GAUGE
  const radius = height / 2
  const used = (bound(g.used) / 100) * width
  const time = g.elapsed === null ? used : (g.elapsed / 100) * width
  const color = TONES[g.tone].svg
  const id = 'tw' + g.label.replace(/[^a-z0-9]/gi, '')
  const stripes = (name: string, back: string, backOpacity: number, line: string) =>
    `<pattern id="${name}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="4" height="4" fill="${back}" fill-opacity="${backOpacity}"/><rect width="1.6" height="4" fill="${line}"/></pattern>`
  const defs =
    `<defs>${stripes(id + 'm', HATCH.back, 1, HATCH.line)}${stripes(id + 'a', color, 0.35, color)}` +
    `<clipPath id="${id}t"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>` +
    `<clipPath id="${id}b"><rect width="${used.toFixed(1)}" height="${height}" rx="${radius}"/></clipPath></defs>`
  let body = `<rect width="${width}" height="${height}" fill="${TRACK}"/>`
  if (time > used) body += `<rect width="${time.toFixed(1)}" height="${height}" fill="url(#${id}m)"/>`
  body += `<g clip-path="url(#${id}b)"><rect width="${Math.min(used, time).toFixed(1)}" height="${height}" fill="${color}"/>`
  if (used > time) body += `<rect x="${time.toFixed(1)}" width="${(used - time).toFixed(1)}" height="${height}" fill="url(#${id}a)"/>`
  body += `</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}<g clip-path="url(#${id}t)">${body}</g></svg>`
}

// Character bar for the terminal: solid up to the share used, the gap with elapsed time dashed.
export function textGauge(g: Gauge, cells = 6) {
  const used = Math.round((g.used / 100) * cells)
  const time = g.elapsed === null ? used : Math.round((g.elapsed / 100) * cells)
  return Array.from({ length: cells }, (_, i) => (i < Math.min(used, time) ? '━' : i < Math.max(used, time) ? '╍' : '─')).join('')
}

// Turn bars: tokens each recent prompt added, relative to the heaviest; the newest in color.
export const barsWidth = (n: number) => Math.max(1, n) * SPARK.bar + Math.max(0, n - 1) * SPARK.gap
export function barsSvg(deltas: number[], color: string) {
  const { height, bar, gap } = SPARK
  const top = Math.max(...deltas, 1)
  const width = barsWidth(deltas.length)
  const rects = deltas.map((d, i) => {
    const h = Math.max(1, (d / top) * height)
    const fill = i === deltas.length - 1 ? (SPARK_COLORS[color] ?? SPARK_COLORS.blue) : PAST_BAR
    return `<rect x="${(i * (bar + gap)).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${bar}" height="${h.toFixed(1)}" rx="1.5" fill="${fill}"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join('')}</svg>`
}
const BARS = '▁▂▃▄▅▆▇█'
export function barsText(deltas: number[]) {
  const top = Math.max(...deltas, 1)
  return deltas.map(d => BARS[Math.round((d / top) * (BARS.length - 1))] ?? '▁').join('')
}

export function trendWord(delta: number | undefined) {
  if (delta === undefined) return ''
  if (delta > 0) return `▲ +${short(delta)}`
  if (delta < 0) return `▼ −${short(-delta)}`
  return '='
}
