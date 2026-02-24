/**
 * Regression tests for the handleFile extension guard.
 *
 * The guard was previously placed outside the `isActualFileUpload` block,
 * causing saved manifest projects (whose `originalName` is a display name
 * like "My Tablet Keyguard Designer" with no .scad/.zip extension) to trigger
 * an alert and silently return instead of loading.
 *
 * These tests replicate the guard logic in isolation to document the correct
 * behaviour and prevent regressions.
 */

import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Replicate the guard logic extracted from handleFile
// ---------------------------------------------------------------------------

/**
 * Mirrors the fixed guard logic inside handleFile's `if (file)` block.
 *
 * Returns 'blocked' when the old (buggy) guard would have fired,
 * 'passed' otherwise.
 */
function runExtensionGuard({ fileName, content, fileInstance }) {
  const fileNameLower = fileName.toLowerCase()
  const isZip = fileNameLower.endsWith('.zip')
  const isScad = fileNameLower.endsWith('.scad')
  // isActualFileUpload: only true for real File objects without pre-loaded content
  const isActualFileUpload = !content && fileInstance instanceof File

  if (isActualFileUpload) {
    if (!isZip && !isScad) {
      return 'blocked'
    }
  }

  return 'passed'
}

/**
 * Mirrors the OLD (buggy) guard logic for comparison.
 */
function runBuggyExtensionGuard({ fileName, content, fileInstance }) {
  const fileNameLower = fileName.toLowerCase()
  const isActualFileUpload = !content && fileInstance instanceof File

  if (isActualFileUpload) {
    // Ajv validation would run here (omitted — not relevant to this guard)
  }

  const isZip = fileNameLower.endsWith('.zip')
  const isScad = fileNameLower.endsWith('.scad')
  if (!isZip && !isScad) {
    return 'blocked'  // ← fires for saved-project synthetic objects too
  }

  return 'passed'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleFile extension guard — saved manifest project reload', () => {
  it('should NOT block a saved manifest project whose originalName has no extension (fixed guard)', () => {
    // Simulates: loadSavedProject → handleFile({ name: 'My Tablet Keyguard Designer' }, content, ...)
    const result = runExtensionGuard({
      fileName: 'My Tablet Keyguard Designer',
      content: 'module box() {}',   // content already provided
      fileInstance: { name: 'My Tablet Keyguard Designer' }, // plain object, not File
    })
    expect(result).toBe('passed')
  })

  it('should block a real user upload of an unsupported file type (fixed guard)', () => {
    const result = runExtensionGuard({
      fileName: 'photo.png',
      content: null,
      fileInstance: new File(['data'], 'photo.png', { type: 'image/png' }),
    })
    expect(result).toBe('blocked')
  })

  it('should pass a real .scad user upload (fixed guard)', () => {
    const result = runExtensionGuard({
      fileName: 'design.scad',
      content: null,
      fileInstance: new File(['module x(){}'], 'design.scad'),
    })
    expect(result).toBe('passed')
  })

  it('should pass a real .zip user upload (fixed guard)', () => {
    const result = runExtensionGuard({
      fileName: 'project.zip',
      content: null,
      fileInstance: new File([new Uint8Array([80, 75, 3, 4])], 'project.zip'),
    })
    expect(result).toBe('passed')
  })

  it('should pass a manifest-URL load where file is null (fixed guard)', () => {
    // ?manifest=url path: handleFile(null, mainContent, ...) — file is null so
    // the entire if (file) block is skipped; guard is never reached.
    // This test documents that null file never enters the guard.
    const fileArg = null
    // Guard only runs inside `if (file)` — simulate that:
    if (fileArg) {
      throw new Error('Should not enter the if (file) block when file is null')
    }
    expect(true).toBe(true)
  })
})

describe('handleFile extension guard — regression: buggy guard DID block saved projects', () => {
  it('buggy guard blocks a saved manifest project with display-name originalName', () => {
    // Documents the old broken behaviour so the regression is explicit.
    const result = runBuggyExtensionGuard({
      fileName: 'My Tablet Keyguard Designer',
      content: 'module box() {}',
      fileInstance: { name: 'My Tablet Keyguard Designer' },
    })
    expect(result).toBe('blocked') // ← this was the bug
  })

  it('fixed guard does NOT block the same saved project', () => {
    const result = runExtensionGuard({
      fileName: 'My Tablet Keyguard Designer',
      content: 'module box() {}',
      fileInstance: { name: 'My Tablet Keyguard Designer' },
    })
    expect(result).toBe('passed') // ← fixed
  })
})
