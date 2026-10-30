import type { Elements, EngineInterface, On, RenderElement } from 'claude-code'

import type { Activity, AgentRow, Env, GitFile, Goal, Limit, Live, Plan, SessionEvent, Shell, Subchat, ToolPlan, Touch, Turn } from '../types'
import { bar, clock, elapsedOf, k, modelName, paceOf, span, toneColor } from './format'
import type { RingState } from './look'
import type { Role } from './clawd'
import { CLAWD, clawdSvg, roleOf } from './clawd'
import {
  BEAD,
  EXT_BADGE,
  FILE_TWIG,
  SQUARES,
  squaresSvg,
  durationSvg,
  extSvg,
  fileTwigSvg,
  folderSvg,
  C,
  PART_COLORS,
  STEP,
  TOGGLE_H,
  toggleSvg,
  beadsWidth,
  DIAL,
  TWIG,
  beadsSvg,
  coreSvg,
  dialSvg,
  headSvg,
  partsSvg,
  repoSvg,
  ringSvg,
  stepSvg,
  toned,
  twigSvg,
  leafHeight,
  weatherOf,
} from './look'
import { t } from './i18n'
import { toolBar } from './band'
import { elapsed, liveSource, TRACK_H, trackSvg } from './progress'
import {
  HISTORY,
  bumpTick,
  getActivity,
  getBars,
  PANE,
  getCrew,
  getEnv,
  getEvents,
  getFolded,
  getGoals,
  getLive,
  getPlan,
  getRepoOpen,
  getRoster,
  getRunning,
  getShells,
  getSubchats,
  getTab,
  getTally,
  getTick,
  getTouches,
  getTurns,
  setTab,
  toggleFold,
  toggleRepoOpen,
} from './state'

// Finished work stays on its branch this long, pale, then leaves the tree.
const KEEP_MS = 3 * 60e3
// The ring on a Session card: a little smaller than the big one, so a card of one line stays low.
const LEAF_RING = 20
// Rows the pane keeps at least: the rings sit 6 rows down and the context card can run 16 more.
const PANE_MIN_ROWS = 26
const LEAF_BLANK = `<svg xmlns="http://www.w3.org/2000/svg" width="${LEAF_RING}" height="1"/>`
// Session first; the others hold a place until their content is settled.
const TABS = ['session', 'agents', 'files'].map(key => ({
  key,
  get label() {
    return t().tabs[key]!
  },
}))
const GOAL = '#e0a030'
const roleName = (role: Role) => t().roles[role]!
const MOOD = {
  running: () => [t().running, C.agent] as const,
  waiting: () => [t().waitsForYou, C.warn] as const,
  done: () => [t().doneWord, C.ok] as const,
  error: () => [t().error, C.alert] as const,
}
const FILE_COLOR: Record<GitFile['status'], string> = { M: C.warn, A: C.ok, D: C.alert, R: C.shell, '?': C.ok }

const capital = (s: string) => (s ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s)
// The pane's title bar carries the model: "Opus 5.5 (Medium)".
const paneTitle = (_l: Live | null) => 'Cockpit'
const modelLine = (l: Live) => `${modelName(l.model)}${l.effort ? ` (${capital(l.effort)})` : ''}`

// Called from the one session.start hook in data.ts.
export async function startPane($: EngineInterface) {
  await $.command.register({ name: 'cockpit', description: t().openPane })
  void $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })
  // While a step, an agent or a command runs, the pane's clocks move every second; idle, data.ts's
  // 30-second tick is enough. Only while the pane is open.
  $.clock.every(1000, () => {
    void (async () => {
      const busy =
        (await getPlan($))?.steps.some(s => s.status === 'in_progress') ||
        (await getCrew($)).some(a => a.endedAt === null) ||
        (await getShells($)).some(s => s.endedAt === null)
      if (busy && (await $.ui.panes()).some(p => p.id === PANE)) await bumpTick($)
    })().catch(() => {})
  })
}

// A new model or effort renames the pane; opening an open id only retitles it, and a closed pane stays closed.
export async function retitlePane($: EngineInterface) {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })
}

// details: the lines a press on the card's title folds open, name and value.
type Leaf = { key: string; title: string; time: string; state: RingState; color: string; details: [string, string][]; bars?: ToolPlan[] }
type Group = { key: string; title: string; count: string; color: string; current?: string; leaves: Leaf[] }

const isRecent = (endedAt: number | null, now: number) => endedAt === null || now - endedAt < KEEP_MS

// 19:30 today, "Di 22:00" further out.
function resetText(l: Limit, now: number) {
  if (!l.resetsAt) return ''
  const at = Date.parse(l.resetsAt)
  return `↻ ${at - now > 20 * 3600e3 ? `${t().days[new Date(at).getDay()]} ` : ''}${clock(at)}`
}

// The warning under a dial, or none while all is calm.
// Past half the window a fresh chat is the cheaper way on; the ring marks that line.
const NEW_CHAT_AT = 50
function ctxWarning(percent: number) {
  return percent >= 90 ? { text: t().compactNow, color: C.alert } : percent >= 75 ? { text: t().fullSoon, color: C.warn } : percent >= NEW_CHAT_AT ? { text: t().newChat, color: C.warn } : null
}
function limitWarning(l: Limit, now: number) {
  const tone = paceOf(l, now)
  return tone === 'alert' ? { text: t().limitNear, color: C.alert } : tone === 'fast' ? { text: t().tooFast, color: C.warn } : null
}

// "⑂ feat/pane  ↑3 ↓1 gegen main  ● 5 geändert +120 −40"; the parts that are zero stay out.
function repoLine(env: Env) {
  const drift = [env.ahead > 0 && `↑${env.ahead}`, env.behind > 0 && `↓${env.behind}`].filter(Boolean).join(' ')
  const lines = [env.added > 0 && `+${env.added}`, env.removed > 0 && `−${env.removed}`].filter(Boolean).join(' ')
  return [env.branch && `⑂ ${env.branch}`, drift && env.branch !== env.base && `${drift} ${t().against(env.base)}`, env.changed > 0 && `● ${t().changedCount(env.changed)}`, lines]
    .filter(Boolean)
    .join('  ')
}

