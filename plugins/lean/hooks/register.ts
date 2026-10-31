import type { EngineInterface, Register, ToolCallResult } from 'claude-code'
import { handoffOptions, registerHandoff } from './handoff'
import { FULL_OUTPUT, trim } from './trim'

const EXIT = /^Exit code -?\d+\r?\n/

type Shell = 'Bash' | 'PowerShell'
// The fields both shells' records share (BuiltinToolResults in the engine's types).
type ShellRecord = { stdout: string; isImage?: boolean; interrupted: boolean; backgroundTaskId?: string }

// Characters kept out of the context this session; the module restarts on reload, so does the count.
let saved = 0

async function shorten<T extends Shell>(
  $: EngineInterface,
  e: { command: string; tool_use_id: string },
  ran: ToolCallResult<T>,
): Promise<ToolCallResult<T>> {
  if (ran.deny !== undefined) return ran
  const r = ran.isError ? undefined : (ran.result as ShellRecord)
  if (r && (r.isImage || r.interrupted || r.backgroundTaskId)) return ran

  // A failing command (red tests, a broken build) arrives as error text: "Exit code N\n<output>".
  const raw = r ? r.stdout : typeof ran.text === 'string' && EXIT.test(ran.text) ? ran.text : undefined
  if (raw === undefined) return ran

  const exit = r ? '' : raw.match(EXIT)![0]
  const out = trim(e.command, raw.slice(exit.length))
  if (out.cut === 0) return ran

  let text = out.text
  if (out.needsFullOutput) {
    // shortcut: one file per long output, never cleaned up; add rotation if the folder grows.
    const path = `${$.plugin.root}/.out/${Date.now()}-${e.tool_use_id.slice(-6)}.txt`
    await $.fs.write(path, raw)
    text = text.replace(FULL_OUTPUT, path)
  }
  saved += raw.length - exit.length - text.length
  $.ui.status(`lean: ~${Math.round(saved / 4000)}k tokens trimmed`)

  // Drop core's size bookkeeping of the untrimmed output, or it persists our short text as "too large".
  const { persistedOutputPath, persistedOutputSize, rawOutputPath, ...kept } = (r ?? {}) as ShellRecord & Record<string, unknown>
  const result = r ? { ...kept, stdout: text } : { stdout: exit + text, stderr: '', interrupted: false }
  return { result, context: ran.context } as ToolCallResult<T>
}

export const register: Register = (on, options) => {
  // No .catch: if a hook throws, the engine passes the untrimmed result through.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => shorten($, e, await next(e)))
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => shorten($, e, await next(e)))
  const handoff = handoffOptions(options)
  if (handoff) registerHandoff(on, handoff)
}
