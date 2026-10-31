import type { Register } from 'claude-code'

import { autoSaveAt } from './autosave'
import { registerBand } from './band'
import { registerData } from './data'
import { registerPane } from './pane'
import { registerPlan, registerPlanTool } from './plan'
import { registerReply } from './reply'
import { registerSpinner } from './spinner'

// Wiring only: each part lives in its own file and can be switched off in /config.
export const register: Register = (on, options) => {
  // Off by default: it clears the conversation on its own.
  const at = autoSaveAt(options.autoSaveAt)
  const autoSave = at > 0 ? { at, mode: options.autoSaveMode === 'compact' ? ('compact' as const) : ('clear' as const) } : undefined
  registerData(on, options.toasts !== false, options.pane !== false, options.sounds !== false, options.language, options.planTool === true, autoSave)
  if (options.plan !== false) registerPlan(on)
  // Off by default: the tool's description costs tokens on every request.
  if (options.planTool === true) registerPlanTool(on)
  if (options.band !== false) registerBand(on, options)
  if (options.pane !== false) registerPane(on, options)
  if (options.replyLine !== false) registerReply(on)
  if (options.spinner !== false) registerSpinner(on)
}