const tallyLine = (n: { turns: number; tools: number }) => `${t().turns(n.turns)} · ${t().tools(n.tools)}`

// What hangs off the session: the task list, the background work, the chats it started.
function groupsOf(plan: Plan | null, crew: AgentRow[], shells: Shell[], chats: Subchat[], goals: Goal[], bars: ToolPlan[], now: number): Group[] {
  const groups: Group[] = []
  // Only goals set out loud (/goal, or Claude's proposal once set); the engine never says one is reached.
  if (goals.length > 0) {
    const active = goals.filter(g => g.endedAt === null).length
    groups.push({
      key: 'goals',
      title: t().goals,
      count: active > 0 ? t().activeCount(active) : t().ended,
      color: GOAL,
      leaves: goals.map((g, i) => ({
        key: `g-${i}`,
        title: g.condition,
        time: '',
        state: g.endedAt === null ? 'running' : 'done',
        color: GOAL,
        details: [
          [t().by, g.by === 'you' ? t().byYou : t().byClaude],
          [t().started, clock(g.at)],
          [t().status, g.endedAt === null ? t().running : t().ended],
        ],
      })),
    })
  }
  if (plan && plan.steps.length > 0) {
    // As the band counts: the step under way, from 1; done ones when none is.
    const at = plan.steps.findIndex(s => s.status === 'in_progress')
    const place = at >= 0 ? at + 1 : plan.steps.filter(s => s.status === 'completed').length
    groups.push({
      key: 'plan',
      title: t().tasks,
      count: `${place}/${plan.steps.length}`,
      color: C.chat,
      current: plan.steps.find(s => s.status === 'in_progress')?.title,
      leaves: plan.steps.map((s, i) => ({
        key: `p-${s.id}`,
        title: s.title,
        time: s.startedAt && (s.endedAt ?? now) - s.startedAt >= 1000 ? elapsed((s.endedAt ?? now) - s.startedAt) : '',
        state: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'running' : 'pending',
        color: C.chat,
        details: [
          [t().status, s.status === 'completed' ? t().doneWord : s.status === 'in_progress' ? t().running : t().open],
          [t().step, `${i + 1}/${plan.steps.length}`],
          ...(s.startedAt ? [[t().started, clock(s.startedAt)] as [string, string]] : []),
          ...(s.startedAt ? [[s.endedAt ? t().duration : t().runsFor, elapsed((s.endedAt ?? now) - s.startedAt)] as [string, string]] : []),
        ],
        // The progress bars opened while this step ran.
        bars: bars.filter(b => s.startedAt !== undefined && b.startedAt >= s.startedAt && b.startedAt <= (s.endedAt ?? now)),
      })),
    })
  }
  const agents: Leaf[] = crew
    .filter(a => isRecent(a.endedAt, now))
    .map(a => ({
      key: `a-${a.id}`,
      title: a.description,
      time: elapsed((a.endedAt ?? now) - a.startedAt),
      state: a.state,
      color: C.agent,
      details: [
        [t().type, a.type],
        ...(a.task && a.task !== a.description ? [[t().task, a.task] as [string, string]] : []),
        [t().model, [a.model && modelName(a.model), a.effort].filter(Boolean).join(' · ') || '–'],
        [t().started, clock(a.startedAt)],
        [a.endedAt === null ? t().runsFor : t().duration, elapsed((a.endedAt ?? now) - a.startedAt)],
        [t().toolsWord, String(a.tools ?? 0)],
        [t().last, a.tool || '–'],
      ],
    }))
  const cmds: Leaf[] = shells
    .filter(s => isRecent(s.endedAt, now))
    .map(s => ({
      key: `s-${s.id}`,
      title: s.title,
      time: elapsed((s.endedAt ?? now) - s.startedAt),
      state: s.endedAt === null ? 'running' : 'done',
      color: C.shell,
      details: [
        [t().type, t().shell],
        [t().started, clock(s.startedAt)],
        [s.endedAt === null ? t().runsFor : t().duration, elapsed((s.endedAt ?? now) - s.startedAt)],
        [t().status, s.endedAt === null ? t().running : t().doneWord],
      ],
    }))
  const background = [...cmds, ...agents]
  if (background.length > 0) {
    // Finished of all, as the task list counts: 2/4.
    const finished = background.filter(l => l.state === 'done' || l.state === 'error').length
    groups.push({ key: 'bg', title: t().background, count: `${finished}/${background.length}`, color: C.shell, leaves: background })
  }
  if (chats.length > 0) {
    groups.push({
      key: 'chats',
      title: t().subchats,
      count: String(chats.length),
      color: C.seven_day,
      // A subchat shows its bubble, with dots pulsing while it is at work.
      leaves: chats.map((c, i) => ({ key: `c-${i}`, title: c.title, time: t().ago(span(now - c.at)), state: c.active ? 'talking' : 'chat', color: C.seven_day, details: [[t().type, t().ownChat], ...(c.active !== undefined ? [[t().status, c.active ? t().running : t().resting] as [string, string]] : []), ...(c.model ? [[t().model, modelName(c.model)] as [string, string]] : []), [t().started, clock(c.at)]] })),
    })
  }
  return groups
}

type DesktopUi = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg' | 'Button'>

// The changed files: from git when the session is in a repository, else the files the tools edited.
type FileRow = GitFile & { at: number | null }
function filesOf(env: Env | null, touches: Touch[], activity: Activity[]): FileRow[] {
  const edited = new Map(touches.filter(t => t.kind === 'edit').map(t => [t.path, t.at]))
  if (env?.repo) return env.files.map(f => ({ ...f, at: edited.get(f.path) ?? [...edited].find(([p]) => p.endsWith(f.path) || f.path.endsWith(p))?.[1] ?? null }))
  // Without git the lines come from the tools' own arguments, as the history counts them.
  const lines = (path: string, key: 'added' | 'removed') => activity.filter(a => a.path === path).reduce((n, a) => n + a[key], 0)
  return touches.filter(t => t.kind === 'edit').map(t => ({ path: t.path, status: 'M' as const, added: lines(t.path, 'added'), removed: lines(t.path, 'removed'), at: t.at }))
}
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

