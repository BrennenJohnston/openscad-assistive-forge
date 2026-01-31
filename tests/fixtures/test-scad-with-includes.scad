// Test Fixture: SCAD file with various include/use patterns
// Used to test detectRequiredCompanionFiles function
// Version: 1.0

/* [Settings] */
width = 100; // [10:200]
height = 50; // [10:100]

// Include statements (required files)
include <common/utils.scad>
include <helpers/geometry.scad>

// Use statements (required files)
use <libs/math.scad>
use <parts/base.scad>

// Import statements (STL/other files)
// import(file="model.stl");

// File variable patterns (optional files)
screenshot_file = "default.svg";
config_filename = "settings.json";
data_path = "data.csv";

// Surface file pattern
// surface(file="heightmap.png");

module main() {
    cube([width, height, 10]);
}

main();
