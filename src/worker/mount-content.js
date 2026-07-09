/**
 * Mount-content resolution — pure logic shared by the render worker and
 * tests.
 *
 * S-013: Image companion files arrive as base64 data-URL strings from the
 * browser (FileReader.readAsDataURL or ZIP extraction). Writing the literal
 * text to the Emscripten FS would hand OpenSCAD surface()/import() a text
 * file instead of binary image data, so data URLs must be decoded to
 * Uint8Array before mounting.
 *
 * @license GPL-3.0-or-later
 */

import { decodeDataUrl } from '../js/file-param-resolver.js';

/**
 * Detect whether mount content is a data-URL string (vs plain text or
 * already-binary content).
 * @param {string|Uint8Array} content
 * @returns {boolean}
 */
export function isDataUrl(content) {
  return typeof content === 'string' && content.startsWith('data:');
}

/**
 * Resolve content for mounting into the worker FS: data URLs are decoded
 * to binary Uint8Array; everything else passes through unchanged.
 *
 * @param {string|Uint8Array} content - Raw content from the UI
 * @param {Object} [options]
 * @param {(err: Error) => void} [options.onDecodeError] - Called when a
 *   data URL fails to decode (content then falls back to text passthrough)
 * @returns {string|Uint8Array}
 */
export function resolveMountContent(content, { onDecodeError } = {}) {
  if (isDataUrl(content)) {
    try {
      return decodeDataUrl(content);
    } catch (err) {
      if (onDecodeError) onDecodeError(err);
      return content;
    }
  }
  return content;
}
