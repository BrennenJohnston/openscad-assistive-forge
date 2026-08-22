/**
 * @license GPL-3.0-or-later
 */
// Per-surface glyph vocabularies for the ASCII City Walk (CW-23).
//
// THIS FILE IS THE ART DIRECTION. It is data, not machinery: every row says
// which characters a given surface is allowed to be drawn with, and changing a
// row changes how that surface reads without touching any code.
//
// Why it exists: the converter picks a glyph by matching the SHAPE of a cell
// against the shape of each character, using brightness alone. That is why a
// stretch of pavement and the side of a tower can come out looking like the
// same material — nothing in the pipeline knew they were different things.
// city-class-pass.js now renders a second, tiny frame that says what each cell
// is looking at, and this table turns that into a voice: the road gets
// characters that lie down, walls get characters that stand up, foliage gets
// characters that clump.
//
// RULES FOR EDITING A ROW — both are correctness, not taste:
//
//   1. **Every vocabulary must contain the space character.** A cell that is
//      genuinely dark has to be allowed to stay empty. Drop the space and the
//      darkest cells are forced to draw the next-emptiest character instead,
//      and the black the whole picture is built on fills in with texture.
//   2. **Every vocabulary needs light, middle AND dense characters.** The
//      converter still uses brightness to choose WITHIN a row, so a row of
//      uniformly heavy characters flattens that surface into one tone and
//      loses the detail it is supposed to be gaining.
//
// Anything not listed here — and anything the class pass could not identify —
// falls back to all 95 printable characters, exactly as before CW-23.
//
// ASCII ONLY: these are subsets of the printable range 32-126. Block and
// shade characters would solve several of these rows in one stroke and are
// permanently out of scope (the stakeholder directive at _hfm-paint.js:13).

import { SURFACE_CLASS } from './city-class-pass.js';

/**
 * Surface class -> the characters that surface may be drawn with.
 *
 * Ordered light to dense within each row, which is only for reading the table:
 * the converter matches on shape and ignores the order.
 */
export const GLYPH_VOCABULARIES = {
  // Open ground away from the roadway: loose grit and stipple, nothing that
  // draws a line, so it reads as a surface rather than as markings.
  [SURFACE_CLASS.GROUND]: ' .`\',:;"~-_*',

  // The roadway. Characters that LIE DOWN, so perspective stacks them into
  // receding bands instead of a field of noise.
  [SURFACE_CLASS.ROAD]: ' .,_-~="\'`^',

  // Curb lines are thin and horizontal by definition.
  [SURFACE_CLASS.CURB]: " .'`_-=~",

  // Wall faces carry the window grid, so this row needs the widest tonal
  // range in the table: uprights and boxes from faint to solid.
  //
  // Deliberately no E, F, H or T. They sit in the middle of the density range
  // and would be useful weight, but their strong horizontal bars turn a
  // facade into venetian blinds — photographed at the 10% floor, where a wall
  // that should read as upright structure came out as banding. The mid-tones
  // are carried by letters with vertical stems instead.
  [SURFACE_CLASS.BUILDING_WALL]: " .:'!|ilI[]{}()JLbdhnuPRBM#%8&$@",

  // Roofs are seen edge-on from the street and flat from the map: lids.
  [SURFACE_CLASS.BUILDING_ROOF]: ' .-_=~+^"TL',

  // The lit glass band at street level: rounder and brighter than the wall
  // above it, which is what makes a shopfront read as a shopfront.
  [SURFACE_CLASS.STOREFRONT]: ' .:oO0Qq8DGB#%@$',

  // Sign faces are the brightest things on the street and mostly resolve to
  // reverse video (CW-21); what is left wants weight.
  [SURFACE_CLASS.SIGN]: ' .:=+*#%8&$@MW',

  // Masts and antennas are one or two cells wide: thin uprights only.
  [SURFACE_CLASS.MAST]: " .'!|ilItj1",

  // Foliage clumps rather than lines.
  [SURFACE_CLASS.TREE]: ' .,^*oO&%@8wvV',

  // A parked car is a small bright block with a cabin on it.
  [SURFACE_CLASS.CAR]: ' .-=ocnuD0O8#',

  // A pole with a bright head: uprights, plus the round characters the head
  // needs to be able to reach.
  [SURFACE_CLASS.LAMP]: " .'!|iltT1oO0",
};
