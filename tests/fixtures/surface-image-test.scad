// S-013 runtime test fixture: Tests surface() with image and text heightmaps.
//
// Usage: Load this file in the browser with companion files:
//   - test-heightmap.dat  (text heightmap)
//   - test-image.png      (image heightmap — requires libpng in WASM)
//
// Expected console output:
//   - If surface() with .dat works: renders a 3D surface from text data
//   - If surface() with .png works: renders a second surface from image data
//   - If .png fails: "WARNING: Can't open..." or silent empty geometry
//
// This fixture is for manual runtime testing, not unit tests.

show_mode = "dat"; // [dat, png, both]

echo("S-013 surface test: mode =", show_mode);

if (show_mode == "dat" || show_mode == "both") {
  translate([0, 0, 0])
    color("blue")
      surface(file = "test-heightmap.dat", center = true, convexity = 5);
}

if (show_mode == "png" || show_mode == "both") {
  translate([20, 0, 0])
    color("red")
      surface(file = "test-image.png", center = true, convexity = 5);
}
