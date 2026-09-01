// ===========================================================================
// Template Tile - the starting point for a new tile
// ===========================================================================
//
// What it makes: a label plate with a raised border a finger can find, an
// optional picture on the face, and an optional hanging hole.
//
// What it is FOR: copying. Take this whole folder, rename it, and change
// everything in it. The long comments below explain what each part of the
// file is doing and why the app cares. Read them once, then replace them with
// comments about your own design.
//
// The folder is named `_template` with a leading underscore, which is how the
// app knows it is not a tile anyone should be offered on the welcome screen.
// Your copy should NOT start with an underscore.
//
// Full walkthrough: docs/guides/TILE_AUTHOR_GUIDE.md
//
// License: CC0-1.0 - this template is public domain so you can take it
// anywhere. Your tile declares its own license in manifest.json.

// ---------------------------------------------------------------------------
// PARAMETER GROUPS
//
// A line like /* [Label] */ starts a group. Everything under it becomes one
// collapsible section of controls in the app, in the order you write them.
//
// The VARIABLE NAME becomes the control's label, with the underscores turned
// into spaces: label_width reads as "label width". Name them in plain words.
//
// The COMMENT DIRECTLY ABOVE becomes the description under that label, and the
// text behind the control's help button - so write it for the person using the
// app, not for the person reading the code. End it with a unit in brackets and
// the app shows the unit beside the value.
//
// The comment AFTER the value, in [square brackets], decides what kind of
// control it is: a slider, a checkbox, a menu, or a file picker.
// ---------------------------------------------------------------------------

/* [Label] */

// Width of the label (mm)
label_width = 70; // [30:1:150]

// Depth of the label (mm)
label_depth = 45; // [20:1:120]

// How thick the flat plate is (mm)
plate_thickness = 3; // [1.2:0.1:10]

// Rounded corners (0 for sharp corners)
corner_radius = 3; // [0:0.5:12]

/* [Picture] */

// A parameter annotated [file:...] becomes a file picker in the app. The
// person using it can upload their own, or pick one you shipped beside this
// file. Leave the default empty and the label prints plain.
//
// IF YOU GIVE THIS A DEFAULT FILE NAME, that file must be listed in
// manifest.json under "files". A first-party tile in this repository once
// shipped without doing that: the file was right there in the folder, the
// manifest named it, and the app still could not find it, because a second
// list had gone out of step. The validator checks this for you now
// (scripts/validate-example.mjs).

// Picture to put on the label (SVG, PNG or JPG; leave empty for none)
picture_file = ""; // [file:svg,png,jpg]

// Cut the picture into the face, or raise it above the face
picture_style = "engraved"; // [engraved, raised]

// How deep to cut, or how high to raise (mm)
picture_depth = 0.8; // [0.2:0.1:3]

// Picture width (0 = fit it to the label)
picture_width = 0; // [0:1:150]

/* [Tactile edge] */

// ---------------------------------------------------------------------------
// TACTILE VALUES - READ THIS BEFORE YOU CHANGE ANY NUMBER IN THIS GROUP.
//
// This border is here to be FOUND BY TOUCH. That makes its height a value
// somebody's fingers depend on, and values like that are not yours or mine to
// pick from feel. They come from the published standard that governs the
// design - the braille specification this project ships, the signage standard
// an installation has to meet, whatever applies to what you are making.
//
// The rules this project works to:
//
//   * Every dimension that affects readability by touch, grip, or how hard
//     something is to press is a PARAMETER with a documented safe minimum and
//     maximum - never a number typed straight into the geometry.
//   * The minimum and maximum come FROM THE SPEC. Never invented, never
//     copied from another tile, and never widened to make a render succeed.
//   * An assert() enforces them, so a value outside the range fails the build
//     instead of quietly printing something nobody can read.
//
// The two numbers at the bottom of this file (ridge_height_min and
// ridge_height_max) are PLACEHOLDERS, and they are deliberately generic. They
// exist so the assert has something to check while you are learning the shape
// of the file. Replace them with your spec's numbers, and cite the spec in the
// comment beside them.
//
// Why this matters more than the rest of the file: nothing in the build catches
// a wrong tactile number. A part with dots too tall reads as mush and a part
// with dots too short reads as nothing, and both of them export, print, and
// look fine in the preview. Only a finger finds out, and by then it is a
// printed object in somebody's hand.
// ---------------------------------------------------------------------------

// Height of the raised border (mm; 0 for no border)
// Documented range: ridge_height_min to ridge_height_max, at the end of this
// file. Replace those with your governing spec's numbers.
ridge_height = 0.8; // [0:0.05:1.5]

// How wide the border sits on the plate (mm)
ridge_width = 2; // [1.2:0.1:8]

/* [Mounting] */

// Add a hole for a keyring or hook
hanging_hole = "yes"; // [yes, no]

// Hole diameter (mm)
hole_diameter = 4; // [3:0.5:8]

/* [Quality] */

// Curve smoothness. Higher is smoother and slower. Surfaces people touch want
// this high enough that the facets cannot be felt.
$fn = 48; // [24:8:128]

/* [Hidden] */

// Everything below this line is computed, and the app does not show it as a
// control. Put your maths, your constants and your modules here.

