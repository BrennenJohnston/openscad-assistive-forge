// Braille Cylinder STL Generator (OpenSCAD)
// Generates embossing plates and counter plates for cylindrical objects
//
// =============================================================================
// WHAT THIS MAKES
// =============================================================================
//  • Cylinder Emboss Plate (Raised Dots) — dots on outer cylinder surface
//  • Cylinder Counter Plate (Hemispherical Recesses) — recesses on outer surface
//
// =============================================================================
// BEFORE YOU START
// =============================================================================
//  • Install OpenSCAD and open this .scad file
//  • In OpenSCAD, open View → Customizer to access all parameters
//  • This version requires pre-translated Unicode braille (no automatic translation)
//  • All parameters match the web-based generator UI for consistency
//
// =============================================================================
// TRANSLATE YOUR TEXT (REQUIRED) — BRANAH WORKFLOW
// =============================================================================
//  This OpenSCAD version does NOT include automatic translation. You must:
//  
//  1. Go to https://www.branah.com/braille-translator
//  2. In the options, select your desired braille grade:
//     - Grade 2 (contracted): Recommended for most uses
//     - Grade 1 (uncontracted): For names, emails, or when contractions cause confusion
//  3. Select Unicode Braille output (NOT ASCII Braille)
//  4. Type your English text in the left box
//  5. Copy the braille output (right box showing characters like ⠓⠑⠇⠇⠕)
//  6. In OpenSCAD's Customizer, paste into the Line_1, Line_2, etc. fields
//
//  IMPORTANT: If you paste ordinary English letters or see "INVALID CHARACTERS"
//  warning, re-translate on Branah and ensure Unicode Braille is selected.
//
// =============================================================================
// QUICK START GUIDE
// =============================================================================
//  1. Translate your text at https://www.branah.com/braille-translator
//  2. Paste pre-translated braille into Line_1, Line_2, etc.
//  3. Choose plate_type: Embossing Plate or Counter Plate
//  4. Choose dot_shape: Rounded or Cone (affects both plates)
//  5. Adjust dimensions in Expert Mode if needed
//  6. Render (F6) → File → Export → STL
//
// =============================================================================
// PARAMETER ORGANIZATION
// =============================================================================
//  Parameters are organized to match the web-based generator:
//
//  MAIN CONTROLS (always visible):
//  • Text Input - Pre-Translated Braille
//  • Plate Selection
//
//  EXPERT MODE (expandable submenus matching web UI):
//  • Expert Mode - Shape Selection (dot shapes, indicators)
//  • Expert Mode - Cylinder Dimensions
//  • Expert Mode - Braille Spacing (grid layout + positioning)
//  • Expert Mode - Braille Dot Adjustments (emboss/counter dimensions)
//
//  OPENSCAD-SPECIFIC:
//  • Rendering Quality
//
// =============================================================================
// REFERENCES
// =============================================================================
//  [1] Web-based Generator (with automatic translation): 
//      https://github.com/BrennenJohnston/braille-card-and-cylinder-stl-generator
//      https://braille-card-and-cylinder-stl-gener.vercel.app
//  [2] Branah Braille Translator: https://www.branah.com/braille-translator
//  [3] BANA — Size and Spacing: https://brailleauthority.org/size-and-spacing-braille-characters
//  [4] NLS — Specification 800: https://www.loc.gov/nls/
//  [5] 2010 ADA Standards: https://archive.ada.gov/
//
// =============================================================================
// ACKNOWLEDGMENTS
// =============================================================================
//  This OpenSCAD version is based on the web-based generator by Brennen Johnston.
//  Special thanks to Tobi Weinberg for the substantial time and effort volunteered
//  to help start the original project.
//
//  Original web app powered by Liblouis, an open-source professional braille
//  translator: https://liblouis.io/
// =============================================================================

/* [Text Input - Pre-Translated Braille] */
// Paste Unicode braille characters from https://www.branah.com/braille-translator
Line_1 = "⠓⠑⠇⠇⠕"; // First line of braille text
Line_2 = "⠺⠕⠗⠇⠙"; // Second line of braille text
Line_3 = ""; // Third line of braille text
Line_4 = ""; // Fourth line of braille text

/* [Plate Selection] */
// Choose which plate to generate
plate_type = "Embossing Plate"; // [Embossing Plate, Counter Plate]

/* [Paper Thickness Preset] */
// Preset optimized for paper thickness (sets multiple parameters below)
paper_thickness_preset = "0.4mm"; // [0.4mm, 0.3mm, Custom]

/* [Expert Mode - Shape Selection] */
// Braille Dot Shape (Emboss and Counter) - affects both plate types
dot_shape = "Rounded"; // [Rounded, Cone]
// Indicator Shapes (Emboss and Counter) - Row start/end markers
indicators = "On"; // [On, Off]

