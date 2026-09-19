/*[Dimensions]*/
// Box width in mm
width = 50; // [20:100]

// Box height in mm
height = 30; // [10:80]

// Box depth in mm
depth = 40; // [20:100]

/*[Features]*/
// Include a lid
include_lid = "yes"; // [yes, no]

// Wall thickness in mm
wall_thickness = 2; // [1:0.5:5]

/*[Advanced]*/
// Render quality
$fn = 32; // [8:64]

// Include helper functions
include <utils/helpers.scad>

// Include lid module
use <modules/lid.scad>

// Main box body
module box_body() {
    difference() {
        // Outer shell
        rounded_cube([width, depth, height], 2);
        
        // Inner cavity
        translate([wall_thickness, wall_thickness, wall_thickness])
            rounded_cube([
                width - 2 * wall_thickness,
                depth - 2 * wall_thickness,
                height
            ], 1);
    }
}

// Render the box
box_body();

// Optionally render the lid
if (include_lid == "yes") {
    translate([0, depth + 10, 0])
        box_lid(width, depth, wall_thickness);
}
