// Slow Render - Test Fixture
// A minkowski sum the browser engine works on for several seconds: long
// enough for a test to move the page's clock past the render time limit
// while the engine is still busy.

/*[Shape]*/
detail = 96; // [8:8:96]

minkowski() {
    cylinder(r = 10, h = 10, $fn = detail);
    sphere(r = 2, $fn = detail);
}
