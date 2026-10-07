/**
 * The tile registry: what Forge ships on its welcome screen, as data.
 *
 * Several places that cannot know about each other drift: an example's
 * own `manifest.json` can declare a file that sits on disk and still never
 * be fetched, because the loader reads this list, so the first preview
 * errors with "Can't open file ..." while the status line says "Preview
 * ready".
 *
 * The decision, stated so it can be reversed: this module is the single
 * source of truth at runtime. A per-example `manifest.json` remains the
 * authoring surface (it is what a contributor writes and what
 * scripts/validate-example.mjs reads), but nothing loads from it directly.
 * The validator's job is to prove the two agree, which turns a silent
 * drift into a failing check. Reversal: make the loader read
 * `manifest.json` and derive this at build time.
 *
 * Deliberately not here: the welcome cards' markup. Those four cards are
 * bespoke editorial content (attribution links with screen-reader spans,
 * per-card disclosure lists, a tutorial video link, variant selects), not
 * repeatable tiles.
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
    // The example's own manifest.json declares this file, but the loader
    // reads this list: without the entry, the first preview would error with
    // "Can't open file '/tmp/sample-logo.svg'".
    additionalFiles: [
      '/examples/logo-plate/sample-logo.svg',
      // The shared gallery set, copied into this tile rather than
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
      // Example passes for the layered mode, as q-charm carries, so
      // desktop OpenSCAD has something to point the layer parameters at. The
      // parameters default to empty: the stack is off until someone fills
      // one in.
      '/examples/logo-plate/logo_layer_1.svg',
      '/examples/logo-plate/logo_layer_2.svg',
      '/examples/logo-plate/logo_layer_3.svg',
    ],
  },
  'nasif-charm-maker': {
    path: '/examples/nasif-charm-maker/nasif_charm_maker.scad',
    name: 'nasif_charm_maker.scad',
    description: 'Charm Designer',
    manifest: '/examples/nasif-charm-maker/manifest.json',
    additionalFiles: [
      // The default design, beside the .scad, so desktop OpenSCAD can open
      // it: import("heart.svg") looks in the model's own folder, and without
      // this copy desktop would print "ERROR: Can't open file ... heart.svg"
      // and then render a blank charm anyway, reporting Status: NoError.
      '/examples/nasif-charm-maker/heart.svg',
      '/examples/nasif-charm-maker/presets/large-pendant.json',
      '/examples/nasif-charm-maker/presets/small-pendant.json',
      // Example passes for the layered mode, as q-charm carries, so
      // desktop OpenSCAD has something to point the layer parameters at. The
      // parameters default to empty: the stack is off until someone fills
      // one in.
      '/examples/nasif-charm-maker/design_layer_1.svg',
      '/examples/nasif-charm-maker/design_layer_2.svg',
      '/examples/nasif-charm-maker/design_layer_3.svg',
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
    description: 'Braille Card Designer',
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
  'q-charm': {
    path: '/examples/q-charm/q_charm.scad',
    name: 'q_charm.scad',
    description: 'Bracelet Clip Charm',
    manifest: '/examples/q-charm/manifest.json',
    additionalFiles: [
      '/examples/q-charm/q_Charm_L.dxf',
      '/examples/q-charm/presets/large-charm.json',
      '/examples/q-charm/presets/small-charm.json',
      // Example passes for the layered mode, so desktop OpenSCAD has
      // something to point the layer parameters at. The parameters themselves
      // default to empty: the tiered mode is off until someone fills one in.
      '/examples/q-charm/design_layer_1.svg',
      '/examples/q-charm/design_layer_2.svg',
      '/examples/q-charm/design_layer_3.svg',
      // The six gallery files in this tile's own folder, the same files its
      // manifest names: a list that reaches into a sibling's folder breaks the
      // moment that sibling is renamed or dropped.
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
    label: 'Charm Designer',
    examples: ['nasif-charm-maker', 'q-charm', 'logo-plate'],
  },
  'braille-card-customizer': {
    label: 'Braille Card Designer',
    examples: ['braille-wedge-card', 'braille-charm', 'braille-sign'],
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
 * This is what lets a validator ask the question that catches this drift:
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
