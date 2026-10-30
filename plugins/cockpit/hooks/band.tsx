import type { EngineInterface, Elements, On } from 'claude-code'

import type { AgentRow, Live, Plan, Running, ToolPlan, Turn } from '../types'
import { cacheLeft } from './format'
import {
  barsSvg,
  barsText,
  barsWidth,
  CACHE_SOON,
  clockTime,
  duration,
  forecastFor,
  GAUGE,
  gaugeOf,
  GOOD_HIT,
  ICON_COLORS,
  iconSvg,
  MINUTE,
  SEP,
  short,
  SMALL_ICON,
  SPARK_HEIGHT,
  svgGauge,
  textGauge,
  TINTS,
  TONES,
  trendWord,
  WEATHER_ICON_SIZE,
  weatherSvg,
} from './pills'
import type { AgentRun, Plan as Bar, PlanState } from './progress'
import {
  atHead,
  drawn,
  elapsed,
  FOLD_MS,
  liveSource,
  percent,
  STATE_GLYPH,
  stateColor,
  STRIP_STYLE,
  stripAlt,
  stripBudget,
  stripsSvg,
  textWidth,
  timesAlt,
  TRACK_H,
  trackSvg,
  visibleAgents,
} from './progress'
import { t } from './i18n'
import { lastEnd, planState, stuckStep } from './plan'
import { bumpTick, getBars, getCrew, getHidden, getLive, getPlan, getRunning, getTick, getTurns, setHidden } from './state'

type Ui = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg' | 'Button'>

const PLAN_BAR = 'plan'
const AGENTS_BAR = 'agents'
const TOOL_BAR = 'tool:'
// The twig a bar hanging under the task list starts with, as the pane's cards hang off their group.
const HANG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M3 0V6q0 5 5 5H14" fill="none" stroke="#8b6fe0" stroke-opacity=".7" stroke-width="1.5"/></svg>'

// Which pills the person kept, from /config; fixed per load, as a change of options reloads the module.
let PILLS = { context: true, limit: true, cache: true, agents: true }
type BandOptions = { pillContext?: unknown; pillLimit?: unknown; pillCache?: unknown; pillAgents?: unknown }

export function registerBand(on: On, options: BandOptions = {}) {
  PILLS = { context: options.pillContext !== false, limit: options.pillLimit !== false, cache: options.pillCache !== false, agents: options.pillAgents !== false }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const l = await getLive($)
    if (!l) return next(e)
    await getTick($)
    const crew = await getCrew($)
    const turns = await getTurns($)
    const running = await getRunning($)
    const now = await $.clock.now()
    const plan = await getPlan($)
    const hidden = await getHidden($)
    const bars = [...barsOf(plan, crew, now), ...toolBarsOf(await getBars($), now)].filter(b => hidden[b.id] !== b.startedAt)
    // A finished task list folds away like the strips: draw once more when it is due.
    if (plan && plan.steps.length > 0 && planState(plan).done) settleBy($, lastEnd(plan) + FOLD_MS + 100, now)

    const ui = $.ui.resolve(e)
    const tree = e.surface === 'desktop' && 'Svg' in ui ? desktop($, ui, l, turns, running, crew, bars, now, e.props.bodyColumns) : terminal(ui, l, turns, running, crew, bars, now)
    // What the host and later mods draw here stays below the band. No gap: the host often draws an
    // empty element, and a gap would leave a blank row under the pills.
    const below = await next(e)
    const { Box } = ui
    return below ? (
      <Box flexDirection="column">
        {tree}
        {below}
      </Box>
    ) : (
      tree
    )
  })
}

// ---------- the bars' data ----------

const runOf = (a: AgentRow): AgentRun => ({
  id: a.id,
  title: a.description,
  state: a.state,
  tool: a.tool,
  startedAt: a.startedAt,
  endedAt: a.endedAt,
  depth: 0,
  ...(a.model ? { model: a.model } : {}),
  ...(a.effort ? { effort: a.effort } : {}),
})

