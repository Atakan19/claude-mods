import type { Register } from 'claude-code'

import { registerBand } from './band'
import { registerData } from './data'
import { registerPane } from './pane'
import { registerPlan } from './plan'
import { registerReply } from './reply'
import { registerSpinner } from './spinner'

// Wiring only: each part lives in its own file and can be switched off in /config.
export const register: Register = (on, options) => {
  registerData(on, options.toasts !== false, options.pane !== false, options.sounds !== false)
  if (options.plan !== false) registerPlan(on)
  if (options.band !== false) registerBand(on)
  if (options.pane !== false) registerPane(on)
  if (options.replyLine !== false) registerReply(on)
  if (options.spinner !== false) registerSpinner(on)
}