// Overlap for boolean operations. Two faces that touch exactly are ambiguous
// to the geometry engine and can export as a hole; a hundredth of a millimetre
// of overlap is the fix.
_fuse = 0.01;

// The thinnest wall this design will print reliably on a normal FDM printer.
_min_wall = 1.2;

// TACTILE RANGE - PLACEHOLDERS. Replace both numbers with the minimum and
// maximum from the standard that governs your design, and name that standard
// here so the next person can check it:
//   Source: (none yet - this is template placeholder material)
ridge_height_min = 0.5;
ridge_height_max = 1.5;

// ---------------------------------------------------------------------------
// ASSERTS
//
// An assert() that fails stops the render with your message, which is exactly
// what you want: a build that fails loudly beats a part that fails quietly.
// The headless check this project runs treats a failed assert as a failed
// build, and that is the point.
// ---------------------------------------------------------------------------

assert(
    plate_thickness >= _min_wall,
    str("plate_thickness is ", plate_thickness, " mm, thinner than the ",
        _min_wall, " mm minimum wall this design prints reliably")
);

assert(
    ridge_height == 0 || (ridge_height >= ridge_height_min && ridge_height <= ridge_height_max),
    str("ridge_height is ", ridge_height, " mm, outside the documented range ",
        ridge_height_min, " to ", ridge_height_max,
        " mm - a border outside that range is not the one this design was checked for")
);

assert(
    ridge_width >= _min_wall,
    str("ridge_width is ", ridge_width, " mm, thinner than the ", _min_wall,
        " mm minimum wall this design prints reliably")
);

assert(
    picture_depth < plate_thickness,
    str("picture_depth is ", picture_depth,
        " mm, which would cut straight through a plate ", plate_thickness, " mm thick")
);

assert(
    label_width > 2 * corner_radius && label_depth > 2 * corner_radius,
    "corner_radius is too large for a label this size"
);

has_picture = picture_file != "";

// The area inside the border, less a small margin, is the part of the face a
// picture may use.
_picture_margin = 2;
border_inset = ridge_height > 0 ? ridge_width : 0;
usable_width = label_width - 2 * border_inset - 2 * _picture_margin;
usable_depth = label_depth - 2 * border_inset - 2 * _picture_margin;

// An imported picture's proportions are whatever the person who drew it chose,
// and you cannot measure them from here. Fitting to the SHORTER side is what
// keeps a tall picture from running off a wide label. The intersection() in
// picture_2d() is the belt to this bracer: whatever comes in, the engraving
// stays on the face and never reaches the border or the side wall.
effective_picture_width = picture_width > 0 ? picture_width : min(usable_width, usable_depth);

hole_x = border_inset + 2 + hole_diameter / 2;
total_height = plate_thickness + ridge_height;

// ---------------------------------------------------------------------------
// ECHO
//
// echo() prints to the console, including in headless runs, where the lines
// start with ECHO:. It is how you check a computed value without opening
// anything. Report the numbers a person would want to know before printing.
// ---------------------------------------------------------------------------

echo(str("Finished label: ", label_width, " x ", label_depth, " x ",
         total_height, " mm"));
echo(str("Tactile border height: ", ridge_height,
         " mm (documented range ", ridge_height_min, " to ",
         ridge_height_max, " mm)"));
echo(str("Picture: ", has_picture ? picture_file : "none",
         has_picture ? str(" fitted to ", effective_picture_width, " mm wide") : ""));

// ---------------------------------------------------------------------------
// GEOMETRY
// ---------------------------------------------------------------------------

module rounded_slab(w, d, h, r) {
    translate([r, r, 0])
        linear_extrude(height = h)
            offset(r = r)
                square([w - 2 * r, d - 2 * r]);
}

module edge_ridge() {
    if (ridge_height > 0) {
        translate([0, 0, plate_thickness - _fuse])
            difference() {
                rounded_slab(label_width, label_depth,
                             ridge_height + _fuse, corner_radius);
                translate([ridge_width, ridge_width, -_fuse])
                    rounded_slab(label_width - 2 * ridge_width,
                                 label_depth - 2 * ridge_width,
                                 ridge_height + 3 * _fuse,
                                 max(corner_radius - ridge_width, 0));
            }
    }
}

module picture_2d() {
    intersection() {
        resize([effective_picture_width, 0], auto = true)
            import(picture_file, center = true);
        square([usable_width, usable_depth], center = true);
    }
}

module picture_solid(height) {
    translate([label_width / 2, label_depth / 2, 0])
        linear_extrude(height = height)
            picture_2d();
}

module label() {
    difference() {
        union() {
            rounded_slab(label_width, label_depth, plate_thickness, corner_radius);
            edge_ridge();
            if (has_picture && picture_style == "raised")
                translate([0, 0, plate_thickness - _fuse])
                    picture_solid(picture_depth + _fuse);
        }

        if (has_picture && picture_style == "engraved")
            translate([0, 0, plate_thickness - picture_depth])
                picture_solid(picture_depth + _fuse);

        if (hanging_hole == "yes")
            translate([hole_x, label_depth / 2, -_fuse])
                cylinder(d = hole_diameter,
                         h = total_height + 2 * _fuse);
    }
}

label();
