/**
 * Unit tests for what the Error Log says aloud (D-203).
 *
 * A warning goes to the polite announcer with the label "Warning:". Only an
 * error interrupts, with "Error:".
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

describe('ErrorLogPanel: what a recovered engine warning says (D-203)', () => {
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

  it('still interrupts for an error', () => {
    panel.addOutput('ERROR: Assertion failed in file model.scad, line 12');
    expect(announceError).toHaveBeenCalledTimes(1);
    expect(announceError.mock.calls[0][0]).toMatch(/^Error at line 12: ERROR:/);
  });
});
