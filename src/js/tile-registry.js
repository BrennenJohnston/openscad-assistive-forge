/**
 * The tile registry: what Forge ships on its welcome screen, as data.
 *
 * Adding an example used to mean editing several places that had no way of
 * knowing about each other, and they drifted: `logo-plate`'s own
 * `manifest.json` declared `sample-logo.svg`, the file sat on disk, and the
 * loader never fetched it because the loader reads THIS list. The first
 * preview errored with "Can't open file '/tmp/sample-logo.svg'" while the
 * status line said "Preview ready" (D-97). Two sources of truth, one of them
 * silently ignored.
 *
 * THE DECISION, recorded so it can be reversed: this module is the single
 * source of truth AT RUNTIME. A per-example `manifest.json` remains the
 * authoring surface - it is what a contributor writes and what IR-8's
 * validator reads - but nothing loads from it directly. The validator's job is
 * to prove the two agree, which turns a silent drift into a failing check.
 * Reversal: make the loader read `manifest.json` and derive this at build time.
 *
 * WHAT IS DELIBERATELY NOT HERE: the welcome cards' markup. See the IR-7
 * release record - those four cards are bespoke editorial content (attribution
 * links with screen-reader spans, per-card disclosure lists, a tutorial video
 * link, variant selects), not repeatable tiles, and templating them could not
 * meet this release's own no-visible-change bar.
 *
 * @license GPL-3.0-or-later
 */

const EXAMPLES = {
  'simple-box': {
    path: '/examples/simple-box/simple_box.scad',
    name: 'simple_box.scad',
  },
  cylinder: {
    path: '/examples/parametric-cylinder/parametric_cylinder.scad',
    name: 'parametric_cylinder.scad',
  },
  'library-test': {
    path: '/examples/library-test/library_test.scad',
    name: 'library_test.scad',
  },
  'colored-box': {
    path: '/examples/colored-box/colored_box.scad',
    name: 'colored_box.scad',
  },
  'multi-file-box': {
    path: '/examples/multi-file-box.zip',
    name: 'multi-file-box.zip',
  },
  'cable-organizer': {
    path: '/examples/cable-organizer/cable_organizer.scad',
    name: 'cable_organizer.scad',
  },
  'honeycomb-grid': {
    path: '/examples/honeycomb-grid/honeycomb_grid.scad',
    name: 'honeycomb_grid.scad',
  },
  'logo-plate': {
    path: '/examples/logo-plate/logo_plate.scad',
    name: 'logo_plate.scad',
    description: 'Logo Plate (SVG Import)',
    manifest: '/examples/logo-plate/manifest.json',
    // D-97: the example's own manifest.json has always declared this file and
    // the file has always been on disk, but the loader reads THIS list - so
    // the first preview errored with "Can't open file '/tmp/sample-logo.svg'"
    // while the status said "Preview ready".
    additionalFiles: [
      '/examples/logo-plate/sample-logo.svg',
      // DP-9. The shared gallery set, copied into this tile rather than
      // borrowed from another: a tile that reaches into a sibling's folder
      // breaks the moment that sibling is renamed or dropped.
      '/examples/logo-plate/smiley.svg',
      '/examples/logo-plate/heart.svg',
      '/examples/logo-plate/star.svg',
      '/examples/logo-plate/lightning.svg',
      '/examples/logo-plate/crown.svg',
      '/examples/logo-plate/sun.svg',
      '/examples/logo-plate/presets/large-plate.json',
      '/examples/logo-plate/presets/small-plate.json',
    ],
  },
  'nasif-charm-maker': {
    path: '/examples/nasif-charm-maker/nasif_charm_maker.scad',
    name: 'nasif_charm_maker.scad',
    description: 'Charm Customizer',
    manifest: '/examples/nasif-charm-maker/manifest.json',
    additionalFiles: [
      // DP-9. The default design, BESIDE the .scad, so desktop OpenSCAD can
      // open it: import("heart.svg") looked in the model's own folder and the
      // only copy lived in svg-library/. Desktop printed
      // "ERROR: Can't open file ... heart.svg" and then rendered a blank
      // charm anyway, reporting Status: NoError and writing an STL.
      '/examples/nasif-charm-maker/heart.svg',
      '/examples/nasif-charm-maker/presets/large-pendant.json',
      '/examples/nasif-charm-maker/presets/small-pendant.json',
      '/examples/nasif-charm-maker/svg-library/heart.svg',
      '/examples/nasif-charm-maker/svg-library/star.svg',
      '/examples/nasif-charm-maker/svg-library/paw.svg',
      '/examples/nasif-charm-maker/svg-library/lightning.svg',
      '/examples/nasif-charm-maker/svg-library/music-note.svg',
      '/examples/nasif-charm-maker/svg-library/smiley.svg',
      '/examples/nasif-charm-maker/svg-library/moon.svg',
      '/examples/nasif-charm-maker/svg-library/flower.svg',
      '/examples/nasif-charm-maker/svg-library/diamond.svg',
      '/examples/nasif-charm-maker/svg-library/crown.svg',
      '/examples/nasif-charm-maker/svg-library/leaf.svg',
      '/examples/nasif-charm-maker/svg-library/sun.svg',
    ],
  },
  'braille-wedge-card': {
    path: '/examples/braille-wedge-card/braille_wedge_card.scad',
    name: 'braille_wedge_card.scad',
    description: 'Braille Card Customizer',
    manifest: '/examples/braille-wedge-card/manifest.json',
  },
  'braille-charm': {
    path: '/examples/braille-charm/braille_charm.scad',
    name: 'braille_charm.scad',
    description: 'Braille Charm',
    manifest: '/examples/braille-charm/manifest.json',
    additionalFiles: [
      '/examples/braille-charm/presets/large-charm.json',
      '/examples/braille-charm/presets/small-charm.json',
    ],
  },
  'braille-sign': {
    path: '/examples/braille-sign/braille_sign.scad',
    name: 'braille_sign.scad',
    description: 'Braille Sign',
    manifest: '/examples/braille-sign/manifest.json',
  },
  'stencil-maker': {
    path: '/examples/stencil-maker/stencil_maker.scad',
    name: 'stencil_maker.scad',
    description: 'Stencil Maker',
    manifest: '/examples/stencil-maker/manifest.json',
    additionalFiles: [
      '/examples/stencil-maker/sample-design.svg',
      // DP-14. The gallery is this project's own work now: the ring, which
      // demonstrates a support bar holding an enclosed centre, and the Forge
      // logo. The six charm icons that used to sit here were copies of another
      // tile's library and had nothing to do with stencils.
      '/examples/stencil-maker/forge-logo.svg',
    ],
  },
  'q-charm': {
    path: '/examples/q-charm/q_charm.scad',
    name: 'q_charm.scad',
    description: 'Bracelet Clip Charm',
    manifest: '/examples/q-charm/manifest.json',
    additionalFiles: [
      '/examples/q-charm/q_Charm_L.dxf',
      '/examples/q-charm/presets/large-charm.json',
      '/examples/q-charm/presets/small-charm.json',
      // DP-8. Example passes for the layered mode, so desktop OpenSCAD has
      // something to point the layer parameters at. The parameters themselves
      // default to empty: the tiered mode is off until someone fills one in.
      '/examples/q-charm/design_layer_1.svg',
      '/examples/q-charm/design_layer_2.svg',
      '/examples/q-charm/design_layer_3.svg',
      // D-106, closed in DP-14. This list used to reach into
      // nasif-charm-maker/svg-library/ for twelve files while q-charm's own
      // manifest declared six by bare name. Both lists produced `smiley.svg`
      // in the WASM filesystem, so the gallery worked and the disagreement
      // stayed invisible - until you rename or drop the sibling. The six
      // copies have been in this tile's folder since D-109; these are they,
      // and manifest and registry now name the same files. The other six the
      // borrowed list carried (paw, music-note, moon, flower, diamond, leaf)
      // were never in q-charm's gallery and are gone with it.
      '/examples/q-charm/smiley.svg',
      '/examples/q-charm/heart.svg',
      '/examples/q-charm/star.svg',
      '/examples/q-charm/lightning.svg',
      '/examples/q-charm/crown.svg',
      '/examples/q-charm/sun.svg',
    ],
  },
};

