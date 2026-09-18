// Nasif's Charm Maker — Parametric Charm/Pendant Generator
// Create custom charms with engraved or raised designs from SVG images.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// License: CC0 (Public Domain)

/* [Shape] */
// Base shape of the charm
charm_shape = "circle"; // [circle, square, rounded_rect, hexagon, oval, design]

// Width of the charm
charm_width = 30; // [15:1:60]

// Height of the charm (ignored for circle)
charm_height = 30; // [15:1:60]

// Thickness
charm_thickness = 3; // [1.5:0.5:8]

// Corner rounding for square and rounded rectangle shapes
corner_radius = 4; // [0:0.5:15]

/* [Design] */
// Image file for the design (SVG, PNG, or JPG. A picture is converted to SVG when you press Start conversion) @label(Image file)
design_file = "heart.svg"; // [file:svg,png,jpg]

// Engraving depth (or raise height). A layered design uses the layer dials below instead @label(Engrave depth)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Raised design instead of engraved. A layered design goes by each layer's own style instead @label(Raised)
design_raised = "no"; // [yes, no]

// Design size as a percentage of the charm face; 100 fills the face (the face excludes the border ring when the border is on) @label(Scale)
design_scale = 70; // [10:5:110]

// Design width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so 100 truly fills the face (1 assumes a square design)
design_file_aspect = 1; // [0.05:0.01:20]

// Offset to thicken SVG lines for FDM printability (0 = off; 0.6 = recommended for 0.4mm nozzle) @label(Offset)
design_offset = 0; // [0:0.2:1.5]

// Left (-) / right (+) position offset for design @label(Left / right)
design_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for design @label(Up / down)
design_up_down = 0; // [-15:0.5:15]

// Rotation angle for design (degrees, counter-clockwise) @label(Rotation)
design_rotation = 0; // [-180:5:180]

// The design's own outline, with every hole filled. Written by the Assistive
// Forge app from your drawing; used only when Charm shape is "design", where
// it becomes the whole pendant instead of a circle or a square.
design_silhouette = ""; // [file:svg]

// Outline width divided by height (set automatically by the app)
design_silhouette_aspect = 1; // [0.05:0.01:20]

/* [Layered design] */
// Build the design as a stack of passes instead of one. Leave every file empty
// to keep the pendant exactly as it was; fill layer 1 in to turn the stack on.
// The Assistive Forge app writes these files and their aspects for you from
// the Layer column in the drawing editor. Each pass starts where the one
// before it finished, so layer 2 sits on layer 1 rather than on the face.
design_layer_1 = ""; // [file:svg]

// Layer 1 width divided by height (set automatically by the app)
design_layer_1_aspect = 1; // [0.05:0.01:20]

// How far layer 1 rises above, or cuts into, the pendant face
design_layer_1_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 1 stands up from the face or is cut into it
design_layer_1_style = "raised"; // [raised, engraved]

// Second pass (leave empty for none)
design_layer_2 = ""; // [file:svg]

// Layer 2 width divided by height (set automatically by the app)
design_layer_2_aspect = 1; // [0.05:0.01:20]

// How far layer 2 rises above, or cuts into, where layer 1 finished
design_layer_2_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 2 stands up from layer 1 or is cut into it
design_layer_2_style = "raised"; // [raised, engraved]

// Third pass (leave empty for none)
design_layer_3 = ""; // [file:svg]

// Layer 3 width divided by height (set automatically by the app)
design_layer_3_aspect = 1; // [0.05:0.01:20]

// How far layer 3 rises above, or cuts into, where layer 2 finished
design_layer_3_depth = 0.8; // [0.4:0.1:3.0]

// Whether layer 3 stands up from layer 2 or is cut into it
design_layer_3_style = "raised"; // [raised, engraved]

/* [Text] */
// Text or number to display on the charm face (leave empty for none) @label(Text)
text_content = "";

// Depth of text engraving (or height of raised text) @label(Depth)
text_depth = 0.8; // [0.2:0.1:2]

// Text style on the charm surface @label(Style)
text_style = "raised"; // [raised, engraved]

// Text size @label(Size)
text_size = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for text @label(Left / right)
text_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for text @label(Up / down)
text_up_down = 8; // [-15:0.5:15]

// Rotation angle for text (degrees, counter-clockwise) @label(Rotation)
text_rotation = 0; // [-180:5:180]

