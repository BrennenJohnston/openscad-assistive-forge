/**
 * Library Test Example
 * Demonstrates using OpenSCAD library bundles (MCAD)
 * @license CC0-1.0 (Public Domain)
 */

// This example uses MCAD library for rounded boxes
use <MCAD/boxes.scad>;

/*[Dimensions]*/
// Box width (mm)
width = 45; // [20:100]

// Box depth (mm)
depth = 35; // [20:100]

// Box height (mm)
height = 28; // [10:50]

// Corner radius (mm)
radius = 4; // [1:15]

/*[Options]*/
// Box style
style = "Simple"; // [Simple, Rounded]

/*[Hidden]*/
// Fragment number for curves
$fn = 64;

/*[Style Options]*/
// Round only the sides (faster) or all edges including top/bottom
sidesonly = true; // [true, false]

// Main module
module main() {
    if (style == "Rounded") {
        // Use MCAD's rounded box function
        // roundedBox(size, radius, sidesonly)
        // - size: [x, y, z] dimensions
        // - radius: corner radius
        // - sidesonly: true = round only vertical edges, false = round all edges
        roundedBox([width, depth, height], radius, sidesonly);
    } else {
        // Simple cube for comparison
        cube([width, depth, height], center=true);
    }
}

// Render
main();
