// Volkswitch Keyguard Demo
// A simplified example demonstrating multi-file project support
// For full keyguard functionality, visit: https://volksswitch.org
// Version: demo

/* [Keyguard Settings] */
// Width of the keyguard in millimeters
width = 150; // [50:1:300]

// Height of the keyguard in millimeters  
height = 100; // [30:1:200]

// Thickness of the keyguard material
thickness = 3; // [1:0.5:10]

// Corner radius for rounded edges
corner_radius = 5; // [0:1:20]

/* [Grid Layout] */
// Number of button columns
columns = 4; // [1:1:10]

// Number of button rows
rows = 3; // [1:1:8]

// Space between buttons (gap)
button_gap = 5; // [2:1:20]

// Button opening size (square)
button_size = 20; // [10:1:50]

/* [Mounting Options] */
// Add mounting holes in corners
add_mounting_holes = true; // [true, false]

// Mounting hole diameter
mounting_hole_diameter = 4; // [2:0.5:10]

// Distance from edge to mounting hole center
mounting_hole_inset = 8; // [5:1:20]

/* [Advanced] */
// Type of keyguard
type_of_keyguard = "3D-Printed"; // ["3D-Printed", "Laser-Cut"]

// File for custom openings (optional)
openings_file = "openings_and_additions.txt";

/* [Hidden] */
$fn = 32;

// Main module
module keyguard() {
    difference() {
        // Base plate with rounded corners
        minkowski() {
            cube([width - corner_radius*2, height - corner_radius*2, thickness/2]);
            cylinder(r=corner_radius, h=thickness/2);
        }
        
        // Button grid openings
        grid_width = columns * (button_size + button_gap) - button_gap;
        grid_height = rows * (button_size + button_gap) - button_gap;
        grid_x = (width - grid_width) / 2;
        grid_y = (height - grid_height) / 2;
        
        for (col = [0:columns-1]) {
            for (row = [0:rows-1]) {
                x = grid_x + col * (button_size + button_gap);
                y = grid_y + row * (button_size + button_gap);
                translate([x - corner_radius, y - corner_radius, -1])
                    cube([button_size, button_size, thickness + 2]);
            }
        }
        
        // Mounting holes (if enabled)
        if (add_mounting_holes) {
            hole_positions = [
                [mounting_hole_inset - corner_radius, mounting_hole_inset - corner_radius],
                [width - mounting_hole_inset - corner_radius, mounting_hole_inset - corner_radius],
                [mounting_hole_inset - corner_radius, height - mounting_hole_inset - corner_radius],
                [width - mounting_hole_inset - corner_radius, height - mounting_hole_inset - corner_radius]
            ];
            
            for (pos = hole_positions) {
                translate([pos[0], pos[1], -1])
                    cylinder(d=mounting_hole_diameter, h=thickness + 2);
            }
        }
    }
}

// Render the keyguard
keyguard();

// Info text (for preview)
echo(str("Keyguard: ", width, "mm x ", height, "mm x ", thickness, "mm"));
echo(str("Grid: ", columns, " columns x ", rows, " rows"));
echo(str("Type: ", type_of_keyguard));
