// =============================================================================
// Braille Wedge Card STL Generator (OpenSCAD)
// =============================================================================
// VERSION = 1.2.0 (OpenSCAD Assistive Forge web adaptation)
// License: GPL-3.0-or-later
//          https://www.gnu.org/licenses/gpl-3.0.html
// Source:  https://github.com/BrennenJohnston/braille-wedge-card-openscad
// Copyright 2024-2026 Brennen Johnston
// Relicensed by the copyright holder from PolyForm Noncommercial 1.0.0 to
// GPL-3.0-or-later for the OpenSCAD Assistive Forge (2026).
//
// Web adaptation notes (Braille Card Customizer example):
//  - show_warnings defaults to Off: the Forge's translation panel validates
//    text in JS before it ever reaches this file, and the 3D warning text
//    relies on font support that the WASM build loads lazily.
//  - render_quality defaults to Medium for faster in-browser preview.
//  - Geometry, parameters, and layout logic are otherwise unchanged.
//
// A directly readable 3D-printed braille card. The card prints leaning back
// at face_angle_deg from the bed (default 75 degrees -- the angle CHI 2024
// research found fastest and most comfortable to read, because near-vertical
// printing moves the layer seams off the finger-contact surface). A
// parametric array of triangular BREAK-AWAY SUPPORT FINS stands behind the
// card, joined to it by tiny snap-off bridges and grounded by a built-in
// brim, so the whole thing prints support-free and exports as ONE fused STL.
// After printing, the fins snap/flex off and the card is ready to read.
//
// =============================================================================
// WHAT THIS MAKES
// =============================================================================
//  • The Braille Card — a flat leaning card with raised braille dots on the
//    angled reading face. The dots are readable directly off the printer; no
//    other tooling or post-processing is required.
//  • Support Fins (toggle) — a row of triangular fins, on fin_interval_mm
//    spacing (always including both outer edges, so the minimum is 2 edge fins
//    and the maximum is hundreds), standing fin_offset_mm behind the card's
//    overhanging back face, each joined to the card by bridge_count tiny
//    break-away bridges and grounded by a flat brim. Fully fused with the card
//    so it slices as a single print-ready object.
//
// =============================================================================
// HOW TO USE
// =============================================================================
//  1. Translate your text at https://www.branah.com/braille-translator
//     (Grade 1 or Grade 2, Unicode Braille output — NOT ASCII Braille).
//  2. Paste pre-translated braille into Line_1..Line_20 in the Customizer.
//  3. Pick dot_shape (Rounded is the ADA-friendly default; Cone is easier to
//     print on some machines).
//  4. The card face auto-sizes to fit your text plus a margin by default
//     (auto_size_card = On) — the effective size is reported in the console
//     (the Customizer sliders can't show computed values). Set
//     auto_size_card = Off to use the manual width/height sliders instead.
//  5. Warnings (invalid characters, text too long, too many lines) appear as
//     red 3D text in the F5 preview only — they are NEVER exported to the STL,
//     and can be turned off under the [Warnings] tab.
//  6. Tune support fins under [Support Fins] (anywhere from 2 edge fins up to
//     hundreds), or set support_fins = Off to export the bare card.
//  7. When the text spans more than one card, set card_layout = "All cards"
//     under [Multi-Card Layout] to print every card in one file: the lines are
//     chunked into groups of rows_per_card and the cards are laid out behind
//     one another with card_gap_mm between footprints.
//  8. Render (F6) → File → Export → STL.
//
// =============================================================================
// PRINT / SLICER GUIDANCE
// =============================================================================
//  • Print AS MODELED — the card leans back and the fins stand behind it on the
//    bed. No slicer supports are needed; a slicer brim on top is optional.
//  • The bridges are single-/few-layer horizontal prongs. Tune bridge_contact_mm
//    (0.3–0.4 mm) so they connect during the print but snap off cleanly after.
//  • After printing, flex/snip the fins off the back and deburr the small nubs
//    left by the bridges.
//  • Do NOT cut lightening holes in the fins — per masukomi, the extra motion /
//    vibration hurts a thin leaning part more than the saved filament helps.
//
// =============================================================================
// REFERENCES
// =============================================================================
//  [A] Puerta, Crnovrsanin, South, Dunne — "The Effect of Orientation on the
//      Readability and Comfort of 3D-Printed Braille", CHI 2024. Braille
//      printed at 75–90° reads significantly faster and more comfortably than
//      flat-printed braille; 75° also reduces dot overhangs vs. 90°:
//      https://doi.org/10.1145/3613904.3642719
//  [B] Print-stability + path recommendation research:
//      ./docs/research-print-stability-and-path-recommendation.md
//  [C] Dot geometry and slicer-quality research:
//      ./docs/research-dot-geometry-and-slicer-quality.md
//  [D] Customizer usability research (auto-size, centering, warnings):
//      ./docs/research-customizer-usability.md
//  [E] Slant3D, "Stop Using Slicer Supports" — triangular fin spaced off the
//      part, thin horizontal prongs, wide base, chamfer to snap off:
//      https://youtu.be/_R2E8VwyNz0
//  [F] masukomi, "Manual Support Fins for 3D Printing" — ~1 mm offset, column of
//      small sprues, add side fins so edges don't float, avoid holes in fins,
//      prefer 0.3–0.4 mm contact:
//      https://weblog.masukomi.org/2024/03/11/manual-support-fins-for-3d-printing/
//  [G] Break-away support guidance (0.2–0.5 mm contact, wide base, chamfer):
//      https://www.wevolver.com/article/3d-print-supports-a-guide-for-engineers
//  [H] BANA size and spacing: https://brailleauthority.org/size-and-spacing-braille-characters
//  [I] 2010 ADA Standards: https://archive.ada.gov/
//
//  Lineage: the braille dot geometry was adapted from the Braille Cylinder
//  STL Generator (https://github.com/BrennenJohnston/braille-stl-generator-openscad),
//  then simplified for this standalone, directly-readable card project.
// =============================================================================

