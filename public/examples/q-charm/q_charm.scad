// Q Charm — Parametric C-Clip Bracelet Charm
// C-shaped clip-on charm for silicone bracelets with customizable design.
// Profile stands vertically; the outer surface faces up for engraving.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// License: CC0 (Public Domain)

/* [Dimensions] */
// Width along the bracelet (Y axis)
extrude_width = 20; // [10:1:40]

/* [Fit] */
// Overall height of the C-clip profile
charm_height = 8.5; // [6:0.5:15]

// Wall and material thickness
charm_thickness = 3; // [1.5:0.5:5]

// Width of the inner bracelet channel
bracelet_width = 14; // [10:1:25]

/* [Design] */
// Image file for the design (SVG, PNG, or JPG — raster images auto-convert to SVG)
design_file = "smiley.svg"; // [file:svg,png,jpg]

// Depth of engraving (or height of raised design)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Raised design instead of engraved
design_raised = "yes"; // [yes, no]

// Scale the design relative to the charm face (percentage)
design_scale = 60; // [20:5:95]

// Offset to thicken SVG lines for FDM printability (0.6 = 1.2mm total, two 0.4mm nozzle walls)
design_offset = 0.6; // [0:0.1:1.5]

/* [Text] */
// Text or number to display on the charm face (leave empty for none)
text_content = "";

// Text height in mm
text_size = 5; // [3:0.5:12]

// Horizontal position offset from center
text_x = 0; // [-10:0.5:10]

// Vertical position offset from center
text_y = 0; // [-10:0.5:10]

// Depth of text engraving (or height of raised text)
text_depth = 0.8; // [0.2:0.1:2]

// Raised text instead of engraved
text_raised = "yes"; // [yes, no]

/* [Border] */
// Add a raised border rim around the charm perimeter
add_border = "no"; // [yes, no]

// Border height above the surface
border_height = 0.5; // [0.2:0.1:2.0]

/* [Rounding] */
// Edge rounding radius (0 = sharp edges)
edge_radius = 1.0; // [0:0.25:3]

// Round only the long extrusion edges (faster) or all edges
sidesonly = true; // [true, false]

/* [Attachment] */
// Optional attachment at one end of the charm
attachment_type = "none"; // [none, keychain_hole, bail_loop, lanyard_slot]

// Hole diameter (for keychain hole and lanyard slot sizing)
hole_diameter = 4; // [2:0.5:8]

// Bail loop wire thickness
bail_thickness = 2; // [1:0.5:4]

// Bail loop inner radius
bail_inner_radius = 3; // [2:0.5:6]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
gap_width = 4;                 // [2:0.5:8]
profile_corner_radius = 2;    // [0.5:0.5:4]

inner_height = max(0.5, charm_height - 2 * charm_thickness);
outer_width = bracelet_width + 2 * charm_thickness;
outer_height = charm_height;
z_offset = outer_height / 2;
profile_center_x = 0;
profile_max_y = outer_height / 2;
charm_top_z = outer_height;
face_dim = min(extrude_width, bracelet_width);
design_size = face_dim * design_scale / 100;
total_top_z = charm_top_z
    + (add_border == "yes" ? border_height : 0)
    + max(
        (design_raised == "yes") ? engrave_depth : 0,
        (text_content != "" && text_raised == "yes") ? text_depth : 0
    );

module profile_2d() {
    clip_fillet = min(profile_corner_radius / 2, inner_height / 3, gap_width / 4);
    difference() {
        offset(r = profile_corner_radius)
            square([outer_width - 2 * profile_corner_radius,
                    outer_height - 2 * profile_corner_radius], center = true);
        offset(delta = clip_fillet) offset(r = -clip_fillet)
            polygon([
                [-gap_width/2,   -outer_height/2 - 0.1],
                [-gap_width/2,   -outer_height/2 + charm_thickness],
                [-bracelet_width/2, -outer_height/2 + charm_thickness],
                [-bracelet_width/2,  outer_height/2 - charm_thickness],
                [ bracelet_width/2,  outer_height/2 - charm_thickness],
                [ bracelet_width/2, -outer_height/2 + charm_thickness],
                [ gap_width/2,   -outer_height/2 + charm_thickness],
                [ gap_width/2,   -outer_height/2 - 0.1]
            ]);
    }
}

module charm_body() {
    translate([0, 0, z_offset])
        rotate([90, 0, 0]) {
            if (edge_radius > 0 && sidesonly) {
                minkowski() {
                    linear_extrude(height = extrude_width, center = true)
                        offset(r = -edge_radius)
                            profile_2d();
                    cylinder(r = edge_radius, h = 0.01, center = true);
                }
            } else if (edge_radius > 0) {
                minkowski() {
                    linear_extrude(
                        height = extrude_width - 2 * edge_radius,
                        center = true
                    )
                        offset(r = -edge_radius)
                            profile_2d();
                    sphere(r = edge_radius);
                }
            } else {
                linear_extrude(height = extrude_width, center = true)
                    profile_2d();
            }
        }
}

module design_2d() {
    offset(r = design_offset)
        resize([design_size, 0], auto = true)
            import(design_file, center = true);
}

module text_2d() {
    if (text_content != "") {
        translate([text_x, text_y])
            text(text_content, size = text_size,
                 font = "Liberation Sans",
                 halign = "center", valign = "center");
    }
}

module border_shell() {
    if (add_border == "yes") {
        translate([0, 0, z_offset])
            rotate([90, 0, 0])
                linear_extrude(height = extrude_width, center = true)
                    difference() {
                        offset(r = border_height)
                            profile_2d();
                        profile_2d();
                    }
    }
}

module attachment_cutout() {
    if (attachment_type == "keychain_hole") {
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x, extrude_width / 2 - margin, -0.01])
            cylinder(d = hole_diameter, h = total_top_z + 0.02);
    } else if (attachment_type == "lanyard_slot") {
        slot_width = hole_diameter * 2;
        r = hole_diameter / 4;
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x, extrude_width / 2 - margin, -0.01])
            linear_extrude(height = total_top_z + 0.02)
                hull() {
                    translate([-(slot_width / 2 - r), 0]) circle(r = r);
                    translate([ (slot_width / 2 - r), 0]) circle(r = r);
                }
    }
}

module bail_loop() {
    if (attachment_type == "bail_loop") {
        translate([0, extrude_width / 2, z_offset])
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
            border_shell();
            bail_loop();
            if (design_raised == "yes") {
                translate([profile_center_x, 0, charm_top_z])
                    linear_extrude(height = engrave_depth)
                        design_2d();
            }
            if (text_content != "" && text_raised == "yes") {
                translate([profile_center_x, 0, charm_top_z])
                    linear_extrude(height = text_depth)
                        text_2d();
            }
        }
        if (design_raised != "yes") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d();
        }
        if (text_content != "" && text_raised != "yes") {
            translate([profile_center_x, 0, charm_top_z - text_depth])
                linear_extrude(height = text_depth + 0.01)
                    text_2d();
        }
        attachment_cutout();
    }
}

q_charm();
