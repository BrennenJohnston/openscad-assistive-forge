// =============================================================================
// Braille Sign — Two-Part Tactile Sign Generator (raised letters + braille)
// =============================================================================
// VERSION = 1.0.0 (OpenSCAD Assistive Forge)
// License: GPL-3.0-or-later
//          https://www.gnu.org/licenses/gpl-3.0.html
//
// A two-part tactile sign following the 2010 ADA Standards (section 703)
// recommendations:
//  • LETTER PLATE (top): raised Latin characters (Liberation Sans,
//    sans-serif), uppercase by default, 16 mm character height (5/8 in
//    minimum per 703.2.5), raised 0.8 mm (1/32 in per 703.2.1), 135% line
//    spacing. Prints flat, letters up.
//  • BRAILLE PLATE (bottom): the same text in braille (translate in the
//    Forge panel, or paste Unicode braille into Line_1..Line_3). Prints
//    flat, or leaning back at face_angle_deg with break-away support fins
//    (the wedge-card technique) for the crispest dots.
//
// SPLIT RAISED BORDER: the letter plate carries the top + side border
// segments and the braille plate carries the bottom + side segments, so
// when the finished plates are mounted with the letters above the braille
// they form ONE continuous tactile frame around the whole sign.
//
// IMPORTANT — ADA disclaimer: these defaults follow the published 703
// figures but this tool does NOT guarantee compliance. Real signage has
// requirements this generator does not model (mounting height and
// location, contrast, glare, character width ratios, braille position
// 9.5 mm (3/8 in) minimum below the raised text, and more). Verify
// against the standard before installing.
//
// The braille dot system is adapted from the Braille Wedge Card STL
// Generator by Brennen Johnston
// (https://github.com/BrennenJohnston/braille-wedge-card-openscad,
// GPL-3.0-or-later).
// =============================================================================

/* [Sign Text - Raised Letters] */
// First line of raised text
sign_text_1 = "Room 101";
// Second line of raised text
sign_text_2 = "";
// Third line of raised text
sign_text_3 = "";

/* [Text Input - Pre-Translated Braille] */
// Braille for line 1 (Unicode braille, e.g. from branah.com/braille-translator)
Line_1 = "⠠⠗⠕⠕⠍⠀⠼⠁⠚⠁";
// Braille for line 2
Line_2 = "";
// Braille for line 3
Line_3 = "";

/* [Sign Layout] */
// Which part(s) to render. Both lays the two plates side by side on the bed.
sign_part = "Both"; // [Both, Letter plate, Braille plate]
// Width of the sign / both plates (mm)
sign_width_mm = 160;          // [60:1:300]
// Height of the letter plate (mm). Three 16 mm lines at 135% spacing need ~60 mm.
letter_plate_height_mm = 70;  // [30:1:200]
// Height of the braille plate (mm)
braille_plate_height_mm = 40; // [25:1:150]
// Thickness of both plates (mm)
plate_thickness_mm = 3;       // [2:0.5:8]
// Gap between the two plates on the print bed in Both mode (mm)
part_gap_mm = 8;              // [2:1:30]

/* [Raised Lettering - ADA 703] */
// Convert the raised text to uppercase (703.2.2 requires uppercase characters)
force_uppercase = "Yes";      // [Yes, No]
// Character height (mm). 703.2.5 minimum is 15.9 mm (5/8 in).
char_height_mm = 16;          // [12:0.5:50]
// How far the characters rise off the plate (mm). 703.2.1 minimum is 0.8 mm (1/32 in).
letter_raise_mm = 0.8;        // [0.4:0.05:2]
// Line spacing as a percentage of character height (703.2.8: 135%)
line_spacing_pct = 135;       // [100:5:200]
// Character spacing multiplier (>1 spreads characters; 703.2.8 needs clear space between)
letter_spacing = 1.1;         // [0.8:0.05:2]

