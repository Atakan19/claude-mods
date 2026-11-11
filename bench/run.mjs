#!/usr/bin/env node
// Benchmark runner: the same tasks with and without lean, headless, cost read from `claude -p --output-format json`.
// Usage: node bench/run.mjs --arms baseline,lean --repos click --tasks all --reps 3 [--model sonnet] [--budget 2] [--dry]
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  if (i < 0) return d
  const v = process.argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const arms = String(arg('arms', 'baseline,lean')).split(',')
const reps = Number(arg('reps', 3))
const model = String(arg('model', 'sonnet'))
const budget = String(arg('budget', 2))
const dry = arg('dry', false) === true
const only = (k) => { const v = arg(k, 'all'); return v === 'all' ? null : String(v).split(',') }
const repoFilter = only('repos'), taskFilter = only('tasks')

const cfg = JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8'))
const armDefs = JSON.parse(readFileSync(join(here, 'arms.json'), 'utf8'))
for (const a of arms) if (!armDefs[a]) throw new Error(`unknown arm ${a}; known: ${Object.keys(armDefs).join(', ')}`)
const cache = join(here, '.cache'), outDir = join(here, 'results')
mkdirSync(cache, { recursive: true }); mkdirSync(outDir, { recursive: true })
const resultsFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)

// Commands in tasks.json are written for bash (Git Bash on Windows).
const sh = (cmd, cwd, env) => spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600_000 })

// One pinned clone per repo, set up once; every run works on a fresh copy.
function prepare(repo) {
  const dir = join(cache, repo.name)
  if (!existsSync(dir)) {
    execFileSync('git', ['clone', '--quiet', repo.url, dir])
    execFileSync('git', ['-C', dir, 'checkout', '--quiet', repo.commit])
    if (repo.setup) {
      const r = sh(repo.setup, dir)
      if (r.status !== 0) throw new Error(`setup failed for ${repo.name}: ${r.stderr}`)
    }
  }
  return dir
}

// Keep auth and endpoint, drop what marks the child as a nested session.
function childEnv() {
  const e = { ...process.env }
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_HOST_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_PLUGIN_DIRS', 'CLAUDE_CODE_ENTRYPOINT']) delete e[k]
  return e
}

function claude(armName, work, prompt, sessionArgs) {
  const arm = armDefs[armName]
  const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--max-budget-usd', budget,
    '--setting-sources', 'project', '--strict-mcp-config', '--allowedTools', 'Read Edit Write Bash Glob Grep', ...sessionArgs]
  if (arm.plugin) args.push('--plugin-dir', join(root, 'plugins', 'lean'))
  else args.push('--disable-slash-commands')
  if (arm.config) args.push('--settings', JSON.stringify({ pluginConfigs: { lean: arm.config } }))
  const t0 = Date.now()
  const r = spawnSync('claude', args, { cwd: work, encoding: 'utf8', env: childEnv(), timeout: 1_800_000, maxBuffer: 64 << 20 })
  let j = null
  try { j = JSON.parse(r.stdout) } catch { /* stays null */ }
  const err = j ? (j.is_error ? String(j.result).slice(0, 300) : undefined) : (r.stderr || r.stdout || '').slice(0, 500)
  return { j: j && !j.is_error ? j : null, ms: Date.now() - t0, err }
}

// Git's pack files are read-only, which makes a plain rmSync fail with EPERM on Windows; a failed cleanup never stops the run.
function cleanup(dir) {
  try {
    if (process.platform === 'win32') spawnSync('attrib', ['-r', `${dir}\\*`, '/s', '/d'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  } catch (e) {
    console.log(`could not remove ${dir}: ${e.code}`)
  }
}

const picked =cfg.tasks.filter((t) => (!taskFilter || taskFilter.includes(t.id)) && (!repoFilter || repoFilter.includes(t.repo)))
console.log(`${picked.length * arms.length * reps} runs, model ${model}, cap $${budget} per prompt -> ${resultsFile}`)
if (dry) process.exit(0)

for (const task of picked) {
  const repo = cfg.repos.find((r) => r.name === task.repo)
  const base = prepare(repo)
  const env = { PY: join(base, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python').replaceAll('\\', '/') }
  for (let rep = 1; rep <= reps; rep++) {
    for (const armName of arms) { // arms interleaved, so drift over time hits all of them alike
      const work = mkdtempSync(join(tmpdir(), `lean-bench-${task.id}-`))
      cpSync(base, work, { recursive: true })
      if (task.prepare) sh(task.prepare, work, env)
      const session = randomUUID()
      const calls = []
      for (const [i, prompt] of (task.prompts ?? [task.prompt]).entries()) {
        calls.push(claude(armName, work, prompt, i === 0 ? ['--session-id', session] : ['--resume', session]))
        if (!calls.at(-1).j) break
      }
      const js = calls.map((c) => c.j).filter(Boolean)
      const sum = (f) => js.reduce((a, j) => a + (f(j) ?? 0), 0)
      const verify = task.verify ? sh(task.verify, work, env) : null
      const row = {
        task: task.id, repo: task.repo, kind: task.kind, arm: armName, rep, model,
        ok: js.length === calls.length && js.every((j) => !j.is_error),
        pass: verify ? verify.status === 0 : null,
        cost: sum((j) => j.total_cost_usd), turns: sum((j) => j.num_turns), ms: calls.reduce((a, c) => a + c.ms, 0),
        input: sum((j) => j.usage?.input_tokens), output: sum((j) => j.usage?.output_tokens),
        cacheRead: sum((j) => j.usage?.cache_read_input_tokens), cacheWrite: sum((j) => j.usage?.cache_creation_input_tokens),
        denials: sum((j) => j.permission_denials?.length),
        answer: task.kind === 'explain' ? js.at(-1)?.result : String(js.at(-1)?.result ?? '').slice(0, 400), error: calls.find((c) => c.err)?.err,
      }
      appendFileSync(resultsFile, JSON.stringify(row) + '\n')
      console.log(`${task.id} ${armName} #${rep}: $${row.cost.toFixed(3)} ${row.turns} turns pass=${row.pass} denials=${row.denials}${row.ok ? '' : ' ERROR ' + (row.error ?? '')}`)
      cleanup(work)
    }
  }
}
console.log(`done: node bench/analyze.mjs ${resultsFile}`)
