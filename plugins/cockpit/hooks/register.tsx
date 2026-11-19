import type { Register } from 'claude-code'

import { registerBand } from './band'
import { registerData } from './data'
import { handoffTokens, registerHandoff } from './handoff'
import { registerPane } from './pane'
import { registerPlan, registerPlanTool } from './plan'
import { registerReply } from './reply'
import { registerSpinner } from './spinner'

// Wiring only: each part lives in its own file and can be switched off in /config.
export const register: Register = (on, options) => {
  const handoffAt = handoffTokens(options.handoffAtK ?? 200)
  registerData(on, options.toasts !== false, options.pane !== false, options.sounds !== false, options.language, options.planTool === true, handoffAt)
  // A hint only: past the size the band recommends /handoff, and the person decides when.
  if (handoffAt > 0) registerHandoff(on)
  if (options.plan !== false) registerPlan(on)
  // Off by default: the tool's description costs tokens on every request.
  if (options.planTool === true) registerPlanTool(on)
  if (options.band !== false) registerBand(on, options)
  if (options.pane !== false) registerPane(on, options)
  if (options.replyLine !== false) registerReply(on)
  if (options.spinner !== false) registerSpinner(on)
}
