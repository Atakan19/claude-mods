// The plan bars and agent strips, drawn as zycck's plan-progress draws them on the desktop:
// the code below is taken from https://github.com/zycck/claude-mods (MIT, Copyright (c) 2026
// Kirill Serditov; see NOTICE), cut to the desktop drawing. Only the glue at the end is ours.

import { t } from './i18n'

export type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'
export type PlanSubstep = { title: string; status: StepStatus }
// doneAt: when the step was finished, so a checkpoint can tell how long it took
export type PlanStep = { title: string; status: StepStatus; substeps: PlanSubstep[]; doneAt?: number }
export type PlanStage = { name: string; steps: PlanStep[] }
// cockpit: stuck is a step left standing through many calls (see plan.ts stuckStep): amber like a wait, an hourglass
// for its mark, as nothing is asked of the person.
export type PlanState = 'running' | 'needs_input' | 'stuck' | 'error' | 'done'
// one subagent shown as a state strip under a bar; depth 1 sits under its parent agent
export type AgentRun = {
  id: string
  title: string
  state: 'running' | 'waiting' | 'done' | 'error'
  tool: string
  startedAt: number
  endedAt: number | null
  depth: number
  // the model it runs on and its effort, as the engine resolved them
  model?: string
  effort?: string
}
export type Plan = {
  id: string
  title: string
  kind: 'plan' | 'todo'
  stages: PlanStage[]
  state: PlanState
  note: string | null
  startedAt: number
  // when the plan was finished; the pill then shows the time it took
  endedAt?: number | null
  agents?: AgentRun[]
  // when the current batch of agents all finished; their strips fold a few seconds later
  agentsDoneAt?: number | null
  // the person folded the bar's agent strips away (its ▾ button, /progress-agents); the bar keeps one line
  isFolded?: boolean
}

const STRIP_H = 16
const STRIP_GAP = 2
// rows of strips per bar, the "+N more" row included: the band above the prompt has room for about 300 px
const stripBudget = (bars: number) => (bars >= 3 ? 3 : bars === 2 ? 4 : 5)
const FOLD_MS = 5000 // finished strips stay this long, failed ones stay until the bar closes
const STATE_COLOR: Record<PlanState, string> = { running: '#7858CA', needs_input: '#AD6400', stuck: '#AD6400', error: '#C5353E', done: '#18883A' }
const INK = '#FFFFFF'
const STATE_GLYPH: Record<PlanState, string> = { running: '●', needs_input: '?', stuck: '⏳', error: '!', done: '✓' }
const TRACK_H = 22
const NARROW = 360
const isFinished = (s: StepStatus) => s === 'done' || s === 'skipped'
const stateColor = (s: PlanState) => STATE_COLOR[s]
type Where = { pos: number; total: number; stage: number; step: number; stageSize: number }

// pos counts the finished steps wherever they are; the current step is the active one, else the first still open
function where(p: Plan): Where {
  const steps = p.stages.flatMap((s, i) => s.steps.map((step, j) => ({ i, j, step })))
  const pos = p.state === 'done' ? steps.length : steps.filter(x => isFinished(x.step.status)).length
  const cur = p.state === 'done' ? undefined : (steps.find(x => x.step.status === 'active') ?? steps.find(x => !isFinished(x.step.status)))
  const stage = (cur ?? steps[steps.length - 1])?.i ?? 0

  return { pos, total: steps.length, stage, step: cur ? cur.j + 1 : (p.stages[stage]?.steps.length ?? 0), stageSize: p.stages[stage]?.steps.length ?? 0 }
}

// what the pill shows: the stage its place on the track falls in (the finished share), so its name never runs ahead
// of the pill or lags behind it when Claude finishes steps out of order; the step counts within that stage. The
// model's own lines keep where(), which names the step actually in progress
function atHead(p: Plan): Where {
  const w = where(p)
  if (p.state === 'done') return w
  let start = 0
  for (let i = 0; i < p.stages.length; i++) {
    const size = p.stages[i]?.steps.length ?? 0
    if (w.pos < start + size || i === p.stages.length - 1) return { ...w, stage: i, step: Math.max(1, Math.min(size, w.pos - start + 1)), stageSize: size }
    start += size
  }
  return w
}