// Agents: running and waiting first, then the newest; Clawd dressed for the role, the state in the figure.
// One line of a details list: the name dim on the left, the value on the right.
function Fact({ Box, Text, name, value }: Pick<DesktopUi, 'Box' | 'Text'> & { name: string; value: string }) {
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text dimColor>{name}</Text>
      <Box flexGrow={1} />
      <Text wrap="truncate-start">{value}</Text>
    </Box>
  )
}

// git's "3 hours ago" as "3 h".
const ageOf = (age: string) =>
  age
    .replace(/ ago$/, '')
    .replace(/ seconds?/, ' s')
    .replace(/ minutes?/, ' min')
    .replace(/ hours?/, ' h')
    .replace(/ days?/, ' T')
    .replace(/ weeks?/, ' W')
    .replace(/ months?/, ' Mon')
    .replace(/ years?/, ' J')

function agentsTab($: EngineInterface, { Box, Text, Svg, Button }: DesktopUi, roster: AgentRow[], folded: string[], now: number) {
  if (roster.length === 0) return <Text dimColor>{t().noAgents}</Text>
  const live = (a: AgentRow) => a.state === 'running' || a.state === 'waiting'
  const list = [...roster].sort((a, b) => Number(live(b)) - Number(live(a)) || b.startedAt - a.startedAt)
  return (
    <Box flexDirection="column" rowGap={1}>
      {list.map(a => {
        const role = roleOf(a.type, a.description)
        const [word, color] = MOOD[a.state]()
        return (
          <Box key={a.id} flexDirection="row" columnGap={1} alignItems="flex-start" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
            <Svg source={clawdSvg(role, a.state)} alt={`${roleName(role)}, ${word}`} width={CLAWD.w * 0.7} height={CLAWD.h * 0.7} />
            {/* The text is the switch: a press folds the details open; the ring says the state. */}
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              {/* The name alone opens the details; the lines under it are text. */}
              <Button key={`agent-${a.id}`} plain onPress={() => void toggleFold($, `agent-${a.id}`)}>
                <Text bold>{a.description}</Text> <Text dimColor>{folded.includes(`agent-${a.id}`) ? '▴' : '▾'}</Text>
              </Button>
              {/* A button draws its label a cell in; the lines under it step in as far, so all start in line. */}
              <Box flexDirection="column" paddingLeft={1}>
                {a.task && a.task !== a.description && (
                  <Text dimColor wrap="truncate-end">
                    {a.task}
                  </Text>
                )}
                <Text dimColor wrap="truncate-end">
                  {[role === 'plain' ? a.type : roleName(role), a.model && modelName(a.model), elapsed((a.endedAt ?? now) - a.startedAt), t().tools(a.tools ?? 0)].filter(Boolean).join(' · ')}
                  {a.state !== 'done' && a.tool !== '' && <Text color={a.state === 'waiting' ? C.warn : a.state === 'error' ? C.alert : undefined}> · {a.tool}</Text>}
                </Text>
              </Box>
              {folded.includes(`agent-${a.id}`) && (
                <Box flexDirection="column" marginTop={1}>
                  <Fact Box={Box} Text={Text} name={t().type} value={a.type} />
                  <Fact Box={Box} Text={Text} name={t().model} value={[a.model && modelName(a.model), a.effort].filter(Boolean).join(' · ') || '–'} />
                  <Fact Box={Box} Text={Text} name={t().started} value={clock(a.startedAt)} />
                  <Fact Box={Box} Text={Text} name={a.endedAt === null ? t().runsFor : t().duration} value={elapsed((a.endedAt ?? now) - a.startedAt)} />
                  <Fact Box={Box} Text={Text} name={t().toolsWord} value={String(a.tools ?? 0)} />
                  <Fact Box={Box} Text={Text} name={t().last} value={a.tool || '–'} />
                </Box>
              )}
            </Box>
            <Svg source={ringSvg(a.state, color)} alt={word} width={18} height={18} />
          </Box>
        )
      })}
    </Box>
  )
}

