import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseScad,
  literalString,
  svgLibraryEntries,
  referencedFiles,
  validateExample,
  formatReport,
  REQUIRED_MANIFEST_FIELDS,
} from '../../scripts/validate-example.mjs'

const TEMPLATE = path.join('public', 'examples', '_template')
const BAD = path.join('tests', 'fixtures', 'bad-example')

const messages = (result) => [...result.errors, ...result.notes].map((f) => f.message)
const checks = (findings) => findings.map((f) => f.check)

describe('parseScad', () => {
  const sample = `
/* [Size] */

// Width of the thing
width = 20; // [10:1:50]

// Pick a shape
shape = "round"; // [round, square]

// Picture to engrave
logo = "bird.svg"; // [file:svg,png]

bare = 3; // [1:5]

/* [Hidden] */

helper = width * 2;

module thing() { cube([width, width, 2]); }
`

  it('reads the parameters a person will see, and stops at Hidden', () => {
    const { parameters } = parseScad(sample)
    expect(parameters.map((p) => p.name)).toEqual(['width', 'shape', 'logo', 'bare'])
    // helper is past the /* [Hidden] */ marker, which is OpenSCAD's own rule
    // for what the Customizer shows.
    expect(parameters.find((p) => p.name === 'helper')).toBeUndefined()
  })

  it('takes each control label from the comment above it', () => {
    const { parameters } = parseScad(sample)
    expect(parameters[0].description).toBe('Width of the thing')
    expect(parameters.find((p) => p.name === 'bare').description).toBeNull()
  })

  it('tells a slider from a menu from a file picker', () => {
    const { parameters } = parseScad(sample)
    const by = (name) => parameters.find((p) => p.name === name)
    expect(by('width').hasRange).toBe(true)
    expect(by('shape').hasChoices).toBe(true)
    expect(by('logo').fileParam).toBe(true)
    expect(by('logo').hasRange).toBe(false)
  })

  it('names the groups in the order they appear, Hidden excepted', () => {
    expect(parseScad(sample).groups).toEqual(['Size'])
  })

  it('collects includes, imports and asserts with their line numbers', () => {
    const scad = parseScad(`
use <MCAD/boxes.scad>
include <utils/helpers.scad>
shape = import("logo.svg");
assert(width >= 2, "too thin");
`)
    expect(scad.includes).toEqual([
      { kind: 'use', path: 'MCAD/boxes.scad', line: 2 },
      { kind: 'include', path: 'utils/helpers.scad', line: 3 },
    ])
    expect(scad.imports).toEqual([{ path: 'logo.svg', line: 4 }])
    expect(scad.asserts[0].line).toBe(5)
  })

  it('keeps an assert that runs over several lines whole enough to read', () => {
    const scad = parseScad(`
assert(
    ridge_height >= ridge_height_min,
    "out of range"
);
`)
    expect(scad.asserts[0].text).toContain('ridge_height_min')
  })
})

describe('literalString', () => {
  it('unwraps a quoted default and refuses anything else', () => {
    expect(literalString('"bird.svg"')).toBe('bird.svg')
    expect(literalString('""')).toBe('')
    expect(literalString('42')).toBeNull()
    expect(literalString('some_variable')).toBeNull()
  })
})

describe('svgLibraryEntries', () => {
  it('accepts the list form and the single-entry form, as the app does', () => {
    expect(svgLibraryEntries({ svgLibrary: [{ paramName: 'a' }] })).toHaveLength(1)
    expect(svgLibraryEntries({ svgLibrary: { paramName: 'a' } })).toEqual([
      { paramName: 'a' },
    ])
    expect(svgLibraryEntries({})).toEqual([])
  })
})

