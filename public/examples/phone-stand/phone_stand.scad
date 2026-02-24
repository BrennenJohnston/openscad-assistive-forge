// Parametric Phone Stand
// A customizable stand for phones and tablets
// License: CC0 (Public Domain)

/* [Dimensions] */
// Width of the stand (should fit your phone)
width = 80; // [50:200]

// Depth of the base
base_depth = 60; // [30:100]

// Height of the back support
back_height = 120; // [60:200]

// Phone/tablet thickness (add 1-2mm margin)
device_thickness = 12; // [5:25]

/* [Angle] */
// Viewing angle (degrees from vertical)
tilt_angle = 15; // [0:45]

/* [Style] */
// Stand style
style = "solid"; // [solid, openwork, minimal]

// Edge rounding
corner_radius = 3; // [0:10]

/* [Charging] */
// Add cable hole for charging
cable_hole = "yes"; // [yes, no]

// Cable hole diameter
cable_diameter = 15; // [8:25]

/* [Quality] */
// Render quality
$fn = 32; // [16:64]

/* [Hidden] */
back_angle = 90 - tilt_angle;
base_thickness = 5;
wall_thickness = 4;
lip_height = 15;

module phone_stand() {
    union() {
        // Base plate
        base_plate();
        
        // Back support
        back_support();
        
        // Front lip to hold phone
        front_lip();
    }
}

module base_plate() {
    if (style == "openwork") {
        difference() {
            rounded_cube(width, base_depth, base_thickness, corner_radius);
            // Cut out center
            translate([wall_thickness*2, wall_thickness*2, -0.1])
                rounded_cube(width - wall_thickness*4, base_depth - wall_thickness*4, base_thickness + 0.2, corner_radius);
        }
    } else if (style == "minimal") {
        // Just front and back rails
        rounded_cube(width, wall_thickness*2, base_thickness, corner_radius);
        translate([0, base_depth - wall_thickness*2, 0])
            rounded_cube(width, wall_thickness*2, base_thickness, corner_radius);
    } else {
        rounded_cube(width, base_depth, base_thickness, corner_radius);
    }
    
}

module back_support() {
    translate([0, base_depth - wall_thickness, base_thickness]) {
        rotate([back_angle, 0, 0]) {
            difference() {
                union() {
                    // Main back
                    if (style == "openwork") {
                        // Frame only
                        cube([wall_thickness, wall_thickness, back_height]);
                        translate([width - wall_thickness, 0, 0])
                            cube([wall_thickness, wall_thickness, back_height]);
                        translate([0, 0, back_height - wall_thickness])
                            cube([width, wall_thickness, wall_thickness]);
                    } else if (style == "minimal") {
                        // Two posts
                        cube([wall_thickness*2, wall_thickness, back_height]);
                        translate([width - wall_thickness*2, 0, 0])
                            cube([wall_thickness*2, wall_thickness, back_height]);
                    } else {
                        cube([width, wall_thickness, back_height]);
                    }
                }
                
                // Cable hole
                if (cable_hole == "yes" && style == "solid") {
                    translate([width/2, -0.1, back_height * 0.3])
                        rotate([-90, 0, 0])
                        cylinder(d=cable_diameter, h=wall_thickness + 0.2);
                }
            }
        }
    }
}

module front_lip() {
    translate([0, 0, base_thickness]) {
        difference() {
            // Outer lip
            cube([width, device_thickness + wall_thickness, lip_height]);
            
            // Inner cutout for device
            translate([wall_thickness, wall_thickness, wall_thickness])
                cube([width - wall_thickness*2, device_thickness, lip_height]);
        }
    }
}

module rounded_cube(w, d, h, r) {
    if (r <= 0) {
        cube([w, d, h]);
    } else {
        hull() {
            translate([r, r, 0]) cylinder(r=r, h=h);
            translate([w-r, r, 0]) cylinder(r=r, h=h);
            translate([r, d-r, 0]) cylinder(r=r, h=h);
            translate([w-r, d-r, 0]) cylinder(r=r, h=h);
        }
    }
}

// Render
phone_stand();
