// Advanced Parameters - Test Fixture
// Tests various parameter types and annotations

/*[Basic Dimensions]*/
width = 50;       // [10:100] Width in mm
height = 30;      // [10:80] Height in mm
angle = 45;       // [0:90] Rotation angle (degrees)

/*[Options]*/
shape = "round";  // [round, square, hexagon]
color_choice = "blue"; // [red, green, blue, yellow]
enable_feature = "yes"; // [yes, no]

/*[Advanced]*/
resolution = 3;   // [1:5] Detail level
tolerance = 0.2;  // [0.1:0.1:1.0] Fitting tolerance (mm)

/*[Hidden]*/
$fn = resolution * 16;
internal_var = 42;

cube([width, height, 10]);