describe('referencedFiles', () => {
  const scad = parseScad(`
use <MCAD/boxes.scad>
include <helpers.scad>

// A picture
logo = "sample-logo.svg"; // [file:svg]

// Nothing chosen yet
other = ""; // [file:svg]

/* [Hidden] */
shape = import("fixed.dxf");
`)

  it('does not ask a tile to ship the shared libraries', () => {
    const names = referencedFiles(scad, {}, ['MCAD', 'BOSL2']).map((r) => r.name)
    expect(names).not.toContain('boxes.scad')
    expect(names).toContain('helpers.scad')
  })

  it('finds the default of a file parameter, which is how D-97 happened', () => {
    const found = referencedFiles(scad, {}, [])
    const logo = found.find((r) => r.name === 'sample-logo.svg')
    expect(logo).toBeDefined()
    expect(logo.source).toMatch(/logo on line/)
  })

  it('ignores a file parameter left empty', () => {
    expect(referencedFiles(scad, {}, []).map((r) => r.name)).not.toContain('')
  })

  it('sees a literal import anywhere in the file, Hidden included', () => {
    expect(referencedFiles(scad, {}, []).map((r) => r.name)).toContain('fixed.dxf')
  })

  it('counts every option a manifest offers in its picture library', () => {
    const manifest = {
      svgLibrary: [{ options: [{ file: 'heart.svg' }, { file: 'star.svg' }] }],
    }
    const names = referencedFiles(scad, manifest, []).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['heart.svg', 'star.svg']))
  })

  it('compares by bare name, because a manifest and a URL spell it differently', () => {
    const manifest = { svgLibrary: { options: [{ file: 'svg-library/heart.svg' }] } }
    expect(referencedFiles(scad, manifest, []).map((r) => r.name)).toContain(
      'heart.svg'
    )
  })
})

describe('the template passes', () => {
  const result = validateExample(TEMPLATE)

  it('has no errors at all', () => {
    expect(result.errors, messages(result).join('\n')).toEqual([])
  })

  it('is the shape it teaches: groups, labels, a file parameter, a tactile assert', () => {
    // If the template ever stops being a worked example of its own rules, the
    // guide is teaching something the repository does not do.
    expect(result.errors).toEqual([])
    const scad = parseScad(
      fs.readFileSync(path.join(TEMPLATE, 'template_tile.scad'), 'utf8')
    )
    expect(scad.groups.length).toBeGreaterThan(1)
    expect(scad.parameters.every((p) => p.name.startsWith('$') || p.description)).toBe(
      true
    )
    expect(scad.parameters.some((p) => p.fileParam)).toBe(true)
    expect(scad.asserts.some((a) => /ridge_height/.test(a.text))).toBe(true)
  })

  it('says out loud that it still carries placeholder text', () => {
    expect(messages(result).join('\n')).toMatch(/template text/)
  })
})

describe('the deliberately broken tile fails, one message per fault', () => {
  // A validator nobody has watched fail is a validator nobody should trust.
  const result = validateExample(BAD)

  it('catches all four seeded faults and nothing else', () => {
    expect(checks(result.errors).sort()).toEqual([
      'files.referenced',
      'manifest.required',
      'parameters.labels',
      'tactile.assert',
      'tactile.range',
    ])
  })

  it('says a missing license is about reuse, not about a schema', () => {
    const message = result.errors.find((f) => f.check === 'manifest.required').message
    expect(message).toMatch(/license/)
    expect(message).toMatch(/legally reuse/)
  })

  it('names the file, where it is read, and that it is sitting right there', () => {
    const message = result.errors.find((f) => f.check === 'files.referenced').message
    expect(message).toContain('undeclared-logo.svg')
    expect(message).toContain('logo_file on line')
    expect(message).toMatch(/in this folder but not listed/)
  })

  it('explains why a tactile value with no assert is the dangerous kind', () => {
    const message = result.errors.find((f) => f.check === 'tactile.assert').message
    expect(message).toMatch(/exports, prints, and looks right/)
  })
})

describe('validateExample on things that are not tiles', () => {
  it('says so when there is no folder', () => {
    const result = validateExample(path.join('tests', 'fixtures', 'no-such-tile'))
    expect(checks(result.errors)).toEqual(['folder'])
  })

  it('requires every field the app relies on', () => {
    expect(REQUIRED_MANIFEST_FIELDS).toEqual([
      'name',
      'description',
      'version',
      'author',
      'license',
      'main',
      'files',
    ])
  })
})

describe('formatReport', () => {
  const passing = { dir: 'public/examples/x', errors: [], notes: [] }

  it('points at the render gate only when the static checks passed', () => {
    expect(formatReport([passing])).toMatch(/wasm-smoke/)
    expect(
      formatReport([{ dir: 'x', errors: [{ check: 'a', message: 'b' }], notes: [] }])
    ).not.toMatch(/wasm-smoke/)
  })

  it('counts errors and notes separately, because notes are not failures', () => {
    const report = formatReport([
      { dir: 'x', errors: [], notes: [{ check: 'n', message: 'just so you know' }] },
    ])
    expect(report).toMatch(/PASSED/)
    expect(report).toMatch(/1 note/)
  })

  it('names a skipped folder rather than passing over it in silence', () => {
    expect(formatReport([passing], ['public/examples/benchmarks'])).toMatch(
      /skipped public\/examples\/benchmarks/
    )
  })
})