// The step under way of all, counted from 1 as the pane counts its steps: 1/3, 2/3 …; done ones of all
// when none is under way (3/3 at the end).
function countOf(p: Bar) {
  const steps = p.stages.flatMap(s => s.steps)
  const at = steps.findIndex(s => s.status === 'active')
  return `${at >= 0 ? at + 1 : steps.filter(s => s.status === 'done').length}/${steps.length}`
}

// Filler a short label can do without.
const FILLER = new Set(
  'a an the and or of to for in on at with from into by is are be it its this that der die das den dem des ein eine einen einem einer und oder von zu zum zur für im in am an auf mit aus bei ist sind noch alle'.split(' '),
)

// The pill keeps a step at 10 characters: the filler goes, then whole words while they fit, the
// first word cut only when it alone is too long. The pane has the full title.
function pillLabel(title: string, max = 10) {
  const all = title.trim().split(/\s+/).filter(Boolean)
  const words = all.filter(w => !FILLER.has(w.toLowerCase()))
  const list = words.length > 0 ? words : all
  let s = list[0] ?? ''
  if (s.length > max) return `${s.slice(0, max - 1)}…`
  for (const w of list.slice(1)) {
    if (s.length + 1 + w.length > max) break
    s += ` ${w}`
  }
  return s
}

const isEnded = (a: AgentRow) => a.state === 'done' || a.state === 'error'

// Claude's task list as zycck's bar (one stage, its steps as dots), the session's agents under it.
// Without a task list the agents get a bar of their own, gone once their strips fold away.
function barsOf(plan: Plan | null, crew: AgentRow[], now: number): Bar[] {
  const agents = crew.map(runOf)
  const agentsDoneAt = crew.length > 0 && crew.every(isEnded) ? Math.max(...crew.map(a => a.endedAt ?? 0)) : null
  // A finished list leaves a few seconds after its last step; a new one brings the bar back.
  if (plan && plan.steps.length > 0 && !(planState(plan).done && now - lastEnd(plan) > FOLD_MS)) {
    const finished = plan.steps.filter(s => s.status === 'completed').length
    // Yellow while a step looks left hanging (see stuckStep).
    const state: PlanState = finished === plan.steps.length ? 'done' : stuckStep(plan, now) ? 'needs_input' : 'running'
    return [
      {
        id: PLAN_BAR,
        title: plan.title === 'Aufgaben' ? t().tasks : plan.title,
        kind: 'todo',
        // The pill names only the step it stands at; the count stands right of the track.
        stages: [
          {
            name: '',
            steps: plan.steps.map(s => ({
              title: pillLabel(s.title),
              status: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'active' : 'pending',
              substeps: [],
              ...(s.endedAt !== undefined ? { doneAt: s.endedAt } : {}),
            })),
          },
        ],
        state,
        note: null,
        startedAt: plan.startedAt,
        endedAt: state === 'done' ? Math.max(plan.startedAt, ...plan.steps.map(s => s.endedAt ?? 0)) : null,
        agents,
        agentsDoneAt,
      },
    ]
  }
  if (crew.length === 0 || (agentsDoneAt !== null && now - agentsDoneAt > FOLD_MS && !crew.some(a => a.state === 'error'))) return []
  return [
    {
      id: AGENTS_BAR,
      title: t().tabs.agents!,
      kind: 'todo',
      stages: [{ name: '', steps: crew.map(a => ({ title: a.description, status: isEnded(a) ? 'done' : 'active', substeps: [], ...(a.endedAt !== null ? { doneAt: a.endedAt } : {}) })) }],
      state: agentsDoneAt !== null ? 'done' : 'running',
      note: null,
      startedAt: Math.min(...crew.map(a => a.startedAt)),
      endedAt: agentsDoneAt,
      agents,
      agentsDoneAt,
    },
  ]
}

