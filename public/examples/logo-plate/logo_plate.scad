// Logo Plate — SVG Import Example
// A parametric plate with an engraved logo loaded from an SVG file.
// Demonstrates native SVG import() via the file parameter pipeline.
//
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// License: CC0 (Public Domain)

/* [Plate] */
// Width of the plate (X axis)
plate_width = 60; // [30:120]

// Depth of the plate (Y axis)
plate_depth = 40; // [20:80]

// Plate thickness
plate_thickness = 4; // [2:0.5:10]

// Corner radius (0 for sharp corners)
corner_radius = 3; // [0:0.5:10]

/* [Logo] */
// Image file for engraving (SVG, PNG, or JPG. A picture is converted to SVG when you press Start conversion)
logo_file = "sample-logo.svg"; // [file:svg,png,jpg]

// Engraving depth. A layered logo uses the layer dials below instead
cut_depth = 1.0; // [0.3:0.1:3.0]

// Logo width in mm (0 = auto-fit to the plate on both axes)
logo_width = 0; // [0:1:120]

// Logo width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so auto-fit truly fits (1 assumes a square logo)
logo_file_aspect = 1; // [0.05:0.01:20]

// Invert the engraving (raised instead of cut). A layered logo goes by each layer's own style instead
logo_raised = "no"; // [yes, no]

// Logo size as a percentage of the space it is allowed to fill; 100 fills it.
// Ignored when Logo width is set: an exact width in millimeters wins over a
// percentage, because it is the more specific instruction.
logo_scale = 100; // [10:5:110]

// Offset to thicken SVG lines for FDM printability (0 = off; 0.6 = recommended for 0.4mm nozzle)
logo_offset = 0; // [0:0.2:1.5]

// Left (-) / right (+) position offset for the logo
logo_left_right = 0; // [-30:0.5:30]

// Down (-) / up (+) position offset for the logo
logo_up_down = 0; // [-20:0.5:20]

// Rotation angle for the logo (degrees, counter-clockwise)
logo_rotation = 0; // [-180:5:180]

/* [Layered design] */
// Build the logo as a stack of passes instead of one. Leave every file empty
// to keep the plate exactly as it was; fill layer 1 in to turn the stack on.
// The Assistive Forge app writes these files and their aspects for you from
// the Layer column in the drawing editor. Each pass starts where the one
// before it finished, so layer 2 sits on layer 1 rather than on the plate.
logo_layer_1 = ""; // [file:svg]

// Layer 1 width divided by height (set automatically by the app)
logo_layer_1_aspect = 1; // [0.05:0.01:20]

// How far layer 1 rises above, or cuts into, the plate face
logo_layer_1_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 1 stands up from the face or is cut into it
logo_layer_1_style = "raised"; // [raised, engraved]

// Second pass (leave empty for none)
logo_layer_2 = ""; // [file:svg]

// Layer 2 width divided by height (set automatically by the app)
logo_layer_2_aspect = 1; // [0.05:0.01:20]

// How far layer 2 rises above, or cuts into, where layer 1 finished
logo_layer_2_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 2 stands up from layer 1 or is cut into it
logo_layer_2_style = "raised"; // [raised, engraved]

// Third pass (leave empty for none)
logo_layer_3 = ""; // [file:svg]

// Layer 3 width divided by height (set automatically by the app)
logo_layer_3_aspect = 1; // [0.05:0.01:20]

// How far layer 3 rises above, or cuts into, where layer 2 finished
logo_layer_3_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 3 stands up from layer 2 or is cut into it
logo_layer_3_style = "raised"; // [raised, engraved]

/* [Text] */
// Text or number to show on the plate (leave empty for none)
text_content = "";

// Depth of text engraving (or height of raised text)
text_depth = 0.8; // [0.2:0.1:2]

// Text style on the plate surface
text_style = "raised"; // [raised, engraved]

// Text size
text_size = 6; // [3:0.5:16]

// Left (-) / right (+) position offset for text
text_left_right = 0; // [-30:0.5:30]

// Down (-) / up (+) position offset for text
text_up_down = -9; // [-20:0.5:20]

// Rotation angle for text (degrees, counter-clockwise)
text_rotation = 0; // [-180:5:180]

/* [Text Layer 2] */
// Second line of text (leave empty for none)
text_content_2 = "";

// Depth of second text engraving (or height of raised text)
text_depth_2 = 0.8; // [0.2:0.1:2]