// the step the pill stands at, named after its stage behind a small separator; none on a finished bar
const pillStep = (p: Plan, w: Where) => (p.state === 'done' ? '' : (p.stages[w.stage]?.steps[w.step - 1]?.title ?? ''))

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: number[], b: number[], m: number) => a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * m))
const rgb = (c: number[]) => `rgb(${c.join(',')})`
// XML has no place for C0 controls (an ANSI colour code's ESC, a bell) or U+FFFE/U+FFFF, escaped or not: one in a
// title would leave the whole picture unparsable, drawn as a broken image
const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const hash = (a: number, b: number, k: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}
const textWidth = (s: string, px = 6.7) => [...s].reduce((w, ch) => w + (/[　-鿿]/.test(ch) ? 12 : /[ilI.,:;'|!]/.test(ch) ? 3.4 : /[mwMWШЩЖМ]/.test(ch) ? 9.5 : px), 0)

// a closer guess at a label's width in the system UI face the desktop draws a picture's text in (Segoe UI, SF Pro):
// spaces, the middle dot and narrow letters count narrow, wide capitals wide. Measured against Segoe UI it lands
// within a few percent; the margin on top keeps a wider face (SF Pro) inside the pill. Drawn text is centred on its
// box, so what is left of the error splits evenly between the two sides. Korean and full-width letters are an em wide
// like Chinese, an emoji (past the basic plane, or a dingbat like ✅) wider still, and the joiners and accents that
// ride on a letter take no room; lowercase Cyrillic ш щ ж ю ы м ф count wide, near their capitals
const glyphW = (ch: string) =>
  /[\u0300-\u036F\u200B-\u200D\uFE00-\uFE0F]/.test(ch) ? 0
  : ch.length > 1 || /[\u2600-\u27BF]/.test(ch) ? 16.5
  : /[　-鿿가-힣\uFF01-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 12
  : /[\s·.,:;'|!iljI]/.test(ch) ? 3.3
  : /[frt]/.test(ch) ? 4.4
  : /[MWШЩЖЮФ…]/.test(ch) ? 10.8
  : /[шщжю]/.test(ch) ? 10.4
  : /[mwМЫымф]/.test(ch) ? 9.6
  : /[0-9]/.test(ch) ? 6.6
  : /[A-ZА-ЯЁ]/.test(ch) ? 7.6
  : 6.3
const labelWidth = (s: string, size = 12, isBold = true) => (([...s].reduce((w, ch) => w + glyphW(ch), 0) * size) / 12) * (isBold ? 1 : 0.96) * 1.06
// a label cut to width, as labelWidth measures it, then given an ellipsis; at least three characters stay. It drops
// whole grapheme clusters, so an emoji is never split into a lone half (which shows as "�" and breaks the picture's
// encoding), and takes each one's width off as it goes, so a long label costs one pass and not one measure a letter
const fitLabel = (s: string, width: number, size = 12, isBold = true) => {
  if (labelWidth(s, size, isBold) <= width) return s
  const scale = (size / 12) * (isBold ? 1 : 0.96) * 1.06
  const parts = clusters(s).map(c => ({ c, w: [...c].reduce((sum, ch) => sum + glyphW(ch), 0) * scale }))
  let w = parts.reduce((sum, x) => sum + x.w, 0)
  let n = parts.length
  // the ellipsis takes its own room, so the cut label with it still fits
  const room = width - glyphW('…') * scale
  while (n > 3 && w > room) w -= parts[--n]?.w ?? 0
  return n === parts.length ? s : parts.slice(0, n).map(x => x.c).join('').trimEnd() + '…'
}
// the text without its last grapheme cluster, for the cuts measured with textWidth
const dropLast = (s: string) => clusters(s).slice(0, -1).join('')
// a strip's text (11.5 px, regular) cut so that it ends, ellipsis and all, within width. Measured both ways and the
// wider taken: textWidth reads Korean and full-width letters as Latin, labelWidth knows them
const stripW = (s: string) => Math.max(textWidth(s, 6.2), labelWidth(s, 11.5, false))
const fitStrip = (s: string, width: number) => {
  if (stripW(s) <= width) return s
  let cut = s
  while (cut.length > 4 && stripW(cut + '…') > width) cut = dropLast(cut)
  return cut.trimEnd() + '…'
}

const ICON_PATH: Partial<Record<PlanState, string>> = {
  needs_input: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  stuck: 'M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
  error: 'M18 6 6 18M6 6l12 12',
  done: 'M20 6 9 17l-5-5',
}

// how long each finished step took (from the previous finish, or the plan's start) and each finished stage
function stepTimes(p: Plan): { steps: Map<PlanStep, number>; stages: (number | undefined)[] } {
  const ends = p.stages.flatMap(s => s.steps).flatMap(st => (st.doneAt === undefined ? [] : [st.doneAt])).sort((a, b) => a - b)
  const startOf = (at: number) => Math.max(p.startedAt, ...ends.filter(t => t < at))
  const steps = new Map<PlanStep, number>()
  const stages = p.stages.map(s => {
    for (const st of s.steps) if (st.doneAt !== undefined) steps.set(st, st.doneAt - startOf(st.doneAt))
    const times = s.steps.map(st => st.doneAt)
    if (times.some(t => t === undefined)) return undefined
    const done = times as number[]
    return Math.max(...done) - Math.min(...done.map(startOf))
  })
  return { steps, stages }
}

// the 2 px dots of one look go into one path: a fraction of the markup of a rect each, and one node instead of thousands
function addDot(dots: Map<string, string>, cls: string, x: number, y: number) {
  dots.set(cls, `${dots.get(cls) ?? ''}M${x} ${y}h2v2h-2z`)
}

// the fill is a still grid of 2 px dots, 3 px apart in 7 rows, and brightness streams over it from the head towards
// the start the way it does on Claude Code's effort slider: a wave of a few brightness steps scrolls left one column
// per step, and every dot flickers on its own, stepping up and back down to the grid. It is all patterns and masks,
// so the picture is the same size at any width
const STREAM_COLS = 233 // the wave's pattern in columns, prime and long, so its loop does not show
const STREAM_SPEED = 20 // columns a second; a bar at rest (waiting, failed, done) streams at half that
const STREAM_LEVELS = [0.3, 0.37, 0.44, 0.51] // the grid's brightness at each step of the wave
const FLICKER_TILE = 173 // columns the flicker classes are dealt over, every dot in exactly one
const FLICKER_CLASSES = 24
const FLICKER_LIFTS = [0, 0.35, 0.6, 0.9]
// [share of the fill, opacity]: the grid fades in from nothing at the start to full at two thirds; the flicker fades in
// later and steeper, so it sparkles at the head and thins out on its way to the start
const STREAM_FADE: [number, number][] = [[0, 0], [0.67, 1], [1, 1]]
const FLICKER_FADE: [number, number][] = [[0, 0], [0.15, 0], [0.5, 0.45], [0.8, 0.9], [1, 1]]
// mixed better than hash for the few hundred values the stream takes: with it the wave comes out as it was measured
// against the slider
const streamHash = (a: number, b: number, k: number) => {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(k, 1442695041)) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
// the wave: noise over STREAM_COLS columns (wrapping), smoothed to blobs a few columns wide and cut into steps. Drawn
// as one stroke per step through its runs of columns, the full height of the track
const STREAM_WAVE = (() => {
  const raw = Array.from({ length: STREAM_COLS }, (_, i) => streamHash(i, 0, 5))
  const smooth = raw.map((_, i) => {
    let sum = 0
    let weight = 0
    for (let d = -5; d <= 5; d++) {
      const k = Math.exp(-(d * d) / 12.5)
      sum += (raw[(i + d + STREAM_COLS) % STREAM_COLS] ?? 0) * k
      weight += k
    }
    return sum / weight
  })
  const lo = Math.min(...smooth)
  const hi = Math.max(...smooth)
  const steps = smooth.map(v => Math.min(STREAM_LEVELS.length - 1, Math.floor(((v - lo) / (hi - lo)) * STREAM_LEVELS.length)))
  const runs = STREAM_LEVELS.map((level, l) => {
    let d = ''
    let end = -1
    for (let i = 0; i < steps.length; ) {
      let j = i
      while (j < steps.length && steps[j] === steps[i]) j++
      if (steps[i] === l) {
        d += `${end < 0 ? `M${i * 3} ${TRACK_H / 2}` : `m${(i - end) * 3} 0`}h${(j - i) * 3}`
        end = j
      }
      i = j
    }
    return d ? `<path stroke-opacity="${level}" d="${d}"/>` : ''
  })
  return `<g stroke="#fff" stroke-width="${TRACK_H}">${runs.join('')}</g>`
})()
// the flicker: each class a pattern of its dots over the tile, and a timeline of lifts (a random walk over
// FLICKER_LIFTS, each held 50 to 300 ms, back at the grid now and then) of its own length and start. Every time in
// it is a whole number of the wave's 50 ms steps: a change anywhere in the picture redraws all of it, and on one beat
// the 24 classes and the wave redraw it 20 times a second instead of at nearly every frame (half the CPU)
const FLICKER_TICK = 0.05
const FLICKER = (() => {
  const of = Array.from({ length: 7 }, (_, r) => Array.from({ length: FLICKER_TILE }, (_, c) => Math.floor(streamHash(c, r, 302) * FLICKER_CLASSES)))
  return Array.from({ length: FLICKER_CLASSES }, (_, k) => {
    let d = ''
    let last: [number, number] | null = null
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < FLICKER_TILE; c++) {
        if (of[r]?.[c] !== k) continue
        d += `${last ? `m${c * 3 - last[0]} ${r * 3 - last[1]}` : `M${c * 3} ${r * 3}`}h2v2h-2z`
        last = [c * 3, r * 3]
      }
    }
    // in ticks; a frame that would hold the level it already has is left out
    const length = Math.round((2.3 + 2.4 * streamHash(k, 1, 11)) / FLICKER_TICK)
    const frames: string[] = []
    let level = 0
    let shown = -1
    for (let t = 0, i = 0; t < length - 1; i++) {
      if (level !== shown) frames.push(`${+((t / length) * 100).toFixed(3)}%{opacity:${FLICKER_LIFTS[level]}}`)
      shown = level
      t += Math.max(1, Math.round((0.07 + 0.23 * streamHash(k, i, 13)) / FLICKER_TICK))
      const u = streamHash(k, i, 15)
      level = u < 0.4 ? Math.max(0, level - 1) : u < 0.8 ? Math.min(3, level + 1) : 0
    }
    const css = `.q${k}{opacity:0;animation:q${k} ${(length * FLICKER_TICK).toFixed(2)}s step-end infinite;animation-delay:calc(var(--f) - ${(Math.round(streamHash(k, 2, 16) * length) * FLICKER_TICK).toFixed(2)}s)}@keyframes q${k}{${frames.join('')}}`
    return { d, css }
  })
})()
const FLICKER_CSS = FLICKER.map(f => f.css).join('')
// the twinkle switch. Off, the fill stands still as reduce motion draws it, the flicker left out and
// the wave's bands kept where they start, and the strips' dots and the terminal fill hold their middle brightness; the
// clocks, the glides and the agents' status dots still move
const isTwinkling = true

// the engine refuses the whole band, every bar in it, when one picture's source passes 131072 characters. A plan of
// hundreds of steps would get there through its marks and their hover tips (a few pixels apart they only cover each
// other anyway), so past a share of that each is thinned. Stage boundaries go first, as they give the track its
// shape and name the stages; the step marks fill what is left, kept only so far apart along the track. Picking by
// index would line up with regular stage sizes and drop every stage at once
const MARKS_BUDGET = 40_000
const TIPS_BUDGET = 100_000
type Mark<T> = { x: number; isStage: boolean; item: T }
function thin<T>(marks: Mark<T>[], size: (item: T) => number, budget: number): T[] {
  const sizeOf = (m: Mark<T>) => size(m.item)
  if (marks.reduce((n, m) => n + sizeOf(m), 0) <= budget) return marks.map(m => m.item)
  const keep = new Set<Mark<T>>()
  let used = 0
  // every so many, spread evenly, of the marks that fit only in part
  const spread = (list: Mark<T>[], room: number) => {
    const every = Math.max(1, Math.ceil(list.reduce((n, m) => n + sizeOf(m), 0) / Math.max(1, room)))
    list.forEach((m, i) => {
      if (i % every !== 0 || used + sizeOf(m) > budget) return
      used += sizeOf(m)
      keep.add(m)
    })
  }
  spread(marks.filter(m => m.isStage), budget)
  const steps = marks.filter(m => !m.isStage)
  const room = budget - used
  const fits = steps.length === 0 ? 0 : Math.floor(room / (steps.reduce((n, m) => n + sizeOf(m), 0) / steps.length))
  const span = (marks.at(-1)?.x ?? 0) - (marks[0]?.x ?? 0)
  const gap = fits > 0 ? span / fits : Infinity
  let last = -Infinity
  for (const m of marks) {
    if (keep.has(m)) last = m.x
    else if (!m.isStage && m.x - last >= gap && used + sizeOf(m) <= budget) {
      used += sizeOf(m)
      keep.add(m)
      last = m.x
    }
  }
  return marks.filter(m => keep.has(m)).map(m => m.item)
}

// last drawn head position per plan, so a redraw glides from where the bar was; from and at are the glide that led
// there (from === x when it stood), so a redraw before it has run keeps it going instead of drawing it arrived
const lastHead = new Map<string, { W: number; x: number; from: number; at: number }>()
// where each bar's wave got to (cols, in columns) when it last changed speed (at): a bar coming to rest, or set going
// again, streams on from there at its new speed. Timed from the start at the new speed instead, the wave would jump to
// wherever that speed had brought it
const waveFrom = new Map<string, { start: number; speed: number; at: number; cols: number }>()

// the track draws in a sandboxed frame (for hover); its page must stay see-through in either theme
const SEE_THROUGH = '<style>:root,html,body{background:transparent!important;color-scheme:light dark;margin:0;overflow:hidden}svg{display:block}</style>'

// a clock that counts in the frame by itself, so the drawing never has to be redrawn each second (a redraw
// reloads the frame and everything in it blinks): each digit is a reel of its figures behind a one-line window,
// stepped by a CSS animation whose negative delay is the time already run. Plain SVG, since the host's frame
// drops foreignObject. {{T:start}} becomes those seconds on every draw (liveSource)
const CLOCK_W = 48 // "59m 59s"
const LINE = 16
const CLOCK_CSS = `.ckt{font-variant-numeric:tabular-nums}
.rs1{animation:r10 10s steps(10) var(--d) infinite}.rs10{animation:r6 60s steps(6) var(--d) infinite}
.cc{animation:cc 36000s linear var(--d) both}@keyframes cc{0%,.1666%{transform:translateX(-13.5px)}.1667%,1.6666%{transform:translateX(-3.25px)}1.6667%,9.9999%{transform:none}10%,99.9999%{transform:translateX(-4.25px)}100%{transform:translateX(-.75px)}}
.rm1{animation:r10 600s steps(10) var(--d) infinite}.rm10{animation:r10 6000s steps(10) var(--d) infinite}.rmm{animation:hm 60s steps(1,end) var(--d) both}
.rm6{animation:r6 3600s steps(6) var(--d) infinite}.rh1{animation:r10 36000s steps(10) var(--d) infinite}.rh10{animation:r10 360000s steps(10) var(--d) infinite}
.ph1{animation:ho 3600s steps(1,end) var(--d) both}.ph2{animation:hm 3600s steps(1,end) var(--d) both}
@keyframes r10{to{transform:translateY(-${LINE * 10}px)}}@keyframes r6{to{transform:translateY(-${LINE * 6}px)}}@keyframes hm{from{opacity:0}to{opacity:1}}@keyframes ho{from{opacity:1}to{opacity:0}}`

// x is the clock's left edge, top the window's top. Under an hour it reads "12m 05s", the minutes part hidden for
// the first minute; from an hour on "1h 05m", as elapsed() writes a finished time, up to 99h
function liveClock(x: number, top: number, start: number, cls: string, textCls: string, isCentered = false): string {
  const base = top + 12
  const reel = (cx: number, figures: string[], reelCls: string) =>
    `<g class="${reelCls}"><text class="${textCls} ckt" text-anchor="middle">${figures
      .map((f, i) => `<tspan x="${cx.toFixed(1)}" y="${base + i * LINE}">${f}</tspan>`)
      .join('')}</text></g>`
  const unit = (ux: number, label: string) => `<text x="${ux.toFixed(1)}" y="${base}" class="${textCls}">${label}</text>`
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const tens = ['', ...digits.slice(1)]
  const id = `ck${start}x${Math.round(x)}y${Math.round(top)}`
  const minutes =
    `<g class="ph1"><g class="rmm">${reel(x + 3.5, tens, 'rm10')}${reel(x + 10.5, digits, 'rm1')}${unit(x + 14, 'm')}</g>` +
    `${reel(x + 31, digits.slice(0, 6), 'rs10')}${reel(x + 38, digits, 'rs1')}${unit(x + 41.5, 's')}</g>`
  // "h" is narrower than "m", so the minutes sit 3 px nearer to it than the seconds sit to "m": the same space between
  // the parts, and the face's wide "m" ends about where the other face's "s" does
  const hours =
    `<g class="ph2">${reel(x + 3.5, tens, 'rh10')}${reel(x + 10.5, digits, 'rh1')}${unit(x + 14, 'h')}` +
    `${reel(x + 28, digits.slice(0, 6), 'rm6')}${reel(x + 35, digits, 'rm1')}${unit(x + 38.5, 'm')}</g>`
  // the window only has to hide the reels' other figures above and below; sideways it leaves room past the clock's
  // right edge for a wider face than Segoe UI (SF Pro), whose last letter would otherwise be cut
  return (
    `<style>.${id}{--d:-{{T:${start}}}s}</style><g class="${cls} ${id}"><clipPath id="${id}"><rect x="${(x - 2).toFixed(1)}" y="${top}" width="${CLOCK_W + 10}" height="${LINE}"/></clipPath>` +
    `<g clip-path="url(#${id})"${isCentered ? ' class="cc"' : ''}>${minutes}${hours}</g></g>`
  )
}

// the desktop rebuilds a strip's picture on every redraw of the band, another plugin's invalidate included, so a
// source reused from an earlier draw would restart its clocks at that draw's offset (issue #6): the offset is
// taken from now on every draw. To the millisecond: a glide is steepest at its start, where a tenth of a second
// is up to 40% of the way, so a picture rebuilt there at a rounded offset set the pill back and sent it on again
function liveSource(template: string, now: number): string {
  return template.replace(/\{\{T:(\d+)\}\}/g, (_, t: string) => Math.max(0, (now - Number(t)) / 1000).toFixed(3))
}

// SMIL runs whatever CSS says, so prefers-reduced-motion alone cannot stop a glide or a colour flow: an element that
// moves is drawn twice, the moving copy (class mv) hidden under reduced motion and a still one (sv), shown only then,
// in its place. draw gets the animation to put in the element and the class to give it
const withStill = (draw: (anim: string, cls: string) => string, anim: string) => (anim ? draw(anim, 'mv') + draw('', 'sv') : draw('', ''))
const classAttr = (cls: string) => (cls ? ` class="${cls}"` : '')
const STILL_CSS = '.sv{display:none}'
const STILL_REDUCED = '.mv{display:none}.sv{display:inline}'

// a bar is drawn three times: the track itself as a plain picture, cheap for the desktop to rebuild whenever anything
// redraws; the pill's clock, a plain picture too, that the desktop shows while the pointer is over the track; and a
// see-through layer on top for the checkpoint times. That layer needs an interactive frame, and the desktop rebuilds
// such frames on every redraw of the band; empty until hovered, the rebuild is invisible. The clock is no part of it:
// a frame built anew under a still pointer is not hovered until the pointer moves, so the clock went out on every
// redraw (the footer's figure, once a second while a response streams), where the desktop's own hover holds. All
// three at one width are reused until what they show of the plan changes
type Track = { base: string; overlay: string; clock: string }
// the desktop rebuilds the picture when anything near it redraws (the footer's figure, a strip), and a rebuilt glide
// would play again from the start, the pill jumping back to where it was. So the glide begins where its time has got
// to ({{T:moved}} becomes the seconds since the move on every draw, liveSource), and once it has run the bar is drawn
// standing at its place. A rebuild from the very same source starts that source's glide over, whatever its offset:
// the engine hands back its last answer when the desktop asks again with nothing the band read changed, which it does
// as the model starts to answer after a tool call, some .5 s after the move. So the glide is short and the standing
// picture is asked for before it ends: from PICTURE_STAND_MS on, with the pill all but there, a draw is standing,
// and the gliding source is current for as short a time as the desktop takes to draw the band again. The desktop
// shows a picture some .1 s after it is drawn and the standing one as late, so it lands about where the glide
// stands then: a step of 1-2% of the way, where at .2 s it was 5%
const PICTURE_GLIDE_MS = 300
const PICTURE_STAND_MS = 250
// a bar that glided is drawn once more as the glide ends, standing: with nothing else to redraw it (a finished bar, the
// turn over) the desktop would keep the gliding picture, and play it again from the old place whenever it rebuilds it.
// One timer at a time, when the first glide or morph still under way is over; a draw then queues the next. One due
// sooner than the timer waiting takes its place, else a later end queued first would hold the earlier picture on
// kept per bar id with what the track shows of the plan: $.state hands back a fresh copy on every read, so a plan
// object is never seen twice and could not key the drawings itself
const drawn = new Map<string, { sig: string; W: number; color: string; track: Track; glideUntil: number }>()
const trackSig = (p: Plan) => JSON.stringify([p.state, p.startedAt, p.endedAt, p.stages])

function trackSvg(p: Plan, W: number, now: number): Track {
  const cached = drawn.get(p.id)
  const sig = trackSig(p)
  const color = stateColor(p.state)
  if (cached?.sig === sig && cached.W === W && cached.color === color && (cached.glideUntil === 0 || now < cached.glideUntil)) return cached.track
  const track = drawTrack(p, W, now)
  const glideUntil = track.base.includes('<animateTransform') ? (lastHead.get(p.id)?.at ?? now) + PICTURE_STAND_MS : 0
  drawn.set(p.id, { sig, W, color, track, glideUntil })
  return track
}

function drawTrack(p: Plan, W: number, now = 0): Track {
  const H = TRACK_H
  const w = atHead(p)
  const done = p.state === 'done'
  // the fill is the finished share; cockpit: with a step under way it reaches half into that step, so the pill
  // stands in the middle of the part it names rather than at its left edge
  const isUnderWay = !done && p.stages.some(s => s.steps.some(x => x.status === 'active'))
  const frac = done ? 1 : Math.min(1, (w.pos + (isUnderWay ? 0.5 : 0)) / Math.max(1, w.total))
  const fx = frac * W
  const key = p.id
  // a resize redraws at once: a head drawn at another width would glide in from the wrong place
  const last = lastHead.get(key)
  // drawn again on its way to the same place (an agent's event, any redraw), the glide goes on from where it began,
  // its begin offset putting the pill where its time has got to
  const isGliding = last?.W === W && Math.abs(last.x - fx) <= 0.5 && now < last.at + PICTURE_STAND_MS
  const from = isGliding ? last.from : last?.W === W ? last.x : fx
  const at = isGliding ? last.at : now
  lastHead.set(key, { W, x: fx, from, at })

  const acc = hex(stateColor(p.state))
  const light = mix(acc, [255, 255, 255], 0.32)
  const ease = 'calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"'
  const glide = Math.abs(from - fx) > 0.5

  // the stream (STREAM_WAVE, FLICKER) over the fill, drawn as far as the fill reaches during a glide back. Its fades run
  // along the fill; the wave's mask is a pattern longer than that, so its slide never uncovers the end
  const span = Math.max(fx, from)
  const speed = p.state === 'running' ? STREAM_SPEED : STREAM_SPEED / 2
  const was = waveFrom.get(key)
  const wave =
    was?.start !== p.startedAt ? { start: p.startedAt, speed, at: p.startedAt, cols: 0 }
    : was.speed === speed ? was
    : // a whole column: the wave's delay (cols / speed) then stays on the flicker's 50 ms beat, one redraw rate for both
      { start: p.startedAt, speed, at: now, cols: Math.round(was.cols + (Math.max(0, now - was.at) / 1000) * was.speed) % STREAM_COLS }
  waveFrom.set(key, wave)
  const fadeMask = (id: string, stops: [number, number][]) =>
    `<linearGradient id="${id}g" x1="0" x2="${fx.toFixed(1)}" gradientUnits="userSpaceOnUse">${stops.map(([at, o]) => `<stop offset="${at}" stop-color="#fff" stop-opacity="${o}"/>`).join('')}</linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}g)"/></mask>`
  // without the twinkle the flicker goes as a whole: its dots get their resting opacity from its stylesheet alone, so
  // patterns left without it would draw every one of them bright
  const streamDefs =
    fadeMask('fade', STREAM_FADE) +
    (isTwinkling ? fadeMask('kfade', FLICKER_FADE) : '') +
    `<pattern id="dg" width="3" height="3" y="1" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${rgb(light)}"/></pattern>` +
    `<pattern id="wp" width="${STREAM_COLS * 3}" height="${H}" patternUnits="userSpaceOnUse">${STREAM_WAVE}</pattern>` +
    `<mask id="wave" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect class="wm" width="${(span + STREAM_COLS * 3 + 3).toFixed(1)}" height="${H}" fill="url(#wp)"/></mask>` +
    (isTwinkling ? FLICKER.map((f, k) => `<pattern id="fp${k}" width="${FLICKER_TILE * 3}" height="21" y="1" patternUnits="userSpaceOnUse"><path class="q${k}" fill="${rgb(light)}" d="${f.d}"/></pattern>`).join('') : '')
  const stream =
    `<g mask="url(#fade)"><g mask="url(#wave)"><rect width="${span.toFixed(1)}" height="21" fill="url(#dg)"/></g></g>` +
    (isTwinkling ? `<g mask="url(#kfade)">${FLICKER.map((_, k) => `<rect width="${span.toFixed(1)}" height="${H}" fill="url(#fp${k})"/>`).join('')}</g>` : '')

  const took = stepTimes(p)
  const markList: Mark<string>[] = []
  const zoneList: Mark<{ hit: string; tip: string; rule: string }>[] = []
  let k = 0
  p.stages.forEach((s, i) => {
    s.steps.forEach((_, j) => {
      if (k > 0) {
        const x = (k / w.total) * W
        const isStage = j === 0
        // a stage boundary is a short capsule, a step a dot; bright once passed. On a light page both would fade into
        // the track, so there the stylesheet darkens them by class
        const passed = x < fx - 1
        const fill = passed ? rgb(mix(light, [255, 255, 255], 0.45)) : '#A8A69E'
        const opacity = passed ? (isStage ? 0.95 : 0.8) : isStage ? 0.9 : 0.8
        const cls = passed ? 'mp' : 'ma'
        markList.push({
          x,
          isStage,
          item: isStage
            ? `<rect class="${cls}" x="${(x - 1.5).toFixed(1)}" y="${(H - 10) / 2}" width="3" height="10" rx="1.5" fill="${fill}" opacity="${opacity}"/>`
            : `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${H / 2}" r="1.4" fill="${fill}" opacity="${opacity}"/>`,
        })
        const before = p.stages[isStage ? i - 1 : i]
        const ended = isStage ? before?.steps[before.steps.length - 1] : s.steps[j - 1]
        // a mark the bar has reached names what ended there (and how long it took); one still ahead names what starts
        // there, so a name far up the track does not read as the stage the bar is in
        const label = k <= w.pos ? (isStage ? (before?.name ?? '') : (ended?.title ?? '')) : isStage ? s.name : (s.steps[j]?.title ?? '')
        const ms = isStage ? took.stages[i - 1] : took.steps.get(ended as PlanStep)
        const full = ms === undefined || k > w.pos ? label : `${label} · ${elapsed(ms)}`
        // a tip never runs past the track: a long title is shortened to fit
        const text = fitLabel(full, W - 16, 11, false)
        const tw = Math.min(W, labelWidth(text, 11, false) + 16)
        const tx = Math.max(0, Math.min(W - tw, x - tw / 2))
        zoneList.push({
          x,
          isStage,
          item: {
            hit: `<rect class="h${k}" x="${(x - 5).toFixed(1)}" width="10" height="${H}" fill="#000" fill-opacity="0"/>`,
            tip: `<g class="tp p${k}"><rect x="${tx.toFixed(1)}" y="2" width="${tw.toFixed(1)}" height="${H - 4}" rx="${(H - 4) / 2}" fill="#1F1E1D" fill-opacity=".94"/><text x="${(tx + tw / 2).toFixed(1)}" y="${H / 2 + 3.8}" text-anchor="middle" class="tt">${esc(text)}</text></g>`,
            rule: `.h${k}:hover~.p${k}`,
          },
        })
      }
      k++
    })
    void i
  })
  const marks = thin(markList, m => m.length, MARKS_BUDGET).join('')
  const zones = thin(zoneList, z => z.hit.length + z.tip.length + z.rule.length + 1, TIPS_BUDGET)
  const hits = zones.map(z => z.hit).join('')
  const tips = zones.map(z => z.tip).join('')
  const tipRules = zones.map(z => z.rule)

  // knob: a pill with stage and count, or a round dot with the stage number when narrow
  const isNarrow = W < NARROW
  const color = stateColor(p.state)
  const icon = ICON_PATH[p.state]
  const single = p.stages.length === 1
  const number = single ? w.step : w.stage + 1
  let knob = ''
  let timePill = ''
  let kw = H
  if (isNarrow) {
    const label = done ? '' : String(number)
    knob = `<circle cx="0" cy="${H / 2}" r="${H / 2}" fill="${color}"/>${
      done ? `<path d="${ICON_PATH.done}" transform="translate(-6 5) scale(.5)" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : `<text x="0" y="${H / 2 + 4.2}" text-anchor="middle" class="kt">${label}</text>`
    }`
  } else {
    const name = done ? (p.endedAt ? elapsed(p.endedAt - p.startedAt) : t().plainDone) : single ? (p.stages[0]?.name ?? t().plainTasks) : (p.stages[w.stage]?.name ?? '')
    // the pill carries the stage name and, past a thin line, the step at its place (the fill and the percent
    // already say how far along it is); folded agents stay folded, the pill does not count them
    const iconW = icon ? 16 : 0
    // at most about half a short track, and never so wide on a long one that it hides the marks around it
    const maxW = Math.max(80, Math.min(W * 0.55, 320))
    const room = maxW - (20 + iconW)
    // the step is set a size smaller and lighter than the stage, past a thin line
    const stageWidth = (text: string) => labelWidth(text)
    const stepWidth = (text: string) => labelWidth(text, 11, false)
    // the step gives way first: shortened, then dropped, before the stage name is
    const sepW = 15
    const stepRoom = room - stageWidth(name) - sepW
    // cockpit: an empty stage name leaves the whole pill to the step (the count stands right of the track)
    const step = name && stepRoom >= stepWidth('Abc…') ? fitLabel(pillStep(p, w), stepRoom, 11, false) : ''
    const shown = step ? name : fitLabel(name || pillStep(p, w), room)
    const shownW = stageWidth(shown) + (step ? sepW + stepWidth(step) : 0)
    // a running pill is wide enough for its clock too, so the hover swap does not change its size
    const textW = done ? shownW : Math.max(shownW, CLOCK_W)
    const contentW = iconW + textW
    kw = Math.round(20 + contentW)
    const left = -contentW / 2
    const mid = left + iconW + textW / 2
    knob = `<rect x="${-kw / 2}" y="0" width="${kw}" height="${H}" rx="${H / 2}" fill="${color}"/>`
    if (icon) knob += `<path d="${icon}" transform="translate(${left.toFixed(1)} 5) scale(.5)" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`
    // the separator is the mark the pill stands on: a stage's capsule at a stage's first step, a step's dot past it
    const sepMark = (x: number) =>
      w.step === 1
        ? `<rect x="${(x - 1).toFixed(1)}" y="${(H - 10) / 2}" width="2" height="10" rx="1" fill="${INK}" fill-opacity=".7"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${H / 2}" r="1.7" fill="${INK}" fill-opacity=".8"/>`
    if (step) {
      // the line is the anchor: the stage ends at it and the step starts after it, so whatever the font's real
      // widths, the two never run into each other
      const line = left + iconW + (textW - shownW) / 2 + stageWidth(shown)
      knob +=
        `<text x="${line.toFixed(1)}" y="${H / 2 + 4.2}" text-anchor="end" class="kt">${esc(shown)}</text>` +
        sepMark(line + 7.5) +
        `<text x="${(line + sepW).toFixed(1)}" y="${(H / 2 + 3.9).toFixed(1)}" class="kt kp">${esc(step)}</text>`
    } else knob += `<text x="${mid.toFixed(1)}" y="${H / 2 + 4.2}" text-anchor="middle" class="kt">${esc(shown)}</text>`
    // hovering the track lays a copy of the pill over it, the stage name giving way to the time the plan has run so far
    if (!done) {
      const face = `<rect x="${-kw / 2}" y="0" width="${kw}" height="${H}" rx="${H / 2}" fill="${color}"/>${
        icon ? `<path d="${icon}" transform="translate(${left.toFixed(1)} 5) scale(.5)" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''
      }`
      timePill = `${face}${liveClock(mid - CLOCK_W / 2, 3, p.startedAt, 'kc0', 'kt', true)}`
    }
  }
  const clampX = (x: number) => Math.max(kw / 2, Math.min(W - kw / 2, x))
  const kx = clampX(fx)
  const kFrom = clampX(from)

  // the step name is full white: at .9 it reads under AA (4.5:1) on the amber pill
  // the desktop rebuilds the picture whenever something near it redraws, which starts its animations over: every one
  // is set back by the time since the plan started ({{T}}, liveSource), so a rebuild picks the stream up where it was
  // instead of jumping back. The wave moves one column at a time (steps), as the slider's does, timed from its last
  // change of speed (waveFrom) and set on by the columns it had gone by then
  const motion = `svg{--f:-{{T:${Math.round(p.startedAt)}}}s;--w:-{{T:${Math.round(wave.at)}}}s}
.wm{animation:wm ${(STREAM_COLS / speed).toFixed(2)}s steps(${STREAM_COLS}) infinite;animation-delay:calc(var(--w) - ${(wave.cols / speed).toFixed(2)}s)}
@keyframes wm{to{transform:translateX(-${STREAM_COLS * 3}px)}}
${FLICKER_CSS}
`
  const style = `<style>
${isTwinkling ? motion : ''}.kt{font:500 12px 'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;fill:${INK}}
.kp{font-size:11px;font-weight:400}
@media (prefers-color-scheme:light){.mp{fill:${rgb(mix(acc, [0, 0, 0], 0.3))};opacity:1}.ma{fill:${SCHEMES.light.gutter};opacity:1}}
${STILL_CSS}@media (prefers-reduced-motion:reduce){.wm,[class^="q"]{animation:none}${STILL_REDUCED}}
</style>`
  const hoverStyle = `<style>
.tp{opacity:0;transition:opacity .12s;pointer-events:none}${tipRules.length ? `${tipRules.join(',')}{opacity:1}` : ''}
.tt{font:400 11px 'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;fill:#F0EEFC}
.kb,rect[class^="h"]{cursor:pointer}
</style>`
  // a glide drawn again later starts that much into its run, or past its end, standing where it went
  const begin = `begin="-{{T:${Math.round(at)}}}s"`
  const dur = `dur="${PICTURE_GLIDE_MS / 1000}s"`
  const glideFill = glide ? `<animate attributeName="width" from="${from.toFixed(1)}" to="${fx.toFixed(1)}" ${dur} ${begin} ${ease} fill="freeze"/>` : ''
  const glideKnob = glide ? `<animateTransform attributeName="transform" type="translate" from="${kFrom.toFixed(1)} 0" to="${kx.toFixed(1)} 0" ${dur} ${begin} ${ease} fill="freeze"/>` : ''

  // a gliding pill is written once and shown by reference in both copies, so its words are not in the picture twice
  const place = `transform="translate(${kx.toFixed(1)} 0)"`
  const pill = glideKnob
    ? `<defs><g id="kn">${knob}</g></defs><g class="mv" ${place}>${glideKnob}<use href="#kn"/></g><use class="sv" href="#kn" ${place}/>`
    : `<g ${place}>${knob}</g>`

  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  const base = `${open}${style}
<defs><clipPath id="pill"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath><clipPath id="fill">${withStill((anim, cls) => `<rect${classAttr(cls)} width="${fx.toFixed(1)}" height="${H}">${anim}</rect>`, glideFill)}</clipPath>
<linearGradient id="base" x1="0" x2="${fx.toFixed(1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${rgb(acc)}" stop-opacity=".05"/><stop offset="1" stop-color="${rgb(acc)}" stop-opacity=".33"/></linearGradient>
${streamDefs}</defs>
<g clip-path="url(#pill)"><rect width="${W}" height="${H}" fill="#808080" fill-opacity=".16"/>
<g clip-path="url(#fill)"><rect width="${fx.toFixed(1)}" height="${H}" fill="url(#base)"/>${stream}</g>${marks}</g>
${pill}</svg>`
  // the hover layer: checkpoint areas under a running pill's place, so the pill wins where they meet; tips on top
  const pillArea = timePill ? `<rect class="kb" x="${(kx - kw / 2).toFixed(1)}" y="0" width="${kw}" height="${H}" fill="#000" fill-opacity="0"/>` : ''
  const overlay = `${open}${SEE_THROUGH}${hoverStyle}${hits}${pillArea}${tips}</svg>`
  // the pill's copy with its clock, for the desktop to show over the track while the pointer is on it. Shown at any
  // moment, so it glides with the pill (the same glide and offset, and the same still copy for reduced motion) rather
  // than standing at the new place while the pill slides in under it
  const clockStyle = `<style>.kt{font:500 12px 'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;fill:${INK}}${CLOCK_CSS}
${STILL_CSS}@media (prefers-reduced-motion:reduce){${STILL_REDUCED}}</style>`
  const clockPill = glideKnob ? `<g class="mv" ${place}>${glideKnob}${timePill}</g><g class="sv" ${place}>${timePill}</g>` : `<g ${place}>${timePill}</g>`
  const clock = timePill ? `${open}${clockStyle}${clockPill}</svg>` : ''

  return { base, overlay, clock }
}

const AGENT_COLOR: Record<AgentRun['state'], string> = {
  running: STATE_COLOR.running,
  waiting: STATE_COLOR.needs_input,
  done: STATE_COLOR.done,
  error: STATE_COLOR.error,
}
const agentColor = (s: AgentRun['state']) => (s === 'running' ? stateColor('running') : AGENT_COLOR[s])

// strip text that reads at WCAG AA (4.5:1) on its tint, in a dark and a light scheme (issue #13). The desktop draws
// a strip as a picture over the app's background, which no event tells the plugin: the picture carries both sets,
// its media query picks one, and it lays its own opaque page under the tint, so a wrong guess still pairs the text
// with its backing. The terminal picks by isLight
type Scheme = { page: string; ink: string; dim: string; gutter: string; more: string; word: Record<AgentRun['state'], string> }
const SCHEMES: Record<'dark' | 'light', Scheme> = {
  dark: { page: '#1F1E1D', ink: '#F0EEFC', dim: '#A7A5AE', gutter: '#A8A69E', more: '#9A9993', word: { running: '#9C85D8', waiting: '#C0883B', done: '#4FA569', error: '#D67278' } },
  light: { page: '#FFFFFF', ink: '#222226', dim: '#5B5B5E', gutter: '#5F5E59', more: '#6F6D66', word: { running: '#6A4DB2', waiting: '#905300', done: '#157632', error: '#B13038' } },
}

// the desktop drops an Svg whose alt is empty, so every drawing says what it shows
function stripAlt(p: Plan, key: string): string {
  const a = (p.agents ?? []).find(x => x.id === key)
  return a ? `agent ${a.title}: ${a.state}, ${toolWord(a.tool)}` : 'more agents'
}

// the hover layer's words: what its tips show, the time the latest finished steps took, for a person who hears the
// band instead of pointing at its marks
function timesAlt(p: Plan): string {
  const last = [...stepTimes(p).steps].sort(([a], [b]) => (a.doneAt ?? 0) - (b.doneAt ?? 0)).slice(-3)
  if (last.length) return `${p.title}: ${last.map(([st, ms]) => `${st.title} took ${elapsed(ms)}`).join(', ')}`
  // steps sent finished, a bar closed by its state, the Agents bar's agents: finished, with no time to read
  const steps = p.stages.flatMap(s => s.steps)
  const ended = p.state === 'done' ? steps.length : steps.filter(st => isFinished(st.status)).length
  return `${p.title}: ${ended ? `${ended} of ${plural(steps.length, 'step')} finished, no times` : 'no step finished yet'}`
}

// an unfinished bar stops at 99%: 199 of 200 steps would otherwise round up to 100%
function percent(p: Plan, w: { pos: number; total: number }): number {
  if (p.state === 'done') return 100
  return Math.min(99, Math.round((Math.min(w.pos, w.total) / Math.max(1, w.total)) * 100))
}

const elapsed = (ms: number) => {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  return sec < 3600 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

// which strips show: all of a small batch; in a big one the unfinished first, the rest folded into one line
function visibleAgents(p: Plan, now: number, max: number): { shown: AgentRun[]; hidden: AgentRun[] } | null {
  const list = p.agents ?? []
  if (list.length === 0) return null
  const hasError = list.some(a => a.state === 'error')
  if (p.agentsDoneAt && now - p.agentsDoneAt > FOLD_MS && !hasError) return null
  if (list.length <= max) return { shown: list, hidden: [] }
  const keep = new Set(list.filter(a => a.state !== 'done').slice(0, max - 1).map(a => a.id))
  for (const a of [...list].reverse()) {
    if (keep.size >= max - 1) break
    keep.add(a.id)
  }
  return { shown: list.filter(a => keep.has(a.id)), hidden: list.filter(a => !keep.has(a.id)) }
}

// the strips drawn under a bar: none while the person has folded them away (the pill does not count them either)
const shownAgents = (p: Plan, now: number, max: number) => (p.isFolded ? null : visibleAgents(p, now, max))
// a bar gets a fold button while it has strips to show or fold; folded with none left (the batch over, or after a
// restart) it keeps the choice for its next agents but shows no button that would do nothing
const canFold = (p: Plan, now: number, max: number) => visibleAgents(p, now, max) !== null

// what each strip showed last time it was drawn, so a change morphs from the old status instead of jumping
const lastStrip = new Map<string, { tool: string; color: string; state: AgentRun['state'] }>()
const MORPH = '.2s'
const MORPH_MS = 200

// a strip's markup per agent, with what it showed: drawn once per change and reused while the agent stays the same.
// The desktop rebuilds a strip on every redraw of the band, so a morph begins where its time has got to ({{T:at}},
// as the glide does), and until says when it has run: the next draw after that is the strip standing, without it.
// Kept by the agent's id, as $.state hands back a fresh copy of every agent on each read
const drawnRows = new Map<string, { key: string; html: string; until: number }>()
// one tinted strip per agent: state colour, name, what it does now and for how long; not a progress bar
// Lucide "bot", drawn at 12 px in the gutter before each strip
const BOT = '<rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8M2 14h2M20 14h2M15 13v2M9 13v2"/>'

// claude-haiku-4-5-20251001 -> haiku 4.5, claude-sonnet-4-20250514 -> sonnet 4 (a date is no minor version); an
// alias stays as given
const modelName = (m: string) => {
  const r = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(m)
  return r ? `${r[1]} ${r[2]}${r[3] ? '.' + r[3] : ''}` : m
}

// an MCP tool's wire name is mcp__<server>__<tool>; the server part is the same on every call, so only the tool
// part says what the agent does
const toolWord = (tool: string) => /^mcp__.+?__(.+)$/.exec(tool)?.[1] ?? tool

// the agent's name, its model and effort in a dimmer parenthesis; the parenthesis starts where the title ends,
// since a title may hold a " (" of its own
const nameMarkup = (name: string, at: number) =>
  at > 0 && name.startsWith(' (', at) ? `${esc(name.slice(0, at))}<tspan class="st">${esc(name.slice(at))}</tspan>` : esc(name)

// one tinted strip per agent behind a bot icon and its number: the colour says how it went,
// the word says what it does now (only while it runs or waits), the time how long it took
type StripRow = { key: string; html: string; height: number; until: number }

// each strip is its own drawing, so a change to one agent redraws that strip alone, never the bar or the others
function stripsSvg(v: { shown: AgentRun[]; hidden: AgentRun[] }, all: AgentRun[], W: number, now: number): StripRow[] {
  const isNarrow = W < NARROW
  // the icon and the widest number, left of the strips: as wide as the numbers need, so the strips sit close to them
  const widest = Math.max(1, ...v.shown.map(a => String(all.indexOf(a) + 1).length), v.hidden.length > 0 ? String(v.hidden.length).length + 1 : 0)
  const GUTTER = Math.round(16 + widest * 6.4 + 7)
  const SW = W - GUTTER
  const R = STRIP_H / 2
  // a dot shows only where all of it lies inside the rounded strip, so none pokes past the round ends
  const isInside = (x: number, y: number) => {
    const cx = Math.max(GUTTER + R, Math.min(GUTTER + SW - R, x))
    return Math.hypot(x - cx, y - R) <= R - 0.5
  }
  const dotFits = (x: number, y: number) => isInside(x, y) && isInside(x + 2, y) && isInside(x, y + 2) && isInside(x + 2, y + 2)
  const rows: StripRow[] = []
  // the icon and number take their colour from the scheme's class (gu for an agent, gm for the more line)
  const gutter = (y: number, label: string, cls: string) =>
    `<g class="${cls}"><g transform="translate(1 ${y + 2}) scale(.5)" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${BOT}</g>` +
    `<text x="16" y="${y + 11.5}" class="sn sg">${label}</text></g>`
  // the scheme's page under a tint, so the tint and the text over it look the same on any background; drawn first, so
  // a "+N" wider than the gutter still shows whole
  const backing = (y: number) => `<rect class="sb" x="${GUTTER}" y="${y}" width="${SW}" height="${STRIP_H}" rx="${STRIP_H / 2}"/>`
  v.shown.forEach((a, i) => {
    // the first strip keeps a little room from the track above it
    const y = i === 0 ? 5 : STRIP_GAP
    const rowKey = `${W}|${y}|${GUTTER}|${all.indexOf(a)}|${JSON.stringify(a)}`
    const cachedRow = drawnRows.get(a.id)
    if (cachedRow?.key === rowKey && (cachedRow.until === 0 || now < cachedRow.until)) {
      rows.push({ key: a.id, html: cachedRow.html, height: y + STRIP_H, until: cachedRow.until })
      return
    }
    const c = agentColor(a.state)
    const indent = a.depth > 0 ? 10 : 0
    // the tool word takes at most a quarter of the row, as in the terminal, so a long one never runs over the name
    let word = a.state === 'running' || a.state === 'waiting' ? toolWord(a.tool) : ''
    if (textWidth(word, 6.2) > W * 0.25) {
      while (word.length > 1 && textWidth(word + '…', 6.2) > W * 0.25) word = dropLast(word)
      word = word.trimEnd() + '…'
    }
    const dots = new Map<string, string>()
    if (a.state === 'running') {
      for (let col = 0; col * 3 < SW; col++) {
        for (let r = 0; r < 4; r++) {
          const dy = Math.round((2.5 + r * 3.2) * 10) / 10
          if (hash(col + i * 41, r, 5) > 0.2 || !dotFits(GUTTER + col * 3, dy)) continue
          addDot(dots, `t${Math.floor(hash(col, r, 6) * 4)}`, GUTTER + col * 3, Math.round((y + dy) * 10) / 10)
        }
      }
    }
    const px = [...dots].map(([cls, d]) => `<path class="${cls}" fill="${c}" fill-opacity=".32" d="${d}"/>`).join('')
    // a status change: the old word blurs out while the new one blurs in, and the tint flows to the new colour
    const was = lastStrip.get(a.id)
    lastStrip.set(a.id, { tool: word, color: c, state: a.state })
    const isWordChanged = was !== undefined && was.tool !== word
    const begin = `-{{T:${Math.round(now)}}}s`
    const flow = was && was.color !== c ? `<animate attributeName="fill" from="${was.color}" to="${c}" dur="${MORPH}" begin="${begin}" fill="freeze"/>` : ''
    const delay = ` style="animation-delay:${begin}"`
    const until = isWordChanged || flow ? now + MORPH_MS : 0
    // the tool word sits at the right, just before the clock, so the name and its model get the rest of the row
    const toolEnd = W - 9 - CLOCK_W - 10
    const wordW = Math.max(word ? textWidth(word, 6.2) : 0, isWordChanged && was.tool ? textWidth(was.tool, 6.2) : 0)
    const nameX = GUTTER + 19 + indent
    const nameRoom = isNarrow ? SW - 24 - indent : toolEnd - (wordW > 0 ? wordW + 12 : 0) - nameX
    const spec = [a.model ? modelName(a.model) : '', a.effort ?? ''].filter(Boolean).join(' · ')
    const title = (a.depth > 0 ? '↳ ' : '') + a.title
    const full = title + (spec ? ` (${spec})` : '')
    const name = fitStrip(full, nameRoom)
    const time =
      a.endedAt === null
        ? liveClock(W - 9 - CLOCK_W, y, a.startedAt, 'sc', 'sn st')
        : `<text x="${W - 9}" y="${y + 11.5}" text-anchor="end" class="sn st">${elapsed(a.endedAt - a.startedAt)}</text>`
    const tool = isNarrow
      ? ''
      : (isWordChanged && was.tool ? `<text x="${toolEnd}" y="${y + 11.5}" text-anchor="end" class="sn mo w-${was.state}"${delay}>${esc(was.tool)}</text>` : '') +
        (word ? `<text x="${toolEnd}" y="${y + 11.5}" text-anchor="end" class="sn w-${a.state}${isWordChanged ? ' mi' : ''}"${isWordChanged ? delay : ''}>${esc(word)}</text>` : '') +
        time
    const html =
      backing(y) +
      gutter(y, String(all.indexOf(a) + 1), 'gu') +
      withStill((anim, cls) => `<rect${classAttr(cls)} x="${GUTTER}" y="${y}" width="${SW}" height="${STRIP_H}" rx="${STRIP_H / 2}" fill="${c}" fill-opacity=".15">${anim}</rect>`, flow) +
      px +
      withStill((anim, cls) => `<circle cx="${GUTTER + 10 + indent}" cy="${y + STRIP_H / 2}" r="3" fill="${c}"${classAttr([a.state === 'running' ? 'sd' : '', cls].filter(Boolean).join(' '))}>${anim}</circle>`, flow) +
      `<text x="${nameX}" y="${y + 11.5}" class="sn">${nameMarkup(name, title.length)}</text>` +
      tool
    drawnRows.set(a.id, { key: rowKey, html, until })
    rows.push({ key: a.id, html, height: y + STRIP_H, until })
  })
  if (v.hidden.length > 0) {
    const y = v.shown.length === 0 ? 5 : STRIP_GAP
    const doneCount = v.hidden.filter(a => a.state === 'done').length
    const more = t().moreAgents(v.hidden.length)
    const moreText = stripW(`${more} · ${t().doneCount(doneCount)}`) <= SW - 14 ? `${more} · ${t().doneCount(doneCount)}` : fitStrip(more, SW - 14)
    rows.push({
      key: '+',
      height: y + STRIP_H,
      until: 0,
      html:
        backing(y) +
        gutter(y, `+${v.hidden.length}`, 'gm') +
        `<rect x="${GUTTER}" y="${y}" width="${SW}" height="${STRIP_H}" rx="${STRIP_H / 2}" fill="#808080" fill-opacity=".14"/>` +
        `<text x="${GUTTER + 10}" y="${y + 11.5}" class="sn st">${esc(moreText)}</text>`,
    })
  }
  return rows
}

// a scheme's colours as the strip's classes; in the stylesheet the light set follows the dark one, so it wins where
// its query holds, and the dim and tool word follow the name they colour over
const schemeCss = (s: Scheme) =>
  `.sb{fill:${s.page}}.sn{fill:${s.ink}}.st{fill:${s.dim}}.gu{color:${s.gutter}}.gm{color:${s.more}}` +
  Object.entries(s.word).map(([state, c]) => `.w-${state}{fill:${c}}`).join('')
const STRIP_TWINKLE = `.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.45}}
`
const stripStyle = (twinkle: string) => `<style>.sn{font:400 11.5px 'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}.sg{font-weight:500;font-variant-numeric:tabular-nums}
${schemeCss(SCHEMES.dark)}@media (prefers-color-scheme:light){${schemeCss(SCHEMES.light)}}.gu .sn,.gm .sn{fill:currentColor}
.sd{animation:sp 1.1s ease-in-out infinite}@keyframes sp{50%{opacity:.3}}
.mi{animation:mi ${MORPH} ease-out both}@keyframes mi{from{opacity:0;filter:blur(3px)}}
.mo{animation:mo ${MORPH} ease-in both}@keyframes mo{to{opacity:0;filter:blur(3px)}}
${twinkle}${CLOCK_CSS}
${STILL_CSS}@media (prefers-reduced-motion:reduce){.sd,.mi,.mo,.t0,.t1,.t2,.t3{animation:none}.mo{opacity:0}${STILL_REDUCED}}</style>`
const STRIP_STYLE = stripStyle(STRIP_TWINKLE)
const STRIP_STILL = stripStyle('')

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const clusters = (s: string): string[] => (segmenter ? Array.from(segmenter.segment(s), x => x.segment) : [...s])

// ---------- cockpit glue ----------

export {
  STATE_GLYPH,
  STRIP_STYLE,
  TRACK_H,
  atHead,
  drawn,
  elapsed,
  liveSource,
  percent,
  stateColor,
  stripAlt,
  stripBudget,
  stripsSvg,
  textWidth,
  timesAlt,
  trackSvg,
  visibleAgents,
  FOLD_MS,
}