// The plans reported with the progress tool, under the task list: each step a stage of its own, so the
// track has a mark between them and the pill names the stage. A finished one folds away with the strips.
function toolBarsOf(list: ToolPlan[], now: number): Bar[] {
  return list.filter(p => !planState(p).done || now - lastEnd(p) <= FOLD_MS).map(p => toolBar(p))
}

// One progress plan as zycck's bar; the pane draws the same one in a task's card, under an id of its own.
export function toolBar(p: ToolPlan, id = TOOL_BAR + p.id): Bar {
  const done = planState(p).done
  // Steps of one stage in a row make one stage of the bar: its sub-steps are dots, the stage a mark.
  const stages: Bar['stages'] = []
  for (const s of p.steps) {
    const name = s.stage ?? s.title
    const step = {
      title: s.title === name ? '' : s.title,
      status: s.status === 'completed' ? ('done' as const) : s.status === 'in_progress' ? ('active' as const) : ('pending' as const),
      substeps: [],
      ...(s.endedAt !== undefined ? { doneAt: s.endedAt } : {}),
    }
    const last = stages[stages.length - 1]
    if (last && last.name === name) last.steps.push(step)
    else stages.push({ name, steps: [step] })
  }
  return {
    id,
    title: p.title,
    kind: 'plan',
    stages,
    state: done ? 'done' : 'running',
    note: null,
    startedAt: p.startedAt,
    endedAt: done ? lastEnd(p) : null,
  }
}

// The ✕ hides the bar in the band only: the pane keeps the list, the plan and the agents. The bar is
// known by its start, so a new list or batch under the same id shows again.
async function closeBar($: EngineInterface, p: Bar) {
  await setHidden($, hidden => ({ ...hidden, [p.id]: p.startedAt }))
}

// A glide or a strip's morph is drawn once more when it ends, standing.
let settleDue = 0
function settleBy($: EngineInterface, at: number, now: number) {
  if (at <= now || (settleDue > now && settleDue <= at)) return
  settleDue = at
  $.clock.after(at - now, () => {
    if (settleDue === at) settleDue = 0
    void bumpTick($).catch(() => {})
  })
}

// ---------- desktop ----------

type Pill = { key: string; tint: [string, string]; parts: JSX.Element[]; tip: string }

function desktop($: EngineInterface, ui: Ui, l: Live, turns: Turn[], running: Running, crew: AgentRow[], bars: Bar[], now: number, columns: number) {
  const { Box } = ui
  return (
    <Box flexDirection="column" rowGap={1}>
      {pillRow(ui, l, turns, running, crew, now)}
      {bars.length > 0 && barRows($, ui, bars, now, columns)}
    </Box>
  )
}

// The app shows no SVG tooltip: each pill carries a card, hidden until hovered.
function hoverCard({ Box, Text }: Ui, tip: string) {
  return (
    <Box position="absolute" bottom={1} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column" paddingX={1} paddingY={0} borderStyle="round" borderColor="subtle" backgroundColor="background">
      {tip.split('\n').map((line, i) => (line.startsWith('  ') ? <Text key={`t${i}`} dimColor>{line}</Text> : <Text key={`t${i}`}>{line}</Text>))}
    </Box>
  )
}

const deltasOf = (turns: Turn[]) => turns.slice(-5).map(t => Math.max(0, t.ctxDelta))