/* [Expert Mode - Cylinder Dimensions] */
cylinder_diameter_mm = 30.8; // [10:0.1:100] Cylinder outer diameter in mm
cylinder_height_mm = 52; // [20:1:150] Cylinder height in mm
polygon_cutout_radius_mm = 13.0; // [0:0.1:50] Polygonal cutout circumscribed radius (0 = no cutout)
polygon_cutout_points = 12; // [3:1:24] Number of sides/points for polygonal cutout
seam_offset_degrees = 0.0; // [0:1:360] Seam offset (degrees) — Rotates starting position around cylinder

/* [Expert Mode - Braille Spacing] */
// --- Braille Dimensions ---
grid_columns = 11; // [1:1:20] Number of braille cells per row available for text (2 cells reserved for indicators when On)
grid_rows = 4; // [1:1:10] Number of lines of braille
cell_spacing = 6.5; // [2:0.1:15] Horizontal spacing between cells (mm)
line_spacing = 10.0; // [5:0.1:25] Vertical spacing between lines (mm)
dot_spacing = 2.5; // [1:0.1:5] Spacing between dots within a cell (mm)

// --- Braille Positioning ---
braille_x_adjust = 0.0; // [-10:0.1:10] Horizontal adjustment of braille pattern (mm)
braille_y_adjust = 0.0; // [-10:0.1:10] Vertical adjustment of braille pattern (mm)

/* [Expert Mode - Braille Dot Adjustments] */
// --- Embossing Braille Dot Dimensions (Rounded Shape) ---
rounded_dot_base_diameter = 1.5; // [0.5:0.1:3] Rounded dot base diameter (cone base) (mm)
rounded_dot_base_height = 0.5; // [0:0.1:2] Rounded dot base height (cone height) (mm)
rounded_dot_dome_diameter = 1.0; // [0.5:0.1:3] Rounded dome diameter (linked to cone flat top) (mm)
rounded_dot_dome_height = 0.5; // [0.1:0.1:2] Rounded dot dome height (mm)

// --- Embossing Braille Dot Dimensions (Cone Shape) ---
emboss_dot_base_diameter = 1.5; // [0.5:0.1:3] Cone dot base diameter (mm)
emboss_dot_height = 0.8; // [0.3:0.1:2] Cone dot height (mm)
emboss_dot_flat_hat = 0.4; // [0.1:0.1:2] Cone dot flat hat diameter (mm)

// --- Counter Braille Recessed Dot Dimensions (Rounded Shape / Bowl) ---
bowl_counter_dot_base_diameter = 1.8; // [0.5:0.1:5] Bowl recess base diameter (mm)
counter_dot_depth = 0.8; // [0.1:0.1:2] Bowl recess depth (mm)

// --- Counter Braille Recessed Dot Dimensions (Cone Shape) ---
cone_counter_dot_base_diameter = 1.9; // [0.5:0.1:3] Cone recess base diameter (mm)
cone_counter_dot_height = 0.7; // [0.3:0.1:2] Cone recess height (mm)
cone_counter_dot_flat_hat = 1.0; // [0.1:0.1:2] Cone recess flat hat diameter (mm)

/* [Rendering Quality] */
// Sphere quality for rounded shapes
render_quality = "Medium"; // [Low, Medium, High]
// Cone segments for cone shapes (8-32 range recommended)
cone_segments = 16; // [8:1:64] Number of segments for cone shapes

/* [Hidden] */
$fn = 32; // Resolution for curved surfaces

// Mathematical constants
PI = 3.14159265359;

// =============================================================================
// PRESET VALUE CONSTANTS
// =============================================================================
// Source: Web app THICKNESS_PRESETS in public/index.html
// These values are applied when paper_thickness_preset is "0.4mm" or "0.3mm"

// --------- 0.4mm Preset (Thicker Paper, Larger Dots) ---------
// Spacing
_p04_grid_columns = 11;
_p04_grid_rows = 4;
_p04_cell_spacing = 6.5;
_p04_line_spacing = 10.0;
_p04_dot_spacing = 2.5;
_p04_braille_x_adjust = 0.0;
_p04_braille_y_adjust = 0.0;

// Emboss Rounded
_p04_rounded_dot_base_diameter = 1.5;
_p04_rounded_dot_base_height = 0.5;
_p04_rounded_dot_dome_diameter = 1.0;
_p04_rounded_dot_dome_height = 0.5;

// Emboss Cone
_p04_emboss_dot_base_diameter = 1.5;
_p04_emboss_dot_height = 0.8;
_p04_emboss_dot_flat_hat = 0.4;

