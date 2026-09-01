#!/usr/bin/env node
/**
 * Tile validator - checks an example folder before a human has to read it.
 *
 * A "tile" is one folder under public/examples/: a .scad file, a manifest.json
 * describing it, and whatever files it needs beside it. This script answers the
 * questions a reviewer would otherwise have to answer by hand, and it answers
 * them the same way every time.
 *
 * The checks exist because each of them has already gone wrong at least once:
 *
 *   - A first-party tile shipped with a picture its manifest declared, its
 *     folder contained, and the app could not find, because a second list had
 *     drifted (D-97). The file sweep is that defect turned into a check.
 *   - A tile with no license is a tile nobody else can legally reuse, which is
 *     the opposite of why it is here.
 *   - A parameter with no comment above it renders as a bare variable name in
 *     the app, which is nobody's idea of a label.
 *   - A value somebody reads with their fingers, with no documented range and
 *     no assert, prints wrong and looks right. Nothing else in the build
 *     catches that.
 *
 * Usage:
 *   node scripts/validate-example.mjs public/examples/_template
 *   node scripts/validate-example.mjs --all
 *
 * Exit codes:
 *   0 - every folder passed (notes may still be printed)
 *   1 - at least one folder has an error
 *
 * What it does NOT do: render anything. Static checks are fast and need no
 * browser; the render is a separate gate (tests/e2e/wasm-smoke.spec.js), and
 * the last line of a passing run says so.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_MANIFEST_FIELDS = [
  'name',
  'description',
  'version',
  'author',
  'license',
  'main',
  'files',
]

/** Text that means "the author has not filled this in yet". */
const PLACEHOLDER = /REPLACE[- ]?ME|TODO|FIXME|your name here|example\.org/i

/**
 * Library folders shipped with the app. `use <MCAD/boxes.scad>` resolves to one
 * of these, so a tile does not declare it among its own files.
 */
export function libraryNames(repoRoot) {
  const dir = join(repoRoot, 'public', 'libraries')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

/**
 * Read the shape of a .scad file: its Customizer parameters, what it includes,
 * and what it asserts.
 *
 * OpenSCAD's own rule is that Customizer parameters are the top-level
 * assignments BEFORE the `/* [Hidden] *\/` marker, so that is where this stops
 * looking. Everything after the marker is the design's private workings.
 */
export function parseScad(text) {
  const lines = text.split(/\r?\n/)
  const parameters = []
  const groups = []
  const includes = []
  const imports = []
  const asserts = []

  let group = null
  let hidden = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const groupMatch = line.match(/^\s*\/\*\s*\[([^\]]+)\]\s*\*\//)
    if (groupMatch) {
      group = groupMatch[1].trim()
      if (/^hidden$/i.test(group)) hidden = true
      else groups.push(group)
      continue
    }

    const includeMatch = line.match(/^\s*(include|use)\s*<([^>]+)>/)
    if (includeMatch) {
      includes.push({ kind: includeMatch[1], path: includeMatch[2].trim(), line: i + 1 })
    }

    const importMatch = line.match(/\bimport\s*\(\s*"([^"]+)"/)
    if (importMatch) {
      imports.push({ path: importMatch[1], line: i + 1 })
    }

    if (/\bassert\s*\(/.test(line)) {
      // An assert can run over several lines; keep enough of the tail to see
      // which parameters it talks about.
      asserts.push({ text: lines.slice(i, i + 8).join('\n'), line: i + 1 })
    }

    if (hidden) continue

    const paramMatch = line.match(
      /^([$A-Za-z_][$A-Za-z0-9_]*)\s*=\s*([^;]+);\s*(\/\/(.*))?$/
    )
    if (!paramMatch) continue

    const [, name, rawValue, , rawComment] = paramMatch
    const annotation = (rawComment || '').trim()

    // The label the app shows is the comment line directly above.
    let description = null
    for (let j = i - 1; j >= 0; j--) {
      const above = lines[j].trim()
      if (above === '') break
      if (above.startsWith('/*') || above.startsWith('*/')) break
      if (!above.startsWith('//')) break
      const body = above.replace(/^\/\/\s?/, '').trim()
      // A bare annotation line is not a label.
      if (body === '' || /^\[.*\]$/.test(body)) break
      description = description ? `${body} ${description}` : body
      if (description.length > 400) break
    }

    parameters.push({
      name,
      value: rawValue.trim(),
      annotation,
      description,
      group,
      line: i + 1,
      hasRange: /\[\s*-?[\d.]+\s*:(\s*-?[\d.]+\s*:)?\s*-?[\d.]+\s*\]/.test(annotation),
      hasChoices: /\[[^\]]*,[^\]]*\]/.test(annotation),
      fileParam: /\[\s*file\s*:/i.test(annotation),
    })
  }

  return { parameters, groups, includes, imports, asserts }
}

