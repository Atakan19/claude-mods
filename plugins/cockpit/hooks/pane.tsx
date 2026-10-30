import type { Elements, EngineInterface, On } from 'claude-code'

import type { AgentRow, Env, GitFile, Goal, Limit, Live, Plan, SessionEvent, Shell, Subchat, Touch, Turn } from '../types'
import { bar, clock, elapsedOf, k, modelName, paceOf, span, toneColor } from './format'
import type { RingState } from './look'
import type { Role } from './clawd'
import { CLAWD, clawdSvg, roleOf } from './clawd'
import {
  BEAD,
  C,
  PART_COLORS,
  STEP,
  TOGGLE_H,
  toggleSvg,
  beadsWidth,
  DIAL,
  RING,
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
  weatherOf,
} from './look'
import { elapsed } from './progress'
import {
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
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
// Session first; the others hold a place until their content is settled.
const TABS = [
  { key: 'session', label: 'Session' },
  { key: 'agents', label: 'Agents' },
  { key: 'files', label: 'Dateien' },
  { key: 'history', label: 'Verlauf' },
]
const GOAL = '#e0a030'
const ROLE_NAME: Record<Role, string> = { explorer: 'Explore', designer: 'Designer', tester: 'Tester', reviewer: 'Reviewer', builder: 'Builder', writer: 'Schreiber', guide: 'Guide', plain: 'Agent' }
const MOOD = { running: ['läuft', C.agent], waiting: ['wartet auf dich', C.warn], done: ['fertig', C.ok], error: ['Fehler', C.alert] } as const
const FILE_COLOR: Record<GitFile['status'], string> = { M: C.warn, A: C.ok, D: C.alert, R: C.shell, '?': C.ok }

const capital = (s: string) => (s ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s)
// The pane's title bar carries the model: "Opus 5.5 (Medium)".
const paneTitle = (l: Live | null) => (l ? `${modelName(l.model)}${l.effort ? ` (${capital(l.effort)})` : ''}` : 'Cockpit')

// Called from the one session.start hook in data.ts.
export async function startPane($: EngineInterface) {
  await $.command.register({ name: 'cockpit', description: 'Open the cockpit pane' })
  void $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })
}

// A new model or effort renames the pane; opening an open id only retitles it, and a closed pane stays closed.
export async function retitlePane($: EngineInterface) {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })
}

type Leaf = { key: string; title: string; sub: string; time: string; state: RingState; color: string }
type Group = { key: string; title: string; count: string; color: string; current?: string; leaves: Leaf[] }

const isRecent = (endedAt: number | null, now: number) => endedAt === null || now - endedAt < KEEP_MS

// 19:30 today, "Di 22:00" further out.
function resetText(l: Limit, now: number) {
  if (!l.resetsAt) return ''
  const at = Date.parse(l.resetsAt)
  return `↻ ${at - now > 20 * 3600e3 ? `${DAYS[new Date(at).getDay()]} ` : ''}${clock(at)}`
}

// The warning under a dial, or none while all is calm.
function ctxWarning(percent: number) {
  return percent >= 90 ? { text: '⚠ Jetzt /compact', color: C.alert } : percent >= 75 ? { text: '⚠ Bald voll', color: C.warn } : null
}
function limitWarning(l: Limit, now: number) {
  const tone = paceOf(l, now)
  return tone === 'alert' ? { text: '⚠ Limit nah', color: C.alert } : tone === 'fast' ? { text: '⚠ Zu schnell', color: C.warn } : null
}

// "⑂ feat/pane  ↑3 ↓1 gegen main  ● 5 geändert +120 −40"; the parts that are zero stay out.
function repoLine(env: Env) {
  const drift = [env.ahead > 0 && `↑${env.ahead}`, env.behind > 0 && `↓${env.behind}`].filter(Boolean).join(' ')
  const lines = [env.added > 0 && `+${env.added}`, env.removed > 0 && `−${env.removed}`].filter(Boolean).join(' ')
  return [env.branch && `⑂ ${env.branch}`, drift && env.branch !== env.base && `${drift} gegen ${env.base}`, env.changed > 0 && `● ${env.changed} geändert`, lines].filter(Boolean).join('  ')
}

