import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateManifest,
  resolveFileUrl,
  ManifestError,
  loadManifest,
  detectLfsPointer,
  resolveGitHubLfsUrl,
} from '../../src/js/manifest-loader.js'

// ---------------------------------------------------------------------------
// Helpers shared across describe blocks
// ---------------------------------------------------------------------------

/** Build a mock Response (text) */
function makeMockResponse(body, { ok = true, status = 200, headers = {} } = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const mock = {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: () => Promise.resolve(bodyStr),
    blob: () => Promise.resolve(new Blob([bodyStr])),
  }
  mock.clone = () => ({ ...mock })
  return mock
}

/** Build a mock blob Response for binary downloads */
function makeMockBlobResponse(blob, { ok = true, status = 200, contentLength = null, textContent = '' } = {}) {
  const mock = {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    headers: { get: (h) => (h === 'content-length' && contentLength !== null ? String(contentLength) : null) },
    text: () => Promise.resolve(textContent),
    blob: () => Promise.resolve(blob),
  }
  mock.clone = () => ({ ...mock })
  return mock
}

/** Create a real in-memory ZIP blob using JSZip */
async function makeZipBlob(fileContents) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const [name, content] of Object.entries(fileContents)) {
    zip.file(name, content)
  }
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  return new Blob([buffer], { type: 'application/zip' })
}

// ---------------------------------------------------------------------------
// ManifestError
// ---------------------------------------------------------------------------

