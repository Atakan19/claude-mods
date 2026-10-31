import { expect, test } from 'claude-code/testing'

const long = Array.from({ length: 300 }, (_, i) => `step ${i}`).join('\n')

test('long shell output is cut, saved to the next ring slot, and core size bookkeeping is dropped', { options: {} }, async ($, on) => {
  const writes: string[] = []
  const slots: unknown[] = []
  on('store.get', () => ({ value: 7 }))
  on('store.set', (_, e) => {
    slots.push(e.value)
    return { value: undefined }
  })
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  on('tool.call', (_, e) => e.command === 'npm run build'
    ? { result: { stdout: long, interrupted: false, persistedOutputPath: '/tmp/big.txt', persistedOutputSize: 9 } }
    : { result: `Exit code 1\n${long}`, isError: true, text: `Exit code 1\n${long}` } as never)
  on('ui.status', () => ({ value: undefined }))

  const ok = await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'Build' })
  const r = ok.result as Record<string, unknown>
  expect(writes[0]).toMatch(/[\\/]\.out[\\/]7\.txt$/)
  expect(slots[0]).toBe(8)
  expect(r.stdout).toContain('lines cut. Full output:')
  expect(r.stdout).toContain('7.txt')
  expect(r.persistedOutputPath).toBeUndefined()

  const red = await $.tool.call({ tool: 'Bash', command: 'make', description: 'Make' })
  const s = (red.result as { stdout: string }).stdout
  expect(s.startsWith('Exit code 1\n')).toBe(true)
  expect(s).toContain('step 299')
  expect(s).not.toContain('step 150')
})