/* [Text Layer 2] */
// Second line of text (leave empty for none) @label(Text)
text_content_2 = "";

// Depth of second text engraving (or height of raised text) @label(Depth)
text_depth_2 = 0.8; // [0.2:0.1:2]

// Second text style on the charm surface @label(Style)
text_style_2 = "raised"; // [raised, engraved]

// Second text size @label(Size)
text_size_2 = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for second text @label(Left / right)
text_2_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for second text @label(Up / down)
text_2_up_down = -8; // [-15:0.5:15]

// Rotation angle for second text (degrees, counter-clockwise) @label(Rotation)
text_rotation_2 = 0; // [-180:5:180]

// Thickness offset for second text (height relative to the charm surface) @label(Thickness)
text_2_thickness = 0; // [-3:0.1:3]

/* [Border] */
// Add a raised border ring
add_border = "yes"; // [yes, no]

// Border width
border_width = 1.5; // [0.5:0.5:4]

// Border height above the surface
border_height = 0.5; // [0.2:0.1:2.0]

/* [Attachment] */
// How the charm attaches to a chain or pin
attachment_type = "keychain_hole"; // [keychain_hole, lanyard_slot, bail_loop, none]

// Hole diameter (for keychain hole)
hole_diameter = 4; // [2:0.5:8]

// Left (-) / right (+) position offset for the attachment
attachment_x = 0; // [-30:0.5:30]

// Down (-) / up (+) position offset for the attachment
attachment_y = 0; // [-30:0.5:30]

// Bail loop thickness (for bail loop)
bail_thickness = 2; // [1:0.5:4]

// Bail loop inner radius
bail_inner_radius = 3; // [2:0.5:6]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
// The app writes the outline on a canvas this many units wide. A CONTRACT
// with src/js/svg-preparer.js: change one and you change both.
silhouette_canvas_span = 100;
shape_is_design = charm_shape == "design" && design_silhouette != "";

effective_width = charm_width;
// A design-shaped pendant takes its height from the drawing, not from a
// separate dial: the outline decides its own proportions, and a height set
// against it would squash the very shape the person chose.
effective_height = shape_is_design
    ? charm_width / design_silhouette_aspect
    : (charm_shape == "circle" ? charm_width : charm_height);
// The face the design may fill: inside the border ring when there is one
face_w = effective_width - (add_border == "yes" ? 2 * border_width : 0);
face_h = effective_height - (add_border == "yes" ? 2 * border_width : 0);
fit_w = face_w * design_scale / 100;
fit_h = face_h * design_scale / 100;
assert(design_file_aspect > 0, "design_file_aspect must be positive (width divided by height)");
assert(design_silhouette_aspect > 0, "design_silhouette_aspect must be positive (width divided by height)");
// Choosing the design shape without an outline would silently fall back to a
// circle, which is not what was asked for and gives no clue why.
assert(charm_shape != "design" || design_silhouette != "",
       "charm_shape is \"design\" but no outline file is set - choose a design first");
// The app reads this line to learn how wide a design prints, so the drawing
// editor can measure each shape against the nozzle (DP-54). The box, not the
// design: the app applies the design's own aspect the way resize() does.
echo(str("design fit box mm: w=", fit_w, " h=", fit_h));

// ── Layered design ───────────────────────────────────
// The layers are height classes (D-160, D-163, the owner's rule, with the
// braille dot as the picture: a trunk whose height one dial sets for every
// dot, a dome that starts where the trunk ends). A raised layer N stands on
// the pendant face and rises to the sum of every raised depth up to and
// including its own; an engraved layer N cuts from the face down to the sum
// of every engraved depth up to its own.
//
// The app writes every shape on layer N or deeper into layer N's file, so the
// shapes on EXACTLY layer n are file n minus file n+1 (layer_exact_2d). A
// layer 3 shape is then built as three slabs, one per band, and nothing is
// drawn twice. When layer files are present the stack IS the design: the
// single design pass is skipped, or the design would print once more at
// Engrave depth beneath the stack.
//
// The app writes each layer file onto one shared canvas layer_canvas_span wide
// (a CONTRACT with src/js/svg-preparer.js: change one and you change both), so
// every pass keeps its true size and place relative to the others. Fitting the
// files separately would scale the smallest pass up to the largest.
layer_canvas_span = 100;
layer_eps = 0.01;
layer_depth_min = 0.4;
layer_depth_max = 3.0;