describe('ManifestError', () => {
  it('should set name, code, and details', () => {
    const err = new ManifestError('boom', 'TEST_CODE', { url: 'http://x' })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ManifestError')
    expect(err.message).toBe('boom')
    expect(err.code).toBe('TEST_CODE')
    expect(err.details).toEqual({ url: 'http://x' })
  })

  it('should default details to null', () => {
    const err = new ManifestError('oops', 'CODE')
    expect(err.details).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  const validManifest = {
    forgeManifest: '1.0',
    files: { main: 'design.scad' },
  }

  it('should accept a minimal valid manifest', () => {
    const result = validateManifest(validManifest)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept a manifest with all optional fields', () => {
    const full = {
      ...validManifest,
      name: 'My Project',
      author: 'Jane',
      id: 'my-project',
      files: {
        main: 'design.scad',
        companions: ['helper.txt'],
        presets: 'presets.json',
        assets: ['logo.svg'],
      },
      defaults: { preset: 'Default', autoPreview: true },
    }
    expect(validateManifest(full).valid).toBe(true)
  })

  // -- root-level checks ---------------------------------------------------

  it('should reject null input', () => {
    const result = validateManifest(null)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/JSON object/)
  })

  it('should reject an array', () => {
    const result = validateManifest([1, 2])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/JSON object/)
  })

  it('should reject non-object primitives', () => {
    expect(validateManifest('string').valid).toBe(false)
  })

  // -- forgeManifest -------------------------------------------------------

  it('should require forgeManifest field', () => {
    const result = validateManifest({ files: { main: 'a.scad' } })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/forgeManifest/)])
    )
  })

  it('should reject unsupported manifest version', () => {
    const result = validateManifest({ forgeManifest: '99.0', files: { main: 'a.scad' } })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/Unsupported/)
  })

  // -- files ---------------------------------------------------------------

  it('should require files field', () => {
    const result = validateManifest({ forgeManifest: '1.0' })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/files/)])
    )
  })

  it('should require files.main', () => {
    const result = validateManifest({ forgeManifest: '1.0', files: {} })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/files\.main/)])
    )
  })

  it('should require files.main to end in .scad', () => {
    const result = validateManifest({ forgeManifest: '1.0', files: { main: 'thing.stl' } })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/\.scad/)
  })

  it('should reject non-string files.main', () => {
    const result = validateManifest({ forgeManifest: '1.0', files: { main: 42 } })
    expect(result.valid).toBe(false)
  })

  // -- companions ----------------------------------------------------------

  it('should reject non-array companions', () => {
    const data = { ...validManifest, files: { main: 'a.scad', companions: 'nope' } }
    const result = validateManifest(data)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/companions/)
  })

  it('should reject companions with non-string entries', () => {
    const data = { ...validManifest, files: { main: 'a.scad', companions: [123] } }
    expect(validateManifest(data).valid).toBe(false)
  })

  // -- presets -------------------------------------------------------------

  it('should accept a single preset string', () => {
    const data = { ...validManifest, files: { main: 'a.scad', presets: 'p.json' } }
    expect(validateManifest(data).valid).toBe(true)
  })

  it('should accept an array of preset strings', () => {
    const data = { ...validManifest, files: { main: 'a.scad', presets: ['a.json', 'b.json'] } }
    expect(validateManifest(data).valid).toBe(true)
  })

  it('should reject presets with non-string array entries', () => {
    const data = { ...validManifest, files: { main: 'a.scad', presets: [1, 2] } }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should reject presets that are neither string nor array', () => {
    const data = { ...validManifest, files: { main: 'a.scad', presets: 42 } }
    expect(validateManifest(data).valid).toBe(false)
  })

  // -- assets --------------------------------------------------------------

  it('should reject non-array assets', () => {
    const data = { ...validManifest, files: { main: 'a.scad', assets: 'nope' } }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should reject assets with non-string entries', () => {
    const data = { ...validManifest, files: { main: 'a.scad', assets: [true] } }
    expect(validateManifest(data).valid).toBe(false)
  })

  // -- file count cap ------------------------------------------------------

  it('should reject manifests exceeding max file count (50)', () => {
    const companions = Array.from({ length: 55 }, (_, i) => `file${i}.txt`)
    const data = { ...validManifest, files: { main: 'a.scad', companions } }
    const result = validateManifest(data)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/56 files/)
  })

  // -- defaults ------------------------------------------------------------

  it('should reject non-object defaults', () => {
    const data = { ...validManifest, defaults: 'nope' }
    expect(validateManifest(data).valid).toBe(false)
  })

  // -- optional metadata type checks --------------------------------------

  it('should reject non-string name', () => {
    const data = { ...validManifest, name: 123 }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should reject non-string author', () => {
    const data = { ...validManifest, author: true }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should reject non-string id', () => {
    const data = { ...validManifest, id: [] }
    expect(validateManifest(data).valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveFileUrl
// ---------------------------------------------------------------------------

describe('resolveFileUrl', () => {
  const base = 'https://raw.githubusercontent.com/user/repo/main/forge-manifest.json'

  it('should resolve relative paths against the manifest URL', () => {
    const result = resolveFileUrl('design.scad', base)
    expect(result).toBe(
      'https://raw.githubusercontent.com/user/repo/main/design.scad'
    )
  })

  it('should pass through absolute http URLs unchanged', () => {
    const abs = 'http://example.com/file.scad'
    expect(resolveFileUrl(abs, base)).toBe(abs)
  })

  it('should pass through absolute https URLs unchanged', () => {
    const abs = 'https://cdn.example.com/asset.svg'
    expect(resolveFileUrl(abs, base)).toBe(abs)
  })

  it('should reject paths containing ".."', () => {
    expect(() => resolveFileUrl('../etc/passwd', base)).toThrow(ManifestError)
    expect(() => resolveFileUrl('../etc/passwd', base)).toThrow(/directory traversal/)
  })
})

// ---------------------------------------------------------------------------
// loadManifest (integration — uses mocked fetch)
// ---------------------------------------------------------------------------

describe('loadManifest', () => {
  const manifestUrl =
    'https://raw.githubusercontent.com/user/repo/main/forge-manifest.json'

  const sampleManifest = {
    forgeManifest: '1.0',
    name: 'Test Project',
    files: {
      main: 'design.scad',
      companions: ['helper.txt'],
      presets: 'presets.json',
    },
    defaults: { preset: 'Default', autoPreview: true },
  }

  /** Helper: build a mock Response */
  function mockResponse(body, { ok = true, status = 200, headers = {} } = {}) {
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Not Found',
      headers: {
        get: (name) => headers[name.toLowerCase()] || null,
      },
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should load a project from a valid manifest', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))       // manifest
      .mockResolvedValueOnce(mockResponse('module x();'))         // design.scad
      .mockResolvedValueOnce(mockResponse('helper content'))      // helper.txt
      .mockResolvedValueOnce(mockResponse('{"presets":{}}'))      // presets.json

    const result = await loadManifest(manifestUrl)

    expect(result.manifest).toEqual(sampleManifest)
    expect(result.mainFile).toBe('design.scad')
    expect(result.mainContent).toBe('module x();')
    expect(result.projectFiles).toBeInstanceOf(Map)
    expect(result.projectFiles.size).toBe(3)
    expect(result.projectFiles.get('helper.txt')).toBe('helper content')
    expect(result.defaults).toEqual(sampleManifest.defaults)
  })

  it('should invoke onProgress callbacks', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))
      .mockResolvedValueOnce(mockResponse('code'))
      .mockResolvedValueOnce(mockResponse('txt'))
      .mockResolvedValueOnce(mockResponse('{}'))

    const progress = vi.fn()
    await loadManifest(manifestUrl, { onProgress: progress })

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'manifest' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'validate' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'download' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'complete' }))
  })

  it('should throw ManifestError on invalid JSON', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse('not json {{{'))

    await expect(loadManifest(manifestUrl)).rejects.toSatisfy((err) => {
      return err instanceof ManifestError && /PARSE_ERROR/.test(err.code)
    })
  })

  it('should throw ManifestError when validation fails', async () => {
    const bad = { forgeManifest: '1.0', files: {} } // missing files.main
    global.fetch.mockResolvedValueOnce(mockResponse(bad))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should throw ManifestError on HTTP error fetching a file', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))
      .mockResolvedValueOnce(mockResponse('', { ok: false, status: 404 }))
      .mockResolvedValueOnce(mockResponse('ok'))
      .mockResolvedValueOnce(mockResponse('ok'))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should throw ManifestError when a file exceeds size limit', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))
      .mockResolvedValueOnce(
        mockResponse('code', { headers: { 'content-length': String(60 * 1024 * 1024) } })
      )
      .mockResolvedValueOnce(mockResponse('ok'))
      .mockResolvedValueOnce(mockResponse('ok'))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(/size limit/)
  })

  it('should throw ManifestError on CORS/network TypeError', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(mockResponse('ok'))
      .mockResolvedValueOnce(mockResponse('ok'))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should throw ManifestError on generic network error', async () => {
    global.fetch
      .mockResolvedValueOnce(mockResponse(sampleManifest))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(mockResponse('ok'))
      .mockResolvedValueOnce(mockResponse('ok'))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should re-throw ManifestError from manifest fetch', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse('', { ok: false, status: 403 }))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should handle manifest with assets', async () => {
    const withAssets = {
      forgeManifest: '1.0',
      files: {
        main: 'design.scad',
        assets: ['logo.svg'],
      },
    }

    global.fetch
      .mockResolvedValueOnce(mockResponse(withAssets))
      .mockResolvedValueOnce(mockResponse('module y();'))
      .mockResolvedValueOnce(mockResponse('<svg></svg>'))

    const result = await loadManifest(manifestUrl)
    expect(result.projectFiles.size).toBe(2)
    expect(result.projectFiles.get('logo.svg')).toBe('<svg></svg>')
  })

  it('should default to empty object for missing defaults', async () => {
    const noDefaults = {
      forgeManifest: '1.0',
      files: { main: 'a.scad' },
    }

    global.fetch
      .mockResolvedValueOnce(mockResponse(noDefaults))
      .mockResolvedValueOnce(mockResponse('code'))

    const result = await loadManifest(manifestUrl)
    expect(result.defaults).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// validateManifest — files.bundle field
// ---------------------------------------------------------------------------

describe('validateManifest — files.bundle', () => {
  const base = { forgeManifest: '1.0' }

  it('should accept a bundle-only manifest (no files.main required)', () => {
    const data = { ...base, files: { bundle: 'project.zip' } }
    const result = validateManifest(data)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept a bundle manifest with optional files.main override', () => {
    const data = { ...base, files: { bundle: 'project.zip', main: 'design.scad' } }
    expect(validateManifest(data).valid).toBe(true)
  })

  it('should accept a bundle manifest with defaults', () => {
    const data = {
      ...base,
      files: { bundle: 'project.zip' },
      defaults: { autoPreview: true },
    }
    expect(validateManifest(data).valid).toBe(true)
  })

  it('should reject a bundle that does not end in .zip', () => {
    const data = { ...base, files: { bundle: 'project.tar.gz' } }
    const result = validateManifest(data)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/\.zip/)
  })

  it('should reject a non-string bundle value', () => {
    const data = { ...base, files: { bundle: 42 } }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should reject an empty string bundle value', () => {
    const data = { ...base, files: { bundle: '' } }
    expect(validateManifest(data).valid).toBe(false)
  })

  it('should still require files.main to be a .scad file when provided with bundle', () => {
    const data = { ...base, files: { bundle: 'project.zip', main: 'thing.stl' } }
    const result = validateManifest(data)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/\.scad/)
  })

  it('should still require files.main when no bundle is present', () => {
    const data = { ...base, files: {} }
    const result = validateManifest(data)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/files\.main/)])
    )
  })
})

