// Q Charm — Parametric C-Clip Bracelet Charm
// C-shaped clip-on charm for silicone bracelets with customizable design.
// Profile stands vertically; the outer surface faces up for engraving.
// Concept inspired by Nasif Zaman's image-to-OpenSCAD proof-of-concept.
// License: CC0 (Public Domain)

/* [Fit] */
// Length of the charm along the bracelet (Y axis)
charm_length = 20; // [10:1:40]

// Overall height of the C-clip profile
charm_height = 8.5; // [6:0.5:15]

// Wall and material thickness
charm_thickness = 3; // [2.25:0.25:4]

// Width of the inner bracelet channel
bracelet_width = 14; // [10:1:25]

// Shift the gap opening left (−) or right (+) for asymmetric legs
gap_offset = 0; // [-4:0.5:4]

// Width of the bottom opening (gap between the C-clip legs)
gap_width = 4; // [2:0.5:8]

/* [Design] */
// Image file for the design (SVG, PNG, or JPG — raster images auto-convert to SVG; use simple single-path SVGs for best results)
design_file = ""; // [file:svg,png,jpg]

// Depth of engraving (or height of raised design)
engrave_depth = 0.8; // [0.2:0.1:3.0]

// Raised design instead of engraved
design_raised = "yes"; // [yes, no]

// Scale the design relative to the charm face (percentage)
design_scale = 60; // [20:5:95]

// Offset to thicken SVG lines for FDM printability (0.6 = 1.2mm total, two 0.4mm nozzle walls)
design_offset = 0.6; // [0:0.2:1.5]

/* [Design Layer 2] */
// Second image file for layered designs (leave empty for none)
design_file_2 = ""; // [file:svg,png,jpg]

// Scale the second design relative to the charm face (percentage)
design_scale_2 = 40; // [20:5:95]

// Horizontal position offset for second design
design_x_2 = 0; // [-10:0.5:10]

// Vertical position offset for second design
design_y_2 = 0; // [-10:0.5:10]

// Z-offset for second design layer (adjust height relative to the charm surface)
design_z_2 = 0; // [-3:0.1:3]

// Raised second design instead of engraved
design_raised_2 = "yes"; // [yes, no]

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
// Add a raised border rim around the top face of the charm
add_border = "no"; // [yes, no]

// Width of the border ring (how far inward the rim extends)
border_width = 1.5; // [0.5:0.5:4]

// Height of the border rim above the top surface
border_height = 0.5; // [0.2:0.1:2.0]

/* [Rounding] */
// Side edge rounding radius (0 = sharp side edges)
edge_radius = 1.0; // [0:0.25:3]

// All-edges rounding radius including top and bottom faces (0 = off; overrides side-only when active — slower render)
all_edges_radius = 0; // [0:0.25:3]

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
safe_all_edges = min(all_edges_radius, min(effective_thickness, inner_height, gap_width, charm_length) / 2 - 0.1);
safe_icr = min(inner_corner_radius, inner_height / 2 - 0.1, gap_width / 2 - 0.1);
outer_width = bracelet_width + 2 * effective_thickness;
outer_height = charm_height;
z_offset = outer_height / 2;
profile_center_x = 0;
profile_max_y = outer_height / 2;
charm_top_z = outer_height;
face_dim = min(charm_length, bracelet_width);
design_size = face_dim * design_scale / 100;
design_size_2 = face_dim * design_scale_2 / 100;
total_top_z = charm_top_z
    + (add_border == "yes" ? border_height : 0)
    + max(
        (design_raised == "yes") ? engrave_depth : 0,
        (design_file_2 != "" && design_raised_2 == "yes") ? max(0, engrave_depth + design_z_2) : 0,
        (text_content != "" && text_raised == "yes") ? text_depth : 0
    );