layer_1_on = design_layer_1 != "";
layer_2_on = design_layer_2 != "";
layer_3_on = design_layer_3 != "";
layered_mode = layer_1_on || layer_2_on || layer_3_on;

// Each layer's travel in its own direction, nothing for a layer with no file.
layer_1_up = (layer_1_on && design_layer_1_style == "raised") ? design_layer_1_depth : 0;
layer_2_up = (layer_2_on && design_layer_2_style == "raised") ? design_layer_2_depth : 0;
layer_3_up = (layer_3_on && design_layer_3_style == "raised") ? design_layer_3_depth : 0;
layer_1_down = (layer_1_on && design_layer_1_style != "raised") ? design_layer_1_depth : 0;
layer_2_down = (layer_2_on && design_layer_2_style != "raised") ? design_layer_2_depth : 0;
layer_3_down = (layer_3_on && design_layer_3_style != "raised") ? design_layer_3_depth : 0;

// Where each layer's surface ends up: raised tops accumulate upward from the
// face, engraved floors accumulate downward from it. Band n is what layer n
// adds: from layer_top_(n-1) to layer_top_n going up, from layer_floor_n to
// layer_floor_(n-1) going down.
layer_top_0 = charm_thickness;
layer_top_1 = layer_top_0 + layer_1_up;
layer_top_2 = layer_top_1 + layer_2_up;
layer_top_3 = layer_top_2 + layer_3_up;
layer_floor_0 = charm_thickness;
layer_floor_1 = layer_floor_0 - layer_1_down;
layer_floor_2 = layer_floor_1 - layer_2_down;
layer_floor_3 = layer_floor_2 - layer_3_down;
layer_stack_top = layer_top_3;
layer_stack_floor = layer_floor_3;
layer_raised_1 = layer_1_on && design_layer_1_style == "raised";
layer_raised_2 = layer_2_on && design_layer_2_style == "raised";
layer_raised_3 = layer_3_on && design_layer_3_style == "raised";

// A pass thinner than layer_depth_min will not survive a 0.4 mm nozzle; one
// thicker than layer_depth_max stops reading as relief and starts snagging.
assert(!layer_1_on || (design_layer_1_depth >= layer_depth_min && design_layer_1_depth <= layer_depth_max),
       "design_layer_1_depth outside 0.4-3.0 mm");
assert(!layer_2_on || (design_layer_2_depth >= layer_depth_min && design_layer_2_depth <= layer_depth_max),
       "design_layer_2_depth outside 0.4-3.0 mm");
assert(!layer_3_on || (design_layer_3_depth >= layer_depth_min && design_layer_3_depth <= layer_depth_max),
       "design_layer_3_depth outside 0.4-3.0 mm");
assert(design_layer_1_aspect > 0, "design_layer_1_aspect must be positive (width divided by height)");
assert(design_layer_2_aspect > 0, "design_layer_2_aspect must be positive (width divided by height)");
assert(design_layer_3_aspect > 0, "design_layer_3_aspect must be positive (width divided by height)");
// A pass may not cut through the pendant: the stack's floor has to stay
// inside the material it is carved from.
assert(!layered_mode || layer_stack_floor > 0,
       "layered design cuts through the pendant - reduce the engraved depths");

echo(str("layer levels mm: top1=", layer_top_1, " top2=", layer_top_2, " top3=", layer_top_3,
         " floor1=", layer_floor_1, " floor2=", layer_floor_2, " floor3=", layer_floor_3,
         " stack_top=", layer_stack_top));

// The highest point on the pendant, so the hole or slot is cut through
// whatever stands over it: the border ring, the stack, a raised design or
// raised text.
charm_top_z = charm_thickness
    + max(
        add_border == "yes" ? border_height : 0,
        (!layered_mode && design_raised == "yes") ? engrave_depth : 0,
        (text_content != "" && text_style == "raised") ? text_depth : 0,
        (text_content_2 != "" && text_style_2 == "raised") ? max(0, text_depth_2 + text_2_thickness) : 0,
        layer_stack_top - charm_thickness
    );

