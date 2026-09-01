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
// Image file for engraving (SVG, PNG, or JPG — raster images auto-convert to SVG)
logo_file = "sample-logo.svg"; // [file:svg,png,jpg]

// Engraving depth
cut_depth = 1.0; // [0.3:0.1:3.0]

// Logo width in mm (0 = auto-fit to the plate on both axes)
logo_width = 0; // [0:1:120]

// Logo width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so auto-fit truly fits (1 assumes a square logo)
logo_file_aspect = 1; // [0.05:0.01:20]

// Invert the engraving (raised instead of cut)
logo_raised = "no"; // [yes, no]

// Logo size as a percentage of the space it is allowed to fill; 100 fills it.
// Ignored when Logo width is set: an exact width in millimetres wins over a
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
// logo_width alone: an exact width in millimetres is the more specific
// instruction, so it wins, and at the default 100 the auto-fit is exactly
// what it was before this parameter existed.
scaled_fit_w = auto_fit_w * logo_scale / 100;
scaled_fit_h = auto_fit_h * logo_scale / 100;

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

module keychain_cutout() {
    if (keychain_hole == "yes") {
        translate([plate_width / 2 + hole_left_right,
                   plate_depth - hole_margin + hole_up_down, -0.01])
            cylinder(d = hole_diameter, h = plate_thickness + 0.02);
    }
}

module engraved_plate() {
    difference() {
        union() {
            plate_body();
            text_raised();
        }
        keychain_cutout();

        // Engrave logo into top surface
        translate([plate_width / 2, logo_center_y, plate_thickness - cut_depth])
            linear_extrude(height = cut_depth + 0.01)
                logo_2d();
        text_engraved();
    }
}

module raised_plate() {
    difference() {
        union() {
            plate_body();
            // Raised logo on the top surface, clipped at the plate footprint
            // so an oversized manual width cannot leave material hanging off
            // the edge or floating past a corner.
            translate([0, 0, plate_thickness])
                linear_extrude(height = cut_depth)
                    intersection() {
                        translate([plate_width / 2, logo_center_y])
                            logo_2d();
                        plate_2d();
                    }
            text_raised();
        }
        keychain_cutout();
        text_engraved();
    }
}

// Render
difference() {
    if (logo_raised == "yes") {
        raised_plate();
    } else {
        engraved_plate();
    }
}