/* [Border] */
// Raised split border: top + sides on the letter plate, bottom + sides on the braille plate
add_border = "yes";           // [yes, no]
// Border width (mm)
border_width_mm = 2;          // [0.5:0.5:6]
// Border height above the plate face (mm)
border_height_mm = 0.8;       // [0.2:0.1:2]

/* [Braille Plate Orientation] */
// Flat = dots face up on the bed. Angled = the plate leans back at
// face_angle_deg with break-away support fins (best dot quality).
print_orientation = "Flat";   // [Flat, Angled]
// Face angle from the horizontal bed (deg) in Angled mode. 75 = CHI sweet spot.
face_angle_deg = 75;          // [60:1:90]

/* [Support Fins (Angled)] */
// Break-away support fins behind the leaning braille plate (Angled mode only)
support_fins = "On";          // [On, Off]
// Spacing between fins across the plate width (mm); edge fins are always added
fin_interval_mm = 25;         // [1:0.5:200]
// Horizontal gap between the plate's back face and the fins (mm)
fin_offset_mm = 1.0;          // [0.2:0.05:10]
// Fin prism thickness along X (mm)
fin_thickness_mm = 1.2;       // [0.2:0.05:10]
// Fin height as a fraction of the leaning plate height
fin_height_frac = 1.0;        // [0.05:0.01:1]
// Number of break-away bridges up each fin
bridge_count = 4;             // [1:1:60]
// Bridge size along X (mm)
bridge_width_mm = 0.5;        // [0.2:0.05:8]
// Bridge size along Z (mm)
bridge_height_mm = 0.5;       // [0.2:0.05:8]
// How far each bridge merges into the plate back face (mm; 0.3-0.4 snaps clean)
bridge_contact_mm = 0.3;      // [0.1:0.05:3]
// Built-in brim flange width around each fin base (mm; 0 = no brim)
brim_width_mm = 2.0;          // [0:0.25:25]
// Brim layer thickness (mm, ~1-2 layers)
brim_thickness_mm = 0.2;      // [0.1:0.05:3]

/* [Braille Dot Shape] */
// Shape of the raised braille dots. Rounded matches the ADA dome profile.
dot_shape = "Rounded";        // [Rounded, Cone]
// Horizontal spacing between cells (mm)
cell_spacing = 7.0;           // [2:0.01:15]
// Vertical spacing between braille lines (mm)
line_spacing = 10.0;          // [5:0.01:25]
// Spacing between dots within a cell (mm)
dot_spacing = 2.5;            // [1:0.01:5]

/* [Braille Dot Shape - Rounded] */
// Defaults stay ADA-legal: base_height + dome_height <= 0.9 mm, 1.6 mm base.
// Rounded dot base diameter (mm)
rounded_dot_base_diameter = 1.6; // [0.5:0.01:3]
// Rounded dot base height (mm)
rounded_dot_base_height   = 0.35; // [0:0.01:2]
// Rounded dome diameter (mm)
rounded_dot_dome_diameter = 1.4; // [0.5:0.01:3]
// Rounded dot dome height (mm)
rounded_dot_dome_height   = 0.35; // [0.1:0.01:2]

/* [Braille Dot Shape - Cone] */
// Cone dot base diameter (mm)
cone_dot_base_diameter = 1.5; // [0.5:0.01:3]
// Cone dot height (mm)
cone_dot_height        = 0.8; // [0.3:0.01:2]
// Cone dot flat hat diameter (mm)
cone_dot_flat_hat      = 0.4; // [0.1:0.01:2]

/* [Rendering Quality] */
// Sphere quality for rounded shapes
render_quality = "Medium";    // [Low, Medium, High]
// Number of segments for cone shapes
cone_segments = 40;           // [8:1:64]

/* [Hidden] */
$fn = 32;

// =============================================================================
// CALCULATED VALUES
// =============================================================================

use_rounded_dots = (dot_shape == "Rounded");
angled_on = (print_orientation == "Angled");
fins_on = angled_on && ((support_fins == "On") || (support_fins == true));
border_on = (add_border == "yes");
uppercase_on = (force_uppercase == "Yes");

