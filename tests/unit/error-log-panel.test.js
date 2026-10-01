/**
 * Unit tests for ErrorLogPanel.parseLine()
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ErrorLogPanel,
  ERROR_LOG_TYPE,
  resetErrorLogPanel,
} from '../../src/js/error-log-panel.js';

describe('ErrorLogPanel.parseLine — existing patterns', () => {
  let panel;

  beforeEach(() => {
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('returns null for empty string', () => {
    expect(panel.parseLine('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(panel.parseLine('   ')).toBeNull();
  });

  it('returns null for a plain ECHO line (not an error)', () => {
    expect(panel.parseLine('ECHO: "some value"')).toBeNull();
  });

  it('parses ERROR: lines', () => {
    const result = panel.parseLine('ERROR: file not found');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Compile');
  });

  it('parses WARNING: lines', () => {
    const result = panel.parseLine('WARNING: deprecated call');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.WARNING);
    expect(result.group).toBe('Compile');
  });

  it('parses Parser error lines', () => {
    const result = panel.parseLine('Parser error at line 5');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Parse');
  });

  it('parses CGAL error lines (without trailing colon — avoids ERROR: match)', () => {
    // "CGAL error: ..." contains "error:" which matches the first \bERROR: branch.
    // Use a CGAL error string that doesn't have a bare "error:" to reach the Geometry branch.
    const result = panel.parseLine('CGAL error in CGAL_Nef_polyhedron');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Geometry');
  });
});

describe('ErrorLogPanel.parseLine — new patterns (Phase 4)', () => {
  let panel;

  beforeEach(() => {
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('[OpenSCAD ERR] non-echo line → ERROR, group Runtime', () => {
    const result = panel.parseLine(
      '[OpenSCAD ERR] Current top level object is not a 2D object.'
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Runtime');
  });

  it('[OpenSCAD ERR] ECHO line → null (not treated as error)', () => {
    const result = panel.parseLine('[OpenSCAD ERR] ECHO: "some debug value"');
    expect(result).toBeNull();
  });

  it('[openscad err] case-insensitive non-echo → ERROR, group Runtime', () => {
    const result = panel.parseLine('[openscad err] some runtime failure');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Runtime');
  });

  it('MODEL_NOT_2D → ERROR, group Geometry', () => {
    const result = panel.parseLine('MODEL_NOT_2D: export requires 2D geometry');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Geometry');
  });

  it('MODEL_IS_2D → ERROR, group Geometry', () => {
    const result = panel.parseLine('MODEL_IS_2D: cannot render as STL');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Geometry');
  });

  it('"not a 2D object" phrase → ERROR, group Geometry', () => {
    const result = panel.parseLine(
      'Current top level object is not a 2D object.'
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('Geometry');
  });

  it('"Generation failed" with non-geometry reason → ERROR, group General', () => {
    // Use a reason that doesn't also match another pattern
    const result = panel.parseLine('Generation failed: render timed out');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('General');
  });

  it('"generation failed" case-insensitive → ERROR, group General', () => {
    const result = panel.parseLine('generation failed: something went wrong');
    expect(result).not.toBeNull();
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
    expect(result.group).toBe('General');
  });
});

describe('ErrorLogPanel.parseLine — the manifold status line (P7)', () => {
  let panel;

  beforeEach(() => {
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  // The Geometry branch's regex was /^Mesh (is )?not|manifold/i. `|` binds
  // looser than anything else in a regex, so that read as
  // (^Mesh (is )?not) OR (manifold) — an UNANCHORED "manifold". Every line
  // with the word in it became an ERROR, this one included, and the owner's
  // deployed screenshot shows it as a red row while the Console read "No
  // console output yet".
  it('a healthy render status line is not an error at all', () => {
    expect(
      panel.parseLine('Top level object is a 3D object (manifold):')
    ).toBeNull();
  });

  it('a 2D status line is still not an error', () => {
    expect(panel.parseLine('Top level object is a 2D object:')).toBeNull();
  });

  it('a real complaint is still an error, group Geometry', () => {
    for (const line of [
      'Mesh is not manifold',
      'Mesh not closed',
      'Object may not be a valid 2-manifold and may need repair',
    ]) {
      const result = panel.parseLine(line);
      expect(result, line).not.toBeNull();
      expect(result.type, line).toBe(ERROR_LOG_TYPE.ERROR);
      expect(result.group, line).toBe('Geometry');
    }
  });

  it('a prefixed complaint still lands in Compile, as it did before', () => {
    // These reach the \bERROR:/\bWARNING: branches first, which is why the
    // Geometry branch never needed to catch a prefixed line.
    expect(panel.parseLine('ERROR: Mesh is not manifold!').group).toBe(
      'Compile'
    );
    expect(
      panel.parseLine('WARNING: Object may not be a valid 2-manifold!').group
    ).toBe('Compile');
  });
});

// D-203: my two-sided Plug Puller previewed, and the page interrupted with
// "Error: WARNING: [manifold] Minkowski failed with error, falling back to
// Nef operation: CGAL ERROR: assertion violation!" and "Error: CGAL error:
// assertion violation!". OpenSCAD had recovered; both lines were warnings.
describe('ErrorLogPanel.parseLine: a warning that quotes an error (D-203)', () => {
  let panel;

  beforeEach(() => {
    resetErrorLogPanel();
    panel = new ErrorLogPanel({ container: null, badge: null });
  });

  it('a line OpenSCAD labels WARNING: is a warning, whatever its text quotes', () => {
    const result = panel.parseLine(
      'WARNING: [manifold] Minkowski failed with error, falling back to Nef operation: CGAL ERROR: assertion violation!'
    );
    expect(result.type).toBe(ERROR_LOG_TYPE.WARNING);
    expect(result.group).toBe('Compile');
  });

  it("CGAL's own violation printout is a warning: OpenSCAD's next line says what it means", () => {
    for (const line of [
      'CGAL error: assertion violation!',
      'CGAL error: precondition violation!',
    ]) {
      const result = panel.parseLine(line);
      expect(result, line).not.toBeNull();
      expect(result.type, line).toBe(ERROR_LOG_TYPE.WARNING);
      expect(result.group, line).toBe('Geometry');
    }
  });

  it('the line OpenSCAD prints when the render does fail is still an error', () => {
    const result = panel.parseLine(
      'ERROR: CGAL error in applyHull(): CGAL ERROR: assertion violation!'
    );
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
  });

  it('a warning inside an error line does not make it a warning', () => {
    const result = panel.parseLine(
      'ERROR: Parser error: WARNING: is not a valid name'
    );
    expect(result.type).toBe(ERROR_LOG_TYPE.ERROR);
  });
});
