import type { On } from 'claude-code'

import { getRunning } from './state'

export function registerSpinner(on: On) {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const r = await getRunning($)
    if (r.tools === 0) return next(e)

    return next({ ...e, props: { ...e.props, suffix: `${e.props.suffix} · ${r.tools} Tools` } })
  })
}
