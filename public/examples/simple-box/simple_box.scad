// Simple Parametric Box
// A basic customizable box for testing and learning
// License: CC0 (Public Domain)

/* [Dimensions] */
// Width of the box (X axis)
width = 50; // [10:100]

// Depth of the box (Y axis)
depth = 40; // [10:100]

// Height of the box (Z axis)
height = 30; // [10:100]

// Wall thickness
wall_thickness = 2; // [1:0.5:5]

/* [Features] */
// Add a lid
include_lid = "yes"; // [yes, no]

// Add ventilation holes
ventilation = "no"; // [yes, no]

// Number of holes per side @depends(ventilation==yes)
hole_count = 3; // [1:10]

// Hole diameter in mm @depends(ventilation==yes)
hole_diameter = 5; // [3:1:10]

/* [Advanced] */
// Corner radius (0 for sharp corners)
corner_radius = 2; // [0:0.5:10]

// Render quality (higher = smoother, slower)
$fn = 32; // [16:4:128]

/* [Hidden] */
// Internal variables
inner_width = width - (wall_thickness * 2);
inner_depth = depth - (wall_thickness * 2);
inner_height = height - wall_thickness;
lid_height = wall_thickness;

// Main module
module box() {
    difference() {
        // Outer box
        if (corner_radius > 0) {
            rounded_box(width, depth, height, corner_radius);
        } else {
            cube([width, depth, height]);
        }
        
        // Hollow interior
        translate([wall_thickness, wall_thickness, wall_thickness])
            cube([inner_width, inner_depth, inner_height + 0.1]);
        
        // Ventilation holes
        if (ventilation == "yes") {
            add_ventilation_holes();
        }
    }
}

module lid() {
    if (corner_radius > 0) {
        rounded_box(width, depth, lid_height + 2, corner_radius);
    } else {
        cube([width, depth, lid_height + 2]);
    }
}

module rounded_box(w, d, h, r) {
    hull() {
        translate([r, r, 0])
            cylinder(r=r, h=h);
        translate([w-r, r, 0])
            cylinder(r=r, h=h);
        translate([r, d-r, 0])
            cylinder(r=r, h=h);
        translate([w-r, d-r, 0])
            cylinder(r=r, h=h);
    }
}

module add_ventilation_holes() {
    spacing = width / (hole_count + 1);
    
    for (i = [1:hole_count]) {
        // Front side
        translate([spacing * i, -0.1, height/2])
            rotate([-90, 0, 0])
            cylinder(d=hole_diameter, h=wall_thickness + 0.2);
        
        // Back side
        translate([spacing * i, depth - wall_thickness - 0.1, height/2])
            rotate([-90, 0, 0])
            cylinder(d=hole_diameter, h=wall_thickness + 0.2);
    }
}

// Render
if (include_lid == "yes") {
    box();
    translate([0, depth + 10, 0])
        lid();
} else {
    box();
}
