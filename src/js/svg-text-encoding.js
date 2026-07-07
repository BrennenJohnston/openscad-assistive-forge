/**
 * Unicode-safe SVG text ↔ base64 data URL conversion.
 *
 * btoa()/atob() only handle Latin-1; SVGs containing unicode (titles,
 * labels, Inkscape metadata) throw. These helpers round-trip any SVG
 * text through UTF-8 bytes.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Encode SVG text as a base64 data URL (UTF-8 safe).
 * @param {string} svgText - SVG markup
 * @returns {string} data:image/svg+xml;base64,... URL
 */
export function svgToDataUrl(svgText) {
  const bytes = new TextEncoder().encode(svgText);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

/**
 * Decode a base64 data URL back to SVG text (UTF-8 safe).
 * @param {string} dataUrl - data:...;base64,... URL
 * @returns {string} Decoded text
 */
export function dataUrlToText(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return new TextDecoder().decode(
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  );
}