// ---------------------------------------------------------------------------
// loadManifest — bundle path
// ---------------------------------------------------------------------------

describe('loadManifest — bundle path', () => {
  const manifestUrl =
    'https://raw.githubusercontent.com/user/repo/main/forge-manifest.json'

  const bundleManifest = {
    forgeManifest: '1.0',
    name: 'Bundle Project',
    files: { bundle: 'project.zip' },
    defaults: { autoPreview: true },
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should extract a zip bundle and return project files', async () => {
    const zipBlob = await makeZipBlob({
      'design.scad': 'module box() {}',
      'helper.txt': 'helper content',
    })

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))   // manifest
      .mockResolvedValueOnce(makeMockBlobResponse(zipBlob))      // bundle zip

    const result = await loadManifest(manifestUrl)

    expect(result.manifest).toEqual(bundleManifest)
    expect(result.projectFiles).toBeInstanceOf(Map)
    expect(result.projectFiles.has('design.scad')).toBe(true)
    expect(result.mainFile).toBe('design.scad')
    expect(result.defaults).toEqual({ autoPreview: true })
  })

  it('should use files.main override when specified in bundle manifest', async () => {
    const overrideManifest = {
      forgeManifest: '1.0',
      files: { bundle: 'project.zip', main: 'secondary.scad' },
    }

    const zipBlob = await makeZipBlob({
      'main.scad': 'module main() {}',
      'secondary.scad': 'module secondary() {}',
    })

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(overrideManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(zipBlob))

    const result = await loadManifest(manifestUrl)

    expect(result.mainFile).toBe('secondary.scad')
  })

  it('should throw BUNDLE_EXTRACT_ERROR when zip is invalid', async () => {
    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(new Blob(['not a zip'])))

    await expect(loadManifest(manifestUrl)).rejects.toSatisfy(
      (err) => err instanceof ManifestError && err.code === 'BUNDLE_EXTRACT_ERROR'
    )
  })

  it('should throw ManifestError on HTTP error fetching bundle', async () => {
    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(new Blob([]), { ok: false, status: 404 }))

    await expect(loadManifest(manifestUrl)).rejects.toThrow(ManifestError)
  })

  it('should throw ManifestError on CORS error fetching bundle', async () => {
    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(loadManifest(manifestUrl)).rejects.toSatisfy(
      (err) => err instanceof ManifestError && err.code === 'CORS_ERROR'
    )
  })

  it('should invoke onProgress callbacks during bundle load', async () => {
    const zipBlob = await makeZipBlob({ 'design.scad': 'module x() {}' })

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(zipBlob))

    const progress = vi.fn()
    await loadManifest(manifestUrl, { onProgress: progress })

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'manifest' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'download' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'complete' }))
  })
})

