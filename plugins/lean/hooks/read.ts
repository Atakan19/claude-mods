import type { On } from 'claude-code'

// Whole-file Reads were the biggest single context cost measured (28 KB per call on average).
// A long file read without a range is refused once with a pointer to Grep + offset/limit;
// the same Read again goes through, for when most of the file really is needed.

export const MAX_LINES = 400
const NOT_TEXT = /\.(pdf|png|jpe?g|gif|webp|bmp|ico|svg|ipynb)$/i

export function verdict(path: string, text: string, limit: number | undefined, refusedBefore: boolean): string | undefined {
  if (limit !== undefined || refusedBefore || NOT_TEXT.test(path)) return undefined
  const lines = text.split('\n').length
  if (lines <= MAX_LINES) return undefined
  return `lean: ${path} has ${lines} lines. Grep for what you need, then Read that range with offset and limit. `
    + 'If you change most of the file, send the same Read again and it goes through.'
}

export function registerReadGuard(on: On) {
  // Paths refused once this session; the module restarts on reload, so does the list.
  const refused = new Set<string>()
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    let text: string
    try {
      text = await $.fs.read(e.file_path)
    } catch {
      return next(e) // missing, over 4 MiB or binary: the tool says so itself
    }
    const why = verdict(e.file_path, text, e.limit, refused.has(e.file_path))
    if (why === undefined) return next(e)
    refused.add(e.file_path)
    return { deny: why }
  })
}
