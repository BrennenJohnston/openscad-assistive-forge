// =============================================================================
// Braille Charm — Parametric Braille Charm/Pendant Generator
// =============================================================================
// VERSION = 1.0.0 (OpenSCAD Assistive Forge)
// License: GPL-3.0-or-later
//          https://www.gnu.org/licenses/gpl-3.0.html
//
// A small charm, pendant, or zipper pull carrying one or two braille cells.
// The charm base (shapes, border, keychain hole / bail loop) is adapted from
// Nasif's Charm Maker (concept by Nasif Zaman, CC0); the braille dot system
// (ADA-friendly rounded/cone dots, Unicode braille decoding) is adapted from
// the Braille Wedge Card STL Generator by Brennen Johnston
// (https://github.com/BrennenJohnston/braille-wedge-card-openscad,
// GPL-3.0-or-later).
//
// PRINT ORIENTATIONS
//  • Flat (default): the charm lies on the bed with the dots facing up.
//    Simple and reliable; dot quality depends on your first layers.
//  • Angled: the charm leans back at face_angle_deg (75 degrees = the angle
//    CHI 2024 research found fastest and most comfortable to read, because
//    near-vertical printing moves the layer seams off the finger-contact
//    surface). A central break-away support fin stands behind the charm,
//    joined by tiny snap-off bridges and grounded by a built-in brim, so the
//    whole thing prints support-free as ONE fused STL. Snap the fin off
//    after printing.
//
// HOW TO USE (in the Forge, the Braille translation panel does step 1 for you)
//  1. Put 1-2 Unicode braille characters in braille_chars (e.g. from
//     https://www.branah.com/braille-translator - Unicode output, NOT ASCII).
//  2. Pick charm_shape, size, border, and attachment.
//  3. Pick print_orientation; for Angled, tune the fin under [Support Fin].
//  4. Render (F6) -> File -> Export -> STL.
// =============================================================================

/* [Braille Text] */
// One or two Unicode braille characters (a capital indicator counts as a cell)
braille_chars = "⠠⠁";

/* [Charm Shape] */
// Base shape of the charm
charm_shape = "circle"; // [circle, square, rounded_rect, hexagon, oval]
// Width of the charm (mm)
charm_width = 30; // [15:1:60]
// Height of the charm (mm; ignored for circle, square, and hexagon)
charm_height = 30; // [15:1:60]
// Thickness of the charm body (mm)
charm_thickness = 3; // [1.5:0.5:8]
// Corner rounding for square and rounded rectangle shapes (mm)
corner_radius = 4; // [0:0.5:15]

/* [Border] */
// Add a raised border ring around the face
add_border = "yes"; // [yes, no]
// Border width (mm)
border_width = 1.5; // [0.5:0.5:4]
// Border height above the face (mm). Keep it below the dot height so the
// border never shields the dots from reading fingers.
border_height = 0.5; // [0.2:0.1:2.0]

/* [Attachment] */
// How the charm attaches to a chain, ring, or pin
attachment_type = "keychain_hole"; // [keychain_hole, bail_loop, none]
// Hole diameter (for keychain hole, mm)
hole_diameter = 4; // [2:0.5:8]
// Bail loop thickness (for bail loop, mm)
bail_thickness = 2; // [1:0.5:4]
// Bail loop inner radius (mm)
bail_inner_radius = 3; // [2:0.5:6]

/* [Print Orientation] */
// Flat = dots face up on the bed. Angled = the charm leans back at
// face_angle_deg with a break-away support fin (best dot quality).
print_orientation = "Flat"; // [Flat, Angled]
// Face angle from the horizontal bed (deg) in Angled mode. 75 = CHI sweet spot.
face_angle_deg = 75; // [60:1:90]