show_letter_plate  = (sign_part == "Both") || (sign_part == "Letter plate");
show_braille_plate = (sign_part == "Both") || (sign_part == "Braille plate");

quality_fn = (render_quality == "Low")    ? 24 :
             (render_quality == "Medium") ? 32 :
             (render_quality == "High")   ? 64 : 32;

// Text content metrics
_text_lines = [sign_text_1, sign_text_2, sign_text_3];
_braille_lines = [Line_1, Line_2, Line_3];
_text_nonempty = [for (i = [0:2]) if (len(_text_lines[i]) > 0) i];
_braille_nonempty = [for (i = [0:2]) if (len(_braille_lines[i]) > 0) i];
text_rows    = len(_text_nonempty) == 0 ? 0 : _text_nonempty[len(_text_nonempty) - 1] + 1;
braille_rows = len(_braille_nonempty) == 0 ? 0 : _braille_nonempty[len(_braille_nonempty) - 1] + 1;

// Letter layout
text_line_pitch = char_height_mm * line_spacing_pct / 100;

// Braille dot metrics
dot_total_height = use_rounded_dots
    ? (rounded_dot_base_height + rounded_dot_dome_height)
    : cone_dot_height;
DOT_FACE_EMBED = 0.02;

// Braille block extent (centre-to-centre) on the braille plate
braille_max_len = max([for (l = _braille_lines) len(l)]);
braille_block_w = braille_max_len <= 1 ? 0 : (braille_max_len - 1) * cell_spacing;
braille_block_h = braille_rows  <= 1 ? 0 : (braille_rows - 1) * line_spacing;

// Leaning-plate geometry (Angled mode; wedge-card technique). The braille
// plate leans back at face_angle_deg; the reading face is the leaning edge
// of length braille_plate_height_mm.
bp_height   = braille_plate_height_mm * sin(face_angle_deg);
bp_base_run = braille_plate_height_mm * cos(face_angle_deg);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Uppercase ASCII a-z (703.2.2: characters shall be uppercase)
function to_upper(s) =
    len(s) == 0 ? "" :
    chr([for (i = [0:len(s)-1])
        let(o = ord(s[i]))
        (o >= 97 && o <= 122) ? o - 32 : o]);

function display_text(s) = uppercase_on ? to_upper(s) : s;

function is_braille_char(c) = (c >= 10240 && c <= 10495);
function has_invalid_chars(str) =
    len(str) == 0 ? false :
    len([for (i = [0:len(str)-1]) if (!is_braille_char(ord(str[i]))) i]) > 0;
function get_dot_pattern(char) =
    let(code = ord(char))
    (code >= 10240 && code <= 10495) ?
        let(pattern = code - 10240)
        [
            (pattern % 2) >= 1 ? 1 : 0,
            floor(pattern / 2)  % 2 >= 1 ? 1 : 0,
            floor(pattern / 4)  % 2 >= 1 ? 1 : 0,
            floor(pattern / 8)  % 2 >= 1 ? 1 : 0,
            floor(pattern / 16) % 2 >= 1 ? 1 : 0,
            floor(pattern / 32) % 2 >= 1 ? 1 : 0
        ]
    : [0, 0, 0, 0, 0, 0];

// Dot offsets in a flat face frame (+X = reading direction, +Y = up)
dot_col_x_offsets = [-dot_spacing / 2, +dot_spacing / 2];
dot_row_y_offsets = [+dot_spacing, 0, -dot_spacing];
dot_positions     = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

