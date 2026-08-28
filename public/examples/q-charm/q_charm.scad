// Bracelet Clip Charm — Parametric C-Clip Bracelet Charm
// C-shaped clip-on charm for silicone bracelets with customizable design.
// Profile stands vertically; the outer surface faces up for engraving.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// AAC bracelet charm prior art by Duy Do (UW WOOF3D): thingiverse.com/thing:7153594
// License: CC0 (Public Domain)

/* [Design] */
// Image file for the design (SVG, PNG, or JPG — raster images auto-convert to SVG; use simple single-path SVGs for best results)
design_file = ""; // [file:svg,png,jpg]

// Depth of engraving (or height of raised design)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Design style on the charm surface
design_style = "raised"; // [raised, engraved]

// Design size as a percentage of the charm's flat top face; 100 fills it
design_scale = 60; // [10:5:110]

// Design width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so 100 truly fills the face (1 assumes a square design)
design_file_aspect = 1; // [0.05:0.01:20]

// Offset to thicken SVG lines for FDM printability (0 = off; 0.6 = recommended for 0.4mm nozzle)
design_offset = 0; // [0:0.2:1.5]

// Left (−) / right (+) position offset for design
design_left_right = 0; // [-10:0.5:10]

// Down (−) / up (+) position offset for design
design_up_down = 0; // [-10:0.5:10]

// Rotation angle for design (degrees, counter-clockwise)
design_rotation = 0; // [-180:5:180]

/* [Design Layer 2] */
// Image file for the second design (leave empty for none)
design_file_2 = ""; // [file:svg,png,jpg]

// Design style for second design
design_style_2 = "raised"; // [raised, engraved]

// Second design size as a percentage of the charm's flat top face; 100 fills it
design_scale_2 = 40; // [10:5:110]

// Second design width divided by height (set automatically by the app, like design_file_aspect)
design_file_2_aspect = 1; // [0.05:0.01:20]

// Left (−) / right (+) position offset for second design
design_2_left_right = 0; // [-10:0.5:10]

// Down (−) / up (+) position offset for second design
design_2_up_down = 0; // [-10:0.5:10]

// Rotation angle for second design (degrees, counter-clockwise)
design_rotation_2 = 0; // [-180:5:180]

// Thickness offset for second design (height relative to the charm surface)
design_2_thickness = 0; // [-3:0.1:3]

/* [Layered design (prototype)] */
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
// Text or number to display on the charm face (leave empty for none)
text_content = "";

// Depth of text engraving (or height of raised text)
text_depth = 0.8; // [0.2:0.1:2]

// Text style on the charm surface
text_style = "raised"; // [raised, engraved]

// Text height in mm
text_size = 5; // [3:0.5:12]

// Left (−) / right (+) position offset for text
text_left_right = 6; // [-10:0.5:10]

// Down (−) / up (+) position offset for text
text_up_down = 5.5; // [-10:0.5:10]

// Rotation angle for text (degrees, counter-clockwise)
text_rotation = 90; // [-180:5:180]

/* [Text Layer 2] */
// Second text line to display on the charm face (leave empty for none)
text_content_2 = "";

// Depth of second text engraving (or height of raised text)
text_depth_2 = 0.8; // [0.2:0.1:2]

// Text style for second text
text_style_2 = "raised"; // [raised, engraved]

// Text height in mm for second text
text_size_2 = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for second text
text_2_left_right = -6; // [-10:0.5:10]

// Down (-) / up (+) position offset for second text
text_2_up_down = 5.5; // [-10:0.5:10]

// Rotation angle for second text (degrees, counter-clockwise)
text_rotation_2 = 90; // [-180:5:180]

// Thickness offset for second text (height relative to the charm surface)
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
assert(design_file_aspect > 0, "design_file_aspect must be positive (width divided by height)");
assert(design_file_2_aspect > 0, "design_file_2_aspect must be positive (width divided by height)");
// ── Layered design (prototype) ──────────────────────────────────────────────
// The containment law from the directive, as arithmetic: each pass is anchored
// where the previous one FINISHED, so a raised layer 2 stands on layer 1's top
// and an engraved layer 2 cuts down from layer 1's floor. Nothing floats.
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

