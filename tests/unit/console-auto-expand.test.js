/**
 * Unit tests for ConsolePanel auto-expand behavior.
 *
 * Verifies that:
 *   - ECHO-only messages do not trigger autoExpandPanel()
 *   - WARNING messages do trigger autoExpandPanel()
 *   - ERROR messages do trigger autoExpandPanel()
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

  it('does not call autoExpandPanel() for echo-only output', () => {
    panel.addOutput('ECHO: "hello world"');
    expect(panel.autoExpandPanel).not.toHaveBeenCalled();
  });

  it('does not call autoExpandPanel() when there are only echo messages', () => {
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

  it('a user-collapsed panel is not reopened by WARNINGs', () => {
    panel._userCollapsed = true;
    panel.addOutput('WARNING: still the same problem');
    expect(mockConsolePanel.open).toBe(false);
  });

  it('a user-collapsed panel is reopened by ERRORs', () => {
    panel._userCollapsed = true;
    panel.addOutput('ERROR: hard failure');
    expect(mockConsolePanel.open).toBe(true);
    expect(panel._userCollapsed).toBe(false);
  });

  it('programmatic opens are not recorded as user intent (C9)', () => {
    let toggleHandler = null;
    mockConsolePanel.addEventListener = (event, handler) => {
      if (event === 'toggle') toggleHandler = handler;
    };
    const listeningPanel = new ConsolePanel({ container: null, badge: null });
    expect(typeof toggleHandler).toBe('function');

    // Auto-expand fires the <details> toggle event; the guard must keep
    // _userCollapsed untouched for our own open.
    listeningPanel.addOutput('WARNING: first problem');
    expect(mockConsolePanel.open).toBe(true);
    toggleHandler();
    expect(listeningPanel._userCollapsed).toBe(false);

    // A real user close is recorded
    mockConsolePanel.open = false;
    toggleHandler();
    expect(listeningPanel._userCollapsed).toBe(true);

    // ...and survives further WARNING output
    listeningPanel.addOutput('WARNING: same problem again');
    expect(mockConsolePanel.open).toBe(false);
  });
});
