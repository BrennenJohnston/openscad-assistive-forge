/**
 * The words a person reads are American English (DP-Q49).
 *
 * `strings.js` has declared "US English" in its own header since it was
 * written, and shipped "Colours" fifty-four times anyway. A rule with nothing
 * enforcing it is the same story as the em dash the style guide banned and
 * thirteen strings kept using. This is that rule with a build behind it:
 * `tests/unit/us-english.test.js` fails on anything this finds, and running
 * this file directly prints the same list as a work order.
 *
 *   node scripts/us-english-scan.mjs
 *
 * What it reads:
 *   - every string literal and comment in `src/**\/*.js`
 *   - the text and the human-readable attributes of `index.html`
 *   - the comment lines of the tiles' `.scad` files
 *   - the prose of `docs/**` and the root papers, outside code fences
 *
 * What it deliberately does NOT read, because DP-Q49 leaves them alone:
 * identifiers, CSS class names, file names and settings keys (`colourCount`,
 * `wallColour`, `colour-separation.js`, `.drawing-editor-colour-select`), the
 * City Walk's OpenStreetMap data, the 1:1 conversion of the third-party
 * OpenSCAD language reference, the tool output under `docs/vpat/evidence/`,
 * and the dated audit records under `docs/audit/`.
 *
 * A word inside a string or comment counts only when it stands alone in
 * prose: a character of `-_/\#$` on either side means it is part of a name,
 * and a dot running straight into more letters is a file extension.
 *
 * Every run carries the offset of its text in the file, so a caller can act
 * on the exact characters this found and never on code that happens to share
 * the line.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// [what to look for, what to write instead]. Every entry is a form that is
// British where American English has another spelling. Words that are correct
// in both ("dialogue", "catalogue") are not here, and neither is "kerb": in
// this repository it is the OpenStreetMap tag name the City Walk's road code
// follows, not a spelling of "curb".
export const BRITISH = [
  [/\bcolour(ed|ing|s|less|ful)?\b/i, 'color'],
  [/\bcentre(d|s|line|lines)?\b/i, 'center'],
  [/\bgrey(s|ish|scale)?\b/i, 'gray'],
  [/\bbehaviour(s|al|ally)?\b/i, 'behavior'],
  [/\bfavourite?(s|d)?\b/i, 'favorite'],
  [/\bflavour(s|ed|ing)?\b/i, 'flavor'],
  [/\bhonour(s|ed|ing|able)?\b/i, 'honor'],
  [/\bneighbour(s|ing|hood|hoods|ly)?\b/i, 'neighbor'],
  [/\blabour(s|ed|ing)?\b/i, 'labor'],
  [/\blicence(s|d)?\b/i, 'license'],
  [/\bdefence(s|less)?\b/i, 'defense'],
  [/\boffence(s)?\b/i, 'offense'],
  [/\bpractise(s|d|ing)?\b/i, 'practice'],
  [/\bcancell(ed|ing)\b/i, 'canceled / canceling'],
  [/\bmodelling\b/i, 'modeling'],
  [/\blabelling\b/i, 'labeling'],
  [/\blabelled\b/i, 'labeled'],
  [/\btravell(ed|ing|er|ers)\b/i, 'traveled / traveling'],
  [/\bprogramme(s)?\b/i, 'program'],
  [/\b(milli|centi|kilo)?metres?\b/i, 'meter / meters'],
  [/\blitres?\b/i, 'liter'],
  [/\bfibres?\b/i, 'fiber'],
  [/\bartefacts?\b/i, 'artifact'],
  [/\bstoreys?\b/i, 'story / stories'],
  [/\baluminium\b/i, 'aluminum'],
  [/\bjewellery\b/i, 'jewelry'],
  [/\bageing\b/i, 'aging'],
  [/\bfulfil(s|ment)?\b/i, 'fulfill'],
  [/\btyres?\b/i, 'tire'],
  [/\bmould(s|ed|ing|y)?\b/i, 'mold'],
  [/\bwhilst\b/i, 'while'],
  [/\bamongst\b/i, 'among'],
  [/\blearnt\b/i, 'learned'],
  [/\bspelt\b/i, 'spelled'],
  [/\benquir(e|es|ed|ing|y|ies)\b/i, 'inquire / inquiry'],
  // "analyses" is left out: it is the plural of "analysis" as often as it is
  // the verb, and American English keeps the noun.
  [/\banalys(e|ed|ing|er|ers)\b/i, 'analyze'],
  // The -ise family, named one by one: a blanket rule would condemn
  // "advertise", "surprise", "otherwise" and forty more that are American.
  [
    /\b(recognis|customis|organis|normalis|initialis|serialis|visualis|optimis|minimis|maximis|summaris|categoris|prioritis|synchronis|emphasis(?=e|ed|es|ing)|apologis|realis|utilis|standardis|digitis|sanitis|memoris|specialis|finalis|centralis|localis|randomis|colouris|itemis|authoris|penalis|neutralis|stabilis)(e|es|ed|ing|er|ers|ation|ations|ational|able|ables|ability)\b/i,
    'the -ize / -ization spelling',
  ],
]

// Lines that carry one of these keep their British-looking word: it is a name,
// a quotation, or the word this very file is about.
const ALLOWED_ON_LINE = [
  'us-english',
  'OpenStreetMap',
  'British',
  'American English',
  'Labour Party',
  // The deliberate escape hatch. A line that quotes a spelling on purpose -
  // the wording a release replaced, or the form a comment says it is NOT
  // using - marks itself "(sic)" and this reader walks past it. Use it only
  // for a quotation; a string a person reads is never (sic).
  '(sic)',
]

const DIR_SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test-results',
  'playwright-report',
  '.git',
])

const PATH_SKIP = [
  join('docs', 'OPENSCAD_LANGUAGE_REFERENCE.md'),
  join('docs', 'vpat', 'evidence'),
  join('docs', 'audit'),
  join('public', 'examples', 'ascii-city'),
]

const ROOT_PAPERS = [
  'README.md',
  'CHANGELOG.md',
  'RELEASE_NOTES.md',
  'PROJECT_STATUS.md',
  'CONTRIBUTING.md',
  'CREDITS.md',
  'MAINTAINERS.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
]

const skipped = (rel) =>
  PATH_SKIP.some((p) => rel === p || rel.startsWith(p + sep))

function walk(dir, extensions, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (DIR_SKIP.has(entry)) continue
    const full = join(dir, entry)
    const rel = relative(ROOT, full)
    if (skipped(rel)) continue
    if (statSync(full).isDirectory()) walk(full, extensions, out)
    else if (extensions.includes(extname(entry))) out.push(full)
  }
  return out
}

const IDENT_ADJACENT = /[-_/\\#$]/

// A whole string literal that is one lower-case token, or a SCREAMING_CASE
// constant: a key, a stored value, an error code the app compares, a CSS
// class, a file name. DP-Q49 leaves every one of them alone.
const KEY_LIKE = /^([a-z0-9][a-z0-9_.:-]*|[A-Z][A-Z0-9_]*)$/

/**
 * A quoted word and its own plural, both on one line, is a count being said
 * in words: `count(colours, 'colour', 'colours')` and
 * `${n} ${n === 1 ? 'colour' : 'colours'}` both READ as prose, however
 * key-shaped each half looks on its own. No key line has that pair.
 */
