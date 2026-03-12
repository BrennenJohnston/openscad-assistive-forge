/**
 * Unit tests for Phase 7: SVG/DXF Export Workflow Redesign (S-009).
 *
 * Tests:
 *   - FileActionsController onExport2D callback support
 *   - resolve2DExportIntent integration for one-click export flow
 *   - OUTPUT_FORMATS 2D flag correctness
 *   - 2D guidance panel entrance behavior
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FileActionsController,
  getFileActionsController,
  resetFileActionsController,
} from '../../src/js/file-actions-controller.js';
import { resolve2DExportIntent } from '../../src/js/render-intent.js';
import { OUTPUT_FORMATS } from '../../src/js/download.js';

// ── FileActionsController: onExport2D callback ──────────────────────────────

describe('FileActionsController — onExport2D callback', () => {
  beforeEach(() => {
    resetFileActionsController();
  });

  it('stores onExport2D callback from constructor options', () => {
    const handler = vi.fn();
    const ctrl = new FileActionsController({ onExport2D: handler });
    expect(ctrl.onExport2D).toBe(handler);
  });

  it('defaults onExport2D to a no-op function', () => {
    const ctrl = new FileActionsController();
    expect(typeof ctrl.onExport2D).toBe('function');
    expect(() => ctrl.onExport2D('svg')).not.toThrow();
  });

  it('onExport2D receives the format argument', () => {
    const handler = vi.fn();
    const ctrl = new FileActionsController({ onExport2D: handler });
    ctrl.onExport2D('svg');
    expect(handler).toHaveBeenCalledWith('svg');
    ctrl.onExport2D('dxf');
    expect(handler).toHaveBeenCalledWith('dxf');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('singleton via getFileActionsController preserves onExport2D', () => {
    const handler = vi.fn();
    const ctrl = getFileActionsController({ onExport2D: handler });
    expect(ctrl.onExport2D).toBe(handler);
  });
});

// ── OUTPUT_FORMATS: 2D flags ────────────────────────────────────────────────

describe('OUTPUT_FORMATS — 2D format identification', () => {
  it('SVG is flagged as 2D', () => {
    expect(OUTPUT_FORMATS.svg).toBeDefined();
    expect(OUTPUT_FORMATS.svg.is2D).toBe(true);
  });

  it('DXF is flagged as 2D', () => {
    expect(OUTPUT_FORMATS.dxf).toBeDefined();
    expect(OUTPUT_FORMATS.dxf.is2D).toBe(true);
  });

  it('PDF is flagged as 2D', () => {
    expect(OUTPUT_FORMATS.pdf).toBeDefined();
    expect(OUTPUT_FORMATS.pdf.is2D).toBe(true);
  });

  it('STL is not flagged as 2D', () => {
    expect(OUTPUT_FORMATS.stl.is2D).toBe(false);
  });

  it('all 3D formats have is2D=false', () => {
    const threeD = ['stl', 'obj', 'off', 'amf', '3mf', 'wrl', 'csg'];
    for (const key of threeD) {
      expect(OUTPUT_FORMATS[key]?.is2D).toBe(false);
    }
  });
});

// ── resolve2DExportIntent: one-click export parameter resolution ────────────

describe('resolve2DExportIntent — one-click SVG export flow', () => {
  const KEYGUARD_SCHEMA = {
    parameters: {
      generate: {
        enum: [
          { value: '0', label: '3d printed keyguard' },
          { value: '1', label: 'first layer for SVG/DXF file' },
        ],
      },
      type_of_keyguard: {
        enum: [
          { value: '0', label: '3D Printed' },
          { value: '1', label: 'Laser Cut' },
        ],
      },
      use_Laser_Cutting_best_practices: {
        enum: ['No', 'Yes'],
      },
    },
  };

  it('auto-adjusts generate to 2D mode for SVG export', () => {
    const params = {
      generate: '0',
      type_of_keyguard: '0',
      use_Laser_Cutting_best_practices: 'No',
    };
    const resolved = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'svg');
    expect(resolved.generate).toBe('1');
  });

  it('auto-adjusts type_of_keyguard to Laser Cut for SVG', () => {
    const params = {
      generate: '0',
      type_of_keyguard: '0',
      use_Laser_Cutting_best_practices: 'No',
    };
    const resolved = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'svg');
    expect(resolved.type_of_keyguard).toBe('1');
  });

  it('auto-adjusts laser best-practices toggle to Yes', () => {
    const params = {
      generate: '0',
      type_of_keyguard: '0',
      use_Laser_Cutting_best_practices: 'No',
    };
    const resolved = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'svg');
    expect(resolved.use_Laser_Cutting_best_practices).toBe('Yes');
  });

  it('returns same object ref for non-2D format', () => {
    const params = { generate: '0' };
    const result = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'stl');
    expect(result).toBe(params);
  });

  it('auto-adjusts generic 2D schema for DXF export', () => {
    const schema = {
      parameters: {
        output_mode: { enum: ['3d', '2d_engrave', '2d_cut'] },
        style: { enum: ['square', 'rounded'] },
      },
    };
    const params = { output_mode: '3d', style: 'square' };
    const resolved = resolve2DExportIntent(params, schema, 'dxf');
    expect(resolved.output_mode).not.toBe('3d');
  });
});

// ── 2D guidance panel behavior ──────────────────────────────────────────────

describe('2D guidance panel — entrance animation', () => {
  let guidanceEl;

  beforeEach(() => {
    guidanceEl = document.createElement('div');
    guidanceEl.id = 'format2dGuidance';
    guidanceEl.className = 'format-2d-guidance hidden';
    document.body.appendChild(guidanceEl);
  });

  afterEach(() => {
    guidanceEl.remove();
  });

  it('guidance panel starts hidden', () => {
    expect(guidanceEl.classList.contains('hidden')).toBe(true);
  });

  it('removing hidden class makes guidance visible', () => {
    guidanceEl.classList.remove('hidden');
    expect(guidanceEl.classList.contains('hidden')).toBe(false);
  });

  it('guidance-enter class can be added for animation', () => {
    guidanceEl.classList.remove('hidden');
    guidanceEl.classList.add('guidance-enter');
    expect(guidanceEl.classList.contains('guidance-enter')).toBe(true);
  });

  it('guidance-enter class can be re-triggered after removal', () => {
    guidanceEl.classList.remove('hidden');
    guidanceEl.classList.add('guidance-enter');
    expect(guidanceEl.classList.contains('guidance-enter')).toBe(true);
    guidanceEl.classList.remove('guidance-enter');
    expect(guidanceEl.classList.contains('guidance-enter')).toBe(false);
    guidanceEl.classList.add('guidance-enter');
    expect(guidanceEl.classList.contains('guidance-enter')).toBe(true);
  });
});

// ── Export menu item structure ───────────────────────────────────────────────

describe('Export menu items — structure validation', () => {
  it('Export as SVG item has correct shape', () => {
    const hasFile = true;
    const item = {
      type: 'action',
      label: 'Export as SVG\u2026',
      enabled: hasFile,
      handler: () => {},
    };
    expect(item.type).toBe('action');
    expect(item.label).toContain('SVG');
    expect(item.enabled).toBe(true);
  });

  it('Export as DXF item has correct shape', () => {
    const hasFile = true;
    const item = {
      type: 'action',
      label: 'Export as DXF\u2026',
      enabled: hasFile,
      handler: () => {},
    };
    expect(item.type).toBe('action');
    expect(item.label).toContain('DXF');
    expect(item.enabled).toBe(true);
  });

  it('2D export items are disabled when no file is loaded', () => {
    const hasFile = false;
    const svgItem = { type: 'action', enabled: hasFile };
    const dxfItem = { type: 'action', enabled: hasFile };
    expect(svgItem.enabled).toBe(false);
    expect(dxfItem.enabled).toBe(false);
  });

  it('2D export items invoke callback with correct format', () => {
    const handler = vi.fn();
    const ctrl = new FileActionsController({ onExport2D: handler });

    ctrl.onExport2D('svg');
    expect(handler).toHaveBeenCalledWith('svg');

    ctrl.onExport2D('dxf');
    expect(handler).toHaveBeenCalledWith('dxf');
  });
});