// Counter Bowl
_p04_bowl_counter_dot_base_diameter = 1.8;
_p04_counter_dot_depth = 0.8;

// Counter Cone
_p04_cone_counter_dot_base_diameter = 1.9;
_p04_cone_counter_dot_height = 0.7;
_p04_cone_counter_dot_flat_hat = 1.0;

// Cylinder
_p04_cylinder_diameter_mm = 30.8;
_p04_cylinder_height_mm = 52;
_p04_polygon_cutout_radius_mm = 13;
_p04_polygon_cutout_points = 12;
_p04_seam_offset_degrees = 0.0;

// --------- 0.3mm Preset (Thinner Paper, Smaller Dots) ---------
// Spacing (same as 0.4mm)
_p03_grid_columns = 11;
_p03_grid_rows = 4;
_p03_cell_spacing = 6.5;
_p03_line_spacing = 10.0;
_p03_dot_spacing = 2.5;
_p03_braille_x_adjust = 0.0;
_p03_braille_y_adjust = 0.0;

// Emboss Rounded (smaller)
_p03_rounded_dot_base_diameter = 1.2;
_p03_rounded_dot_base_height = 0.4;
_p03_rounded_dot_dome_diameter = 0.8;
_p03_rounded_dot_dome_height = 0.4;

// Emboss Cone (smaller)
_p03_emboss_dot_base_diameter = 1.2;
_p03_emboss_dot_height = 0.6;
_p03_emboss_dot_flat_hat = 0.2;

// Counter Bowl (smaller)
_p03_bowl_counter_dot_base_diameter = 1.5;
_p03_counter_dot_depth = 0.5;

// Counter Cone (smaller)
_p03_cone_counter_dot_base_diameter = 1.5;
_p03_cone_counter_dot_height = 0.5;
_p03_cone_counter_dot_flat_hat = 0.8;

// Cylinder (same as 0.4mm)
_p03_cylinder_diameter_mm = 30.8;
_p03_cylinder_height_mm = 52;
_p03_polygon_cutout_radius_mm = 13;
_p03_polygon_cutout_points = 12;
_p03_seam_offset_degrees = 0.0;

// =============================================================================
// BACKWARD COMPATIBILITY - Test System Parameters
// =============================================================================
// The automated test system passes parameters via -D flags using these names.
// These hidden parameters allow the test system to work without modification.
//
// Usage: openscad -D 'combined_shape="rounded"' -D 'indicator_shapes="on"' ...
//
combined_shape = "";         // "rounded" or "cone" (from test system)
indicator_shapes = "";       // "on" or "off" (from test system)
hemisphere_quality = "";     // "low", "medium", "high" (from test system)
shape_type = "";             // "cylinder" (from test system, ignored - cylinder only)

// =============================================================================
// CALCULATED VALUES (Do not modify)
// =============================================================================

// Normalize dropdown selections to internal values
// Support both UI dropdowns (human-friendly) and test system parameters (lowercase)
is_emboss_plate = (plate_type == "positive") ? true :
                  (plate_type == "negative") ? false :
                  (plate_type == "Embossing Plate");

use_rounded_dots = (combined_shape == "rounded") ? true :
                   (combined_shape == "cone") ? false :
                   (dot_shape == "Rounded");

indicator_on = (indicator_shapes == "on") ? true :
               (indicator_shapes == "off") ? false :
               (indicators == "On");

// Map render quality to segment counts (support both UI and test system)
//
// NOTE: The braille embosser has 264+ small curved dots, each rendered as a sphere.
// Community $fn standards (Low=64, Medium=128, High=256) are for general models with
// few curved features. Using those here would produce 500K+ triangles.
//
// These values are calibrated specifically for braille dots:
// - Low (12): ~22K triangles, ~1 MB STL (matches desktop OpenSCAD default output)
// - Medium (16): ~35K triangles, ~1.7 MB STL
// - High (24): ~80K triangles, ~4 MB STL
//
// For smooth braille dots on FDM printers, Low (12) is usually sufficient since
// layer height masks faceting. Use Medium/High only for resin/SLA printing.
quality_fn = (hemisphere_quality == "low" || render_quality == "Low") ? 12 :
             (hemisphere_quality == "medium" || render_quality == "Medium") ? 16 :
             (hemisphere_quality == "high" || render_quality == "High") ? 24 : 12;

// =============================================================================
// PRESET ROUTING - Select preset vs. custom values
// =============================================================================
// These variables route between preset constants and user parameters based on
// paper_thickness_preset selection. Pattern: preset value if "0.4mm" or "0.3mm",
// otherwise use the user's manual parameter setting.

