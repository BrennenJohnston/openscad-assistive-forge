/**
 * Unit tests for DXF post-processing (postProcessDXF in openscad-worker.js).
 *
 * Because postProcessDXF is a module-scoped (non-exported) function inside a
 * Web Worker, we test its logic here using an inlined copy of the function.
 * Keep this copy in sync with openscad-worker.js if the implementation changes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';

// ─── Inlined testable copy of postProcessDXF ────────────────────────────────
// Mirrors openscad-worker.js postProcessDXF; `self` is replaced with a no-op
// so it can run in a Node.js/Vitest environment.
function postProcessDXF(outputBuffer) {
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(outputBuffer);
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');

  const pairs = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    pairs.push({ code: rawLines[i].trim(), value: rawLines[i + 1].trim() });
  }

  const sections = [];
  for (let i = 0; i < pairs.length; i++) {
    if (
      pairs[i].code === '0' &&
      pairs[i].value === 'SECTION' &&
      i + 1 < pairs.length &&
      pairs[i + 1].code === '2'
    ) {
      const name = pairs[i + 1].value;
      for (let j = i + 2; j < pairs.length; j++) {
        if (pairs[j].code === '0' && pairs[j].value === 'ENDSEC') {
          sections.push({ name, startIdx: i, endIdx: j });
          break;
        }
      }
    }
  }

  const headerSection = sections.find((s) => s.name === 'HEADER');
  let extMin = null, extMax = null;
  if (headerSection) {
    for (let i = headerSection.startIdx; i <= headerSection.endIdx; i++) {
      if (pairs[i].code === '9' && pairs[i].value === '$EXTMIN') {
        extMin = { x: 0, y: 0 };
        for (
          let j = i + 1;
          j <= headerSection.endIdx && pairs[j].code !== '9' && pairs[j].code !== '0';
          j++
        ) {
          if (pairs[j].code === '10') extMin.x = parseFloat(pairs[j].value);
          if (pairs[j].code === '20') extMin.y = parseFloat(pairs[j].value);
        }
      }
      if (pairs[i].code === '9' && pairs[i].value === '$EXTMAX') {
        extMax = { x: 0, y: 0 };
        for (
          let j = i + 1;
          j <= headerSection.endIdx && pairs[j].code !== '9' && pairs[j].code !== '0';
          j++
        ) {
          if (pairs[j].code === '10') extMax.x = parseFloat(pairs[j].value);
          if (pairs[j].code === '20') extMax.y = parseFloat(pairs[j].value);
        }
      }
    }
  }

  const entitiesSection = sections.find((s) => s.name === 'ENTITIES');
  const parsedEntities = [];

  if (entitiesSection) {
    let i = entitiesSection.startIdx + 2;
    while (i <= entitiesSection.endIdx) {
      if (pairs[i].code === '0' && pairs[i].value === 'ENDSEC') break;
      if (pairs[i].code === '0') {
        const entityType = pairs[i].value;
        i++;
        const entityPairs = [];
        while (i <= entitiesSection.endIdx && pairs[i].code !== '0') {
          entityPairs.push(pairs[i]);
          i++;
        }

        if (entityType === 'LWPOLYLINE') {
          let layer = '0';
          let closed = false;
          const vertices = [];
          let currentX = null;

          for (const ep of entityPairs) {
            if (ep.code === '8') layer = ep.value;
            if (ep.code === '70') closed = (parseInt(ep.value) & 1) !== 0;
            if (ep.code === '10') {
              currentX = parseFloat(ep.value);
            }
            if (ep.code === '20') {
              if (currentX !== null) {
                vertices.push({ x: currentX, y: parseFloat(ep.value) });
                currentX = null;
              }
            }
          }
          parsedEntities.push({ type: 'LWPOLYLINE', layer, vertices, closed });
        } else {
          parsedEntities.push({ type: entityType, layer: '0', rawPairs: entityPairs });
        }
      } else {
        i++;
      }
    }
  }

  const out = [];

  function roundCoord(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return v;
    return parseFloat(n.toFixed(6));
  }

  const COORD_CODES = new Set(['10', '11', '12', '20', '21', '22', '30', '31', '32']);

  function emit(code, value) {
    out.push(String(code).padStart(3));
    const codeStr = String(code).trim();
    if (COORD_CODES.has(codeStr) && typeof value === 'number') {
      out.push(String(roundCoord(value)));
    } else {
      out.push(String(value));
    }
  }

  emit(0, 'SECTION');
  emit(2, 'HEADER');
  emit(9, '$ACADVER');
  emit(1, 'AC1009');
  if (extMin && extMax) {
    emit(9, '$EXTMIN');
    emit(10, extMin.x);
    emit(20, extMin.y);
    emit(9, '$EXTMAX');
    emit(10, extMax.x);
    emit(20, extMax.y);
  }
  emit(0, 'ENDSEC');

  const tablesSection = sections.find((s) => s.name === 'TABLES');
  if (tablesSection) {
    emit(0, 'SECTION');
    emit(2, 'TABLES');
    for (let i = tablesSection.startIdx + 2; i < tablesSection.endIdx; i++) {
      if (pairs[i].code === '100') continue;
      emit(pairs[i].code, pairs[i].value);
    }
    emit(0, 'ENDSEC');
  }

  emit(0, 'SECTION');
  emit(2, 'ENTITIES');

  const seenLineKeys = new Set();
  function makeLineKey(x1, y1, x2, y2) {
    const r = roundCoord;
    const a = `${r(x1)},${r(y1)}`;
    const b = `${r(x2)},${r(y2)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  for (const entity of parsedEntities) {
    if (entity.type === 'LWPOLYLINE') {
      const verts = entity.vertices;
      if (verts.length < 2) continue;
      const segmentCount = entity.closed ? verts.length : verts.length - 1;
      for (let s = 0; s < segmentCount; s++) {
        const p1 = verts[s];
        const p2 = verts[(s + 1) % verts.length];
        const key = makeLineKey(p1.x, p1.y, p2.x, p2.y);
        if (seenLineKeys.has(key)) continue;
        seenLineKeys.add(key);
        emit(0, 'LINE');
        emit(8, entity.layer);
        emit(10, p1.x);
        emit(20, p1.y);
        emit(11, p2.x);
        emit(21, p2.y);
      }
    } else if (entity.type === 'LINE') {
      const rawPairs = entity.rawPairs || [];
      let x1 = null, y1 = null, x2 = null, y2 = null;
      for (const ep of rawPairs) {
        if (ep.code === '10') x1 = parseFloat(ep.value);
        if (ep.code === '20') y1 = parseFloat(ep.value);
        if (ep.code === '11') x2 = parseFloat(ep.value);
        if (ep.code === '21') y2 = parseFloat(ep.value);
      }
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        const key = makeLineKey(x1, y1, x2, y2);
        if (seenLineKeys.has(key)) continue;
        seenLineKeys.add(key);
      }
      emit(0, 'LINE');
      for (const ep of rawPairs) {
        if (ep.code === '100') continue;
        emit(ep.code, ep.value);
      }
    } else {
      emit(0, entity.type);
      for (const ep of entity.rawPairs || []) {
        if (ep.code === '100') continue;
        emit(ep.code, ep.value);
      }
    }
  }

  emit(0, 'ENDSEC');
  emit(0, 'EOF');

  const result = out.join('\n') + '\n';
  const encoder = new TextEncoder();
  return encoder.encode(result).buffer;
}

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
