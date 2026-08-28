// Stencil Maker — one-sheet spray stencil from an uploaded picture
// Upload a PNG, JPG, or SVG; the app traces pictures to vector shapes.
// The design is cut out of a flat plate with corner alignment crosses,
// ready to 3D print (STL) or laser cut (SVG/DXF export).
//
// Support bars are material left across the cuts so enclosed centers
// (the middle of an O, the inside of a ring) stay attached to the sheet.
// This model cannot detect which shapes need them, so place the bars
// yourself and check the preview: every enclosed piece must be crossed
// by at least one bar.
//
// Physical defaults (plate 200x200x0.6 mm, 15 mm margin, 10 mm crosses)
// are the owner-approved Stencil Forge values, 2026-08-25.
// License: CC0 (Public Domain)

/* [Output] */
// 3D print (extruded plate) or laser cut (flat 2D for SVG/DXF export)
output_type = "3d_print"; // [3d_print, laser_cut]

// How the stencil is made. Single sheet is one plate with support bars, and
// works exactly as it always has. Layered is the bridge-less method: the app
// works out which shapes sit inside which and writes one plate per layer, so
// nothing ever needs a bridge holding it. Paint through plate 1 first, then
// line plate 2 up on the corner marks and paint again.
stencil_mode = "single_sheet"; // [single_sheet, layered]

// Which plate to show and export. Only used in layered mode.
plate_number = 1; // [1:1:3]

// Plate 1, written by the app from your design. It cuts every part of the
// design at once and takes the first coat of paint. Each plate already carries
// its own outline, cuts and registration marks in millimetres, so this model
// only has to give it thickness.
stencil_plate_1 = ""; // [file:svg]

// Plate 2. It covers the background and everything plate 1 painted, and opens
// only the shapes nested inside them, so the second coat lands on those alone.
stencil_plate_2 = ""; // [file:svg]

// Plate 3. It covers everything except the shapes nested deepest, for a third
// coat. Empty when your design is not nested three deep.
stencil_plate_3 = ""; // [file:svg]

/* [Design] */
// Image file for the stencil (SVG, PNG, or JPG — raster images auto-convert to SVG)
design_file = "sample-design.svg"; // [file:svg,png,jpg]

// Design width divided by height. The Assistive Forge app measures and sets this when you choose a file; in desktop OpenSCAD set it to your file's width/height so 100 truly fills the design area (1 assumes a square design)
design_file_aspect = 1; // [0.05:0.01:20]

// Design size as a percentage of the design area (the plate inside the margins); 100 fills it
design_scale = 80; // [10:5:110]

// Left (-) / right (+) position offset for the design (mm)
design_left_right = 0; // [-50:1:50]

// Down (-) / up (+) position offset for the design (mm)
design_up_down = 0; // [-50:1:50]

/* [Plate] */
// Plate width (mm)
plate_width = 200; // [60:1:600]

// Plate height (mm)
plate_height = 200; // [60:1:600]

// Thickness of the printed plate (mm). 0.6 prints in about 3 flat layers
plate_thickness = 0.6; // [0.4:0.05:3]

// Solid border around the design area (mm)
margin = 15; // [6:1:40]

/* [Support bars] */
// Bars of material across the cuts that hold enclosed centers in place
bar_direction = "horizontal"; // [none, horizontal, vertical, both]

// Number of bars in each direction
bar_count = 1; // [1:1:6]

// Bar width (mm). 1.2 is the minimum sturdy web
bar_width = 3; // [1.2:0.1:8]

/* [Marks] */
// Corner alignment crosses, cut through the margin for repeat spraying
marks = "yes"; // [yes, no]

/* [Laser] */
// Add bridges: narrow ribs of material left across a cut so an enclosed shape
// stays attached. A laser cuts one sheet once, so the middle of an O falls out
// without them. Leave this on unless you know your design has nothing enclosed.
bridges = "yes"; // [yes, no]

// How wide each rib is (mm). Wider holds better and shows more in the paint.
bridge_width = 3.0; // [1:0.1:8]

// How many ribs hold each enclosed shape.
bridge_count = 2; // [1:1:6]

// The laser-ready drawing, prepared by the Assistive Forge app: true size,
// with the bridges already worked out. Used only when Output type is laser cut.
stencil_laser_file = ""; // [file:svg]

/* [Quality] */
$fn = 64; // [24:8:128]

/* [Hidden] */
assert(plate_width >= 60 && plate_width <= 600,
       "plate_width outside the supported 60-600 mm range");
assert(plate_height >= 60 && plate_height <= 600,
       "plate_height outside the supported 60-600 mm range");
assert(plate_thickness >= 0.4 && plate_thickness <= 3,
       "plate_thickness outside the supported 0.4-3 mm range");
assert(margin >= 6 && margin <= 40,
       "margin outside the supported 6-40 mm range");
