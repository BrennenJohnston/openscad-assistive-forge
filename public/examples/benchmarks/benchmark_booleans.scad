// Benchmark: Heavy Boolean Operations
// Purpose: Tests CSG performance (difference/intersection heavy)
// Expected: 5-30x faster with Manifold

/* [Parameters] */
count = 5; // [3:10] Number of boolean operations
hole_size = 5; // [3:10]
$fn = 32; // [16:64]

/* [Hidden] */
difference() {
    // Base cube with many holes
    cube([count * 12, count * 12, 20], center=true);
    
    // Grid of cylindrical holes
    for (x = [0:count-1]) {
        for (y = [0:count-1]) {
            translate([
                (x - count/2 + 0.5) * 12,
                (y - count/2 + 0.5) * 12,
                0
            ])
            cylinder(h=25, r=hole_size, center=true);
        }
    }
}