// Dateien: a summary, then the changed files by folder, each on a twig like the session's tree, and what was only read, folded.
function filesTab($: EngineInterface, { Box, Text, Svg, Button }: DesktopUi, changed: FileRow[], touches: Touch[], folded: string[], now: number) {
  const reads = touches.filter(t => t.kind === 'read' && !changed.some(c => c.path === t.path || t.path.endsWith(c.path))).sort((a, b) => b.at - a.at)
  if (changed.length === 0 && reads.length === 0) return <Text dimColor>{t().noFiles}</Text>
  const isReadOpen = folded.includes('files-read-open')
  const sum = (list: FileRow[]) => [list.reduce((n, c) => n + c.added, 0), list.reduce((n, c) => n + c.removed, 0)] as const
  const [added, removed] = sum(changed)
  const dirs = [...new Set(changed.map(c => dirOf(c.path)))].sort()
  // The age, then one column at the right edge: the folder's sums over its files' squares.
  const figures = (body: JSX.Element | (JSX.Element | false)[], at: number | null | undefined) => [
    <Box key="t" width={7} justifyContent="flex-end">
      <Text dimColor>{at != null ? span(now - at) : ''}</Text>
    </Box>,
    <Box key="f" width={12} flexDirection="row" columnGap={1} justifyContent="flex-end" alignItems="center">
      {body}
    </Box>,
  ]
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="row" columnGap={1}>
        <Text bold>{t().changedFiles(changed.length)}</Text>
        {added > 0 && <Text color={C.ok}>+{added}</Text>}
        {removed > 0 && <Text color={C.alert}>−{removed}</Text>}
        <Box flexGrow={1} />
        {reads.length > 0 && <Text dimColor>{t().readCount(reads.length)}</Text>}
      </Box>
      {dirs.map(dir => {
        const list = changed.filter(c => dirOf(c.path) === dir)
        const [a, d] = sum(list)
        return (
          <Box key={dir || '.'} flexDirection="column">
            <Box flexDirection="row" columnGap={1} alignItems="center">
              <Svg source={folderSvg(C.shell)} alt={dir || '.'} width={16} height={14} />
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text bold wrap="truncate-start">
                  {dir === '' ? '.' : dir}
                </Text>
              </Box>
              {figures(
                [a > 0 && <Text key="a" color={C.ok}>+{a}</Text>, d > 0 && <Text key="d" color={C.alert}>−{d}</Text>],
                undefined,
              )}
            </Box>
            {list.map((c, i) => (
              <Box key={c.path} flexDirection="row" columnGap={1} alignItems="center">
                <Svg source={fileTwigSvg(i === list.length - 1, C.shell)} alt={t().branch} width={FILE_TWIG.w} height={FILE_TWIG.h} />
                <Svg source={extSvg(c.path)} alt={c.status} width={EXT_BADGE.w} height={EXT_BADGE.h} />
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text wrap="truncate-end">{nameOf(c.path)}</Text>
                </Box>
                {figures(
                  <Svg source={squaresSvg(c.added, c.removed)} alt={`+${c.added} −${c.removed}`} width={SQUARES.w} height={SQUARES.h} />,
                  c.at,
                )}
              </Box>
            ))}
          </Box>
        )
      })}
      {reads.length > 0 && (
        <Box flexDirection="column">
          <Button key="files-read" plain dimColor onPress={() => void toggleFold($, 'files-read-open')}>
            <Text dimColor>
              {isReadOpen ? '▾' : '▸'} {t().read} · {reads.map(r => nameOf(r.path)).join(', ')}
            </Text>
          </Button>
          {isReadOpen &&
            reads.map(r => (
              <Box key={r.path} flexDirection="row" columnGap={1} paddingLeft={2}>
                <Text dimColor wrap="truncate-end">
                  {nameOf(r.path)}
                </Text>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text dimColor wrap="truncate-start">
                    {dirOf(r.path)}
                  </Text>
                </Box>
                {r.count > 1 && <Text dimColor>{r.count}×</Text>}
              </Box>
            ))}
        </Box>
      )}
    </Box>
  )
}

// A prompt's opening for the history. The app hands some turns in itself, wrapped in tags: a command,
// a message from an agent, a notice from the background. Those read as words, not markup.
function promptLine(prompt: string | undefined) {
  if (!prompt) return t().turn
  const command = /<command-name>\/?([^<]+)<\/command-name>/.exec(prompt)
  if (command) return `/${command[1]!.trim()}`
  const folded = /^<(agents|notices) (\d+)>$/.exec(prompt)
  if (folded) return folded[1] === 'agents' ? t().fromAgents(Number(folded[2])) : t().fromBackgrounds(Number(folded[2]))
  if (prompt.startsWith('<agent-message')) return t().fromAgent
  if (prompt.startsWith('<task-notification')) return t().fromBackground
  if (prompt.startsWith('<')) return prompt.replace(/<[^>]*>/g, '').trim() || t().fromApp
  return prompt
}

// Turns the app hands in itself, one after the other, as one row: "3 messages from agents", their figures summed.
function foldAppTurns(turns: Turn[]): Turn[] {
  const kindOf = (t: Turn) => (t.prompt?.startsWith('<agent-message') ? 'agent' : t.prompt?.startsWith('<task-notification') ? 'notice' : null)
  const out: (Turn & { n?: number })[] = []
  for (const turn of turns) {
    const kind = kindOf(turn)
    const last = out[out.length - 1]
    if (kind && last && kindOf(last) === kind) {
      const n = (last.n ?? 1) + 1
      out[out.length - 1] = { ...last, at: turn.at, seconds: last.seconds + turn.seconds, tools: last.tools + turn.tools, ctxDelta: last.ctxDelta + turn.ctxDelta, cacheHit: turn.cacheHit, n }
    } else out.push({ ...turn })
  }
  return out.map(t => (t.n ? { ...t, prompt: kindOf(t) === 'agent' ? `<agents ${t.n}>` : `<notices ${t.n}>` } : t))
}

