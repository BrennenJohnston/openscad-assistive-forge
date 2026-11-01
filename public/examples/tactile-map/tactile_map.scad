// =============================================================================
// Tactile Map - a map plate with raised levels, a raised title, a north cue
// and recessed channels for braille label tape
// =============================================================================
// VERSION = 0.1.0 (OpenSCAD Assistive Forge)
// License: GPL-3.0-or-later
//          https://www.gnu.org/licenses/gpl-3.0.html
//
// The map comes in as one SVG, the levels file, drawn in millimeters with one
// group per height: <g id="level1"> is the floor (platforms, walkways, areas),
// <g id="level2"> the symbols and routes, <g id="level3"> the walls,
// <g id="channels"> the strips sunk for label tape, and <g id="cutouts"> what
// is cut right through the plate (a plate's name as notches on its edge).
// Each group is imported on its own by its id and raised to its level, so one
// file carries the whole map and the heights never drift apart. The Tactile
// Map Designer panel writes this file; a saved one works the same in desktop
// OpenSCAD. Every group must be present, empty or not: a missing id is a
// warning.
//
// The heights are the ones my printed station maps settled on: a 0.4 mm base
// glued to a corrugated plastic board, the floor 0.6 mm above it, the symbols
// a further 0.8 mm so they stand out, the walls 0.6 mm above those (1.0, 1.8
// and 2.4 mm from the bed). The raised title follows the figures of ADA 703.2
// (16 mm capital I, 0.8 mm raise, Liberation Sans, uppercase). Braille goes on
// label tape pressed into the channels, because tape reads better than dots
// printed flat on a map.
//
// The thin base is a choice, not an oversight: the board gives the stiffness.
// A map printed whole (All printed) keeps to the 1.2 mm minimum wall this
// project prints reliably.
// =============================================================================

/* [Map file] */
// The map's levels file (SVG). The Tactile Map Designer panel writes it; you can also choose one you saved.
map_file = "sample_station.svg"; // [file:svg]
// What the map file holds. The Tactile Map Designer panel sets it: levels for a levels file, drawing for a drawing whose shapes are not classed yet, shown raised whole on the first level until they are.
map_file_kind = "levels"; // [levels, drawing]
// Width of the whole map (mm). About two hand spans: 480 is the default.
map_width_mm = 480; // [100:1:600]
// Height of the whole map (mm). About one hand span: 360 is the default.
map_height_mm = 360; // [75:1:450]

/* [Print style] */
// Thin plates for a backing board prints a 0.4 mm base to glue onto corrugated plastic. All printed uses a 1.2 mm base and needs no board.
print_style = "Thin plates for a backing board"; // [Thin plates for a backing board, All printed]
// Thickness of the base plate (mm). All printed keeps it at 1.2 mm or more.
base_thickness_mm = 0.4; // [0.3:0.1:3.0]

/* [Heights] */
// Height of each level above the one below (mm). 0.6 reads clearly; 0.3 to 1.0 allowed.
level_step_mm = 0.6; // [0.3:0.05:1.0]
// Extra height of the symbol level above its step (mm), so symbols stand out: 0.8.
symbol_step_mm = 0.8; // [0.5:0.05:1.5]
// How many raised levels the map uses: 1 to 3.
levels_used = 3; // [1:1:3]

/* [Title and north] */
// The title in raised uppercase letters along the top edge.
title_text = "";
// Height of the capital I in the title (mm). 16 mm is the ADA 703.2.5 minimum; up to 50.8.
title_char_height_mm = 16; // [16:0.1:50.8]
// How far the title's letters rise off the plate (mm). 0.8 mm is the ADA 703.2.1 minimum.
title_raise_mm = 0.8; // [0.8:0.05:2]
// Arrow with N draws an arrow pointing up with the letter N. North line raises a line along the whole north edge, which many readers find easier. None leaves it out.
north_cue = "Arrow with N"; // [Arrow with N, North line, None]
// A raised border around the map.
border = "no"; // [yes, no]
// The plate's name, drawn as raised letters in the margin when the margin id style is on.
plate_id = "";
// Draw the title on this plate. The Tactile Map Designer panel keeps it on the top-left plate only.
plate_shows_title = "yes"; // [yes, no]
// Draw the north cue on this plate. The panel keeps the arrow on the top-right plate only and a north line along the whole top row.
plate_shows_north = "yes"; // [yes, no]