// Spacing parameters
_preset_grid_columns = (paper_thickness_preset == "0.4mm") ? _p04_grid_columns :
                       (paper_thickness_preset == "0.3mm") ? _p03_grid_columns :
                       grid_columns;

_preset_grid_rows = (paper_thickness_preset == "0.4mm") ? _p04_grid_rows :
                    (paper_thickness_preset == "0.3mm") ? _p03_grid_rows :
                    grid_rows;

_preset_cell_spacing = (paper_thickness_preset == "0.4mm") ? _p04_cell_spacing :
                       (paper_thickness_preset == "0.3mm") ? _p03_cell_spacing :
                       cell_spacing;

_preset_line_spacing = (paper_thickness_preset == "0.4mm") ? _p04_line_spacing :
                       (paper_thickness_preset == "0.3mm") ? _p03_line_spacing :
                       line_spacing;

_preset_dot_spacing = (paper_thickness_preset == "0.4mm") ? _p04_dot_spacing :
                      (paper_thickness_preset == "0.3mm") ? _p03_dot_spacing :
                      dot_spacing;

_preset_braille_x_adjust = (paper_thickness_preset == "0.4mm") ? _p04_braille_x_adjust :
                           (paper_thickness_preset == "0.3mm") ? _p03_braille_x_adjust :
                           braille_x_adjust;

_preset_braille_y_adjust = (paper_thickness_preset == "0.4mm") ? _p04_braille_y_adjust :
                           (paper_thickness_preset == "0.3mm") ? _p03_braille_y_adjust :
                           braille_y_adjust;

// Emboss Rounded parameters
_preset_rounded_dot_base_diameter = (paper_thickness_preset == "0.4mm") ? _p04_rounded_dot_base_diameter :
                                    (paper_thickness_preset == "0.3mm") ? _p03_rounded_dot_base_diameter :
                                    rounded_dot_base_diameter;

_preset_rounded_dot_base_height = (paper_thickness_preset == "0.4mm") ? _p04_rounded_dot_base_height :
                                  (paper_thickness_preset == "0.3mm") ? _p03_rounded_dot_base_height :
                                  rounded_dot_base_height;

_preset_rounded_dot_dome_diameter = (paper_thickness_preset == "0.4mm") ? _p04_rounded_dot_dome_diameter :
                                    (paper_thickness_preset == "0.3mm") ? _p03_rounded_dot_dome_diameter :
                                    rounded_dot_dome_diameter;

_preset_rounded_dot_dome_height = (paper_thickness_preset == "0.4mm") ? _p04_rounded_dot_dome_height :
                                  (paper_thickness_preset == "0.3mm") ? _p03_rounded_dot_dome_height :
                                  rounded_dot_dome_height;

// Emboss Cone parameters
_preset_emboss_dot_base_diameter = (paper_thickness_preset == "0.4mm") ? _p04_emboss_dot_base_diameter :
                                   (paper_thickness_preset == "0.3mm") ? _p03_emboss_dot_base_diameter :
                                   emboss_dot_base_diameter;

_preset_emboss_dot_height = (paper_thickness_preset == "0.4mm") ? _p04_emboss_dot_height :
                            (paper_thickness_preset == "0.3mm") ? _p03_emboss_dot_height :
                            emboss_dot_height;

_preset_emboss_dot_flat_hat = (paper_thickness_preset == "0.4mm") ? _p04_emboss_dot_flat_hat :
                              (paper_thickness_preset == "0.3mm") ? _p03_emboss_dot_flat_hat :
                              emboss_dot_flat_hat;

// Counter Bowl parameters
_preset_bowl_counter_dot_base_diameter = (paper_thickness_preset == "0.4mm") ? _p04_bowl_counter_dot_base_diameter :
                                         (paper_thickness_preset == "0.3mm") ? _p03_bowl_counter_dot_base_diameter :
                                         bowl_counter_dot_base_diameter;

_preset_counter_dot_depth = (paper_thickness_preset == "0.4mm") ? _p04_counter_dot_depth :
                            (paper_thickness_preset == "0.3mm") ? _p03_counter_dot_depth :
                            counter_dot_depth;

// Counter Cone parameters
_preset_cone_counter_dot_base_diameter = (paper_thickness_preset == "0.4mm") ? _p04_cone_counter_dot_base_diameter :
                                         (paper_thickness_preset == "0.3mm") ? _p03_cone_counter_dot_base_diameter :
                                         cone_counter_dot_base_diameter;

_preset_cone_counter_dot_height = (paper_thickness_preset == "0.4mm") ? _p04_cone_counter_dot_height :
                                  (paper_thickness_preset == "0.3mm") ? _p03_cone_counter_dot_height :
                                  cone_counter_dot_height;