// =============================================================================
// DOT MODULE (shared geometry with the wedge card)
// =============================================================================
module braille_dot_centered() {
    if (use_rounded_dots) {
        _total_height = rounded_dot_base_height + rounded_dot_dome_height;
        _dome_r = rounded_dot_dome_diameter / 2;
        _R_sphere = (_dome_r * _dome_r + rounded_dot_dome_height * rounded_dot_dome_height) / (2 * rounded_dot_dome_height);
        _center_z = rounded_dot_base_height + rounded_dot_dome_height - _R_sphere;
        _fuse = 0.02;
        translate([0, 0, -_total_height / 2]) {
            union() {
                translate([0, 0, (rounded_dot_base_height + _fuse) / 2])
                cylinder(
                    h  = rounded_dot_base_height + _fuse,
                    r1 = rounded_dot_base_diameter / 2,
                    r2 = rounded_dot_dome_diameter / 2,
                    center = true,
                    $fn = cone_segments
                );
                intersection() {
                    translate([0, 0, _center_z])
                    sphere(r = _R_sphere, $fn = quality_fn);
                    translate([0, 0, rounded_dot_base_height + _R_sphere])
                    cube([_R_sphere * 4, _R_sphere * 4, _R_sphere * 2], center = true);
                }
            }
        }
    } else {
        cylinder(
            h  = cone_dot_height,
            r1 = cone_dot_base_diameter / 2,
            r2 = cone_dot_flat_hat / 2,
            center = true,
            $fn = cone_segments
        );
    }
}

// =============================================================================
// SPLIT BORDER (2D, plate-local: plate centred at origin)
// =============================================================================
// Full ring minus one rail: the letter plate keeps top + sides, the braille
// plate keeps bottom + sides. Stacked (letters above braille) the segments
// join into one continuous frame.
module border_ring_2d(w, h) {
    difference() {
        square([w, h], center = true);
        square([w - 2 * border_width_mm, h - 2 * border_width_mm], center = true);
    }
}

// which = "top": keep top + side rails (letter plate)
// which = "bottom": keep bottom + side rails (braille plate)
module split_border_2d(w, h, which) {
    eps = 0.01;
    difference() {
        border_ring_2d(w, h);
        if (which == "top") {
            // remove the bottom rail between the side rails
            translate([0, -h / 2 + border_width_mm / 2])
                square([w - 2 * border_width_mm + eps, border_width_mm + eps], center = true);
        } else {
            // remove the top rail between the side rails
            translate([0, h / 2 - border_width_mm / 2])
                square([w - 2 * border_width_mm + eps, border_width_mm + eps], center = true);
        }
    }
}

// =============================================================================
// LETTER PLATE (always prints flat, letters up)
// =============================================================================
// Raised text block is centred on the plate (the border is thin enough to
// ignore in the centring). Lines are centred horizontally per 703-style
// signage conventions.
module letter_plate() {
    union() {
        // Plate body
        linear_extrude(height = plate_thickness_mm)
            square([sign_width_mm, letter_plate_height_mm], center = true);
        // Split border: top + sides
        if (border_on) {
            translate([0, 0, plate_thickness_mm])
                linear_extrude(height = border_height_mm)
                    split_border_2d(sign_width_mm, letter_plate_height_mm, "top");
        }
        // Raised characters
        if (text_rows > 0) {
            block_h = (text_rows - 1) * text_line_pitch;
            for (i = [0 : text_rows - 1]) {
                if (len(_text_lines[i]) > 0) {
                    y_line = block_h / 2 - i * text_line_pitch;
                    translate([0, y_line, plate_thickness_mm])
                        linear_extrude(height = letter_raise_mm)
                            text(display_text(_text_lines[i]),
                                 size = char_height_mm,
                                 font = "Liberation Sans",
                                 spacing = letter_spacing,
                                 halign = "center",
                                 valign = "center");
                }
            }
        }
    }
}