/* [Label channels] */
// Width of your braille label tape (mm): 9.5 for 3/8 in tape, 12.7 for 1/2 in tape, the whole range of tapes the channels fit. Channels are cut 0.4 mm wider.
label_tape_width_mm = 12.7; // [9.5, 12.7]
// How deep the label channels sink below the surface (mm): 0.3 lets the tape sit nearly flush.
label_channel_depth_mm = 0.3; // [0.2:0.05:0.5]

/* [Hidden] */
$fn = 32;

// Overlap for every boolean, so no two faces touch exactly.
_fuse = 0.01;

// The thinnest wall this project prints reliably; the base of a map printed
// whole keeps to it.
_min_wall = 1.2;

// Letters and the north cue keep 9.525 mm (3/8 in) from the plate edge, the
// clearance ADA 703.2.7 and 703.3.2 ask of raised letters and braille.
EDGE_CLEARANCE_MM = 9.525;

// text(size) sets the font's em box, not the capital height. For Liberation
// Sans a capital I is 0.9555 of the size, measured on the Braille Sign.
LETTER_CAP_FACTOR = 0.9555;
// Letter spacing at which every pair of adjacent capital letters, and of
// digits, is 3.2 mm to four stroke widths apart (ADA 703.2.7; the sign's value).
TITLE_LETTER_SPACING = 1.21;

// The north arrow: a shaft 2 mm wide and 30 mm long with a solid isosceles
// head 10 mm across whose tip is 40 degrees (BANA 3.4.3.7 asks 30 to 45), and
// an N 16 mm tall above it.
NORTH_SHAFT_W = 2;
NORTH_SHAFT_L = 30;
NORTH_HEAD_W = 10;
NORTH_HEAD_H = (NORTH_HEAD_W / 2) / tan(20);
NORTH_LETTER_MM = 16;
NORTH_GAP_MM = 3;
NORTH_LINE_W = 2;
// The column the arrow and its N take at the right of the title band.
NORTH_ARROW_COLUMN_MM = 20;
BORDER_W = 2;

// Documented ranges, each from the source named beside it.
BASE_RANGE_MM = [0.3, 3.0];            // my printed maps (0.4) up to a stiff plate
LEVEL_STEP_RANGE_MM = [0.3, 1.0];      // my printed maps (0.6); ISO 19028 0.3 to 1.5; Bris 2001 0.5 minimum
SYMBOL_STEP_RANGE_MM = [0.5, 1.5];     // my printed maps (0.8)
LEVELS_RANGE = [1, 3];                 // three height changes at most on a map
TITLE_CAP_RANGE_MM = [16, 50.8];       // ADA 703.2.5, 5/8 to 2 in
TITLE_RAISE_MIN_MM = 0.8;              // ADA 703.2.1, 1/32 in
TAPE_WIDTHS_MM = [9.5, 12.7];          // 3/8 in and 1/2 in label tape
CHANNEL_DEPTH_RANGE_MM = [0.2, 0.5];   // my printed maps (0.3)
MAP_WIDTH_RANGE_MM = [100, 600];       // a plate of a split map at the least; about two hand spans at most
MAP_HEIGHT_RANGE_MM = [75, 450];       // a plate at the least; about one hand span at most

function in_range(v, r) = v >= r[0] && v <= r[1];

// =============================================================================
// ASSERTS: a value a finger depends on fails the build instead of printing wrong
// =============================================================================

assert(print_style != "All printed" || base_thickness_mm >= _min_wall,
       str("base_thickness_mm is ", base_thickness_mm, " mm; All printed needs 1.2 mm or more so the plate prints solid."));
assert(in_range(base_thickness_mm, BASE_RANGE_MM),
       str("base_thickness_mm is ", base_thickness_mm, " mm, outside 0.3 to 3.0 mm."));
assert(in_range(level_step_mm, LEVEL_STEP_RANGE_MM),
       str("level_step_mm is ", level_step_mm, " mm, outside the 0.3 to 1.0 mm range a finger reads reliably."));
assert(in_range(symbol_step_mm, SYMBOL_STEP_RANGE_MM),
       str("symbol_step_mm is ", symbol_step_mm, " mm, outside 0.5 to 1.5 mm."));
