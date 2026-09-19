// A tile with four faults in it, on purpose.
//
// This file is a test fixture, not a design. It exists so scripts/
// validate-example.mjs can be watched FAILING on every check before anyone
// trusts it to pass on a real tile. Nothing loads it and nothing renders it.
//
// The faults, in the order the validator finds them:
//   1. manifest.json has no "license".
//   2. plate_shape has no comment above it, so the app has nothing to label
//      the control with.
//   3. logo_file defaults to undeclared-logo.svg, which IS in this folder and
//      is NOT listed in manifest.json - the exact shape of D-97, where the
//      file was right there and the app still could not find it.
//   4. dot_height is declared tactile in the manifest, has no documented
//      range, and nothing asserts it.
//
// License: CC0-1.0

/* [Plate] */

plate_shape = "square"; // [square, round]

// Image to engrave
logo_file = "undeclared-logo.svg"; // [file:svg,png,jpg]

// Height of the raised dots
dot_height = 0.6;

/* [Hidden] */

module plate() {
    if (plate_shape == "round") cylinder(d = 40, h = 3);
    else cube([40, 40, 3]);
}

plate();