/* [Text Input - Pre-Translated Braille] */
// Paste Unicode braille characters from https://www.branah.com/braille-translator
// First line of braille text
Line_1 = "⠓⠑⠇⠇⠕";
// Second line of braille text
Line_2 = "⠺⠕⠗⠇⠙";
// Third line of braille text
Line_3 = "";
// Fourth line of braille text
Line_4 = "";
// Line 5 of braille text
Line_5 = "";
// Line 6 of braille text
Line_6 = "";
// Line 7 of braille text
Line_7 = "";
// Line 8 of braille text
Line_8 = "";
// Line 9 of braille text
Line_9 = "";
// Line 10 of braille text
Line_10 = "";
// Line 11 of braille text
Line_11 = "";
// Line 12 of braille text
Line_12 = "";
// Line 13 of braille text
Line_13 = "";
// Line 14 of braille text
Line_14 = "";
// Line 15 of braille text
Line_15 = "";
// Line 16 of braille text
Line_16 = "";
// Line 17 of braille text
Line_17 = "";
// Line 18 of braille text
Line_18 = "";
// Line 19 of braille text
Line_19 = "";
// Line 20 of braille text
Line_20 = "";

/* [Card Size] */
// Auto-size the card face to fit the braille text plus margins. Turn Off to use the manual width/height below.
auto_size_card = "On"; // [On, Off]
// Margin between the braille block and the card edges when auto-sizing (mm)
auto_size_margin_mm = 6;     // [2:0.5:20]
// Manual face width (mm) - only used when auto_size_card = Off
card_face_width_mm = 200;    // [40:1:300]
// Manual face height (mm) - only used when auto_size_card = Off
card_face_height_mm = 100;   // [25:1:250]

/* [Multi-Card Layout] */
// Render one card (the Line_N text as a single card) or chunk the lines into
// groups of rows_per_card and print every card in one file, laid out front to
// back on the bed.
card_layout = "Single";      // [Single, All cards]
// Braille rows on each card in All-cards mode (chunking mirrors the web
// panel's card splitting: sequential groups, blank lines included).
rows_per_card = 8;           // [1:1:20]
// Gap between neighbouring card footprints in All-cards mode (mm)
card_gap_mm = 5;             // [0:0.5:50]

/* [Warnings] */
// Show red 3D warning text above the card when input has problems. Warnings are preview-only and are NEVER exported to the STL.
show_warnings = "Off"; // [On, Off]

/* [Support Fins] */
// Master toggle for the entire break-away support-fin structure. When Off the
// bare leaning card is exported (you must then add slicer supports yourself).
support_fins = "On";         // [On, Off]
// Spacing between fins across the card width (mm). End fins at both outer edges
// are always added on top of this interval (per masukomi's "side fins" lesson).
// At the max interval only the two edge fins remain (2 minimum); at the min a
// fin lands every millimetre (hundreds across a wide card).
fin_interval_mm = 25;        // [1:0.5:200]
// Horizontal gap between the card's back face and the fin (mm) — the break-away
// gap that the bridges span. ~1 mm per masukomi.
fin_offset_mm = 1.0;         // [0.2:0.05:10]
// Fin prism thickness along X (mm). Keep a multiple of nozzle width (e.g. 0.4/0.8).
fin_thickness_mm = 1.2;      // [0.2:0.05:10]
// Fin height as a fraction of the card height (1.0 = full height; auto-matches
// the card height/angle).
fin_height_frac = 1.0;       // [0.05:0.01:1]
// Number of break-away bridges up each fin (the "contact points" dial).
bridge_count = 6;            // [1:1:60]
// Bridge size along X (mm).
bridge_width_mm = 0.5;       // [0.2:0.05:8]
// Bridge size along Z (mm).
bridge_height_mm = 0.5;      // [0.2:0.05:8]
// How far each bridge actually merges into the card face (mm) — the true
// break-off contact. Research says 0.3-0.4 mm: connects during print, snaps off clean.
bridge_contact_mm = 0.3;     // [0.1:0.05:3]
// Built-in brim flange width around each fin base (mm; 0 = no brim).
brim_width_mm = 2.0;         // [0:0.25:25]
// Brim layer thickness (mm, ~1-2 layers).
brim_thickness_mm = 0.2;     // [0.1:0.05:3]

