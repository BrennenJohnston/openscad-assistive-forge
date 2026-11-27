/**
 * The station symbols of my SeaTac key: a turnstile, an escalator and a
 * ticket machine. Every set draws them in these forms at these sizes
 * (`sizeMm`), the sizes I printed and felt, since a station's parts read
 * the same whatever set a map takes. The basic shapes and the SeaTac
 * station set both list them from here.
 *
 * Each symbol is filled path data in the library's unit box (0 to 1, x
 * right, y down), traced from the key's drawing.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

export const STATION_SYMBOLS = Object.freeze([
  {
    key: 'turnstile',
    name: 'Turnstile',
    pathData: 'M 0.25 0 L 0.75 0 L 0.75 1 L 0.25 1 Z',
    sizeMm: 4,
    minSizeMm: 4,
    source:
      'A bar 2 by 4 mm, one for each gate, from my SeaTac key; I printed and felt a row of four, 4 mm apart',
  },
  {
    key: 'escalator',
    name: 'Escalator',
    // Pointing right: the levels builder turns it the way a drawing points it.
    pathData:
      'M 0.2255 0.5 L 0 0.2745 L 0.0461 0.2284 L 0.3178 0.5 L 0.0461 0.7716 L 0 0.7255 Z M 0.5666 0.5 L 0.3411 0.2745 L 0.3872 0.2284 L 0.6589 0.5 L 0.3872 0.7716 L 0.3411 0.7255 Z M 0.9077 0.5 L 0.6822 0.2745 L 0.7284 0.2284 L 1 0.5 L 0.7284 0.7716 L 0.6822 0.7255 Z',
    sizeMm: 18.469,
    minSizeMm: 18.469,
    source:
      'Three chevrons with sharp tips, 18.5 by 10 mm on a 1.2 mm line, 6.3 mm apart, from my SeaTac key',
  },
  {
    key: 'ticket-machine',
    name: 'Ticket machine',
    pathData:
      'M 0.0277 0 L 0.9723 0 L 1 0.0277 L 1 0.9723 L 0.9723 1 L 0.0277 1 L 0 0.9723 L 0 0.0277 Z M 0.0952 0.0635 L 0.0635 0.0952 L 0.0635 0.9048 L 0.0952 0.9365 L 0.9048 0.9365 L 0.9365 0.9048 L 0.9365 0.0952 L 0.9048 0.0635 Z M 0.3 0.2726 L 0.7 0.2726 L 0.7 0.3392 L 0.5333 0.3392 L 0.5333 0.7644 L 0.4667 0.7644 L 0.4667 0.3392 L 0.3 0.3392 Z',
    sizeMm: 15.75,
    minSizeMm: 15.75,
    source:
      'An outlined square 15.75 mm holding a T, from my SeaTac key: the frame 1.0 mm and the T 1.05 mm, as I printed and felt them',
  },
]);
