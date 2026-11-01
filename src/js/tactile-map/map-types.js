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
      'On foot or by bus and train',
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
