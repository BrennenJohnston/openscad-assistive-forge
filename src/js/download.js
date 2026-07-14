/**
 * Download Manager - Multi-format file download
 * @license GPL-3.0-or-later
 */

/**
 * Format definitions with MIME types and extensions
 */
export const OUTPUT_FORMATS = {
  // 3D Printing Formats
  stl: {
    name: 'STL',
    extension: '.stl',
    mimeType: 'application/vnd.ms-pki.stl', // or 'application/octet-stream'
    description: 'Most common format for 3D printing',
    is2D: false,
  },
  obj: {
    name: 'OBJ',
    extension: '.obj',
    mimeType: 'text/plain', // OBJ is text-based
    description: 'Wavefront OBJ, widely supported',
    is2D: false,
  },
  off: {
    name: 'OFF',
    extension: '.off',
    mimeType: 'text/plain', // OFF is text-based
    description: 'Object File Format for geometry',
    is2D: false,
  },
  amf: {
    name: 'AMF',
    extension: '.amf',
    mimeType: 'application/x-amf', // or 'application/xml'
    description: 'Additive Manufacturing File Format',
    is2D: false,
  },
  '3mf': {
    name: '3MF',
    extension: '.3mf',
    mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    description: '3D Manufacturing Format (modern)',
    is2D: false,
  },
  // Additional 3D Formats
  wrl: {
    name: 'VRML',
    extension: '.wrl',
    mimeType: 'model/vrml',
    description: 'VRML - Virtual Reality Modeling Language',
    is2D: false,
  },
  csg: {
    name: 'CSG',
    extension: '.csg',
    mimeType: 'text/plain',
    description: 'OpenSCAD CSG tree format',
    is2D: false,
  },
  pdf: {
    name: 'PDF',
    extension: '.pdf',
    mimeType: 'application/pdf',
    description: 'PDF - 2D projection export',
    is2D: true,
  },
  // Laser Cutting / 2D Formats
  svg: {
    name: 'SVG',
    extension: '.svg',
    mimeType: 'image/svg+xml',
    description: 'SVG - For laser cutting or 2D vector graphics',
    is2D: true,
  },
  dxf: {
    name: 'DXF',
    extension: '.dxf',
    mimeType: 'application/dxf',
    description: 'DXF - For CAD software and laser cutting',
    is2D: true,
  },
};

/**
 * Generate a short hash from a string
 * @param {string} str - String to hash
 * @returns {string} Short hash (6 chars)
 */
function shortHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * Generate filename for download
 * @param {string} modelName - Name of the model
 * @param {Object} parameters - Parameter values
 * @param {string} format - Output format (stl, obj, off, amf, 3mf)
 * @returns {string} Filename
 */
export function generateFilename(modelName, parameters, format = 'stl') {
  const sanitized = modelName
    .replace(/\.(scad|zip)$/, '')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase();
  const hash = shortHash(JSON.stringify(parameters));
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const extension = OUTPUT_FORMATS[format]?.extension || `.${format}`;
  return `${sanitized}-${hash}-${date}${extension}`;
}

/**
 * Resolve the filename for a download: a friendly override base name when
 * one is provided (sanitized, extension appended — no hash or date, so
 * "Braille Charm B" becomes "Braille Charm B.stl"), otherwise the standard
 * generated name.
 * @param {string} modelName - Name of the model (fallback path)
 * @param {Object} parameters - Parameter values (fallback path)
 * @param {string} format - Output format (stl, obj, off, amf, 3mf)
 * @param {string|null} [overrideName] - Friendly base name without extension
 * @returns {string} Filename
 */
export function resolveDownloadFilename(
  modelName,
  parameters,
  format = 'stl',
  overrideName = null
) {
  if (overrideName) {
    const extension = OUTPUT_FORMATS[format]?.extension || `.${format}`;
    return sanitizeFilename(overrideName) + extension;
  }
  return generateFilename(modelName, parameters, format);
}

/**
 * Download file with specified format
 * @param {ArrayBuffer} arrayBuffer - File data
 * @param {string} filename - Filename
 * @param {string} format - Output format (stl, obj, off, amf, 3mf)
 */
export function downloadFile(arrayBuffer, filename, format = 'stl') {
  const mimeType =
    OUTPUT_FORMATS[format]?.mimeType || 'application/octet-stream';
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download STL file (legacy compatibility)
 * @param {ArrayBuffer} arrayBuffer - STL data
 * @param {string} filename - Filename
 */
export function downloadSTL(arrayBuffer, filename) {
  downloadFile(arrayBuffer, filename, 'stl');
}

/**
 * Format file size for display
 *
 * NOT interchangeable with storage-manager.js formatBytes: this one always
 * shows one decimal ("1.0 KB"), tops out at MB, and does no input
 * validation; formatBytes strips trailing zeros ("1 KB"), scales to YB,
 * and returns "Unknown" for invalid input. Callers rely on each display
 * format, so both are kept.
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sanitize a string for safe use as a DOWNLOAD filename.
 * Preserves original case and spaces while removing filesystem-unsafe characters.
 *
 * Intentionally separate from the two sanitizeFileName helpers:
 * file-param-resolver.js guards the worker virtual FS (path traversal,
 * basename extraction), and storage-manager.js replaces unsafe characters
 * with underscores for project-file paths. Outputs differ for the same
 * input, so they must not be merged.
 *
 * @param {string} name - Raw name to sanitize
 * @returns {string} Safe filename without extension (falls back to 'preset-export' if empty)
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'preset-export';
  const sanitized = name
    // Strip filesystem-unsafe characters
    .replace(/[/\\:*?"<>|]/g, '')
    // Strip leading/trailing whitespace and dots
    .replace(/^[\s.]+|[\s.]+$/g, '')
    // Limit length
    .slice(0, 200);
  return sanitized || 'preset-export';
}
