// A module that calls itself `steps` times, each step moved and turned.
// The comparison sets steps to 100 and to 150.
//
// SPDX-License-Identifier: GPL-3.0-or-later

steps = 100;

module step(n) {
    if (n > 0)
        translate([1, 0, 0]) rotate([0, 0, 7]) step(n - 1);
    else
        cube(1);
}

step(steps);
