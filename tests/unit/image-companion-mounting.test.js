/**
 * Unit tests for S-013: Image companion file mounting in the worker FS.
 *
 * Image files (PNG, JPEG) arrive as base64 data-URL strings from the browser
 * (via FileReader.readAsDataURL or ZIP extraction). The worker's mountFiles()
 * must decode these to Uint8Array before writing to the Emscripten FS, so that
 * OpenSCAD surface() and import() see valid binary content.
 *
 * Since mountFiles() is module-scoped inside the worker, we test the
 * underlying logic units (decodeDataUrl, detection heuristic) directly.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { decodeDataUrl } from '../../src/js/file-param-resolver.js';

// Minimal PNG: 1x1 transparent pixel (89 50 4E 47 … header)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
  'Nl7BcQAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

// Minimal JPEG: starts with FF D8 FF
const TINY_JPEG_BASE64 = '/9j/4AAQSkZJRg==';
const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// JPEG magic bytes: FF D8 FF
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

// ---------------------------------------------------------------------------
// Data URL detection heuristic (mirrors mountFiles logic)
// ---------------------------------------------------------------------------

function isDataUrl(content) {
  return typeof content === 'string' && content.startsWith('data:');
}

describe('Image companion file data URL detection', () => {
  it('detects PNG data URL', () => {
    expect(isDataUrl(TINY_PNG_DATA_URL)).toBe(true);
  });

  it('detects JPEG data URL', () => {
    expect(isDataUrl(TINY_JPEG_DATA_URL)).toBe(true);
  });

  it('rejects plain text content', () => {
    expect(isDataUrl('cube([10, 10, 10]);')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isDataUrl('')).toBe(false);
  });

  it('rejects non-string (Uint8Array)', () => {
    expect(isDataUrl(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('rejects strings starting with "data" but not "data:"', () => {
    expect(isDataUrl('database connection string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Binary integrity after decode
// ---------------------------------------------------------------------------

describe('Image data URL decode produces valid binary', () => {
  it('decodes PNG data URL to Uint8Array with PNG magic bytes', () => {
    const bytes = decodeDataUrl(TINY_PNG_DATA_URL);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(8);
    for (let i = 0; i < PNG_MAGIC.length; i++) {
      expect(bytes[i]).toBe(PNG_MAGIC[i]);
    }
  });

  it('decodes JPEG data URL to Uint8Array with JPEG magic bytes', () => {
    const bytes = decodeDataUrl(TINY_JPEG_DATA_URL);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(3);
    for (let i = 0; i < JPEG_MAGIC.length; i++) {
      expect(bytes[i]).toBe(JPEG_MAGIC[i]);
    }
  });

  it('decoded PNG size matches expected binary length', () => {
    const bytes = decodeDataUrl(TINY_PNG_DATA_URL);
    const expectedLength = atob(TINY_PNG_BASE64).length;
    expect(bytes.byteLength).toBe(expectedLength);
  });

  it('decoded bytes are not the data URL text itself', () => {
    const bytes = decodeDataUrl(TINY_PNG_DATA_URL);
    const textEncoder = new TextEncoder();
    const textBytes = textEncoder.encode(TINY_PNG_DATA_URL);
    expect(bytes.byteLength).not.toBe(textBytes.byteLength);
    expect(bytes[0]).toBe(0x89); // PNG magic, not 'd' (0x64)
  });
});

// ---------------------------------------------------------------------------
// mountFiles decode-or-passthrough logic (inlined from worker)
// ---------------------------------------------------------------------------

function resolveContent(content) {
  if (typeof content === 'string' && content.startsWith('data:')) {
    return decodeDataUrl(content);
  }
  return content;
}

describe('mountFiles content resolution', () => {
  it('decodes PNG data URL to binary Uint8Array', () => {
    const result = resolveContent(TINY_PNG_DATA_URL);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x89);
  });

  it('passes through plain text (SCAD code) unchanged', () => {
    const scad = 'include <utils.scad>\ncube(10);';
    const result = resolveContent(scad);
    expect(result).toBe(scad);
  });

  it('passes through text .dat heightmap content unchanged', () => {
    const dat = '0 0 0 0\n0 1 1 0\n0 1 1 0\n0 0 0 0\n';
    const result = resolveContent(dat);
    expect(result).toBe(dat);
  });

  it('passes through Uint8Array content unchanged', () => {
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = resolveContent(binary);
    expect(result).toBe(binary);
  });
});

// ---------------------------------------------------------------------------
// ZIP extraction data URL format (verifies the format matches what we decode)
// ---------------------------------------------------------------------------

describe('ZIP extraction image format compatibility', () => {
  it('data URL format from ZIP matches decode expectations', () => {
    // Simulate what zip-handler.js produces:
    // files.set(normalizedPath, `data:image/${mime};base64,${base64Data}`)
    const zipOutput = `data:image/png;base64,${TINY_PNG_BASE64}`;
    const bytes = decodeDataUrl(zipOutput);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x89);
  });

  it('data URL format from FileReader matches decode expectations', () => {
    // FileReader.readAsDataURL produces the same format
    const readerOutput = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
    const bytes = decodeDataUrl(readerOutput);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0xff);
  });
});

// ---------------------------------------------------------------------------
// Edge cases for robustness
// ---------------------------------------------------------------------------

describe('Image mounting edge cases', () => {
  it('handles data URL with no base64 data gracefully', () => {
    expect(() => decodeDataUrl('data:image/png;base64,')).not.toThrow();
    const bytes = decodeDataUrl('data:image/png;base64,');
    expect(bytes.byteLength).toBe(0);
  });

  it('handles GIF data URL (webp/gif companion files)', () => {
    // GIF89a header: 47 49 46 38 39 61
    const gifBase64 = btoa('GIF89a');
    const gifUrl = `data:image/gif;base64,${gifBase64}`;
    const bytes = decodeDataUrl(gifUrl);
    expect(bytes[0]).toBe(0x47); // 'G'
    expect(bytes[1]).toBe(0x49); // 'I'
    expect(bytes[2]).toBe(0x46); // 'F'
  });

  it('text files starting with "data" are not mistaken for data URLs', () => {
    const textContent = 'data points:\n1.0 2.0 3.0\n4.0 5.0 6.0';
    const result = resolveContent(textContent);
    expect(typeof result).toBe('string');
    expect(result).toBe(textContent);
  });
});
