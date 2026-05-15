/**
 * Tests for the F30 copy-preset-name helper.
 *
 * The helper hides the clipboard fallback chain behind a single Promise
 * so the main.js click handler can stay a thin shim. Tests exercise
 * each branch (modern Clipboard API, execCommand fallback, both
 * unavailable) plus input validation.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyPresetName } from '../../src/js/copy-preset-name.js';

describe('copyPresetName (F30)', () => {
  let originalExecCommand;

  beforeEach(() => {
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (originalExecCommand) {
      document.execCommand = originalExecCommand;
    } else {
      delete document.execCommand;
    }
  });

  it('copies via the modern Clipboard API when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const result = await copyPresetName('iPad Air 5 - Default', {
      navigator: { clipboard: { writeText } },
      document,
    });

    expect(result).toEqual({
      ok: true,
      method: 'clipboard-api',
      error: null,
    });
    expect(writeText).toHaveBeenCalledWith('iPad Air 5 - Default');
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('preserves whitespace and special characters in the copied text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const exact = '  My "favourite" preset / v2  ';
    const result = await copyPresetName(exact, {
      navigator: { clipboard: { writeText } },
      document,
    });

    expect(result.ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(exact);
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('Not allowed')));
    document.execCommand = vi.fn(() => true);

    const result = await copyPresetName('design default values', {
      navigator: { clipboard: { writeText } },
      document,
    });

    expect(result).toEqual({
      ok: true,
      method: 'exec-command',
      error: null,
    });
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('uses execCommand directly when the Clipboard API is missing', async () => {
    document.execCommand = vi.fn(() => true);
    const result = await copyPresetName('Legacy preset', {
      navigator: {},
      document,
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe('exec-command');
    expect(document.execCommand).toHaveBeenCalledTimes(1);
  });

  it('reports failure when both paths are unavailable', async () => {
    document.execCommand = vi.fn(() => false);
    const writeText = vi.fn(() =>
      Promise.reject(new Error('Document not focused'))
    );

    const result = await copyPresetName('Anything', {
      navigator: { clipboard: { writeText } },
      document,
    });

    expect(result.ok).toBe(false);
    expect(result.method).toBe(null);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('rejects an empty preset name without touching the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const result = await copyPresetName('', {
      navigator: { clipboard: { writeText } },
      document,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/empty/i);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('rejects non-string inputs', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const result = await copyPresetName(/** @type {any} */ (null), {
      navigator: { clipboard: { writeText } },
      document,
    });
    expect(result.ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('cleans up the textarea even when execCommand throws', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('Synchronous boom');
    });
    const before = document.body.children.length;

    const result = await copyPresetName('My preset', {
      navigator: {},
      document,
    });

    expect(result.ok).toBe(false);
    expect(document.body.children.length).toBe(before);
  });
});