/* [Expert Mode - Shape Selection] */
// Shape of the raised braille dots
dot_shape = "Rounded"; // [Rounded, Cone]

/* [Expert Mode - Card Shape] */
// Face angle from horizontal bed (deg). 75 = 15 deg lean back from vertical =
// CHI sweet spot. The base footprint is derived from this angle + height.
face_angle_deg = 75;         // [60:1:90]
// Flat card thickness (mm). 1.5-2 mm prints rigid; thinner saves filament but
// is whippier during the print.
card_thickness_mm = 1;       // [1:0.1:5]

/* [Expert Mode - Braille Spacing] */
// Text capacity in braille cells per row (ignored when auto_size_card = On)
grid_columns = 26;           // [1:1:40]
// Number of lines of braille (ignored when auto_size_card = On)
grid_rows = 8;               // [1:1:20]
// Horizontal spacing between cells (mm)
cell_spacing = 7.0;          // [2:0.01:15]
// Vertical spacing between lines (mm)
line_spacing = 10.0;         // [5:0.01:25]
// Spacing between dots within a cell (mm)
dot_spacing = 2.5;           // [1:0.01:5]

// --- Braille Positioning ---
// Braille is centered on the face by default; these are additive nudges.
// Horizontal adjustment of braille pattern (mm)
braille_x_adjust = 0.0;      // [-20:0.01:20]
// Vertical (down-the-slope) adjustment of braille pattern (mm)
braille_y_adjust = 0.0;      // [-20:0.01:20]

/* [Braille Dot Shape - Rounded] */
// Defaults chosen to stay ADA-legal: base_height + dome_height <= 0.9 mm.
// Rounded dot base diameter / cone base (mm)
rounded_dot_base_diameter = 1.6; // [0.5:0.01:3]
// Rounded dot base height / cone height (mm)
rounded_dot_base_height   = 0.35; // [0:0.01:2]
// Rounded dome diameter, linked to cone flat top (mm)
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
// Number of segments for cone shapes (8-32 recommended)
cone_segments = 40; // [8:1:64]

/* [Hidden] */
$fn = 32;

// =============================================================================
// CALCULATED VALUES (Do not modify)
// =============================================================================

// Normalize dropdown selections to internal values
use_rounded_dots = (dot_shape == "Rounded");

fins_on = (support_fins == "On") || (support_fins == true);

warnings_on = (show_warnings == "On") || (show_warnings == true);

quality_fn = (render_quality == "Low")    ? 24 :
             (render_quality == "Medium") ? 32 :
             (render_quality == "High")   ? 64 : 32;

// --- Content metrics (actual typed text, not grid capacity) ---
// _all_lines is the SINGLE SOURCE OF TRUTH for the text content. Every loop,
// warning, and layout module iterates this list — never Line_N directly.
// To extend beyond 20 lines: declare `Line_21 = "";` (etc.) in the text-input
// section above, append it here, and raise the grid_rows slider max to match.
_all_lines = [Line_1,  Line_2,  Line_3,  Line_4,  Line_5,
              Line_6,  Line_7,  Line_8,  Line_9,  Line_10,
              Line_11, Line_12, Line_13, Line_14, Line_15,
              Line_16, Line_17, Line_18, Line_19, Line_20];
// Longest line in braille cells (0 when all lines are empty)
content_max_len = max([for (l = _all_lines) len(l)]);
// Rows spanned by content = index of last non-empty line + 1
// (preserves intentional blank lines between non-empty lines)
_nonempty_idx = [for (i = [0:len(_all_lines)-1]) if (len(_all_lines[i]) > 0) i];
content_rows = len(_nonempty_idx) == 0 ? 0 : _nonempty_idx[len(_nonempty_idx) - 1] + 1;

auto_size_on = (auto_size_card == "On");
multi_card_on = (card_layout == "All cards");

// Number of cards in All-cards mode. Chunking mirrors chunkIntoCards() in the
// web app's braille-wrap.js EXACTLY: sequential groups of rows_per_card lines,
// blank lines included, trailing blanks excluded (content_rows already stops
// at the last non-empty line). Empty content still yields one (empty) card.
cards_count = multi_card_on ? max(1, ceil(content_rows / rows_per_card)) : 1;