/** Strip a quoted string literal down to its value, or null if it is not one. */
export function literalString(value) {
  const match = String(value).trim().match(/^"([^"]*)"$/)
  return match ? match[1] : null
}

/**
 * The app accepts svgLibrary as one entry or as a list of them, so this does
 * too. The list form is the documented one.
 */
export function svgLibraryEntries(manifest) {
  const value = manifest?.svgLibrary
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Everything the .scad and the manifest say this tile reads from disk, as bare
 * file names. Bare names, because a manifest writes `presets/starter.json`
 * where the app holds a URL: the question is whether the file travels with the
 * tile, not how it is spelled.
 */
export function referencedFiles(scad, manifest, libraries = []) {
  const found = []
  const add = (name, source) => {
    if (!name) return
    found.push({ name: posix.basename(name.replace(/\\/g, '/')), raw: name, source })
  }

  for (const inc of scad.includes) {
    const first = inc.path.replace(/\\/g, '/').split('/')[0]
    if (libraries.includes(first)) continue
    add(inc.path, `${inc.kind} <${inc.path}> on line ${inc.line}`)
  }
  for (const imp of scad.imports) {
    add(imp.path, `import("${imp.path}") on line ${imp.line}`)
  }
  for (const param of scad.parameters) {
    if (!param.fileParam) continue
    const value = literalString(param.value)
    if (value) add(value, `${param.name} on line ${param.line}`)
  }
  for (const entry of svgLibraryEntries(manifest)) {
    for (const option of entry?.options || []) {
      add(option?.file, `svgLibrary option "${option?.label || option?.file}"`)
    }
  }
  return found
}

function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, base, out)
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

/**
 * Check one tile folder.
 *
 * @param {string} dir folder holding manifest.json
 * @param {{repoRoot?: string}} [options]
 * @returns {{dir: string, errors: Array, notes: Array}}
 */
