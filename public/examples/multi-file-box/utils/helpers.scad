// Helper functions for the multi-file box example

/**
 * Create a cube with rounded edges
 * @param size - [width, depth, height] or single value
 * @param radius - Corner radius
 */
module rounded_cube(size, radius) {
    w = is_list(size) ? size[0] : size;
    d = is_list(size) ? size[1] : size;
    h = is_list(size) ? size[2] : size;
    
    hull() {
        translate([radius, radius, 0])
            cylinder(r=radius, h=h);
        translate([w-radius, radius, 0])
            cylinder(r=radius, h=h);
        translate([radius, d-radius, 0])
            cylinder(r=radius, h=h);
        translate([w-radius, d-radius, 0])
            cylinder(r=radius, h=h);
    }
}

/**
 * Create a chamfered edge
 * @param length - Length of the edge
 * @param size - Size of the chamfer
 */
module chamfer(length, size) {
    rotate([0, 90, 0])
        linear_extrude(height=length)
            polygon([[0, 0], [size, 0], [0, size]]);
}
