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

/** "first", "second" ... for a place in the paint order. */
export const ordinal = (n) => {
  const words = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
  ];
  return words[n - 1] || `${n}th`;
};

export const EDITOR_STRINGS = Object.freeze({
  /** The surface's own name, and the first thing focus lands on. */
  title: 'Drawing editor',

  close: 'Close',

  /**
   * The two links that make a long list escapable. A person who tabs into the
   * editor should never have to walk the whole list to reach the toolbar
   * again, and a person reading the toolbar should be able to jump to the
   * list without walking the toolbar.
   *
   * Two words for one link, picked by purpose like the section name above it:
   * the stencil lane cuts and paints regions, and the charm's panel says
   * Shapes. A11Y - the link is spoken, and it named a section that is not
   * called that any more.
   *
   * STRINGS: owner review pending.
   */
  skipToRegions: 'Skip to the regions table',
  skipToShapes: 'Skip to the shapes list',
  backToToolbar: 'Back to the toolbar',

  /**
   * The side panel is a drawer over the drawing now (G0: the picture is the
   * editor). The toggle carries the state in aria-expanded; no announcement,
   * because the pressed control already says which way it went.
   */
  panelToggle: 'Regions',

  /**
   * DP-46: the toolbar's overflow. Three controls a person reaches for now
   * and then - Compare with original, Show roles, Design width - live behind
   * it so the working row holds its actions on one line at the editor's real
   * width (692 px at a 1280 window with the customizer open). A11Y: the
   * button carries aria-expanded and aria-controls, and the panel it opens
   * sits in the flow under the row rather than over the drawing.
   */
  moreTools: 'More',
  moreToolsLabel: 'More editor tools',

  /**
   * DP-38: the two-state switch between the drawing and the thing it makes.
   *
   * A real radio group, not a button that toggles: there are two named
   * choices and only one can be true, which is what a radio group IS. The
   * legend is the question and the labels are the answers, so a screen
   * reader says "View, Drawing, radio button, 1 of 2" without any ARIA
   * standing in for markup that already exists.
   *
   * It appears only when there is a model behind the editor. Through the
   * standalone door there is no charm to show, and a control offering a view
   * that cannot exist is worse than no control.
   *
   * STRINGS: owner review pending.
   */
  viewLegend: 'View',
  viewDrawing: 'Drawing',
  viewCharm: 'Charm',
  viewShowingDrawing: 'Showing the drawing.',
  viewShowingCharm: 'Showing the charm.',

  /**
   * DP-38 P2. Said once, in the editor, because the person will SEE the
   * difference and should not have to wonder whether their model changed.
   * A11Y.
   */
  draftNote: 'Previews are drawn at draft quality while you edit.',

  sectionColours: 'Colors',
  sectionRegions: 'Regions',
  /**
   * DP-Q40 (signed): "Shapes" is the word on the CHARM's panel.
   *
   * A region is a thing the stencil lane cuts and paints, and that lane keeps
   * the word. What somebody is looking at on a charm is a shape, and it is
   * already the word the rows and the counts use ("7 shapes", "Shape 1"), so
   * the heading was the odd one out.
   *
   * STRINGS: owner review pending.
   */
  sectionShapes: 'Shapes',
  panelToggleShapes: 'Shapes',
  sectionPlates: 'Plates and paint order',
  sectionWarnings: 'Warnings',

  /**
   * Said once when the surface takes the preview area. A11Y. On the stencil
   * purpose the engine's own finding follows it in the same breath (★ D-124:
   * "21 regions found, no colors yet: every one starts as the base coat."),
   * so a drawing that arrived with no plan is never pretended to have one.
   */
  opened: 'Drawing editor open. The model preview is behind it.',

  /** The status line while the color engine is on its way. A11Y. */
  findingRegions: 'Finding the regions in this drawing.',

  /** What the engine found, said once with the opening. A11Y (two shapes). */
  regionsFound: (regions, colours) =>
    colours > 1
      ? `${count(regions, 'region', 'regions')} found, in ${count(colours, 'color', 'colors')}.`
      : `${count(regions, 'region', 'regions')} found, no colors yet: every one starts as the base coat.`,

  noRegions: 'No regions were found in this drawing.',

  /** Not swallowed: without the chunk the colors cannot be shown at all. A11Y. */
  engineFailed:
    'The color engine could not be loaded, so the regions cannot be shown. Reload the page and try again.',

  // ── The toolbar (DP-20) ────────────────────────────────────────────────
  /** The five tools, with the key that picks each in the accessible name. */
  tools: Object.freeze({
    select: 'Select',
    marquee: 'Marquee',
    paint: 'Paint',
    remove: 'Remove',
    hand: 'Hand',
  }),
  /** The tool group's name and the key hint read to a screen reader. A11Y. */
  toolsLabel: 'Tools',
  toolKeyHint: (name, key) => `${name}, key ${key.toUpperCase()}`,
  toolChosen: (name) => `${name} tool.`,
  /** The current color for the Paint tool. A11Y. */
  paintColourLabel: 'Paint with',
  /**
   * REVISED at DP-24 from "Colour the selection" (sic): same act, the Paint
   * tool's own verb, and the hands row fits the editor's real 692 px at a
   * 1280 window with room instead of teetering at one pixel.
   */
  paintSelection: 'Paint selection',
  undo: 'Undo',
  redo: 'Redo',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  /** The stencil purpose's Apply: the plan goes with the drawing. */
  applyColours: 'Apply colors',
  /** What is undone or redone. A11Y. */
  undone: (label) => `Undone: ${label}.`,
  redone: (label) => `Redone: ${label}.`,
  nothingToUndo: 'Nothing to undo.',
  nothingToRedo: 'Nothing to redo.',

  // ── The canvas ─────────────────────────────────────────────────────────
  /** The canvas's own name and its keyboard help. A11Y. */
  canvasLabel: 'The drawing',
  canvasHelp:
    'Arrow keys move between regions, Enter or Space adds one to the selection, number keys 1 to 8 color the selection, 0 sets it to the base coat, Delete removes it.',
  /** The status line as the highlight moves. A11Y (two shapes). */
  highlighting: (name, colour, plate) => `${name}, ${colour}, plate ${plate}.`,
  highlightingRemoved: (name) => `${name}, removed.`,

  // ── The regions table ──────────────────────────────────────────────────
  regionsCaption: 'Regions in this drawing',
  colRegion: 'Region',
  colColour: 'Color',
  colPlate: 'Plate',
  /** The column head; the caption above it says "of this drawing". */
  colShare: 'Share',
  colActions: 'Remove',
  /** The select's name: the row header is visible, the select needs its own. */
  colourFor: (name) => `Color for ${name}`,
  unpainted: 'Unpainted',
  /** The plate cell for a region no plate cuts. */
  notCut: 'Not cut',
  /** The plate cell for a region taken out of the design. */
  removedCell: 'Removed',
  /** Under one percent of the drawing. */
  shareUnderOne: 'under 1%',
  removeRegion: (name) => `Remove ${name}`,
  restoreRegion: (name) => `Put back ${name}`,
  putBack: 'Put back',
  undoBesideTable: 'Undo',

  /** After a color is chosen for a region. A11Y (two shapes). */
  regionSet: (name, colour, plate) =>
    `${name} set to ${colour}. Plate ${plate}.`,
  regionSetUnpainted: (name) => `${name} set to unpainted. No plate cuts it.`,
  /** After a color is given to a selection. A11Y (two shapes). */
  regionsSet: (n, colour, plate) =>
    `${count(n, 'region', 'regions')} set to ${colour}. Plate ${plate}.`,
  regionsSetUnpainted: (n) =>
    `${count(n, 'region', 'regions')} set to unpainted. No plate cuts them.`,
  regionRemoved: (name) => `${name} removed.`,
  regionsRemoved: (n) => `${count(n, 'region', 'regions')} removed.`,
  regionRestored: (name) => `${name} put back.`,
  /** The selection, as the canvas changes it. A11Y (two shapes). */
  selected: (n) => `${count(n, 'region', 'regions')} selected.`,
  selectionCleared: 'Selection cleared.',
  nothingSelected: 'Nothing is selected. Tick a region first.',
  /** Command labels, heard again on undo. */
  labelSetColour: (name, colour) => `${name} set to ${colour}`,
  labelSetColours: (n, colour) =>
    `${count(n, 'region', 'regions')} set to ${colour}`,
  labelRemove: (name) => `${name} removed`,
  labelRemoveMany: (n) => `${count(n, 'region', 'regions')} removed`,
  labelRestore: (name) => `${name} put back`,

  // ── The colors section ────────────────────────────────────────────────
  /** How many regions a swatch is on (two shapes). */
  usedBy: (n) => `used by ${count(n, 'region', 'regions')}`,
  addColourLegend: 'Add a color',
  addColourName: 'Name',
  addColourHex: 'Color',
  addColourButton: 'Add color',
  /** After a color joins the palette. A11Y. */
  colourAdded: (name) => `${name} added. Choose it for a region.`,
  labelAddColour: (name) => `${name} added`,
  rename: 'Rename',
  renameLabel: (name) => `New name for ${name}`,
  colourRenamed: (from, to) => `${from} is now called ${to}.`,
  labelRename: (from, to) => `${from} renamed ${to}`,
  mergeInto: 'Merge into',
  colourMerged: (from, to, n) =>
    `${from} merged into ${to}: ${count(n, 'region', 'regions')} moved.`,
  labelMerge: (from, to) => `${from} merged into ${to}`,
  removeColour: 'Remove color',
  removeColourLabel: (name) => `Remove ${name}`,
  colourRemoved: (name, n, base) =>
    `${name} removed. ${count(n, 'region', 'regions')} back to ${base}.`,
  labelRemoveColour: (name) => `${name} removed`,
  /** The base coat cannot go: plate 1 is where it is sprayed. */
  baseStays: 'The base coat stays: plate 1 is the whole outline.',

  // ── The plates section ─────────────────────────────────────────────────
  /** Plate 1 of a line drawing: the outline the base coat goes through. */
  plateGround: (k, colour) => `Plate ${k}, ${colour}: the whole outline.`,
  /** Every other plate (two shapes for the count, two for the loose pieces). */
  plateLine: (k, colour, regions, islands) =>
    `Plate ${k}, ${colour}: ${count(regions, 'region', 'regions')}` +
    (islands > 0 ? `, ${count(islands, 'loose piece', 'loose pieces')}.` : '.'),
  paintEarlier: 'Paint earlier',
  paintLater: 'Paint later',
  orderFor: (name, verb) => `${verb}: ${name}`,
  /** After a color moves in the order. A11Y. */
  orderChanged: (name, position) => `${name} now paints ${ordinal(position)}.`,
  labelOrder: (name, position) => `${name} moved to ${ordinal(position)}`,
  /**
   * The plate rule, DP-Q18. On is the stacked rule: every later color is cut
   * through this plate too, so nothing can fall out. Off is the hand method.
   */
  ruleLabel: 'Later colors also cut through each plate',
  ruleHelp:
    'On, a piece painted later is held by every plate before it and cannot fall out. Off, each plate cuts its own color only, the way a hand-cut set does, and a loose piece is reported.',
  ruleStacked: 'Later colors cut through each plate.',
  ruleOwn: 'Each plate cuts its own color only.',

  // ── The view (DP-21) ───────────────────────────────────────────────────
  /** A pressed toggle: the untouched drawing alone, or the plan over it. */
  showOriginal: 'Show original',
  showingOriginal: 'Showing the original drawing.',
  showingPlan: 'Showing your edits.',
  /** The plate stepper: one plate's cut on the drawing, the rest dimmed. */
  stepperLabel: 'Plate',
  allPlates: 'All plates',
  plateOfN: (k, n, colour) => `Plate ${k} of ${n}, ${colour}`,
  prevPlate: 'Previous plate',
  nextPlate: 'Next plate',
  showingAllPlates: 'Showing all plates.',
  /** The legend under the drawing: what the tints mean. */
  legendLabel: 'What the colors on the drawing mean',
  legendPainted: 'Painted with its color',
  legendBase: 'Base coat',
  legendRemoved: 'Removed',
  legendUnpainted: 'Unpainted (the wall)',
  legendPlate: 'This plate cuts here',
  /** After a plate's largest few loose pieces, the rest, counted. */
  moreIslands: (plate, n) =>
    `And ${count(n, 'more loose piece', 'more loose pieces')} on plate ${plate}, all smaller.`,
  labelRule: (stacked) =>
    stacked
      ? 'plates set to cut later colors too'
      : 'plates set to their own color only',
});