const tallyLine = (t: { turns: number; tools: number }) => `${t.turns} ${t.turns === 1 ? 'Turn' : 'Turns'} · ${t.tools} ${t.tools === 1 ? 'Tool' : 'Tools'}`

// What hangs off the session: the task list, the background work, the chats it started.
function groupsOf(plan: Plan | null, crew: AgentRow[], shells: Shell[], chats: Subchat[], goals: Goal[], now: number): Group[] {
  const groups: Group[] = []
  // Only goals set out loud (/goal, or Claude's proposal once set); the engine never says one is reached.
  if (goals.length > 0) {
    const active = goals.filter(g => g.endedAt === null).length
    groups.push({
      key: 'goals',
      title: 'Ziele',
      count: active > 0 ? `${active} aktiv` : 'beendet',
      color: GOAL,
      leaves: goals.map((g, i) => ({
        key: `g-${i}`,
        title: g.condition,
        sub: g.endedAt === null ? `${g.by === 'you' ? 'von dir' : 'von Claude'} · seit ${span(now - g.at)}` : 'beendet',
        time: '',
        state: g.endedAt === null ? 'running' : 'done',
        color: GOAL,
      })),
    })
  }
  if (plan && plan.steps.length > 0) {
    const done = plan.steps.filter(s => s.status === 'completed').length
    groups.push({
      key: 'plan',
      title: 'Aufgaben',
      count: `${done}/${plan.steps.length}`,
      color: C.chat,
      current: plan.steps.find(s => s.status === 'in_progress')?.title,
      leaves: plan.steps.map(s => ({
        key: `p-${s.id}`,
        title: s.title,
        sub: s.status === 'completed' ? 'fertig' : s.status === 'in_progress' ? 'läuft' : 'offen',
        time: s.startedAt && (s.endedAt ?? now) - s.startedAt >= 1000 ? elapsed((s.endedAt ?? now) - s.startedAt) : '',
        state: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'running' : 'pending',
        color: C.chat,
      })),
    })
  }
  const agents: Leaf[] = crew
    .filter(a => isRecent(a.endedAt, now))
    .map(a => ({
      key: `a-${a.id}`,
      title: a.description,
      sub: [a.type, a.model && modelName(a.model), a.state === 'running' || a.state === 'waiting' ? a.tool : a.state === 'error' ? 'Fehler' : 'fertig'].filter(Boolean).join(' · '),
      time: elapsed((a.endedAt ?? now) - a.startedAt),
      state: a.state,
      color: C.agent,
    }))
  const cmds: Leaf[] = shells
    .filter(s => isRecent(s.endedAt, now))
    .map(s => ({
      key: `s-${s.id}`,
      title: s.title,
      sub: s.endedAt === null ? 'Shell' : 'Shell · fertig',
      time: elapsed((s.endedAt ?? now) - s.startedAt),
      state: s.endedAt === null ? 'running' : 'done',
      color: C.shell,
    }))
  const background = [...cmds, ...agents]
  if (background.length > 0) {
    const live = background.filter(l => l.state === 'running' || l.state === 'waiting').length
    groups.push({ key: 'bg', title: 'Hintergrund', count: live > 0 ? `${live} laufen` : 'fertig', color: C.shell, leaves: background })
  }
  if (chats.length > 0) {
    groups.push({
      key: 'chats',
      title: 'Subchats',
      count: String(chats.length),
      color: C.seven_day,
      leaves: chats.map((c, i) => ({ key: `c-${i}`, title: c.title, sub: 'eigener Chat · gestartet', time: `vor ${span(now - c.at)}`, state: 'chat', color: C.seven_day })),
    })
  }
  return groups
}

