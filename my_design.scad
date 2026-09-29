// ============================================================
//  My First Forge Project — Parametric Storage Box
//  License: CC0 1.0 (Public Domain)
//
//  HOW TO CUSTOMIZE THIS FILE:
//  Parameters below have annotations that Forge reads to build
//  the control panel on the left side of the screen.
//
//  Annotation format:
//    variable = value; // [min:step:max] Label text
//    variable = value; // [option1, option2] Label text
//
//  Change anything in the sections below and click Preview!
// ============================================================

/* [Box Size] */

// Width of the box (left to right, in mm)
box_width = 60; // [20:5:200]

// Depth of the box (front to back, in mm)
box_depth = 40; // [20:5:150]

// Height of the box (in mm)
box_height = 35; // [15:5:150]

// Wall thickness (in mm)
wall_thickness = 2.0; // [1.0:0.5:5.0]

/* [Lid] */

// Include a lid
include_lid = "yes"; // [yes, no]

// Gap between box and lid so they slide on easily
lid_fit_gap = 0.3; // [0.1:0.1:0.8]

/* [Corners] */

// Round the corners? (nicer appearance, slightly slower to preview)
rounded_corners = "yes"; // [yes, no]

// Corner radius when rounded (in mm)
corner_radius = 3; // [1:1:15]

/* [Base] */

// Add rubber-foot bumps underneath
add_feet = "yes"; // [yes, no]

// Foot height (in mm)
foot_height = 2; // [1:1:5]

/* [Quality] */

// Render smoothness — lower is faster for quick previews
$fn = 40; // [16:8:128]

/* [Hidden] */
inner_w = box_width  - wall_thickness * 2;
inner_d = box_depth  - wall_thickness * 2;
inner_h = box_height - wall_thickness;
foot_dia = wall_thickness * 2;


// ---- modules ------------------------------------------------

module rounded_rect(w, d, h, r) {
    hull() {
        for (x = [r, w - r])
            for (y = [r, d - r])
                translate([x, y, 0])
                    cylinder(r = r, h = h);
    }
}

module box_body() {
    difference() {
        if (rounded_corners == "yes") {
            rounded_rect(box_width, box_depth, box_height, corner_radius);
        } else {
            cube([box_width, box_depth, box_height]);
        }

        translate([wall_thickness, wall_thickness, wall_thickness])
            cube([inner_w, inner_d, inner_h + 0.1]);
    }
}

module lid_body() {
    lid_h = wall_thickness + 4;
    skirt_depth = 4;

    union() {
        if (rounded_corners == "yes") {
            rounded_rect(box_width, box_depth, wall_thickness, corner_radius);
        } else {
            cube([box_width, box_depth, wall_thickness]);
        }

        translate([wall_thickness + lid_fit_gap,
                   wall_thickness + lid_fit_gap,
                   -skirt_depth])
            cube([
                inner_w - lid_fit_gap * 2,
                inner_d - lid_fit_gap * 2,
                skirt_depth + 0.1
            ]);
    }
}

module feet() {
    offsets = [
        [foot_dia, foot_dia],
        [box_width - foot_dia * 2, foot_dia],
        [foot_dia, box_depth - foot_dia * 2],
        [box_width - foot_dia * 2, box_depth - foot_dia * 2]
    ];
    for (pos = offsets)
        translate([pos[0], pos[1], -foot_height])
            cylinder(d = foot_dia, h = foot_height);
}


// ---- render -------------------------------------------------

translate([0, 0, add_feet == "yes" ? foot_height : 0]) {
    box_body();
    if (add_feet == "yes")
        feet();
}

if (include_lid == "yes") {
    translate([box_width + 10, 0, 0])
        lid_body();
}
