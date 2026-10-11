// Typed Preset - Test Fixture
// A plate with one raised block per letter of its label. Its presets set the
// plate's size and leave the label alone.

/*[Sign]*/
label = "HI"; //
width = 40; // [20:1:120]
height = 20; // [10:1:60]
depth = 3; // [1:1:10]

cube([width, height, depth]);
// Each block sinks 0.01 mm into the plate so the two share no face.
for (i = [0:len(label) - 1])
    translate([2 + i * 5, 2, depth - 0.01]) cube([4, 4, 1.01]);
