import type { EngineInterface, On } from 'claude-code'

import type { AgentRow, Env, Limit, Live, Plan, Shell, Subchat } from '../types'
import { bar, clock, k, modelName, paceOf, span, toneColor } from './format'
import type { RingState } from './look'
import { C, DIAL, RING, TWIG, coreSvg, dialSvg, headSvg, repoSvg, ringSvg, toned, twigSvg, weatherOf } from './look'
import { elapsed } from './progress'
import { PANE, getCrew, getEnv, getFolded, getLive, getPlan, getShells, getSubchats, getTab, getTally, getTick, setTab, toggleFold } from './state'

// Finished work stays on its branch this long, pale, then leaves the tree.
const KEEP_MS = 3 * 60e3
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
// Session first; the others hold a place until their content is settled.
const TABS = [
  { key: 'session', label: 'Session' },
  { key: 'agents', label: 'Agents' },
  { key: 'plan', label: 'Plan' },
  { key: 'verlauf', label: 'Verlauf' },
]

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
  return [env.branch && `⑂ ${env.branch}`, drift && env.branch !== env.base && `${drift} gegen ${env.base}`, env.changed > 0 && `● ${env.changed} geändert`, lines]
    .filter(Boolean)
    .join('  ')
}

const tallyLine = (t: { turns: number; tools: number }) => `${t.turns} Turns · ${t.tools} Tools`

// What hangs off the session: the task list, the background work, the chats it started.
function groupsOf(plan: Plan | null, crew: AgentRow[], shells: Shell[], chats: Subchat[], now: number): Group[] {
  const groups: Group[] = []
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
        time: s.startedAt ? elapsed((s.endedAt ?? now) - s.startedAt) : '',
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

export function registerPane(on: On) {
  on('command.run', { command: 'cockpit' }, async $ => {
    await $.ui.open({ id: PANE, title: paneTitle(await getLive($)) })

    return { text: 'Cockpit geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const l = await getLive($)
    const tally = await getTally($)
    const folded = await getFolded($)
    const tab = await getTab($)
    const env = await getEnv($)
    const groups = groupsOf(await getPlan($), await getCrew($), await getShells($), await getSubchats($), await $.clock.now())
    await getTick($)
    const now = await $.clock.now()
    const since = tally.since

    if (e.surface === 'desktop') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const tabs = (
        <Box flexDirection="row" columnGap={1}>
          {TABS.map(t => (t.key === tab ? <Button key={t.key} plain label={t.label} onPress={() => void setTab($, t.key)} /> : <Button key={t.key} plain dimColor label={t.label} onPress={() => void setTab($, t.key)} />))}
        </Box>
      )
      if (tab !== 'session') {
        return (
          <Box flexDirection="column" rowGap={1} paddingX={1}>
            {tabs}
            <Text dimColor>Kommt bald.</Text>
          </Box>
        )
      }
      if (!l) {
        return (
          <Box flexDirection="column" rowGap={1} paddingX={1}>
            {tabs}
            <Text dimColor>Wartet auf die erste Antwort…</Text>
          </Box>
        )
      }
      const five = l.limits.find(lim => lim.kind === 'five_hour')
      const seven = l.limits.find(lim => lim.kind === 'seven_day')
      const w = weatherOf(l.ctxPercent)
      const dial = (key: string, percent: number, color: string, value: string, label: string, sub: string, warning: { text: string; color: string } | null) => (
        <Box key={key} flexDirection="column" alignItems="center" width={DIAL.w + 12}>
          <Svg source={dialSvg(percent, color)} alt={`${label} ${Math.round(percent)} %`} width={DIAL.w} height={DIAL.h} />
          <Text bold>{value}</Text>
          <Text dimColor>{label}</Text>
          {sub !== '' && <Text dimColor>{sub}</Text>}
          {warning && <Text color={warning.color}>{warning.text}</Text>}
        </Box>
      )
      const limitDial = (lim: Limit, label: string, calm: string) =>
        dial(lim.kind, lim.percentUsed, toned(paceOf(lim, now), calm), `${Math.round(lim.percentUsed)}%`, label, resetText(lim, now), limitWarning(lim, now))

      return (
        <Box flexDirection="column" rowGap={1} paddingX={1}>
          {tabs}

          <Box flexDirection="row">
            {dial('ctx', l.ctxPercent, l.ctxPercent >= 90 ? C.alert : l.ctxPercent >= 75 ? C.warn : C.context, k(l.ctxTokens), 'Context', `${w.glyph} ${w.word}`, ctxWarning(l.ctxPercent))}
            {five && limitDial(five, '5h', C.five_hour)}
            {seven && limitDial(seven, '7d', C.seven_day)}
          </Box>

          {env?.repo && (
            <Box flexDirection="row" columnGap={1} alignItems="center" paddingX={1} backgroundColor={C.card} borderStyle="round" borderColor={C.card}>
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
              </Box>
            </Box>
          )}

          <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1" viewBox="0 0 1000 1" preserveAspectRatio="none"><rect width="1000" height="1" fill="${C.line}"/></svg>`} alt="Trennlinie" />

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
                  <Svg source={headSvg(g.color)} alt={g.title} width={TWIG.w} height={TWIG.head} />
                  <Button plain dimColor label={`${folded.includes(g.key) ? '▸' : '▾'} ${g.title}`} onPress={() => void toggleFold($, g.key)} />
                  {folded.includes(g.key) && g.current && <Text dimColor wrap="truncate-end">· {g.current}</Text>}
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
              {leaf.state === 'done' ? '✓' : leaf.state === 'error' ? '✕' : leaf.state === 'chat' ? '◇' : leaf.state === 'pending' ? '○' : '●'} {leaf.title} <Text dimColor>· {g.title} · {leaf.time}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
