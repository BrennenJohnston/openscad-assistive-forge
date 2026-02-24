// Colored Box Example
// Demonstrates color parameter support in OpenSCAD Assistive Forge

/* [Dimensions] */
width = 50; // [10:100] Box width (mm)
height = 30; // [10:100] Box height (mm)
depth = 20; // [10:100] Box depth (mm)
wall_thickness = 2; // [1:0.5:5] Wall thickness (mm)

/* [Appearance] */
box_color = "FF6B35"; // [color] Primary box color
accent_color = "004E89"; // [color] Accent color for details
use_colors = "yes"; // [yes, no] Use colors in preview

/* [Details] */
add_lid = "yes"; // [yes, no] Add a lid
add_feet = "yes"; // [yes, no] Add feet to bottom

module colored_box() {
    difference() {
        // Outer box
        if (use_colors == "yes") {
            color(str("#", box_color))
            cube([width, depth, height]);
        } else {
            cube([width, depth, height]);
        }
        
        // Hollow interior
        translate([wall_thickness, wall_thickness, wall_thickness])
        cube([
            width - 2 * wall_thickness, 
            depth - 2 * wall_thickness, 
            height
        ]);
    }
    
    // Add feet if enabled
    if (add_feet == "yes") {
        foot_size = wall_thickness * 2;
        foot_height = 5;
        
        if (use_colors == "yes") {
            color(str("#", accent_color))
            for (x = [foot_size, width - foot_size * 2]) {
                for (y = [foot_size, depth - foot_size * 2]) {
                    translate([x, y, -foot_height])
                    cube([foot_size, foot_size, foot_height]);
                }
            }
        } else {
            for (x = [foot_size, width - foot_size * 2]) {
                for (y = [foot_size, depth - foot_size * 2]) {
                    translate([x, y, -foot_height])
                    cube([foot_size, foot_size, foot_height]);
                }
            }
        }
    }
    
    // Add lid if enabled
    if (add_lid == "yes") {
        lid_overlap = wall_thickness / 2;
        
        if (use_colors == "yes") {
            color(str("#", accent_color))
            translate([0, 0, height])
            difference() {
                cube([width, depth, wall_thickness]);
                translate([lid_overlap, lid_overlap, -1])
                cube([
                    width - 2 * lid_overlap, 
                    depth - 2 * lid_overlap, 
                    wall_thickness + 2
                ]);
            }
        } else {
            translate([0, 0, height])
            difference() {
                cube([width, depth, wall_thickness]);
                translate([lid_overlap, lid_overlap, -1])
                cube([
                    width - 2 * lid_overlap, 
                    depth - 2 * lid_overlap, 
                    wall_thickness + 2
                ]);
            }
        }
    }
}

// Render the box
colored_box();

// Instructions:
// 1. Click the color boxes to select your preferred colors
// 2. Or enter hex codes directly (RRGGBB format)
// 3. Adjust dimensions using the sliders
// 4. Toggle features with yes/no switches
// 5. Click "Generate" to create your customized box
