/**
 * Desktop-parity styling constants for 2D preview/render display.
 *
 * Single source for the hex values that were previously copy-pasted in
 * five places (main.js ×2, auto-preview-controller.js ×2, preview.js).
 * All values are OBSERVED desktop OpenSCAD output for 2D geometry,
 * recorded in Testing Round 7 ("Color Codes for settings previews and
 * renders", desktop 2021.01):
 *
 *   F5 draft preview of 2D first-layer ... #7A9F7A sage green
 *   F6 rendered 2D first-layer .......... #07D0A7 teal fill,
 *                                          #FF0603 red outlines
 *
 * The same Round 7 capture also recorded 3D-state colors (e.g. preview
 * 3D-printed keyguard #39bdb0, rendered #D3B627 + #85AC46). Those are NOT
 * constants here on purpose: they are produced by the model's own color()
 * calls and the engine's native CSG render colors, which flow through the
 * pipeline untouched since the injectCsgColors removal. Desktop OpenSCAD
 * does not tint models by render state, and neither do we (see the
 * RENDER_STATE_COLORS removal note in preview.js).
 *
 * @license GPL-3.0-or-later
 */

/**
 * SVG display palettes keyed by 2D preview mode.
 * @param {'draft'|'rendered'} mode
 * @returns {{fill: string, stroke: string, strokeWidth: string, fillOpacity: string}}
 */
export function get2DStylePalette(mode) {
  return mode === 'rendered'
    ? {
        fill: '#07D0A7',
        stroke: '#FF0603',
        strokeWidth: '0.5',
        fillOpacity: '1',
      }
    : {
        fill: '#7A9F7A',
        stroke: '#7A9F7A',
        strokeWidth: '0.25',
        fillOpacity: '0.9',
      };
}

/**
 * Build the inline <style> tag injected into SVG text before it is shown
 * in the 2D preview plane.
 * @param {'draft'|'rendered'} mode
 * @returns {string}
 */
export function build2DPreviewStyleTag(mode) {
  const p = get2DStylePalette(mode);
  return (
    '<style data-forge-preview="true">' +
    `path,polygon,polyline,circle,ellipse,rect{fill:${p.fill};stroke:${p.stroke};stroke-width:${p.strokeWidth};fill-opacity:${p.fillOpacity}}` +
    `line{stroke:${p.stroke};stroke-width:${p.strokeWidth}}` +
    '</style>'
  );
}