assert(2 * margin < min(plate_width, plate_height),
       "margins leave no design area; reduce margin or enlarge the plate");
assert(design_file_aspect > 0,
       "design_file_aspect must be positive (width divided by height)");
assert(bar_width >= 1.2,
       "bar_width below the 1.2 mm minimum sturdy web");
assert(output_type == "3d_print" || output_type == "laser_cut",
       "output_type must be 3d_print or laser_cut");

design_area_w = plate_width - 2 * margin;
design_area_h = plate_height - 2 * margin;
fit_w = design_area_w * design_scale / 100;
fit_h = design_area_h * design_scale / 100;
// Crosses shrink to fit a narrow margin, the same clamp the Stencil
// Forge app applies
mark_size = min(10, margin - 2);
mark_stroke = 1.2;
mark_c = margin / 2;
// NO KERF COMPENSATION HERE, on purpose. A laser beam removes material, so a
// cut lands about half a beam width inside the line - but LightBurn, LaserGRBL,
// xTool and Glowforge all apply that offset themselves, as a cutting setting
// that knows the material and the power. This model used to shrink every cut by
// kerf/2 as well, and two corrections make the part undersized by a FULL kerf
// with nothing on screen to show it. The file is exported TRUE SIZE and the
// laser's own software does the one job it is better placed to do.

echo(str("Design area: ", design_area_w, " x ", design_area_h,
         " mm; design box: ", fit_w, " x ", fit_h, " mm"));

module design_2d() {
    // Contain-fit: anchor the resize to whichever axis the design hits
    // first (OpenSCAD cannot measure an import; design_file_aspect
    // carries the ratio). Exported TRUE SIZE: kerf is the laser software's
    // job, not this model's.
    translate([plate_width / 2 + design_left_right,
               plate_height / 2 + design_up_down])
        resize(design_file_aspect >= fit_w / fit_h
                   ? [fit_w, 0]
                   : [0, fit_h],
               auto = true)
            import(design_file, center = true);
}

// One + cross centered at (cx, cy)
module cross_2d(cx, cy) {
    translate([cx, cy]) {
        square([mark_size, mark_stroke], center = true);
        square([mark_stroke, mark_size], center = true);
    }
}

module marks_2d() {
    cross_2d(mark_c, mark_c);
    cross_2d(plate_width - mark_c, mark_c);
    cross_2d(mark_c, plate_height - mark_c);
    cross_2d(plate_width - mark_c, plate_height - mark_c);
}

// Bars span the whole plate; they only matter where they cross a cut,
// and their ends always land in the solid margin
module bars_2d() {
    if (bar_direction == "horizontal" || bar_direction == "both") {
        for (i = [1 : bar_count])
            translate([0, margin + design_area_h * i / (bar_count + 1)
                          - bar_width / 2])
                square([plate_width, bar_width]);
    }
    if (bar_direction == "vertical" || bar_direction == "both") {
        for (i = [1 : bar_count])
            translate([margin + design_area_w * i / (bar_count + 1)
                          - bar_width / 2, 0])
                square([bar_width, plate_height]);
    }
}

module cuts_2d() {
    difference() {
        // The design never cuts into the margin band: a cut reaching the
        // plate edge would sever the frame
        intersection() {
            design_2d();
            translate([margin, margin])
                square([design_area_w, design_area_h]);
        }
        if (bar_direction != "none") bars_2d();
    }
    if (marks == "yes") marks_2d();
}

module stencil_2d() {
    difference() {
        square([plate_width, plate_height]);
        cuts_2d();
    }
}

// The layered plates arrive complete and mm-true, so this is deliberately a
// DUMB EXTRUDER: it adds thickness and nothing else. Every decision about what
// is cut was made in the app, which means the preview and the exported file
// cannot drift apart - there is no second implementation to disagree.
module plate_2d() {
    chosen = plate_number == 1 ? stencil_plate_1
           : plate_number == 2 ? stencil_plate_2
           : stencil_plate_3;
    if (chosen != "") import(chosen, center = false);
}

layered = stencil_mode == "layered" &&
          (stencil_plate_1 != "" || stencil_plate_2 != "" || stencil_plate_3 != "");

// Choosing layered mode without plates would silently fall back to the single
// sheet, which is not what was asked for and gives no clue why.
assert(stencil_mode != "layered" || layered,
       "stencil_mode is \"layered\" but no plate files are set - choose a design first");

// In laser mode the app hands over a drawing that is already true size, already
// bridged and already colour-separated, so this model just passes it through.
// Falling back to stencil_2d() keeps the tile usable before a design is chosen.
module laser_2d() {
    if (stencil_laser_file != "") import(stencil_laser_file, center = false);
    else stencil_2d();
}

if (output_type == "3d_print") {
    linear_extrude(height = plate_thickness)
        if (layered) plate_2d(); else stencil_2d();
} else {
    laser_2d();
}
