// Minimal Volkswitch-style keyguard for testing
// Version: 74 (minimal test fixture)
include <openings_and_additions.txt>

/*[Keyguard Basics]*/
type_of_keyguard = "3D-Printed"; // [3D-Printed,Laser-Cut]
generate = "keyguard"; //[keyguard,first layer for SVG/DXF file]

/*[Dimensions]*/
width = 100; // [50:200]
height = 150; // [75:300]
thickness = 4; // [2:10]

/*[Debug]*/
// This echo tests console output exposure
echo("Keyguard type:", type_of_keyguard);
echo("Generate mode:", generate);

if (generate == "keyguard") {
    // 3D keyguard with openings
    difference() {
        cube([width, height, thickness]);
        // Apply screen_openings from included file
        for (opening = screen_openings) {
            if (len(opening) >= 5 && opening[3] > 0 && opening[4] > 0) {
                translate([opening[1], opening[2], -1])
                    cube([opening[3], opening[4], thickness + 2]);
            }
        }
    }
} else if (generate == "first layer for SVG/DXF file") {
    // 2D projection for laser cutting
    echo("Generating 2D projection for laser cutting...");
    projection(cut = true) 
        translate([0, 0, 0.1])
        difference() {
            cube([width, height, thickness]);
            for (opening = screen_openings) {
                if (len(opening) >= 5 && opening[3] > 0 && opening[4] > 0) {
                    translate([opening[1], opening[2], -1])
                        cube([opening[3], opening[4], thickness + 2]);
                }
            }
        }
} else {
    echo("ECHO: Generate mode is not supported for this test fixture");
}
