// Viewer for the stencil golden harness: one plate, top down, so the cut can
// be LOOKED at. Nothing here feeds a number; the IoU is computed from the
// geometry in scripts/stencil-golden.mjs.
//
// Usage: openscad.com --projection=o --camera=0,0,0,0,0,0,100 --viewall \
//          --autocenter --render -D file="C:/path/plate.stl" -o out.png \
//          scripts/stencil-golden-view.scad
file = "";
is_svg = false;

if (is_svg) linear_extrude(height = 0.6) import(file, center = false);
else import(file);
