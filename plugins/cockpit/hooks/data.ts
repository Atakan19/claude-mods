import type { EngineInterface, On, SessionUsage } from 'claude-code'

import type { Env, Live, Turn } from '../types'
import { cacheLeft, cacheTtlMs, k, span } from './format'
import { retitlePane, startPane } from './pane'
import { clearDonePlan } from './plan'
import { FOLD_MS } from './progress'
import { notify } from './notify'
import { play } from './sound'
import { addShell, addSubchat, addTurn, bumpTick, countAgent, dropDoneCrew, endShells, getCrew, getEnv, getLive, setEnv, setLive, setRunning, upsertCrew } from './state'

type Reading = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

const ALERT = { done: 'Claude ist fertig', decision: 'Claude wartet auf dich', error: 'Claude ist gescheitert' } as const

const base = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

// One git call; empty when it fails.
async function git($: EngineInterface, cwd: string, args: string[]) {
  const r = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 3000 }).catch(() => null)
  return r?.exitCode === 0 ? r.stdout.trim() : ''
}

// The folder, the repository as owner/name, the branch git is on, how far it is from the main branch and the files changed.
async function readEnv($: EngineInterface): Promise<Env> {
  const cwd = await $.session.cwd()
  const repo = await $.session.repo().catch(() => null)
  const none = { folder: base(cwd), repo: '', branch: '', isGithub: false, base: '', ahead: 0, behind: 0, changed: 0, added: 0, removed: 0 }
  if (!repo) return none
  // The remote's main branch if it names one, else the first of origin/main, main, master that exists.
  let main = await git($, cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  for (const name of ['origin/main', 'main', 'master']) if (!main && (await git($, cwd, ['rev-parse', '--verify', '--quiet', name]))) main = name
  const [behind, ahead] = (await git($, cwd, ['rev-list', '--left-right', '--count', `${main}...HEAD`])).split(/\s+/).map(Number)
  const status = await git($, cwd, ['status', '--porcelain'])
  // "3 files changed, 120 insertions(+), 40 deletions(-)"
  const stat = await git($, cwd, ['diff', '--shortstat', 'HEAD'])
  return {
    ...none,
    repo: repo.remote?.match(/([^/:]+\/[^/]+?)(\.git)?$/)?.[1] ?? base(repo.root),
    branch: await git($, cwd, ['branch', '--show-current']),
    isGithub: /github\.com/.test(repo.remote ?? ''),
    base: main.replace(/^origin\//, ''),
    ahead: ahead || 0,
    behind: behind || 0,
    changed: status ? status.split('\n').length : 0,
    added: Number(/(\d+) insertion/.exec(stat)?.[1] ?? 0),
    removed: Number(/(\d+) deletion/.exec(stat)?.[1] ?? 0),
  }
}

// Reads the repository and stores it; never throws.
async function refreshEnv($: EngineInterface) {
  try {
    await setEnv($, await readEnv($))
  } catch {}
}

// A command Claude sent to the background gets a branch of its own; its description names it.
async function noteShell($: EngineInterface, description: string | undefined, id: string | undefined) {
  if (!id) return
  await addShell($, { id, title: description || 'Shell', startedAt: await $.clock.now(), endedAt: null })
}

// The sound when it is on, and a toast too: the person may have no speakers on. The toast shows in
// the chat; the system's notification, naming the session's folder, reaches them in another window.
async function alert($: EngineInterface, kind: keyof typeof ALERT, sounds: boolean, toasts: boolean) {
  if (sounds) play($, kind)
  if (!toasts) return
  $.ui.toast(ALERT[kind], { timeoutMs: 10_000 })
  const env = await getEnv($).catch(() => null)
  notify($, ALERT[kind], env?.repo ? `${env.repo.split('/').pop()} · ${env.branch || env.folder}` : env?.folder || 'Claude Code')
}

async function apply($: EngineInterface, u: Reading, toasts: boolean, extra: Partial<Live> = {}) {
  const prev = await getLive($)
  const limits = u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  const five = limits.find(l => l.kind === 'five_hour')
  const prevFive = prev?.limits.find(l => l.kind === 'five_hour')
  if (toasts && five && five.percentUsed >= 90 && (prevFive?.percentUsed ?? 0) < 90) {
    $.ui.toast(`5h-Limit bei ${Math.round(five.percentUsed)} %`)
  }
  await setLive($, p => ({
    ctxTokens: u.context.tokens ?? p?.ctxTokens ?? 0,
    ctxWindow: u.context.window,
    ctxPercent: u.context.percent ?? p?.ctxPercent ?? 0,
    costUsd: u.cost?.usd ?? p?.costUsd ?? 0,
    limits: limits.length > 0 ? limits : (p?.limits ?? []),
    model: p?.model ?? '',
    lastRequestAt: p?.lastRequestAt ?? 0,
    ...extra,
  }))
}

// The one source every part draws from: usage, turns, running tools and agents.
export function registerData(on: On, toasts: boolean, pane: boolean, sounds: boolean) {
  let turnStart = { ctx: 0, cost: 0, tools: 0 }
  let cacheWarned = false

  on('session.start', async ($, e, next) => {
    // Until the first turn names the model, the settings' choice ("opus") stands in.
    const model = await $.settings.read().then(
      s => s.model,
      () => undefined,
    )
    const known = (await getLive($))?.model
    await apply($, await $.session.usage(), toasts, known || typeof model !== 'string' ? {} : { model })
    $.clock.every(30_000, () => {
      void (async () => {
        await bumpTick($)
        const l = await getLive($)
        if (!toasts || !l || cacheWarned || cacheTtlMs(l) <= 5 * 60e3) return
        const left = cacheLeft(l, await $.clock.now())
        if (left !== null && left > 0 && left <= 5 * 60e3) {
          cacheWarned = true
          $.ui.toast(`Cache läuft in ${span(left)} ab (${k(l.ctxTokens)} Context)`)
        }
      })()
    })
    if (pane) await startPane($)
    // In the background: a slow repository must not hold up the session's start.
    void refreshEnv($)

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) await noteShell($, e.description, r.result?.backgroundTaskId)
    } catch {}
    return r
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId === undefined && !('deny' in r) && !r.isError) await noteShell($, e.description, r.result?.backgroundTaskId)
    } catch {}
    return r
  })

  // The desktop app's own sessions, started from this one: only their title is read.
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async ($, e, next) => {
    const r = await next(e)
    try {
      const title = (e as { title?: unknown }).title
      if (e.agentId === undefined && !('deny' in r) && !r.isError && typeof title === 'string') {
        await addSubchat($, { title, at: await $.clock.now() })
      }
    } catch {}
    return r
  })

  // At each stop the engine says what still runs in the background and at which effort it worked.
  on('classic.Stop', async ($, e, next) => {
    try {
      if (!e.agent_id) {
        const now = await $.clock.now()
        await endShells($, (e.background_tasks ?? []).filter(t => t.type === 'shell').map(t => t.id), now)
        const level = e.effort?.level
        if (level && (await getLive($))?.effort !== level) {
          await setLive($, p => (p ? { ...p, effort: level } : p) as Live)
          await retitlePane($).catch(() => {})
        }
      }
    } catch {}
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await apply($, e, toasts)

    return next(e)
  })

  // A subagent gets its strip when it is spawned; engine forks (compaction) stay out.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if ('agentId' in r && r.agentId && e.subagentType !== 'fork') {
        const now = await $.clock.now()
        // A batch folded away makes room for the next one.
        await dropDoneCrew($, now - FOLD_MS)
        const known = (await getCrew($)).some(a => a.id === r.agentId)
        await upsertCrew($, {
          id: r.agentId,
          description: e.description || e.subagentType,
          type: e.subagentType,
          state: 'running',
          tool: 'Starting',
          endedAt: null,
          model: r.model,
          ...(known ? {} : { startedAt: now }),
        })
        if (!known) await countAgent($)
      }
    } catch {}
    return r
  })

  // Each request says what it runs on: the resolved model and its effort. The main loop's
  // replaces the settings' guess at once, so a session started on Sonnet does not read "Opus".
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) await apply($, await $.session.usage(), toasts).catch(() => {})
    if (e.agentId === undefined && e.model) {
      const prev = await getLive($)
      const effort = e.effort !== undefined ? String(e.effort) : prev?.effort
      if (prev && (prev.model !== e.model || prev.effort !== effort)) {
        await setLive($, p => ({ ...(p ?? prev), model: e.model, ...(effort !== undefined ? { effort } : {}) }))
        await retitlePane($).catch(() => {})
      }
    } else if (e.agentId !== undefined && (await getCrew($)).some(a => a.id === e.agentId)) {
      await upsertCrew($, { id: e.agentId, model: e.model, ...(e.effort !== undefined ? { effort: String(e.effort) } : {}) })
    }
    return yield* next(e)
  })

  // A permission dialog: the agent's strip turns amber, and the main loop's asks with a sound.
  on('classic.PermissionRequest', async ($, e, next) => {
    const id = e.agent_id
    if (id && (await getCrew($)).some(a => a.id === id)) await upsertCrew($, { id, state: 'waiting', tool: 'Needs approval' })
    const answer = await next(e)
    // A settings hook answered it (auto mode, an allow rule): no dialog is in front of the person.
    if (id && answer.decision) await upsertCrew($, { id, state: 'running', tool: e.tool_name })
    else if (!id && !answer.decision) void alert($, 'decision', sounds, toasts)
    return answer
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const l = await getLive($)
    turnStart = { ctx: l?.ctxTokens ?? 0, cost: l?.costUsd ?? 0, tools: 0 }
    await setRunning($, { tools: 0 })
    if (e.text !== '') await clearDonePlan($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    const isCrew = agentId !== undefined && (await getCrew($)).some(a => a.id === agentId)
    if (agentId === undefined) {
      turnStart.tools += 1
      await setRunning($, { tools: turnStart.tools })
      if (e.tool === 'AskUserQuestion') void alert($, 'decision', sounds, toasts)
    } else if (isCrew) {
      await upsertCrew($, { id: agentId, state: 'running', tool: e.tool })
    }
    const r = await next(e)
    // Past a permission dialog the tool ran: the strip is no longer waiting. Caught here, so
    // the .catch below never runs the tool a second time.
    try {
      if (isCrew && (await getCrew($)).find(a => a.id === agentId)?.state === 'waiting') {
        await upsertCrew($, { id: agentId, state: 'running', tool: e.tool })
      }
    } catch {}

    return r
  })
    // A counting failure must never hold up the tool call itself.
    .catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      if ((await getCrew($)).some(a => a.id === id)) {
        const now = await $.clock.now()
        const isFailed = e.reason !== 'answer'
        await upsertCrew($, { id, state: isFailed ? 'error' : 'done', tool: e.reason === 'aborted' ? 'Stopped' : isFailed ? 'Failed' : 'Done', endedAt: now })
        // Drawn once more when a finished batch folds away.
        $.clock.after(FOLD_MS + 100, () => void bumpTick($).catch(() => {}))
      }
      return next(e)
    }
    if (!e.isAborted) void alert($, e.reason === 'answer' ? 'done' : 'error', sounds, toasts)
    await apply($, await $.session.usage(), toasts, {
      lastRequestAt: await $.clock.now(),
      ...(e.usage ? { model: e.usage.model } : {}),
    })
    cacheWarned = false
    const l = await getLive($)
    const u = e.usage
    const prompt = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
    const turn: Turn = {
      at: await $.clock.now(),
      answer: e.answer.trim(),
      seconds: Math.round(e.durationMs / 1000),
      tools: turnStart.tools,
      ctxDelta: (l?.ctxTokens ?? 0) - turnStart.ctx,
      costDelta: (l?.costUsd ?? 0) - turnStart.cost,
      cacheHit: u && prompt > 0 ? Math.round((100 * u.cache_read_input_tokens) / prompt) : 0,
    }
    await addTurn($, turn)
    await setRunning($, { tools: 0 })
    // The branch may have moved during the turn; read in the background, so the turn ends at once.
    void refreshEnv($)

    return next(e)
  })
}