// Second text style on the plate surface
text_style_2 = "raised"; // [raised, engraved]

// Second text size
text_size_2 = 6; // [3:0.5:16]

// Left (-) / right (+) position offset for second text
text_2_left_right = 0; // [-30:0.5:30]

// Down (-) / up (+) position offset for second text
text_2_up_down = -16; // [-20:0.5:20]

// Rotation angle for second text (degrees, counter-clockwise)
text_rotation_2 = 0; // [-180:5:180]

// Thickness offset for second text (height relative to the plate surface)
text_2_thickness = 0; // [-3:0.1:3]

/* [Mounting] */
// Add keychain hole
keychain_hole = "yes"; // [yes, no]

// Hole diameter
hole_diameter = 5; // [3:0.5:8]

// Left (-) / right (+) position offset for the hole
hole_left_right = 0; // [-40:0.5:40]

// Down (-) / up (+) position offset for the hole
hole_up_down = 0; // [-30:0.5:30]

/* [Quality] */
$fn = 48; // [24:8:128]

/* [Hidden] */
hole_margin = 4;
// Auto-fit box: the plate minus a 4 mm margin each side. The old auto-fit
// was width-only (plate_width - 8) and ignored plate_depth, so a tall
// logo on a shallow plate overflowed it. The logo is anchored at 45% of
// the depth, so the height is what fits around THAT point, staying a
// millimeter clear of the keychain hole when there is one.
logo_center_y = plate_depth * 0.45;
hole_bottom_y = plate_depth - hole_margin - hole_diameter / 2;
fit_top_y = keychain_hole == "yes" ? min(plate_depth - 4, hole_bottom_y - 1)
                                   : plate_depth - 4;
auto_fit_w = plate_width - 8;
auto_fit_h = 2 * min(logo_center_y - 4, fit_top_y - logo_center_y);
assert(logo_file_aspect > 0, "logo_file_aspect must be positive (width divided by height)");
assert(auto_fit_h > 0, "plate too shallow for the logo margins");
// logo_scale shrinks the box the auto-fit contains the logo in. It leaves
// logo_width alone: an exact width in millimeters is the more specific
// instruction, so it wins, and at the default 100 the auto-fit is exactly
// what it was before this parameter existed.
scaled_fit_w = auto_fit_w * logo_scale / 100;
scaled_fit_h = auto_fit_h * logo_scale / 100;
// The box the logo is fitted in, as the app reads it (DP-54): with Logo width
// set, that width and the height the logo's own proportions give it; without,
// the auto-fit box. The app applies the logo's own aspect the way resize()
// does, so the box, not the logo, is what this line reports. The drawing
// editor measures each shape against the nozzle at this width.
fit_box_w = logo_width > 0 ? logo_width : scaled_fit_w;
fit_box_h = logo_width > 0 ? logo_width / logo_file_aspect : scaled_fit_h;
echo(str("design fit box mm: w=", fit_box_w, " h=", fit_box_h));

// ── Layered design ───────────────────────────────────
// The layers are height classes (D-160, D-163, the owner's rule, with the
// braille dot as the picture: a trunk whose height one dial sets for every
// dot, a dome that starts where the trunk ends). A raised layer N stands on
// the plate face and rises to the sum of every raised depth up to and
// including its own; an engraved layer N cuts from the face down to the sum
// of every engraved depth up to its own.
//
// The app writes every shape on layer N or deeper into layer N's file, so the
// shapes on EXACTLY layer n are file n minus file n+1 (layer_exact_2d). A
// layer 3 shape is then built as three slabs, one per band, and nothing is
// drawn twice. When layer files are present the stack IS the logo: the
// single logo pass is skipped, or the logo would print once more at Engraving
// depth beneath the stack.
//
// The app writes each layer file onto one shared canvas layer_canvas_span wide
// (a CONTRACT with src/js/svg-preparer.js: change one and you change both), so
// every pass keeps its true size and place relative to the others. Fitting the
// files separately would scale the smallest pass up to the largest.
layer_canvas_span = 100;
layer_eps = 0.01;
layer_depth_min = 0.4;
layer_depth_max = 3.0;

layer_1_on = logo_layer_1 != "";
layer_2_on = logo_layer_2 != "";
layer_3_on = logo_layer_3 != "";
layered_mode = layer_1_on || layer_2_on || layer_3_on;

