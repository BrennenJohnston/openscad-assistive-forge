// Honeycomb Grid Pattern
// Creates hexagonal grid patterns for organizers, decorations, or infill
// License: CC0 (Public Domain)

/* [Grid Size] */
// Number of hexagons in X direction
cells_x = 5; // [2:20]

// Number of hexagons in Y direction
cells_y = 4; // [2:20]

// Size of each hexagon (flat-to-flat distance)
cell_size = 20; // [5:50]

/* [Dimensions] */
// Wall thickness between cells
wall_thickness = 2; // [1:0.5:5]

// Grid height (depth)
grid_height = 15; // [3:50]

// Add a bottom plate
include_bottom = "no"; // [yes, no]

// Bottom plate thickness
bottom_thickness = 1.5; // [0.5:0.5:5]

/* [Style] */
// Cell shape
cell_shape = "hexagon"; // [hexagon, circle, rounded_hex]

// Rounding for rounded_hex
hex_rounding = 2; // [0:5]

/* [Quality] */
// Render quality
$fn = 32; // [16:64]

/* [Hidden] */
// Hexagon math
hex_radius = cell_size / 2;
hex_apothem = hex_radius * cos(30);  // Distance from center to flat edge
col_spacing = cell_size + wall_thickness;
row_spacing = (hex_apothem * 2) + wall_thickness;

// Calculate overall dimensions
total_width = (cells_x * col_spacing) + (cell_size / 2);
total_depth = (cells_y * row_spacing) + hex_apothem;

module honeycomb_grid() {
    difference() {
        // Outer frame
        linear_extrude(height = grid_height)
            offset(r = wall_thickness/2)
            square([total_width, total_depth]);
        
        // Hexagonal cells
        translate([0, 0, include_bottom == "yes" ? bottom_thickness : -0.1])
            for (y = [0:cells_y-1]) {
                for (x = [0:cells_x-1]) {
                    translate([
                        hex_radius + wall_thickness/2 + (x * col_spacing) + ((y % 2) * (col_spacing / 2)),
                        hex_apothem + wall_thickness/2 + (y * row_spacing),
                        0
                    ])
                    create_cell(grid_height + 1);
                }
            }
    }
}

module create_cell(h) {
    if (cell_shape == "hexagon") {
        linear_extrude(height = h)
            hexagon(hex_radius - wall_thickness/2);
    } else if (cell_shape == "circle") {
        cylinder(r = hex_radius - wall_thickness/2, h = h);
    } else if (cell_shape == "rounded_hex") {
        linear_extrude(height = h)
            offset(r = hex_rounding)
            offset(r = -hex_rounding)
            hexagon(hex_radius - wall_thickness/2);
    }
}

module hexagon(radius) {
    polygon([
        for (i = [0:5])
            [radius * cos(60*i + 30), radius * sin(60*i + 30)]
    ]);
}

// Render
honeycomb_grid();