// ---------------------------------------------------------------------------
// detectLfsPointer
// ---------------------------------------------------------------------------

describe('detectLfsPointer', () => {
  const validPointer = [
    'version https://git-lfs.github.com/spec/v1',
    'oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
    'size 65697432',
  ].join('\n')

  it('should parse a valid LFS pointer', () => {
    const result = detectLfsPointer(validPointer)
    expect(result).not.toBeNull()
    expect(result.oid).toBe('4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393')
    expect(result.size).toBe(65697432)
  })

  it('should return null for regular file content', () => {
    expect(detectLfsPointer('PK\x03\x04...')).toBeNull()
    expect(detectLfsPointer('module design() {}')).toBeNull()
    expect(detectLfsPointer('')).toBeNull()
  })

  it('should return null when oid line is missing', () => {
    const noOid = 'version https://git-lfs.github.com/spec/v1\nsize 65697432\n'
    expect(detectLfsPointer(noOid)).toBeNull()
  })

  it('should return null when size line is missing', () => {
    const noSize = 'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\n'
    expect(detectLfsPointer(noSize)).toBeNull()
  })

  it('should return null when oid hash is wrong length', () => {
    const shortOid = [
      'version https://git-lfs.github.com/spec/v1',
      'oid sha256:4d7a214614ab2935',
      'size 65697432',
    ].join('\n')
    expect(detectLfsPointer(shortOid)).toBeNull()
  })

  it('should handle pointer with trailing newline', () => {
    const result = detectLfsPointer(validPointer + '\n')
    expect(result).not.toBeNull()
    expect(result.size).toBe(65697432)
  })
})

