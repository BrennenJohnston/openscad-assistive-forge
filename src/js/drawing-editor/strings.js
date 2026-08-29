/**
 * Every word the drawing editor says, in one file.
 *
 * One file so the owner can read the whole surface's language in one sitting
 * rather than hunting it through the code, and so a translation - or a change
 * of mind about a word - is one place.
 *
 * STRINGS: owner review pending (DP-R2 text pack). US English. No em dashes
 * (UF-3). Anything a screen reader says is flagged doubly in the pack.
 *
 * @license GPL-3.0-or-later
 */

/** "1 region" or "N regions", and the same for anything else countable. */
export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const EDITOR_STRINGS = Object.freeze({
  /** The surface's own name, and the first thing focus lands on. */
  title: 'Drawing editor',

  close: 'Close',

  /**
   * The two links that make a long list escapable. A person who tabs into the
   * editor should never have to walk the whole regions table to reach the
   * toolbar again, and a person reading the toolbar should be able to jump to
   * the table without walking the toolbar.
   */
  skipToRegions: 'Skip to the regions table',
  backToToolbar: 'Back to the toolbar',

  sectionColours: 'Colours',
  sectionRegions: 'Regions',
  sectionPlates: 'Plates and paint order',
  sectionWarnings: 'Warnings',

  /**
   * Said once when the surface takes the preview area. A11Y. On the stencil
   * purpose the engine's own finding follows it in the same breath (★ D-124:
   * "21 regions found, no colours yet: every one starts as the base coat."),
   * so a drawing that arrived with no plan is never pretended to have one.
   */
  opened: 'Drawing editor open. The model preview is behind it.',

  /** The status line while the colour engine is on its way. A11Y. */
  findingRegions: 'Finding the regions in this drawing.',

  /** What the engine found, said once with the opening. A11Y (two shapes). */
  regionsFound: (regions, colours) =>
    colours > 1
      ? `${count(regions, 'region', 'regions')} found, in ${count(colours, 'colour', 'colours')}.`
      : `${count(regions, 'region', 'regions')} found, no colours yet: every one starts as the base coat.`,

  noRegions: 'No regions were found in this drawing.',

  /** Not swallowed: without the chunk the colours cannot be shown at all. A11Y. */
  engineFailed:
    'The colour engine could not be loaded, so the regions cannot be shown. Reload the page and try again.',

  // ── The regions table ──────────────────────────────────────────────────
  regionsCaption: 'Regions in this drawing',
  colRegion: 'Region',
  colColour: 'Colour',
  colPlate: 'Plate',
  /** The column head; the caption above it says "of this drawing". */
  colShare: 'Share',
  /** The select's name: the row header is visible, the select needs its own. */
  colourFor: (name) => `Colour for ${name}`,
  unpainted: 'Unpainted',
  /** The plate cell for a region no plate cuts. */
  notCut: 'Not cut',
  /** Under one percent of the drawing. */
  shareUnderOne: 'under 1%',

  /** After a colour is chosen for a region. A11Y (two shapes). */
  regionSet: (name, colour, plate) =>
    `${name} set to ${colour}. Plate ${plate}.`,
  regionSetUnpainted: (name) => `${name} set to unpainted. No plate cuts it.`,

  // ── The colours section ────────────────────────────────────────────────
  /** How many regions a swatch is on (two shapes). */
  usedBy: (n) => `used by ${count(n, 'region', 'regions')}`,
  addColourLegend: 'Add a colour',
  addColourName: 'Name',
  addColourHex: 'Colour',
  addColourButton: 'Add colour',
  /** After a colour joins the palette. A11Y. */
  colourAdded: (name) => `${name} added. Choose it for a region.`,

  // ── The plates section ─────────────────────────────────────────────────
  /** Plate 1 of a line drawing: the outline the base coat goes through. */
  plateGround: (k, colour) => `Plate ${k}, ${colour}: the whole outline.`,
  /** Every other plate (two shapes for the count, two for the loose pieces). */
  plateLine: (k, colour, regions, islands) =>
    `Plate ${k}, ${colour}: ${count(regions, 'region', 'regions')}` +
    (islands > 0 ? `, ${count(islands, 'loose piece', 'loose pieces')}.` : '.'),
});
