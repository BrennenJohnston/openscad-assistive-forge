/**
 * Unit tests for Console Panel Unification (Phase 6 / S-010).
 *
 * Verifies:
 *   - DEPRECATED and TRACE parsing in ConsolePanel
 *   - Unified filters (all 5 types)
 *   - Unified badge (warning + error + deprecated + echo)
 *   - View toggle state
 *   - Structured sub-panel coordination (clear, filter sync)
 *   - File/line extraction for navigable entries
 *   - Export delegates to active view
 *   - ErrorLogPanel.setFilter()
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsolePanel,
  CONSOLE_ENTRY_TYPE,
  resetConsolePanel,
} from '../../src/js/console-panel.js';
import {
  ErrorLogPanel,
  resetErrorLogPanel,
} from '../../src/js/error-log-panel.js';

// ---------------------------------------------------------------------------
// CONSOLE_ENTRY_TYPE includes DEPRECATED and TRACE
// ---------------------------------------------------------------------------
describe('CONSOLE_ENTRY_TYPE — extended types', () => {
  it('includes DEPRECATED', () => {
    expect(CONSOLE_ENTRY_TYPE.DEPRECATED).toBe('deprecated');
  });

  it('includes TRACE', () => {
    expect(CONSOLE_ENTRY_TYPE.TRACE).toBe('trace');
  });

  it('retains original types', () => {
    expect(CONSOLE_ENTRY_TYPE.ECHO).toBe('echo');
    expect(CONSOLE_ENTRY_TYPE.WARNING).toBe('warning');
    expect(CONSOLE_ENTRY_TYPE.ERROR).toBe('error');
    expect(CONSOLE_ENTRY_TYPE.INFO).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// ConsolePanel.parseLine — DEPRECATED and TRACE
// ---------------------------------------------------------------------------
describe('ConsolePanel.parseLine — DEPRECATED and TRACE', () => {
  let panel;

  beforeEach(() => {
    resetConsolePanel();
    panel = new ConsolePanel({ container: null, badge: null });
  });

  it('parses DEPRECATED: lines', () => {
    const result = panel.parseLine('DEPRECATED: use new_module() instead');
    expect(result).not.toBeNull();
    expect(result.type).toBe(CONSOLE_ENTRY_TYPE.DEPRECATED);
  });

  it('parses TRACE: lines', () => {
    const result = panel.parseLine('TRACE: entering module cube');
    expect(result).not.toBeNull();
    expect(result.type).toBe(CONSOLE_ENTRY_TYPE.TRACE);
  });

  it('still parses ECHO lines', () => {
    const result = panel.parseLine('ECHO: "hello"');
    expect(result).not.toBeNull();
    expect(result.type).toBe(CONSOLE_ENTRY_TYPE.ECHO);
    expect(result.message).toBe('"hello"');
  });

  it('still parses WARNING lines', () => {
    const result = panel.parseLine('WARNING: deprecated call');
    expect(result).not.toBeNull();
    expect(result.type).toBe(CONSOLE_ENTRY_TYPE.WARNING);
  });

  it('still parses ERROR lines', () => {
    const result = panel.parseLine('ERROR: undefined variable');
    expect(result).not.toBeNull();
    expect(result.type).toBe(CONSOLE_ENTRY_TYPE.ERROR);
  });

  it('extracts file:line from WARNING', () => {
    const result = panel.parseLine(
      "WARNING: Can't open include file 'test.scad', line 5"
    );
    expect(result).not.toBeNull();
    expect(result.file).toBe('test.scad');
    expect(result.line).toBe(5);
  });

  it('extracts file:line from ERROR with colon syntax', () => {
    const result = panel.parseLine('ERROR: undefined variable in main.scad:42');
    expect(result).not.toBeNull();
    expect(result.file).toBe('main.scad');
    expect(result.line).toBe(42);
  });

  it('extracts line-only from ERROR', () => {
    const result = panel.parseLine('ERROR: syntax error at line 10');
    expect(result).not.toBeNull();
    expect(result.line).toBe(10);
  });

  it('returns null for plain lines', () => {
    expect(panel.parseLine('some random output')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unified filters
// ---------------------------------------------------------------------------
describe('ConsolePanel — unified filters', () => {
  let panel;

  beforeEach(() => {
    resetConsolePanel();
    panel = new ConsolePanel({ container: null, badge: null });
  });

  it('default filters include deprecated (true) and trace (false)', () => {
    expect(panel.filters.deprecated).toBe(true);
    expect(panel.filters.trace).toBe(false);
  });

  it('deprecated entries visible when filter enabled', () => {
    panel.addOutput('DEPRECATED: old_function() is deprecated');
    const visible = panel.entries.filter((e) => panel.filters[e.type]);
    expect(visible.length).toBe(1);
  });

  it('trace entries hidden by default', () => {
    panel.addOutput('TRACE: entering module');
    const visible = panel.entries.filter((e) => panel.filters[e.type]);
    expect(visible.length).toBe(0);
    expect(panel.entries.length).toBe(1);
  });

  it('trace entries visible when filter enabled', () => {
    panel.filters.trace = true;
    panel.addOutput('TRACE: entering module');
    const visible = panel.entries.filter((e) => panel.filters[e.type]);
    expect(visible.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Unified badge
// ---------------------------------------------------------------------------
describe('ConsolePanel — unified badge', () => {
  let panel;
  let badge;

  beforeEach(() => {
    resetConsolePanel();
    badge = { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } };
    panel = new ConsolePanel({ container: null, badge });
  });

  it('shows warning+error+deprecated+echo count for issues', () => {
    panel.addEntry({
      type: 'warning',
      message: 'w',
      raw: 'w',
      file: '',
      line: null,
      timestamp: Date.now(),
    });
    panel.addEntry({
      type: 'error',
      message: 'e',
      raw: 'e',
      file: '',
      line: null,
      timestamp: Date.now(),
    });
    panel.addEntry({
      type: 'echo',
      message: 'x',
      raw: 'x',
      file: '',
      line: null,
      timestamp: Date.now(),
    });
    // issueCount = 1 warning + 1 error + 0 deprecated = 2
    // importantCount = 2 + 1 echo = 3
    expect(badge.textContent).toBe(3);
    expect(badge.classList.add).toHaveBeenCalledWith('has-warnings');
  });

  it('includes deprecated in issue count', () => {
    panel.addEntry({
      type: 'deprecated',
      message: 'd',
      raw: 'd',
      file: '',
      line: null,
      timestamp: Date.now(),
    });
    // issueCount = 1 deprecated, importantCount = 1 + 0 echo = 1
    expect(badge.textContent).toBe(1);
    expect(badge.classList.add).toHaveBeenCalledWith('has-warnings');
  });

  it('hides badge when empty', () => {
    panel.updateBadge();
    expect(badge.classList.add).toHaveBeenCalledWith('hidden');
  });
});

// ---------------------------------------------------------------------------
// Structured sub-panel coordination
// ---------------------------------------------------------------------------
describe('ConsolePanel — structured sub-panel coordination', () => {
  let panel;
  let structuredPanel;

  beforeEach(() => {
    resetConsolePanel();
    resetErrorLogPanel();
    structuredPanel = new ErrorLogPanel({ container: null, badge: null });
    vi.spyOn(structuredPanel, 'clear');
    vi.spyOn(structuredPanel, 'setFilter');
    panel = new ConsolePanel({
      container: null,
      badge: null,
      structuredPanel,
    });
  });

  it('clear() calls structuredPanel.clear()', () => {
    panel.clear();
    expect(structuredPanel.clear).toHaveBeenCalled();
  });

  it('_syncStructuredFilters propagates warning filter', () => {
    panel._syncStructuredFilters('warning', false);
    expect(structuredPanel.setFilter).toHaveBeenCalledWith('warning', false);
  });

  it('_syncStructuredFilters propagates error filter', () => {
    panel._syncStructuredFilters('error', true);
    expect(structuredPanel.setFilter).toHaveBeenCalledWith('error', true);
  });

  it('_syncStructuredFilters propagates deprecated filter', () => {
    panel._syncStructuredFilters('deprecated', false);
    expect(structuredPanel.setFilter).toHaveBeenCalledWith('deprecated', false);
  });

  it('_syncStructuredFilters does NOT propagate echo filter', () => {
    panel._syncStructuredFilters('echo', false);
    expect(structuredPanel.setFilter).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// View toggle
// ---------------------------------------------------------------------------
describe('ConsolePanel — view toggle', () => {
  let panel;

  beforeEach(() => {
    resetConsolePanel();
    panel = new ConsolePanel({ container: null, badge: null });
  });

  it('default active view is "log"', () => {
    expect(panel.activeView).toBe('log');
  });

  it('can switch to structured view', () => {
    panel.activeView = 'structured';
    expect(panel.activeView).toBe('structured');
  });
});

// ---------------------------------------------------------------------------
// Export delegates to active view
// ---------------------------------------------------------------------------
describe('ConsolePanel — export delegation', () => {
  let panel;
  let structuredPanel;

  beforeEach(() => {
    resetConsolePanel();
    resetErrorLogPanel();
    structuredPanel = new ErrorLogPanel({ container: null, badge: null });
    panel = new ConsolePanel({
      container: null,
      badge: null,
      structuredPanel,
    });
  });

  it('exportLog returns chronological log when in log view', () => {
    panel.activeView = 'log';
    panel.addOutput('ECHO: "test"');
    const log = panel.exportLog();
    expect(log).toContain('[ECHO]');
    expect(log).toContain('"test"');
  });

  it('exportLog returns structured log when in structured view', () => {
    panel.activeView = 'structured';
    structuredPanel.addOutput('ERROR: something broke');
    const log = panel.exportLog();
    expect(log).toContain('[ERROR]');
    expect(log).toContain('something broke');
  });
});

// ---------------------------------------------------------------------------
// ErrorLogPanel.setFilter
// ---------------------------------------------------------------------------
describe('ErrorLogPanel.setFilter — external filter control', () => {
  let panel;

  beforeEach(() => {
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('setFilter changes internal filter state', () => {
    expect(panel.filters.trace).toBe(false);
    panel.setFilter('trace', true);
    expect(panel.filters.trace).toBe(true);
  });

  it('setFilter ignores unknown types', () => {
    panel.setFilter('unknown_type', true);
    expect(panel.filters.unknown_type).toBeUndefined();
  });

  it('setFilter triggers render', () => {
    vi.spyOn(panel, 'render');
    panel.setFilter('warning', false);
    expect(panel.render).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ConsolePanel counts include deprecated and trace
// ---------------------------------------------------------------------------
describe('ConsolePanel — counts include new types', () => {
  let panel;

  beforeEach(() => {
    resetConsolePanel();
    panel = new ConsolePanel({ container: null, badge: null });
  });

  it('counts deprecated entries', () => {
    panel.addOutput('DEPRECATED: old function');
    expect(panel.counts.deprecated).toBe(1);
  });

  it('counts trace entries', () => {
    panel.addOutput('TRACE: entering module');
    expect(panel.counts.trace).toBe(1);
  });

  it('getCounts includes all types', () => {
    panel.addOutput('ECHO: "hi"\nWARNING: w\nERROR: e\nDEPRECATED: d\nTRACE: t');
    const counts = panel.getCounts();
    expect(counts.echo).toBe(1);
    expect(counts.warning).toBe(1);
    expect(counts.error).toBe(1);
    expect(counts.deprecated).toBe(1);
    expect(counts.trace).toBe(1);
  });
});