// ---------------------------------------------------------------------------
// resolveGitHubLfsUrl
// ---------------------------------------------------------------------------

describe('resolveGitHubLfsUrl', () => {
  it('should replace raw.githubusercontent.com with media.githubusercontent.com/media', () => {
    const raw = 'https://raw.githubusercontent.com/owner/repo/main/designs/bundle.zip'
    const expected = 'https://media.githubusercontent.com/media/owner/repo/main/designs/bundle.zip'
    expect(resolveGitHubLfsUrl(raw)).toBe(expected)
  })

  it('should return non-raw URLs unchanged', () => {
    const url = 'https://example.com/files/bundle.zip'
    expect(resolveGitHubLfsUrl(url)).toBe(url)
  })

  it('should return media URLs unchanged', () => {
    const url = 'https://media.githubusercontent.com/media/owner/repo/main/bundle.zip'
    expect(resolveGitHubLfsUrl(url)).toBe(url)
  })
})

// ---------------------------------------------------------------------------
// fetchBlob LFS redirect (via loadManifest integration)
// ---------------------------------------------------------------------------

describe('loadManifest — LFS pointer redirect', () => {
  const manifestUrl = 'https://raw.githubusercontent.com/alice/my-project/main/forge-manifest.json'

  const lfsPointerText = [
    'version https://git-lfs.github.com/spec/v1',
    'oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
    'size 65697432',
  ].join('\n')

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should transparently re-fetch from media URL when raw URL returns an LFS pointer', async () => {
    const bundleManifest = {
      forgeManifest: '1.0',
      files: { bundle: 'bundle.zip' },
    }

    const zipBlob = await makeZipBlob({ 'design.scad': 'module x() {}' })

    global.fetch
      // 1. manifest fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      // 2. raw bundle fetch — returns LFS pointer (small, < 1 KB)
      .mockResolvedValueOnce(makeMockBlobResponse(
        new Blob([lfsPointerText], { type: 'text/plain' }),
        { contentLength: lfsPointerText.length, textContent: lfsPointerText }
      ))
      // 3. media bundle fetch — returns real ZIP
      .mockResolvedValueOnce(makeMockBlobResponse(zipBlob))

    const result = await loadManifest(manifestUrl)

    expect(result.projectFiles.has('design.scad')).toBe(true)

    // Verify the third fetch went to media.githubusercontent.com
    const calls = global.fetch.mock.calls
    expect(calls[2][0]).toContain('media.githubusercontent.com/media/')
  })

  it('should throw LFS_POINTER error when non-GitHub URL returns an LFS pointer', async () => {
    const bundleManifest = {
      forgeManifest: '1.0',
      files: { bundle: 'https://example.com/bundle.zip' },
    }

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(
        new Blob([lfsPointerText], { type: 'text/plain' }),
        { contentLength: lfsPointerText.length, textContent: lfsPointerText }
      ))

    await expect(loadManifest(manifestUrl)).rejects.toSatisfy(
      (err) => err instanceof ManifestError && err.code === 'LFS_POINTER'
    )
  })
})

// ---------------------------------------------------------------------------
// Size limits
// ---------------------------------------------------------------------------

describe('Size limits', () => {
  const manifestUrl = 'https://raw.githubusercontent.com/alice/my-project/main/forge-manifest.json'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should reject a bundle reported as larger than 500 MB via content-length', async () => {
    const bundleManifest = {
      forgeManifest: '1.0',
      files: { bundle: 'bundle.zip' },
    }

    const oversizeBytes = 501 * 1024 * 1024

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(new Blob([]), { contentLength: oversizeBytes }))

    await expect(loadManifest(manifestUrl)).rejects.toSatisfy(
      (err) => err instanceof ManifestError && err.code === 'FILE_TOO_LARGE'
    )
  })

  it('should accept a bundle reported as 200 MB via content-length', async () => {
    const bundleManifest = {
      forgeManifest: '1.0',
      files: { bundle: 'bundle.zip' },
    }

    const zipBlob = await makeZipBlob({ 'design.scad': 'module x() {}' })
    const twoHundredMB = 200 * 1024 * 1024

    global.fetch
      .mockResolvedValueOnce(makeMockResponse(bundleManifest))
      .mockResolvedValueOnce(makeMockBlobResponse(zipBlob, { contentLength: twoHundredMB }))

    const result = await loadManifest(manifestUrl)
    expect(result.projectFiles.has('design.scad')).toBe(true)
  })
})
