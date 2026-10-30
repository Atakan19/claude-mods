// The pane's look (see NOTICE):
// - muted colors and round caps, after session-band (JohnnyVizz/claude-kit, MIT)
// - weather icons, adapted from token-weather-usage (augiefra, Apache-2.0)
// - the band's tints, so the pane and the band read as one

export type Tone = 'calm' | 'fast' | 'alert'

export const C = {
  context: '#2f68c0',
  five_hour: '#3fa66b',
  seven_day: '#7d6fe0',
  shell: '#1ba1c4',
  agent: '#c4507f',
  chat: '#8b6fe0',
  ok: '#3fa66b',
  warn: '#d9962b',
  alert: '#d64545',
  track: 'rgba(127,127,127,0.25)',
  twig: 'rgba(127,127,127,0.45)',
  line: 'rgba(127,127,127,0.22)',
  card: 'rgba(127,127,127,0.10)',
} as const

// A calm value keeps its own color; a warning takes amber, an alert red.
export const toned = (tone: Tone, calm: string) => (tone === 'alert' ? C.alert : tone === 'fast' ? C.warn : calm)

const svg = (w: number, h: number, body: string, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${body}</svg>`

export const DIAL = { w: 84, h: 46 }
// A half circle filled to the percent, round at both ends.
export function dialSvg(percent: number, color: string) {
  const arc = 'M8 42a34 34 0 0 1 68 0'
  const p = Math.max(0, Math.min(100, percent))
  return svg(
    DIAL.w,
    DIAL.h,
    `<path d="${arc}" fill="none" stroke="${C.track}" stroke-width="7" stroke-linecap="round"/>` +
      (p > 0 ? `<path d="${arc}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="${p.toFixed(1)} 100"/>` : ''),
  )
}

export type RingState = 'running' | 'waiting' | 'pending' | 'done' | 'error' | 'chat'
export const RING = 24
// The leaf's ring: it turns while the work runs, closes green when done, red on a failure.
export function ringSvg(state: RingState, color: string) {
  const c = RING / 2
  const r = 9.5
  const track = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.track}" stroke-width="2.6"/>`
  const mark = (d: string, stroke: string) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
  const body = {
    running:
      track +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="17 60"><animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="1.4s" repeatCount="indefinite"/></circle>` +
      `<circle cx="${c}" cy="${c}" r="2.4" fill="${color}"/>`,
    waiting: track + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.warn}" stroke-width="2.6" stroke-dasharray="4 4"/>` + mark(`M${c} 7.5v5.5M${c} 16.2v.3`, C.warn),
    // An open step: a quiet dashed ring, no warning.
    pending: `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.twig}" stroke-width="2" stroke-dasharray="3 3.2"/>`,
    done: `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.ok}" stroke-width="2.6"/>` + mark('M7.8 12.4l2.9 2.9 5.5-5.7', C.ok),
    error: `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.alert}" stroke-width="2.6"/>` + mark('M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4', C.alert),
    chat:
      `<path d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-5l-4 3.2V17a3 3 0 0 1-2-3z" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
      mark('M8.6 9.6h6.8M8.6 12.8h4.4', color),
  }[state]
  return svg(RING, RING, body)
}

// The repo card's mark: GitHub's octocat for a GitHub remote, a plain branch fork otherwise.
export const repoSvg = (isGithub: boolean, color: string) =>
  isGithub
    ? svg(20, 20, `<path fill="${color}" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>`, '0 0 16 16')
    : svg(20, 20, `<g fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="4.5" r="2"/><circle cx="6" cy="15.5" r="2"/><circle cx="14" cy="7" r="2"/><path d="M6 6.5v7M14 9c0 3-8 2.5-8 4.5"/></g>`)

// The tree's root: this session.
export const coreSvg = (color: string) => svg(18, 18, `<circle cx="9" cy="9" r="8" fill="${color}" fill-opacity=".14"/><circle cx="9" cy="9" r="4.5" fill="${color}"/>`)

const WEATHER_ICONS = {
  clear: (c: string) =>
    `<circle cx="12" cy="12" r="4.5" fill="${c}"/><path fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  cloudy: (c: string) =>
    `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M7 18.5a3.75 3.75 0 0 1-.4-7.48A5.6 5.6 0 0 1 17.2 9.6a4.45 4.45 0 0 1 .3 8.9z"/>`,
  showers: (c: string) =>
    `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M7 14.5a3.25 3.25 0 0 1-.35-6.48A5 5 0 0 1 16.2 6.8a3.85 3.85 0 0 1 .3 7.7z"/><path fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>`,
  storm: (c: string) =>
    `<path fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" d="M13.5 2 5 13.5h6.5L10.5 22 19 10.5h-6.5z"/>`,
  compact: (c: string) =>
    `<path fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="M14 2 7 12h8l-5 9M14.5 18.8 10 21l-.5-5"/>`,
}

export const WEATHER = [
  { upTo: 25, icon: 'clear', glyph: '☀', color: '#e0b000', word: 'Klar' },
  { upTo: 50, icon: 'cloudy', glyph: '☁', color: '#8ea3b8', word: 'Bewölkt' },
  { upTo: 75, icon: 'showers', glyph: '☂', color: '#2f68c0', word: 'Schauer' },
  { upTo: 90, icon: 'storm', glyph: '☇', color: '#b04fc0', word: 'Gewitter' },
  { upTo: Infinity, icon: 'compact', glyph: '↯', color: '#d64545', word: 'Bald /compact' },
] as const

export const weatherOf = (percent: number) => WEATHER.find(w => percent < w.upTo) ?? WEATHER[4]

export const weatherSvg = (percent: number, size = 16) => {
  const w = weatherOf(percent)
  return svg(size, size, WEATHER_ICONS[w.icon](w.color), '0 0 24 24')
}