// Lines belonging to card k (0-based) in All-cards mode.
function card_lines(k) =
    let(lo = k * rows_per_card, hi = min((k + 1) * rows_per_card, content_rows))
    lo >= hi ? [] : [for (i = [lo : hi - 1]) _all_lines[i]];

// In auto mode, grid capacity == content (so TEXT TOO LONG / TOO MANY LINES cannot occur)
// In All-cards mode, each card's row capacity is rows_per_card by definition.
effective_grid_columns = auto_size_on ? max(content_max_len, 1) : grid_columns;
effective_grid_rows    = multi_card_on ? rows_per_card
                       : auto_size_on  ? max(content_rows, 1)
                       : grid_rows;

// Total dot height above the face (used for seating dots on the face surface).
dot_total_height = use_rounded_dots
    ? (rounded_dot_base_height + rounded_dot_dome_height)
    : cone_dot_height;

// How deep each dot is buried into the face (mm). A dot seated EXACTLY on the
// face plane only touches it (zero overlap), which can leave the dot as a
// separate floating shell in the exported STL. A tiny embed guarantees the
// union genuinely fuses; the 0.02 mm protrusion loss is far below print
// tolerance.
DOT_FACE_EMBED = 0.02;

// Spacing pass-through aliases (`active_*` naming kept for readability in the
// geometry modules below).
active_grid_columns  = effective_grid_columns;
active_grid_rows     = effective_grid_rows;
active_cell_spacing  = cell_spacing;
active_line_spacing  = line_spacing;
active_dot_spacing   = dot_spacing;

// Grid dimensions (capacity extents, center-to-center)
grid_width  = (active_grid_columns - 1) * active_cell_spacing;
grid_height = (active_grid_rows - 1) * active_line_spacing;

// Rendered content extent (what is actually drawn after capacity truncation).
// In All-cards mode the shared face is sized for the TALLEST card (the widest
// line anywhere already governs the columns), so every card matches.
rendered_cols = min(content_max_len, active_grid_columns);
rendered_rows = multi_card_on
    ? min(content_rows, rows_per_card)
    : min(content_rows, active_grid_rows);
// Center-to-center extents of the rendered block; empty text falls back to capacity
content_width  = (rendered_cols == 0) ? grid_width  : (rendered_cols - 1) * active_cell_spacing;
content_height = (rendered_rows == 0) ? grid_height : (rendered_rows - 1) * active_line_spacing;

// Per-cell dot offsets — planar (X/Y). `dot_positions[i]` is `[row, col]`
// where row 0/1/2 = top/middle/bottom of the braille cell and col 0/1 =
// left/right column. In our face-local frame, +Y is down-the-slope (see
// face_transform()), so row 0 gets a NEGATIVE Y offset to sit at the TOP of
// the cell.
dot_col_x_offsets = [-active_dot_spacing / 2, +active_dot_spacing / 2];
dot_row_y_offsets = [-active_dot_spacing,      0,                     +active_dot_spacing];
dot_positions     = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

// -----------------------------------------------------------------------------
// Leaning-card geometry (calculated) — flat sheared slab on the bed
// -----------------------------------------------------------------------------
// The card is a thin flat slab leaning back at face_angle_deg, sitting on the bed
// exactly as it sits on a desk = as it prints. Global axes: +X = card width,
// +Y = forward (toward the reader / outward face normal direction), +Z = up. The
// card leans back as z rises (its top tips toward -Y); the reading (braille) face
// is the +Y/up face, and the back face is the down-facing OVERHANG that the fins
// support.
//
//   C (0, card_height)            <- face TOP (origin of face_transform())
//    |\
//    | \   reading/braille face (+Y normal), leans back
//    |  \
//    |   \
//    |    B (base_run, 0)         = face BOTTOM, on the bed
//    +-------------------> Y
//
// With the reading face as the leaning edge of length effective_card_face_height_mm:
//   card_height = effective_card_face_height_mm * sin(face_angle_deg)  (vertical height H)
//   base_run    = effective_card_face_height_mm * cos(face_angle_deg)  (horizontal run R)
// The slab has thickness card_thickness_mm measured horizontally (along Y) — i.e.
// the cross-section is a parallelogram sheared in Y, with flat top/bottom edges
// resting parallel to the bed. For 75 deg, base_run / card_height = 1/tan(75) =
// ~0.27. Fins (not the body) provide all print stability.
//
// Effective card face dimensions: auto-sized from the braille block (content
// extent + dot overhang + margins) when auto_size_card = On, otherwise the
// manual sliders. The Customizer can't write computed values back into the
// sliders, so the effective size is reported via echo() instead.
// Outermost dot extent beyond cell centers: half a dot column/row pitch + largest dot radius
_max_dot_dia = max([rounded_dot_base_diameter, cone_dot_base_diameter]);
_block_w = content_width  + active_dot_spacing     + _max_dot_dia; // dot columns at +/- dot_spacing/2
_block_h = content_height + 2 * active_dot_spacing + _max_dot_dia; // dot rows at +/- dot_spacing

