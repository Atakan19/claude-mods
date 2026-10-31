import type { EngineInterface, On } from 'claude-code'

// Claude mostly needs one function or class, not a file. This tool answers from the code's shape:
// an outline (signatures with line ranges), one definition's body, its references, or a map of
// the repo. No model and no parser to install: Python by indentation, JS/TS by bracket balance.

export const TOOL = 'code'
const TOOL_DESCRIPTION = `Reads code by its shape instead of whole files. action:
- outline {path}: classes, functions and methods of a file with their line ranges and signatures
- def {name, path?}: the source of one function, class, type or constant (searched in the repo without path)
- refs {name}: where a name is used, as file:line
- map {path?}: the repo (or a folder) as files with their top-level names, for a first look
Use outline or def before reading a code file over about 300 lines; refs instead of grepping for callers.`

export type Symbol = { name: string; kind: string; line: number; end: number; depth: number; sig: string }

const PY = /\.pyi?$/
const JS = /\.([cm]?[jt]sx?|vue|svelte)$/
export const isCode = (path: string) => PY.test(path) || JS.test(path)

const PY_DECL = /^(\s*)(async\s+def|def|class)\s+(\w+)/
const JS_DECL = /^(\s*)(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|const|let|var)\s+([\w$]+)/
const JS_MEMBER = /^(\s+)(?:(?:public|private|protected|static|readonly|async|get|set|override|abstract)\s+)*([\w$#]+)\s*(?:<[^>]*>)?\s*\(/
const NOT_MEMBER = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'await', 'new', 'typeof', 'super', 'this'])

const indent = (l: string) => l.match(/^\s*/)![0].length
const blank = (l: string) => /^\s*(#.*)?$/.test(l)

function pythonOutline(lines: string[]): Symbol[] {
  const out: Symbol[] = []
  const stack: number[] = []
  lines.forEach((l, i) => {
    const m = l.match(PY_DECL)
    if (!m) return
    const ind = m[1].length
    // The body ends before the next non-blank line indented no deeper than the def.
    let end = i
    let sigEnd = i
    let depth = 0
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/[([{]/g) ?? []).length - (lines[j].match(/[)\]}]/g) ?? []).length
      if (depth <= 0 && /:\s*(#.*)?$/.test(lines[j])) { sigEnd = j; break }
    }
    for (let j = sigEnd + 1; j < lines.length; j++) {
      if (blank(lines[j])) continue
      if (indent(lines[j]) <= ind) break
      end = j
    }
    while (stack.length && stack[stack.length - 1] >= ind) stack.pop()
    out.push({ name: m[3], kind: m[2].replace(/\s+/, ' '), line: i + 1, end: Math.max(end, sigEnd) + 1, depth: stack.length, sig: lines.slice(i, sigEnd + 1).map(s => s.trim()).join(' ') })
    stack.push(ind)
  })
  return out
}

// From `start`, the last line of the statement: brackets opened on it are closed again.
function jsEnd(lines: string[], start: number): number {
  let depth = 0
  for (let j = start; j < lines.length; j++) {
    const code = lines[j].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '')
    for (const c of code) {
      if ('{[('.includes(c)) depth++
      else if ('}])'.includes(c)) depth--
    }
    // Balanced and not ending in an operator that carries on (`=>`, `=`, `,`, `&&`, ...).
    if (depth <= 0 && !/([=(:,?|&+\-*]|=>)\s*$/.test(code)) return j
  }
  return lines.length - 1
}

function jsOutline(lines: string[]): Symbol[] {
  const out: Symbol[] = []
  let classEnd = -1
  let classIndent = -1
  lines.forEach((l, i) => {
    const d = l.match(JS_DECL)
    const inClass = i <= classEnd
    const m = d ?? (inClass ? l.match(JS_MEMBER) : null)
    // A class body holds no declarations of its own: one found there is a statement in a method.
    if (!m || (d && inClass)) return
    const name = d ? d[3] : m[2]
    if (!d && (NOT_MEMBER.has(name) || indent(l) <= classIndent)) return
    // Statements inside function bodies are not part of the shape.
    if (d && !inClass && indent(l) > 0 && out.some(s => s.depth === 0 && s.end > i + 1 && s.kind !== 'class')) return
    const end = jsEnd(lines, i)
    const kind = d ? d[2] : 'method'
    out.push({ name, kind, line: i + 1, end: end + 1, depth: inClass && !d ? 1 : 0, sig: l.trim().replace(/\s*\{\s*$/, '') })
    if (kind === 'class') { classEnd = end; classIndent = indent(l) }
  })
  return out
}

export function outline(path: string, text: string): Symbol[] {
  const lines = text.split(/\r?\n/)
  return PY.test(path) ? pythonOutline(lines) : JS.test(path) ? jsOutline(lines) : []
}

export function showOutline(path: string, text: string): string {
  const syms = outline(path, text)
  if (syms.length === 0) return `${path}: no functions or classes found`
  return [`${path} (${text.split(/\r?\n/).length} lines)`, ...syms.map(s => `${'  '.repeat(s.depth + 1)}${s.line}-${s.end} ${s.sig.slice(0, 160)}`)].join('\n')
}

export const DEF_MAX = 150

export function showDef(path: string, text: string, name: string): string | undefined {
  const lines = text.split(/\r?\n/)
  const hits = outline(path, text).filter(s => s.name === name)
  if (hits.length === 0) return undefined
  return hits.map(s => {
    const body = lines.slice(s.line - 1, s.end)
    if (body.length <= DEF_MAX) return `${path}:${s.line}-${s.end}\n${body.join('\n')}`
    const inner = outline(path, text).filter(c => c.line > s.line && c.end <= s.end)
    return `${path}:${s.line}-${s.end} (${body.length} lines; its parts below, Read offset/limit for one)\n${s.sig}\n`
      + inner.map(c => `  ${c.line}-${c.end} ${c.sig.slice(0, 160)}`).join('\n')
  }).join('\n\n')
}

export const MAP_FILES = 300

export function showMap(files: { path: string; text: string }[]): string {
  const byDir = new Map<string, string[]>()
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : './'
    const names = outline(f.path, f.text).filter(s => s.depth === 0).map(s => s.name)
    const shown = names.slice(0, 12).join(', ') + (names.length > 12 ? `, … +${names.length - 12}` : '')
    const row = `  ${f.path.slice(dir === './' ? 0 : dir.length)} (${f.text.split('\n').length})${shown ? `: ${shown}` : ''}`
    byDir.set(dir, [...(byDir.get(dir) ?? []), row])
  }
  return [...byDir].sort(([a], [b]) => a.localeCompare(b)).map(([d, rows]) => `${d}\n${rows.join('\n')}`).join('\n')
}