function pillRow(ui: Ui, l: Live, turns: Turn[], running: Running, crew: AgentRow[], now: number) {
  const { Box, Text, Svg } = ui
  const divider = (key: string) => <Text key={key} dimColor>{SEP}</Text>
  const pills: Pill[] = []

  // Context: weather, tokens, the last prompts' bars and the latest change.
  const f = forecastFor(l.ctxPercent)
  const deltas = deltasOf(turns)
  const ctx: JSX.Element[] = [
    <Svg key="icon" source={weatherSvg(f.id)} alt={`${t().weather[f.id]} · ${Math.round(l.ctxPercent)}%`} width={WEATHER_ICON_SIZE} height={WEATHER_ICON_SIZE} />,
    <Text key="tokens" bold>{short(l.ctxTokens)}</Text>,
  ]
  if (deltas.length >= 2) {
    ctx.push(divider('s'), <Svg key="spark" source={barsSvg(deltas, f.color)} alt={t().tokensOf(deltas.length)} width={barsWidth(deltas.length)} height={SPARK_HEIGHT} />)
    const trend = trendWord(turns[turns.length - 1]?.ctxDelta)
    if (trend) ctx.push(<Text key="d" dimColor>{trend}</Text>)
  }
  // No reading before the first reply: the pill waits for one.
  if (PILLS.context && l.ctxTokens > 0) pills.push({ key: 'context', tint: TINTS.context!, parts: ctx, tip: t().ofWindow(t().weather[f.id] ?? '', Math.round(l.ctxPercent), short(l.ctxWindow)) })

  // 5h: the gauge against the clock, then the time to the reset.
  const five = l.limits.find(lim => lim.kind === 'five_hour' && !(Date.parse(lim.resetsAt ?? '') <= now))
  if (PILLS.limit && five) {
    const g = gaugeOf(five, now)
    const color = ICON_COLORS.five_hour!
    const parts = [
      <Svg key="k" source={iconSvg('gauge', color)} alt={t().fiveHourLimit} width={16} height={16} />,
      <Text key="l">{g.label}</Text>,
      <Svg key="g" source={svgGauge(g)} alt={t().usedOf(g.label, g.value)} width={GAUGE.width} height={GAUGE.height} />,
      g.tone === 'alert' ? <Text key="v" bold color={TONES.alert.text}>{g.value}</Text> : <Text key="v" bold>{g.value}</Text>,
    ]
    if (g.when) parts.push(divider('s'), <Svg key="i" source={iconSvg('clock', color, SMALL_ICON)} alt="Reset" width={SMALL_ICON} height={SMALL_ICON} />, <Text key="d" dimColor>{g.when}</Text>)
    pills.push({ key: 'five_hour', tint: TINTS.five_hour!, parts, tip: g.resetAt ? t().resetAt(g.resetAt) : '' })
  }

  // Cache: the time it stays warm; a poor hit rate first, red once it lapsed.
  const left = cacheLeft(l, now)
  const hit = turns[turns.length - 1]?.cacheHit ?? 0
  const cache =
    left === null
      ? { tone: 'none', value: '—', detail: '', tip: '' }
      : left <= 0
        ? { tone: 'alert', value: t().expired, detail: '', tip: t().rewrites(short(l.ctxTokens)) }
        : {
            tone: left < CACHE_SOON ? 'fast' : 'calm',
            ...(hit >= GOOD_HIT ? { value: left < MINUTE ? '< 1 min' : duration(left), detail: '' } : { value: `${hit}%`, detail: left < MINUTE ? '< 1 min' : duration(left) }),
            tip: t().warmUntil(clockTime(now + left), hit),
          }
  const valueColor = cache.tone === 'alert' ? TONES.alert.text : cache.tone === 'fast' ? TONES.fast.text : undefined
  const cacheParts = [
    <Svg key="i" source={iconSvg('bolt', ICON_COLORS[cache.tone] ?? ICON_COLORS.calm!)} alt="Cache" width={16} height={16} />,
    cache.tone === 'none' ? <Text key="v" dimColor>{cache.value}</Text> : valueColor ? <Text key="v" bold color={valueColor}>{cache.value}</Text> : <Text key="v" bold>{cache.value}</Text>,
  ]
  if (cache.detail) cacheParts.push(divider('s'), <Text key="e" dimColor>{cache.detail}</Text>)
  if (PILLS.cache) pills.push({ key: 'cache', tint: TINTS[cache.tone] ?? TINTS.calm!, parts: cacheParts, tip: cache.tip })

  // Agents: how many the session ran, and how many run now.
  if (PILLS.agents && running.agents > 0) {
    const live = crew.filter(a => !isEnded(a))
    const value = live.length > 0 ? t().activeOf(live.length, running.agents) : String(running.agents)
    const tip = [t().agentsInSession(running.agents, live.length), ...live.map(a => `  ${a.description}: ${a.tool}`)].join('\n')
    pills.push({
      key: 'agents',
      tint: TINTS.agents!,
      parts: [<Svg key="i" source={iconSvg('agents', ICON_COLORS.agents!)} alt="Agents" width={16} height={16} />, <Text key="v" bold>{value}</Text>],
      tip,
    })
  }

  // Pills: tinted, outlined, side by side; paddingY takes back the border's padding.
  return (
    <Box key="pills" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={1} paddingX={1}>
      {pills.map(p => (
        <Box key={p.key} flexDirection="row" columnGap={1} alignItems="center" flexShrink={0} paddingX={1} paddingY={0} borderStyle="round" borderColor={p.tint[1]} backgroundColor={p.tint[0]}>
          {p.parts}
          {p.tip !== '' && hoverCard(ui, p.tip)}
        </Box>
      ))}
    </Box>
  )
}

