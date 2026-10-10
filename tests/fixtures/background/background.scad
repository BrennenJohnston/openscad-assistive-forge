// Background Shapes - Test Fixture
// A body with a colored `%` plug and an uncolored `%` sphere inside a
// difference, and two `%` cubes beside it. tree.csg is the engine's CSG
// export of this file (OpenSCAD 2026.01.03).

module plug() color("SkyBlue", 0.35) cylinder(r = 3, h = 20, $fn = 24);
difference() {
    cube(20, center = true);
    translate([0, 0, -10]) %plug();
    %translate([0, 0, 8]) sphere(4, $fn = 16);
}
for (i = [0:1]) translate([30 + i * 10, 0, 0]) %cube(4);