const run = ($: EngineInterface, ...args: string[]) =>
  $.process.run(['git', ...args]).then(r => (r.exitCode === 0 ? r.stdout : ''), () => '')
const read = ($: EngineInterface, path: string) => $.fs.read(path).then(t => (typeof t === 'string' ? t : undefined), () => undefined)
const esc = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Args = { action?: string; name?: string; path?: string }

async function answer($: EngineInterface, a: Args): Promise<string> {
  const root = (await run($, 'rev-parse', '--show-toplevel')).trim()
  const abs = (p: string) => (/^([a-zA-Z]:)?[\\/]/.test(p) || !root ? p : `${root}/${p}`)
  if (a.action === 'outline') {
    if (!a.path) return 'code outline: path is required'
    const text = await read($, abs(a.path))
    return text === undefined ? `code: cannot read ${a.path}` : showOutline(a.path, text)
  }
  if (a.action === 'def') {
    if (!a.name) return 'code def: name is required'
    const paths = a.path ? [a.path]
      : [...new Set((await run($, 'grep', '-l', '-E', `(def|class|function|interface|type|enum|const|let|var)[[:space:]]+${esc(a.name)}([^A-Za-z0-9_$]|$)`)).split(/\r?\n/).filter(isCode))].slice(0, 5)
    const found: string[] = []
    for (const p of paths) {
      const text = await read($, abs(p))
      const d = text === undefined ? undefined : showDef(p, text, a.name)
      if (d) found.push(d)
    }
    return found.length ? found.join('\n\n') : `code def: ${a.name} not found${a.path ? ` in ${a.path}` : ''}`
  }
  if (a.action === 'refs') {
    if (!a.name) return 'code refs: name is required'
    const hits = (await run($, 'grep', '-n', '-w', '-I', '-F', a.name)).split(/\r?\n/).filter(Boolean)
    if (hits.length === 0) return `code refs: ${a.name} not found`
    const shown = hits.slice(0, 50).map(h => h.replace(/^([^:]+:\d+:)\s*/, '$1 ').slice(0, 160))
    return shown.join('\n') + (hits.length > 50 ? `\n… ${hits.length - 50} more; narrow with a path or a longer name` : '')
  }
  if (a.action === 'map') {
    const listed = a.path ? await run($, 'ls-files', a.path) : await run($, 'ls-files')
    const all = listed.split(/\r?\n/).filter(f => isCode(f) && !/\.min\.|\.d\.ts$/.test(f))
    if (all.length > MAP_FILES) {
      const dirs = new Map<string, number>()
      for (const f of all) {
        const d = f.split('/').slice(0, 2).join('/')
        dirs.set(d, (dirs.get(d) ?? 0) + 1)
      }
      return `${all.length} code files, too many for one map; map a folder:\n` + [...dirs].map(([d, n]) => `  ${d} (${n})`).join('\n')
    }
    const files: { path: string; text: string }[] = []
    for (const p of all) {
      const text = await read($, abs(p))
      if (text !== undefined) files.push({ path: p, text })
    }
    return files.length ? showMap(files) : 'code map: no code files found'
  }
  return 'code: action is one of outline, def, refs, map'
}

// Called from the one session.start hook in register.ts.
export async function startCodeTool($: EngineInterface) {
  await $.tool.register({
      name: TOOL,
      description: TOOL_DESCRIPTION,
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['outline', 'def', 'refs', 'map'] },
          name: { type: 'string', description: 'def, refs: the function, class or name' },
          path: { type: 'string', description: 'outline: the file; def: limit to this file; map: a folder' },
        },
      },
      isDeferred: false,
    })
}

export function registerCodeTool(on: On) {
  on('tool.call', { tool: `mcp__lean__${TOOL}` }, async ($, e) => ({ result: await answer($, e as unknown as Args) }))
}
