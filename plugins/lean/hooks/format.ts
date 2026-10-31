import type { EngineInterface, On } from 'claude-code'

// After an Edit or Write, the repo's own formatter tidies the file, so no turn goes to style.
// Only where the repo configures one: formatting a repo that does not use it rewrites whole files.
// Off by default: a file changed under Claude can cost a re-read, which may eat the saving.

const PY = /\.py$/
const JS = /\.([cm]?[jt]sx?|json|css|scss|md|ya?ml|html|vue|svelte)$/
const PRETTIER_FILES = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.yaml', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs']

// Which formatter the repo at `root` configures for `file`, as an argv; undefined for none.
export function formatter(file: string, files: { pyproject: string; ruffToml: boolean; packageJson: string; prettierFile: boolean }): string[] | undefined {
  if (PY.test(file) && (files.ruffToml || /^\[tool\.ruff/m.test(files.pyproject))) return ['ruff', 'format', file]
  if (JS.test(file) && (files.prettierFile || prettierKey(files.packageJson))) return ['npx', '--no-install', 'prettier', '--write', file]
  return undefined
}

// A top-level "prettier" key configures it; one under devDependencies only installs it.
function prettierKey(packageJson: string): boolean {
  try {
    return (JSON.parse(packageJson) as Record<string, unknown>).prettier !== undefined
  } catch {
    return false
  }
}

async function formatFile($: EngineInterface, file: string): Promise<string | undefined> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel']).catch(() => undefined)
  const root = top?.exitCode === 0 ? top.stdout.trim() : undefined
  if (!root) return undefined
  const text = (p: string) => $.fs.read(`${root}/${p}`).then(t => String(t), () => '')
  const argv = formatter(file, {
    pyproject: await text('pyproject.toml'),
    ruffToml: (await $.fs.exists(`${root}/ruff.toml`)) || (await $.fs.exists(`${root}/.ruff.toml`)),
    packageJson: await text('package.json'),
    prettierFile: (await Promise.all(PRETTIER_FILES.map(f => $.fs.exists(`${root}/${f}`)))).some(Boolean),
  })
  if (!argv) return undefined
  const r = await $.process.run(argv, { cwd: root }).catch(() => $.process.run([`${argv[0]}.cmd`, ...argv.slice(1)], { cwd: root })).catch(() => undefined)
  if (!r) return undefined
  return r.exitCode === 0 ? `lean: formatted ${file} with ${argv[0] === 'ruff' ? 'ruff format' : 'prettier'}` : `lean: ${argv.join(' ')} failed: ${r.stderr.trim().slice(0, 300)}`
}

export function registerFormat(on: On) {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const note = await formatFile($, e.file_path).catch(() => undefined)
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const note = await formatFile($, e.file_path).catch(() => undefined)
    return note ? { ...ran, context: [...(ran.context ?? []), note] } : ran
  })
}