export function validateExample(dir, options = {}) {
  const repoRoot = options.repoRoot || process.cwd()
  const errors = []
  const notes = []
  const error = (check, message) => errors.push({ check, message })
  const note = (check, message) => notes.push({ check, message })

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    error('folder', `${dir} is not a folder.`)
    return { dir, errors, notes }
  }

  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    error(
      'manifest',
      'There is no manifest.json here. Every tile needs one: it is how the app knows the tile\'s name, who wrote it, and which files travel with it.'
    )
    return { dir, errors, notes }
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    error('manifest', `manifest.json is not valid JSON: ${e.message}`)
    return { dir, errors, notes }
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    const value = manifest[field]
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    if (empty) {
      error(
        'manifest.required',
        field === 'license'
          ? 'manifest.json has no "license". A tile without one is a tile nobody else can legally reuse, which is the opposite of why it is here. "CC0-1.0" and "GPL-3.0-or-later" are both fine.'
          : `manifest.json has no "${field}".`
      )
    }
  }

  for (const [field, value] of Object.entries(manifest)) {
    if (typeof value === 'string' && PLACEHOLDER.test(value)) {
      note(
        'manifest.placeholder',
        `manifest.json still has template text in "${field}". The template ships that way on purpose; your tile should not.`
      )
    }
  }

  if (manifest.inspired_by && !manifest.inspired_by.name) {
    error(
      'manifest.attribution',
      '"inspired_by" is here but has no "name". If a design came from somebody else\'s work, say whose.'
    )
  }

  const declared = Array.isArray(manifest.files) ? manifest.files : []
  const declaredNames = new Set(declared.map((f) => posix.basename(String(f))))

  const seen = new Set()
  for (const file of declared) {
    if (seen.has(file)) {
      note('manifest.files', `"${file}" is listed twice in "files".`)
    }
    seen.add(file)
    if (!existsSync(join(dir, file))) {
      error(
        'manifest.files',
        `"files" lists ${file}, which is not in this folder.`
      )
    }
  }

  if (manifest.main && !declaredNames.has(posix.basename(String(manifest.main)))) {
    error(
      'manifest.files',
      `"main" is ${manifest.main}, but "files" does not list it. The main file travels with the tile like everything else.`
    )
  }

  const onDisk = listFiles(dir)
  for (const file of onDisk) {
    if (file === 'manifest.json' || file === 'README.md') continue
    if (!declared.includes(file)) {
      note(
        'files.undeclared',
        `${file} is in this folder but not listed in "files", so the app will not fetch it.`
      )
    }
  }

  const mainPath = manifest.main ? join(dir, manifest.main) : null
  if (!mainPath || !existsSync(mainPath)) {
    if (manifest.main) {
      error('main', `"main" is ${manifest.main}, which is not in this folder.`)
    }
    return { dir, errors, notes }
  }

  const scadText = readFileSync(mainPath, 'utf8')
  const scad = parseScad(scadText)

  if (scad.groups.length === 0) {
    error(
      'parameters.groups',
      `${manifest.main} has no parameter groups. A line like /* [Size] */ starts one, and without any the app shows every control in a single undivided list.`
    )
  }

  if (scad.parameters.length === 0) {
    error(
      'parameters',
      `${manifest.main} has no Customizer parameters, so there is nothing for anyone to adjust. Parameters are the top-level assignments before the /* [Hidden] */ marker.`
    )
  }

  for (const param of scad.parameters) {
    if (param.name.startsWith('$')) continue
    if (!param.description) {
      error(
        'parameters.labels',
        `${param.name} (line ${param.line}) has no comment above it. The control still appears, labelled with the bare variable name and explained by nothing - the comment above a parameter is what the app shows as its description and in its help button.`
      )
    }
  }

  const libraries = libraryNames(repoRoot)
  for (const ref of referencedFiles(scad, manifest, libraries)) {
    if (declaredNames.has(ref.name)) continue
    // Whether the file is here or not changes what the author has to do, so
    // say which it is rather than guessing.
    const here = onDisk.some((f) => posix.basename(f) === ref.name)
    error(
      'files.referenced',
      here
        ? `${manifest.main} reads ${ref.name} (${ref.source}), which is in this folder but not listed in manifest.json under "files". The app fetches only what "files" names, so it will be missing at render time even though it is sitting right there.`
        : `${manifest.main} reads ${ref.name} (${ref.source}), which is neither listed in manifest.json under "files" nor in this folder.`
    )
  }

  const tactile = Array.isArray(manifest.tactile) ? manifest.tactile : []
  for (const name of tactile) {
    const param = scad.parameters.find((p) => p.name === name)
    if (!param) {
      error(
        'tactile.parameter',
        `"tactile" names ${name}, which is not a parameter of ${manifest.main}.`
      )
      continue
    }
    const documented =
      param.hasRange || /range|minimum|maximum|spec/i.test(param.description || '')
    if (!documented) {
      error(
        'tactile.range',
        `${name} is read by touch, but its range is not written down. Give it a [min:max] annotation or say the range in the comment above it, and take the numbers from the standard that governs the design.`
      )
    }
    const asserted = scad.asserts.some((a) =>
      new RegExp(`\\b${name}\\b`).test(a.text)
    )
    if (!asserted) {
      error(
        'tactile.assert',
        `${name} is read by touch, but nothing asserts it. Add assert(${name} >= ..., "...") so a value outside the range fails the build. Nothing else catches a wrong tactile value: it exports, prints, and looks right.`
      )
    }
  }

  const paramNames = new Set(scad.parameters.map((p) => p.name))
  for (const file of declared) {
    if (!/^presets\/.+\.json$/.test(String(file))) continue
    const presetPath = join(dir, file)
    if (!existsSync(presetPath)) continue
    let preset
    try {
      preset = JSON.parse(readFileSync(presetPath, 'utf8'))
    } catch (e) {
      error('preset', `${file} is not valid JSON: ${e.message}`)
      continue
    }
    const modelName = preset?.modelName
    if (modelName && modelName !== basename(String(manifest.main))) {
      error(
        'preset.model',
        `${file} says it is for ${modelName}, but this tile's main file is ${basename(String(manifest.main))}.`
      )
    }
    const values = preset?.preset?.parameters || {}
    for (const key of Object.keys(values)) {
      if (key.startsWith('$')) continue
      if (!paramNames.has(key)) {
        note(
          'preset.parameter',
          `${file} sets ${key}, which ${manifest.main} does not have. Loading the preset will silently do nothing with it.`
        )
      }
    }
  }

  return { dir, errors, notes }
}

