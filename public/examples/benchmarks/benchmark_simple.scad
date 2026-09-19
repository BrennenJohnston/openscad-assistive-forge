// Benchmark: Simple Primitives
// Purpose: Baseline measurement for simple shapes
// Expected: Very fast with any backend

/* [Parameters] */
size = 20; // [10:50]
$fn = 48; // [16:128]

/* [Hidden] */
// Render a sphere + cube combo (tests basic CSG)
difference() {
    sphere(r = size);
    translate([0, 0, size/2])
        cube([size*0.8, size*0.8, size], center=true);
}
