// Cable Organizer
// Keeps your desk cables tidy with customizable slots
// License: CC0 (Public Domain)

/* [Base] */
// Length of the organizer
length = 100; // [50:200]

// Width of the organizer
width = 30; // [20:60]

// Height (thickness of base)
base_height = 10; // [5:20]

/* [Slots] */
// Number of cable slots
num_slots = 5; // [1:10]

// Slot style
slot_style = "round"; // [round, square, teardrop]

// Slot diameter (for round slots)
slot_diameter = 8; // [3:15]

// Slot width (for square slots)
slot_width = 8; // [3:15]

/* [Mounting] */
// Mounting type
mount_type = "desk"; // [desk, adhesive, screw_holes]

// Add screw holes
add_screw_holes = "no"; // [yes, no]

// Screw hole diameter
screw_diameter = 4; // [3:6]

/* [Features] */
// Add cable labels
add_labels = "no"; // [yes, no]

// Label depth (engraving)
label_depth = 0.5; // [0.3:0.1:1.0]

// Add grip texture
add_texture = "no"; // [yes, no]

/* [Quality] */
$fn = 48; // [24:64]

/* [Hidden] */
slot_spacing = length / (num_slots + 1);
slot_height = base_height * 1.5;  // Slots extend above base

module cable_organizer() {
    difference() {
        union() {
            // Base
            base();
            
            // Slot walls
            slot_holders();
        }
        
        // Cut slots
        cable_slots();
        
        // Screw holes
        if (add_screw_holes == "yes" || mount_type == "screw_holes") {
            screw_holes();
        }
    }
    
    // Add texture on top if requested
    if (add_texture == "yes") {
        texture_pattern();
    }
}

module base() {
    hull() {
        translate([base_height/2, base_height/2, 0])
            cylinder(r=base_height/2, h=base_height);
        translate([length - base_height/2, base_height/2, 0])
            cylinder(r=base_height/2, h=base_height);
        translate([base_height/2, width - base_height/2, 0])
            cylinder(r=base_height/2, h=base_height);
        translate([length - base_height/2, width - base_height/2, 0])
            cylinder(r=base_height/2, h=base_height);
    }
}

module slot_holders() {
    for (i = [1:num_slots]) {
        translate([slot_spacing * i - slot_diameter/2 - 3, 0, base_height - 0.1]) {
            cube([slot_diameter + 6, width, slot_height - base_height + 0.1]);
        }
    }
}

module cable_slots() {
    for (i = [1:num_slots]) {
        pos_x = slot_spacing * i;
        
        if (slot_style == "round") {
            // Round slot with entry from top
            translate([pos_x, width/2, base_height])
                cylinder(d=slot_diameter, h=slot_height);
            // Entry slot
            translate([pos_x, width/2, base_height + slot_height/2])
                cube([slot_diameter, width, slot_height], center=true);
        } else if (slot_style == "square") {
            // Square slot
            translate([pos_x - slot_width/2, 0, base_height])
                cube([slot_width, width, slot_height]);
        } else if (slot_style == "teardrop") {
            // Teardrop shape (easier to print)
            translate([pos_x, width/2, base_height]) {
                cylinder(d=slot_diameter, h=slot_height);
                translate([0, 0, slot_height/2])
                    rotate([0, 0, 45])
                    cube([slot_diameter/sqrt(2), slot_diameter/sqrt(2), slot_height], center=true);
            }
            // Entry slot
            translate([pos_x, width/2, base_height + slot_height/2])
                cube([slot_diameter, width, slot_height], center=true);
        }
    }
}

module screw_holes() {
    // Corner holes
    translate([base_height, base_height, -0.1])
        cylinder(d=screw_diameter, h=base_height + 0.2);
    translate([length - base_height, base_height, -0.1])
        cylinder(d=screw_diameter, h=base_height + 0.2);
    translate([base_height, width - base_height, -0.1])
        cylinder(d=screw_diameter, h=base_height + 0.2);
    translate([length - base_height, width - base_height, -0.1])
        cylinder(d=screw_diameter, h=base_height + 0.2);
}

module texture_pattern() {
    // Add small bumps for grip
    spacing = 5;
    for (x = [spacing:spacing*2:length-spacing]) {
        for (y = [spacing:spacing*2:width-spacing]) {
            translate([x, y, base_height - 0.1])
                cylinder(d=2, h=0.5);
        }
    }
}

// Render
cable_organizer();