export function lineAround(source, index) {
  const from = source.lastIndexOf('\n', index) + 1
  const to = source.indexOf('\n', index)
  return source.slice(from, to === -1 ? source.length : to)
}

export function countPairOnLine(literal, line) {
  const singular = literal.endsWith('s') ? literal.slice(0, -1) : literal
  const plural = `${singular}s`
  if (singular === plural || singular.length < 3) return false
  const has = (word) => line.includes(`'${word}'`) || line.includes(`"${word}"`)
  return has(singular) && has(plural)
}

export function standsAlone(text, start, end) {
  const before = text[start - 1] ?? ' '
  const after = text[end] ?? ' '
  if (IDENT_ADJACENT.test(before) || IDENT_ADJACENT.test(after)) return false
  // "colours.json" is a file name; "your colours." is the end of a sentence.
  if (after === '.' && /[A-Za-z0-9]/.test(text[end + 1] ?? '')) return false
  return true
}

/**
 * A reader's output: one run per line of prose, carrying the line number and
 * the offset of that line's text in the file it came from.
 */
function collector() {
  const runs = []
  return {
    runs,
    // A block comment or a template literal spans lines, and a work order
    // that points at the opening line is one nobody can follow: each line is
    // pushed under its own number and its own offset.
    push(text, line, start, kind = 'prose') {
      let offset = 0
      for (const part of text.split('\n')) {
        if (part.trim()) runs.push({ line: line + offset, text: part, start, kind })
        // eslint-disable-next-line no-param-reassign
        start += part.length + 1
        offset += 1
      }
    },
  }
}

