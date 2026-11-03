// Symbol sheet: a test print of one symbol set of the Tactile Map Designer.
// Every symbol of the set at the size a map draws it, its number in raised
// digits under it, on one plate; the console lists each number's name. The
// heights are the map's own (tactile_map.scad): the symbols stand where a
// map's symbol level stands, so the print feels like a map.
//
// The shapes come from symbol_sheet_data.scad, which
// scripts/build-symbol-sheet.mjs writes from the app's symbol sets.
//
// The University of Oregon set's shapes: Copyright (c) 2013, 2016
// University of Oregon; Brittell, Garcia, Lobben, Lawrence (GPL-3.0), after
// Lobben and Lawrence 2012.
//
// License: GPL-3.0-or-later
//          https://www.gnu.org/licenses/gpl-3.0.html

include <symbol_sheet_data.scad>

/* [Set] */
// Which set to print.
symbol_set = "University of Oregon symbols"; // [Forge basic shapes, University of Oregon symbols]

/* [Heights] */
// Thickness of the plate under the symbols (mm); printed whole, so 1.2 at the least.
base_thickness_mm = 1.2; // [1.2:0.1:3.0]
// Height of a map's first level step above the base (mm): 0.6, as on the map.
level_step_mm = 0.6; // [0.3:0.05:1.0]
// Extra height of the symbol level above its step (mm): 0.8, as on the map.
symbol_step_mm = 0.8; // [0.5:0.05:1.5]
// Height of the raised numbers' digits (mm): 8, as the key's letters.
number_height_mm = 8; // [6:0.1:50.8]
// How far the numbers rise above the plate (mm): 0.8 (ADA 703.2.1, 1/32 in).
number_raise_mm = 0.8; // [0.8:0.05:2]

/* [Hidden] */
$fn = 48;
_fuse = 0.01;
_min_wall = 1.2;

// Documented ranges, each from the source named beside it (the map's own).
BASE_RANGE_MM = [1.2, 3.0];            // printed whole: the project's thinnest wall, up to a stiff plate
LEVEL_STEP_RANGE_MM = [0.3, 1.0];      // tactile_map.scad: ISO 19028 0.3 to 1.5; Bris 2001 0.5 minimum
SYMBOL_STEP_RANGE_MM = [0.5, 1.5];     // tactile_map.scad
NUMBER_RANGE_MM = [6, 50.8];           // the key plate's raised letters
NUMBER_RAISE_MIN_MM = 0.8;             // ADA 703.2.1, 1/32 in

// text(size) sets the font's em box; a digit stands about a capital's height,
// 0.9555 of the size for Liberation Sans (measured on the Braille Sign).
LETTER_CAP_FACTOR = 0.9555;

function in_range(v, r) = v >= r[0] && v <= r[1];

assert(base_thickness_mm >= _min_wall, "base_thickness_mm below 1.2: the plate prints whole");
assert(in_range(base_thickness_mm, BASE_RANGE_MM), "base_thickness_mm outside 1.2 to 3.0");
assert(in_range(level_step_mm, LEVEL_STEP_RANGE_MM), "level_step_mm outside 0.3 to 1.0");
assert(in_range(symbol_step_mm, SYMBOL_STEP_RANGE_MM), "symbol_step_mm outside 0.5 to 1.5");
assert(in_range(number_height_mm, NUMBER_RANGE_MM), "number_height_mm outside 6 to 50.8");
assert(number_raise_mm >= NUMBER_RAISE_MIN_MM, "number_raise_mm below 0.8 (ADA 703.2.1)");

chosen = [for (s = SHEET_SETS) if (s[0] == symbol_set) s];
assert(len(chosen) == 1, str("No symbol set named ", symbol_set));
sheet = chosen[0];
cells = sheet[3];

for (c = cells) echo(str(c[0], ": ", c[1]));

symbol_top = level_step_mm + symbol_step_mm;

module symbol_sheet() {
  cube([sheet[1], sheet[2], base_thickness_mm]);
  for (c = cells) {
    translate([0, 0, base_thickness_mm - _fuse]) {
      linear_extrude(height = symbol_top + _fuse)
        polygon(points = c[3], paths = c[4]);
      if (len(c[5]) > 0)
        linear_extrude(height = symbol_top + symbol_step_mm + _fuse)
          polygon(points = c[5], paths = c[6]);
      translate([c[2][0], c[2][1], 0])
        linear_extrude(height = number_raise_mm + _fuse)
          text(str(c[0]), size = number_height_mm / LETTER_CAP_FACTOR,
               font = "Liberation Sans", halign = "center", valign = "top");
    }
  }
}

symbol_sheet();
