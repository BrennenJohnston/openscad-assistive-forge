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
    additionalFiles: ['/examples/logo-plate/sample-logo.svg'],
  },
  'nasif-charm-maker': {
    path: '/examples/nasif-charm-maker/nasif_charm_maker.scad',
    name: 'nasif_charm_maker.scad',
    description: 'Charm Customizer',
    manifest: '/examples/nasif-charm-maker/manifest.json',
    additionalFiles: [
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
      '/examples/stencil-maker/smiley.svg',
      '/examples/stencil-maker/heart.svg',
      '/examples/stencil-maker/star.svg',
      '/examples/stencil-maker/lightning.svg',
      '/examples/stencil-maker/crown.svg',
      '/examples/stencil-maker/sun.svg',
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
      '/examples/nasif-charm-maker/svg-library/smiley.svg',
      '/examples/nasif-charm-maker/svg-library/heart.svg',
      '/examples/nasif-charm-maker/svg-library/star.svg',
      '/examples/nasif-charm-maker/svg-library/paw.svg',
      '/examples/nasif-charm-maker/svg-library/lightning.svg',
      '/examples/nasif-charm-maker/svg-library/music-note.svg',
      '/examples/nasif-charm-maker/svg-library/moon.svg',
      '/examples/nasif-charm-maker/svg-library/flower.svg',
      '/examples/nasif-charm-maker/svg-library/diamond.svg',
      '/examples/nasif-charm-maker/svg-library/crown.svg',
      '/examples/nasif-charm-maker/svg-library/leaf.svg',
      '/examples/nasif-charm-maker/svg-library/sun.svg',
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