_preset_cone_counter_dot_flat_hat = (paper_thickness_preset == "0.4mm") ? _p04_cone_counter_dot_flat_hat :
                                    (paper_thickness_preset == "0.3mm") ? _p03_cone_counter_dot_flat_hat :
                                    cone_counter_dot_flat_hat;

// Cylinder parameters
_preset_cylinder_diameter_mm = (paper_thickness_preset == "0.4mm") ? _p04_cylinder_diameter_mm :
                               (paper_thickness_preset == "0.3mm") ? _p03_cylinder_diameter_mm :
                               cylinder_diameter_mm;

_preset_cylinder_height_mm = (paper_thickness_preset == "0.4mm") ? _p04_cylinder_height_mm :
                             (paper_thickness_preset == "0.3mm") ? _p03_cylinder_height_mm :
                             cylinder_height_mm;

_preset_polygon_cutout_radius_mm = (paper_thickness_preset == "0.4mm") ? _p04_polygon_cutout_radius_mm :
                                   (paper_thickness_preset == "0.3mm") ? _p03_polygon_cutout_radius_mm :
                                   polygon_cutout_radius_mm;

_preset_polygon_cutout_points = (paper_thickness_preset == "0.4mm") ? _p04_polygon_cutout_points :
                                (paper_thickness_preset == "0.3mm") ? _p03_polygon_cutout_points :
                                polygon_cutout_points;

_preset_seam_offset_degrees = (paper_thickness_preset == "0.4mm") ? _p04_seam_offset_degrees :
                              (paper_thickness_preset == "0.3mm") ? _p03_seam_offset_degrees :
                              seam_offset_degrees;

// =============================================================================
// ACTIVE PARAMETERS - Final values used by geometry
// =============================================================================
// These variables provide the final parameter values used by the geometry code.
// They incorporate both preset routing (above) and shape-based routing (rounded vs cone).

// Active emboss dot parameters (based on shape selection, using preset-routed values)
active_emboss_base_diameter = use_rounded_dots ? _preset_rounded_dot_base_diameter : _preset_emboss_dot_base_diameter;
active_emboss_height = use_rounded_dots ? (_preset_rounded_dot_base_height + _preset_rounded_dot_dome_height) : _preset_emboss_dot_height;
active_emboss_top_diameter = use_rounded_dots ? _preset_rounded_dot_dome_diameter : _preset_emboss_dot_flat_hat;

// Active counter dot parameters (based on shape selection, using preset-routed values)
active_counter_base_diameter = use_rounded_dots ? _preset_bowl_counter_dot_base_diameter : _preset_cone_counter_dot_base_diameter;
active_counter_height = use_rounded_dots ? _preset_counter_dot_depth : _preset_cone_counter_dot_height;
active_counter_top_diameter = use_rounded_dots ? 0 : _preset_cone_counter_dot_flat_hat;

// Active spacing parameters (pass through from preset routing)
active_grid_columns = _preset_grid_columns;
active_grid_rows = _preset_grid_rows;
active_cell_spacing = _preset_cell_spacing;
active_line_spacing = _preset_line_spacing;
active_dot_spacing = _preset_dot_spacing;
active_braille_x_adjust = _preset_braille_x_adjust;
active_braille_y_adjust = _preset_braille_y_adjust;

// Active cylinder parameters (pass through from preset routing)
active_cylinder_diameter_mm = _preset_cylinder_diameter_mm;
active_cylinder_height_mm = _preset_cylinder_height_mm;
active_polygon_cutout_radius_mm = _preset_polygon_cutout_radius_mm;
active_polygon_cutout_points = _preset_polygon_cutout_points;
active_seam_offset_degrees = _preset_seam_offset_degrees;

// Grid dimensions (accounting for indicator shapes if enabled)
actual_grid_columns = indicator_on ? (active_grid_columns + 2) : active_grid_columns;
grid_width = (actual_grid_columns - 1) * active_cell_spacing;
grid_height = (active_grid_rows - 1) * active_line_spacing;
top_margin = (active_cylinder_height_mm - grid_height) / 2;

// Counter plate recess radii (spherical cap formula to match web generator)
// For a bowl recess: R = (a² + h²) / (2h) where a = opening radius, h = depth
// This ensures the opening diameter = bowl_counter_dot_base_diameter and depth = counter_dot_depth
_bowl_a = _preset_bowl_counter_dot_base_diameter / 2;
_bowl_h = _preset_counter_dot_depth;
bowl_recess_radius = (_bowl_a * _bowl_a + _bowl_h * _bowl_h) / (2 * _bowl_h);
bowl_center_offset = bowl_recess_radius - _bowl_h;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Check if a character is valid Unicode braille (U+2800 to U+28FF)
function is_braille_char(c) = (c >= 10240 && c <= 10495);

