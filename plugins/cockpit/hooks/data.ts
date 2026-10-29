import type { EngineInterface, On, SessionUsage } from 'claude-code'

import type { Live, Turn } from '../types'
import { cacheLeft, cacheTtlMs, k, span } from './format'
import { startPane } from './pane'
import { addTurn, bumpTick, getLive, setLive, setRunning } from './state'

type Reading = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

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
export function registerData(on: On, toasts: boolean, pane: boolean) {
  let turnStart = { ctx: 0, cost: 0, tools: 0 }
  let cacheWarned = false
  const agents = new Set<string>()

  on('session.start', async ($, e, next) => {
    await apply($, await $.session.usage(), toasts)
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

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await apply($, e, toasts)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      agents.add(e.agentId)
      await setRunning($, { agents: agents.size })
      return next(e)
    }
    const l = await getLive($)
    turnStart = { ctx: l?.ctxTokens ?? 0, cost: l?.costUsd ?? 0, tools: 0 }
    await setRunning($, { tools: 0 })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnStart.tools += 1
      await setRunning($, { tools: turnStart.tools })
    }

    return next(e)
  })
    // A counting failure must never hold up the tool call itself.
    .catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      agents.delete(e.agentId)
      await setRunning($, { agents: agents.size })
      return next(e)
    }
    await apply($, await $.session.usage(), toasts, {
      lastRequestAt: await $.clock.now(),
      ...(e.usage ? { model: e.usage.model } : {}),
    })
    cacheWarned = false
    const l = await getLive($)
    const u = e.usage
    const prompt = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
    const turn: Turn = {
      answer: e.answer.trim(),
      seconds: Math.round(e.durationMs / 1000),
      tools: turnStart.tools,
      ctxDelta: (l?.ctxTokens ?? 0) - turnStart.ctx,
      costDelta: (l?.costUsd ?? 0) - turnStart.cost,
      cacheHit: u && prompt > 0 ? Math.round((100 * u.cache_read_input_tokens) / prompt) : 0,
    }
    await addTurn($, turn)
    await setRunning($, { tools: 0 })

    return next(e)
  })
}