// Verlauf: one feed, newest first: turns with a bar as long as they took, what the tools did to files and who
// (you or an agent's Clawd), and the compactions and model changes in between; the last 40.
type FeedRow = { at: number; turn?: Turn; file?: Activity; event?: SessionEvent }
function historyTab({ Box, Text, Svg }: DesktopUi, turns: Turn[], events: SessionEvent[], activity: Activity[], roster: AgentRow[], limit = 40) {
  const rows: FeedRow[] = [...foldAppTurns(turns).map(turn => ({ at: turn.at, turn })), ...activity.map(file => ({ at: file.at, file })), ...events.map(event => ({ at: event.at, event }))]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
  if (rows.length === 0) return <Text dimColor>{t().noHistory}</Text>
  const longest = Math.max(1, ...rows.map(r => r.turn?.seconds ?? 0))
  const who = (id: string | undefined) => roster.find(a => a.id === id)
  const fileColor = (f: Activity) => (f.kind === 'read' ? '#6a6a6a' : f.kind === 'write' ? C.ok : C.warn)
  return (
    <Box flexDirection="column">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        const time = (
          <Box width={5} flexShrink={0}>
            <Text dimColor>{clock(row.at)}</Text>
          </Box>
        )
        if (row.turn) {
          const turn = row.turn
          const isApp = Boolean(turn.prompt?.startsWith('<'))
          return (
            <Box key={`t${row.at}-${i}`} flexDirection="row" columnGap={1}>
              {time}
              <Svg source={stepSvg(STEP.turn, isApp ? '#6a6a6a' : C.chat, false, isLast)} alt={t().branch} width={STEP.w} height={STEP.turn} />
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Box flexDirection="row" columnGap={1}>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text dimColor={isApp} wrap="truncate-end">
                      {promptLine(turn.prompt)}
                    </Text>
                  </Box>
                  <Box flexShrink={0}>
                    <Text dimColor>{elapsed(turn.seconds * 1000)}</Text>
                  </Box>
                </Box>
                {/* Second line: the bar as long as the turn took, its figures after it. */}
                <Box flexDirection="row" columnGap={1} alignItems="center">
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Svg source={durationSvg(turn.seconds / longest, isApp ? C.track : C.chat)} alt={elapsed(turn.seconds * 1000)} height={5} />
                  </Box>
                  <Box flexShrink={0}>
                    <Text dimColor>+{k(turn.ctxDelta)}</Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          )
        }
        if (row.file) {
          const f = row.file
          const agent = who(f.by)
          return (
            <Box key={`f${row.at}-${i}`} flexDirection="row" columnGap={1} alignItems="center">
              {time}
              <Svg source={stepSvg(STEP.file, fileColor(f), false, isLast)} alt={t().branch} width={STEP.w} height={STEP.file} />
              {agent ? <Svg source={clawdSvg(roleOf(agent.type, agent.description), 'idle')} alt={agent.description} width={22} height={19} /> : <Text dimColor>{t().you}</Text>}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end">
                  <Text bold>{nameOf(f.path)}</Text> <Text dimColor>{t().verbs[f.kind]}</Text>
                </Text>
              </Box>
              {f.added > 0 && <Text color={C.ok}>+{f.added}</Text>}
              {f.removed > 0 && <Text color={C.alert}>−{f.removed}</Text>}
            </Box>
          )
        }
        return (
          <Box key={`e${row.at}-${i}`} flexDirection="row" columnGap={1} alignItems="center">
            {time}
            <Svg source={stepSvg(STEP.file, C.warn, true, isLast)} alt={t().branch} width={STEP.w} height={STEP.file} />
            <Text bold color={C.warn}>
              {row.event?.kind === 'compact' ? t().compactEvent : t().modelEvent}
            </Text>
            <Text dimColor wrap="truncate-end">
              {row.event?.note ?? ''}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// What the person switched on in /config; fixed per load, as a change of options reloads the module.
let SHOW = { rings: true, repo: true, history: true, tabs: TABS }
type PaneOptions = { paneRings?: unknown; paneRepo?: unknown; tabAgents?: unknown; tabFiles?: unknown; tabHistory?: unknown }

// The whole history opens as a tab of its own, from the small card's "show all"; the card folds shut.
async function openHistory($: EngineInterface) {
  await toggleFold($, 'history-pop')
  await $.ui.open({ id: HISTORY, title: t().historyTitle, focus: true })
}

export function registerPane(on: On, options: PaneOptions = {}) {
  const off = { agents: options.tabAgents === false, files: options.tabFiles === false } as Record<string, boolean>
  SHOW = { rings: options.paneRings !== false, repo: options.paneRepo !== false, history: options.tabHistory !== false, tabs: TABS.filter(tab => !off[tab.key]) }

  on('command.run', { command: 'cockpit' }, async $ => {
    await $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })

    return { text: t().opened }
  })

  // The history dialog: the same timeline the tab had, with a ✕ of its own.
  on('ui.render', { component: 'Pane', requestId: HISTORY }, async ($, e) => {
    const turns = await getTurns($)
    const events = await getEvents($)
    if (e.surface === 'desktop') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" rowGap={1} paddingX={1}>
          <Box flexDirection="row">
            <Text bold>{t().historyTitle}</Text>
            <Box flexGrow={1} />
            <Button key="close-history" role="dismiss" plain dimColor label="✕" onPress={() => void $.ui.close({ id: HISTORY })} />
          </Box>
          {historyTab({ Box, Text, Svg, Button }, turns, events, await getActivity($), await getRoster($))}
        </Box>
      )
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {foldAppTurns(turns)
          .slice(-15)
          .map((turn, i) => (
            <Text key={`${turn.at}-${i}`}>
              <Text dimColor>{clock(turn.at)}</Text> {promptLine(turn.prompt)}{' '}
              <Text dimColor>
                · {elapsed(turn.seconds * 1000)} · +{k(turn.ctxDelta)}
              </Text>
            </Text>
          ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const l = await getLive($)
    // The turn under way counts at once, its tools as they run.
    const done = await getTally($)
    const running = await getRunning($)
    const tally = { ...done, turns: done.turns + (running.tools > 0 ? 1 : 0), tools: done.tools + running.tools }
    const folded = await getFolded($)
    // A tab switched off falls back to Session.
    const stored = await getTab($)
    const tab = SHOW.tabs.some(x => x.key === stored) ? stored : 'session'
    const env = await getEnv($)
    const plan = await getPlan($)
    const crew = await getCrew($)
    const roster = await getRoster($)
    const touches = await getTouches($)
    const turns = await getTurns($)
    const events = await getEvents($)
    const activity = await getActivity($)
    const changedFiles = filesOf(env, touches, activity)
    const repoOpen = await getRepoOpen($)
    const groups = groupsOf(plan, crew, await getShells($), await getSubchats($), await getGoals($), await getBars($), await $.clock.now())
    await getTick($)
    const now = await $.clock.now()
    const since = tally.since

    if (e.surface === 'desktop') {
      const { Box, Text, Svg, Button, Link } = $.ui.resolve(e)
      if (!l) return <Text dimColor>{t().waitingFirst}</Text>
      const badges: Record<string, { text: string; color: string } | null> = {
        // As the band's pill: how many the session ran, not only those running now.
        agents: running.agents > 0 ? { text: String(running.agents), color: C.agent } : null,
        files: changedFiles.length > 0 ? { text: String(changedFiles.length), color: C.shell } : null,
      }
      // A toggle: the track and the open tab's pill are one drawing, the names lie over it.
      const tabs = (
        <Box flexDirection="column">
          <Svg
            source={toggleSvg(
              Math.max(
                0,
                SHOW.tabs.findIndex(x => x.key === tab),
              ),
              SHOW.tabs.length,
            )}
            alt="Tabs"
            height={TOGGLE_H}
          />
          <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center">
            {SHOW.tabs.map(t => {
              const badge = badges[t.key] ?? null
              return (
                <Box key={t.key} flexGrow={1} width="25%" flexDirection="row" justifyContent="center" alignItems="flex-start">
                  {t.key === tab ? (
                    <Button key={`tab-${t.key}`} plain label={t.label} onPress={() => void setTab($, t.key)} />
                  ) : (
                    <Button key={`tab-${t.key}`} plain dimColor label={t.label} onPress={() => void setTab($, t.key)} />
                  )}
                  {/* The count, small and set to the top of the name's row, like an exponent. */}
                  {badge && (
                    <Text size="caption" weight="bold" color={badge.color}>
                      {badge.text}
                    </Text>
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      )
      const five = l.limits.find(lim => lim.kind === 'five_hour')
      const seven = l.limits.find(lim => lim.kind === 'seven_day')
      const w = weatherOf(l.ctxPercent)
      type Dial = {
        key: string
        percent: number
        color: string
        value: string
        label: string
        sub: string
        pace: number | null
        warning: { text: string; color: string } | null
        facts: [string, string][]
        parts?: { name: string; tokens: number }[]
      }
      // Hovered, a dial's tile lights and a card with its details opens under it; the surface draws both, no hook
      // runs. Tile and card share a hover scope, so only the tile wakes the card.
      // A card a little wider than a third, centered on its dial and pushed back inside the pane at its edges.
      const inner = Math.max(30, e.props.bodyColumns - 2)
      // A progress bar in a task's card, at the band's 8 px a column, less the twig, the card's edges and the indent.
      const barW = Math.max(160, (e.props.bodyColumns - 12) * 8)
      const cardW = Math.min(40, inner)
      const cardLeft = (i: number) => {
        const third = inner / dials.length
        const centered = i * third + third / 2 - cardW / 2
        return Math.round(Math.max(0, Math.min(inner - cardW, centered)) - i * third)
      }
      const dial = (d: Dial, i: number) => (
        <Box key={d.key} flexDirection="column" alignItems="center" width="33%">
          <Box flexDirection="column" alignItems="center" paddingX={2} borderStyle="round" borderColor={C.clear} hover={{ scope: `dial-${d.key}`, backgroundColor: C.card, borderColor: C.card }}>
            <Svg source={dialSvg(d.percent, d.color, d.value, d.label, d.pace, d.warning?.color)} alt={`${d.label} ${d.value}`} width={DIAL.w} height={DIAL.h} />
            {d.sub !== '' && <Text dimColor>{d.sub}</Text>}
          </Box>
          {/* Under the tile, centered on its dial, one cell past each side. */}
          <Box
            position="absolute"
            top={6}
            left={cardLeft(i)}
            width={cardW}
            display="none"
            hover={{ scope: `dial-${d.key}`, display: 'flex' }}
            flexDirection="column"
            paddingX={1}
            backgroundColor={C.popup}
            borderStyle="round"
            borderColor={C.line}
          >
            <Text bold>{d.label}</Text>
            {d.warning && <Text color={d.warning.color}>{d.warning.text}</Text>}
            {d.facts.map(([name, fact]) => (
              <Box key={name} flexDirection="row">
                <Text dimColor>{name}</Text>
                <Box flexGrow={1} />
                <Text>{fact}</Text>
              </Box>
            ))}
            {d.parts && d.parts.length > 0 && <Svg source={partsSvg(d.parts)} alt={t().parts} height={8} />}
            {d.parts?.map((part, i) => (
              <Box key={part.name} flexDirection="row">
                <Text color={PART_COLORS[i % PART_COLORS.length]}>■ </Text>
                <Text dimColor wrap="truncate-end">
                  {part.name}
                </Text>
                <Box flexGrow={1} />
                <Text>{k(part.tokens)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
      const limitDial = (lim: Limit, label: string, calm: string): Dial => {
        const gone = elapsedOf(lim, now)
        const at = lim.resetsAt ? Date.parse(lim.resetsAt) : null
        return {
          key: lim.kind,
          percent: lim.percentUsed,
          color: toned(paceOf(lim, now), calm),
          value: `${Math.round(lim.percentUsed)}%`,
          label,
          sub: resetText(lim, now),
          pace: gone,
          warning: limitWarning(lim, now),
          facts: [
            [t().used, `${Math.round(lim.percentUsed)} %`],
            ...(gone !== null ? [[lim.kind === 'five_hour' ? t().windowGone : t().weekGone, `${Math.round(gone)} %`] as [string, string]] : []),
            [t().tempo, t().pace[paceOf(lim, now)]!],
            ...(at !== null ? [[t().reset, t().inTime(resetText(lim, now).replace('↻ ', ''), span(at - now))] as [string, string]] : []),
          ],
        }
      }

      // The repo card's details: the last commits, whether they are pushed, what is not committed.
      const repoDetails = (env: Env) => (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{t().lastCommits}</Text>
          {env.commits.map(c => (
            <Box key={c.hash} flexDirection="row" columnGap={1}>
              <Text dimColor mono>
                {c.hash}
              </Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end">{c.subject}</Text>
              </Box>
              <Box flexShrink={0} flexDirection="row" columnGap={1}>
                {c.added > 0 && <Text color={C.ok}>+{c.added}</Text>}
                {c.removed > 0 && <Text color={C.alert}>−{c.removed}</Text>}
                <Text dimColor>{ageOf(c.age)}</Text>
              </Box>
            </Box>
          ))}
          {env.unpushed === null ? <Text dimColor>{t().noUpstream}</Text> : env.unpushed === 0 ? <Text color={C.ok}>{t().pushed}</Text> : <Text color={C.warn}>{t().unpushed(env.unpushed)}</Text>}
          {env.files.length > 0 && <Text dimColor>{t().uncommitted}</Text>}
          {env.files.slice(0, 6).map(file => (
            <Box key={file.path} flexDirection="row" columnGap={1}>
              <Text color={FILE_COLOR[file.status]}>{file.status}</Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-start">{file.path}</Text>
              </Box>
              {file.added > 0 && <Text color={C.ok}>+{file.added}</Text>}
              {file.removed > 0 && <Text color={C.alert}>−{file.removed}</Text>}
            </Box>
          ))}
          {env.files.length > 6 && <Text dimColor>{t().more(env.files.length - 6)}</Text>}
          {env.isGithub && (
            <Box flexDirection="row" columnGap={2} marginTop={1}>
              <Link href={`https://github.com/${env.repo}/tree/${encodeURIComponent(env.branch || env.base)}`}>{t().openOnGithub}</Link>
              {env.branch !== '' && env.branch !== env.base && (
                <Link href={`https://github.com/${env.repo}/compare/${encodeURIComponent(env.base)}...${encodeURIComponent(env.branch)}`}>{t().compare(env.base)}</Link>
              )}
            </Box>
          )}
        </Box>
      )

      const dials: Dial[] = [
        {
          key: 'ctx',
          percent: l.ctxPercent,
          color: l.ctxPercent >= 90 ? C.alert : l.ctxPercent >= 75 ? C.warn : C.context,
          value: l.ctxTokens > 0 ? k(l.ctxTokens) : '–',
          label: 'Context',
          sub: l.ctxTokens > 0 ? `${w.glyph} ${t().weather[w.icon]}` : t().measuring,
          // The tick on the context ring: where a new chat is advised.
          pace: NEW_CHAT_AT,
          warning: ctxWarning(l.ctxPercent),
          facts: [
            [t().filled, t().ofTotal(k(l.ctxTokens), k(l.ctxWindow))],
            [t().share, `${Math.round(l.ctxPercent)} %`],
            [t().free, k(Math.max(0, l.ctxWindow - l.ctxTokens))],
            [t().weatherWord, `${w.glyph} ${t().weather[w.icon]}`],
            [t().newChatAt, t().fromPercent(NEW_CHAT_AT)],
          ],
          ...(l.ctxParts ? { parts: l.ctxParts.slice(0, 6) } : {}),
        },
        ...(five ? [limitDial(five, '5h', C.five_hour)] : []),
        ...(seven ? [limitDial(seven, '7d', C.seven_day)] : []),
      ]

      return (
        // Tall enough for a ring's hover card even when everything below is folded shut.
        <Box flexDirection="column" rowGap={1} paddingX={1} minHeight={PANE_MIN_ROWS}>
          {/* Shown top down as rings, repo, tabs, but laid out the other way round: the tabs' names lie on a layer
              of their own, which would cover anything before it, so the rings and their cards come last. */}
          <Box flexDirection="column-reverse" rowGap={1}>
            {SHOW.tabs.length > 1 && tabs}

            {SHOW.repo && env?.repo && (
              <Box flexDirection="row" columnGap={1} alignItems="flex-start" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
                <Svg source={repoSvg(env.isGithub, '#ececec')} alt={env.isGithub ? 'GitHub' : 'Git'} width={20} height={20} />
                {/* A button holds only text, so the card's two lines are the switch, not its logo or margins. */}
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                  <Button key="repo-name" plain onPress={() => void toggleRepoOpen($)}>
                    <Text bold>{env.repo.split('/').pop()}</Text> {env.repo.includes('/') && <Text dimColor>{env.repo.split('/')[0]}</Text>} <Text dimColor>{repoOpen ? '▴' : '▾'}</Text>
                  </Button>
                  {/* Ahead green, behind amber; lines added green, removed red. */}
                  <Button key="repo-line" plain onPress={() => void toggleRepoOpen($)}>
                    {env.branch !== '' && <Text dimColor>⑂ {env.branch} </Text>}
                    {env.branch !== env.base && env.ahead > 0 && <Text color={C.ok}>↑{env.ahead} </Text>}
                    {env.branch !== env.base && env.behind > 0 && <Text color={C.warn}>↓{env.behind} </Text>}
                    {env.branch !== env.base && env.ahead + env.behind > 0 && <Text dimColor>{t().against(env.base)} </Text>}
                    {env.changed > 0 && <Text dimColor>· ● {t().changedCount(env.changed)} </Text>}
                    {env.added > 0 && <Text color={C.ok}>+{env.added} </Text>}
                    {env.removed > 0 && <Text color={C.alert}>−{env.removed}</Text>}
                  </Button>
                  {repoOpen && repoDetails(env)}
                </Box>
              </Box>
            )}

            {SHOW.rings && <Box flexDirection="row">{dials.map(dial)}</Box>}
          </Box>

          {tab === 'agents' && agentsTab($, { Box, Text, Svg, Button }, roster, folded, now)}
          {tab === 'files' && filesTab($, { Box, Text, Svg, Button }, changedFiles, touches, folded, now)}
          {tab === 'session' && (
            <Box flexDirection="column" rowGap={1}>
              <Box flexDirection="row" columnGap={1} alignItems="center">
                <Svg source={coreSvg('#ececec')} alt={t().thisSession} width={18} height={18} />
                <Text bold>{t().thisSession}</Text>
                <Text dimColor>{modelLine(l)}</Text>
                <Box flexGrow={1} />
                <Text dimColor>
                  {tallyLine(tally)}
                  {since !== null && ` · ${elapsed(now - since)}`}
                </Text>
                {SHOW.history && <Button key="open-history" plain dimColor label="🕘" onPress={() => void toggleFold($, 'history-pop')} />}
              </Box>
              {/* The 🕘 folds a small card open under the line, in the flow, so nothing cuts it off: the newest of the same feed. */}
              {SHOW.history && folded.includes('history-pop') && (
                <Box flexDirection="column" paddingX={1} backgroundColor={C.popup} borderStyle="round" borderColor={C.line}>
                  <Text bold>{t().historyTitle}</Text>
                  {historyTab({ Box, Text, Svg, Button }, turns, events, activity, roster, 6)}
                  <Button key="history-all" plain onPress={() => void openHistory($)}>
                    <Text color={C.chat}>{t().showAll}</Text>
                  </Button>
                </Box>
              )}
              {groups.length === 0 && <Text dimColor>{t().nothingAside}</Text>}
              {/* Each group runs on a line of its own: a dot at its name, a twig into each card. */}
              {groups.map(g => (
                <Box key={g.key} flexDirection="column">
                  <Box flexDirection="row" columnGap={1} alignItems="center">
                    <Svg source={headSvg(g.color, !folded.includes(g.key))} alt={g.title} width={TWIG.w} height={TWIG.head} />
                    <Button plain dimColor label={`${folded.includes(g.key) ? '▸' : '▾'} ${g.title}`} onPress={() => void toggleFold($, g.key)} />
                    {folded.includes(g.key) && <Svg source={beadsSvg(g.leaves)} alt={g.current ?? g.count} width={beadsWidth(g.leaves.length)} height={BEAD} />}
                    <Box flexGrow={1} />
                    <Text dimColor>{g.count}</Text>
                  </Box>
                  {!folded.includes(g.key) &&
                    g.leaves.map((leaf, i) => {
                      // The title is the switch: a press folds the card's details open under it.
                      const isOpen = folded.includes(`leaf-${leaf.key}`)
                      const linked = isOpen ? (leaf.bars ?? []) : []
                      // A drawn bar takes three lines: a gap, its name and count, then the track.
                      const rowH = leafHeight(1 + (isOpen ? leaf.details.length : 0) + linked.length * 3)
                      return (
                        <Box key={leaf.key} flexDirection="row" alignItems="center">
                          <Svg source={twigSvg(i === g.leaves.length - 1, g.color, rowH)} alt={t().branch} width={TWIG.w} height={rowH} />
                          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
                            {/* Ring, title and time on one centred line; the details under it start where the title does. */}
                            <Box flexDirection="row" columnGap={1} alignItems="center">
                              <Svg source={ringSvg(leaf.state, leaf.color)} alt={leaf.state} width={LEAF_RING} height={LEAF_RING} />
                              <Box flexShrink={1} minWidth={0}>
                                <Button key={`leaf-${leaf.key}`} plain onPress={() => void toggleFold($, `leaf-${leaf.key}`)}>
                                  <Text dimColor={leaf.state === 'done' || leaf.state === 'pending'} wrap="truncate-end">
                                    {leaf.title}
                                  </Text>
                                </Button>
                              </Box>
                              <Box flexGrow={1} />
                              <Text dimColor>{leaf.time}</Text>
                            </Box>
                            {isOpen && (
                              // A blank as wide as the ring, the same gap, and the cell the button draws its label in.
                              <Box flexDirection="row" columnGap={1}>
                                <Svg source={LEAF_BLANK} alt="" width={LEAF_RING} height={1} />
                                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingLeft={1}>
                                  {leaf.details.map(([name, value], j) => (
                                    <Fact key={`${name}-${j}`} Box={Box} Text={Text} name={name} value={value} />
                                  ))}
                                  {/* Each progress bar of the step drawn as the band draws it; a finished one stays, full. */}
                                  {linked.map(b => {
                                    const bar = toolBar(b, `pane:${b.id}`)
                                    const at = b.steps.findIndex(s => s.status === 'in_progress')
                                    const place = at >= 0 ? at + 1 : b.steps.filter(s => s.status === 'completed').length
                                    return (
                                      <Box key={b.id} flexDirection="column" marginTop={1}>
                                        <Box flexDirection="row">
                                          <Text>{b.title}</Text>
                                          <Box flexGrow={1} />
                                          <Text dimColor>
                                            {place}/{b.steps.length}
                                          </Text>
                                        </Box>
                                        <Svg source={liveSource(trackSvg(bar, barW, now).base, now)} alt={b.title} width={barW} height={TRACK_H} />
                                      </Box>
                                    )
                                  })}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      )
                    })}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // Terminal: the same parts as text.
    const { Box, Text } = $.ui.resolve(e)
    if (!l) return <Text dimColor>{t().waitingFirst}</Text>
    const w = Math.max(10, Math.min(24, e.props.bodyColumns - 24))
    const leaves = groups.flatMap(g => g.leaves.map(leaf => ({ g, leaf })))

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text bold>{modelName(l.model)}</Text>
            {l.effort && <Text dimColor> ({capital(l.effort)})</Text>}
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text color={toneColor(l.ctxPercent >= 90 ? 'alert' : l.ctxPercent >= 75 ? 'fast' : 'calm')}>
            {'Context'.padEnd(8)}
            {bar(l.ctxPercent, w)} {k(l.ctxTokens)} <Text dimColor>{ctxWarning(l.ctxPercent)?.text ?? ''}</Text>
          </Text>
          {l.limits
            .filter(lim => lim.kind === 'five_hour' || lim.kind === 'seven_day')
            .map(lim => (
              <Text key={lim.kind} color={toneColor(paceOf(lim, now))}>
                {(lim.kind === 'five_hour' ? '5h' : '7d').padEnd(8)}
                {bar(lim.percentUsed, w)} {Math.round(lim.percentUsed)}% <Text dimColor>{resetText(lim, now)}</Text> {limitWarning(lim, now)?.text ?? ''}
              </Text>
            ))}
        </Box>
        <Box flexDirection="column">
          <Text>
            <Text bold>● {t().thisSession}</Text>
            <Text dimColor> · {tallyLine(tally)}</Text>
          </Text>
          {env?.repo && (
            <Text dimColor>
              {env.repo} {repoLine(env)}
            </Text>
          )}
          {leaves.map(({ g, leaf }, i) => (
            <Text key={leaf.key} dimColor={leaf.state === 'done' || leaf.state === 'pending'}>
              {i === leaves.length - 1 ? '└─ ' : '├─ '}
              {leaf.state === 'done' ? '✓' : leaf.state === 'error' ? '✕' : leaf.state === 'chat' ? '◇' : leaf.state === 'talking' ? '◈' : leaf.state === 'pending' ? '○' : '●'} {leaf.title}{' '}
              <Text dimColor>
                · {g.title} · {leaf.time}
              </Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
