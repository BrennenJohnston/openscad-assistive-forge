import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  EXAMPLES,
  PROGRAMS,
  exampleDefinitions,
  programDefinitions,
  companionFileNames,
  mainFileName,
  programForExample,
} from '../../src/js/tile-registry.js'
import {
  EXAMPLE_DEFINITIONS,
  PROGRAM_DEFINITIONS,
} from '../../src/js/file-handler.js'

const PUBLIC = path.join(process.cwd(), 'public')

describe('the registry is the one source the loader reads', () => {
  it('is exactly what file-handler exports, not a copy of it', () => {
    expect(EXAMPLE_DEFINITIONS).toBe(exampleDefinitions())
    expect(PROGRAM_DEFINITIONS).toBe(programDefinitions())
  })

  it('still describes every example the app shipped with', () => {
    // A refactor that quietly lost a tile would be the worst outcome here.
    expect(Object.keys(EXAMPLES)).toEqual([
      'simple-box',
      'cylinder',
      'library-test',
      'colored-box',
      'multi-file-box',
      'cable-organizer',
      'honeycomb-grid',
      'logo-plate',
      'nasif-charm-maker',
      'braille-wedge-card',
      'braille-charm',
      'braille-sign',
      'q-charm',
    ])
    expect(Object.keys(PROGRAMS)).toEqual([
      'charm-customizer',
      'braille-card-customizer',
    ])
  })
})

describe('every file a tile names is really there (D-97)', () => {
  // The defect this registry exists to end: logo-plate's own manifest.json
  // declared sample-logo.svg, the file was on disk, and the loader read a
  // different list that omitted it. The first preview errored with "Can't open
  // file '/tmp/sample-logo.svg'" while the status said "Preview ready".
  for (const [key, entry] of Object.entries(EXAMPLES)) {
    it(`${key}: its main file and companions exist on disk`, () => {
      const onDisk = (webPath) => path.join(PUBLIC, webPath.replace(/^\//, ''))
      expect(fs.existsSync(onDisk(entry.path)), entry.path).toBe(true)
      for (const file of entry.additionalFiles || []) {
        expect(fs.existsSync(onDisk(file)), file).toBe(true)
      }
      if (entry.manifest) {
        expect(fs.existsSync(onDisk(entry.manifest)), entry.manifest).toBe(true)
      }
    })
  }

  it('logo-plate carries the file its own manifest declares', () => {
    expect(companionFileNames('logo-plate')).toContain('sample-logo.svg')
  })
})

describe('a manifest and the registry cannot drift in silence', () => {
  // This is the check that would have caught D-97, and it is the shape IR-8's
  // validator takes for a contributed tile.
  for (const [key, entry] of Object.entries(EXAMPLES)) {
    if (!entry.manifest) continue
    it(`${key}: everything manifest.json declares, the registry carries`, () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PUBLIC, entry.manifest.replace(/^\//, '')),
          'utf8'
        )
      )
      // Both sides compared by bare name: a manifest declares
      // `svg-library/heart.svg` while the registry holds the full URL. The
      // question is whether the file is FETCHED, not how it is spelled.
      const declared = (manifest.files || []).map((f) => f.split('/').pop())
      const carried = new Set([
        mainFileName(key),
        ...companionFileNames(key),
      ])
      const missing = declared.filter((name) => !carried.has(name))
      expect(missing, `${key} declares files the loader never fetches`).toEqual(
        []
      )
    })
  }
})

describe('every shipped SVG is one a browser can actually parse (D-105)', () => {
  // sample-logo.svg carried byte 0x14 in a comment - a control character XML
  // does not allow. OpenSCAD's importer ignored it; the browser's parser
  // refused the whole document, so the reference overlay failed to load the
  // moment the file finally reached the project.
  const svgs = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.svg')) svgs.push(full)
    }
  }
  walk(path.join(PUBLIC, 'examples'))

  it('finds SVGs to check', () => {
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('none of them contains a character XML forbids', () => {
    // XML 1.0 allows tab, newline, carriage return, and nothing else below
    // 0x20.
    const offenders = svgs.filter((file) => {
      const bytes = fs.readFileSync(file)
      return bytes.some(
        (b) => b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d
      )
    })
    expect(
      offenders.map((f) => path.relative(PUBLIC, f)),
      'a browser will refuse these outright'
    ).toEqual([])
  })
})

describe('adding a tile is a one-place edit', () => {
  it('a new entry brings its files and its program with it', () => {
    // A synthetic entry, never a shipped one: the point is to show that the
    // registry is the only place a tile has to be described.
    const registry = {
      ...EXAMPLES,
      'demo-widget': {
        path: '/examples/demo-widget/demo_widget.scad',
        name: 'demo_widget.scad',
        description: 'Demo Widget',
        manifest: '/examples/demo-widget/manifest.json',
        additionalFiles: ['/examples/demo-widget/parts/base.svg'],
      },
    }
    const programs = {
      ...PROGRAMS,
      'demo-program': { label: 'Demo Program', examples: ['demo-widget'] },
    }

    const names = (key) =>
      (registry[key].additionalFiles || []).map((p) => p.split('/').pop())
    expect(names('demo-widget')).toEqual(['base.svg'])
    expect(
      Object.entries(programs).find(([, p]) =>
        p.examples.includes('demo-widget')
      )?.[0]
    ).toBe('demo-program')
  })

  it('reports which program a shipped example belongs to', () => {
    expect(programForExample('q-charm')).toBe('charm-customizer')
    expect(programForExample('braille-sign')).toBe('braille-card-customizer')
    expect(programForExample('simple-box')).toBeNull()
  })

  it('reads a main file name without its path', () => {
    expect(mainFileName('simple-box')).toBe('simple_box.scad')
    expect(mainFileName('nope')).toBeNull()
  })

  it('has no companions to report for an example without any', () => {
    expect(companionFileNames('simple-box')).toEqual([])
    expect(companionFileNames('nope')).toEqual([])
  })
})