module charm_base_2d() {
    if (shape_is_design) {
        // The drawing's own outline becomes the pendant. Scaled by ONE factor
        // and never resize()d: the outline and the relief files share a
        // canvas, and fitting them separately would size the detail against a
        // different box from the body it sits on.
        canvas_h = silhouette_canvas_span / design_silhouette_aspect;
        scale(effective_width / silhouette_canvas_span)
            translate([-silhouette_canvas_span / 2, -canvas_h / 2])
                import(design_silhouette, center = false);
    } else if (charm_shape == "circle") {
        circle(d = effective_width);
    } else if (charm_shape == "oval") {
        scale([1, effective_height / effective_width])
            circle(d = effective_width);
    } else if (charm_shape == "hexagon") {
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
        r = min(corner_radius, effective_width / 2, effective_height / 2);
        if (r > 0) {
            offset(r = r)
                square([effective_width - 2*r, effective_width - 2*r], center = true);
        } else {
            square([effective_width, effective_width], center = true);
        }
    }
}

// Body and raised border are carved from ONE extrusion: extruding a separate
// border ring and stacking it on the body leaves the two outer walls
// coincident, and on curved outlines the 2D difference()'s re-tessellation
// exports T-junction open edges (non-watertight STL). Cutting the face
// recess out of a single taller solid has no coincident surfaces at all.
module charm_body() {
    if (add_border == "yes") {
        difference() {
            linear_extrude(height = charm_thickness + border_height)
                charm_base_2d();
            translate([0, 0, charm_thickness])
                linear_extrude(height = border_height + 1)
                    offset(r = -border_width)
                        charm_base_2d();
        }
    } else {
        linear_extrude(height = charm_thickness)
            charm_base_2d();
    }
}

module design_2d() {
    if (design_file != "") {
        // Contain-fit: anchor the resize to whichever axis the design hits
        // first (OpenSCAD cannot measure an import; design_file_aspect carries
        // the ratio), so a tall design no longer overflows the charm.
        translate([design_left_right, design_up_down])
            rotate([0, 0, design_rotation])
                offset(r = design_offset)
                    resize(design_file_aspect >= fit_w / fit_h
                               ? [fit_w, 0]
                               : [0, fit_h],
                           auto = true)
                        import(design_file, center = true);
    }
}

// One pass of a layered design, placed exactly like the single design above
// so the two surfaces agree. The file arrives on the shared canvas with its
// own minimum corner at the origin, so it is centered here and then scaled by
// ONE factor - never resize()d, which would fit each pass to the face
// separately and scale the smallest one up to the size of the largest.
module design_layer_2d(layer_file, layer_aspect) {
    canvas_h = layer_canvas_span / layer_aspect;
    fit = (layer_aspect >= fit_w / fit_h)
              ? fit_w / layer_canvas_span
              : fit_h / canvas_h;
    translate([design_left_right, design_up_down])
        rotate([0, 0, design_rotation])
            offset(r = design_offset)
                scale(fit)
                    translate([-layer_canvas_span / 2, -canvas_h / 2])
                        import(layer_file, center = false);
}

// The flat face a design or a piece of text may fill. Inside the border ring
// when there is one, because raised material over the ring would stand on a
// wall rather than on the face, and an engraved cut there would breach it.
module face_2d() {
    if (add_border == "yes") {
        offset(r = -border_width) charm_base_2d();
    } else {
        charm_base_2d();
    }
}

