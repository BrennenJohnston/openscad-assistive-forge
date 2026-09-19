// Benchmark: Minkowski Operations
// Purpose: Tests expensive minkowski() operation
// Expected: Huge improvement with Manifold (parallelism)
// WARNING: This can be VERY slow without Manifold!

/* [Parameters] */
base_size = 15; // [10:30]
rounding = 2; // [1:5] Edge rounding amount
$fn = 24; // [12:48] Keep low for faster renders

/* [Hidden] */
// Rounded cube using minkowski
minkowski() {
    cube([base_size, base_size, base_size], center=true);
    sphere(r=rounding);
}
