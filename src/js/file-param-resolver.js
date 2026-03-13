/**
 * File Parameter Resolver
 *
 * Pure utility that identifies [file] parameters in a parameter set,
 * computes deterministic mount paths for the worker virtual filesystem,
 * and decodes data-URL payloads into byte arrays suitable for FS.writeFile.
 *
 * Desktop OpenSCAD resolves import() paths relative to the source file
 * directory, then searches OPENSCADPATH. We replicate this by mounting
 * file parameter contents next to the main SCAD file in the worker FS.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Check whether a parameter value is a file object from the UI.
 *
 * File params arrive as { name: string, data: string (data-URL), ... }
 * from the createFileControl handler in ui-generator.js.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isFileParamValue(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.data != null
  );
}

/**
 * Decode a data-URL string into a Uint8Array.
 *
 * Handles both:
 *   - data:[<mediatype>];base64,<data>   (from FileReader.readAsDataURL)
 *   - raw base64 strings (fallback)
 *
 * @param {string} dataUrl
 * @returns {Uint8Array}
 */
export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    if (dataUrl instanceof ArrayBuffer) return new Uint8Array(dataUrl);
    if (dataUrl instanceof Uint8Array) return dataUrl;
    if (ArrayBuffer.isView(dataUrl)) return new Uint8Array(dataUrl.buffer, dataUrl.byteOffset, dataUrl.byteLength);
    throw new Error('Unsupported file parameter data type');
  }

  let base64;
  if (dataUrl.startsWith('data:')) {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) throw new Error('Malformed data URL: missing comma');
    base64 = dataUrl.substring(commaIndex + 1);
  } else {
    base64 = dataUrl;
  }

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Sanitize a filename for safe use in the virtual filesystem.
 * Rejects path traversal and strips directory prefixes.
 *
 * @param {string} rawName
 * @returns {string}
 */
export function sanitizeFileName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'uploaded_file';

  let name = rawName.replace(/\\/g, '/');

  // Reject any path containing traversal before basename extraction
  if (name.includes('..')) {
    return 'uploaded_file';
  }

  // Strip directory path — keep only the basename
  const slashIdx = name.lastIndexOf('/');
  if (slashIdx !== -1) name = name.substring(slashIdx + 1);

  if (name === '.' || name === '..') {
    return 'uploaded_file';
  }

  // Strip leading dots (hidden files) for safety
  name = name.replace(/^\.+/, '');

  return name || 'uploaded_file';
}

/**
 * Resolve file parameters into mount operations and cleaned parameter values.
 *
 * @param {Object} parameters - Parameter key-value pairs (may contain file objects)
 * @param {string} mountBaseDir - Directory to mount files into (e.g. '/work' or '/tmp')
 * @returns {{
 *   mountOperations: Array<{paramName: string, fileName: string, mountPath: string, data: Uint8Array}>,
 *   resolvedParams: Object,
 *   fileParamNames: string[]
 * }}
 */
export function resolveFileParams(parameters, mountBaseDir) {
  if (!parameters || typeof parameters !== 'object') {
    return { mountOperations: [], resolvedParams: parameters || {}, fileParamNames: [] };
  }

  const mountOperations = [];
  const resolvedParams = {};
  const fileParamNames = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (isFileParamValue(value)) {
      const fileName = sanitizeFileName(value.name);
      const mountPath = `${mountBaseDir}/${fileName}`;

      try {
        const data = decodeDataUrl(value.data);
        mountOperations.push({ paramName: key, fileName, mountPath, data });
        fileParamNames.push(fileName);
      } catch (err) {
        console.warn(`[FileParamResolver] Failed to decode data for param "${key}":`, err.message);
        resolvedParams[key] = fileName;
        continue;
      }

      // Replace the file object with just the filename string.
      // OpenSCAD resolves import() relative to the source file dir,
      // so the bare filename matches the mounted path.
      resolvedParams[key] = fileName;
    } else {
      resolvedParams[key] = value;
    }
  }

  return { mountOperations, resolvedParams, fileParamNames };
}
