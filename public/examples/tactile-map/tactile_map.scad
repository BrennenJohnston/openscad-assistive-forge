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
// is cut right through the plate (a plate's name as notches on its edge, and
// the label channels when the panel's Tape channels cuts them through, for
// tape that lies on the backing board), and <g id="leads"> the lines from a
// thing to its number in the margin, on a level of their own.
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
map_width_mm = 480; // [20:1:600]
// Height of the whole map (mm). About one hand span: 360 is the default.
map_height_mm = 360; // [20:1:450]

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

/* [Sheet] */
// The blank band around the map face (mm), 10 to 40. The Tactile Map Designer panel lays the map out inside it and records the figure here.
margin_mm = 10; // [10:1:40]
// The title band above the map face (mm), written by the panel: 0 when the title stands inside the face or there is none.
title_band_mm = 0; // [0:0.1:200]
// Raised words, written by the panel: rows of x:y:h:z:WORDS in tenths of a millimeter from the plate's bottom left: the baseline's start, the capital height, how far above the base's top the letters stand; rows split by |. The title's lines on their band, a key plate's words.
raised_words = "";

/* [Key plate] */
// Map draws a plate of the map; Key draws the map's key plate: its words raised, its braille on label tape in channels of the levels file. The Tactile Map Designer panel sets it.
plate_kind = "Map"; // [Map, Key]
// Height of the capital I in the key's raised words (mm). ADA 703.2.5: 16 to 50.8, as the title and the Braille Sign.
key_letter_height_mm = 16; // [16:0.1:50.8]

/* [Destination] */
// Where the destination cones stand, written by the panel: rows of x:y in tenths of a millimeter from the plate's bottom left, rows split by |. A map plate holds the cone at the address; the key plate holds its sample.
cone_marks = "";

/* [Numbers] */
// Face angle of a number's braille wedge (degrees), 45 to 90: 75 leans the braille back toward the reader, as my embosser's assembly map does.
wedge_face_angle_deg = 75; // [45:1:90]
// Sloped face below the braille on a number's wedge (mm), 2 to 12: it lifts the cells so a fingertip reading them rests on the wedge, not on the plate. A larger foot makes a taller wedge.
wedge_foot_mm = 6; // [2:1:12]
// How far a raised numeral stands above what it stands on (mm). 0.8 mm is the ADA 703.2.1 minimum.
numeral_raise_mm = 1.0; // [0.8:0.05:2]
// Where the numbers' braille wedges stand, written by the panel: rows of x:y:n, x and y in tenths of a millimeter from the plate's bottom left to the middle of the wedge's front foot, n the number; rows split by |.
number_wedges = "";
// A key piece's braille wedges for words, written by the panel: rows of x:y:cells, x and y in tenths of a millimeter from the plate's bottom left to the middle of the wedge's front foot, then the cells split by "." (each 0 to 63, dot 1 the 1 up to dot 6 the 32; 0 a space); rows split by |.
braille_wedges = "";

/* [Hidden] */
$fn = 32;

// The destination cone, Touch Mapper's address marker exactly (skarkkai/
// touch-mapper, converter/tactile_constants.py and obj-to-tactile.py,
// AGPL-3.0): 4.9 mm tall from the plate's underside, its foot as wide as it
// is tall, the top cut flat at an eighth of the radius so it prints, 16
// sides. Constants, not dials: the form other tactile map makers know.
CONE_HEIGHT_MM = 4.9;
CONE_RADIUS_MM = CONE_HEIGHT_MM / 2;