// Signed travel: up for a raised pass, down for an engraved one, nothing at
// all for a layer with no file.
layer_1_rise = layer_1_on ? ((design_layer_1_style == "raised") ? design_layer_1_depth : -design_layer_1_depth) : 0;
layer_2_rise = layer_2_on ? ((design_layer_2_style == "raised") ? design_layer_2_depth : -design_layer_2_depth) : 0;
layer_3_rise = layer_3_on ? ((design_layer_3_style == "raised") ? design_layer_3_depth : -design_layer_3_depth) : 0;

layer_base_1 = charm_top_z;
layer_base_2 = layer_base_1 + layer_1_rise;
layer_base_3 = layer_base_2 + layer_2_rise;
layer_stack_top = max(charm_top_z, layer_base_2, layer_base_3, layer_base_3 + layer_3_rise);

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
assert(!layered_mode || min(layer_base_1, layer_base_2, layer_base_3, layer_base_3 + layer_3_rise) > 0,
       "layered design cuts through the charm - reduce the engraved depths");

echo(str("layer anchors mm: base1=", layer_base_1, " base2=", layer_base_2,
         " base3=", layer_base_3, " stack_top=", layer_stack_top));

total_top_z = charm_top_z
    + max(
        (design_style == "raised") ? engrave_depth : 0,
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
// minimum corner at the origin, so it is centred here and then scaled by ONE
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

module q_charm() {
    difference() {
        union() {
            charm_body();
            bail_loop();
            if (design_style == "raised") {
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
            if (layer_1_on && design_layer_1_style == "raised") {
                translate([profile_center_x, 0, layer_base_1 - layer_eps])
                    linear_extrude(height = design_layer_1_depth + layer_eps)
                        intersection() {
                            design_layer_2d(design_layer_1, design_layer_1_aspect);
                            top_face_2d();
                        }
            }
            if (layer_2_on && design_layer_2_style == "raised") {
                translate([profile_center_x, 0, layer_base_2 - layer_eps])
                    linear_extrude(height = design_layer_2_depth + layer_eps)
                        intersection() {
                            design_layer_2d(design_layer_2, design_layer_2_aspect);
                            top_face_2d();
                        }
            }
            if (layer_3_on && design_layer_3_style == "raised") {
                translate([profile_center_x, 0, layer_base_3 - layer_eps])
                    linear_extrude(height = design_layer_3_depth + layer_eps)
                        intersection() {
                            design_layer_2d(design_layer_3, design_layer_3_aspect);
                            top_face_2d();
                        }
            }
            if (text_content != "" && text_style == "raised") {
                translate([profile_center_x, 0, charm_top_z])
                    linear_extrude(height = text_depth)
                        text_2d();
            }
            if (text_content_2 != "" && text_style_2 == "raised") {
                translate([profile_center_x, 0, charm_top_z + text_2_thickness])
                    linear_extrude(height = text_depth_2)
                        text_2d_layer2();
            }
        }
        if (design_style != "raised") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d();
        }
        if (design_file_2 != "" && design_style_2 != "raised") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth + design_2_thickness])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d_layer2();
        }
        if (layer_1_on && design_layer_1_style != "raised") {
            translate([profile_center_x, 0, layer_base_1 - design_layer_1_depth])
                linear_extrude(height = design_layer_1_depth + layer_eps)
                    design_layer_2d(design_layer_1, design_layer_1_aspect);
        }
        if (layer_2_on && design_layer_2_style != "raised") {
            translate([profile_center_x, 0, layer_base_2 - design_layer_2_depth])
                linear_extrude(height = design_layer_2_depth + layer_eps)
                    design_layer_2d(design_layer_2, design_layer_2_aspect);
        }
        if (layer_3_on && design_layer_3_style != "raised") {
            translate([profile_center_x, 0, layer_base_3 - design_layer_3_depth])
                linear_extrude(height = design_layer_3_depth + layer_eps)
                    design_layer_2d(design_layer_3, design_layer_3_aspect);
        }
        if (text_content != "" && text_style != "raised") {
            translate([profile_center_x, 0, charm_top_z - text_depth])
                linear_extrude(height = text_depth + 0.01)
                    text_2d();
        }
        if (text_content_2 != "" && text_style_2 != "raised") {
            translate([profile_center_x, 0, charm_top_z - text_depth_2 + text_2_thickness])
                linear_extrude(height = text_depth_2 + 0.01)
                    text_2d_layer2();
        }
        attachment_cutout();
    }
}

rotate([0, 0, -90]) q_charm();
