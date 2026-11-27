/**
 * My SeaTac station symbols as a symbol set: the stairs and elevators of the
 * tactile key I made for the SeaTac station, at the sizes I printed them,
 * with the station symbols every set shares (station-symbols.js). The other
 * classes keep the basic shapes, drawn at the key's 16 mm frame.
 *
 * Each symbol is filled path data in the library's unit box (0 to 1, y
 * down) at its own size (`sizeMm`), traced from the key's drawing: the
 * zigzag from its eight corner points on a 1.209 mm line, mitred; the
 * triangles from their outer and inner corners.
 *
 * The stairs and elevators are the basic shapes' forms at these sizes
 * (`basicForm`), so the key words them as it words the basic ones. Which
 * map class takes which symbol is `classSymbols`; null keeps the basic
 * shape.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { STATION_SYMBOLS } from './station-symbols.js';

const SYMBOLS = [
  {
    key: 'stairs',
    name: 'Stairs',
    pathData:
      'M 0.0501 0.3844 L 0.1776 0.5119 L 0.3051 0.3844 L 0.4362 0.5155 L 0.5673 0.3844 L 0.6949 0.5119 L 0.8224 0.3844 L 1 0.562 L 0.9499 0.6121 L 0.8224 0.4846 L 0.6949 0.6121 L 0.5673 0.4846 L 0.4362 0.6156 L 0.3051 0.4846 L 0.1776 0.6121 L 0 0.4344 Z',
    sizeMm: 17.069,
    minSizeMm: 17.069,
    basicForm: true,
    source:
      'A zigzag 17.1 by 3.9 mm on a 1.2 mm line with sharp corners, as on my tactile key for the SeaTac station',
  },
  {
    key: 'elevator-up',
    name: 'Elevator up',
    pathData:
      'M 0.5 0.067 L 0 0.933 L 1 0.933 Z M 0.207 0.8135 L 0.5 0.3059 L 0.7931 0.8135 Z',
    sizeMm: 18.414,
    minSizeMm: 18.414,
    basicForm: true,
    source:
      'An outlined triangle 18.4 mm a side, its outline 2.2 mm, point up, as on my SeaTac key',
  },
  {
    key: 'elevator-down',
    name: 'Elevator down',
    pathData:
      'M 1 0.067 L 0 0.067 L 0.5 0.933 Z M 0.207 0.1865 L 0.7931 0.1865 L 0.5 0.6941 Z',
    sizeMm: 18.414,
    minSizeMm: 18.414,
    basicForm: true,
    source:
      'An outlined triangle 18.4 mm a side, its outline 2.2 mm, point down, as on my SeaTac key',
  },
  ...STATION_SYMBOLS,
];

export const SEATAC_STATION = Object.freeze({
  key: 'seatac-station',
  name: 'SeaTac station symbols',
  symbolSizeMm: 16,
  symbols: SYMBOLS,
  classSymbols: {
    turnstile: 'turnstile',
    stairs: 'stairs',
    escalator: 'escalator',
    'elevator-up': 'elevator-up',
    'elevator-down': 'elevator-down',
    'ticket-machine': 'ticket-machine',
    entrance: null,
    crossing: null,
    furniture: null,
    landmark: null,
    destination: null,
    'you-are-here': null,
    'transit-stop': null,
    'curb-ramp': null,
    'raised-curb': null,
  },
});