assert(in_range(levels_used, LEVELS_RANGE),
       str("levels_used is ", levels_used, "; this map allows 1 to 3 levels."));
assert(in_range(title_char_height_mm, TITLE_CAP_RANGE_MM),
       str("title_char_height_mm is ", title_char_height_mm, " mm; ADA 703.2.5 asks for 16 to 50.8 mm."));
assert(title_raise_mm >= TITLE_RAISE_MIN_MM,
       str("title_raise_mm is ", title_raise_mm, " mm, below the 0.8 mm ADA 703.2.1 minimum."));
assert(in_range(label_channel_depth_mm, CHANNEL_DEPTH_RANGE_MM),
       str("label_channel_depth_mm is ", label_channel_depth_mm, " mm, outside 0.2 to 0.5 mm."));
assert(label_tape_width_mm == TAPE_WIDTHS_MM[0] || label_tape_width_mm == TAPE_WIDTHS_MM[1],
       "label_tape_width_mm must be 9.5 or 12.7 mm.");
assert(in_range(map_width_mm, MAP_WIDTH_RANGE_MM),
       str("map_width_mm is ", map_width_mm, " mm, outside 100 to 600 mm."));
assert(in_range(map_height_mm, MAP_HEIGHT_RANGE_MM),
       str("map_height_mm is ", map_height_mm, " mm, outside 75 to 450 mm."));
assert(map_file_kind == "levels" || map_file_kind == "drawing",
       "map_file_kind must be levels or drawing.");

// =============================================================================
// HEIGHTS
// =============================================================================

base_eff = (print_style == "All printed") ? max(base_thickness_mm, _min_wall) : base_thickness_mm;

// The top of each level, measured from the bed: the floor one step up, the
// symbols a symbol step above that, the walls one more step.
function level_z(n) =
    n == 1 ? base_eff + level_step_mm
  : n == 2 ? level_z(1) + symbol_step_mm
  : level_z(2) + level_step_mm;

plate_hint = ceil(map_width_mm / 252) * ceil(map_height_mm / 252);

echo(str("Finished map: ", map_width_mm, " x ", map_height_mm, " mm; levels at ",
         level_z(1) - base_eff, ", ", level_z(2) - base_eff, " and ", level_z(3) - base_eff,
         " mm above the base; fits a 256 x 256 mm bed in ", plate_hint, " plates."));

// =============================================================================
// TEXT HELPERS
// =============================================================================

function to_upper(s) =
    chr([for (c = s) let(o = ord(c)) (o >= 97 && o <= 122) ? o - 32 : o]);

// Whether this plate draws the north cue at all: the cue's own switch, and
// the plate's (a split map draws the arrow on its top-right plate only).
north_on_plate = north_cue != "None" && plate_shows_north == "yes";

// The face a raised letter may use: the plate inside the edge clearance, less
// the arrow's column when the arrow is drawn on this plate.
title_right_x = map_width_mm - EDGE_CLEARANCE_MM
    - ((north_cue == "Arrow with N" && north_on_plate) ? NORTH_ARROW_COLUMN_MM : 0);
// The title's capitals start 9.525 mm below the top edge, or below the north
// line and a gap when that line is drawn on this plate.
title_top_y = map_height_mm - EDGE_CLEARANCE_MM
    - ((north_cue == "North line" && north_on_plate) ? NORTH_LINE_W + NORTH_GAP_MM : 0);

module face_2d() {
    translate([EDGE_CLEARANCE_MM, EDGE_CLEARANCE_MM])
        square([title_right_x - EDGE_CLEARANCE_MM,
                map_height_mm - 2 * EDGE_CLEARANCE_MM]);
}

// =============================================================================
// THE RAISED PARTS
// =============================================================================

// A drawing whose shapes are not classed yet has no level groups to look up:
// it rises whole to the first level, clipped to the plate, until the panel
// writes its levels file.
module levels() {
    if (map_file_kind == "drawing")
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = level_z(1) - base_eff + _fuse)
                intersection() {
                    square([map_width_mm, map_height_mm]);
                    import(map_file, center = false);
                }
    else
        for (n = [1 : levels_used])
            translate([0, 0, base_eff - _fuse])
                linear_extrude(height = level_z(n) - base_eff + _fuse)
                    import(map_file, id = str("level", n), center = false);
}