// Check if string contains invalid characters
function has_invalid_chars(str) = 
    len(str) == 0 ? false : 
    len([for (i = [0:len(str)-1]) if (!is_braille_char(ord(str[i]))) i]) > 0;

// Get the 6-dot pattern from a Unicode braille character
function get_dot_pattern(char) =
    let(code = ord(char))
    (code >= 10240 && code <= 10495) ?
        let(pattern = code - 10240)
        [
            (pattern % 2) >= 1 ? 1 : 0,              // Dot 1
            floor(pattern / 2) % 2 >= 1 ? 1 : 0,     // Dot 2
            floor(pattern / 4) % 2 >= 1 ? 1 : 0,     // Dot 3
            floor(pattern / 8) % 2 >= 1 ? 1 : 0,     // Dot 4
            floor(pattern / 16) % 2 >= 1 ? 1 : 0,    // Dot 5
            floor(pattern / 32) % 2 >= 1 ? 1 : 0     // Dot 6
        ]
    : [0,0,0,0,0,0]; // Empty pattern for non-braille

// =============================================================================
// INDICATOR SHAPE MODULES
// =============================================================================
//
// Reference: braille-card-and-cylinder-stl-generator/docs/specifications/
//   RECESS_INDICATOR_SPECIFICATIONS.md
//
// CRITICAL SEMANTICS:
// - Indicators are ALWAYS RECESSED (subtracted) for BOTH emboss and counter plates.
// - Cylinder layout (when indicators ON):
//     Column 0: Triangle marker (counter plate triangle rotated 180°)
//     Column 1: Rectangle placeholder (counter ALWAYS rectangle; emboss uses rect for braille input)
//
INDICATOR_TRIANGLE_DEPTH_EMBOSS = 0.6;
INDICATOR_RECT_DEPTH_EMBOSS = 0.5;

module indicator_triangle_2d(rotate_180 = false) {
    // Isosceles triangle with vertical base on LEFT, apex RIGHT (default).
    // When rotate_180=true, triangle is rotated 180° about its center.
    polygon(points = rotate_180 ?
        [
            [+active_dot_spacing/2, +active_dot_spacing],
            [+active_dot_spacing/2, -active_dot_spacing],
            [-active_dot_spacing/2, 0]
        ] :
        [
            [-active_dot_spacing/2, -active_dot_spacing],
            [-active_dot_spacing/2, +active_dot_spacing],
            [+active_dot_spacing/2, 0]
        ]
    );
}

module indicator_rectangle_2d() {
    // Rectangle is NOT centered on the cell center; it is centered at (x + dot_spacing/2, y).
    translate([active_dot_spacing/2, 0])
        square([active_dot_spacing, 2 * active_dot_spacing], center = true);
}

module indicator_triangle_prism_centered(depth, rotate_180 = false) {
    translate([0, 0, -depth/2])
        linear_extrude(height = depth)
            indicator_triangle_2d(rotate_180 = rotate_180);
}

module indicator_rectangle_prism_centered(depth) {
    translate([0, 0, -depth/2])
        linear_extrude(height = depth)
            indicator_rectangle_2d();
}

// Cylinder marker placement helper
module place_cylinder_marker(theta_deg, y_pos, cyl_radius, depth, overcut = 0.05) {
    radial_offset = cyl_radius - depth/2 + overcut;
    x = radial_offset * cos(theta_deg);
    y = radial_offset * sin(theta_deg);
    translate([x, y, y_pos])
        rotate([90, 0, theta_deg - 90])
            children();
}

// =============================================================================
// DOT CREATION MODULES
// =============================================================================

// Create an embossing braille dot CENTERED at origin for CYLINDER surface
// Geometry spans from -totalHeight/2 to +totalHeight/2 along Z axis
module braille_dot_centered() {
    _total_height = use_rounded_dots ? 
                    (_preset_rounded_dot_base_height + _preset_rounded_dot_dome_height) : 
                    _preset_emboss_dot_height;
    
