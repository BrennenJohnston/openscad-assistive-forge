// Simple Box - Test Fixture
// A simple parametric box for testing

/*[Dimensions]*/
width = 50;  // [10:100]
height = 30; // [10:80]
depth = 20;  // [10:60]

/*[Options]*/
wall_thickness = 2; // [1:0.5:5]
include_lid = "yes"; // [yes, no]

/*[Hidden]*/
$fn = 32;

module box() {
    difference() {
        cube([width, depth, height]);
        translate([wall_thickness, wall_thickness, wall_thickness])
            cube([
                width - 2 * wall_thickness,
                depth - 2 * wall_thickness,
                height - wall_thickness
            ]);
    }
}

box();