// ---------------------------------------------------------------------------
// Program definitions — group related examples under a single umbrella
// ---------------------------------------------------------------------------

const PROGRAMS = {
  'charm-customizer': {
    label: 'Charm Customizer',
    examples: ['nasif-charm-maker', 'q-charm', 'logo-plate'],
  },
  'braille-card-customizer': {
    label: 'Braille Card Customizer',
    examples: ['braille-wedge-card', 'braille-charm', 'braille-sign'],
  },
  'stencil-maker': {
    label: 'Stencil Maker',
    examples: ['stencil-maker'],
  },
};

/**
 * The examples, in the shape the file handler has always consumed.
 * @returns {Object}
 */
export function exampleDefinitions() {
  return EXAMPLES;
}

/**
 * The programs, in the shape the file handler has always consumed.
 * @returns {Object}
 */
export function programDefinitions() {
  return PROGRAMS;
}

/**
 * Every file an example needs beyond its main .scad, as bare names.
 *
 * This is what lets a validator ask the question that would have caught D-97:
 * does the example's own manifest.json declare anything this list does not
 * carry? Paths are stripped because a manifest names files, not URLs.
 *
 * @param {string} key - Example key
 * @returns {string[]}
 */
export function companionFileNames(key) {
  const entry = EXAMPLES[key];
  if (!entry || !entry.additionalFiles) return [];
  return entry.additionalFiles.map((path) => path.split('/').pop());
}

/**
 * The main file's own bare name, for the same comparison.
 * @param {string} key
 * @returns {string|null}
 */
export function mainFileName(key) {
  const entry = EXAMPLES[key];
  return entry ? entry.path.split('/').pop() : null;
}

/**
 * Which program an example belongs to, if any.
 * @param {string} key
 * @returns {string|null}
 */
export function programForExample(key) {
  for (const [programKey, program] of Object.entries(PROGRAMS)) {
    if (program.examples.includes(key)) return programKey;
  }
  return null;
}

export { EXAMPLES, PROGRAMS };
