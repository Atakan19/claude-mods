// Clawd, Claude Code's pixel mascot, dressed for a subagent's role; its state shows in the figure:
// it bobs and walks while running, a "!" bubble blinks while it waits, happy eyes when done, red X eyes on an error.
import { C } from './look'

export type Role = 'explorer' | 'designer' | 'tester' | 'reviewer' | 'builder' | 'writer' | 'guide' | 'plain'
export type Mood = 'running' | 'waiting' | 'done' | 'error'

// The role from the agent's type and description, by words only; no tokens.
const ROLE_WORDS: [Role, RegExp][] = [
  ['reviewer', /review|audit|diff|prüf/i],
  ['designer', /design|frontend|front-end|\bui\b|\bux\b|css|style|layout|optik/i],
  ['tester', /test|verif|check|qa\b/i],
  ['writer', /doc|readme|writ|schreib|text|notes?\b/i],
  ['guide', /guide|claude-code|web-?fetch|research|recherch|frage/i],
  ['explorer', /explore|search|find|such|locat|investig|map\b/i],
  ['builder', /build|fix|implement|refactor|bau|umsetz|code\b|edit/i],
]
export function roleOf(type: string, description: string): Role {
  const text = `${type} ${description}`
  return ROLE_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'plain'
}

const U = 4 // one sprite pixel, in drawing units
const W = 20
const H = 17
export const CLAWD = { w: W * U, h: H * U }
const BODY = '#d97757'
const EYE = '#141414'
const px = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x * U}" y="${y * U}" width="${w * U}" height="${h * U}" fill="${fill}"${extra}/>`

// The body sits 2 right and 5 down on the grid, so hats and tools fit around it.
function body(mood: Mood) {
  const ox = 2
  const oy = 5
  const p = (x: number, y: number, w: number, h: number, f: string) => px(x + ox, y + oy, w, h, f)
  // Eyes at x 4 and 11: a happy ^ when done, a red X on an error, open otherwise.
  const eyes =
    mood === 'done'
      ? [4, 11].map(x => p(x - 1, 3, 1, 1, EYE) + p(x, 2, 1, 1, EYE) + p(x + 1, 3, 1, 1, EYE)).join('')
      : mood === 'error'
        ? [4, 11].map(x => p(x - 1, 2, 1, 1, C.alert) + p(x + 1, 2, 1, 1, C.alert) + p(x, 3, 1, 1, C.alert) + p(x - 1, 4, 1, 1, C.alert) + p(x + 1, 4, 1, 1, C.alert)).join('')
        : p(4, 2, 1, 2, EYE) + p(11, 2, 1, 2, EYE)
  // Running, the legs take turns: each pair grows and shrinks a pixel.
  const legs = [2, 4, 11, 13]
    .map((x, i) =>
      mood === 'running'
        ? `<rect x="${(x + ox) * U}" y="${(7 + oy) * U}" width="${U}" height="${3 * U}" fill="${BODY}"><animate attributeName="height" values="${i % 2 === 0 ? `${3 * U};${2 * U};${3 * U}` : `${2 * U};${3 * U};${2 * U}`}" dur=".5s" repeatCount="indefinite"/></rect>`
        : p(x, 7, 1, 3, BODY),
    )
    .join('')
  return p(1, 0, 14, 7, BODY) + p(-1, 3, 2, 2, BODY) + p(15, 3, 2, 2, BODY) + legs + eyes
}

// The outfits, on the same grid (the body spans x 3..16, y 5..11).
const GEAR: Record<Role, string> = {
  explorer: px(2, 3, 16, 2, '#1c1c1c') + px(5, 1, 10, 2, '#1c1c1c') + px(9, 2, 2, 1, '#eeeeee') + px(18, 7, 2, 1, '#c9a46a') + px(19, 6, 1, 1, '#8a6a3a'),
  designer: px(4, 3, 11, 2, '#5b4bb0') + px(8, 2, 2, 1, '#5b4bb0') + px(18, 4, 1, 4, '#b08a50') + px(18, 3, 1, 1, '#8b6fe0'),
  tester:
    px(11, 5, 4, 1, '#dddddd') +
    px(11, 9, 4, 1, '#dddddd') +
    px(11, 6, 1, 3, '#dddddd') +
    px(14, 6, 1, 3, '#dddddd') +
    px(12, 6, 2, 3, 'rgba(160,210,255,.35)') +
    px(15, 10, 1, 1, '#dddddd') +
    px(16, 11, 1, 1, '#dddddd') +
    px(17, 12, 1, 1, '#dddddd'),
  reviewer: px(5, 6, 3, 3, 'none', ' stroke="#e8e8e8" stroke-width="2"') + px(12, 6, 3, 3, 'none', ' stroke="#e8e8e8" stroke-width="2"') + px(8, 7, 4, 0.5, '#e8e8e8'),
  builder: px(5, 2, 10, 3, '#e8b030') + px(3, 4, 14, 1, '#e8b030') + px(9, 1, 2, 1, '#e8b030') + px(9, 2, 2, 3, '#c89010'),
  writer: px(0, 2, 1, 1, '#f2f2f2') + px(1, 3, 1, 1, '#f2f2f2') + px(1, 4, 1, 2, '#e0e0e0') + px(2, 6, 1, 2, '#c9a46a'),
  guide: px(5, 9, 10, 3, '#3d6fb3') + px(9, 9, 2, 3, '#9fc0ec') + px(6, 10, 2, 0.5, '#9fc0ec') + px(12, 10, 2, 0.5, '#9fc0ec'),
  plain: '',
}

const BUBBLE = `<g>${px(0, 0, 4, 4, '#2a2a2a', ` stroke="${C.warn}" stroke-width="2"`)}${px(1.5, 0.6, 1, 1.6, C.warn)}${px(1.5, 2.6, 1, 0.8, C.warn)}<animate attributeName="opacity" values="1;.25;1" dur="1.2s" repeatCount="indefinite"/></g>`

export function clawdSvg(role: Role, mood: Mood) {
  let figure = body(mood) + GEAR[role]
  // Running, he bobs half a pixel up and down.
  if (mood === 'running') figure = `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -${U / 2};0 0" dur=".5s" repeatCount="indefinite"/>${figure}</g>`
  if (mood === 'waiting') figure += BUBBLE
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CLAWD.w}" height="${CLAWD.h}" viewBox="0 0 ${CLAWD.w} ${CLAWD.h}" shape-rendering="crispEdges"${mood === 'done' ? ' opacity=".7"' : ''}>${figure}</svg>`
}
