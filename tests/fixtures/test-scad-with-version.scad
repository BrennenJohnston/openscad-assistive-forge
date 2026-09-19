// Test Fixture: SCAD file with version comment
// Version: v74
// Author: Test Suite

/* [Dimensions] */
width = 100; // [50:200]
height = 50; // [25:100]
thickness = 3; // [1:10]

/* [Hidden] */
$fn = 32;

module versioned_part() {
    cube([width, height, thickness]);
}

versioned_part();
