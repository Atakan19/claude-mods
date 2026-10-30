import type { On } from 'claude-code'

import { k } from './format'
import { getTurns } from './state'

export function registerReply(on: On) {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text.trim()
    if (e.props.isSummary || text === '') return next(e)
    // shortcut: matched by text (the turn's final answer ends with its last block); an
    // identical reply in two turns shows the newer line, switch to message ids if that bites.
    const list = await getTurns($)
    const t = [...list].reverse().find(one => one.answer.endsWith(text))
    if (!t) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const parts = [
      `⏱ ${t.seconds}s`,
      `${t.tools} Tools`,
      `+${k(t.ctxDelta)} Context`,
      ...(t.cacheHit > 0 ? [`Cache ${t.cacheHit}%`] : []),
    ]

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text dimColor>{parts.join(' · ')}</Text>
      </Box>
    )
  })
}
