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
 * The project's name as a file name stem: no extension, nothing a file
 * system refuses.
 * @param {string} modelName - Name of the model
 * @returns {string}
 */
export function projectStem(modelName) {
  return (modelName || 'model')
    .replace(/\.(scad|zip)$/i, '')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase();
}

/** Today, as the date in a file name. */
export function todayStamp() {
  return new Date().toISOString().split('T')[0];
}

/**
 * The name a download gets: the project and the day, and for an STL which
 * of the two kinds it is, so a person finding the file later knows what it
 * is. The old name carried an unexplained code made from the parameters,
 * and both STL kinds got the same name.
 * @param {string} modelName - Name of the model
 * @param {Object} _parameters - Parameter values (no longer part of the name)
 * @param {string} format - Output format (stl, obj, off, amf, 3mf)
 * @param {Object} [options]
 * @param {boolean} [options.stlBinary] - For an STL, which kind; left out,
 *   the name says no kind
 * @returns {string} Filename
 */
export function generateFilename(
  modelName,
  _parameters,
  format = 'stl',
  { stlBinary } = {}
) {
  const kind =
    format === 'stl' && typeof stlBinary === 'boolean'
      ? stlBinary
        ? '-binary'
        : '-ascii'
      : '';
  const extension = OUTPUT_FORMATS[format]?.extension || `.${format}`;
  return `${projectStem(modelName)}-${todayStamp()}${kind}${extension}`;
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
  overrideName = null,
  options = {}
) {
  if (overrideName) {
    const extension = OUTPUT_FORMATS[format]?.extension || `.${format}`;
    return sanitizeFilename(overrideName) + extension;
  }
  return generateFilename(modelName, parameters, format, options);
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
 * Not interchangeable with storage-manager.js formatBytes: this one always
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
/**
 * The short line under the preview: the file's size, and its triangle count
 * when the format has one (a 2D drawing has none to report).
 * @param {{size: number, triangles?: number}} stats
 * @returns {string}
 */
export function formatPreviewStats(stats) {
  const size = formatFileSize(stats.size);
  return stats.triangles > 0
    ? `${size} | ${stats.triangles.toLocaleString()} triangles`
    : size;
}

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