// A number's braille wedge: the form of my embosser's assembly map, its back a
// 60 degree ramp and a 1.5 mm flat along its top, so it prints with no supports.
// Dots and cells inside the ranges of ADA 703.3.1 the Braille Sign keeps to: a
// frustum under a spherical cap, sunk a little into the face so none floats.
WEDGE_BACK_ANGLE_DEG = 60;
WEDGE_TOP_MM = 1.5;
WEDGE_FACE_MARGIN_X_MM = 2.5;
WEDGE_FACE_MARGIN_TOP_MM = 2.0;
// Taller than the tallest wedge the dials allow (a 12 mm foot, upright: 20.5 mm
// and its dots), for the cut of every wedge to its plate.
WEDGE_CLIP_MM = 30;
DOT_BASE_MM = 1.5;
DOT_DOME_MM = 1.0;
DOT_BASE_HEIGHT_MM = 0.3;
DOT_DOME_HEIGHT_MM = 0.5;
DOT_PITCH_MM = 2.5;
CELL_PITCH_MM = 6.5;
DOT_SINK_MM = 0.05;
// Dot numbers, 1 to 3 the left column from the top, 4 to 6 the right; the
// numeric indicator stands before the digits (UEB).
NUMBER_SIGN = [3, 4, 5, 6];
DIGIT_DOTS = [[2, 4, 5], [1], [1, 2], [1, 4], [1, 4, 5], [1, 5], [1, 2, 4], [1, 2, 4, 5], [1, 2, 5], [2, 4]];
// A number on a thing stands 10 mm tall; in the margin and on the key, 16 mm.
NUMERAL_ON_THING_MM = 10;

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
KEY_PIECE_MIN_MM = 20;                 // a key row's piece at the least, either way
KEY_LETTER_RANGE_MM = [16, 50.8];      // ADA 703.2.5, 5/8 to 2 in, as the title
WEDGE_ANGLE_RANGE_DEG = [45, 90];      // a lean a finger can read, up to upright
WEDGE_FOOT_RANGE_MM = [2, 12];         // the least that clears the plate, up to my assembly map's 12
NUMERAL_RAISE_RANGE_MM = [0.8, 2.0];   // ADA 703.2.1, 1/32 in, as the title's raise
NUMBER_RANGE = [1, 99];                // two digits: a cell for the indicator and one for each
DOT_BASE_RANGE_MM = [1.5, 1.6];        // ADA 703.3.1
DOT_HEIGHT_RANGE_MM = [0.6, 0.9];      // ADA 703.3.1
DOT_PITCH_RANGE_MM = [2.3, 2.5];       // ADA 703.3.1
CELL_PITCH_RANGE_MM = [6.13, 7.6];     // ADA 703.3.1, as the Braille Sign keeps to

function in_range(v, r) = v >= r[0] && v <= r[1];

// =============================================================================
// ASSERTS: a value a finger depends on fails the build instead of printing wrong
// =============================================================================

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
// A map plate keeps the plate's floor; a key piece, a row of the key, may be
// as small as its row.
if (plate_kind == "Key") {
    assert(in_range(map_width_mm, [KEY_PIECE_MIN_MM, MAP_WIDTH_RANGE_MM[1]]),
           str("A key piece is ", map_width_mm, " mm wide, outside 20 to 600 mm."));
    assert(in_range(map_height_mm, [KEY_PIECE_MIN_MM, MAP_HEIGHT_RANGE_MM[1]]),
           str("A key piece is ", map_height_mm, " mm tall, outside 20 to 450 mm."));
} else {
    assert(in_range(map_width_mm, MAP_WIDTH_RANGE_MM),
           str("map_width_mm is ", map_width_mm, " mm, outside 100 to 600 mm."));
    assert(in_range(map_height_mm, MAP_HEIGHT_RANGE_MM),
           str("map_height_mm is ", map_height_mm, " mm, outside 75 to 450 mm."));
}
assert(map_file_kind == "levels" || map_file_kind == "drawing",
       "map_file_kind must be levels or drawing.");
assert(plate_kind == "Map" || plate_kind == "Key", "plate_kind must be Map or Key.");
assert(in_range(key_letter_height_mm, KEY_LETTER_RANGE_MM),
       str("key_letter_height_mm is ", key_letter_height_mm, " mm; ADA 703.2.5 asks for 16 to 50.8 mm."));
assert(in_range(wedge_face_angle_deg, WEDGE_ANGLE_RANGE_DEG),
       str("wedge_face_angle_deg is ", wedge_face_angle_deg, " degrees, outside 45 to 90."));
assert(in_range(wedge_foot_mm, WEDGE_FOOT_RANGE_MM),
       str("wedge_foot_mm is ", wedge_foot_mm, " mm, outside 2 to 12 mm."));
assert(in_range(numeral_raise_mm, NUMERAL_RAISE_RANGE_MM),
       str("numeral_raise_mm is ", numeral_raise_mm, " mm, outside 0.8 to 2.0 mm."));
