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
  segment: 'rgba(127,127,127,0.28)',
  popup: '#2b2b2b',
  // An invisible border: "transparent" draws white on the desktop.
  clear: 'rgba(127,127,127,0)',
} as const

// A calm value keeps its own color; a warning takes amber, an alert red.
export const toned = (tone: Tone, calm: string) => (tone === 'alert' ? C.alert : tone === 'fast' ? C.warn : calm)

const svg = (w: number, h: number, body: string, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${body}</svg>`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export const DIAL = { w: 88, h: 80 }
// A three-quarter ring filled to the percent, the value and its name inside. `pace`, the share of the
// limit's window gone by, is a white tick on the ring: a fill past it is spending faster than time.
export function dialSvg(percent: number, color: string, value: string, label: string, pace: number | null, valueColor = '#ececec') {
  const r = 34
  const c = 44
  const full = 2 * Math.PI * r
  const arc = full * 0.75
  const p = Math.max(0, Math.min(100, percent))
  const ring = (stroke: string, length: number) =>
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${length.toFixed(1)} ${full.toFixed(1)}"/>`
  let tick = ''
  if (pace !== null) {
    const a = ((135 + 2.7 * Math.max(0, Math.min(100, pace))) * Math.PI) / 180
    const at = (d: number) => `${(c + d * Math.cos(a)).toFixed(1)} ${(c + d * Math.sin(a)).toFixed(1)}`
    tick = `<path d="M${at(r - 4.5)}L${at(r + 4.5)}" stroke="#ececec" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/>`
  }
  const text = (y: number, size: number, fill: string, weight: number, s: string) =>
    `<text x="${c}" y="${y}" text-anchor="middle" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="Segoe UI, system-ui, sans-serif">${esc(s)}</text>`
  return svg(
    DIAL.w,
    DIAL.h,
    `<g transform="rotate(135 ${c} ${c})">${ring(C.track, arc)}${p > 0 ? ring(color, (arc * p) / 100) : ''}</g>${tick}` +
      text(c + 3, 17, valueColor, 600, value) +
      text(c + 19, 11, '#9a9a9a', 400, label),
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

// The tree, one line per group in its color. The drawings fix each row's height, so the line runs through.
// leaf is a little taller than a card (about 64 px), so cards keep a gap while the line runs through.
export const TWIG = { w: 26, x: 9, head: 32, leaf: 74 }
const stroke = (color: string) => `fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="1.5"`
// The group's head: a dot; open, its line starts under it.
export const headSvg = (color: string, isOpen: boolean) =>
  svg(
    TWIG.w,
    TWIG.head,
    `<circle cx="${TWIG.x}" cy="${TWIG.head / 2}" r="4" fill="${color}"/>` + (isOpen ? `<path d="M${TWIG.x} ${TWIG.head / 2 + 4}V${TWIG.head}" ${stroke(color)}/>` : ''),
  )

// A folded group: one small ring per entry, so its state reads at a glance.
export const BEAD = 20
const BEAD_GAP = 4
export const beadsWidth = (n: number) => n * (BEAD + BEAD_GAP) - BEAD_GAP
export function beadsSvg(items: { state: RingState; color: string }[]) {
  const r = 7.4
  const c = BEAD / 2
  const one = (state: RingState, color: string, x: number) =>
    state === 'done'
      ? `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${C.ok}" stroke-width="2.2"/><path d="M${x - 3.3} ${c + 0.3}l2.3 2.3 4.3-4.4" fill="none" stroke="${C.ok}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : state === 'error'
        ? `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${C.alert}" stroke-width="2.2"/>`
        : state === 'pending'
          ? `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${C.twig}" stroke-width="1.8" stroke-dasharray="2.6 2.6"/>`
          : state === 'waiting'
            ? `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${C.warn}" stroke-width="2.2"/><circle cx="${x}" cy="${c}" r="2.2" fill="${C.warn}"/>`
            : // Running turns like the big ring: an arc on a pale track.
              `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${C.track}" stroke-width="2.2"/>` +
              `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="13 40"><animateTransform attributeName="transform" type="rotate" from="0 ${x} ${c}" to="360 ${x} ${c}" dur="1.4s" repeatCount="indefinite"/></circle>` +
              `<circle cx="${x}" cy="${c}" r="2.2" fill="${color}"/>`
  return svg(beadsWidth(items.length), BEAD, items.map((it, i) => one(it.state, it.color, c + i * (BEAD + BEAD_GAP))).join(''))
}
// In front of a card: down from the line above, round into the card; the group's last one stops there.
export function twigSvg(isLast: boolean, color: string) {
  const { w, x, leaf } = TWIG
  const mid = leaf / 2
  return svg(w, leaf, `<path d="M${x} 0V${mid - 8}q0 8 8 8H${w}" ${stroke(color)}/>${isLast ? '' : `<path d="M${x} ${mid}V${leaf}" ${stroke(color)}/>`}`)
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
  { upTo: 25, icon: 'clear', glyph: '☀', color: '#e0b000' },
  { upTo: 50, icon: 'cloudy', glyph: '☁', color: '#8ea3b8' },
  { upTo: 75, icon: 'showers', glyph: '☂', color: '#2f68c0' },
  { upTo: 90, icon: 'storm', glyph: '☇', color: '#b04fc0' },
  { upTo: Infinity, icon: 'compact', glyph: '↯', color: '#d64545' },
] as const

export const weatherOf = (percent: number) => WEATHER.find(w => percent < w.upTo) ?? WEATHER[4]

export const weatherSvg = (percent: number, size = 16) => {
  const w = weatherOf(percent)
  return svg(size, size, WEATHER_ICONS[w.icon](w.color), '0 0 24 24')
}

// The tab toggle, drawn as one picture: a box border costs a whole row, a drawing only its pixels. It
// stretches over the width (preserveAspectRatio none), so the open tab's pill lands under its quarter.
export const TOGGLE_H = 36
export function toggleSvg(open: number, count: number) {
  const W = 1000
  const step = W / count
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TOGGLE_H}" viewBox="0 0 ${W} ${TOGGLE_H}" preserveAspectRatio="none">` +
    `<rect width="${W}" height="${TOGGLE_H}" rx="10" fill="${C.card}"/>` +
    `<rect x="${(open * step + 5).toFixed(1)}" y="4" width="${(step - 10).toFixed(1)}" height="${TOGGLE_H - 8}" rx="8" fill="${C.segment}"/>` +
    `</svg>`
  )
}