/* [Support Fin (Angled)] */
// Break-away support fin behind the leaning charm (Angled mode only). When
// Off the bare leaning charm is exported (add slicer supports yourself).
support_fin = "On"; // [On, Off]
// Horizontal gap between the charm's back face and the fin (mm)
fin_offset_mm = 1.0; // [0.2:0.05:10]
// Fin prism thickness along X (mm). Keep a multiple of nozzle width.
fin_thickness_mm = 1.2; // [0.2:0.05:10]
// Fin height as a fraction of the leaning charm height
fin_height_frac = 1.0; // [0.05:0.01:1]
// Number of break-away bridges up the fin
bridge_count = 4; // [1:1:20]
// Bridge size along X (mm)
bridge_width_mm = 0.5; // [0.2:0.05:8]
// Bridge size along Z (mm)
bridge_height_mm = 0.5; // [0.2:0.05:8]
// How far each bridge merges into the charm back face (mm). 0.3-0.4 mm
// connects during the print but snaps off clean.
bridge_contact_mm = 0.3; // [0.1:0.05:3]
// Built-in brim flange width around the fin base (mm; 0 = no brim)
brim_width_mm = 2.0; // [0:0.25:25]
// Brim layer thickness (mm, ~1-2 layers)
brim_thickness_mm = 0.2; // [0.1:0.05:3]

/* [Braille Dot Shape] */
// Shape of the raised braille dots
dot_shape = "Rounded"; // [Rounded, Cone]
// Spacing between dots within a cell (mm)
dot_spacing = 2.5; // [1:0.01:5]
// Horizontal spacing between cells (mm)
cell_spacing = 7.0; // [2:0.01:15]

/* [Braille Dot Shape - Rounded] */
// Defaults chosen to stay ADA-legal: base_height + dome_height <= 0.9 mm.
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
render_quality = "Medium"; // [Low, Medium, High]
// Number of segments for cone shapes
cone_segments = 40; // [8:1:64]

/* [Hidden] */
$fn = 64;

// =============================================================================
// CALCULATED VALUES
// =============================================================================

use_rounded_dots = (dot_shape == "Rounded");
angled_on = (print_orientation == "Angled");
fin_on = angled_on && ((support_fin == "On") || (support_fin == true));

quality_fn = (render_quality == "Low")    ? 24 :
             (render_quality == "Medium") ? 32 :
             (render_quality == "High")   ? 64 : 32;

// Effective outline dimensions. shape_h is the TRUE vertical extent of the
// outline (a flat-side hexagon from circle($fn=6) is only sin(60) of its
// width tall), used for attachment placement and the Angled-mode lean math.
effective_width  = charm_width;
effective_height =
    (charm_shape == "circle" || charm_shape == "square" || charm_shape == "hexagon")
        ? charm_width
        : charm_height;
shape_h = (charm_shape == "hexagon")
    ? charm_width * sin(60)
    : effective_height;

// Dot metrics
dot_total_height = use_rounded_dots
    ? (rounded_dot_base_height + rounded_dot_dome_height)
    : cone_dot_height;
DOT_FACE_EMBED = 0.02;

n_cells = len(braille_chars);

// Leaning geometry (Angled mode). The charm is built flat, then rotated 180
// degrees about Z and leaned back by rotate([-face_angle_deg, 0, 0]); this
// keeps the braille reading left-to-right and the attachment at the top.
// The lean maps the outline height to a vertical rise of shape_h*sin(angle)
// and a horizontal run of shape_h*cos(angle) (same math as the wedge card).
lean_height = shape_h * sin(face_angle_deg);
lean_run    = shape_h * cos(face_angle_deg);
// A leaned flat charm would touch the bed along a knife-edge line, so it is
// sunk by BED_SINK and cut flat at z=0, giving the bottom edge a real
// first-layer contact strip (~BED_SINK/sin(angle) wide).
BED_SINK = 0.6;
// Lift so the lowest edge of the leaned charm rests on the bed (minus sink)
lean_lift   = (shape_h / 2) * sin(face_angle_deg) - BED_SINK;
// Y of the charm's BACK face (the z_local = 0 plane) at height z
function charm_back_y(z) = (lean_lift - z) / tan(face_angle_deg);

// =============================================================================
// HELPER FUNCTIONS (braille decoding — shared with the wedge card)
// =============================================================================
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

