/**
 * DXF post-processing — pure logic shared by the render worker and tests.
 *
 * Extracted from openscad-worker.js so unit tests exercise the real
 * implementation instead of a mirrored copy.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Post-process DXF output from OpenSCAD WASM to fix known compatibility issues.
 *
 * The OpenSCAD WASM binary (based on development snapshots post-2022) exports DXF files
 * using LWPOLYLINE entities with R14+ subclass markers, but declares version AC1006 (R10).
 * This hybrid format is rejected by most CAD software (AutoCAD, CorelDRAW, Adobe Illustrator,
 * Xometry, SendCutSend, LibreCAD, NanoCAD, SketchUp -- see issue #4268).
 *
 * Simply changing the version number is NOT enough (confirmed by multiple users in #4268).
 * The only universally compatible approach is to convert LWPOLYLINE entities back to
 * individual LINE segments -- the format used by the working 2021.01 stable release.
 *
 * This post-processor:
 *   1. Removes the broken HEADER section entirely (R12 DXF doesn't require one)
 *   2. Preserves the TABLES section (LTYPE, LAYER, STYLE) as-is
 *   3. Converts each LWPOLYLINE to a series of LINE entities
 *   4. Preserves any non-LWPOLYLINE entities unchanged
 *   5. Produces a clean, headerless DXF compatible with all tested applications
 *
 * Reference: github.com/openscad/openscad/issues/4268
 *            github.com/openscad/openscad/pull/6599
 *
 * @param {ArrayBuffer} outputBuffer - Raw DXF output from WASM
 * @returns {ArrayBuffer} Post-processed DXF as ArrayBuffer
 */
