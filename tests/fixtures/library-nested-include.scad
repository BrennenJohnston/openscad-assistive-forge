// UF-24 fixture: a library module that lives three folders deep inside its
// bundle. Every file after the first in a folder used to be dropped during
// the mount, so this include resolved to nothing and the render was empty.
include <NopSCADlib/utils/core/core.scad>

$fn = 32;

size = 20; // [10:40]

rounded_cube_xy([size, size, 6], 3);