// Dot offsets in the FLAT face frame (+X = reading direction, +Y = up):
// columns left/right of the cell centre, rows top/middle/bottom.
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
// CHARM BASE (adapted from Nasif's Charm Maker)
// =============================================================================
module charm_base_2d() {
    if (charm_shape == "circle") {
        circle(d = effective_width);
    } else if (charm_shape == "oval") {
        scale([1, effective_height / effective_width])
            circle(d = effective_width);
    } else if (charm_shape == "hexagon") {
        // Vertices left/right, flat edges top and bottom (stable contact
        // line on the bed in Angled mode; vertical extent = width*sin(60))
        circle(d = effective_width, $fn = 6);
    } else if (charm_shape == "rounded_rect") {
        r = min(corner_radius, effective_width / 2, effective_height / 2);
        if (r > 0) {
            offset(r = r)
                square([effective_width - 2*r, effective_height - 2*r], center = true);
        } else {
            square([effective_width, effective_height], center = true);
        }
    } else {
        // square
        r = min(corner_radius, effective_width / 2);
        if (r > 0) {
            offset(r = r)
                square([effective_width - 2*r, effective_width - 2*r], center = true);
        } else {
            square([effective_width, effective_width], center = true);
        }
    }
}

module charm_body() {
    linear_extrude(height = charm_thickness)
        charm_base_2d();
}

module border_ring() {
    if (add_border == "yes") {
        translate([0, 0, charm_thickness])
            linear_extrude(height = border_height)
                difference() {
                    charm_base_2d();
                    offset(r = -border_width)
                        charm_base_2d();
                }
    }
}

module attachment_cut() {
    if (attachment_type == "keychain_hole") {
        hole_y = shape_h / 2 - hole_diameter / 2 - 1.5;
        translate([0, hole_y, -0.01])
            cylinder(d = hole_diameter, h = charm_thickness + border_height + 0.02);
    }
}

module attachment_add() {
    if (attachment_type == "bail_loop") {
        translate([0, shape_h / 2, charm_thickness / 2])
            rotate([0, 90, 0])
                rotate_extrude(angle = 180, $fn = 32)
                    translate([bail_inner_radius, 0, 0])
                        circle(d = bail_thickness);
    }
}

// =============================================================================
// BRAILLE DOTS ON THE FACE
// =============================================================================
// Cells are laid out along +X and centred on the face; the attachment sits
// above, so the dot block is nudged down slightly when a hole/bail is used.
braille_y_offset = (attachment_type == "none") ? 0 : -hole_diameter / 4;

module face_braille_dots() {
    if (n_cells > 0) {
        for (i = [0 : n_cells - 1]) {
            x_cell = (i - (n_cells - 1) / 2) * cell_spacing;
            dots = get_dot_pattern(braille_chars[i]);
            for (d = [0:5]) {
                if (dots[d] == 1) {
                    dot_pos = dot_positions[d];
                    dot_x = x_cell + dot_col_x_offsets[dot_pos[1]];
                    dot_y = braille_y_offset + dot_row_y_offsets[dot_pos[0]];
                    translate([dot_x, dot_y,
                               charm_thickness + dot_total_height / 2 - DOT_FACE_EMBED])
                        braille_dot_centered();
                }
            }
        }
    }
}

// =============================================================================
// COMPLETE FLAT CHARM
// =============================================================================
module flat_charm() {
    difference() {
        union() {
            charm_body();
            border_ring();
            attachment_add();
            face_braille_dots();
        }
        attachment_cut();
    }
}

// =============================================================================
// ANGLED MODE — lean + break-away support fin (wedge-card technique)
// =============================================================================
// The flat charm is rotated 180 deg about Z, leaned back by
// rotate([-face_angle_deg, 0, 0]), and lifted onto the bed. Net effect:
// braille reads left-to-right at face_angle_deg, attachment at the top.
module leaning_charm() {
    difference() {
        translate([0, 0, lean_lift])
            rotate([-face_angle_deg, 0, 0])
                rotate([0, 0, 180])
                    flat_charm();
        // Trim the sunk sliver below the bed -> flat first-layer strip
        translate([0, 0, -shape_h])
            cube([4 * effective_width, 4 * shape_h, 2 * shape_h], center = true);
    }
}

