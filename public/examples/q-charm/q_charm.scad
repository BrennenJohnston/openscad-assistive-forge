// Q Charm — DXF Profile Extrusion
// C-shaped charm extruded from a 2D DXF side profile.
// Dimensions: ~22 mm long × 20 mm wide × 8.5 mm tall
// Orientation: profile vertical (XZ plane), large surface area facing up.
// License: CC0 (Public Domain)

/* [Dimensions] */
// Extrusion width (Y axis depth)
extrude_width = 20; // [10:1:40]

/* [Rounding] */
// Edge rounding radius (0 = sharp edges)
edge_radius = 1.0; // [0:0.25:3]

// Round only the long extrusion edges (faster) or all edges
sidesonly = true; // [true, false]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
dxf_file = "q_Charm_L.dxf";
z_offset = 3;

module q_charm() {
    translate([0, 0, z_offset])
        rotate([90, 0, 0]) {
            if (edge_radius > 0 && sidesonly) {
                // Cylinder kernel: rounds the long edges running along the
                // extrusion axis while keeping the profile outline crisp.
                minkowski() {
                    linear_extrude(height = extrude_width, center = true)
                        offset(r = -edge_radius)
                            import(dxf_file);
                    cylinder(r = edge_radius, h = 0.01, center = true);
                }
            } else if (edge_radius > 0) {
                // Sphere kernel: rounds every edge uniformly.
                minkowski() {
                    linear_extrude(
                        height = extrude_width - 2 * edge_radius,
                        center = true
                    )
                        offset(r = -edge_radius)
                            import(dxf_file);
                    sphere(r = edge_radius);
                }
            } else {
                linear_extrude(height = extrude_width, center = true)
                    import(dxf_file);
            }
        }
}

q_charm();
