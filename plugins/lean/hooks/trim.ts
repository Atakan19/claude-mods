// Shortens shell output before the model reads it. Pure: no engine calls.
//
// Every turn re-sends the whole context, so a 600-line test log is paid for again in each
// later turn. Kept: errors, failures, summaries, and the start and end of long output.
// Cut: progress and pass lines of test runners (pytest, jest, vitest, cargo, go), colour codes,
// and the middle of long output (saved in full by the caller).

// Near the size of core's own 2 KB preview of huge output, but with the end, where errors and summaries sit.
export const MAX_LINES = 100
export const HEAD = 20
export const TAIL = 40

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const PYTEST = /(^|[\s/])(pytest|py\.test)(\s|$)|-m pytest/
const PYTEST_PROGRESS = /^(\S+\.py\s+)?[.sSxXfFE]+(\s+\[\s*\d+%\])?$/
const PYTEST_SUMMARY = /^=+ .*\b(passed|failed|error|errors|skipped|no tests ran)\b.* in [\d.]+s.* =+$/
const PYTEST_FAILING = /^(FAILED|ERROR) |^=+ (FAILURES|ERRORS) =+$/m
const NPM_TEST = /\b(npm|pnpm|yarn|bun)( run)? test\b/

// A test runner: the command that starts it, its summary lines, the lines that only report
// progress or a pass, and what marks a failure. Lines are matched trimmed.
type Runner = { cmd: RegExp; summary: RegExp; noise: RegExp; failing: RegExp }

export const RUNNERS: Runner[] = [
  { cmd: PYTEST, summary: PYTEST_SUMMARY, noise: PYTEST_PROGRESS, failing: PYTEST_FAILING },
  {
    cmd: new RegExp(`\\bjest\\b|${NPM_TEST.source}`),
    summary: /^(Test Suites|Tests|Snapshots|Time):\s/,
    noise: /^(PASS\s|[✓√]\s)/,
    failing: /^\s*(FAIL\s|●)|^Tests:.*\bfailed\b/m,
  },
  {
    cmd: new RegExp(`\\bvitest\\b|${NPM_TEST.source}`),
    summary: /^(Test Files|Tests|Duration)\s/,
    noise: /^[✓√]\s/,
    failing: /^\s*(FAIL|×)\s|^\s*(Test Files|Tests)\s.*\bfailed\b/m,
  },
  {
    cmd: /\bcargo (test|nextest)\b/,
    summary: /^test result: /,
    noise: /^test \S+ \.\.\. ok$|^running \d+ tests?$/,
    failing: /^test result: FAILED|\.\.\. FAILED$/m,
  },
  {
    cmd: /\bgo test\b/,
    summary: /^(ok|FAIL)\s+\S+/,
    noise: /^(=== (RUN|PAUSE|CONT)|--- PASS|PASS$|\?\s)/,
    failing: /^\s*(--- FAIL|FAIL)\b/m,
  },
]

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

  const runner = RUNNERS.find(r => r.cmd.test(command) && lines.some(l => r.summary.test(l.trim())))
  if (runner) {
    lines = lines.filter(l => !runner.noise.test(l.trim()))
    // All green: the summary lines say everything the model needs.
    if (!runner.failing.test(lines.join('\n'))) {
      const summary = lines.filter(l => runner.summary.test(l.trim()))
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
