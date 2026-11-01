/**
 * A reader of the Mapbox Vector Tile format (version 2), the format of the
 * map data tiles the Tactile Map Designer reads: a protobuf message of
 * layers, each with its features, their tags as indexes into the layer's
 * keys and values, and their geometry as move, line and close commands in
 * tile units (0 to the layer's extent, y down).
 *
 * Written here rather than taken from a package: the format is small, and
 * the app reads only what a map needs.
 *
 * A feature comes back as `{ id, type, tags, geometry }`, `type` 1 for
 * points, 2 for lines, 3 for polygons, and `geometry`:
 * - points: one part per point, `[[x, y]]`;
 * - lines: one part per line, `[[x, y], ...]`;
 * - polygons: one part per polygon, its rings outer first, each ring closed
 *   (the first point repeated at the end).
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */

const WIRE_VARINT = 0;
const WIRE_64 = 1;
const WIRE_BYTES = 2;
const WIRE_32 = 5;

const COMMAND_MOVE = 1;
const COMMAND_LINE = 2;
const COMMAND_CLOSE = 7;

function broken(detail) {
  return new Error(`These bytes are not a vector tile: ${detail}.`);
}

/** A cursor over a protobuf message. */
class Reader {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.pos = start;
    this.end = end;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  more() {
    return this.pos < this.end;
  }

  varint() {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.end) throw broken('a number runs past the end');
      const byte = this.bytes[this.pos++];
      // Past 32 bits the shifts overflow, so multiply instead.
      result += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return result;
      shift += 7;
      if (shift > 63) throw broken('a number is too long');
    }
  }

  /** A field's tag: its number and wire type. */
  key() {
    const key = this.varint();
    return { field: Math.floor(key / 8), wire: key & 7 };
  }

  /** The bounds of a length-delimited field, the cursor moved past it. */
  span() {
    const length = this.varint();
    const start = this.pos;
    const end = start + length;
    if (end > this.end) throw broken('a field runs past the end');
    this.pos = end;
    return [start, end];
  }

  skip(wire) {
    if (wire === WIRE_VARINT) this.varint();
    else if (wire === WIRE_64) this.pos += 8;
    else if (wire === WIRE_BYTES) this.span();
    else if (wire === WIRE_32) this.pos += 4;
    else throw broken(`an unknown field kind ${wire}`);
    if (this.pos > this.end) throw broken('a field runs past the end');
  }

  /** A packed run of varints. */
  packed() {
    const [start, end] = this.span();
    const out = [];
    const inner = new Reader(this.bytes, start, end);
    while (inner.more()) out.push(inner.varint());
    return out;
  }
}

const textDecoder = new TextDecoder();
const text = (bytes, [start, end]) =>
  textDecoder.decode(bytes.subarray(start, end));
const zigzag = (n) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

/** A value message: one of string, float, double, int, uint, sint, bool. */
function readValue(bytes, [start, end]) {
  const r = new Reader(bytes, start, end);
  let value = null;
  while (r.more()) {
    const { field, wire } = r.key();
    if (field === 1 && wire === WIRE_BYTES) value = text(bytes, r.span());
    else if (field === 2 && wire === WIRE_32) {
      value = r.view.getFloat32(r.pos, true);
      r.pos += 4;
    } else if (field === 3 && wire === WIRE_64) {
      value = r.view.getFloat64(r.pos, true);
      r.pos += 8;
    } else if ((field === 4 || field === 5) && wire === WIRE_VARINT) {
      // int64 and uint64; a negative int64 arrives as a 10-byte varint.
      const n = r.varint();
      value = field === 4 && n >= 2 ** 63 ? n - 2 ** 64 : n;
    } else if (field === 6 && wire === WIRE_VARINT) value = zigzag(r.varint());
    else if (field === 7 && wire === WIRE_VARINT) value = r.varint() !== 0;
    else r.skip(wire);
  }
  return value;
}

/** Twice a ring's signed area by the surveyor's formula, in tile units. */
function signedArea2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return sum;
}