// The braille figures against their spec, should anyone edit the constants.
assert(in_range(DOT_BASE_MM, DOT_BASE_RANGE_MM), "The wedge's dot base is outside 1.5 to 1.6 mm.");
assert(in_range(DOT_BASE_HEIGHT_MM + DOT_DOME_HEIGHT_MM, DOT_HEIGHT_RANGE_MM), "The wedge's dot height is outside 0.6 to 0.9 mm.");
assert(in_range(DOT_PITCH_MM, DOT_PITCH_RANGE_MM), "The wedge's dot pitch is outside 2.3 to 2.5 mm.");
assert(in_range(CELL_PITCH_MM, CELL_PITCH_RANGE_MM), "The wedge's cell pitch is outside 6.13 to 7.6 mm.");

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
         " mm above the base; fits a 256 x 256 mm bed in ", plate_hint,
         plate_hint == 1 ? " plate." : " plates."));

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

// The part of a symbol that stands one symbol step above the symbol level,
// the levels file's here group: You are here's center dot, so the reader's
// place is the highest mark on the map (ISO 19028 6.5.1; BANA 2022 8.5.6:
// the most prominent symbol). Only where the symbol level is drawn.
module here_mark() {
    if (map_file_kind == "levels" && levels_used >= 2)
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = level_z(2) + symbol_step_mm - base_eff + _fuse)
                import(map_file, id = "here", center = false);
}

// The title: uppercase, left-aligned 9.525 mm in from the left edge, clipped
// to the face so a long title never runs off the plate or under the arrow.
// A split map draws it on its top-left plate only.
// The title drawn by the model itself, inside the face's top edge, only
// while the panel writes no raised_words rows but numbers (the band's lines
// come as rows).
_word_rows = [for (r = _rows(raised_words)) if (!_is_numeral(r[4])) r];
module title() {
    if (len(title_text) > 0 && plate_shows_title == "yes" && len(_word_rows) == 0)
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
// bottom edge, slots a finger finds and the eye sees from the back; and the
// label channels when the panel writes them here instead of the channels
// group, so the tape lies on the backing board with nothing of the plate
// under it (the depth above is then not used).
module cutouts() {
    if (map_file_kind == "levels")
        translate([0, 0, -_fuse])
            linear_extrude(height = base_eff + 20)
                import(map_file, id = "cutouts", center = false);
}

// =============================================================================
// THE MAP
// =============================================================================

// =============================================================================
// THE KEY PLATE: rows of raised words the panel lays out; its samples, its
// frame and the channels for its braille on label tape come with the levels
// file, as a map plate's do
// =============================================================================

// Rows of "x:y:h:z:content" split by "|", the four numbers in tenths of a
// millimeter; the content may hold a colon of its own.
function _at(s, c, i = 0) = i >= len(s) ? -1 : s[i] == c ? i : _at(s, c, i + 1);
function _sub(s, a, b) = a >= b ? "" : chr([for (i = [a : b - 1]) ord(s[i])]);
function _split(s, c) =
    let(k = _at(s, c))
    k < 0 ? [s] : concat([_sub(s, 0, k)], _split(_sub(s, k + 1, len(s)), c));
// A whole number, signed: a row that starts left of its plate (a title line
// across a seam) has a negative x.
function _uint(s, i = 0, n = 0) =
    i >= len(s) ? n : _uint(s, i + 1, n * 10 + ord(s[i]) - 48);
function _int(s) = len(s) > 0 && s[0] == "-" ? -_uint(s, 1) : _uint(s);
function _row(r) =
    let(a = _at(r, ":"), r1 = _sub(r, a + 1, len(r)),
        b = _at(r1, ":"), r2 = _sub(r1, b + 1, len(r1)),
        c = _at(r2, ":"), r3 = _sub(r2, c + 1, len(r2)),
        d = _at(r3, ":"))
    [_int(_sub(r, 0, a)) / 10, _int(_sub(r1, 0, b)) / 10,
     _int(_sub(r2, 0, c)) / 10, _int(_sub(r3, 0, d)) / 10,
     _sub(r3, d + 1, len(r3))];
function _rows(s) = len(s) == 0 ? [] : [for (r = _split(s, "|")) if (len(r) > 0) _row(r)];
// Rows of "x:y" split by "|", x and y in tenths of a millimeter.
function _xy(r) =
    let(a = _at(r, ":"))
    [_int(_sub(r, 0, a)) / 10, _int(_sub(r, a + 1, len(r))) / 10];
function _xy_rows(s) = len(s) == 0 ? [] : [for (r = _split(s, "|")) if (len(r) > 0) _xy(r)];

// The destination cone rises from under the plate through whatever stands
// at its foot, so it is the tallest thing on the map wherever it lands.
module destination_cone() {
    for (m = _xy_rows(cone_marks))
        translate([m[0], m[1], -_fuse])
            cylinder(h = CONE_HEIGHT_MM + _fuse, r1 = CONE_RADIUS_MM,
                     r2 = CONE_RADIUS_MM / 8, $fn = 16);
}

// Every raised word the panel wrote: the title's lines on their band, a key
// plate's words. Each row stands on its own height above the base and is
// clipped to the plate, so a line across a seam goes on at the next plate. A
// row whose text starts with # is a number: bold, centered on its x, on a
// thing 10 mm tall and elsewhere at least the letters' 16 mm.
function _is_numeral(s) = len(s) > 1 && s[0] == "#";
module raised_words() {
    for (row = _rows(raised_words)) {
        numeral = _is_numeral(row[4]);
        assert(in_range(row[2], TITLE_CAP_RANGE_MM) || (numeral && row[2] == NUMERAL_ON_THING_MM),
               str("a raised word's capital is ", row[2], " mm; ADA 703.2.5 asks for 16 to 50.8 mm."));
        assert(row[3] >= 0 && row[3] <= level_z(3) - base_eff,
               str("a raised word stands ", row[3], " mm above the base, past the top level."));
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = row[3] + (numeral ? numeral_raise_mm : title_raise_mm) + _fuse)
                intersection() {
                    square([map_width_mm, map_height_mm]);
                    translate([row[0], row[1]])
                        if (numeral)
                            text(_sub(row[4], 1, len(row[4])), size = row[2] / LETTER_CAP_FACTOR,
                                 font = "Liberation Sans:style=Bold",
                                 halign = "center", valign = "baseline");
                        else
                            text(row[4], size = row[2] / LETTER_CAP_FACTOR,
                                 font = "Liberation Sans", spacing = TITLE_LETTER_SPACING,
                                 halign = "left", valign = "baseline");
                }
    }
}