// Layer n's file, placed like the single design.
module layer_file_2d(n) {
    if (n == 1 && layer_1_on) design_layer_2d(design_layer_1, design_layer_1_aspect);
    if (n == 2 && layer_2_on) design_layer_2d(design_layer_2, design_layer_2_aspect);
    if (n == 3 && layer_3_on) design_layer_2d(design_layer_3, design_layer_3_aspect);
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

// A band is clipped to the flat face, like the text: raised material past it
// would stand on the border ring, and an engraved cut there would breach it.
module layer_band_on_face_2d(n, raised) {
    intersection() {
        layer_band_2d(n, raised);
        face_2d();
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
                layer_band_on_face_2d(n, true);
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
                layer_band_on_face_2d(n, false);
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

// The hole and the slot are cut from below the pendant to above its highest
// point, so a layer stack or raised text standing over them is cut too.
module attachment() {
    if (attachment_type == "keychain_hole") {
        // Position hole at top of charm
        hole_y = charm_shape == "circle"
            ? effective_width / 2 - hole_diameter / 2 - 1
            : effective_height / 2 - hole_diameter / 2 - 1;
        translate([attachment_x, hole_y + attachment_y, -0.01])
            cylinder(d = hole_diameter, h = charm_top_z + 0.02);
    } else if (attachment_type == "lanyard_slot") {
        slot_width = hole_diameter * 2;
        r = hole_diameter / 4;
        slot_y = charm_shape == "circle"
            ? effective_width / 2 - hole_diameter / 2 - 1
            : effective_height / 2 - hole_diameter / 2 - 1;
        translate([attachment_x, slot_y + attachment_y, -0.01])
            linear_extrude(height = charm_top_z + 0.02)
                hull() {
                    translate([-(slot_width / 2 - r), 0]) circle(r = r);
                    translate([ (slot_width / 2 - r), 0]) circle(r = r);
                }
    } else if (attachment_type == "bail_loop") {
        bail_y = charm_shape == "circle"
            ? effective_width / 2
            : effective_height / 2;
        translate([attachment_x, bail_y + attachment_y, charm_thickness / 2])
            rotate([0, 90, 0])
                rotate_extrude(angle = 180, $fn = 32)
                    translate([bail_inner_radius, 0, 0])
                        circle(d = bail_thickness);
    }
}

// Raised text, clamped to the flat face. Written this way from birth rather
// than added later: text that overhangs the face stands on the border ring or
// on nothing at all.
module raised_text() {
    if (text_content != "" && text_style == "raised") {
        translate([0, 0, charm_thickness - 0.02])
            linear_extrude(height = text_depth + 0.02)
                intersection() { text_2d(); face_2d(); }
    }
    if (text_content_2 != "" && text_style_2 == "raised") {
        translate([0, 0, charm_thickness + text_2_thickness - 0.02])
            linear_extrude(height = text_depth_2 + 0.02)
                intersection() { text_2d_layer2(); face_2d(); }
    }
}

module engraved_text() {
    if (text_content != "" && text_style != "raised") {
        translate([0, 0, charm_thickness - text_depth])
            linear_extrude(height = text_depth + border_height + 0.02)
                intersection() { text_2d(); face_2d(); }
    }
    if (text_content_2 != "" && text_style_2 != "raised") {
        translate([0, 0, charm_thickness - text_depth_2 + text_2_thickness])
            linear_extrude(height = text_depth_2 + border_height + 0.02)
                intersection() { text_2d_layer2(); face_2d(); }
    }
}

module engraved_charm() {
    difference() {
        union() {
            charm_body();
            raised_text();
        }
        // Engrave design into top surface. With layer files present the stack
        // is the design (D-163): the single pass would print once more under it.
        if (!layered_mode) {
            translate([0, 0, charm_thickness - engrave_depth])
                linear_extrude(height = engrave_depth + border_height + 0.02)
                    design_2d();
        }
        engraved_text();
        attachment();
    }
}

module raised_charm() {
    difference() {
        union() {
            charm_body();
            // Raised design on top surface, embedded a hair so the union
            // genuinely fuses instead of exporting a separate touching shell.
            // Clipped at the charm outline: past 100% the bleed stops at the
            // edge instead of leaving material hanging off the face. Skipped
            // with layer files present, for the same reason as the engraved
            // pass.
            if (!layered_mode) {
                translate([0, 0, charm_thickness - 0.02])
                    linear_extrude(height = engrave_depth + 0.02)
                        intersection() {
                            design_2d();
                            charm_base_2d();
                        }
            }
            raised_text();
        }
        engraved_text();
        attachment();
    }
}

// The layer stack around the pendant (D-160, D-163): the raised bands added,
// the engraved bands cut, and the attachment cut again through whatever the
// stack raised over it. The two kinds of band never share a footprint (a
// shape is one layer, and a layer goes one way), so the order does not matter.
module nasif_charm() {
    difference() {
        union() {
            if (design_raised == "yes") {
                raised_charm();
            } else {
                engraved_charm();
            }
            layer_raised_band(1);
            layer_raised_band(2);
            layer_raised_band(3);
        }
        layer_engraved_band(1);
        layer_engraved_band(2);
        layer_engraved_band(3);
        attachment();
    }
}

nasif_charm();
