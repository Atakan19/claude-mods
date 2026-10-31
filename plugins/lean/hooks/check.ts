import type { EngineInterface, On } from 'claude-code'
import { testsFor } from './testguard'
import { FULL_OUTPUT, trim } from './trim'

// Lint, typecheck and the tests of the changed files in one tool call, failures only. Five shell
// calls are five turns, each re-sending the whole context; this is one.

export const TOOL = 'check'
const TOOL_DESCRIPTION = `Checks the changed files in one call: ruff on changed Python files and pytest on their tests; eslint, tsc and vitest related (or jest --findRelatedTests) on changed JS/TS files. Prints one line per step and the failures only.
Use it after a change and before a commit, instead of running lint, typecheck and tests one by one. files: the files to check; default all changed and untracked files in the repo.`

// What the repo has, so only steps that can run are planned.
export type Has = { ruff: boolean; uv: boolean; eslint: boolean; tsc: boolean; vitest: boolean; jest: boolean }
export type Step = { name: string; argv: string[]; isTest?: boolean }

const PY = /\.py$/
const JS = /\.[cm]?[jt]sx?$/

export function plan(changed: string[], tracked: string[], has: Has): Step[] {
  const py = changed.filter(f => PY.test(f))
  const js = changed.filter(f => JS.test(f))
  const steps: Step[] = []
  if (py.length && has.ruff) steps.push({ name: 'ruff', argv: ['ruff', 'check', '--output-format', 'concise', ...py] })
  const pyTests = testsFor(py, tracked).filter(f => PY.test(f))
  if (pyTests.length) steps.push({ name: 'pytest', argv: [...(has.uv ? ['uv', 'run'] : ['python', '-m']), 'pytest', '-q', ...pyTests], isTest: true })
  if (js.length && has.eslint) steps.push({ name: 'eslint', argv: ['npx', '--no-install', 'eslint', ...js] })
  if (js.some(f => /\.[cm]?tsx?$/.test(f)) && has.tsc) steps.push({ name: 'tsc', argv: ['npx', '--no-install', 'tsc', '--noEmit'] })
  if (js.length && has.vitest) steps.push({ name: 'vitest', argv: ['npx', '--no-install', 'vitest', 'related', '--run', ...js], isTest: true })
  else if (js.length && has.jest) steps.push({ name: 'jest', argv: ['npx', '--no-install', 'jest', '--findRelatedTests', ...js], isTest: true })
  return steps
}

const lines = (s: string | undefined) => (s ? s.split(/\r?\n/).filter(Boolean) : [])

// Windows starts npx and uv through their .cmd/.exe shims; argv without a shell needs the .cmd name.
async function run($: EngineInterface, argv: string[], cwd: string, timeoutMs: number) {
  try {
    return await $.process.run(argv, { cwd, timeoutMs })
  } catch {
    return await $.process.run([`${argv[0]}.cmd`, ...argv.slice(1)], { cwd, timeoutMs })
  }
}

async function detect($: EngineInterface, root: string, tracked: string[]): Promise<Has> {
  const pkg = await $.fs.read(`${root}/package.json`).then(t => String(t), () => '')
  const dep = (name: string) => new RegExp(`"${name}"\\s*:`).test(pkg)
  const ruff = await $.process.run(['ruff', '--version'], { cwd: root }).then(r => r.exitCode === 0, () => false)
  return {
    ruff,
    uv: tracked.includes('uv.lock'),
    eslint: dep('eslint'),
    tsc: dep('typescript') && tracked.includes('tsconfig.json'),
    vitest: dep('vitest'),
    jest: dep('jest'),
  }
}

async function checkFiles($: EngineInterface, files: string[] | undefined): Promise<string> {
  const git = (...a: string[]) => $.process.run(['git', ...a]).then(r => (r.exitCode === 0 ? r.stdout : undefined), () => undefined)
  const root = (await git('rev-parse', '--show-toplevel'))?.trim()
  if (!root) return 'check: not in a git repository'
  const tracked = lines(await git('ls-files'))
  const changed = files?.length ? files : [...new Set([...lines(await git('diff', '--name-only', 'HEAD')), ...lines(await git('ls-files', '--others', '--exclude-standard'))])]
  if (changed.length === 0) return 'check: no changed files'

  const steps = plan(changed, tracked, await detect($, root, tracked))
  if (steps.length === 0) return `check: nothing to run for ${changed.length} changed file(s) (no ruff, tests, eslint, tsc or test runner found)`
  const out: string[] = []
  let failed = 0
  for (const s of steps) {
    const r = await run($, s.argv, root, s.isTest ? 600_000 : 120_000).catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    const raw = `${r.stdout}\n${r.stderr}`.trim()
    const short = trim(s.argv.join(' '), raw).text.replace(FULL_OUTPUT, 'run the step in the shell for the full log')
    if (r.exitCode === 0) {
      out.push(`${s.name}: ok${s.isTest ? ` (${lines(short).at(-1) ?? ''})` : ''}`)
    } else {
      failed++
      out.push(`${s.name}: failed (exit ${r.exitCode})`, short)
    }
  }
  out.push(failed ? `check: ${failed} of ${steps.length} steps failed` : `check: green (${steps.map(s => s.name).join(', ')})`)
  return out.join('\n')
}

// Called from the one session.start hook in register.ts.
export async function startCheckTool($: EngineInterface) {
  await $.tool.register({
    name: TOOL,
    description: TOOL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string' }, description: 'Files to check, repo-relative; default all changed files' } },
    },
    isDeferred: false,
  })
}

export function registerCheckTool(on: On) {
  on('tool.call', { tool: `mcp__lean__${TOOL}` }, async ($, e) => {
    const files = (e as unknown as { files?: unknown }).files
    return { result: await checkFiles($, Array.isArray(files) ? files.map(String) : undefined) }
  })
}