    if (use_rounded_dots) {
        // Spherical cap formula: R = (r² + h²) / (2h)
        _dome_r = _preset_rounded_dot_dome_diameter / 2;
        _R_sphere = (_dome_r * _dome_r + _preset_rounded_dot_dome_height * _preset_rounded_dot_dome_height) / (2 * _preset_rounded_dot_dome_height);
        _center_z = _preset_rounded_dot_base_height + _preset_rounded_dot_dome_height - _R_sphere;
        
        // Center the combined geometry at Z=0
        translate([0, 0, -_total_height / 2]) {
            union() {
                // Frustum base
                translate([0, 0, _preset_rounded_dot_base_height / 2])
                cylinder(
                    h = _preset_rounded_dot_base_height,
                    r1 = _preset_rounded_dot_base_diameter / 2,
                    r2 = _preset_rounded_dot_dome_diameter / 2,
                    center = true,
                    $fn = cone_segments
                );
                // Dome: proper spherical cap
                intersection() {
                    translate([0, 0, _center_z])
                    sphere(r = _R_sphere, $fn = quality_fn);
                    translate([0, 0, _preset_rounded_dot_base_height + _R_sphere])
                    cube([_R_sphere * 4, _R_sphere * 4, _R_sphere * 2], center = true);
                }
            }
        }
    } else {
        // Cone frustum - already centered
        cylinder(
            h = _preset_emboss_dot_height,
            r1 = _preset_emboss_dot_base_diameter / 2,
            r2 = _preset_emboss_dot_flat_hat / 2,
            center = true,
            $fn = cone_segments
        );
    }
}

// Create a recess for counter plate (bowl or cone shape)
module counter_recess() {
    if (use_rounded_dots) {
        // Bowl recess (spherical cap)
        translate([0, 0, bowl_center_offset])
        sphere(r = bowl_recess_radius, $fn = quality_fn);
    } else {
        // Cone frustum recess
        translate([0, 0, -_preset_cone_counter_dot_height / 2])
        cylinder(
            h = _preset_cone_counter_dot_height,
            r1 = _preset_cone_counter_dot_flat_hat / 2,
            r2 = _preset_cone_counter_dot_base_diameter / 2,
            center = true,
            $fn = cone_segments
        );
    }
}

// =============================================================================
// CYLINDER MODULES
// =============================================================================

module cylinder_shell(cutout_rotate_deg = 0) {
    difference() {
        // Outer cylinder (64 segments to match web generator)
        cylinder(h = active_cylinder_height_mm, r = active_cylinder_diameter_mm / 2, center = true, $fn = 64);
        
        // Polygonal cutout if specified
        if (active_polygon_cutout_radius_mm > 0) {
            // Web UI: "Circumscribed Radius" but implementation uses inscribed radius
            cutout_circumradius = active_polygon_cutout_radius_mm / cos(180 / active_polygon_cutout_points);
            rotate([0, 0, cutout_rotate_deg])
                cylinder(h = active_cylinder_height_mm + 2, r = cutout_circumradius, $fn = active_polygon_cutout_points, center = true);
        }
    }
}

module cylinder_emboss_plate() {
    translate([0, 0, active_cylinder_height_mm/2]) {
        // Calculate angular spacing
        radius = active_cylinder_diameter_mm / 2;
        grid_angle = grid_width / radius;
        start_angle = -grid_angle / 2;
        cell_spacing_angle = active_cell_spacing / radius;

        // Dot positioning
        dot_spacing_angle = active_dot_spacing / radius;
        dot_col_angle_offsets = [-dot_spacing_angle / 2, dot_spacing_angle / 2];
        dot_row_offsets = [active_dot_spacing, 0, -active_dot_spacing];
        dot_positions = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];

