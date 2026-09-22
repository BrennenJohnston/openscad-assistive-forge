// Bracelet Clip Charm — Parametric C-Clip Bracelet Charm
// C-shaped clip-on charm for silicone bracelets with customizable design.
// Profile stands vertically; the outer surface faces up for engraving.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// AAC bracelet charm prior art by Duy Do (UW WOOF3D): thingiverse.com/thing:7153594
// License: CC0 (Public Domain)

/* [Design] */
// Image file for the design (SVG, PNG, or JPG. A picture is converted to SVG when you press Start conversion; simple single-path SVGs work best) @label(Image file)
design_file = ""; // [file:svg,png,jpg,dxf]

// Depth of engraving (or height of raised design). A drawing with layers uses the layer depths below instead @label(Engrave depth)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Design style on the charm surface. A drawing with layers uses the layer styles below instead @label(Style)
design_style = "raised"; // [raised, engraved]

// Design size as a percentage of the charm's flat top face; 100 fills it @label(Scale)
design_scale = 60; // [10:5:110]

// Design width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so 100 truly fills the face (1 assumes a square design)
design_file_aspect = 1; // [0.05:0.01:20]

// Offset to thicken SVG lines for FDM printability (0 = off; 0.6 = recommended for 0.4mm nozzle) @label(Offset)
design_offset = 0; // [0:0.05:1.5]

// Left (−) / right (+) position offset for design @label(Left / right)
design_left_right = 0; // [-10:0.5:10]

// Down (−) / up (+) position offset for design @label(Up / down)
design_up_down = 0; // [-10:0.5:10]

// Rotation angle for design (degrees, counter-clockwise) @label(Rotation)
design_rotation = 0; // [-180:5:180]

/* [Design Layer 2] */
// Image file for the second design (leave empty for none) @label(Image file)
design_file_2 = ""; // [file:svg,png,jpg]

// Design style for second design @label(Style)
design_style_2 = "raised"; // [raised, engraved]

// Second design size as a percentage of the charm's flat top face; 100 fills it @label(Scale)
design_scale_2 = 40; // [10:5:110]

// Second design width divided by height (set automatically by the app, like design_file_aspect)
design_file_2_aspect = 1; // [0.05:0.01:20]

// Left (−) / right (+) position offset for second design @label(Left / right)
design_2_left_right = 0; // [-10:0.5:10]

// Down (−) / up (+) position offset for second design @label(Up / down)
design_2_up_down = 0; // [-10:0.5:10]

// Rotation angle for second design (degrees, counter-clockwise) @label(Rotation)
design_rotation_2 = 0; // [-180:5:180]

// Thickness offset for second design (height relative to the charm surface) @label(Thickness)
design_2_thickness = 0; // [-3:0.1:3]

/* [Layered design] */
// Build the design as a stack of passes instead of one. Leave every file empty
// to keep the charm exactly as it was; fill layer 1 in to turn the stack on.
// The Assistive Forge app writes these files and their aspects for you from
// the Layer column in the drawing editor. Each pass starts where the one
// before it finished, so layer 2 sits on layer 1 rather than on the charm.
design_layer_1 = ""; // [file:svg]

// Layer 1 width divided by height (set automatically by the app)
design_layer_1_aspect = 1; // [0.05:0.01:20]

// How far layer 1 rises above, or cuts into, the charm face
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

// Text height in mm @label(Size)
text_size = 5; // [3:0.5:12]

// Left (−) / right (+) position offset for text @label(Left / right)
text_left_right = 6; // [-10:0.5:10]

// Down (−) / up (+) position offset for text @label(Up / down)
text_up_down = 5.5; // [-10:0.5:10]

// Rotation angle for text (degrees, counter-clockwise) @label(Rotation)
text_rotation = 90; // [-180:5:180]

/* [Text Layer 2] */
// Second text line to display on the charm face (leave empty for none) @label(Text)
text_content_2 = "";

// Depth of second text engraving (or height of raised text) @label(Depth)
text_depth_2 = 0.8; // [0.2:0.1:2]

// Text style for second text @label(Style)
text_style_2 = "raised"; // [raised, engraved]

// Text height in mm for second text @label(Size)
text_size_2 = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for second text @label(Left / right)
text_2_left_right = -6; // [-10:0.5:10]

// Down (-) / up (+) position offset for second text @label(Up / down)
text_2_up_down = 5.5; // [-10:0.5:10]

// Rotation angle for second text (degrees, counter-clockwise) @label(Rotation)
text_rotation_2 = 90; // [-180:5:180]

// Thickness offset for second text (height relative to the charm surface) @label(Thickness)
text_2_thickness = 0; // [-3:0.1:3]

