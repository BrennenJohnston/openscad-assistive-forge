// Parametric Cylinder
// Demonstrates different cylinder configurations
// License: CC0 (Public Domain)

/* [Shape] */
// Shape type
shape = "cylinder"; // [cylinder, cone, tube, tapered tube]

// Bottom diameter
bottom_diameter = 30; // [5:100]

// Top diameter (for cones and tapered tubes)
top_diameter = 20; // [5:100]

// Height
height = 50; // [5:200]

/* [Tube Settings] */
// Wall thickness (for tubes)
wall_thickness = 3; // [1:0.5:10]

/* [Features] */
// Add base plate
add_base = "yes"; // [yes, no]

// Base plate thickness
base_thickness = 2; // [1:0.5:5]

// Base plate diameter
base_diameter = 40; // [10:150]

// Add top cap
add_cap = "no"; // [yes, no]

/* [Quality] */
// Number of facets (higher = smoother)
$fn = 64; // [16:8:128]

/* [Hidden] */
inner_bottom_diameter = bottom_diameter - (wall_thickness * 2);
inner_top_diameter = top_diameter - (wall_thickness * 2);

// Main module
module main_shape() {
    if (shape == "cylinder") {
        cylinder(d=bottom_diameter, h=height);
    } else if (shape == "cone") {
        cylinder(d1=bottom_diameter, d2=top_diameter, h=height);
    } else if (shape == "tube") {
        difference() {
            cylinder(d=bottom_diameter, h=height);
            translate([0, 0, -0.1])
                cylinder(d=inner_bottom_diameter, h=height + 0.2);
        }
    } else if (shape == "tapered tube") {
        difference() {
            cylinder(d1=bottom_diameter, d2=top_diameter, h=height);
            translate([0, 0, -0.1])
                cylinder(d1=inner_bottom_diameter, d2=inner_top_diameter, h=height + 0.2);
        }
    }
}

module base_plate() {
    cylinder(d=base_diameter, h=base_thickness);
}

module top_cap() {
    translate([0, 0, height]) {
        if (shape == "cylinder" || shape == "tube") {
            cylinder(d=bottom_diameter, h=base_thickness);
        } else {
            cylinder(d=top_diameter, h=base_thickness);
        }
    }
}

// Render
if (add_base == "yes") {
    base_plate();
}

translate([0, 0, add_base == "yes" ? base_thickness : 0]) {
    main_shape();
    
    if (add_cap == "yes") {
        top_cap();
    }
}