export function postProcessDXF(outputBuffer) {
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(outputBuffer);
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');

  // Parse DXF into group-code/value pairs
  const pairs = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    pairs.push({
      code: rawLines[i].trim(),
      value: rawLines[i + 1].trim(),
    });
  }

  // Identify section boundaries
  // Sections are: 0/SECTION, 2/<name>, ..., 0/ENDSEC
  const sections = []; // {name, startIdx, endIdx}
  for (let i = 0; i < pairs.length; i++) {
    if (
      pairs[i].code === '0' &&
      pairs[i].value === 'SECTION' &&
      i + 1 < pairs.length &&
      pairs[i + 1].code === '2'
    ) {
      const name = pairs[i + 1].value;
      // Find matching ENDSEC
      for (let j = i + 2; j < pairs.length; j++) {
        if (pairs[j].code === '0' && pairs[j].value === 'ENDSEC') {
          sections.push({ name, startIdx: i, endIdx: j });
          break;
        }
      }
    }
  }

  // Extract EXTMIN/EXTMAX from HEADER for optional re-use
  const headerSection = sections.find((s) => s.name === 'HEADER');
  let extMin = null,
    extMax = null;
  if (headerSection) {
    for (let i = headerSection.startIdx; i <= headerSection.endIdx; i++) {
      if (pairs[i].code === '9' && pairs[i].value === '$EXTMIN') {
        extMin = { x: 0, y: 0 };
        for (
          let j = i + 1;
          j <= headerSection.endIdx &&
          pairs[j].code !== '9' &&
          pairs[j].code !== '0';
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
          j <= headerSection.endIdx &&
          pairs[j].code !== '9' &&
          pairs[j].code !== '0';
          j++
        ) {
          if (pairs[j].code === '10') extMax.x = parseFloat(pairs[j].value);
          if (pairs[j].code === '20') extMax.y = parseFloat(pairs[j].value);
        }
      }
    }
  }

  // Parse LWPOLYLINE entities from the ENTITIES section
  const entitiesSection = sections.find((s) => s.name === 'ENTITIES');
  const parsedEntities = []; // Each is {type, layer, pairs} or {type:'LWPOLYLINE', layer, vertices, closed}

  if (entitiesSection) {
    let i = entitiesSection.startIdx + 2; // Skip 0/SECTION and 2/ENTITIES
    while (i <= entitiesSection.endIdx) {
      if (pairs[i].code === '0' && pairs[i].value === 'ENDSEC') break;
      if (pairs[i].code === '0') {
        const entityType = pairs[i].value;
        i++; // Move past the 0/EntityType pair

        // Collect all pairs until next 0-code (next entity or ENDSEC)
        const entityPairs = [];
        while (i <= entitiesSection.endIdx && pairs[i].code !== '0') {
          entityPairs.push(pairs[i]);
          i++;
        }

        if (entityType === 'LWPOLYLINE') {
          // Parse LWPOLYLINE into vertices
          let layer = '0';
          let closed = false;
          const vertices = [];
          let currentX = null;

          for (const ep of entityPairs) {
            if (ep.code === '8') layer = ep.value;
            if (ep.code === '70') closed = (parseInt(ep.value) & 1) !== 0;
            if (ep.code === '10') {
              if (currentX !== null && vertices.length > 0) {
                // Previous vertex didn't get a Y -- shouldn't happen, but guard
              }
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
          // Keep other entity types as raw pairs
          parsedEntities.push({
            type: entityType,
            layer: '0',
            rawPairs: entityPairs,
          });
        }
      } else {
        i++;
      }
    }
  }

  // Build clean DXF output with minimal R12 header for Adobe Illustrator compatibility.
  // Illustrator requires a HEADER section with $ACADVER to interpret geometry correctly;
  // without it, Illustrator falls back to text rendering (confirmed by @peterzieba in #4268).
  const out = [];

  // Helper: round a coordinate to 6 decimal places to avoid floating-point noise
  // in downstream tools (LibreCAD, Inkscape, etc.).  BUG-D fix.
  function roundCoord(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return v;
    // Use toPrecision(10) then parseFloat to strip trailing zeros
    return parseFloat(n.toFixed(6));
  }

  // Coordinate group codes that should be rounded (X/Y/Z for both start and end points)
  const COORD_CODES = new Set([
    '10',
    '11',
    '12',
    '20',
    '21',
    '22',
    '30',
    '31',
    '32',
  ]);

  // Helper to emit a group code/value pair with proper DXF formatting
  // Group codes are right-justified in a 3-char field; values on the next line
  function emit(code, value) {
    out.push(String(code).padStart(3));
    const codeStr = String(code).trim();
    if (COORD_CODES.has(codeStr) && typeof value === 'number') {
      out.push(String(roundCoord(value)));
    } else {
      out.push(String(value));
    }
  }

  // HEADER section -- minimal R12-compatible header
  // AC1009 = R12, the most universally supported DXF version.
  // Only LINE entities are used, which are fully R12 compatible.
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

  // TABLES section -- copy from original, stripping any subclass markers
  const tablesSection = sections.find((s) => s.name === 'TABLES');
  if (tablesSection) {
    emit(0, 'SECTION');
    emit(2, 'TABLES');
    for (let i = tablesSection.startIdx + 2; i < tablesSection.endIdx; i++) {
      // Skip subclass markers (group code 100) -- not valid for R12
      if (pairs[i].code === '100') continue;
      emit(pairs[i].code, pairs[i].value);
    }
    emit(0, 'ENDSEC');
  }

  // ENTITIES section -- convert LWPOLYLINE to LINE, keep others
  emit(0, 'SECTION');
  emit(2, 'ENTITIES');

  // BUG-D fix: deduplicate LINE segments to prevent doubled geometry.
  // Some WASM DXF outputs contain identical LINE entities for coincident edges.
  // We track line segments by a canonical key (min endpoint first for order-independence).
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
      // Deduplicate passthrough LINE entities too
      const rawPairs = entity.rawPairs || [];
      let x1 = null,
        y1 = null,
        x2 = null,
        y2 = null,
        _layer = '0';
      for (const ep of rawPairs) {
        if (ep.code === '8') _layer = ep.value;
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
      // Emit non-LWPOLYLINE entities as-is (skip subclass markers)
      emit(0, entity.type);
      for (const ep of entity.rawPairs || []) {
        if (ep.code === '100') continue; // Strip subclass markers
        emit(ep.code, ep.value);
      }
    }
  }

  emit(0, 'ENDSEC');

  // EOF
  emit(0, 'EOF');

  const result = out.join('\n') + '\n';

  const encoder = new TextEncoder();
  return encoder.encode(result).buffer;
}
