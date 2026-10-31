import { expect, test } from 'claude-code/testing'
import { FULL_OUTPUT, HEAD, MAX_LINES, TAIL, trim } from '../hooks/trim'

const green = [
  '============================= test session starts =============================',
  'collected 566 items',
  '',
  'tests/test_health.py ....                                                [  1%]',
  'tests/test_http_api.py .................s....                             [ 50%]',
  '...........................................................................  [100%]',
  '=============== 566 passed, 12 skipped, 1 warning in 65.87s (0:01:05) ===============',
].join('\n')

const red = [
  '============================= test session starts =============================',
  'tests/test_health.py ..F.                                                [ 40%]',
  '=================================== FAILURES ===================================',
  '_________________________ test_health_reports_uptime __________________________',
  '>       assert body["uptime_seconds"] >= 0',
  'E       KeyError: \'uptime_seconds\'',
  '=========================== short test summary info ============================',
  'FAILED tests/test_health.py::test_health_reports_uptime - KeyError',
  '========================= 1 failed, 3 passed in 0.91s =========================',
].join('\n')

test('green jest, vitest and cargo runs collapse to their summary lines', () => {
  const jest = ['PASS src/a.test.ts', 'PASS src/b.test.ts', 'Test Suites: 2 passed, 2 total', 'Tests:       9 passed, 9 total', 'Time:        1.2 s']
  expect(trim('npx jest', jest.join('\n')).text).toBe(jest.slice(2).join('\n'))
  const vitest = [' ✓ src/a.test.ts (3 tests) 5ms', ' ✓ src/b.test.ts (6 tests) 9ms', '', ' Test Files  2 passed (2)', '      Tests  9 passed (9)', '   Duration  1.10s']
  expect(trim('npm test', vitest.join('\n')).text).toBe(vitest.slice(3).join('\n'))
  const cargo = ['running 2 tests', 'test a::works ... ok', 'test b::works ... ok', '', 'test result: ok. 2 passed; 0 failed; 0 ignored']
  expect(trim('cargo test', cargo.join('\n')).text).toBe('test result: ok. 2 passed; 0 failed; 0 ignored')
})

test('a red vitest run keeps the failure and drops the passing files', () => {
  const red = [' ✓ src/a.test.ts (3 tests) 5ms', ' × src/b.test.ts > adds', '   AssertionError: expected 3 to be 4', ' Test Files  1 failed | 1 passed (2)', '      Tests  1 failed | 8 passed (9)']
  const r = trim('npx vitest run', red.join('\n'))
  expect(r.text).not.toContain('src/a.test.ts')
  expect(r.text).toContain('AssertionError')
})

test('a file printed on purpose stays whole up to the dump size', () => {
  const file = Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n')
  expect(trim('cat hooks/handoff.ts', file).cut).toBe(0)
  expect(trim('for f in a b; do echo; cat "$f"; done', file).cut).toBe(0)
  expect(trim('npm run build', file).needsFullOutput).toBe(true)
})

test('green pytest run collapses to its summary line', () => {
  const r = trim('uv run pytest -q', green)
  expect(r.text).toBe('=============== 566 passed, 12 skipped, 1 warning in 65.87s (0:01:05) ===============')
  expect(r.needsFullOutput).toBe(false)
})

test('red pytest run keeps the failure, drops only progress lines', () => {
  const r = trim('python -m pytest tests', red)
  expect(r.text).toContain("E       KeyError: 'uptime_seconds'")
  expect(r.text).toContain('FAILED tests/test_health.py::test_health_reports_uptime - KeyError')
  expect(r.text).toContain('1 failed, 3 passed')
  expect(r.text).not.toContain('..F.')
})

test('a summary-looking line in non-pytest output is left alone', () => {
  const r = trim('cat notes.txt', green)
  expect(r.cut).toBe(0)
})

test('long output keeps head and tail and points at the full file', () => {
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`)
  const r = trim('git log', lines.join('\n'))
  const out = r.text.split('\n')
  expect(r.needsFullOutput).toBe(true)
  expect(out).toHaveLength(HEAD + TAIL + 1)
  expect(out[0]).toBe('line 0')
  expect(out.at(-1)).toBe('line 999')
  expect(r.text).toContain(FULL_OUTPUT)
  expect(r.cut).toBe(1000 - HEAD - TAIL)
})

test('short output is untouched apart from colour codes', () => {
  expect(trim('ls', 'a\nb').cut).toBe(0)
  expect(trim('ls', '\x1b[32mok\x1b[0m').text).toBe('ok')
  expect(trim('seq', Array(MAX_LINES).fill('x').join('\n')).cut).toBe(0)
})
