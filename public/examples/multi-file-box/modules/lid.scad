// Lid module for the multi-file box example

include <../utils/helpers.scad>

/**
 * Create a lid for the box
 * @param width - Box width
 * @param depth - Box depth
 * @param wall_thickness - Wall thickness
 */
module box_lid(width, depth, wall_thickness) {
    lid_height = 5;
    lip_height = 3;
    clearance = 0.2;
    
    union() {
        // Lid top
        rounded_cube([width, depth, lid_height], 2);
        
        // Lip that fits inside the box
        translate([wall_thickness + clearance, wall_thickness + clearance, -lip_height])
            rounded_cube([
                width - 2 * (wall_thickness + clearance),
                depth - 2 * (wall_thickness + clearance),
                lip_height
            ], 1);
    }
}
