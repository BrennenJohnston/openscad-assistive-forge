// Benchmark: Hull Operations
// Purpose: Tests hull() which creates convex hulls
// Expected: Moderate improvement with Manifold

/* [Parameters] */
sphere_count = 4; // [3:8]
spread = 20; // [10:40]
sphere_size = 5; // [3:10]
$fn = 32; // [16:64]

/* [Hidden] */
hull() {
    for (i = [0:sphere_count-1]) {
        angle = i * 360 / sphere_count;
        translate([
            cos(angle) * spread,
            sin(angle) * spread,
            sin(angle * 2) * spread/2
        ])
        sphere(r=sphere_size);
    }
}
