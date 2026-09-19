import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PROJECT_MANIFEST_FILENAME,
  getBuiltinManifest,
  loadProjectManifest,
  applyPreviewOverrides,
} from '../../src/js/project-manifest.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyPreviewOverrides — builtin (historical keyguard/braille behavior)', () => {
  const builtin = getBuiltinManifest()

  it('forces render_quality to Low during auto-fast preview when the param exists', () => {
    const result = applyPreviewOverrides(
      builtin,
      { render_quality: 'High', width: 10 },
      'auto-fast-preview'
    )
    expect(result.render_quality).toBe('Low')
    expect(result.width).toBe(10)
  })

  it('clamps cone_segments into [8, 12]', () => {
    const clampCases = [
      [40, 12],
      [10, 10],
      [3, 8],
      ['nonsense', 12],
    ]
    for (const [input, expected] of clampCases) {
      const result = applyPreviewOverrides(
        builtin,
        { cone_segments: input },
        'auto-fast-preview'
      )
      expect(result.cone_segments, `input ${input}`).toBe(expected)
    }
  })

  it('is inert for models without the named parameters', () => {
    const params = { width: 50, height: 30 }
    const result = applyPreviewOverrides(builtin, params, 'auto-fast-preview')
    expect(result).toBe(params)
  })

  it('is inert for non-matching quality keys', () => {
    const params = { render_quality: 'High' }
    expect(applyPreviewOverrides(builtin, params, 'balanced')).toBe(params)
    expect(applyPreviewOverrides(builtin, params, undefined)).toBe(params)
  })

  it('never mutates the input parameters object', () => {
    const params = { render_quality: 'High', cone_segments: 40 }
    applyPreviewOverrides(builtin, params, 'auto-fast-preview')
    expect(params).toEqual({ render_quality: 'High', cone_segments: 40 })
  })
})

describe('loadProjectManifest', () => {
  it('returns null when no project files or no manifest present', () => {
    expect(loadProjectManifest(null)).toBeNull()
    expect(loadProjectManifest(new Map([['main.scad', 'cube(1);']]))).toBeNull()
  })

  it('parses a valid manifest at the project root', () => {
    const files = new Map([
      ['main.scad', 'cube(1);'],
      [
        PROJECT_MANIFEST_FILENAME,
        JSON.stringify({
          version: 1,
          previewOverrides: { 'auto-fast': { set: { detail: 'coarse' } } },
        }),
      ],
    ])
    const manifest = loadProjectManifest(files)
    expect(manifest?.previewOverrides['auto-fast'].set.detail).toBe('coarse')
  })

  it('finds a manifest nested one folder deep (zip roots)', () => {
    const files = new Map([
      [
        `my-project/${PROJECT_MANIFEST_FILENAME}`,
        JSON.stringify({ version: 1 }),
      ],
    ])
    expect(loadProjectManifest(files)).toEqual({ version: 1 })
  })

  it('warns and returns null on malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const files = new Map([[PROJECT_MANIFEST_FILENAME, '{not json']])
    expect(loadProjectManifest(files)).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('malformed')
    )
  })

  it('warns and returns null on unsupported version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const files = new Map([
      [PROJECT_MANIFEST_FILENAME, JSON.stringify({ version: 99 })],
    ])
    expect(loadProjectManifest(files)).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unsupported version')
    )
  })

  it('memoizes per file-map identity', () => {
    const files = new Map([
      [PROJECT_MANIFEST_FILENAME, JSON.stringify({ version: 1 })],
    ])
    const first = loadProjectManifest(files)
    const second = loadProjectManifest(files)
    expect(second).toBe(first)
  })

  it('decodes Uint8Array manifest content', () => {
    const files = new Map([
      [
        PROJECT_MANIFEST_FILENAME,
        new TextEncoder().encode(JSON.stringify({ version: 1 })),
      ],
    ])
    expect(loadProjectManifest(files)).toEqual({ version: 1 })
  })
})

describe('applyPreviewOverrides — explicit project manifest', () => {
  it('applies custom set and clampInt rules from a project manifest', () => {
    const manifest = {
      version: 1,
      previewOverrides: {
        'auto-fast': {
          set: { detail_level: 'draft' },
          clampInt: { segments: [4, 16] },
        },
      },
    }
    const result = applyPreviewOverrides(
      manifest,
      { detail_level: 'fine', segments: 64, other: 1 },
      'auto-fast-preview'
    )
    expect(result).toEqual({ detail_level: 'draft', segments: 16, other: 1 })
  })

  it('matches the keyguard fixture manifest against the historical behavior', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(
      join(
        process.cwd(),
        'tests',
        'fixtures',
        'keyguard-v75',
        'forge.project.json'
      ),
      'utf-8'
    )
    const files = new Map([[PROJECT_MANIFEST_FILENAME, raw]])
    const manifest = loadProjectManifest(files)

    const params = { render_quality: 'High', cone_segments: 40 }
    const viaManifest = applyPreviewOverrides(
      manifest,
      params,
      'auto-fast-preview'
    )
    const viaBuiltin = applyPreviewOverrides(
      getBuiltinManifest(),
      params,
      'auto-fast-preview'
    )
    expect(viaManifest).toEqual(viaBuiltin)
  })
})
