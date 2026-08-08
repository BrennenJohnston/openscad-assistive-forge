// Exercises OpenSCAD's text(), which only works when the Liberation fonts have
// been mounted into the WASM filesystem (F2). Both mounted families are used,
// so a mount failure for either one shows up as a warning in the console.
label = "Forge";

linear_extrude(height = 2)
  text(label, size = 10, font = "Liberation Sans");

translate([0, -20, 0])
  linear_extrude(height = 2)
    text(label, size = 10, font = "Liberation Mono");

translate([0, -40, 0])
  linear_extrude(height = 2)
    text(label, size = 10, font = "Liberation Sans:style=Bold");
