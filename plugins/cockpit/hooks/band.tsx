import type { On } from 'claude-code'

import { bar, cacheLeft, cacheTone, fillTone, k, limitLabel, limitTone, span, usd } from './format'
import { getLive, getRunning, getTick } from './state'

export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const l = await getLive($)
    if (!l) return next(e)
    await getTick($)
    const r = await getRunning($)
    const now = await $.clock.now()
    const wide = e.props.bodyColumns >= 100
    const left = cacheLeft(l, now)
    const { Box, Text } = $.ui.resolve(e)
    const sep = <Text dimColor> │ </Text>

    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={fillTone(l.ctxPercent)}>
          ◔ {Math.round(l.ctxPercent)}%{' '}
          <Text dimColor>
            {k(l.ctxTokens)}/{k(l.ctxWindow)}
          </Text>
        </Text>
        {l.limits.map(lim => (
          <Text>
            {sep}
            <Text color={limitTone(lim, now)}>
              {limitLabel(lim)} {wide ? `${bar(lim.percentUsed, 8)} ` : ''}
              {Math.round(lim.percentUsed)}%
            </Text>
            {lim.resetsAt && <Text dimColor> · {span(Date.parse(lim.resetsAt) - now)}</Text>}
          </Text>
        ))}
        {left !== null && (
          <Text>
            {sep}
            <Text color={cacheTone(left)}>⚡ {left <= 0 ? 'Cache abgelaufen' : `Cache ${span(left)}`}</Text>
          </Text>
        )}
        <Text>
          {sep}
          {usd(l.costUsd)}
        </Text>
        {r.agents > 0 && (
          <Text>
            {sep}
            <Text color="claude">◆ {r.agents} Agents</Text>
          </Text>
        )}
      </Box>
    )
  })
}