/**
 * The string literals and comments of a JavaScript file. Everything else -
 * identifiers, keywords, numbers - never reaches the word list, which is what
 * DP-Q49 asks for.
 */
export function jsTextRuns(source) {
  const { runs, push } = collectorFor()
  let line = 1
  let i = 0
  // What the previous meaningful character was, so a `/` can be told apart:
  // after a value it divides, after an operator or a bracket it opens a regex.
  let prev = ''
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '\n') {
      line += 1
      i += 1
      continue
    }
    if (c === '/' && next === '/') {
      const start = i + 2
      while (i < source.length && source[i] !== '\n') i += 1
      push(source.slice(start, i), line, start, 'comment')
      continue
    }
    if (c === '/' && next === '*') {
      const at = line
      const start = i + 2
      i += 2
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        if (source[i] === '\n') line += 1
        i += 1
      }
      push(source.slice(start, i), at, start, 'comment')
      i += 2
      prev = ')'
      continue
    }
    if (c === '"' || c === "'") {
      const at = line
      const quote = c
      const start = ++i
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i += 1
        else if (source[i] === '\n') line += 1
        i += 1
      }
      const literal = source.slice(start, i)
      // A quoted lower-case word on its own is a key, a stored value or a
      // class name, never a sentence: `settings.mode === 'colours'` and
      // `makeSlider('colours', 'How many colours', ...)` are the same word
      // twice, and DP-Q49 changes only the half a person reads. The one
      // exception is a word beside its own plural, which is prose.
      if (!KEY_LIKE.test(literal) || countPairOnLine(literal, lineAround(source, start))) {
        push(literal, at, start, 'string')
      }
      i += 1
      prev = ')'
      continue
    }
    if (c === '`') {
      i += 1
      let segmentStart = i
      let segmentLine = line
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        // A ${...} hole holds code - and code holds strings a person reads:
        // `${n === 1 ? 'colour' : 'colours'}` renders a word. The literal
        // text before the hole is a run of its own, and the hole is read by
        // this same reader, with its runs moved back to the file's own lines.
        if (source[i] === '$' && source[i + 1] === '{') {
          push(source.slice(segmentStart, i), segmentLine, segmentStart, 'string')
          const holeStart = i + 2
          const holeLine = line
          let depth = 1
          i += 2
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            else if (source[i] === '\n') line += 1
            i += 1
          }
          for (const run of jsTextRuns(source.slice(holeStart, i - 1))) {
            runs.push({
              ...run,
              line: holeLine + run.line - 1,
              start: holeStart + run.start,
            })
          }
          segmentStart = i
          segmentLine = line
          continue
        }
        if (source[i] === '\n') line += 1
        i += 1
      }
      push(source.slice(segmentStart, i), segmentLine, segmentStart, 'string')
      i += 1
      prev = ')'
      continue
    }
    if (c === '/' && !'})]'.includes(prev) && !/[A-Za-z0-9_$]/.test(prev)) {
      // A regular expression literal. Its contents are a pattern, not prose,
      // and stepping over it keeps a quote inside it from opening a string.
      i += 1
      let inClass = false
      while (i < source.length) {
        const ch = source[i]
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === '[') inClass = true
        else if (ch === ']') inClass = false
        else if (ch === '/' && !inClass) break
        else if (ch === '\n') break
        i += 1
      }
      i += 1
      prev = ')'
      continue
    }
    if (!/\s/.test(c)) prev = c
    i += 1
  }
  return runs
}

