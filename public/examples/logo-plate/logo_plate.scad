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
// SVG file for engraving
logo_file = "sample-logo.svg"; // [file:svg]

// Engraving depth
cut_depth = 1.0; // [0.3:0.1:3.0]

// Logo width (0 = auto-fit to plate)
logo_width = 0; // [0:1:100]

// Invert the engraving (raised instead of cut)
logo_raised = "no"; // [yes, no]

/* [Mounting] */
// Add keychain hole
keychain_hole = "yes"; // [yes, no]

// Hole diameter
hole_diameter = 5; // [3:0.5:8]

/* [Quality] */
$fn = 48; // [24:8:128]

/* [Hidden] */
effective_logo_width = logo_width > 0 ? logo_width : plate_width - 8;
logo_offset_x = (plate_width - effective_logo_width) / 2;
logo_offset_y = plate_depth * 0.15;
hole_margin = 4;

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
    resize([effective_logo_width, 0], auto = true)
        import(logo_file, center = true);
}

module plate_body() {
    translate(corner_radius > 0 ? [corner_radius, corner_radius, 0] : [0, 0, 0])
        rounded_plate(plate_width, plate_depth, plate_thickness, corner_radius);
}

module keychain_cutout() {
    if (keychain_hole == "yes") {
        translate([plate_width / 2, plate_depth - hole_margin, -0.01])
            cylinder(d = hole_diameter, h = plate_thickness + 0.02);
    }
}

module engraved_plate() {
    difference() {
        plate_body();
        keychain_cutout();

        // Engrave logo into top surface
        translate([plate_width / 2, plate_depth * 0.45, plate_thickness - cut_depth])
            linear_extrude(height = cut_depth + 0.01)
                logo_2d();
    }
}

module raised_plate() {
    plate_body();

    // Subtract keychain hole from the combined body + raised logo
    difference() {
        // Raised logo on top surface
        translate([plate_width / 2, plate_depth * 0.45, plate_thickness])
            linear_extrude(height = cut_depth)
                logo_2d();
        keychain_cutout();
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