        difference() {
            union() {
                // Base cylinder
                cylinder_shell(cutout_rotate_deg = -active_seam_offset_degrees);

                // Check for invalid characters
                invalid_found = has_invalid_chars(Line_1) || has_invalid_chars(Line_2) ||
                               has_invalid_chars(Line_3) || has_invalid_chars(Line_4);
                
                if (invalid_found) {
                    translate([0, 0, active_cylinder_height_mm/2 + 5])
                    color("red")
                    linear_extrude(height = 2)
                    text("INVALID CHARACTERS", size = 5, halign = "center", valign = "center");
                }
        
                // Create braille dots on cylinder surface
                lines = [Line_1, Line_2, Line_3, Line_4];
                
                for (row = [0 : min(active_grid_rows - 1, len(lines) - 1)]) {
                    if (len(lines[row]) > 0) {
                        y_pos = active_cylinder_height_mm/2 - top_margin - (row * active_line_spacing) + active_braille_y_adjust;
                        
                        for (col = [0 : min(active_grid_columns - 1, len(lines[row]) - 1)]) {
                            actual_col = indicator_on ? (col + 2) : col;
                            angle_rad = start_angle + (actual_col * cell_spacing_angle);
                            angle_deg = angle_rad * 180 / PI;
                            dots = get_dot_pattern(lines[row][col]);
                            
                            for (i = [0:5]) {
                                if (dots[i] == 1) {
                                    dot_pos = dot_positions[i];
                                    dot_angle_rad = angle_rad + dot_col_angle_offsets[dot_pos[1]];
                                    dot_angle_deg = dot_angle_rad * 180 / PI;
                                    dot_y = y_pos + dot_row_offsets[dot_pos[0]];
                                    
                                    x = (radius + active_emboss_height/2) * cos(dot_angle_deg);
                                    y = (radius + active_emboss_height/2) * sin(dot_angle_deg);
                                    
                                    translate([x, y, dot_y])
                                        rotate([0, 90, dot_angle_deg])
                                            braille_dot_centered();
                                }
                            }
                        }
                    }
                }
            }

            // Subtract indicator recesses if enabled
            if (indicator_on) {
                for (row = [0 : active_grid_rows - 1]) {
                    y_pos = active_cylinder_height_mm/2 - top_margin - (row * active_line_spacing) + active_braille_y_adjust;

                    // Column 0: Triangle marker (apex RIGHT)
                    tri_theta_deg = start_angle * 180 / PI;
                    place_cylinder_marker(tri_theta_deg, y_pos, radius, INDICATOR_TRIANGLE_DEPTH_EMBOSS)
                        indicator_triangle_prism_centered(INDICATOR_TRIANGLE_DEPTH_EMBOSS, rotate_180 = false);

                    // Column 1: Rectangle marker
                    rect_theta_deg = (start_angle + cell_spacing_angle) * 180 / PI;
                    place_cylinder_marker(rect_theta_deg, y_pos, radius, INDICATOR_RECT_DEPTH_EMBOSS)
                        indicator_rectangle_prism_centered(INDICATOR_RECT_DEPTH_EMBOSS);
                }
            }
        }
    }
}

module cylinder_counter_plate() {
    translate([0, 0, active_cylinder_height_mm/2])
    difference() {
        // Base cylinder
        cylinder_shell(cutout_rotate_deg = active_seam_offset_degrees);
        
        // Calculate angular spacing
        radius = active_cylinder_diameter_mm / 2;
        grid_angle = grid_width / radius;
        start_angle = -grid_angle / 2;
        cell_spacing_angle = active_cell_spacing / radius;
        
        // Dot positioning
        dot_spacing_angle = active_dot_spacing / radius;
        dot_col_angle_offsets = [-dot_spacing_angle / 2, dot_spacing_angle / 2];
        dot_row_offsets = [active_dot_spacing, 0, -active_dot_spacing];
        dot_positions = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
        
        // Create indicator recesses if enabled
        if (indicator_on) {
            for (row = [0 : active_grid_rows - 1]) {
                y_pos = active_cylinder_height_mm/2 - top_margin - (row * active_line_spacing) + active_braille_y_adjust;

                // Column 0: Triangle marker (ROTATED 180° on counter plate)
                tri_theta_deg = -(start_angle * 180 / PI);
                place_cylinder_marker(tri_theta_deg, y_pos, radius, active_counter_height)
                    indicator_triangle_prism_centered(active_counter_height, rotate_180 = true);

                // Column 1: Rectangle placeholder (ALWAYS rectangle on counter plates)
                rect_theta_deg = -((start_angle + cell_spacing_angle) * 180 / PI);
                place_cylinder_marker(rect_theta_deg, y_pos, radius, active_counter_height)
                    indicator_rectangle_prism_centered(active_counter_height);
            }
        }
        
        // Create recesses for ALL possible dot positions
        for (row = [0 : active_grid_rows - 1]) {
            y_pos = active_cylinder_height_mm/2 - top_margin - (row * active_line_spacing) + active_braille_y_adjust;
            
            for (col = [0 : active_grid_columns - 1]) {
                actual_col = indicator_on ? (col + 2) : col;
                angle_rad = start_angle + (actual_col * cell_spacing_angle);
                angle_deg = -(angle_rad * 180 / PI);
                
                for (i = [0:5]) {
                    dot_pos = dot_positions[i];
                    dot_angle_rad = angle_rad + dot_col_angle_offsets[dot_pos[1]];
                    dot_angle_deg = -(dot_angle_rad * 180 / PI);
                    dot_y = y_pos + dot_row_offsets[dot_pos[0]];
                    
                    recess_radius_offset = use_rounded_dots ? 0 : 0.05;
                    x = (radius + recess_radius_offset) * cos(dot_angle_deg);
                    y = (radius + recess_radius_offset) * sin(dot_angle_deg);
                    
                    translate([x, y, dot_y])
                    rotate([0, 90, dot_angle_deg])
                    counter_recess();
                }
            }
        }
    }
}

// =============================================================================
// MAIN RENDERING
// =============================================================================

if (is_emboss_plate) {
    cylinder_emboss_plate();
} else {
    cylinder_counter_plate();
}

// End of file
