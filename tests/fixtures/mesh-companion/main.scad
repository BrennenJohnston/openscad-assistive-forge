// Mesh Companion - Test Fixture
// A project whose model reads a binary STL from its own folder.

/*[Placement]*/
lift = 0; // [0:1:20]

translate([0, 0, lift]) import("parts/cube.stl");