/** The text and human-readable attributes of an HTML file. */
export function htmlTextRuns(source) {
  const { runs, push } = collectorFor()
  // Script and style hold code; their text is not read by anyone. Blanking
  // keeps every later offset identical to the file's own.
  const blanked = source.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) =>
    m.replace(/[^\n]/g, ' ')
  )
  const lineStarts = [0]
  for (let i = 0; i < blanked.length; i++) {
    if (blanked[i] === '\n') lineStarts.push(i + 1)
  }
  const lineAt = (index) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (lineStarts[mid] <= index) low = mid
      else high = mid - 1
    }
    return low + 1
  }
  const readable =
    /\s(aria-label|aria-description|aria-roledescription|aria-placeholder|title|alt|placeholder|label|content|data-tooltip)\s*=\s*"([^"]*)"/gi
  let m
  while ((m = readable.exec(blanked))) {
    const start = m.index + m[0].lastIndexOf(m[2])
    push(m[2], lineAt(start), start, 'attr')
  }
  const between = />([^<>]+)</g
  while ((m = between.exec(blanked))) {
    push(m[1], lineAt(m.index + 1), m.index + 1, 'text')
  }
  const comments = /<!--([\s\S]*?)-->/g
  while ((m = comments.exec(blanked))) {
    push(m[1], lineAt(m.index + 4), m.index + 4, 'comment')
  }
  return runs
}

/** The comment lines of an OpenSCAD file. */
export function scadTextRuns(source) {
  const { runs, push } = collectorFor()
  let offset = 0
  source.split('\n').forEach((raw, index) => {
    const at = raw.indexOf('//')
    if (at !== -1) push(raw.slice(at + 2), index + 1, offset + at + 2, 'comment')
    offset += raw.length + 1
  })
  return runs
}

/** The prose of a Markdown file: no fenced blocks, no inline code. */
export function markdownTextRuns(source) {
  const { runs, push } = collectorFor()
  let fenced = false
  let offset = 0
  source.split('\n').forEach((raw, index) => {
    const start = offset
    offset += raw.length + 1
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced
      return
    }
    if (fenced) return
    // An indented code block, and a link target, are not prose either. Both
    // are blanked rather than removed so the offsets stay true.
    if (/^\s{4,}\S/.test(raw)) return
    const text = raw
      .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
      .replace(/\]\(([^)]*)\)/g, (m) => '] ' + ' '.repeat(m.length - 2))
    push(text, index + 1, start)
  })
  return runs
}

function collectorFor() {
  const c = collector()
  return { runs: c.runs, push: c.push.bind(c) }
}

/** Every British spelling in these runs, as {line, start, word, instead}. */
export function hitsIn(runs) {
  const out = []
  for (const run of runs) {
    if (ALLOWED_ON_LINE.some((phrase) => run.text.includes(phrase))) continue
    for (const [pattern, instead] of BRITISH) {
      const rx = new RegExp(pattern.source, pattern.flags + 'g')
      let m
      while ((m = rx.exec(run.text))) {
        if (!standsAlone(run.text, m.index, m.index + m[0].length)) continue
        out.push({
          line: run.line,
          start: run.start + m.index,
          word: m[0],
          instead,
        })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export function findings(file, runs) {
  const rel = relative(ROOT, file).split(sep).join('/')
  return hitsIn(runs).map(
    (h) => `${rel}:${h.line}: "${h.word}" -> ${h.instead}`
  )
}

/** Every file this reads, with the reader that suits it. */
export function sources() {
  const files = []
  for (const file of walk(join(ROOT, 'src'), ['.js'])) {
    files.push([file, jsTextRuns])
  }
  files.push([join(ROOT, 'index.html'), htmlTextRuns])
  for (const file of walk(join(ROOT, 'public', 'examples'), ['.scad'])) {
    files.push([file, scadTextRuns])
  }
  const markdown = walk(join(ROOT, 'docs'), ['.md'])
  for (const paper of ROOT_PAPERS) {
    const full = join(ROOT, paper)
    if (existsSync(full)) markdown.push(full)
  }
  for (const file of markdown) files.push([file, markdownTextRuns])
  return files
}

export function scanAll() {
  const found = []
  for (const [file, reader] of sources()) {
    found.push(...findings(file, reader(readFileSync(file, 'utf8'))))
  }
  return found
}

// Run it directly to print the work order: node scripts/us-english-scan.mjs
if (process.argv[1] && process.argv[1].endsWith('us-english-scan.mjs')) {
  const found = scanAll()
  for (const line of found) console.log(line)
  console.log(`${found.length} British spelling(s).`)
  process.exit(found.length ? 1 : 0)
}
