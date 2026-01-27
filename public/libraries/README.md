# OpenSCAD Library Bundles

This directory holds popular OpenSCAD libraries that can be used in your models.

## Supported libraries

### MCAD (Mechanical CAD Library)
- Repo: https://github.com/openscad/MCAD
- License: LGPL 2.1
- Mechanical components: gears, screws, bearings, boxes
- Usage: `use <MCAD/boxes.scad>` or `include <MCAD/gears.scad>`

### BOSL2 (Belfry OpenSCAD Library v2)
- Repo: https://github.com/BelfrySCAD/BOSL2
- License: BSD-2-Clause
- Advanced geometry: attachments, rounding, filleting
- Requires OpenSCAD 2021.01+
- Usage: `include <BOSL2/std.scad>`

### NopSCADlib
- Repo: https://github.com/nophead/NopSCADlib
- License: GPL-3.0
- Parts library for 3D printers and electronic enclosures
- Usage: `include <NopSCADlib/lib.scad>`

### dotSCAD
- Repo: https://github.com/JustinSDK/dotSCAD
- License: LGPL 3.0
- Artistic patterns, dots, lines for functional designs
- Usage: `use <dotSCAD/path_extrude.scad>`

## Installation

```bash
npm run setup-libraries
```

This downloads the latest versions into `public/libraries/`.

Manual installation: clone the library repo directly into this directory.

## Usage

Enable a library in the UI, then use it in your `.scad` file:

```openscad
// MCAD example
use <MCAD/boxes.scad>;
roundedBox([20, 30, 40], 5);
```

```openscad
// BOSL2 example
include <BOSL2/std.scad>;
cuboid([20, 30, 40], rounding=5);
```

## Troubleshooting

Library not found: make sure it's enabled in the UI and the files exist in `public/libraries/<library-name>/`.

Render timeout: some library functions are complex. Increase timeout in settings or use lower preview quality.

Compatibility: BOSL2 requires OpenSCAD 2021.01+. Some libraries may not be fully compatible with OpenSCAD WASM.

## Adding new libraries

1. Add library metadata to `src/js/library-manager.js`
2. Place files in `public/libraries/<library-name>/`
3. Update this README
4. Test with example models
