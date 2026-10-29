import type { EngineInterface, On } from 'claude-code'

import { bar, cacheLeft, cacheTone, fillTone, k, limitLabel, limitTone, span, usd } from './format'
import { PANE, getLive, getRunning, getTick, getTurns } from './state'

// Called from the one session.start hook in data.ts.
export async function startPane($: EngineInterface) {
  await $.command.register({ name: 'cockpit', description: 'Open the cockpit pane' })
  void $.ui.open({ id: PANE, title: 'Cockpit' })
}

export function registerPane(on: On) {
  on('command.run', { command: 'cockpit' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Cockpit' })

    return { text: 'Cockpit geöffnet.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const l = await getLive($)
    const list = await getTurns($)
    const r = await getRunning($)
    await getTick($)
    const now = await $.clock.now()
    const w = Math.max(10, Math.min(30, e.props.bodyColumns - 22))
    const head = (title: string) => (
      <Text bold dimColor>
        {title}
      </Text>
    )

    if (!l) return <Text dimColor>Wartet auf die erste Antwort…</Text>
    const left = cacheLeft(l, now)
    const last = list[list.length - 1]

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between" borderStyle="round" borderDimColor paddingX={1}>
          <Text bold>Cockpit</Text>
          <Text dimColor>
            {l.model || '–'} · {usd(l.costUsd)}
          </Text>
        </Box>

        <Box flexDirection="column">
          {head('CONTEXT')}
          <Text color={fillTone(l.ctxPercent)}>
            {bar(l.ctxPercent, w)} {Math.round(l.ctxPercent)}%
          </Text>
          <Text dimColor>
            {k(l.ctxTokens)} von {k(l.ctxWindow)}
          </Text>
        </Box>

        {l.limits.length > 0 && (
          <Box flexDirection="column">
            {head('LIMITS')}
            {l.limits.map(lim => (
              <Text>
                <Text color={limitTone(lim, now)}>
                  {limitLabel(lim).padEnd(3)} {bar(lim.percentUsed, w)} {Math.round(lim.percentUsed)}%
                </Text>
                {lim.resetsAt && <Text dimColor> · Reset in {span(Date.parse(lim.resetsAt) - now)}</Text>}
              </Text>
            ))}
          </Box>
        )}

        {left !== null && (
          <Box flexDirection="column">
            {head('CACHE')}
            <Text color={cacheTone(left)}>{left <= 0 ? 'abgelaufen' : `noch ${span(left)} warm`}</Text>
            {last && <Text dimColor>letzte Antwort: {last.cacheHit}% aus dem Cache</Text>}
          </Box>
        )}

        {r.agents > 0 && (
          <Box flexDirection="column">
            {head('AGENTS')}
            <Text color="claude">◆ {r.agents} laufen</Text>
          </Box>
        )}

        <Box flexDirection="column">
          {head('VERLAUF')}
          {list.length === 0 && <Text dimColor>Noch keine Turns.</Text>}
          {list
            .slice(-8)
            .reverse()
            .map(t => (
              <Text dimColor>
                {`${t.seconds}s`.padStart(5)} {`${t.tools} Tools`.padStart(9)} {`+${k(t.ctxDelta)}`.padStart(7)}{' '}
                {`≈ ${usd(t.costDelta)}`.padStart(9)}
              </Text>
            ))}
        </Box>
      </Box>
    )
  })
}