export function formatReport(results, skipped = []) {
  const lines = []
  let errorCount = 0
  let noteCount = 0

  for (const result of results) {
    const label = result.dir.split('\\').join('/')
    lines.push(label)
    for (const finding of result.errors) {
      lines.push(`  ERROR  ${finding.message}`)
      errorCount++
    }
    for (const finding of result.notes) {
      lines.push(`  note   ${finding.message}`)
      noteCount++
    }
    if (result.errors.length === 0 && result.notes.length === 0) {
      lines.push('  looks good')
    } else if (result.errors.length === 0) {
      lines.push('  no errors')
    }
    lines.push('')
  }

  for (const dir of skipped) {
    lines.push(
      `skipped ${dir.split('\\').join('/')} - its manifest.json has no "main", so it does not describe a tile.`
    )
  }
  if (skipped.length > 0) lines.push('')

  lines.push(
    errorCount === 0
      ? `PASSED - ${results.length} folder(s) checked, ${noteCount} note(s).`
      : `FAILED - ${errorCount} error(s) across ${results.length} folder(s).`
  )
  if (errorCount === 0) {
    lines.push(
      'These checks never render anything. Run the render gate too: npx playwright test tests/e2e/wasm-smoke.spec.js --project=chromium'
    )
  }
  return lines.join('\n')
}

function main(argv) {
  const repoRoot = process.cwd()
  const args = argv.filter((a) => a !== '--all')
  let targets = args

  const skipped = []

  if (argv.includes('--all') || args.length === 0) {
    const root = join(repoRoot, 'public', 'examples')
    const candidates = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join('public', 'examples', e.name))
      .filter((dir) => existsSync(join(repoRoot, dir, 'manifest.json')))

    targets = []
    for (const dir of candidates) {
      // Not every manifest.json under public/examples describes a tile:
      // benchmarks/ carries an index of render-timing models. A sweep skips
      // those, out loud - a silent skip is how a broken tile hides. Naming a
      // folder on the command line always checks it, whatever is in there.
      let looksLikeATile = false
      try {
        looksLikeATile = Boolean(
          JSON.parse(readFileSync(join(repoRoot, dir, 'manifest.json'), 'utf8')).main
        )
      } catch {
        looksLikeATile = true
      }
      if (looksLikeATile) targets.push(dir)
      else skipped.push(dir)
    }
  }

  const results = targets.map((dir) => validateExample(dir, { repoRoot }))
  console.log(formatReport(results, skipped))
  return results.some((r) => r.errors.length > 0) ? 1 : 0
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)))
}