/* [Fit] */
// Width of the charm along the bracelet (Y axis)
charm_width = 22; // [10:1:40]

// Overall height of the C-clip profile
charm_height = 8.65; // [6:0.5:15]

// Wall and material thickness
charm_thickness = 2.25; // [1.25:0.25:4]

// Length of the inner bracelet channel
charm_length = 15; // [10:1:25]

// Shift the gap opening left (−) or right (+) for asymmetric legs
gap_offset = 2; // [-4:0.5:4]

// Width of the bottom opening (gap between the C-clip legs)
gap_width = 3; // [2:0.5:8]

/* [Rounding] */
// Side edge rounding radius (0 = sharp side edges)
edge_radius = 1.0; // [0:0.25:3]

// Side edge radius — rounds the edges along the side profile of the charm (0 = off)
side_edge_radius = 2.5; // [0:0.25:3]

// Outer corner radius — rounds the 4 outer corners of the C-clip cross-section (0 = sharp corners)
profile_corner_radius = 2; // [0:0.5:4]

// Inner corner radius — rounds the 4 inner channel corners (0 = sharp corners)
inner_corner_radius = 1; // [0:0.25:3]

/* [Attachment] */
// Optional attachment at one end of the charm
attachment_type = "none"; // [none, keychain_hole, bail_loop, lanyard_slot]

// Hole diameter (for keychain hole and lanyard slot sizing)
hole_diameter = 4; // [2:0.5:8]

// Bail loop wire thickness
bail_thickness = 2; // [1:0.5:4]

// Bail loop inner radius
bail_inner_radius = 3; // [2:0.5:6]

// Horizontal position offset for attachment (X axis)
attachment_x = 0; // [-10:0.5:10]

// Position offset along the bracelet width (Y axis)
attachment_y = 0; // [-10:0.5:10]

// Vertical position offset for attachment (Z axis)
attachment_z = 0; // [-5:0.5:5]

// Cutout depth — 0 cuts through entire height; positive values cut partially from the top surface
attachment_depth = 0; // [0:0.5:10]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
min_inner_height = 1.5;
effective_thickness = min(charm_thickness, (charm_height - min_inner_height) / 2);
inner_height = max(min_inner_height, charm_height - 2 * effective_thickness);
safe_edge_radius = min(edge_radius, min(effective_thickness, inner_height, gap_width) / 2);
safe_side_edge = min(side_edge_radius, min(effective_thickness, inner_height, gap_width, charm_width) / 2 - 0.1);
safe_icr = min(inner_corner_radius, inner_height / 2 - 0.1, gap_width / 2 - 0.1);
outer_width = charm_length + 2 * effective_thickness;
outer_height = charm_height;
z_offset = outer_height / 2;
profile_center_x = 0;
profile_max_y = outer_height / 2;
charm_top_z = outer_height;
// The flat part of the top face: corner and side-edge rounding curve away
// below charm_top_z outside this rectangle, so this is what a design may
// fill without floating over a curved edge.
face_x = outer_width - 2 * profile_corner_radius;
face_y = charm_width - 2 * safe_side_edge;
// design_2d is drawn rotated 90 degrees, so its local X lands on the
// face's Y (across the bracelet) and its local Y on the face's X.
design_fit_w = face_y * design_scale / 100;
design_fit_h = face_x * design_scale / 100;
design_fit_w_2 = face_y * design_scale_2 / 100;
design_fit_h_2 = face_x * design_scale_2 / 100;
// The app reads this line to learn how wide a design prints, so the drawing
// editor can measure each shape against the nozzle (DP-54). The box, not the
// design: the app applies the design's own aspect the way resize() does.
echo(str("design fit box mm: w=", design_fit_w, " h=", design_fit_h));
assert(design_file_aspect > 0, "design_file_aspect must be positive (width divided by height)");
assert(design_file_2_aspect > 0, "design_file_2_aspect must be positive (width divided by height)");
// ── Layered design ──────────────────────────────────────────────────────────
// The layers are height classes (D-160, D-163, the owner's rule, with the
// braille dot as the picture: a trunk whose height one dial sets for every
// dot, a dome that starts where the trunk ends). A raised layer N stands on
// the charm face and rises to the sum of every raised depth up to and
// including its own, so layer 1 at 0.5, layer 2 at 0.5 and layer 3 at 1.0
// put a layer 3 shape 2.0 mm above the face, and changing layer 2 to 1.0
// moves it to 2.5; an engraved layer N cuts from the face down to the sum of
// every engraved depth up to its own, so a raised layer 1 at 1.0 beside an
// engraved layer 2 at 1.0 leaves 2.0 mm between the two surfaces.
//
// The app writes every shape on layer N or deeper into layer N's file, so the
// shapes on EXACTLY layer n are file n minus file n+1 (layer_exact_2d). A
// layer 3 shape is then built as three slabs, one per band: the layer 1 band
// from the face to layer 1's top, the layer 2 band from there to layer 2's
// top, the layer 3 band from there to its own top. Each band holds the shapes
// of every layer at or above it that goes the same way, and nothing is drawn
// twice: no slab overlaps another, no column is extruded from the floor
// under a slab already there (D-163, "a fantastic waste"). When layer files
// are present the stack IS the design: the single design pass is skipped,
// or the design would print once more at Engrave depth beneath the stack
// (D-135's mechanism, seen by the owner as a duplicate at another height).
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
layer_top_0 = charm_top_z;
layer_top_1 = layer_top_0 + layer_1_up;
layer_top_2 = layer_top_1 + layer_2_up;
layer_top_3 = layer_top_2 + layer_3_up;
layer_floor_0 = charm_top_z;
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
// A pass may not cut through the charm: the stack's floor has to stay inside
// the material it is carved from.
assert(!layered_mode || layer_stack_floor > 0,
       "layered design cuts through the charm - reduce the engraved depths");

