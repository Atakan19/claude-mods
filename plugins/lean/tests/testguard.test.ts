import { expect, test } from 'claude-code/testing'
import { isFullSuite, testsFor } from '../hooks/testguard'

test('a whole-suite command is told apart from a narrowed one', () => {
  for (const c of ['pytest', 'uv run pytest -q', 'python -m pytest -n 4', 'pytest tests/', 'npm test', 'pnpm run test', 'npx vitest run', 'jest --ci'])
    expect(isFullSuite(c)).toBe(true)
  for (const c of ['pytest tests/test_health.py', 'pytest -k health', 'pytest --lf', 'pytest --testmon', 'pytest tests/unit/api',
    'vitest related src/a.ts --run', 'jest --findRelatedTests src/a.ts', 'npm test -- src/a.test.ts', 'cd sub && pytest', 'git status'])
    expect(isFullSuite(c)).toBe(false)
})

test('the tests for changed files are found by name', () => {
  const tracked = ['src/app/health.py', 'tests/test_health.py', 'tests/test_users.py', 'web/api.ts', 'web/api.test.ts']
  expect(testsFor(['src/app/health.py', 'web/api.ts', 'tests/test_users.py'], tracked))
    .toEqual(['tests/test_users.py', 'tests/test_health.py', 'web/api.test.ts'])
})

test('after a green full run, a small change gets one refusal with its files, then the run goes through', { options: {} }, async ($, on) => {
  let diff = ''
  on('process.run', (_, e) => {
    const a = e.argv.join(' ')
    const out = a.includes('show-toplevel') ? '/work' : a.includes('stash create') ? 'abc123'
      : a.includes('diff --name-only') ? diff : a === 'git ls-files' ? 'src/health.py\ntests/test_health.py' : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } } as never
  })
  let runs = 0
  on('tool.call', () => {
    runs++
    return { result: { stdout: '===== 3 passed in 0.10s =====', interrupted: false } }
  })
  const run = () => $.tool.call({ tool: 'Bash', command: 'uv run pytest -q', description: 'Run tests' })

  expect((await run()).deny).toBeUndefined()
  diff = 'src/health.py'
  const refused = await run()
  expect(refused.deny).toContain('src/health.py')
  expect(refused.deny).toContain('tests/test_health.py')
  expect((await run()).deny).toBeUndefined()
  expect(runs).toBe(2)
})
