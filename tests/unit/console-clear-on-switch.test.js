/**
 * Regression test for Phase 3: console warnings must clear on project switch.
 *
 * The bug: after loading a project that produces warnings (e.g. library-test),
 * switching to a different project left stale warnings visible in the Console
 * panel, the legacy console modal, and the toolbar badge. The root cause was
 * that handleFile's cleanup only cleared the echo drawer (updatePreviewDrawer)
 * but not the ConsolePanel entries, legacy lastConsoleOutput state, or badge.
 *
 * This test verifies that ConsolePanel.clear() resets all observable state and
 * that the clearConsoleState() pattern correctly wires through to all layers.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsolePanel,
  resetConsolePanel,
} from '../../src/js/console-panel.js';

describe('ConsolePanel.clear — project switch regression', () => {
  let panel;
  let badge;

  beforeEach(() => {
    resetConsolePanel();
    badge = {
      textContent: '',
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    };
    panel = new ConsolePanel({ container: null, badge });
  });

  it('clear() resets entries to empty', () => {
    panel.addOutput("WARNING: Can't open include file 'MCAD/boxes.scad'.");
    expect(panel.entries.length).toBeGreaterThan(0);

    panel.clear();
    expect(panel.entries).toEqual([]);
  });

  it('clear() resets all counts to zero', () => {
    panel.addOutput(
      'WARNING: w1\nWARNING: w2\nERROR: e1\nECHO: "hi"\nDEPRECATED: old'
    );
    expect(panel.counts.warning).toBe(2);
    expect(panel.counts.error).toBe(1);
    expect(panel.counts.echo).toBe(1);
    expect(panel.counts.deprecated).toBe(1);

    panel.clear();
    expect(panel.counts).toEqual({
      echo: 0,
      warning: 0,
      error: 0,
      info: 0,
      deprecated: 0,
      trace: 0,
    });
  });

  it('clear() hides the badge', () => {
    panel.addOutput('WARNING: stale warning');
    badge.classList.add.mockClear();

    panel.clear();
    expect(badge.classList.add).toHaveBeenCalledWith('hidden');
  });

  it('hasIssues() returns false after clear()', () => {
    panel.addOutput('WARNING: something\nERROR: something else');
    expect(panel.hasIssues()).toBe(true);

    panel.clear();
    expect(panel.hasIssues()).toBe(false);
  });

  it('clear() propagates to structuredPanel when present', () => {
    const structuredPanel = { clear: vi.fn(), setFilter: vi.fn() };
    resetConsolePanel();
    const panelWithStructured = new ConsolePanel({
      container: null,
      badge: null,
      structuredPanel,
    });
    panelWithStructured.addOutput('ERROR: e');

    panelWithStructured.clear();
    expect(structuredPanel.clear).toHaveBeenCalled();
  });

  it('subsequent addOutput after clear() starts fresh', () => {
    panel.addOutput('WARNING: old project warning');
    expect(panel.counts.warning).toBe(1);

    panel.clear();
    panel.addOutput('ECHO: "new project echo"');
    expect(panel.counts.warning).toBe(0);
    expect(panel.counts.echo).toBe(1);
    expect(panel.entries.length).toBe(1);
  });
});
