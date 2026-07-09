/**
 * Unit tests for DXF post-processing (postProcessDXF).
 *
 * Imports the real implementation from src/worker/dxf-postprocess.js — the
 * shared module the render worker uses — so these tests fail when the
 * production logic changes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { postProcessDXF } from '../../src/worker/dxf-postprocess.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function encodeDXF(text) {
  return new TextEncoder().encode(text).buffer;
}

function decodeDXF(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * Minimal valid DXF with a single LWPOLYLINE (a unit square).
 */
const LWPOLYLINE_SQUARE_DXF = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
4
 70
1
 10
0.0
 20
0.0
 10
1.0
 20
0.0
 10
1.0
 20
1.0
 10
0.0
 20
1.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with two identical LWPOLYLINE segments (duplicate geometry).
 */
const DUPLICATE_SEGMENTS_DXF = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
2
 70
0
 10
0.0
 20
0.0
 10
10.0
 20
0.0
  0
LWPOLYLINE
  8
0
 90
2
 70
0
 10
0.0
 20
0.0
 10
10.0
 20
0.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with imprecise floating-point coordinates.
 */
const IMPRECISE_COORDS_DXF = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
2
 70
0
 10
12.3456789012345
 20
0.0000000001
 10
99.9999999999
 20
50.1234567891
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with existing LINE entities (not LWPOLYLINE) to test passthrough.
 */
const LINE_PASSTHROUGH_DXF = `  0
SECTION
  2
ENTITIES
  0
LINE
  8
0
 10
0.0
 20
0.0
 11
5.0
 21
5.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with HEADER section including EXTMIN/EXTMAX.
 */
const WITH_HEADER_DXF = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1009
  9
$EXTMIN
 10
-10.5
 20
-20.0
  9
$EXTMAX
 10
100.0
 20
200.5
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
2
 70
0
 10
0.0
 20
0.0
 10
1.0
 20
1.0
  0
ENDSEC
  0
EOF
`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('postProcessDXF — LWPOLYLINE to LINE conversion', () => {
  it('converts a closed square LWPOLYLINE to 4 LINE entities', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));

    // Should contain exactly 4 LINE entities for a 4-vertex closed polyline
    const lineMatches = output.match(/^\s*0\s*\nLINE/gm) || [];
    expect(lineMatches.length).toBe(4);

    // Should NOT contain LWPOLYLINE
    expect(output).not.toMatch(/LWPOLYLINE/);
  });

  it('produces valid DXF structure with required sections', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));

    expect(output).toContain('SECTION');
    expect(output).toContain('ENDSEC');
    expect(output).toContain('ENTITIES');
    expect(output).toContain('EOF');
    expect(output).toContain('HEADER');
    expect(output).toContain('AC1009');
  });

  it('includes correct LINE endpoint coordinates', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));

    // One of the LINE segments should go from (0,0) to (1,0)
    expect(output).toMatch(/10\s*\n0\n\s*20\s*\n0\n\s*11\s*\n1\n\s*21\s*\n0/m);
  });
});

describe('postProcessDXF — Coordinate precision (BUG-D fix)', () => {
  it('rounds coordinates to 6 decimal places', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(IMPRECISE_COORDS_DXF)));

    // 12.3456789012345 should be rounded to 12.345679 (6 decimal places)
    expect(output).toContain('12.345679');

    // 0.0000000001 should round to 0 (within 6 decimals it's 0.0)
    expect(output).not.toContain('0.0000000001');

    // 99.9999999999 should round to 100
    expect(output).toContain('100');

    // 50.1234567891 should round to 50.123457
    expect(output).toContain('50.123457');
  });

  it('does not introduce scientific notation in coordinates', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(IMPRECISE_COORDS_DXF)));
    // The output should not contain 'e+' or 'e-' notation for coordinates
    const lines = output.split('\n');
    let inEntities = false;
    for (const line of lines) {
      if (line.includes('ENTITIES')) inEntities = true;
      if (line.includes('ENDSEC') && inEntities) inEntities = false;
      if (inEntities && /[0-9]e[+-]/i.test(line)) {
        throw new Error(`Scientific notation found in DXF coordinates: ${line}`);
      }
    }
  });
});

describe('postProcessDXF — Duplicate line deduplication (BUG-D fix)', () => {
  it('removes duplicate LINE segments from identical LWPOLYLINE entities', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(DUPLICATE_SEGMENTS_DXF)));

    // Two identical single-segment polylines should produce exactly 1 LINE
    const lineMatches = output.match(/^\s*0\s*\nLINE/gm) || [];
    expect(lineMatches.length).toBe(1);
  });

  it('does not deduplicate non-identical segments', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));

    // A square has 4 unique sides — all should be preserved
    const lineMatches = output.match(/^\s*0\s*\nLINE/gm) || [];
    expect(lineMatches.length).toBe(4);
  });
});

describe('postProcessDXF — LINE entity passthrough', () => {
  it('preserves existing LINE entities from the source DXF', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LINE_PASSTHROUGH_DXF)));

    const lineMatches = output.match(/^\s*0\s*\nLINE/gm) || [];
    expect(lineMatches.length).toBe(1);
    expect(output).toContain('5');
  });

  it('strips subclass markers (group code 100) from passthrough entities', () => {
    const dxfWithSubclass = `  0
SECTION
  2
ENTITIES
  0
LINE
100
AcDbEntity
  8
0
 10
0.0
 20
0.0
 11
1.0
 21
1.0
  0
ENDSEC
  0
EOF
`;
    const output = decodeDXF(postProcessDXF(encodeDXF(dxfWithSubclass)));
    // Group code 100 lines and their values should not appear
    expect(output).not.toMatch(/^\s*100\s*$/m);
    expect(output).not.toContain('AcDbEntity');
  });
});

describe('postProcessDXF — HEADER section handling', () => {
  it('preserves EXTMIN and EXTMAX from original HEADER', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(WITH_HEADER_DXF)));

    expect(output).toContain('$EXTMIN');
    expect(output).toContain('$EXTMAX');
    expect(output).toContain('-10.5');
    expect(output).toContain('200.5');
  });

  it('always sets ACADVER to AC1009', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(WITH_HEADER_DXF)));
    expect(output).toContain('AC1009');
  });

  it('outputs AC1009 even when no HEADER section in input', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));
    expect(output).toContain('AC1009');
  });
});

describe('postProcessDXF — structural integrity', () => {
  it('always ends with EOF marker', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));
    const trimmed = output.trim();
    expect(trimmed.endsWith('EOF')).toBe(true);
  });

  it('produces non-empty output from a non-empty input', () => {
    const output = decodeDXF(postProcessDXF(encodeDXF(LWPOLYLINE_SQUARE_DXF)));
    expect(output.length).toBeGreaterThan(50);
  });

  it('handles empty ENTITIES section without error', () => {
    const emptyEntities = `  0
SECTION
  2
ENTITIES
  0
ENDSEC
  0
EOF
`;
    const output = decodeDXF(postProcessDXF(encodeDXF(emptyEntities)));
    expect(output).toContain('ENTITIES');
    expect(output).toContain('EOF');
  });

  it('handles LWPOLYLINE with fewer than 2 vertices without error', () => {
    const singleVertex = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
1
 70
0
 10
5.0
 20
5.0
  0
ENDSEC
  0
EOF
`;
    // Should not throw, and should produce valid output with 0 LINE entities
    const output = decodeDXF(postProcessDXF(encodeDXF(singleVertex)));
    expect(output).toContain('EOF');
    const lineMatches = output.match(/^\s*0\s*\nLINE/gm) || [];
    expect(lineMatches.length).toBe(0);
  });
});
