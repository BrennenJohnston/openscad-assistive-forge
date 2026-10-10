// Deep Recursion - Test Fixture
// A module that calls itself `steps` times. The browser engine runs out of
// stack long before desktop OpenSCAD does, so the default fails in every
// browser and a small value works everywhere.

/*[Recursion]*/
steps = 400; // [1:1:1000]

module step(n) {
    if (n > 0)
        translate([1, 0, 0]) rotate([0, 0, 7]) step(n - 1);
    else
        cube(1);
}

step(steps);