echo(str("layer levels mm: top1=", layer_top_1, " top2=", layer_top_2, " top3=", layer_top_3,
         " floor1=", layer_floor_1, " floor2=", layer_floor_2, " floor3=", layer_floor_3,
         " stack_top=", layer_stack_top));

total_top_z = charm_top_z
    + max(
        (!layered_mode && design_style == "raised") ? engrave_depth : 0,
        (design_file_2 != "" && design_style_2 == "raised") ? max(0, engrave_depth + design_2_thickness) : 0,
        (text_content != "" && text_style == "raised") ? text_depth : 0,
        (text_content_2 != "" && text_style_2 == "raised") ? max(0, text_depth_2 + text_2_thickness) : 0,
        layer_stack_top - charm_top_z
    );

module profile_2d() {
    max_gap_shift = (charm_length - gap_width) / 2 - 1;
    safe_gap_offset = max(-max_gap_shift, min(gap_offset, max_gap_shift));
    difference() {
        offset(r = profile_corner_radius)
            square([outer_width - 2 * profile_corner_radius,
                    outer_height - 2 * profile_corner_radius], center = true);
        if (safe_icr > 0) {
            gap_ext = 10;
            offset(r = safe_icr) offset(r = -safe_icr)
                union() {
                    square([charm_length, inner_height], center = true);
                    translate([safe_gap_offset, -outer_height / 2 + (effective_thickness - gap_ext) / 2])
                        square([gap_width, effective_thickness + gap_ext], center = true);
                }
        } else {
            polygon([
                [-gap_width/2 + safe_gap_offset, -outer_height/2 - 0.1],
                [-gap_width/2 + safe_gap_offset, -outer_height/2 + effective_thickness],
                [-charm_length/2,              -outer_height/2 + effective_thickness],
                [-charm_length/2,               outer_height/2 - effective_thickness],
                [ charm_length/2,               outer_height/2 - effective_thickness],
                [ charm_length/2,              -outer_height/2 + effective_thickness],
                [ gap_width/2 + safe_gap_offset, -outer_height/2 + effective_thickness],
                [ gap_width/2 + safe_gap_offset, -outer_height/2 - 0.1]
            ]);
        }
    }
}

module edge_rounded_profile(er) {
    if (er > 0)
        offset(r = er) offset(r = -er) profile_2d();
    else
        profile_2d();
}

module charm_body() {
    translate([0, 0, z_offset])
        rotate([90, 0, 0]) {
            if (safe_side_edge > 0) {
                steps = max(4, min(round($fn / 8), 12));
                body_h = charm_width - 2 * safe_side_edge;

                if (body_h > 0)
                    linear_extrude(height = body_h, center = true)
                        edge_rounded_profile(safe_edge_radius);

                for (i = [0 : steps - 1]) {
                    a  = 90 * i / steps;
                    a2 = 90 * (i + 1) / steps;
                    z0    = safe_side_edge * sin(a);
                    sh    = safe_side_edge * (sin(a2) - sin(a)) + 0.01;
                    inset = safe_side_edge * (1 - cos(a));

                    translate([0, 0, body_h / 2 + z0])
                        linear_extrude(height = sh)
                            offset(r = -inset)
                                edge_rounded_profile(safe_edge_radius);

                    mirror([0, 0, 1])
                        translate([0, 0, body_h / 2 + z0])
                            linear_extrude(height = sh)
                                offset(r = -inset)
                                    edge_rounded_profile(safe_edge_radius);
                }
            } else if (safe_edge_radius > 0) {
                linear_extrude(height = charm_width, center = true)
                    edge_rounded_profile(safe_edge_radius);
            } else {
                linear_extrude(height = charm_width, center = true)
                    profile_2d();
            }
        }
}

