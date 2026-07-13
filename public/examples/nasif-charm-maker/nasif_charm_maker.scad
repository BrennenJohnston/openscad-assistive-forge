// Nasif's Charm Maker — Parametric Charm/Pendant Generator
// Create custom charms with engraved or raised designs from SVG images.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// License: CC0 (Public Domain)

/* [Shape] */
// Base shape of the charm
charm_shape = "circle"; // [circle, square, rounded_rect, hexagon, oval]

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

// Scale the design relative to charm size (percentage)
design_scale = 70; // [20:5:95]

/* [Border] */
// Add a raised border ring
add_border = "yes"; // [yes, no]

// Border width
border_width = 1.5; // [0.5:0.5:4]

// Border height above the surface
border_height = 0.5; // [0.2:0.1:2.0]

/* [Attachment] */
// How the charm attaches to a chain or pin
attachment_type = "keychain_hole"; // [keychain_hole, bail_loop, none]

// Hole diameter (for keychain hole)
hole_diameter = 4; // [2:0.5:8]

// Bail loop thickness (for bail loop)
bail_thickness = 2; // [1:0.5:4]

// Bail loop inner radius
bail_inner_radius = 3; // [2:0.5:6]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
effective_width = charm_width;
effective_height = charm_shape == "circle" ? charm_width : charm_height;
design_w = effective_width * design_scale / 100;
design_h = effective_height * design_scale / 100;

module charm_base_2d() {
    if (charm_shape == "circle") {
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
        resize([design_w, 0], auto = true)
            import(design_file, center = true);
    }
}

module attachment() {
    if (attachment_type == "keychain_hole") {
        // Position hole at top of charm
        hole_y = charm_shape == "circle"
            ? effective_width / 2 - hole_diameter / 2 - 1
            : effective_height / 2 - hole_diameter / 2 - 1;
        translate([0, hole_y, -0.01])
            cylinder(d = hole_diameter, h = charm_thickness + border_height + 0.02);
    } else if (attachment_type == "bail_loop") {
        bail_y = charm_shape == "circle"
            ? effective_width / 2
            : effective_height / 2;
        translate([0, bail_y, charm_thickness / 2])
            rotate([0, 90, 0])
                rotate_extrude(angle = 180, $fn = 32)
                    translate([bail_inner_radius, 0, 0])
                        circle(d = bail_thickness);
    }
}

module engraved_charm() {
    difference() {
        charm_body();
        // Engrave design into top surface
        translate([0, 0, charm_thickness - engrave_depth])
            linear_extrude(height = engrave_depth + border_height + 0.02)
                design_2d();
        attachment();
    }
}

module raised_charm() {
    difference() {
        union() {
            charm_body();
            // Raised design on top surface, embedded a hair so the union
            // genuinely fuses instead of exporting a separate touching shell
            translate([0, 0, charm_thickness - 0.02])
                linear_extrude(height = engrave_depth + 0.02)
                    design_2d();
        }
        attachment();
    }
}

// Render
if (design_raised == "yes") {
    raised_charm();
} else {
    engraved_charm();
}