// Each layer's travel in its own direction, nothing for a layer with no file.
layer_1_up = (layer_1_on && logo_layer_1_style == "raised") ? logo_layer_1_depth : 0;
layer_2_up = (layer_2_on && logo_layer_2_style == "raised") ? logo_layer_2_depth : 0;
layer_3_up = (layer_3_on && logo_layer_3_style == "raised") ? logo_layer_3_depth : 0;
layer_1_down = (layer_1_on && logo_layer_1_style != "raised") ? logo_layer_1_depth : 0;
layer_2_down = (layer_2_on && logo_layer_2_style != "raised") ? logo_layer_2_depth : 0;
layer_3_down = (layer_3_on && logo_layer_3_style != "raised") ? logo_layer_3_depth : 0;

// Where each layer's surface ends up: raised tops accumulate upward from the
// face, engraved floors accumulate downward from it. Band n is what layer n
// adds: from layer_top_(n-1) to layer_top_n going up, from layer_floor_n to
// layer_floor_(n-1) going down.
layer_top_0 = plate_thickness;
layer_top_1 = layer_top_0 + layer_1_up;
layer_top_2 = layer_top_1 + layer_2_up;
layer_top_3 = layer_top_2 + layer_3_up;
layer_floor_0 = plate_thickness;
layer_floor_1 = layer_floor_0 - layer_1_down;
layer_floor_2 = layer_floor_1 - layer_2_down;
layer_floor_3 = layer_floor_2 - layer_3_down;
layer_stack_top = layer_top_3;
layer_stack_floor = layer_floor_3;
layer_raised_1 = layer_1_on && logo_layer_1_style == "raised";
layer_raised_2 = layer_2_on && logo_layer_2_style == "raised";
layer_raised_3 = layer_3_on && logo_layer_3_style == "raised";

// A pass thinner than layer_depth_min will not survive a 0.4 mm nozzle; one
// thicker than layer_depth_max stops reading as relief and starts snagging.
assert(!layer_1_on || (logo_layer_1_depth >= layer_depth_min && logo_layer_1_depth <= layer_depth_max),
       "logo_layer_1_depth outside 0.4-3.0 mm");
assert(!layer_2_on || (logo_layer_2_depth >= layer_depth_min && logo_layer_2_depth <= layer_depth_max),
       "logo_layer_2_depth outside 0.4-3.0 mm");
assert(!layer_3_on || (logo_layer_3_depth >= layer_depth_min && logo_layer_3_depth <= layer_depth_max),
       "logo_layer_3_depth outside 0.4-3.0 mm");
assert(logo_layer_1_aspect > 0, "logo_layer_1_aspect must be positive (width divided by height)");
assert(logo_layer_2_aspect > 0, "logo_layer_2_aspect must be positive (width divided by height)");
assert(logo_layer_3_aspect > 0, "logo_layer_3_aspect must be positive (width divided by height)");
// A pass may not cut through the plate: the stack's floor has to stay inside
// the material it is carved from.
assert(!layered_mode || layer_stack_floor > 0,
       "layered design cuts through the plate - reduce the engraved depths");

echo(str("layer levels mm: top1=", layer_top_1, " top2=", layer_top_2, " top3=", layer_top_3,
         " floor1=", layer_floor_1, " floor2=", layer_floor_2, " floor3=", layer_floor_3,
         " stack_top=", layer_stack_top));

// The highest point on the plate, so the keychain hole is cut through
// whatever stands over it: the stack, a raised logo, or raised text.
plate_top_z = plate_thickness
    + max(
        (!layered_mode && logo_raised == "yes") ? cut_depth : 0,
        (text_content != "" && text_style == "raised") ? text_depth : 0,
        (text_content_2 != "" && text_style_2 == "raised") ? max(0, text_depth_2 + text_2_thickness) : 0,
        layer_stack_top - plate_thickness
    );

module rounded_plate(w, d, h, r) {
    if (r > 0) {
        linear_extrude(height = h)
            offset(r = r)
                square([w - 2*r, d - 2*r]);
    } else {
        cube([w, d, h]);
    }
}

module logo_2d() {
    translate([logo_left_right, logo_up_down])
        rotate([0, 0, logo_rotation])
            offset(r = logo_offset)
                if (logo_width > 0) {
                    // Manual mode: the number IS the width in mm; height
                    // follows the logo's own proportions.
                    resize([logo_width, 0], auto = true)
                        import(logo_file, center = true);
                } else {
                    // Auto-fit: contain the logo in the fit box on BOTH axes,
                    // anchored to whichever axis it hits first
                    // (logo_file_aspect carries the ratio OpenSCAD cannot
                    // measure from the import).
                    resize(logo_file_aspect >= scaled_fit_w / scaled_fit_h
                               ? [scaled_fit_w, 0]
                               : [0, scaled_fit_h],
                           auto = true)
                        import(logo_file, center = true);
                }
}

