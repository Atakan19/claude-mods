import type { EngineInterface, On } from 'claude-code'

// Claude likes to run the whole suite after touching three files. When the last full run in this
// repo was green and only a few files changed since, the full run is refused once with the files
// and their tests; the same command again goes through (the final check before a push).

export const MAX_CHANGED = 15

const PYTEST = /(?:^|[\s/])(?:pytest|py\.test)(?=\s|$)|-m pytest(?=\s|$)/
const JS = /\b(?:vitest|jest)\b|\b(?:npm|pnpm|yarn|bun)(?: run)? test\b/
// A path or a selector: the run is already narrowed.
const PY_TARGET = /\.py\b|::|^-(k|m)$|^--(lf|last-failed|ff|failed-first|testmon|sw|stepwise|deselect|co|collect-only)$/
const JS_TARGET = /^related$|^--(findRelatedTests|changed|onlyChanged|testNamePattern|shard)\b|^-(t|o)$|\.(test|spec)\.|\.[cm]?[jt]sx?$/
const TOP_DIR = /^\.?[\\/]?(tests?|__tests__|src|spec)[\\/]?$/
// The run's folder is not the session's: the guard cannot tell what changed there.
const MOVES = /(^|[;&|]\s*)(cd|pushd|Set-Location|sl)\s/i

function argsAfter(command: string, runner: RegExp): string[] | undefined {
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const m = part.match(runner)
    if (m) return part.slice(m.index! + m[0].length).trim().split(/\s+/).filter(Boolean)
  }
  return undefined
}

const narrowed = (args: string[], target: RegExp) =>
  args.some(a => target.test(a) || (!a.startsWith('-') && /[\\/]/.test(a) && !TOP_DIR.test(a)))

export function isFullSuite(command: string): boolean {
  if (MOVES.test(command)) return false
  const py = argsAfter(command, PYTEST)
  if (py) return !narrowed(py, PY_TARGET)
  const js = argsAfter(command, JS)
  if (js) return !narrowed(js, JS_TARGET)
  return false
}

const TEST_FILE = /(^|[\\/])(test_[^\\/]+\.py|[^\\/]+_test\.(py|go)|[^\\/]+\.(test|spec)\.[cm]?[jt]sx?)$/

// `src/app/health.py` → `health`; `tests/test_health.py`, `health.test.ts` → `health` too.
const stem = (f: string) =>
  f.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, '').replace(/^test_|_test$/g, '')

// The changed files that are tests, plus the tests named after the other changed files.
export function testsFor(changed: string[], tracked: string[]): string[] {
  const stems = new Set(changed.filter(f => !TEST_FILE.test(f)).map(stem))
  const named = tracked.filter(f => TEST_FILE.test(f) && stems.has(stem(f)))
  return [...new Set([...changed.filter(f => TEST_FILE.test(f)), ...named])]
}

export function refusal(changed: string[], tests: string[]): string {
  const list = (xs: string[]) => xs.slice(0, 10).join(', ') + (xs.length > 10 ? `, … (${xs.length - 10} more)` : '')
  const what = changed.length === 0
    ? 'nothing changed since then'
    : `only ${changed.length} file${changed.length === 1 ? '' : 's'} changed since then: ${list(changed)}`
  const run = tests.length > 0 ? ` Run their tests first: ${list(tests)}.` : ''
  return `lean: the last full test run here was green and ${what}.${run} `
    + 'Python with pytest-testmon: `pytest --testmon` runs only the tests that touch changed code; after a failure `pytest --lf`. '
    + 'JS: `vitest related <files> --run` or `jest --findRelatedTests <files>`. '
    + 'For the final check before a push, send the same command again and it goes through.'
}

const git = async ($: EngineInterface, ...args: string[]) => {
  const r = await $.process.run(['git', ...args])
  return r.exitCode === 0 ? r.stdout.trim() : undefined
}
const lines = (s: string | undefined) => (s ? s.split(/\r?\n/).filter(Boolean) : [])

// The working tree as a commit (tracked files, nothing in the tree is touched) plus the untracked files.
type Green = { tree: string; untracked: Set<string> }

async function snapshot($: EngineInterface): Promise<Green | undefined> {
  const tree = (await git($, 'stash', 'create')) || (await git($, 'rev-parse', 'HEAD'))
  if (!tree) return undefined
  return { tree, untracked: new Set(lines(await git($, 'ls-files', '--others', '--exclude-standard'))) }
}

async function changedSince($: EngineInterface, g: Green): Promise<string[] | undefined> {
  const diff = await git($, 'diff', '--name-only', g.tree)
  if (diff === undefined) return undefined
  const fresh = lines(await git($, 'ls-files', '--others', '--exclude-standard')).filter(f => !g.untracked.has(f))
  return [...new Set([...lines(diff), ...fresh])]
}

// Per repo root; the module restarts on reload, so do both.
const green = new Map<string, Green>()
const refused = new Set<string>()

type Run = { command: string; run_in_background?: boolean }
const watched = (e: Run) => !e.run_in_background && isFullSuite(e.command)
const repoRoot = ($: EngineInterface) => git($, 'rev-parse', '--show-toplevel').catch(() => undefined)

// Before the run: the refusal text, or undefined to let it go.
async function check($: EngineInterface, e: Run): Promise<string | undefined> {
  if (!watched(e)) return undefined
  const root = await repoRoot($)
  const last = root && green.get(root)
  if (!last || refused.has(e.command)) return undefined
  const changed = await changedSince($, last).catch(() => undefined)
  if (!changed || changed.length > MAX_CHANGED) return undefined
  refused.add(e.command)
  return refusal(changed, testsFor(changed, lines(await git($, 'ls-files').catch(() => undefined))))
}

// After the run: a green full run becomes the new reference.
async function record<R extends { deny?: string; isError?: boolean }>($: EngineInterface, e: Run, ran: R): Promise<R> {
  if (!watched(e)) return ran
  refused.delete(e.command)
  if (ran.deny !== undefined || ran.isError) return ran
  const root = await repoRoot($)
  const g = root && (await snapshot($).catch(() => undefined))
  if (root && g) green.set(root, g)
  return ran
}

export function registerTestGuard(on: On) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const deny = await check($, e)
    return deny !== undefined ? { deny } : record($, e, await next(e))
  })
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const deny = await check($, e)
    return deny !== undefined ? { deny } : record($, e, await next(e))
  })
}
