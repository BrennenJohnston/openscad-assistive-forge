/**
 * Unit tests for what the Error Log says aloud: nothing. It is a second view
 * of the console's messages; a warning is said by the console line (or the
 * summary when several arrive), and an error by the failed run, once, with
 * the engine's line. What it files each message as still matters to its
 * table and its counts.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/js/announcer.js', () => ({
  announceError: vi.fn(),
  announceImmediate: vi.fn(),
}));

import { announceError, announceImmediate } from '../../src/js/announcer.js';
import {
  ErrorLogPanel,
  resetErrorLogPanel,
} from '../../src/js/error-log-panel.js';

const FALLBACK =
  'WARNING: [manifold] Minkowski failed with error, falling back to Nef operation: CGAL ERROR: assertion violation!';

describe('ErrorLogPanel: what it files and what it says', () => {
  let panel;

  beforeEach(() => {
    vi.clearAllMocks();
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('files the minkowski fallback as a warning, and says nothing', () => {
    panel.addOutput(FALLBACK);
    expect(panel.getCounts().warning).toBe(1);
    expect(panel.getCounts().error).toBe(0);
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).not.toHaveBeenCalled();
  });

  it("files CGAL's violation printout as a warning, and says nothing", () => {
    panel.addOutput('CGAL error: assertion violation!');
    expect(panel.getCounts().warning).toBe(1);
    expect(panel.getCounts().error).toBe(0);
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).not.toHaveBeenCalled();
  });

  it('leaves an error to the failed run, which says it once', () => {
    panel.addOutput('ERROR: Assertion failed in file model.scad, line 12');
    expect(panel.getCounts().error).toBe(1);
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).not.toHaveBeenCalled();
  });
});
