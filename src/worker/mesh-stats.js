/**
 * Mesh statistics helpers for worker render outputs.
 * @license GPL-3.0-or-later
 *
 * OFF headers arrive either as `OFF <v> <f> <e>` on one line or with the
 * counts on the line after the keyword; COFF (per-vertex colors) shares the
 * shape. The face count is the third-of-three header number we surface as
 * "triangles" in the status bar (faces are triangles for render output).
 */

const OFF_HEADER_INLINE = /^C?OFF\s+\d+\s+(\d+)/m;
const OFF_HEADER_NEXT_LINE = /^C?OFF\b[^\n]*\n\s*\d+\s+(\d+)/m;

/**
 * Parse the face count from an OFF/COFF payload.
 *
 * Accepts the render output in any of the shapes the worker sees: a text
 * string, an ArrayBuffer, or a Uint8Array. Binary-ish inputs are decoded
 * from their first kilobyte only — the header always fits there and huge
 * meshes stay undecoded.
 *
 * @param {string|ArrayBuffer|Uint8Array} input
 * @returns {number} face count, or 0 when no OFF header is found
 */
export function parseOffTriangleCount(input) {
  let head = '';
  if (typeof input === 'string') {
    head = input.slice(0, 1024);
  } else if (input && typeof input.byteLength === 'number') {
    // Duck-typed instead of instanceof: buffers can cross realms (worker
    // boundaries, test environments) where instanceof fails.
    try {
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(
            input.buffer,
            input.byteOffset,
            Math.min(1024, input.byteLength)
          )
        : new Uint8Array(input, 0, Math.min(1024, input.byteLength));
      head = new TextDecoder().decode(bytes);
    } catch {
      return 0;
    }
  } else {
    return 0;
  }

  const match = head.match(OFF_HEADER_INLINE) || head.match(OFF_HEADER_NEXT_LINE);
  if (!match) return 0;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}