// A number's braille cells as lists of dot numbers: the indicator, then a cell a digit.
function _digits(n) = n < 10 ? [n] : concat(_digits(floor(n / 10)), [n % 10]);
function _cells(n) = concat([NUMBER_SIGN], [for (d = _digits(n)) DIGIT_DOTS[d]]);
_cell_w = DOT_PITCH_MM + DOT_BASE_MM;
_cell_h = 2 * DOT_PITCH_MM + DOT_BASE_MM;
_face_h = wedge_foot_mm + _cell_h + WEDGE_FACE_MARGIN_TOP_MM;
_wedge_h = _face_h * sin(wedge_face_angle_deg);
_face_run = _face_h * cos(wedge_face_angle_deg);
_wedge_depth = _face_run + WEDGE_TOP_MM + _wedge_h / tan(WEDGE_BACK_ANGLE_DEG);
// A wedge's width for k cells: the cells at their pitch and the face's margins.
function _cells_wedge_w(k) = (k - 1) * CELL_PITCH_MM + _cell_w + 2 * WEDGE_FACE_MARGIN_X_MM;
function _wedge_w(n) = _cells_wedge_w(len(_cells(n)));

// One dot, base at z = 0: a frustum under a spherical cap of radius
// (r^2 + h^2) / 2h, smooth under a finger.
module _braille_dot() {
    r = DOT_DOME_MM / 2;
    cap = (r * r + DOT_DOME_HEIGHT_MM * DOT_DOME_HEIGHT_MM) / (2 * DOT_DOME_HEIGHT_MM);
    cylinder(h = DOT_BASE_HEIGHT_MM + _fuse, r1 = DOT_BASE_MM / 2, r2 = r, $fn = 48);
    intersection() {
        translate([0, 0, DOT_BASE_HEIGHT_MM + DOT_DOME_HEIGHT_MM - cap]) sphere(r = cap, $fn = 48);
        translate([-cap, -cap, DOT_BASE_HEIGHT_MM]) cube([2 * cap, 2 * cap, DOT_DOME_HEIGHT_MM + _fuse]);
    }
}

// The cells laid flat about the origin, dots up, reading along +x, the first
// row of dots at +y.
module _braille_cells(cs) {
    x0 = -(len(cs) - 1) * CELL_PITCH_MM / 2;
    for (i = [0 : len(cs) - 1], k = cs[i])
        translate([x0 + i * CELL_PITCH_MM + (k <= 3 ? -1 : 1) * DOT_PITCH_MM / 2,
                   DOT_PITCH_MM * (1 - (k - 1) % 3), -DOT_SINK_MM])
            _braille_dot();
}

