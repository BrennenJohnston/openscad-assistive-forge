/**
 * The Tactile Map Designer's map types: the purpose a person chooses first,
 * each with its own numbered steps. BANA's tactile graphics guidelines (2022,
 * Unit 8) separate the orientation map, an area learned before going there,
 * from the orientation and mobility route map, a travel route planned before
 * walking it; the third type is a map made from a drawing a person already
 * has, a floor plan or a station drawing.
 *
 * Data only: the panel builds the chooser and the steps from it. No DOM here.
 *
 * @license GPL-3.0-or-later
 */

export const MAP_TYPES = Object.freeze([
  Object.freeze({
    key: 'place',
    name: 'A place map',
    sentence:
      'The ground around one address, to learn an area before you go: a block, a campus, the streets around a stop.',
    steps: Object.freeze([
      'Where',
      'How much ground',
      'What to show',
      'Make the map',
      'Check and print',
    ]),
  }),
  Object.freeze({
    key: 'route',
    name: 'A route map',
    sentence:
      'From one place to another, on foot or by bus and train, with the turns, crossings and steps on the way.',
    steps: Object.freeze([
      'From and To',
      // Walking only, until the bus and train choice joins this step.
      'How you walk',
      'What to show',
      'Make the map',
      'Check and print',
    ]),
  }),
  Object.freeze({
    key: 'drawing',
    name: 'A map from your drawing',
    sentence:
      'A floor plan, a station drawing, a DXF or a traced photo you already have, with your own classes.',
    steps: Object.freeze([
      'Choose the drawing',
      "The drawing's real width",
      'Class the shapes',
      'Apply classes',
      'Check and print',
    ]),
  }),
]);

export const MAP_TYPE_QUESTION = 'What map do you want to make?';

/** The words of the chooser and of the steps' needs and notes. */
export const WORKFLOW_STRINGS = Object.freeze({
  /** A11Y: the chooser's group name (the heading above asks the question). */
  chooserLegend: 'Map type',
  /** A11Y: beside Next while no type is chosen. */
  chooserReason: 'Choose a map type first.',
  /** A11Y: beside Next on the first step of a place map. */
  needPlace: 'Pick a place first.',
  /** A11Y: beside Next on the first step of a route map. */
  needBoth: 'Pick both places first.',
  /** A11Y: beside Next on the Make the map step. */
  needMap: 'Make the map first.',
  /** The drawing workflow's first step, until the file control joins it. */
  drawingChoose:
    'The sample station drawing is loaded. To use your own, choose it with the Map file control below the steps: an SVG, a DXF, or a photo to trace.',
  /** The drawing workflow's fourth step. */
  drawingApply:
    'Press Apply classes in the editor. The plates in the next step follow what you applied.',
});

/** @returns {object|null} the type with this key */
export function mapType(key) {
  return MAP_TYPES.find((t) => t.key === key) || null;
}

/**
 * The type a link asks for: `?example=tactile-map&type=route`.
 *
 * @param {string} search - a URL's search part
 * @returns {string|null} a known type's key, else null
 */
export function typeFromUrl(search) {
  const value = new URLSearchParams(search || '').get('type');
  return mapType(value) ? value : null;
}
