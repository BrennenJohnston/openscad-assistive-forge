/**
 * Regression tests for the handleFile extension guard.
 *
 * The guard was previously placed outside the `isActualFileUpload` block,
 * causing saved manifest projects (whose `originalName` is a display name
 * like "My Tablet Keyguard Designer" with no .scad/.zip extension) to trigger
 * an alert and silently return instead of loading.
 *
 * Imports the real shouldProcessFile helper from file-handler.js — the
 * function handleFile actually calls — so these tests fail if the guard
 * regresses.
 */

import { describe, it, expect } from 'vitest'
import { shouldProcessFile } from '../../src/js/file-handler.js'

describe('handleFile extension guard — saved manifest project reload', () => {
  it('does NOT block a saved manifest project whose originalName has no extension', () => {
    // Simulates: loadSavedProject → handleFile({ name: 'My Tablet Keyguard Designer' }, content, ...)
    const result = shouldProcessFile(
      { name: 'My Tablet Keyguard Designer' }, // plain object, not File
      'module box() {}', // content already provided
      'My Tablet Keyguard Designer'
    )
    expect(result).toBe(true)
  })

  it('blocks a real user upload of an unsupported file type', () => {
    const result = shouldProcessFile(
      new File(['data'], 'photo.png', { type: 'image/png' }),
      null,
      'photo.png'
    )
    expect(result).toBe(false)
  })

  it('passes a real .scad user upload', () => {
    const result = shouldProcessFile(
      new File(['module x(){}'], 'design.scad'),
      null,
      'design.scad'
    )
    expect(result).toBe(true)
  })

  it('passes a real .zip user upload', () => {
    const result = shouldProcessFile(
      new File([new Uint8Array([80, 75, 3, 4])], 'project.zip'),
      null,
      'project.zip'
    )
    expect(result).toBe(true)
  })

  it('passes a manifest-URL load where file is null', () => {
    // ?manifest=url path: handleFile(null, mainContent, ...) — nothing to
    // extension-check, so processing must continue.
    expect(shouldProcessFile(null, 'module x(){}', 'example.scad')).toBe(true)
  })

  it('does not block a synthetic { name } object even without content', () => {
    // FileReader round-trip path: handleFile({ name }, e.target.result, ...)
    // passes a plain object; only real File instances are extension-checked.
    expect(
      shouldProcessFile({ name: 'display-name-no-extension' }, null, 'display-name-no-extension')
    ).toBe(true)
  })

  it('is case-insensitive for extensions', () => {
    expect(
      shouldProcessFile(new File(['x'], 'MODEL.SCAD'), null, 'MODEL.SCAD')
    ).toBe(true)
    expect(
      shouldProcessFile(new File(['x'], 'PROJECT.ZIP'), null, 'PROJECT.ZIP')
    ).toBe(true)
  })
})