// A wedge for braille cells (each a list of dot numbers), its front foot
// along y = 0 and centered on x = 0, the face toward the plate's bottom edge,
// the reader's: the body, then the cells turned onto its sloped face. It
// stands on z = 0.
module _cells_wedge(cs) {
    w = _cells_wedge_w(len(cs));
    up = wedge_foot_mm + _cell_h / 2;
    translate([-w / 2, 0, 0]) rotate([90, 0, 90])
        linear_extrude(height = w)
            polygon([[0, -_fuse], [_face_run, _wedge_h], [_face_run + WEDGE_TOP_MM, _wedge_h], [_wedge_depth, -_fuse]]);
    translate([0, up * cos(wedge_face_angle_deg), up * sin(wedge_face_angle_deg)])
        rotate([wedge_face_angle_deg, 0, 0])
            _braille_cells(cs);
}

// The wedge for number n: the number sign, then a cell a digit.
module _label_wedge(n) {
    _cells_wedge(_cells(n));
}

// Rows of "x:y:n" split by "|", x and y in tenths of a millimeter.
function _xyn(r) =
    let(a = _at(r, ":"), rest = _sub(r, a + 1, len(r)), b = _at(rest, ":"))
    [_int(_sub(r, 0, a)) / 10, _int(_sub(rest, 0, b)) / 10, _int(_sub(rest, b + 1, len(rest)))];
function _xyn_rows(s) = len(s) == 0 ? [] : [for (r = _split(s, "|")) if (len(r) > 0) _xyn(r)];

// The numbers' wedges rise from the base's top through whatever stands at
// their foot, so none floats on an area's level. Each is cut to the plate, so
// a wedge across a seam is whole when the plates are put together.
module number_wedges() {
    rows = _xyn_rows(number_wedges);
    if (len(rows) > 0)
        intersection() {
            translate([0, 0, base_eff - 2 * _fuse])
                cube([map_width_mm, map_height_mm, WEDGE_CLIP_MM]);
            for (row = rows) {
                assert(in_range(row[2], NUMBER_RANGE),
                       str("a wedge's number is ", row[2], "; a wedge holds 1 to 99."));
                translate([row[0], row[1], base_eff - _fuse])
                    _label_wedge(row[2]);
            }
        }
}

// A key piece's words on braille wedges: rows of x:y:cells, a cell's dots
// as the bits of a number (dot 1 the 1, up to dot 6 the 32).
function _bits_dots(b) = [for (d = [0 : 5]) if (floor(b / pow(2, d)) % 2 == 1) d + 1];
function _xyc(r) =
    let(a = _at(r, ":"), rest = _sub(r, a + 1, len(r)), b = _at(rest, ":"))
    [_int(_sub(r, 0, a)) / 10, _int(_sub(rest, 0, b)) / 10,
     [for (c = _split(_sub(rest, b + 1, len(rest)), ".")) _uint(c)]];
function _xyc_rows(s) = len(s) == 0 ? [] : [for (r = _split(s, "|")) if (len(r) > 0) _xyc(r)];

module braille_wedges() {
    rows = _xyc_rows(braille_wedges);
    if (len(rows) > 0)
        intersection() {
            translate([0, 0, base_eff - 2 * _fuse])
                cube([map_width_mm, map_height_mm, WEDGE_CLIP_MM]);
            for (row = rows) {
                assert(len(row[2]) > 0 && max(row[2]) <= 63 && min(row[2]) >= 0,
                       "a braille wedge's cells are numbers from 0 to 63.");
                translate([row[0], row[1], base_eff - _fuse])
                    _cells_wedge([for (b = row[2]) _bits_dots(b)]);
            }
        }
}

// The lead lines, from a thing to its number in the margin: on a level of
// their own, one step above the top level the map uses, so nothing else on the
// map stands at their height.
module leads() {
    if (map_file_kind == "levels")
        translate([0, 0, base_eff - _fuse])
            linear_extrude(height = level_z(levels_used) + level_step_mm - base_eff + _fuse)
                import(map_file, id = "leads", center = false);
}

module tactile_map() {
    difference() {
        union() {
            cube([map_width_mm, map_height_mm, base_eff]);
            levels();
            here_mark();
            destination_cone();
            raised_words();
            number_wedges();
            braille_wedges();
            leads();
            if (plate_kind != "Key") {
                title();
                north_cue();
                border_frame();
                plate_name();
            }
        }
        channels();
        cutouts();
    }
}

tactile_map();