effective_card_face_width_mm  = auto_size_on
    ? max(_block_w + 2 * auto_size_margin_mm, 30)   // 30 mm floor keeps the card printable
    : card_face_width_mm;
effective_card_face_height_mm = auto_size_on
    ? max(_block_h + 2 * auto_size_margin_mm, 20)   // 20 mm floor
    : card_face_height_mm;

card_height = effective_card_face_height_mm * sin(face_angle_deg);
base_run    = effective_card_face_height_mm * cos(face_angle_deg);

// Y of the card's BACK face at height z, used to place break-away bridges. The
// front (reading) face runs from B=(base_run,0) up to C=(0,card_height); the back
// face is that line shifted -card_thickness_mm in Y.
function back_y(z) = base_run * (1 - z / card_height) - card_thickness_mm;

// --- Multi-card footprint pitch ---------------------------------------------
// One card's bed footprint along Y runs from the front bottom edge (y =
// base_run) back to the card rear (y = -card_thickness_mm), extended by the
// fin offset and brim flange when fins are on. In All-cards mode successive
// cards step back along -Y by this depth plus card_gap_mm, so neighbouring
// footprints are separated by exactly card_gap_mm.
_footprint_back_y = fins_on
    ? -card_thickness_mm - fin_offset_mm - brim_width_mm
    : -card_thickness_mm;
card_footprint_depth_mm = base_run - _footprint_back_y;
card_pitch_mm = card_footprint_depth_mm + card_gap_mm;
// Total bed depth used by the whole All-cards layout
multi_total_depth_mm = cards_count * card_footprint_depth_mm
                     + (cards_count - 1) * card_gap_mm;

// =============================================================================
// HELPER FUNCTIONS
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

