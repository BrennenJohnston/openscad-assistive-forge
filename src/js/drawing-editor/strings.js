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

export const EDITOR_STRINGS = Object.freeze({
  /** The surface's own name, and the first thing focus lands on. */
  title: 'Drawing editor',

  /** The toolbar's accessible name. Icons alone would need a label anyway. */
  toolbarLabel: 'Drawing editor tools',

  apply: 'Apply',
  keepOriginal: 'Keep original',
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

  opened: 'Drawing editor open. The model preview is behind it.',

  /**
   * ★ D-124. A drawing with no colours in it used to skip the editor
   * entirely, because for a charm there is nothing to decide - OpenSCAD fills
   * every shape it is given. For a stencil the whole task is deciding what
   * each region gets, so the editor opens, and it opens saying what it found
   * rather than pretending the drawing arrived with a plan.
   */
  noColoursYet:
    'This drawing has no colours of its own, so every region starts as the base coat. Paint the ones you want a different colour.',
});
