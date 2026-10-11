// Many Projects - Test Fixture: a project in a subfolder whose model
// includes a file with two dots in its name.
include <shade..scad>

/*[Lamp]*/
height = 20; // [10:1:40]

cylinder(r = 2, h = height, $fn = 16);
// Overlap the stem by 0.01 mm so the two solids share no face.
translate([0, 0, height - 0.01]) shade();