// SVG limitation: OpenSCAD import() renders all filled SVG elements as solid
// geometry. Multi-element SVGs that rely on color layering (e.g., white shapes
// over black to simulate cutouts) will appear solid. Use single-path SVGs or
// the SVG preparer tool (F-11, planned) for compound designs.
module design_2d() {
    if (design_file != "") {
        // Contain-fit to the flat top face: anchor the resize to whichever
        // axis the design hits first (design_file_aspect carries the ratio
        // OpenSCAD cannot measure). Rotation and offsets can still push a
        // design past the face; raised designs are clipped at the flat top.
        translate([-design_up_down, design_left_right])
            rotate([0, 0, design_rotation + 90])
                offset(r = design_offset)
                    resize(design_file_aspect >= design_fit_w / design_fit_h
                               ? [design_fit_w, 0]
                               : [0, design_fit_h],
                           auto = true)
                        import(design_file, center = true);
    }
}

module design_2d_layer2() {
    if (design_file_2 != "") {
        translate([-design_2_up_down, design_2_left_right])
            rotate([0, 0, design_rotation_2 + 90])
                offset(r = design_offset)
                    resize(design_file_2_aspect >= design_fit_w_2 / design_fit_h_2
                               ? [design_fit_w_2, 0]
                               : [0, design_fit_h_2],
                           auto = true)
                        import(design_file_2, center = true);
    }
}

// One pass of a layered design, placed exactly like the single design above so
// the two surfaces agree. The file arrives on the shared canvas with its own
// minimum corner at the origin, so it is centered here and then scaled by ONE
// factor - never resize()d, which would fit each pass to the face separately
// and scale the smallest one up to the size of the largest.
module design_layer_2d(layer_file, layer_aspect) {
    canvas_h = layer_canvas_span / layer_aspect;
    fit = (layer_aspect >= design_fit_w / design_fit_h)
              ? design_fit_w / layer_canvas_span
              : design_fit_h / canvas_h;
    translate([-design_up_down, design_left_right])
        rotate([0, 0, design_rotation + 90])
            offset(r = design_offset)
                scale(fit)
                    translate([-layer_canvas_span / 2, -canvas_h / 2])
                        import(layer_file, center = false);
}

// The region of the top surface that is truly flat at charm_top_z; raised
// material outside it would float over the rounded edges.
module top_face_2d() {
    square([face_x, face_y], center = true);
}

module text_2d() {
    if (text_content != "") {
        translate([-text_up_down, text_left_right])
            rotate([0, 0, text_rotation])
                text(text_content, size = text_size,
                     font = "Liberation Sans",
                     halign = "center", valign = "center");
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
// 1 and 2 and none of the raised ones, so a raised layer 1 beside it stands
// full height while the engraved shape is cut from the face down.
module layer_band_2d(n, raised) {
    union() {
        if (n <= 1 && layer_1_on && (layer_raised_1 == raised)) layer_exact_2d(1);
        if (n <= 2 && layer_2_on && (layer_raised_2 == raised)) layer_exact_2d(2);
        if (n <= 3 && layer_3_on && (layer_raised_3 == raised)) layer_exact_2d(3);
    }
}

// One band, raised: the slab from the top below it to its own top, clamped
// to the flat face like the single design. Overlaps the band under it by the
// epsilon so the slabs are one body.
module layer_raised_band(n) {
    up   = (n == 1) ? layer_1_up : (n == 2) ? layer_2_up : layer_3_up;
    base = (n == 1) ? layer_top_0 : (n == 2) ? layer_top_1 : layer_top_2;
    if (up > 0) {
        translate([profile_center_x, 0, base - layer_eps])
            linear_extrude(height = up + layer_eps)
                intersection() {
                    layer_band_2d(n, true);
                    top_face_2d();
                }
    }
}

// One band, engraved: the cut from its own floor up to the floor above it,
// through the face on band 1.
module layer_engraved_band(n) {
    down = (n == 1) ? layer_1_down : (n == 2) ? layer_2_down : layer_3_down;
    top  = (n == 1) ? layer_floor_0 : (n == 2) ? layer_floor_1 : layer_floor_2;
    if (down > 0) {
        translate([profile_center_x, 0, top - down])
            linear_extrude(height = down + layer_eps)
                layer_band_2d(n, false);
    }
}

module text_2d_layer2() {
    if (text_content_2 != "") {
        translate([-text_2_up_down, text_2_left_right])
            rotate([0, 0, text_rotation_2])
                text(text_content_2, size = text_size_2,
                     font = "Liberation Sans",
                     halign = "center", valign = "center");
    }
}

module attachment_cutout() {
    cut_h = attachment_depth > 0 ? attachment_depth + 0.02 : total_top_z + 0.02;
    cut_z = attachment_depth > 0 ? total_top_z - attachment_depth : -0.01;
    if (attachment_type == "keychain_hole") {
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x + attachment_x,
                   charm_width / 2 - margin + attachment_y,
                   cut_z + attachment_z])
            cylinder(d = hole_diameter, h = cut_h);
    } else if (attachment_type == "lanyard_slot") {
        slot_width = hole_diameter * 2;
        r = hole_diameter / 4;
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x + attachment_x,
                   charm_width / 2 - margin + attachment_y,
                   cut_z + attachment_z])
            linear_extrude(height = cut_h)
                hull() {
                    translate([-(slot_width / 2 - r), 0]) circle(r = r);
                    translate([ (slot_width / 2 - r), 0]) circle(r = r);
                }
    }
}

