#!/usr/bin/env node
// Summarise a results file: per task and arm the median cost, turns and pass rate, and the change against baseline.
import { readFileSync } from 'node:fs'

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const good = rows.filter((r) => r.ok)
if (good.length < rows.length) console.log(`${rows.length - good.length} failed runs left out\n`)

const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
// 90% bootstrap interval of the ratio of medians (arm / baseline).
function ratioCI(a, b, n = 2000) {
  const pick = (x) => x.map(() => x[Math.floor(Math.random() * x.length)])
  const rs = Array.from({ length: n }, () => med(pick(a)) / med(pick(b))).sort((x, y) => x - y)
  return [rs[Math.floor(n * 0.05)], rs[Math.floor(n * 0.95)]]
}
const group = (list, f) => list.reduce((m, r) => ((m[f(r)] ??= []).push(r), m), {})
const pct = (x) => `${x >= 1 ? '+' : ''}${((x - 1) * 100).toFixed(0)}%`

// Context volume = every input token the model read (fresh, cached, newly cached). Unlike the cost it does not
// depend on whether the prompt cache happened to be warm, which differs between arms (each arm has its own prefix).
for (const r of good) r.ctx = r.input + r.cacheRead + r.cacheWrite
console.log('task | arm | n | cost (median) | vs baseline [90% CI] | context volume vs baseline | turns | pass')
for (const [task, tr] of Object.entries(group(good, (r) => r.task))) {
  const base = tr.filter((r) => r.arm === 'baseline').map((r) => r.cost)
  for (const [arm, ar] of Object.entries(group(tr, (r) => r.arm))) {
    const c = ar.map((r) => r.cost)
    const graded = ar.filter((r) => r.pass !== null)
    let vs = '-'
    if (arm !== 'baseline' && base.length > 1 && c.length > 1) {
      const [lo, hi] = ratioCI(c, base)
      vs = `${pct(med(c) / med(base))} [${pct(lo)}, ${pct(hi)}]`
    }
    const baseCtx = tr.filter((r) => r.arm === 'baseline').map((r) => r.ctx)
    const ctx = med(ar.map((r) => r.ctx))
    console.log([task, arm, ar.length, `$${med(c).toFixed(3)}`, vs,
      `${(ctx / 1000).toFixed(0)}k` + (arm !== 'baseline' && baseCtx.length ? ` (${pct(ctx / med(baseCtx))})` : ''), med(ar.map((r) => r.turns)).toFixed(0), graded.length ? `${graded.filter((r) => r.pass).length}/${graded.length}` : '-'].join(' | '))
  }
}