// One pass of a layered logo, placed exactly like the single logo above so the
// two surfaces agree. The file arrives on the shared canvas with its own
// minimum corner at the origin, so it is centered here and then scaled by ONE
// factor - never resize()d, which would fit each pass to the box separately
// and scale the smallest one up to the size of the largest. With Logo width
// set, the canvas is that width; without, it is contained in the auto-fit
// box the way the single logo is.
module logo_layer_2d(layer_file, layer_aspect) {
    canvas_h = layer_canvas_span / layer_aspect;
    fit = logo_width > 0
              ? logo_width / layer_canvas_span
              : (layer_aspect >= scaled_fit_w / scaled_fit_h)
                    ? scaled_fit_w / layer_canvas_span
                    : scaled_fit_h / canvas_h;
    translate([logo_left_right, logo_up_down])
        rotate([0, 0, logo_rotation])
            offset(r = logo_offset)
                scale(fit)
                    translate([-layer_canvas_span / 2, -canvas_h / 2])
                        import(layer_file, center = false);
}

// Layer n's file, placed like the single logo.
module layer_file_2d(n) {
    if (n == 1 && layer_1_on) logo_layer_2d(logo_layer_1, logo_layer_1_aspect);
    if (n == 2 && layer_2_on) logo_layer_2d(logo_layer_2, logo_layer_2_aspect);
    if (n == 3 && layer_3_on) logo_layer_2d(logo_layer_3, logo_layer_3_aspect);
}

// The shapes on EXACTLY layer n: the app writes every shape on layer n or
// deeper into file n, so file n minus file n+1 is layer n's own shapes, with
// a hole wherever a deeper layer's shape sits inside one of them.
module layer_exact_2d(n) {
    difference() {
        layer_file_2d(n);
        if (n < 3) layer_file_2d(n + 1);
    }
}

// What band n carries, going one way: the shapes of every layer at or above
// n whose own direction is that way. A layer 3 shape that is raised fills the
// raised bands 1, 2 and 3; an engraved layer 2 shape fills the engraved bands
// 1 and 2 and none of the raised ones.
module layer_band_2d(n, raised) {
    union() {
        if (n <= 1 && layer_1_on && (layer_raised_1 == raised)) layer_exact_2d(1);
        if (n <= 2 && layer_2_on && (layer_raised_2 == raised)) layer_exact_2d(2);
        if (n <= 3 && layer_3_on && (layer_raised_3 == raised)) layer_exact_2d(3);
    }
}

// A band sits where the logo sits and is clipped at the plate footprint, so
// a pass pushed past the edge stops there instead of standing on nothing.
module layer_band_on_plate_2d(n, raised) {
    intersection() {
        translate([plate_width / 2, logo_center_y]) layer_band_2d(n, raised);
        plate_2d();
    }
}

// One band, raised: the slab from the top below it to its own top. Overlaps
// the band under it by the epsilon so the slabs are one body.
module layer_raised_band(n) {
    up   = (n == 1) ? layer_1_up : (n == 2) ? layer_2_up : layer_3_up;
    base = (n == 1) ? layer_top_0 : (n == 2) ? layer_top_1 : layer_top_2;
    if (up > 0) {
        translate([0, 0, base - layer_eps])
            linear_extrude(height = up + layer_eps)
                layer_band_on_plate_2d(n, true);
    }
}

// One band, engraved: the cut from its own floor up to the floor above it,
// through the face on band 1.
module layer_engraved_band(n) {
    down = (n == 1) ? layer_1_down : (n == 2) ? layer_2_down : layer_3_down;
    top  = (n == 1) ? layer_floor_0 : (n == 2) ? layer_floor_1 : layer_floor_2;
    if (down > 0) {
        translate([0, 0, top - down])
            linear_extrude(height = down + layer_eps)
                layer_band_on_plate_2d(n, false);
    }
}

module text_2d() {
    if (text_content != "") {
        translate([text_left_right, text_up_down])
            rotate([0, 0, text_rotation])
                text(text_content, size = text_size,
                     font = "Liberation Sans",
                     halign = "center", valign = "center");
    }
}

