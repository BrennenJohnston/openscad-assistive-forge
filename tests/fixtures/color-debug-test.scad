// Color and Debug Modifier Parity Test Fixture
// Exercises OpenSCAD color() and # debug-modifier behavior.
// Desktop semantics (from color.cc and the renderer):
//   - color("red") cube()  → renders red in 3D preview
//   - # cube()             → fixed highlight {255,81,81,128}, OVERRIDES color()
//   - SVG export           → fixed stroke="black" fill="lightgray" (no model colors)

/* [Model] */
box_size = 20; // [5:50]

/* [Colors] */
// Generic color param name (NOT "box_color")
model_color = "red"; // [red, green, blue, yellow, white]
accent_color = "#00ff00";

// Normal colored geometry — should render with user-specified color in 3D preview
color(model_color)
    cube([box_size, box_size, box_size]);

// Accent-colored geometry
color(accent_color)
    translate([box_size + 5, 0, 0])
        sphere(r = box_size / 2);

// Debug-modifier geometry — desktop uses FIXED highlight {255,81,81,128}
// and OVERRIDES any user-defined color().
// Uncomment to test:  # color("blue") translate([0, box_size + 5, 0]) cylinder(h=box_size, r=box_size/3);