// =============================================================================
// BRAILLE PLATE — face content (plate-local, flat, dots up)
// =============================================================================
// Braille block centred on the plate; line 0 at the top.
module braille_face_dots() {
    if (braille_rows > 0) {
        for (row = [0 : braille_rows - 1]) {
            line = _braille_lines[row];
            if (len(line) > 0) {
                y_line = braille_block_h / 2 - row * line_spacing;
                for (col = [0 : len(line) - 1]) {
                    // Left-aligned within the block, block centred by longest line
                    x_cell = -braille_block_w / 2 + col * cell_spacing;
                    dots = get_dot_pattern(line[col]);
                    for (d = [0:5]) {
                        if (dots[d] == 1) {
                            dot_pos = dot_positions[d];
                            translate([x_cell + dot_col_x_offsets[dot_pos[1]],
                                       y_line + dot_row_y_offsets[dot_pos[0]],
                                       plate_thickness_mm + dot_total_height / 2 - DOT_FACE_EMBED])
                                braille_dot_centered();
                        }
                    }
                }
            }
        }
    }
}

// Complete flat braille plate: body + split border (bottom + sides) + dots
module braille_plate_flat() {
    union() {
        linear_extrude(height = plate_thickness_mm)
            square([sign_width_mm, braille_plate_height_mm], center = true);
        if (border_on) {
            translate([0, 0, plate_thickness_mm])
                linear_extrude(height = border_height_mm)
                    split_border_2d(sign_width_mm, braille_plate_height_mm, "bottom");
        }
        braille_face_dots();
    }
}

// =============================================================================
// BRAILLE PLATE — ANGLED (leaning slab + break-away fins, wedge technique)
// =============================================================================
// The flat plate above is the "face". For the leaning version the plate is
// rotated 180 deg about Z then leaned back, exactly like the braille charm,
// which keeps braille reading left-to-right and the split-border bottom
// rail at the bottom.
//
// A leaned flat plate would touch the bed along a knife-edge line, so it is
// sunk by BED_SINK and cut flat at z=0, giving the bottom edge a real
// first-layer contact strip.
BED_SINK = 0.6;
bp_lift = (braille_plate_height_mm / 2) * sin(face_angle_deg) - BED_SINK;
// Actual top of the leaned plate above the bed (after the bed sink)
bp_top = bp_height - BED_SINK;

module braille_plate_leaning() {
    difference() {
        translate([0, 0, bp_lift])
            rotate([-face_angle_deg, 0, 0])
                rotate([0, 0, 180])
                    braille_plate_flat();
        // Trim the sunk sliver below the bed -> flat first-layer strip
        translate([0, 0, -braille_plate_height_mm])
            cube([4 * sign_width_mm, 4 * braille_plate_height_mm,
                  2 * braille_plate_height_mm], center = true);
    }
}

function bp_fin_top_z() = fin_height_frac * bp_top;

module bp_support_fin_2d() {
    polygon([
        [-bp_base_run / 2 - fin_offset_mm, 0],
        [+bp_base_run / 2 - fin_offset_mm, 0],
        [-bp_base_run / 2 - fin_offset_mm, bp_fin_top_z()]
    ]);
}

module bp_support_fin(x) {
    translate([x - fin_thickness_mm / 2, 0, 0])
        rotate([90, 0, 90])
            linear_extrude(height = fin_thickness_mm)
                bp_support_fin_2d();
}

module bp_fin_brim(x) {
    if (brim_width_mm > 0 && brim_thickness_mm > 0) {
        y_back  = -bp_base_run / 2 - fin_offset_mm;
        y_front = +bp_base_run / 2 - fin_offset_mm;
        y_lo = y_back - brim_width_mm;
        // Stop short of the plate's bottom contact line (no self-touching STL)
        y_hi = min(y_front + brim_width_mm, bp_base_run / 2 - 0.05);
        translate([x - fin_thickness_mm / 2 - brim_width_mm, y_lo, 0])
            cube([fin_thickness_mm + 2 * brim_width_mm, y_hi - y_lo, brim_thickness_mm]);
    }
}

// Y of the leaning plate's back face at height z (plate-local assembly frame)
function bp_lean_back_y(z) = (bp_lift - z) / tan(face_angle_deg);

