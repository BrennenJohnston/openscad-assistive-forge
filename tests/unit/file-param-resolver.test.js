/**
 * Unit tests for file-param-resolver.js
 *
 * Covers: file param identification, data-URL decoding, filename sanitization,
 * mount path computation, and parameter resolution.
 *
 * Note: vitest.config.js excludes src/worker/** from coverage.
 * This module lives under src/js/ and is fully covered by unit tests.
 * The worker's FS.writeFile call is an integration boundary tested via
 * the E2E suite (Phase 7) rather than mocked here.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  isFileParamValue,
  decodeDataUrl,
  sanitizeFileName,
  resolveFileParams,
} from '../../src/js/file-param-resolver.js';

// ---------------------------------------------------------------------------
// Helper: create a base64 data-URL from a plain string
// ---------------------------------------------------------------------------

function toDataUrl(text, mimeType = 'text/plain') {
  const base64 = btoa(text);
  return `data:${mimeType};base64,${base64}`;
}

// ---------------------------------------------------------------------------
// isFileParamValue
// ---------------------------------------------------------------------------

describe('isFileParamValue', () => {
  it('returns true for a valid file param object', () => {
    expect(isFileParamValue({ name: 'logo.svg', data: 'data:...' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isFileParamValue(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isFileParamValue('logo.svg')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isFileParamValue(42)).toBe(false);
  });

  it('returns false when name is missing', () => {
    expect(isFileParamValue({ data: 'data:...' })).toBe(false);
  });

  it('returns false when name is empty string', () => {
    expect(isFileParamValue({ name: '', data: 'data:...' })).toBe(false);
  });

  it('returns false when data is null', () => {
    expect(isFileParamValue({ name: 'f.svg', data: null })).toBe(false);
  });

  it('returns true when data is an ArrayBuffer', () => {
    expect(isFileParamValue({ name: 'f.svg', data: new ArrayBuffer(4) })).toBe(true);
  });

  it('returns true when data is a Uint8Array', () => {
    expect(isFileParamValue({ name: 'f.bin', data: new Uint8Array([1, 2]) })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// decodeDataUrl
// ---------------------------------------------------------------------------

describe('decodeDataUrl', () => {
  it('decodes a text/plain data URL', () => {
    const url = toDataUrl('hello world');
    const bytes = decodeDataUrl(url);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('hello world');
  });

  it('decodes a data URL with image/svg+xml mime type', () => {
    const svgContent = '<svg><rect width="10" height="10"/></svg>';
    const url = toDataUrl(svgContent, 'image/svg+xml');
    const bytes = decodeDataUrl(url);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(svgContent);
  });

  it('decodes a raw base64 string (no data: prefix)', () => {
    const base64 = btoa('raw content');
    const bytes = decodeDataUrl(base64);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('raw content');
  });

  it('passes through an ArrayBuffer', () => {
    const buf = new ArrayBuffer(3);
    new Uint8Array(buf).set([65, 66, 67]);
    const result = decodeDataUrl(buf);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(65);
    expect(result.byteLength).toBe(3);
  });

  it('passes through a Uint8Array', () => {
    const arr = new Uint8Array([10, 20, 30]);
    const result = decodeDataUrl(arr);
    expect(result).toBe(arr);
  });

  it('throws for malformed data URL (no comma)', () => {
    expect(() => decodeDataUrl('data:text/plain;base64')).toThrow('missing comma');
  });

  it('throws for unsupported type', () => {
    expect(() => decodeDataUrl(42)).toThrow('Unsupported');
  });
});

// ---------------------------------------------------------------------------
// sanitizeFileName
// ---------------------------------------------------------------------------

describe('sanitizeFileName', () => {
  it('returns the filename unchanged for simple names', () => {
    expect(sanitizeFileName('logo.svg')).toBe('logo.svg');
  });

  it('strips directory path', () => {
    expect(sanitizeFileName('path/to/file.dxf')).toBe('file.dxf');
  });

  it('strips backslash directory path', () => {
    expect(sanitizeFileName('C:\\Users\\file.stl')).toBe('file.stl');
  });

  it('rejects .. traversal', () => {
    expect(sanitizeFileName('../../../etc/passwd')).toBe('uploaded_file');
  });

  it('strips leading dots', () => {
    expect(sanitizeFileName('.hidden')).toBe('hidden');
  });

  it('returns default for empty string', () => {
    expect(sanitizeFileName('')).toBe('uploaded_file');
  });

  it('returns default for null', () => {
    expect(sanitizeFileName(null)).toBe('uploaded_file');
  });

  it('returns default for undefined', () => {
    expect(sanitizeFileName(undefined)).toBe('uploaded_file');
  });

  it('preserves spaces in filenames', () => {
    expect(sanitizeFileName('my file.svg')).toBe('my file.svg');
  });
});

// ---------------------------------------------------------------------------
// resolveFileParams
// ---------------------------------------------------------------------------

describe('resolveFileParams', () => {
  const svgData = toDataUrl('<svg></svg>', 'image/svg+xml');

  it('returns empty operations when no file params exist', () => {
    const params = { width: 100, height: 50, name: 'test' };
    const result = resolveFileParams(params, '/work');
    expect(result.mountOperations).toHaveLength(0);
    expect(result.resolvedParams).toEqual(params);
    expect(result.fileParamNames).toHaveLength(0);
  });

  it('resolves a single file parameter', () => {
    const params = {
      width: 100,
      overlay: { name: 'logo.svg', size: 1234, type: 'image/svg+xml', data: svgData },
    };
    const result = resolveFileParams(params, '/work');

    expect(result.mountOperations).toHaveLength(1);
    expect(result.mountOperations[0].paramName).toBe('overlay');
    expect(result.mountOperations[0].fileName).toBe('logo.svg');
    expect(result.mountOperations[0].mountPath).toBe('/work/logo.svg');
    expect(result.mountOperations[0].data).toBeInstanceOf(Uint8Array);

    expect(result.resolvedParams.width).toBe(100);
    expect(result.resolvedParams.overlay).toBe('logo.svg');

    expect(result.fileParamNames).toContain('logo.svg');
  });

  it('resolves multiple file parameters', () => {
    const params = {
      overlay: { name: 'overlay.svg', data: svgData },
      profile: { name: 'profile.dxf', data: toDataUrl('DXF DATA') },
      size: 10,
    };
    const result = resolveFileParams(params, '/tmp');

    expect(result.mountOperations).toHaveLength(2);
    expect(result.resolvedParams.overlay).toBe('overlay.svg');
    expect(result.resolvedParams.profile).toBe('profile.dxf');
    expect(result.resolvedParams.size).toBe(10);
    expect(result.fileParamNames).toEqual(['overlay.svg', 'profile.dxf']);
  });

  it('sanitizes filenames with directory paths', () => {
    const params = {
      asset: { name: 'subdir/evil.svg', data: svgData },
    };
    const result = resolveFileParams(params, '/work');

    expect(result.mountOperations[0].fileName).toBe('evil.svg');
    expect(result.mountOperations[0].mountPath).toBe('/work/evil.svg');
    expect(result.resolvedParams.asset).toBe('evil.svg');
  });

  it('handles null/undefined parameters gracefully', () => {
    expect(resolveFileParams(null, '/work').mountOperations).toHaveLength(0);
    expect(resolveFileParams(undefined, '/work').mountOperations).toHaveLength(0);
  });

  it('preserves non-file param types unchanged', () => {
    const params = {
      count: 5,
      label: 'test',
      enabled: true,
      dims: [10, 20, 30],
    };
    const result = resolveFileParams(params, '/work');
    expect(result.resolvedParams).toEqual(params);
  });

  it('uses /tmp mount dir for single-file projects', () => {
    const params = {
      svg_file: { name: 'design.svg', data: svgData },
    };
    const result = resolveFileParams(params, '/tmp');
    expect(result.mountOperations[0].mountPath).toBe('/tmp/design.svg');
  });

  it('decodes data URL content correctly', () => {
    const content = 'SVG file content here';
    const params = {
      asset: { name: 'test.svg', data: toDataUrl(content) },
    };
    const result = resolveFileParams(params, '/work');
    const decoded = new TextDecoder().decode(result.mountOperations[0].data);
    expect(decoded).toBe(content);
  });
});