// =============================================================================
// DOT CREATION MODULE
// =============================================================================
// `braille_dot_centered()` builds the dot at the origin with its central
// axis on +Z and total height centred at z = 0. To sit on a surface, the
// caller translates by +totalHeight/2.
module braille_dot_centered() {
    if (use_rounded_dots) {
        _total_height = rounded_dot_base_height + rounded_dot_dome_height;
        _dome_r = rounded_dot_dome_diameter / 2;
        _R_sphere = (_dome_r * _dome_r + rounded_dot_dome_height * rounded_dot_dome_height) / (2 * rounded_dot_dome_height);
        _center_z = rounded_dot_base_height + rounded_dot_dome_height - _R_sphere;
        // The base cylinder is extended a hair up INTO the dome. The dome's
        // bottom plane coincides exactly with the base top; with zero overlap
        // the two tessellations only touch and can export as two separate
        // shells. The overlap makes the union genuinely fuse; the resulting
        // silhouette change is a few microns.
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
// FACE-LOCAL COORDINATE FRAME
// =============================================================================
// face_transform() places its children in a face-local frame whose +X axis is
// the face width direction, +Y axis is DOWN-THE-SLOPE (so row 0 of the braille
// grid sits at the TOP of the face), and +Z axis is the OUTWARD face normal.
//
// The origin is the centre of the reading face's TOP edge, the top-front corner
// C of the leaning slab. In global coordinates that point is (0, 0, card_height).
//
// A rotation of -face_angle_deg about +X is the unique single-axis rotation
// that maps local +Z to the outward face normal (0, sin(face), cos(face))
// while keeping the frame right-handed. Local +Y then necessarily points
// down-the-slope (this is the reason `dot_row_y_offsets` puts row 0 at a
// negative offset).
module face_transform() {
    translate([0, 0, card_height])
        rotate([-face_angle_deg, 0, 0])
            children();
}

// =============================================================================
// CARD BODY + SUPPORT FIN MODULES
// =============================================================================

// Extrude a Y-Z profile across global X. linear_extrude builds in local XY and
// grows along local +Z; rotate([90,0,90]) maps local (x,y,z) -> global (z,x,y),
// so the 2D profile (drawn as [y_global, z_global]) lands in the global Y-Z plane
// and the extrusion thickness runs along global +X.
module yz_prism(profile, x_start, width) {
    translate([x_start, 0, 0])
        rotate([90, 0, 90])
            linear_extrude(height = width)
                polygon(profile);
}

// --- Flat leaning card body --------------------------------------------------
//
// Side profile in the Y-Z plane (constant X) is a parallelogram sheared in Y, so
// the slab leans back at face_angle_deg while resting flat on the bed. Vertices
// CCW, with t = card_thickness_mm:
//   B' (base_run - t, 0)        — back-bottom (on the bed)
//   B  (base_run,     0)        — front-bottom (face bottom, on the bed)
//   C  (0,            card_height) — front-top (face top = face_transform origin)
//   C' (-t,           card_height) — back-top
// Edge B->C is the reading face at face_angle_deg; edge C'->B' is the back/under
// overhang the fins support. Both top and bottom edges are flat (parallel to bed).
CARD_TRAP = [
    [base_run - card_thickness_mm, 0],
    [base_run,                     0],
    [0,                            card_height],
    [-card_thickness_mm,           card_height]
];

module card_body() {
    yz_prism(CARD_TRAP, -effective_card_face_width_mm / 2, effective_card_face_width_mm);
}

// --- Break-away support fins -------------------------------------------------
//
// Each fin is a right-triangle prism standing fin_offset_mm behind the card's
// back face, with the right angle at the (vertical) back spine. Side profile
// (Y-Z), CCW, with t = card_thickness_mm, g = fin_offset_mm,
// fh = fin_height_frac * card_height:
//   back-bottom  (-t - g,            0)
//   inner-bottom (base_run - t - g,  0)   — toward the card, on the bed
//   top          (-t - g,            fh)  — meets the back spine at the top
// Base run = base_run, height = fh, so the hypotenuse runs parallel to the card
// back at the offset g (auto-matching the card's height/angle).
function fin_top_z() = fin_height_frac * card_height;

module support_fin_2d() {
    polygon([
        [-card_thickness_mm - fin_offset_mm,            0],
        [base_run - card_thickness_mm - fin_offset_mm,  0],
        [-card_thickness_mm - fin_offset_mm,            fin_top_z()]
    ]);
}

// One fin prism centred on column x (thickness fin_thickness_mm along X).
module support_fin(x) {
    translate([x - fin_thickness_mm / 2, 0, 0])
        rotate([90, 0, 90])
            linear_extrude(height = fin_thickness_mm)
                support_fin_2d();
}

// Flat brim flange under one fin: a thin slab covering the fin's bed footprint in
// Y, expanded by brim_width_mm on each side in X and Y, from z=0 up brim_thickness.
module fin_brim(x) {
    if (brim_width_mm > 0 && brim_thickness_mm > 0) {
        // Fin footprint in Y at the bed: from the back spine to the inner-bottom.
        y_back  = -card_thickness_mm - fin_offset_mm;
        y_front = base_run - card_thickness_mm - fin_offset_mm;
        y_lo = min(y_back, y_front) - brim_width_mm;
        // Stop the brim just short of the card's bottom-back corner: a brim
        // face exactly tangent to that corner line would export as a
        // non-manifold (self-touching) boundary. The bridges already join the
        // fin structure to the card, so the brim does not need to reach it.
        y_hi = min(max(y_back, y_front) + brim_width_mm,
                   base_run - card_thickness_mm - 0.05);
        translate([x - fin_thickness_mm / 2 - brim_width_mm, y_lo, 0])
            cube([fin_thickness_mm + 2 * brim_width_mm, y_hi - y_lo, brim_thickness_mm]);
    }
}

// Break-away bridges for the fin at column x: bridge_count small boxes climbing
// the gap, each merging bridge_contact_mm into the card back face and overlapping
// the fin so the union is one manifold solid. Bridge heights are spread evenly
// over [z_lo, fin top], starting clear of the bed.
module bridges(x) {
    eps   = 0.01;
    // Keep the top bridge's top face strictly below the fin/card top plane:
    // an exactly-coplanar bridge top exports as a non-manifold tangency.
    top_clear = 0.1;
    // Start clear of the bed/brim, but clamp to the fin top so bridges never
    // sit above the fin (short cards / small fin_height_frac would otherwise
    // leave floating prongs attached to nothing).
    z_lo  = min(max(bridge_height_mm, 2),
                max(fin_top_z() - bridge_height_mm / 2 - top_clear, bridge_height_mm / 2));
    // Clamp so small fin_height_frac (short fins) can't invert the bridge span.
    z_hi  = max(z_lo, fin_top_z() - bridge_height_mm / 2 - top_clear);
    for (k = [0 : bridge_count - 1]) {
        z_k = (bridge_count == 1)
            ? (z_lo + z_hi) / 2
            : z_lo + (z_hi - z_lo) * k / (bridge_count - 1);
        // Span from inside the card face (back_y(z) + contact) all the way back to
        // the fin's vertical back spine, so the box always overlaps the fin solid
        // (true for any fin_height_frac) and the union stays one manifold piece.
        y_far  = -card_thickness_mm - fin_offset_mm - eps;  // through/into the fin
        y_near = back_y(z_k) + bridge_contact_mm;           // merged into the card
        translate([x - bridge_width_mm / 2, y_far, z_k - bridge_height_mm / 2])
            cube([bridge_width_mm, y_near - y_far, bridge_height_mm]);
    }
}

// Fin X column positions across the width: stepped by fin_interval_mm and forced
// to include both outer edges (masukomi's "side fins" so the edges don't float).
function fin_x_positions() =
    let(
        half  = effective_card_face_width_mm / 2,
        n     = max(1, floor(effective_card_face_width_mm / fin_interval_mm)),
        inner = [for (i = [0 : n]) -half + i * fin_interval_mm]
    )
    // Always include the two edges; de-dup any inner column within eps of an edge.
    concat(
        [-half],
        [for (xi = inner) if (xi > -half + 1e-3 && xi < half - 1e-3) xi],
        [half]
    );

// Full fin structure: fins + brims + bridges at every column.
module support_fins_all() {
    for (x = fin_x_positions()) {
        support_fin(x);
        fin_brim(x);
        bridges(x);
    }
}

// =============================================================================
// FACE-LOCAL BRAILLE LAYOUT
// =============================================================================
// All of the modules below run inside face_transform(): local +X = width
// (centred at 0), local +Y = down-the-slope (0 = face top, +grid_height = face
// bottom), local +Z = outward. y_pos = vertical centre of a row in this frame.

// Vertical centre of a braille row in face-local Y. row 0 = top. Centers a
// content block of the given height on the (effective) face;
// braille_y_adjust is an additive nudge on top (default 0 = centered).
function face_row_y(row, block_height = content_height) =
    (effective_card_face_height_mm - block_height) / 2
    + row * active_line_spacing
    + braille_y_adjust;

// Horizontal centre of a grid column in face-local X. Lines are left-aligned
// within the block; the block is centered by the longest line.
// braille_x_adjust is an additive nudge on top (default 0 = centered).
function face_col_x(col, block_width = content_width) =
    -block_width/2 + col * active_cell_spacing + braille_x_adjust;

// Place raised dots for a list of braille lines, centred on the face. The
// content metrics are computed from the given lines (so in All-cards mode
// each card centres its OWN chunk exactly as it would render on its own),
// while truncation still honours the shared grid capacity.
module place_face_dots_for_lines(lines) {
    if (len(lines) > 0) {
        _ml = max([for (l = lines) len(l)]);
        _ne = [for (i = [0:len(lines)-1]) if (len(lines[i]) > 0) i];
        _rows = len(_ne) == 0 ? 0 : _ne[len(_ne) - 1] + 1;
        _cols_r = min(_ml, active_grid_columns);
        _rows_r = min(_rows, active_grid_rows);
        _block_width  = (_cols_r == 0) ? grid_width  : (_cols_r - 1) * active_cell_spacing;
        _block_height = (_rows_r == 0) ? grid_height : (_rows_r - 1) * active_line_spacing;
        for (row = [0 : min(active_grid_rows - 1, len(lines) - 1)]) {
            if (len(lines[row]) > 0) {
                y_pos = face_row_y(row, _block_height);
                for (col = [0 : min(active_grid_columns - 1, len(lines[row]) - 1)]) {
                    x_cell = face_col_x(col, _block_width);
                    dots = get_dot_pattern(lines[row][col]);
                    for (i = [0:5]) {
                        if (dots[i] == 1) {
                            dot_pos = dot_positions[i];
                            dot_x = x_cell + dot_col_x_offsets[dot_pos[1]];
                            dot_y = y_pos  + dot_row_y_offsets[dot_pos[0]];
                            translate([dot_x, dot_y, dot_total_height / 2 - DOT_FACE_EMBED])
                                braille_dot_centered();
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// WARNING MODULES
// =============================================================================
// Each warning is wrapped in the `%` background modifier so it is visible in
// the F5 preview but EXCLUDED from the F6 render / STL export. Stacked into
// fixed slots; the whole system is gated by warnings_on (the [Warnings] tab).
//
// NOTE: the `%` modifier may render the text transparent gray instead of red in
// some OpenSCAD builds — acceptable; visibility plus export-exclusion is the goal.

// Warning text placement (above the card top)
INVALID_TEXT_Z_OFFSET   = 5;
INVALID_TEXT_SIZE       = 5;
INVALID_TEXT_DEPTH      = 2;
INVALID_TEXT_STACK_GAP  = 8;

module warning_slot(k, msg) {
    translate([0, base_run/2, card_height + INVALID_TEXT_Z_OFFSET + k * INVALID_TEXT_STACK_GAP])
        %color("red")
            linear_extrude(height = INVALID_TEXT_DEPTH)
                text(msg, size = INVALID_TEXT_SIZE, halign = "center", valign = "center");
}

module warnings_3d() {
    _invalid = len([for (l = _all_lines) if (has_invalid_chars(l)) 1]) > 0;
    _too_long = content_max_len > active_grid_columns;
    // In All-cards mode extra rows overflow onto more cards by design.
    _too_many = !multi_card_on && content_rows > active_grid_rows;
    if (warnings_on && _invalid) warning_slot(0, "INVALID CHARACTERS");
    if (warnings_on && _too_long) warning_slot(1, "TEXT TOO LONG");
    if (warnings_on && _too_many) warning_slot(2, "TOO MANY LINES");
}

// =============================================================================
// TOP-LEVEL CARD
// =============================================================================

// READING ORIENTATION
// -------------------
// On this back-leaning face, face-local +X maps to the reader's LEFT, so the
// raw layout would read right-to-left. The content is therefore mirrored in
// face-local X so the finished card reads correctly left-to-right.
module braille_card(lines) {
    union() {
        card_body();
        // Raised dots on the outer face surface (mirrored to read L->R).
        face_transform()
            mirror([1, 0, 0])
                place_face_dots_for_lines(lines);
    }
}

// =============================================================================
// CONSOLE DIAGNOSTICS  (always printed; independent of the 3D warning toggle)
// =============================================================================
echo(str("Content: ", content_rows, " lines, longest ", content_max_len, " cells"));
echo(str("Card face (effective): ", effective_card_face_width_mm, " x ",
         effective_card_face_height_mm, " mm",
         auto_size_on ? " [auto-sized - manual sliders ignored]" : " [manual]"));
if (multi_card_on)
    echo(str("Multi-card layout: ", cards_count, " card(s) of up to ",
             rows_per_card, " rows, ", card_gap_mm,
             " mm apart; total bed depth ", multi_total_depth_mm, " mm"));

// Print-bed sanity check (many consumer printers have ~220-256 mm beds)
if (effective_card_face_width_mm > 250 || effective_card_face_height_mm > 250)
    echo(str("WARNING: effective card face (", effective_card_face_width_mm, " x ",
             effective_card_face_height_mm,
             " mm) may exceed common print beds. Shorten lines, reduce the",
             " margin, or split the text across multiple cards."));
if (multi_card_on && multi_total_depth_mm > 250)
    echo(str("WARNING: the All-cards layout needs ", multi_total_depth_mm,
             " mm of bed depth, which may exceed common print beds. Reduce",
             " card_gap_mm, raise rows_per_card, or print cards singly."));

// Per-line invalid characters (actionable: where to re-translate)
for (i = [0:len(_all_lines)-1])
    if (has_invalid_chars(_all_lines[i]))
        echo(str("WARNING: Line ", i + 1, " contains non-braille characters. ",
                 "Re-translate at branah.com with Unicode Braille output."));

// Per-line over capacity (only meaningful in manual mode; auto mode can't overflow)
for (i = [0:len(_all_lines)-1])
    if (!auto_size_on && len(_all_lines[i]) > active_grid_columns)
        echo(str("WARNING: Line ", i + 1, " is ", len(_all_lines[i]),
                 " cells but capacity is ", active_grid_columns,
                 ". Increase grid_columns, shorten the line, or set auto_size_card = On."));

// Too many lines (manual mode; All-cards mode overflows onto more cards)
if (!auto_size_on && !multi_card_on && content_rows > active_grid_rows)
    echo(str("WARNING: text uses ", content_rows, " lines but grid_rows is ",
             active_grid_rows, ". Increase grid_rows, set auto_size_card = On,",
             " or set card_layout = All cards."));

// Support fin count feedback
if (fins_on)
    echo(str("Support fins: ", len(fin_x_positions()), " at ", fin_interval_mm, " mm interval"));

// Cheap, high-confidence sanity checks
if (cell_spacing < dot_spacing * 2)
    echo(str("WARNING: cell_spacing (", cell_spacing, ") < dot_spacing*2 (",
             dot_spacing * 2, "); braille cells will overlap."));
if (line_spacing < dot_spacing * 2 + _max_dot_dia)
    echo(str("WARNING: line_spacing (", line_spacing, ") < dot_spacing*2 + dot diameter (",
             dot_spacing * 2 + _max_dot_dia, "); braille rows will collide."));

// =============================================================================
// MAIN RENDERING
// =============================================================================
// Each card (body + braille) is fused with its break-away support-fin
// structure into a single solid so it slices as one print-ready object. In
// All-cards mode the cards march back along -Y, one footprint plus
// card_gap_mm apart, so the full set prints in one job.
//
// The whole model is spun 180 deg about the vertical Z axis so the braille
// reading face points toward the default front view (-Y) instead of away
// from it. This is a pure rotation about the print's vertical axis, so bed
// contact, the lean, and the support fins are all unchanged — it still
// prints exactly as modeled.
rotate([0, 0, 180])
union() {
    for (k = [0 : cards_count - 1]) {
        translate([0, -k * card_pitch_mm, 0]) {
            braille_card(multi_card_on ? card_lines(k) : _all_lines);
            if (fins_on) {
                support_fins_all();
            }
        }
    }
    warnings_3d();
}

// End of file