module bp_bridges(x) {
    eps = 0.01;
    top_clear = 0.1;
    z_lo = min(max(bridge_height_mm, 2),
               max(bp_fin_top_z() - bridge_height_mm / 2 - top_clear, bridge_height_mm / 2));
    z_hi = max(z_lo, bp_fin_top_z() - bridge_height_mm / 2 - top_clear);
    for (k = [0 : bridge_count - 1]) {
        z_k = (bridge_count == 1)
            ? (z_lo + z_hi) / 2
            : z_lo + (z_hi - z_lo) * k / (bridge_count - 1);
        y_far  = -bp_base_run / 2 - fin_offset_mm - eps;
        y_near = bp_lean_back_y(z_k) + bridge_contact_mm;
        translate([x - bridge_width_mm / 2, y_far, z_k - bridge_height_mm / 2])
            cube([bridge_width_mm, y_near - y_far, bridge_height_mm]);
    }
}

function bp_fin_x_positions() =
    let(
        half  = sign_width_mm / 2,
        n     = max(1, floor(sign_width_mm / fin_interval_mm)),
        inner = [for (i = [0 : n]) -half + i * fin_interval_mm]
    )
    concat(
        [-half],
        [for (xi = inner) if (xi > -half + 1e-3 && xi < half - 1e-3) xi],
        [half]
    );

module bp_support_fins_all() {
    for (x = bp_fin_x_positions()) {
        bp_support_fin(x);
        bp_fin_brim(x);
        bp_bridges(x);
    }
}

module braille_plate_angled() {
    union() {
        braille_plate_leaning();
        if (fins_on) bp_support_fins_all();
    }
}

// =============================================================================
// CONSOLE DIAGNOSTICS
// =============================================================================
echo(str("Braille sign: ", text_rows, " text line(s), ", braille_rows,
         " braille line(s), ", sign_width_mm, " mm wide"));
if (text_rows > 0 && (text_rows - 1) * text_line_pitch + char_height_mm
        > letter_plate_height_mm - 2 * (border_on ? border_width_mm : 0))
    echo("WARNING: the raised text block is taller than the letter plate. Raise letter_plate_height_mm or remove a line.");
if (braille_rows > 0 && braille_block_h + 2 * dot_spacing + rounded_dot_base_diameter
        > braille_plate_height_mm - 2 * (border_on ? border_width_mm : 0))
    echo("WARNING: the braille block is taller than the braille plate. Raise braille_plate_height_mm or remove a line.");
if (braille_max_len > 0 && braille_block_w + dot_spacing + rounded_dot_base_diameter
        > sign_width_mm - 2 * (border_on ? border_width_mm : 0))
    echo("WARNING: the braille block is wider than the sign. Widen the sign or shorten the line.");
for (i = [0:2])
    if (has_invalid_chars(_braille_lines[i]))
        echo(str("WARNING: braille Line_", i + 1, " contains non-braille characters. Use Unicode braille (U+2800-U+28FF)."));
if (char_height_mm < 15.9)
    echo("NOTE: ADA 703.2.5 requires raised characters at least 15.9 mm (5/8 in) tall.");
echo("NOTE: ADA defaults are recommendations only - this tool does not guarantee compliance. Mount the braille plate at least 9.5 mm (3/8 in) below the raised text.");

// =============================================================================
// MAIN RENDERING
// =============================================================================
// Both mode mirrors the final mounted arrangement on the bed: letter plate
// above (+Y), braille plate below (-Y), part_gap_mm apart.
if (show_letter_plate && show_braille_plate) {
    translate([0, part_gap_mm / 2 + letter_plate_height_mm / 2, 0])
        letter_plate();
    if (angled_on) {
        // Front bed edge of the leaning assembly sits at -part_gap_mm/2
        translate([0, -part_gap_mm / 2 - bp_base_run / 2, 0])
            braille_plate_angled();
    } else {
        translate([0, -part_gap_mm / 2 - braille_plate_height_mm / 2, 0])
            braille_plate_flat();
    }
} else if (show_letter_plate) {
    letter_plate();
} else if (show_braille_plate) {
    if (angled_on) braille_plate_angled();
    else braille_plate_flat();
}

// End of file