module text_2d_layer2() {
    if (text_content_2 != "") {
        translate([text_2_left_right, text_2_up_down])
            rotate([0, 0, text_rotation_2])
                text(text_content_2, size = text_size_2,
                     font = "Liberation Sans",
                     halign = "center", valign = "center");
    }
}

// Text is placed about the same anchor as the logo and clipped to the plate,
// so a line pushed past the edge stops there instead of standing on nothing.
module text_raised() {
    if (text_content != "" && text_style == "raised") {
        translate([0, 0, plate_thickness])
            linear_extrude(height = text_depth)
                intersection() {
                    translate([plate_width / 2, logo_center_y]) text_2d();
                    plate_2d();
                }
    }
    if (text_content_2 != "" && text_style_2 == "raised") {
        translate([0, 0, plate_thickness + text_2_thickness])
            linear_extrude(height = text_depth_2)
                intersection() {
                    translate([plate_width / 2, logo_center_y])
                        text_2d_layer2();
                    plate_2d();
                }
    }
}

module text_engraved() {
    if (text_content != "" && text_style != "raised") {
        translate([0, 0, plate_thickness - text_depth])
            linear_extrude(height = text_depth + 0.01)
                intersection() {
                    translate([plate_width / 2, logo_center_y]) text_2d();
                    plate_2d();
                }
    }
    if (text_content_2 != "" && text_style_2 != "raised") {
        translate([0, 0, plate_thickness - text_depth_2 + text_2_thickness])
            linear_extrude(height = text_depth_2 + 0.01)
                intersection() {
                    translate([plate_width / 2, logo_center_y])
                        text_2d_layer2();
                    plate_2d();
                }
    }
}

// The plate footprint, for clipping raised logos at the plate edge.
module plate_2d() {
    if (corner_radius > 0) {
        translate([corner_radius, corner_radius])
            offset(r = corner_radius)
                square([plate_width - 2*corner_radius,
                        plate_depth - 2*corner_radius]);
    } else {
        square([plate_width, plate_depth]);
    }
}

module plate_body() {
    translate(corner_radius > 0 ? [corner_radius, corner_radius, 0] : [0, 0, 0])
        rounded_plate(plate_width, plate_depth, plate_thickness, corner_radius);
}

// Cut from below the plate to above its highest point, so a raised logo, a
// raised line of text or a layer stack standing over the hole is cut too.
module keychain_cutout() {
    if (keychain_hole == "yes") {
        translate([plate_width / 2 + hole_left_right,
                   plate_depth - hole_margin + hole_up_down, -0.01])
            cylinder(d = hole_diameter, h = plate_top_z + 0.02);
    }
}

module engraved_plate() {
    difference() {
        union() {
            plate_body();
            text_raised();
        }
        keychain_cutout();

        // Engrave logo into top surface. With layer files present the stack
        // is the logo (D-163): the single pass would print once more under it.
        if (!layered_mode) {
            translate([plate_width / 2, logo_center_y, plate_thickness - cut_depth])
                linear_extrude(height = cut_depth + 0.01)
                    logo_2d();
        }
        text_engraved();
    }
}

module raised_plate() {
    difference() {
        union() {
            plate_body();
            // Raised logo on the top surface, clipped at the plate footprint
            // so an oversized manual width cannot leave material hanging off
            // the edge or floating past a corner. Skipped with layer files
            // present, for the same reason as the engraved pass.
            if (!layered_mode) {
                translate([0, 0, plate_thickness])
                    linear_extrude(height = cut_depth)
                        intersection() {
                            translate([plate_width / 2, logo_center_y])
                                logo_2d();
                            plate_2d();
                        }
            }
            text_raised();
        }
        keychain_cutout();
        text_engraved();
    }
}

// The layer stack around the plate (D-160, D-163): the raised bands added,
// the engraved bands cut, and the keychain hole cut again through whatever
// the stack raised over it. The two kinds of band never share a footprint (a
// shape is one layer, and a layer goes one way), so the order does not matter.
module logo_plate() {
    difference() {
        union() {
            if (logo_raised == "yes") {
                raised_plate();
            } else {
                engraved_plate();
            }
            layer_raised_band(1);
            layer_raised_band(2);
            layer_raised_band(3);
        }
        layer_engraved_band(1);
        layer_engraved_band(2);
        layer_engraved_band(3);
        keychain_cutout();
    }
}

logo_plate();