type DesktopUi = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg' | 'Button'>

// The changed files: from git when the session is in a repository, else the files the tools edited.
type FileRow = GitFile & { at: number | null }
function filesOf(env: Env | null, touches: Touch[]): FileRow[] {
  const edited = new Map(touches.filter(t => t.kind === 'edit').map(t => [t.path, t.at]))
  if (env?.repo) return env.files.map(f => ({ ...f, at: edited.get(f.path) ?? [...edited].find(([p]) => p.endsWith(f.path) || f.path.endsWith(p))?.[1] ?? null }))
  return touches.filter(t => t.kind === 'edit').map(t => ({ path: t.path, status: 'M' as const, added: 0, removed: 0, at: t.at }))
}
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

// Agents: running and waiting first, then the newest; Clawd dressed for the role, the state in the figure.
function agentsTab({ Box, Text, Svg }: DesktopUi, roster: AgentRow[], now: number) {
  if (roster.length === 0) return <Text dimColor>Noch keine Agents in dieser Session.</Text>
  const live = (a: AgentRow) => a.state === 'running' || a.state === 'waiting'
  const list = [...roster].sort((a, b) => Number(live(b)) - Number(live(a)) || b.startedAt - a.startedAt)
  return (
    <Box flexDirection="column" rowGap={1}>
      {list.map(a => {
        const role = roleOf(a.type, a.description)
        const [word, color] = MOOD[a.state]
        return (
          <Box key={a.id} flexDirection="row" columnGap={1} alignItems="center" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
            <Svg source={clawdSvg(role, a.state)} alt={`${ROLE_NAME[role]}, ${word}`} width={CLAWD.w * 0.7} height={CLAWD.h * 0.7} />
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Box flexDirection="row" columnGap={1}>
                <Text bold wrap="truncate-end">
                  {a.description}
                </Text>
                <Box flexGrow={1} />
                <Text color={color}>● {word}</Text>
              </Box>
              <Text dimColor wrap="truncate-end">
                {[role === 'plain' ? a.type : ROLE_NAME[role], a.model && modelName(a.model), elapsed((a.endedAt ?? now) - a.startedAt)].filter(Boolean).join(' · ')}
              </Text>
              <Text color={a.state === 'waiting' ? C.warn : a.state === 'error' ? C.alert : undefined} dimColor={a.state === 'done'} wrap="truncate-end">
                {a.state === 'done' ? 'fertig' : a.tool}
              </Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// Dateien: what changed, by folder, and what was only read, folded until asked.
function filesTab($: EngineInterface, { Box, Text, Button }: DesktopUi, changed: FileRow[], touches: Touch[], folded: string[], now: number) {
  const reads = touches.filter(t => t.kind === 'read' && !changed.some(c => c.path === t.path || t.path.endsWith(c.path))).sort((a, b) => b.at - a.at)
  const dirs = [...new Set(changed.map(c => dirOf(c.path)))].sort()
  const isReadOpen = folded.includes('files-read-open')
  const added = changed.reduce((n, c) => n + c.added, 0)
  const removed = changed.reduce((n, c) => n + c.removed, 0)
  if (changed.length === 0 && reads.length === 0) return <Text dimColor>Diese Session hat noch keine Datei angefasst.</Text>
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>Geändert</Text>
        <Box flexGrow={1} />
        {added > 0 && <Text color={C.ok}>+{added}</Text>}
        {removed > 0 && <Text color={C.alert}>−{removed}</Text>}
        {changed.length === 0 && <Text dimColor>nichts</Text>}
      </Box>
      {dirs.map(dir => (
        <Box key={dir || '.'} flexDirection="column" marginTop={1}>
          <Text dimColor>{dir === '' ? 'Wurzel' : `${dir}/`}</Text>
          {changed
            .filter(c => dirOf(c.path) === dir)
            .map(c => (
              <Box key={c.path} flexDirection="row" columnGap={1} paddingLeft={1}>
                <Text bold color={FILE_COLOR[c.status]}>
                  {c.status === '?' ? 'A' : c.status}
                </Text>
                <Text wrap="truncate-end">{nameOf(c.path)}</Text>
                <Box flexGrow={1} />
                {c.added > 0 && <Text color={C.ok}>+{c.added}</Text>}
                {c.removed > 0 && <Text color={C.alert}>−{c.removed}</Text>}
                <Text dimColor>{c.at !== null ? `vor ${span(now - c.at)}` : ''}</Text>
              </Box>
            ))}
        </Box>
      ))}
      {reads.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Button plain dimColor label={`${isReadOpen ? '▾' : '▸'} Gelesen`} onPress={() => void toggleFold($, 'files-read-open')} />
            <Box flexGrow={1} />
            <Text dimColor>{reads.length} Dateien</Text>
          </Box>
          {isReadOpen &&
            reads.map(r => (
              <Box key={r.path} flexDirection="row" columnGap={1} paddingLeft={1}>
                <Text dimColor>R</Text>
                <Text dimColor wrap="truncate-end">
                  {nameOf(r.path)}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {dirOf(r.path)}
                </Text>
                <Box flexGrow={1} />
                <Text dimColor>{r.count}×</Text>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  )
}

// Verlauf: a dot per turn with the prompt's opening, events in between, the newest last; the last 15.
function historyTab({ Box, Text, Svg }: DesktopUi, turns: Turn[], events: SessionEvent[]) {
  const rows = [...turns.map(t => ({ at: t.at, turn: t })), ...events.map(e => ({ at: e.at, event: e }))].sort((a, b) => a.at - b.at).slice(-15)
  if (rows.length === 0) return <Text dimColor>Der Verlauf beginnt mit dem ersten fertigen Turn.</Text>
  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <Box key={`${row.at}-${i}`} flexDirection="row" columnGap={1}>
          <Box width={5}>
            <Text dimColor>{clock(row.at)}</Text>
          </Box>
          <Svg source={stepSvg('turn' in row ? 'turn' : 'event', i === rows.length - 1)} alt="" width={STEP.w} height={STEP.h} />
          {'turn' in row && row.turn ? (
            <Box flexDirection="column" flexShrink={1}>
              <Text wrap="truncate-end">{row.turn.prompt || 'Turn'}</Text>
              <Text dimColor wrap="truncate-end">
                {elapsed(row.turn.seconds * 1000)} · {row.turn.tools} Tools · +{k(row.turn.ctxDelta)}
                {row.turn.cacheHit > 0 ? ' · Cache ' : ''}
                {row.turn.cacheHit > 0 && <Text color={row.turn.cacheHit < 70 ? C.warn : undefined}>{row.turn.cacheHit}%</Text>}
              </Text>
            </Box>
          ) : (
            <Box flexDirection="row" columnGap={1} flexShrink={1}>
              <Text bold color={C.warn}>
                {'event' in row && row.event?.kind === 'compact' ? '⇣ Compact' : '⇄ Modell'}
              </Text>
              <Text dimColor wrap="truncate-end">
                {'event' in row ? row.event?.note : ''}
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

export function registerPane(on: On) {
  on('command.run', { command: 'cockpit' }, async $ => {
    await $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })

    return { text: 'Cockpit geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const l = await getLive($)
    // The turn under way counts at once, its tools as they run.
    const done = await getTally($)
    const running = await getRunning($)
    const tally = { ...done, turns: done.turns + (running.tools > 0 ? 1 : 0), tools: done.tools + running.tools }
    const folded = await getFolded($)
    const tab = await getTab($)
    const env = await getEnv($)
    const plan = await getPlan($)
    const crew = await getCrew($)
    const liveAgents = crew.filter(a => a.state === 'running' || a.state === 'waiting').length
    const roster = await getRoster($)
    const touches = await getTouches($)
    const changedFiles = filesOf(env, touches)
    const turns = await getTurns($)
    const events = await getEvents($)
    const repoOpen = await getRepoOpen($)
    const groups = groupsOf(plan, crew, await getShells($), await getSubchats($), await getGoals($), await $.clock.now())
    await getTick($)
    const now = await $.clock.now()
    const since = tally.since

    if (e.surface === 'desktop') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      if (!l) return <Text dimColor>Wartet auf die erste Antwort…</Text>
      const badges: Record<string, { text: string; color: string } | null> = {
        agents: liveAgents > 0 ? { text: String(liveAgents), color: C.agent } : null,
        files: changedFiles.length > 0 ? { text: String(changedFiles.length), color: C.shell } : null,
      }
      // A toggle: the track and the open tab's pill are one drawing, the names lie over it.
      const tabs = (
        <Box flexDirection="column">
          <Svg
            source={toggleSvg(
              Math.max(
                0,
                TABS.findIndex(t => t.key === tab),
              ),
              TABS.length,
            )}
            alt="Tabs"
            height={TOGGLE_H}
          />
          <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center">
            {TABS.map(t => {
              const badge = badges[t.key] ?? null
              return (
                <Box key={t.key} flexGrow={1} width="25%" flexDirection="row" justifyContent="center" alignItems="flex-start">
                  {t.key === tab ? <Button key={`tab-${t.key}`} plain label={t.label} onPress={() => void setTab($, t.key)} /> : <Button key={`tab-${t.key}`} plain dimColor label={t.label} onPress={() => void setTab($, t.key)} />}
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
      const dial = (d: Dial) => (
        <Box key={d.key} flexDirection="column" alignItems="center" width={DIAL.w + 14}>
          <Box flexDirection="column" alignItems="center" paddingX={2} borderStyle="round" borderColor={C.clear} hover={{ scope: `dial-${d.key}`, backgroundColor: C.card, borderColor: C.card }}>
            <Svg source={dialSvg(d.percent, d.color, d.value, d.label, d.pace)} alt={`${d.label} ${d.value}`} width={DIAL.w} height={DIAL.h} />
            {d.sub !== '' && <Text dimColor>{d.sub}</Text>}
            {d.warning && <Text color={d.warning.color}>{d.warning.text}</Text>}
          </Box>
          {/* Under the tile, centered on its dial, one cell past each side. */}
          <Box
            position="absolute"
            top={6}
            left={-1}
            right={-1}
            display="none"
            hover={{ scope: `dial-${d.key}`, display: 'flex' }}
            flexDirection="column"
            paddingX={1}
            backgroundColor={C.popup}
            borderStyle="round"
            borderColor={C.line}
          >
            <Text bold>{d.label}</Text>
            {d.facts.map(([name, fact]) => (
              <Box key={name} flexDirection="row">
                <Text dimColor>{name}</Text>
                <Box flexGrow={1} />
                <Text>{fact}</Text>
              </Box>
            ))}
            {d.parts && d.parts.length > 0 && <Svg source={partsSvg(d.parts)} alt="Aufteilung" height={8} />}
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
      const PACE = { calm: 'ruhig', fast: 'zu schnell', alert: 'kritisch' } as const
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
            ['Verbraucht', `${Math.round(lim.percentUsed)} %`],
            ...(gone !== null ? [[lim.kind === 'five_hour' ? 'Fenster vorbei' : 'Woche vorbei', `${Math.round(gone)} %`] as [string, string]] : []),
            ['Tempo', PACE[paceOf(lim, now)]],
            ...(at !== null ? [['Reset', `${resetText(lim, now).replace('↻ ', '')} · in ${span(at - now)}`] as [string, string]] : []),
          ],
        }
      }

      // The repo card's details: the last commits, whether they are pushed, what is not committed.
      const repoDetails = (env: Env) => (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Letzte Commits</Text>
          {env.commits.map(c => (
            <Box key={c.hash} flexDirection="row" columnGap={1}>
              <Text dimColor mono>
                {c.hash}
              </Text>
              <Text wrap="truncate-end">{c.subject}</Text>
              <Box flexGrow={1} />
              <Text dimColor>{c.age.replace(/ ago$/, '')}</Text>
            </Box>
          ))}
          {env.unpushed === null ? <Text dimColor>Kein Upstream-Branch</Text> : env.unpushed === 0 ? <Text color={C.ok}>● gepusht</Text> : <Text color={C.warn}>↑{env.unpushed} nicht gepusht</Text>}
          {env.files.length > 0 && <Text dimColor>Nicht committet</Text>}
          {env.files.slice(0, 6).map(file => (
            <Box key={file.path} flexDirection="row" columnGap={1}>
              <Text color={FILE_COLOR[file.status]}>{file.status}</Text>
              <Text wrap="truncate-start">{file.path}</Text>
              <Box flexGrow={1} />
              {file.added > 0 && <Text color={C.ok}>+{file.added}</Text>}
              {file.removed > 0 && <Text color={C.alert}>−{file.removed}</Text>}
            </Box>
          ))}
          {env.files.length > 6 && <Text dimColor>… {env.files.length - 6} weitere</Text>}
        </Box>
      )

      const dials: Dial[] = [
        {
          key: 'ctx',
          percent: l.ctxPercent,
          color: l.ctxPercent >= 90 ? C.alert : l.ctxPercent >= 75 ? C.warn : C.context,
          value: l.ctxTokens > 0 ? k(l.ctxTokens) : '–',
          label: 'Context',
          sub: l.ctxTokens > 0 ? `${w.glyph} ${w.word}` : 'misst…',
          pace: null,
          warning: ctxWarning(l.ctxPercent),
          facts: [
            ['Belegt', `${k(l.ctxTokens)} von ${k(l.ctxWindow)}`],
            ['Anteil', `${Math.round(l.ctxPercent)} %`],
            ['Frei', k(Math.max(0, l.ctxWindow - l.ctxTokens))],
            ['Wetter', `${w.glyph} ${w.word}`],
          ],
          ...(l.ctxParts ? { parts: l.ctxParts.slice(0, 6) } : {}),
        },
        ...(five ? [limitDial(five, '5h', C.five_hour)] : []),
        ...(seven ? [limitDial(seven, '7d', C.seven_day)] : []),
      ]

      return (
        <Box flexDirection="column" rowGap={1} paddingX={1}>
          {/* Shown top down as rings, repo, tabs, but laid out the other way round: the tabs' names lie on a layer
              of their own, which would cover anything before it, so the rings and their cards come last. */}
          <Box flexDirection="column-reverse" rowGap={1}>
            {tabs}

            {env?.repo && (
              <Box flexDirection="row" columnGap={1} alignItems="flex-start" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
                <Svg source={repoSvg(env.isGithub, '#ececec')} alt={env.isGithub ? 'GitHub' : 'Git'} width={20} height={20} />
                <Box flexDirection="column" flexShrink={1}>
                  <Box flexDirection="row" columnGap={1}>
                    <Text bold>{env.repo.split('/').pop()}</Text>
                    {env.repo.includes('/') && <Text dimColor>{env.repo.split('/')[0]}</Text>}
                  </Box>
                  {/* Ahead green, behind amber; lines added green, removed red. */}
                  <Box flexDirection="row" columnGap={1} flexWrap="wrap">
                    {env.branch !== '' && <Text dimColor>⑂ {env.branch}</Text>}
                    {env.branch !== env.base && env.ahead > 0 && <Text color={C.ok}>↑{env.ahead}</Text>}
                    {env.branch !== env.base && env.behind > 0 && <Text color={C.warn}>↓{env.behind}</Text>}
                    {env.branch !== env.base && env.ahead + env.behind > 0 && <Text dimColor>gegen {env.base}</Text>}
                    {env.changed > 0 && <Text dimColor>● {env.changed} geändert</Text>}
                    {env.added > 0 && <Text color={C.ok}>+{env.added}</Text>}
                    {env.removed > 0 && <Text color={C.alert}>−{env.removed}</Text>}
                  </Box>
                  {repoOpen && repoDetails(env)}
                </Box>
                <Box flexGrow={1} />
                <Button plain dimColor label={repoOpen ? '▴' : '▾'} onPress={() => void toggleRepoOpen($)} />
              </Box>
            )}

            <Box flexDirection="row">{dials.map(dial)}</Box>
          </Box>

          {tab === 'agents' && agentsTab({ Box, Text, Svg, Button }, roster, now)}
          {tab === 'files' && filesTab($, { Box, Text, Svg, Button }, changedFiles, touches, folded, now)}
          {tab === 'history' && historyTab({ Box, Text, Svg, Button }, turns, events)}
          {tab === 'session' && (
            <Box flexDirection="column" rowGap={1}>
              <Box flexDirection="row" columnGap={1} alignItems="center">
                <Svg source={coreSvg('#ececec')} alt="Diese Session" width={18} height={18} />
                <Text bold>Diese Session</Text>
                <Box flexGrow={1} />
                <Text dimColor>
                  {tallyLine(tally)}
                  {since !== null && ` · ${elapsed(now - since)}`}
                </Text>
              </Box>
              {groups.length === 0 && <Text dimColor>Nichts läuft nebenher.</Text>}
              {/* Each group runs on a line of its own: a dot at its name, a twig into each card. */}
              {groups.map(g => (
                <Box key={g.key} flexDirection="column">
                  <Box flexDirection="row" columnGap={1} alignItems="center">
                    <Svg source={headSvg(g.color, !folded.includes(g.key))} alt={g.title} width={folded.includes(g.key) ? TWIG.dot : TWIG.w} height={TWIG.head} />
                    <Button plain dimColor label={`${folded.includes(g.key) ? '▸' : '▾'} ${g.title}`} onPress={() => void toggleFold($, g.key)} />
                    {folded.includes(g.key) && <Svg source={beadsSvg(g.leaves)} alt={g.current ?? g.count} width={beadsWidth(g.leaves.length)} height={BEAD} />}
                    <Box flexGrow={1} />
                    <Text dimColor>{g.count}</Text>
                  </Box>
                  {!folded.includes(g.key) &&
                    g.leaves.map((leaf, i) => (
                      <Box key={leaf.key} flexDirection="row" alignItems="center">
                        <Svg source={twigSvg(i === g.leaves.length - 1, g.color)} alt="Zweig" width={TWIG.w} height={TWIG.leaf} />
                        <Box flexDirection="row" flexGrow={1} flexShrink={1} columnGap={1} alignItems="center" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
                          <Svg source={ringSvg(leaf.state, leaf.color)} alt={leaf.sub} width={RING} height={RING} />
                          <Box flexDirection="column" flexShrink={1}>
                            <Text dimColor={leaf.state === 'done' || leaf.state === 'pending'} wrap="truncate-end">
                              {leaf.title}
                            </Text>
                            <Text dimColor wrap="truncate-end">
                              {leaf.sub}
                            </Text>
                          </Box>
                          <Box flexGrow={1} />
                          <Text dimColor>{leaf.time}</Text>
                        </Box>
                      </Box>
                    ))}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // Terminal: the same parts as text.
    const { Box, Text } = $.ui.resolve(e)
    if (!l) return <Text dimColor>Wartet auf die erste Antwort…</Text>
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
            <Text bold>● Diese Session</Text>
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
              {leaf.state === 'done' ? '✓' : leaf.state === 'error' ? '✕' : leaf.state === 'chat' ? '◇' : leaf.state === 'pending' ? '○' : '●'} {leaf.title}{' '}
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