module bail_loop() {
    if (attachment_type == "bail_loop") {
        translate([attachment_x, charm_width / 2 + attachment_y, z_offset + attachment_z])
            rotate([0, 90, 0])
                rotate_extrude(angle = 180, $fn = 32)
                    translate([bail_inner_radius, 0, 0])
                        circle(d = bail_thickness);
    }
}

// The charm with its single designs and text, before the layer stack.
module q_charm_base() {
    difference() {
        union() {
            charm_body();
            bail_loop();
            // With layer files present the stack is the design (D-163).
            if (!layered_mode && design_style == "raised") {
                translate([profile_center_x, 0, charm_top_z])
                    linear_extrude(height = engrave_depth)
                        intersection() {
                            design_2d();
                            top_face_2d();
                        }
            }
            if (design_file_2 != "" && design_style_2 == "raised") {
                translate([profile_center_x, 0, charm_top_z + design_2_thickness])
                    linear_extrude(height = engrave_depth)
                        intersection() {
                            design_2d_layer2();
                            top_face_2d();
                        }
            }
            if (text_content != "" && text_style == "raised") {
                // Clamped to the flat face, the way designs already are: raised
                // text past the face stands on the rounded edge, or on nothing.
                translate([profile_center_x, 0, charm_top_z])
                    linear_extrude(height = text_depth)
                        intersection() {
                            text_2d();
                            top_face_2d();
                        }
            }
            if (text_content_2 != "" && text_style_2 == "raised") {
                translate([profile_center_x, 0, charm_top_z + text_2_thickness])
                    linear_extrude(height = text_depth_2)
                        intersection() {
                            text_2d_layer2();
                            top_face_2d();
                        }
            }
        }
        if (!layered_mode && design_style != "raised") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d();
        }
        if (design_file_2 != "" && design_style_2 != "raised") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth + design_2_thickness])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d_layer2();
        }
        if (text_content != "" && text_style != "raised") {
            // Clamped like the raised case. WIDER than the signed repair,
            // which named raised text only: an engraved cut that runs off the
            // flat face gouges the rounded edge instead of lettering it, and
            // the Flat Pendant clamps both. Two models disagreeing is what
            // this release exists to end.
            translate([profile_center_x, 0, charm_top_z - text_depth])
                linear_extrude(height = text_depth + 0.01)
                    intersection() {
                        text_2d();
                        top_face_2d();
                    }
        }
        if (text_content_2 != "" && text_style_2 != "raised") {
            translate([profile_center_x, 0, charm_top_z - text_depth_2 + text_2_thickness])
                linear_extrude(height = text_depth_2 + 0.01)
                    intersection() {
                        text_2d_layer2();
                        top_face_2d();
                    }
        }
        attachment_cutout();
    }
}

// The layer stack around the base (D-160, D-163): the raised bands added,
// the engraved bands cut. The two never share a footprint (a shape is one
// layer, and a layer goes one way), so the order does not matter.
module q_charm() {
    difference() {
        union() {
            q_charm_base();
            layer_raised_band(1);
            layer_raised_band(2);
            layer_raised_band(3);
        }
        layer_engraved_band(1);
        layer_engraved_band(2);
        layer_engraved_band(3);
    }
}

rotate([0, 0, -90]) q_charm();
