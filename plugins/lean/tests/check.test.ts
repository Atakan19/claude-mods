import { expect, test } from 'claude-code/testing'
import { plan } from '../hooks/check'
import { formatter } from '../hooks/format'

const none = { ruff: false, uv: false, eslint: false, tsc: false, vitest: false, jest: false }

test('check plans only the steps the repo can run, on the changed files', () => {
  const tracked = ['app/health.py', 'tests/test_health.py', 'web/api.ts', 'web/api.test.ts']
  const steps = plan(['app/health.py', 'web/api.ts'], tracked, { ...none, ruff: true, uv: true, tsc: true, vitest: true, jest: true })
  expect(steps.map(s => s.name)).toEqual(['ruff', 'pytest', 'tsc', 'vitest'])
  expect(steps[1].argv).toEqual(['uv', 'run', 'pytest', '-q', 'tests/test_health.py'])
  expect(steps[3].argv).toEqual(['npx', '--no-install', 'vitest', 'related', '--run', 'web/api.ts'])
  expect(plan(['README.md'], tracked, { ...none, ruff: true })).toEqual([])
})

test('format runs only where the repo configures the formatter', () => {
  const bare = { pyproject: '', ruffToml: false, packageJson: '{}', prettierFile: false }
  expect(formatter('a.py', bare)).toBeUndefined()
  expect(formatter('a.py', { ...bare, pyproject: '[tool.ruff]\nline-length = 120' })).toEqual(['ruff', 'format', 'a.py'])
  expect(formatter('a.ts', { ...bare, prettierFile: true })?.slice(-2)).toEqual(['--write', 'a.ts'])
  expect(formatter('a.ts', { ...bare, packageJson: '{"devDependencies":{"prettier":"3.3.0"}}' })).toBeUndefined()
  expect(formatter('a.ts', { ...bare, packageJson: '{"prettier":{"semi":false}}' })).toBeDefined()
})
