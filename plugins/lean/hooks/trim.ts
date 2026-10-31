// Shortens shell output before the model reads it. Pure: no engine calls.
//
// Every turn re-sends the whole context, so a 600-line test log is paid for again in each
// later turn. Kept: errors, failures, summaries, and the start and end of long output.
// Cut: progress lines, colour codes, and the middle of long output (saved in full by the caller).

// Near the size of core's own 2 KB preview of huge output, but with the end, where errors and summaries sit.
export const MAX_LINES = 100
export const HEAD = 20
export const TAIL = 40

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const PYTEST = /(^|[\s/])(pytest|py\.test)(\s|$)|-m pytest/
const PYTEST_PROGRESS = /^(\S+\.py\s+)?[.sSxXfFE]+(\s+\[\s*\d+%\])?$/
const PYTEST_SUMMARY = /^=+ .*\b(passed|failed|error|errors|skipped|no tests ran)\b.* in [\d.]+s.* =+$/
const PYTEST_FAILING = /^(FAILED|ERROR) |^=+ (FAILURES|ERRORS) =+$/m

export type Trimmed = {
  text: string
  /** Lines left out of `text`; 0 when nothing was cut. */
  cut: number
  /** Where `text` holds the marker the caller replaces with the saved file's path. */
  needsFullOutput: boolean
}

export const FULL_OUTPUT = '{LEAN_FULL_OUTPUT}'

export function trim(command: string, output: string): Trimmed {
  let lines = output.replace(ANSI, '').split(/\r?\n/)
  const before = lines.length

  if (PYTEST.test(command) && lines.some(l => PYTEST_SUMMARY.test(l.trim()))) {
    lines = lines.filter(l => !PYTEST_PROGRESS.test(l.trim()))
    // All green: the summary line says everything the model needs.
    if (!PYTEST_FAILING.test(lines.join('\n'))) {
      const summary = lines.filter(l => PYTEST_SUMMARY.test(l.trim()))
      return { text: summary.join('\n'), cut: before - summary.length, needsFullOutput: false }
    }
  }

  if (lines.length <= MAX_LINES) {
    const text = lines.join('\n')
    return { text, cut: before - lines.length, needsFullOutput: false }
  }

  const middle = lines.length - HEAD - TAIL
  const text = [
    ...lines.slice(0, HEAD),
    `… [lean: ${middle} lines cut. Full output: ${FULL_OUTPUT}]`,
    ...lines.slice(-TAIL),
  ].join('\n')
  return { text, cut: before - HEAD - TAIL, needsFullOutput: true }
}
