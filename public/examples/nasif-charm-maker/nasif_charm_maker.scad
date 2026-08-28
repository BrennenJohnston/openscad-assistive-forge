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
// Image file for the design (SVG, PNG, or JPG — raster images auto-convert to SVG)
design_file = "heart.svg"; // [file:svg,png,jpg]

// Engraving depth (or raise height)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Raised design instead of engraved
design_raised = "no"; // [yes, no]

// Design size as a percentage of the charm face; 100 fills the face (the face excludes the border ring when the border is on)
design_scale = 70; // [10:5:110]

// Design width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so 100 truly fills the face (1 assumes a square design)
design_file_aspect = 1; // [0.05:0.01:20]

// Offset to thicken SVG lines for FDM printability (0 = off; 0.6 = recommended for 0.4mm nozzle)
design_offset = 0; // [0:0.2:1.5]

// Left (-) / right (+) position offset for design
design_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for design
design_up_down = 0; // [-15:0.5:15]

// Rotation angle for design (degrees, counter-clockwise)
design_rotation = 0; // [-180:5:180]

// The design's own outline, with every hole filled. Written by the Assistive
// Forge app from your drawing; used only when Charm shape is "design", where
// it becomes the whole pendant instead of a circle or a square.
design_silhouette = ""; // [file:svg]

// Outline width divided by height (set automatically by the app)
design_silhouette_aspect = 1; // [0.05:0.01:20]

/* [Text] */
// Text or number to display on the charm face (leave empty for none)
text_content = "";

// Depth of text engraving (or height of raised text)
text_depth = 0.8; // [0.2:0.1:2]

// Text style on the charm surface
text_style = "raised"; // [raised, engraved]

// Text size
text_size = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for text
text_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for text
text_up_down = 8; // [-15:0.5:15]

// Rotation angle for text (degrees, counter-clockwise)
text_rotation = 0; // [-180:5:180]

/* [Text Layer 2] */
// Second line of text (leave empty for none)
text_content_2 = "";

// Depth of second text engraving (or height of raised text)
text_depth_2 = 0.8; // [0.2:0.1:2]

// Second text style on the charm surface
text_style_2 = "raised"; // [raised, engraved]

// Second text size
text_size_2 = 5; // [3:0.5:12]

// Left (-) / right (+) position offset for second text
text_2_left_right = 0; // [-15:0.5:15]

// Down (-) / up (+) position offset for second text
text_2_up_down = -8; // [-15:0.5:15]

// Rotation angle for second text (degrees, counter-clockwise)
text_rotation_2 = 0; // [-180:5:180]

// Thickness offset for second text (height relative to the charm surface)
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

module attachment() {
    if (attachment_type == "keychain_hole") {
        // Position hole at top of charm
        hole_y = charm_shape == "circle"
            ? effective_width / 2 - hole_diameter / 2 - 1
            : effective_height / 2 - hole_diameter / 2 - 1;
        translate([attachment_x, hole_y + attachment_y, -0.01])
            cylinder(d = hole_diameter, h = charm_thickness + border_height + 0.02);
    } else if (attachment_type == "lanyard_slot") {
        slot_width = hole_diameter * 2;
        r = hole_diameter / 4;
        slot_y = charm_shape == "circle"
            ? effective_width / 2 - hole_diameter / 2 - 1
            : effective_height / 2 - hole_diameter / 2 - 1;
        translate([attachment_x, slot_y + attachment_y, -0.01])
            linear_extrude(height = charm_thickness + border_height + 0.02)
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
        // Engrave design into top surface
        translate([0, 0, charm_thickness - engrave_depth])
            linear_extrude(height = engrave_depth + border_height + 0.02)
                design_2d();
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
            // edge instead of leaving material hanging off the face.
            translate([0, 0, charm_thickness - 0.02])
                linear_extrude(height = engrave_depth + 0.02)
                    intersection() {
                        design_2d();
                        charm_base_2d();
                    }
            raised_text();
        }
        engraved_text();
        attachment();
    }
}

// Render
if (design_raised == "yes") {
    raised_charm();
} else {
    engraved_charm();
}
