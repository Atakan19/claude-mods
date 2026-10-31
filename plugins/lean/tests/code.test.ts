import { expect, test } from 'claude-code/testing'
import { outline, showDef, showMap, showOutline } from '../hooks/code'

const py = [
  'import os',
  '',
  'class Health:',
  '    """Reports uptime."""',
  '',
  '    def __init__(self, started: float):',
  '        self.started = started',
  '',
  '    async def report(',
  '        self,',
  '        now: float,',
  '    ) -> dict:',
  '        return {"uptime": now - self.started}',
  '',
  '',
  'def main():',
  '    print(Health(0))',
].join('\n')

const ts = [
  "import { x } from './x'",
  '',
  'export interface Opts {',
  '  size: number',
  '}',
  '',
  'export class Store {',
  '  private items: string[] = []',
  '',
  '  add(item: string): void {',
  '    if (item) this.items.push(item)',
  '  }',
  '',
  '  async load(path: string) {',
  '    const raw = await read(path)',
  '    return raw',
  '  }',
  '}',
  '',
  'export const LIMIT = 5',
  '',
  'export function make(o: Opts): Store {',
  '  const s = new Store()',
  '  return s',
  '}',
].join('\n')

test('a Python outline has classes, methods and functions with line ranges and full signatures', () => {
  const s = outline('app/health.py', py)
  expect(s.map(x => [x.name, x.line, x.end, x.depth])).toEqual([['Health', 3, 13, 0], ['__init__', 6, 7, 1], ['report', 9, 13, 1], ['main', 16, 17, 0]])
  expect(s[2].sig).toBe('async def report( self, now: float, ) -> dict:')
})

test('a TS outline has the declarations and class methods, not statements in bodies', () => {
  const s = outline('web/store.ts', ts)
  expect(s.map(x => [x.name, x.line, x.end])).toEqual([['Opts', 3, 5], ['Store', 7, 18], ['add', 10, 12], ['load', 14, 17], ['LIMIT', 20, 20], ['make', 22, 25]])
  expect(showOutline('web/store.ts', ts)).toContain('    10-12 add(item: string): void')
})

test('def returns one definition with its location; map lists top-level names per folder', () => {
  expect(showDef('app/health.py', py, 'main')).toBe('app/health.py:16-17\ndef main():\n    print(Health(0))')
  expect(showDef('app/health.py', py, 'nope')).toBeUndefined()
  expect(showMap([{ path: 'app/health.py', text: py }, { path: 'web/store.ts', text: ts }]))
    .toBe('app/\n  health.py (17): Health, main\nweb/\n  store.ts (25): Opts, Store, LIMIT, make')
})