// Actual top of the leaned charm above the bed (after the bed sink)
lean_top = lean_height - BED_SINK;
function fin_top_z() = fin_height_frac * lean_top;

// Single central fin (x = 0): every charm outline reaches its full height on
// the centre column, so the break-away bridges always land on charm material.
module support_fin_2d() {
    polygon([
        [-lean_run / 2 - fin_offset_mm, 0],
        [+lean_run / 2 - fin_offset_mm, 0],
        [-lean_run / 2 - fin_offset_mm, fin_top_z()]
    ]);
}

module support_fin() {
    translate([-fin_thickness_mm / 2, 0, 0])
        rotate([90, 0, 90])
            linear_extrude(height = fin_thickness_mm)
                support_fin_2d();
}

module fin_brim() {
    if (brim_width_mm > 0 && brim_thickness_mm > 0) {
        y_back  = -lean_run / 2 - fin_offset_mm;
        y_front = +lean_run / 2 - fin_offset_mm;
        y_lo = y_back - brim_width_mm;
        // Stop the brim short of the charm's bottom contact line so the
        // exported STL never has a self-touching boundary.
        y_hi = min(y_front + brim_width_mm, lean_run / 2 - 0.05);
        translate([-fin_thickness_mm / 2 - brim_width_mm, y_lo, 0])
            cube([fin_thickness_mm + 2 * brim_width_mm, y_hi - y_lo, brim_thickness_mm]);
    }
}

module fin_bridges() {
    eps = 0.01;
    top_clear = 0.1;
    z_lo = min(max(bridge_height_mm, 2),
               max(fin_top_z() - bridge_height_mm / 2 - top_clear, bridge_height_mm / 2));
    z_hi = max(z_lo, fin_top_z() - bridge_height_mm / 2 - top_clear);
    for (k = [0 : bridge_count - 1]) {
        z_k = (bridge_count == 1)
            ? (z_lo + z_hi) / 2
            : z_lo + (z_hi - z_lo) * k / (bridge_count - 1);
        y_far  = -lean_run / 2 - fin_offset_mm - eps;      // into the fin spine
        y_near = charm_back_y(z_k) + bridge_contact_mm;    // merged into the charm
        translate([-bridge_width_mm / 2, y_far, z_k - bridge_height_mm / 2])
            cube([bridge_width_mm, y_near - y_far, bridge_height_mm]);
    }
}

module support_structure() {
    support_fin();
    fin_brim();
    fin_bridges();
}

// =============================================================================
// CONSOLE DIAGNOSTICS
// =============================================================================
echo(str("Braille charm: ", n_cells, " cell(s) on a ", charm_shape, " ",
         effective_width, " x ", effective_height, " mm face"));
if (n_cells > 2)
    echo(str("WARNING: braille_chars has ", n_cells,
             " cells but a charm face is designed for 1-2. Use fewer",
             " characters (a capital indicator counts as a cell)."));
if (has_invalid_chars(braille_chars))
    echo("WARNING: braille_chars contains non-braille characters. Use Unicode braille (U+2800-U+28FF).");
if (n_cells > 0 && (n_cells - 1) * cell_spacing + dot_spacing + rounded_dot_base_diameter
        > effective_width - 2 * (add_border == "yes" ? border_width : 0))
    echo("WARNING: the braille block is wider than the charm face. Enlarge the charm or use fewer cells.");
if (angled_on && attachment_type == "bail_loop")
    echo("NOTE: a bail loop prints poorly in Angled mode; keychain_hole is recommended.");
if (angled_on)
    echo(str("Angled mode: ", face_angle_deg, " deg lean, height ", lean_height,
             " mm", fin_on ? str(", ", bridge_count, " break-away bridges") : ", NO support fin"));

// =============================================================================
// MAIN RENDERING
// =============================================================================
if (angled_on) {
    union() {
        leaning_charm();
        if (fin_on) support_structure();
    }
} else {
    flat_charm();
}

// End of file
