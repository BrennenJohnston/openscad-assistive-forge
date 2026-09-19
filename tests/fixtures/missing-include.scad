// Console fidelity litmus fixture: the include target does not exist, so
// OpenSCAD must surface "Can't open include file" in the console.

include <missing.txt>

/*[Dimensions]*/
size = 10; // [5:50]

cube([size, size, size]);