/** The command stream of a feature as points, lines or polygons. */
function readGeometry(commands, type) {
  const parts = [];
  let x = 0;
  let y = 0;
  let current = null;
  let i = 0;
  while (i < commands.length) {
    const command = commands[i] & 7;
    const count = Math.floor(commands[i] / 8);
    i += 1;
    if (command === COMMAND_CLOSE) {
      if (current && current.length > 0) current.push([...current[0]]);
      continue;
    }
    if (command !== COMMAND_MOVE && command !== COMMAND_LINE) {
      throw broken(`an unknown geometry command ${command}`);
    }
    if (i + 2 * count > commands.length) {
      throw broken('a geometry runs past its end');
    }
    for (let k = 0; k < count; k += 1) {
      x += zigzag(commands[i]);
      y += zigzag(commands[i + 1]);
      i += 2;
      if (command === COMMAND_MOVE) {
        current = [];
        parts.push(current);
      }
      current.push([x, y]);
    }
  }
  if (type === 1) return parts.flatMap((p) => p.map((point) => [point]));
  if (type === 2) return parts;
  // Polygons: a ring with a positive area (y down) starts a polygon; the
  // rings with a negative one are its holes.
  const polygons = [];
  for (const ring of parts) {
    const area = signedArea2(ring);
    if (area === 0) continue;
    if (area > 0 || polygons.length === 0) polygons.push([ring]);
    else polygons[polygons.length - 1].push(ring);
  }
  return polygons;
}

function readFeature(bytes, span, keys, values) {
  const r = new Reader(bytes, span[0], span[1]);
  let id = null;
  let type = 0;
  let tagIndexes = [];
  let commands = [];
  while (r.more()) {
    const { field, wire } = r.key();
    if (field === 1 && wire === WIRE_VARINT) id = r.varint();
    else if (field === 2 && wire === WIRE_BYTES) tagIndexes = r.packed();
    else if (field === 3 && wire === WIRE_VARINT) type = r.varint();
    else if (field === 4 && wire === WIRE_BYTES) commands = r.packed();
    else r.skip(wire);
  }
  const tags = {};
  for (let k = 0; k + 1 < tagIndexes.length; k += 2) {
    const key = keys[tagIndexes[k]];
    if (key === undefined) throw broken('a tag names a key that is not there');
    tags[key] = values[tagIndexes[k + 1]];
  }
  return { id, type, tags, geometry: readGeometry(commands, type) };
}

function readLayer(bytes, span) {
  const r = new Reader(bytes, span[0], span[1]);
  let name = '';
  let extent = 4096;
  const keys = [];
  const values = [];
  const featureSpans = [];
  while (r.more()) {
    const { field, wire } = r.key();
    if (field === 1 && wire === WIRE_BYTES) name = text(bytes, r.span());
    else if (field === 2 && wire === WIRE_BYTES) featureSpans.push(r.span());
    else if (field === 3 && wire === WIRE_BYTES)
      keys.push(text(bytes, r.span()));
    else if (field === 4 && wire === WIRE_BYTES)
      values.push(readValue(bytes, r.span()));
    else if (field === 5 && wire === WIRE_VARINT) extent = r.varint();
    else r.skip(wire);
  }
  const features = featureSpans.map((s) => readFeature(bytes, s, keys, values));
  return { name, extent, features };
}

/**
 * Decode a vector tile.
 *
 * @param {Uint8Array} bytes - the tile, already decompressed
 * @returns {Object<string, {extent: number, features: Array<{id: number|null, type: number, tags: object, geometry: Array}>}>}
 *   the layers by name
 */
export function decodeTile(bytes) {
  const r = new Reader(bytes);
  const layers = {};
  while (r.more()) {
    const { field, wire } = r.key();
    if (field === 3 && wire === WIRE_BYTES) {
      const layer = readLayer(bytes, r.span());
      layers[layer.name] = layer;
    } else {
      r.skip(wire);
    }
  }
  return layers;
}