module profile_2d() {
    max_gap_shift = (bracelet_width - gap_width) / 2 - 1;
    safe_gap_offset = max(-max_gap_shift, min(gap_offset, max_gap_shift));
    difference() {
        offset(r = profile_corner_radius)
            square([outer_width - 2 * profile_corner_radius,
                    outer_height - 2 * profile_corner_radius], center = true);
        if (safe_icr > 0) {
            gap_ext = 10;
            offset(r = safe_icr) offset(r = -safe_icr)
                union() {
                    square([bracelet_width, inner_height], center = true);
                    translate([safe_gap_offset, -outer_height / 2 + (effective_thickness - gap_ext) / 2])
                        square([gap_width, effective_thickness + gap_ext], center = true);
                }
        } else {
            polygon([
                [-gap_width/2 + safe_gap_offset, -outer_height/2 - 0.1],
                [-gap_width/2 + safe_gap_offset, -outer_height/2 + effective_thickness],
                [-bracelet_width/2,              -outer_height/2 + effective_thickness],
                [-bracelet_width/2,               outer_height/2 - effective_thickness],
                [ bracelet_width/2,               outer_height/2 - effective_thickness],
                [ bracelet_width/2,              -outer_height/2 + effective_thickness],
                [ gap_width/2 + safe_gap_offset, -outer_height/2 + effective_thickness],
                [ gap_width/2 + safe_gap_offset, -outer_height/2 - 0.1]
            ]);
        }
    }
}

module charm_body() {
    translate([0, 0, z_offset])
        rotate([90, 0, 0]) {
            if (safe_all_edges > 0) {
                minkowski() {
                    linear_extrude(
                        height = charm_length - 2 * safe_all_edges,
                        center = true
                    )
                        offset(r = -safe_all_edges)
                            profile_2d();
                    sphere(r = safe_all_edges);
                }
            } else if (safe_edge_radius > 0) {
                minkowski() {
                    linear_extrude(height = charm_length, center = true)
                        offset(r = -safe_edge_radius)
                            profile_2d();
                    cylinder(r = safe_edge_radius, h = 0.01, center = true);
                }
            } else {
                linear_extrude(height = charm_length, center = true)
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
        offset(r = design_offset)
            resize([design_size, 0], auto = true)
                import(design_file, center = true);
    }
}

module design_2d_layer2() {
    if (design_file_2 != "") {
        translate([design_x_2, design_y_2])
            offset(r = design_offset)
                resize([design_size_2, 0], auto = true)
                    import(design_file_2, center = true);
    }
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
        safe_bw = max(0.1, min(border_width, outer_width / 2 - 1, charm_length / 2 - 1));
        translate([profile_center_x, 0, charm_top_z])
            linear_extrude(height = border_height)
                difference() {
                    square([outer_width, charm_length], center = true);
                    square([outer_width - 2 * safe_bw, charm_length - 2 * safe_bw], center = true);
                }
    }
}

module attachment_cutout() {
    cut_h = attachment_depth > 0 ? attachment_depth + 0.02 : total_top_z + 0.02;
    cut_z = attachment_depth > 0 ? total_top_z - attachment_depth : -0.01;
    if (attachment_type == "keychain_hole") {
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x + attachment_x,
                   charm_length / 2 - margin + attachment_y,
                   cut_z + attachment_z])
            cylinder(d = hole_diameter, h = cut_h);
    } else if (attachment_type == "lanyard_slot") {
        slot_width = hole_diameter * 2;
        r = hole_diameter / 4;
        margin = hole_diameter / 2 + 1;
        translate([profile_center_x + attachment_x,
                   charm_length / 2 - margin + attachment_y,
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
        translate([attachment_x, charm_length / 2 + attachment_y, z_offset + attachment_z])
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
            if (design_file_2 != "" && design_raised_2 == "yes") {
                translate([profile_center_x, 0, charm_top_z + design_z_2])
                    linear_extrude(height = engrave_depth)
                        design_2d_layer2();
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
        if (design_file_2 != "" && design_raised_2 != "yes") {
            translate([profile_center_x, 0, charm_top_z - engrave_depth + design_z_2])
                linear_extrude(height = engrave_depth + 0.01)
                    design_2d_layer2();
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
