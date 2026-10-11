/**
 * Unit tests for what the Error Log says aloud.
 *
 * A warning goes to the polite announcer with the label "Warning:". An error
 * says nothing here: it ends the run, and the run's failure is announced once
 * with the engine's line.
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

describe('ErrorLogPanel: what a recovered engine warning says', () => {
  let panel;

  beforeEach(() => {
    vi.clearAllMocks();
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('says the minkowski fallback politely, as a warning', () => {
    panel.addOutput(FALLBACK);
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).toHaveBeenCalledWith(`Warning: ${FALLBACK}`);
  });

  it("says CGAL's violation printout politely, as a warning", () => {
    panel.addOutput('CGAL error: assertion violation!');
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).toHaveBeenCalledWith(
      'Warning: CGAL error: assertion violation!'
    );
  });

  it('leaves an error to the failed run, which says it once', () => {
    panel.addOutput('ERROR: Assertion failed in file model.scad, line 12');
    expect(announceError).not.toHaveBeenCalled();
    expect(announceImmediate).not.toHaveBeenCalled();
  });
});