// The title: uppercase, left-aligned 9.525 mm in from the left edge, clipped
// to the face so a long title never runs off the plate or under the arrow.
// A split map draws it on its top-left plate only.
module title() {
    if (len(title_text) > 0 && plate_shows_title == "yes")
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = title_raise_mm + _fuse)
                intersection() {
                    face_2d();
                    translate([EDGE_CLEARANCE_MM, title_top_y])
                        text(to_upper(title_text),
                             size = title_char_height_mm / LETTER_CAP_FACTOR,
                             font = "Liberation Sans",
                             spacing = TITLE_LETTER_SPACING,
                             halign = "left",
                             valign = "top");
                }
}

// Arrow with N: in the top right corner, the N above the arrow, the arrow
// pointing up (north is the top edge).
module north_arrow_2d() {
    cx = map_width_mm - EDGE_CLEARANCE_MM - 7;
    y_top = map_height_mm - EDGE_CLEARANCE_MM;
    y_tip = y_top - NORTH_LETTER_MM - NORTH_GAP_MM;
    y_head_base = y_tip - NORTH_HEAD_H;
    translate([cx, y_top])
        text("N", size = NORTH_LETTER_MM / LETTER_CAP_FACTOR,
             font = "Liberation Sans", halign = "center", valign = "top");
    translate([cx, 0])
        polygon([[-NORTH_HEAD_W / 2, y_head_base], [NORTH_HEAD_W / 2, y_head_base], [0, y_tip]]);
    translate([cx - NORTH_SHAFT_W / 2, y_head_base - NORTH_SHAFT_L])
        square([NORTH_SHAFT_W, NORTH_SHAFT_L + _fuse]);
}

// North line: along the whole north edge, 9.525 mm in from it.
module north_line_2d() {
    translate([EDGE_CLEARANCE_MM, map_height_mm - EDGE_CLEARANCE_MM - NORTH_LINE_W])
        square([map_width_mm - 2 * EDGE_CLEARANCE_MM, NORTH_LINE_W]);
}

module north_cue() {
    if (north_on_plate)
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = level_z(1) - base_eff + _fuse)
                if (north_cue == "North line") north_line_2d();
                else north_arrow_2d();
}

// The plate's name: 6 mm capitals centered in the 10 mm strip along the
// bottom edge that the margin id style adds to a plate's levels file.
PLATE_ID_MM = 6;
PLATE_ID_STRIP_MM = 10;
module plate_name() {
    if (len(plate_id) > 0)
        translate([map_width_mm / 2, PLATE_ID_STRIP_MM / 2, base_eff - _fuse])
            linear_extrude(height = title_raise_mm + _fuse)
                text(to_upper(plate_id),
                     size = PLATE_ID_MM / LETTER_CAP_FACTOR,
                     font = "Liberation Sans",
                     spacing = TITLE_LETTER_SPACING,
                     halign = "center",
                     valign = "center");
}

module border_frame() {
    if (border == "yes")
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = level_z(1) - base_eff + _fuse)
                difference() {
                    square([map_width_mm, map_height_mm]);
                    translate([BORDER_W, BORDER_W])
                        square([map_width_mm - 2 * BORDER_W, map_height_mm - 2 * BORDER_W]);
                }
}

// The channels are cut from the base's top face down, and on up through
// anything raised over them, so a strip of tape always has a clear bed.
module channels() {
    if (map_file_kind == "levels")
        translate([0, 0, base_eff - label_channel_depth_mm])
            linear_extrude(height = label_channel_depth_mm + _fuse + 10)
                import(map_file, id = "channels", center = false);
}

// What is cut right through the plate: a plate's name as notches on its
// bottom edge, slots a finger finds and the eye sees from the back.
module cutouts() {
    if (map_file_kind == "levels")
        translate([0, 0, -_fuse])
            linear_extrude(height = base_eff + 20)
                import(map_file, id = "cutouts", center = false);
}

// =============================================================================
// THE MAP
// =============================================================================

module tactile_map() {
    difference() {
        union() {
            cube([map_width_mm, map_height_mm, base_eff]);
            levels();
            title();
            north_cue();
            border_frame();
            plate_name();
        }
        channels();
        cutouts();
    }
}

tactile_map();
