import { expect, test } from 'claude-code/testing'
import { MAX_LINES, verdict } from '../hooks/read'

const long = Array(MAX_LINES + 50).fill('x').join('\n')

test('a long file without a range is refused with a pointer to Grep and offset/limit', () => {
  const why = verdict('src/big.ts', long, undefined, false)
  expect(why).toContain('450 lines')
  expect(why).toContain('offset and limit')
})

test('a range, a short file, a second try or a non-text file goes through', () => {
  expect(verdict('src/big.ts', long, 40, false)).toBeUndefined()
  expect(verdict('src/small.ts', 'a\nb', undefined, false)).toBeUndefined()
  expect(verdict('src/big.ts', long, undefined, true)).toBeUndefined()
  expect(verdict('docs/spec.pdf', long, undefined, false)).toBeUndefined()
})
