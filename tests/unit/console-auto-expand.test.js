/**
 * Unit tests for ConsolePanel auto-expand behavior (Phase 5).
 *
 * Verifies that:
 *   - ECHO-only messages do NOT trigger autoExpandPanel()
 *   - WARNING messages DO trigger autoExpandPanel()
 *   - ERROR messages DO trigger autoExpandPanel()
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsolePanel, CONSOLE_ENTRY_TYPE } from '../../src/js/console-panel.js';

describe('ConsolePanel — auto-expand behavior', () => {
  let panel;
  let mockConsolePanel;

  beforeEach(() => {
    // Provide a minimal DOM element for #consolePanel
    mockConsolePanel = { open: false };
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'consolePanel') return mockConsolePanel;
      return null;
    });

    panel = new ConsolePanel({ container: null, badge: null });
    vi.spyOn(panel, 'autoExpandPanel');
  });

  it('does NOT call autoExpandPanel() for echo-only output', () => {
    panel.addOutput('ECHO: "hello world"');
    expect(panel.autoExpandPanel).not.toHaveBeenCalled();
  });

  it('does NOT call autoExpandPanel() when there are only echo messages', () => {
    panel.addOutput('ECHO: "one"\nECHO: "two"\nECHO: "three"');
    expect(panel.autoExpandPanel).not.toHaveBeenCalled();
  });

  it('calls autoExpandPanel() for WARNING output', () => {
    panel.addOutput('WARNING: deprecated feature used');
    expect(panel.autoExpandPanel).toHaveBeenCalled();
  });

  it('calls autoExpandPanel() for ERROR output', () => {
    panel.addOutput('ERROR: undefined variable x');
    expect(panel.autoExpandPanel).toHaveBeenCalled();
  });

  it('calls autoExpandPanel() when WARNING is mixed with ECHO', () => {
    panel.addOutput('ECHO: "info"\nWARNING: something bad');
    expect(panel.autoExpandPanel).toHaveBeenCalled();
  });

  it('calls autoExpandPanel() when ERROR is mixed with ECHO', () => {
    panel.addOutput('ECHO: "info"\nERROR: critical failure');
    expect(panel.autoExpandPanel).toHaveBeenCalled();
  });
});
