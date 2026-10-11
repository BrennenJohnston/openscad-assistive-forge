/**
 * The Automatic preview choice follows the person across visits. Recovery
 * mode wrote "off" to its key and nothing ever read it, so a session that
 * crashed rebooted with automatic previews on again.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  readAutoPreviewChoice,
  writeAutoPreviewChoice,
} from '../../src/js/auto-preview-choice.js';
import { STORAGE_KEY_AUTO_PREVIEW_ENABLED } from '../../src/js/storage-keys.js';

describe('the Automatic preview choice', () => {
  beforeEach(() => localStorage.clear());

  it('is on when nothing was chosen', () => {
    expect(readAutoPreviewChoice()).toBe(true);
  });

  it('reads what was written, including recovery mode’s off', () => {
    localStorage.setItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED, 'false');
    expect(readAutoPreviewChoice()).toBe(false);
    writeAutoPreviewChoice(true);
    expect(localStorage.getItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED)).toBe('true');
    expect(readAutoPreviewChoice()).toBe(true);
  });

  it('treats anything but "false" as on', () => {
    localStorage.setItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED, 'maybe');
    expect(readAutoPreviewChoice()).toBe(true);
  });
});