// zycck's rows: state glyph, title, the drawn track with its hover layer, the agent strips, percent, ✕.
function barRows($: EngineInterface, { Box, Text, Svg, Button }: Ui, list: Bar[], now: number, columns: number) {
  const total = Math.max(320, (columns || 100) * 8)
  const titleWidth = Math.min(Math.round(total * 0.3), Math.max(...list.map(p => Math.round(textWidth(p.title, 6.4)))))
  // The app's band is narrower than its columns suggest: 60 px more slack keeps the title whole.
  const trackW = Math.max(120, Math.min(1400, total - titleWidth - 200))
  const divider = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="1"><rect width="${total}" height="1" fill="#808080" fill-opacity=".22"/></svg>`

  return (
    <Box key="bars" flexDirection="column" gap={1} paddingX={1}>
      {list.flatMap((p, i) => {
        const v = visibleAgents(p, now, stripBudget(list.length))
        const track = trackSvg(p, trackW, now)
        const rows = v ? stripsSvg(v, p.agents ?? [], trackW, now) : []
        for (const end of [drawn.get(p.id)?.glideUntil ?? 0, ...rows.map(r => r.until)]) if (end > 0) settleBy($, end + 5, now)
        const w = atHead(p)
        const pct = percent(p, w)
        const alt =
          p.state === 'done'
            ? `${p.title}: fertig${p.endedAt ? ` in ${elapsed(p.endedAt - p.startedAt)}` : ''}`
            : `${p.title}: Schritt ${w.step} von ${w.stageSize}, ${pct}%`
        // A progress tool bar belongs to the task list above it: no divider, a twig into it instead.
        const isUnder = p.id.startsWith(TOOL_BAR) && list.some(b => b.id === PLAN_BAR)
        const line = i > 0 && !isUnder ? [<Svg key={`div-${p.id}`} source={divider} alt="divider" width={total} height={1} />] : []
        return [
          ...line,
          <Box key={`bar-${p.id}`} flexDirection="row" alignItems={v ? 'flex-start' : 'center'} gap={1}>
            {isUnder && <Svg source={HANG} alt={t().branch} width={14} height={14} />}
            <Text color={stateColor(p.state)}>{STATE_GLYPH[p.state]}</Text>
            <Box flexShrink={0}>
              <Text>{p.title}</Text>
            </Box>
            <Box flexGrow={1} />
            <Box flexDirection="column" flexShrink={0}>
              <Box key={`track-${p.id}`}>
                <Svg source={liveSource(track.base, now)} alt={alt} width={trackW} height={TRACK_H} />
                {track.clock ? (
                  <Box position="absolute" top={0} left={0}>
                    <Box display="none" hover={{ display: 'flex' }}>
                      <Svg source={liveSource(track.clock, now)} alt={t().runsSince(p.title, elapsed(now - p.startedAt))} width={trackW} height={TRACK_H} />
                    </Box>
                  </Box>
                ) : null}
                <Box position="absolute" top={0} left={0}>
                  <Svg source={liveSource(track.overlay, now)} alt={timesAlt(p)} width={trackW} height={TRACK_H} isInteractive />
                </Box>
              </Box>
              {rows.map(r => (
                <Svg
                  key={`strip-${p.id}-${r.key}`}
                  source={liveSource(`<svg xmlns="http://www.w3.org/2000/svg" width="${trackW}" height="${r.height}">${STRIP_STYLE}${r.html}</svg>`, now)}
                  alt={stripAlt(p, r.key)}
                  width={trackW}
                  height={r.height}
                />
              ))}
            </Box>
            <Text dimColor>{countOf(p)}</Text>
            <Button key={`close-${p.id}`} plain dimColor label="✕" onPress={() => void closeBar($, p)} />
          </Box>,
        ]
      })}
    </Box>
  )
}

// ---------- terminal ----------

function terminal({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, l: Live, turns: Turn[], running: Running, crew: AgentRow[], bars: Bar[], now: number) {
  const sep = <Text dimColor> {SEP} </Text>
  const f = forecastFor(l.ctxPercent)
  const deltas = deltasOf(turns)
  const five = l.limits.find(lim => lim.kind === 'five_hour')
  const g = five ? gaugeOf(five, now) : null
  const left = cacheLeft(l, now)
  const live = crew.filter(a => !isEnded(a)).length

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap">
        {PILLS.context && <Text color={f.color}>{f.icon} </Text>}
        {PILLS.context && <Text bold>{short(l.ctxTokens)}</Text>}
        {PILLS.context && deltas.length >= 2 && <Text dimColor> {barsText(deltas)} {trendWord(turns[turns.length - 1]?.ctxDelta)}</Text>}
        {PILLS.limit && g && (
          <Text>
            {sep}5h <Text color={TONES[g.tone].text}>{textGauge(g)}</Text> <Text bold>{g.value}</Text>
            {g.when && <Text dimColor> · {g.when}</Text>}
          </Text>
        )}
        {PILLS.cache && left !== null && (
          <Text>
            {sep}cache {left <= 0 ? <Text color="red">{t().expired}</Text> : <Text bold>{duration(left)}</Text>}
          </Text>
        )}
        {PILLS.agents && running.agents > 0 && (
          <Text>
            {sep}
            {live > 0 ? t().activeOf(live, running.agents) : t().agentsCount(running.agents)}
          </Text>
        )}
      </Box>
      {bars.map(p => {
        const w = atHead(p)
        const pct = percent(p, w)
        const filled = Math.round(pct / 5)
        const step = p.state === 'done' ? t().doneWord : (p.stages[w.stage]?.steps[w.step - 1]?.title ?? '')
        return (
          <Box key={p.id} flexDirection="column">
            <Text>
              <Text color={stateColor(p.state)}>{STATE_GLYPH[p.state]}</Text> {p.title} <Text color={stateColor(p.state)}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'─'.repeat(20 - filled)}</Text> {step} <Text dimColor>{countOf(p)}</Text>
            </Text>
            {(visibleAgents(p, now, stripBudget(bars.length))?.shown ?? []).map((a, i) => (
              <Text key={a.id} dimColor={a.state === 'done'}>
                {'  '}
                {i + 1} {a.title}
                {a.state === 'running' || a.state === 'waiting' ? ` · ${a.tool}` : ''} · {elapsed((a.endedAt ?? now) - a.startedAt)}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
