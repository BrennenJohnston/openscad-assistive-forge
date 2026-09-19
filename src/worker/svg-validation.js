/**
 * SVG output validation — pure logic shared by the render worker and tests.
 *
 * Extracted from openscad-worker.js so unit tests exercise the real
 * implementation instead of a mirrored copy.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Validate SVG output
 * @param {string} content - SVG content as string
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSVGOutput(content) {
  // Check minimum length
  if (!content || content.length < 50) {
    return {
      valid: false,
      error:
        'SVG output is empty or too small. Your model may not produce 2D geometry. ' +
        'Ensure your model uses projection() or 2D primitives, and that your parameter settings produce visible geometry.',
    };
  }

  // Check for SVG root element
  if (!/<svg[\s>]/i.test(content)) {
    return {
      valid: false,
      error:
        'Invalid SVG output - missing <svg> element. The OpenSCAD render may have failed silently.',
    };
  }

  // Check for at least one geometric element
  const geometricElements = [
    '<path',
    '<polygon',
    '<polyline',
    '<line',
    '<rect',
    '<circle',
    '<ellipse',
    '<g>',
  ];

  const hasGeometry = geometricElements.some((el) =>
    content.toLowerCase().includes(el.toLowerCase())
  );

  if (!hasGeometry) {
    return {
      valid: false,
      error:
        'SVG contains no geometry (no paths, polygons, or shapes). ' +
        'Your 3D model may not include any 2D projection. ' +
        'Ensure your model uses projection() or is configured for 2D output.',
    };
  }

  // Check for completely empty viewBox or very small content
  const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      const width = parts[2];
      const height = parts[3];
      if ((width === 0 && height === 0) || (width < 0.001 && height < 0.001)) {
        return {
          valid: false,
          error:
            'SVG has zero-size viewBox (no visible geometry). ' +
            'Your model configuration may be producing empty output.',
        };
      }
    }
  }

  return { valid: true };
}