// The history's line: a dot per row, filled in its color, hollow for an event; the line runs on unless it is the last row.
// Each row's drawing is as tall as its row, so the line runs through.
export const STEP = { w: 22, turn: 46, file: 28 }
export function stepSvg(height: number, color: string, isHollow: boolean, isLast: boolean) {
  const x = 9
  const y = 12
  const line = `<path d="M${x} 0V${isLast ? y : height}" ${stroke('#8a8a8a')}/>`
  const dot = isHollow ? `<circle cx="${x}" cy="${y}" r="4" fill="#1f1f1f" stroke="${color}" stroke-width="1.6"/>` : `<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`
  return svg(STEP.w, height, line + dot)
}

// A turn's length as a bar, stretched over the row; the share is of the longest turn shown.
export const durationSvg = (share: number, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="5" viewBox="0 0 1000 5" preserveAspectRatio="none"><rect width="1000" height="5" rx="2.5" fill="${C.track}"/><rect width="${Math.max(20, 1000 * Math.min(1, share)).toFixed(0)}" height="5" rx="2.5" fill="${color}"/></svg>`

// The Files tab's drawings: a folder, a file's type, GitHub's five squares, the twig from folder to file.
export const folderSvg = (color: string) =>
  svg(16, 14, `<path d="M1 3a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" fill="${color}" fill-opacity=".25" stroke="${color}" stroke-width="1.2"/>`)
const EXT: Record<string, [string, string]> = { ts: ['TS', '#3178c6'], tsx: ['TSX', '#3178c6'], js: ['JS', '#c9a227'], jsx: ['JSX', '#c9a227'], json: ['{ }', '#c9a227'], md: ['MD', '#8a8a8a'], py: ['PY', '#3fa66b'], css: ['CSS', '#8b6fe0'], html: ['HTML', '#d97757'] }
export const EXT_BADGE = { w: 30, h: 16 }
export function extSvg(name: string) {
  const [label, color] = EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? ['·', '#8a8a8a']
  return svg(
    EXT_BADGE.w,
    EXT_BADGE.h,
    `<rect x=".5" y=".5" width="29" height="15" rx="4" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".4"/><text x="15" y="11.5" text-anchor="middle" fill="${color}" font-size="9" font-weight="700" font-family="Consolas, monospace">${esc(label)}</text>`,
  )
}
export const SQUARES = { w: 43, h: 8 }
export function squaresSvg(added: number, removed: number) {
  const n = added + removed || 1
  const green = Math.round((5 * added) / n)
  const red = Math.min(5 - green, Math.round((5 * removed) / n))
  const cell = (i: number) => `<rect x="${i * 9}" width="7" height="7" rx="1.5" fill="${i < green ? C.ok : i < green + red ? C.alert : C.track}"/>`
  return svg(SQUARES.w, SQUARES.h, [0, 1, 2, 3, 4].map(cell).join(''))
}
export const FILE_TWIG = { w: 22, h: 28 }
export function fileTwigSvg(isLast: boolean, color: string) {
  const { w, h } = FILE_TWIG
  return svg(w, h, `<path d="M8 0V${h / 2 - 7}q0 7 7 7H${w}" ${stroke(color)}/>${isLast ? '' : `<path d="M8 ${h / 2}V${h}" ${stroke(color)}/>`}`)
}

// The context's parts as one bar, stretched over the card's width.
export const PART_COLORS = [C.context, C.shell, C.chat, C.agent, '#8a8a8a', C.five_hour]
export function partsSvg(parts: { tokens: number }[]) {
  const total = parts.reduce((n, p) => n + p.tokens, 0) || 1
  let x = 0
  const rects = parts
    .map((p, i) => {
      const w = (1000 * p.tokens) / total
      const r = `<rect x="${x.toFixed(1)}" width="${w.toFixed(1)}" height="8" fill="${PART_COLORS[i % PART_COLORS.length]}"/>`
      x += w
      return r
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="8" viewBox="0 0 1000 8" preserveAspectRatio="none">${rects}</svg>`
}
