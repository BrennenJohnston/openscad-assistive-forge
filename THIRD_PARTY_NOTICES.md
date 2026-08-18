# Third-Party Notices

This document lists the third-party software used by OpenSCAD Assistive Forge and the web applications it generates.

## OpenSCAD (GPL-2.0-or-later)

Generated web applications include OpenSCAD compiled to WebAssembly (WASM) for client-side STL generation.

**License**: GNU General Public License v2.0 or later
**Project**: https://openscad.org/
**Source Code**: https://github.com/openscad/openscad
**WASM Build**: Official OpenSCAD Playground build (includes Manifold support)
**Build Source**: https://files.openscad.org/playground/
**Build Date**: April 3, 2026 (OpenSCAD-2026.04.03-WebAssembly-web)
**Vendored Location**: `public/wasm/openscad-official/`

### Manifold Geometry Library

This build includes the Manifold geometry library for dramatically faster CSG operations:

**License**: Apache-2.0
**Project**: https://github.com/elalish/manifold
**Performance**: 5-30x faster boolean operations, 10-30x faster Minkowski operations

### GPL Compliance for Generated Web Apps

When you deploy a generated web application that includes OpenSCAD WASM:

1. **You must provide access to the OpenSCAD source code** — either by:
   - Linking to the official GitHub repository, or
   - Hosting the source code yourself, or
   - Offering to provide the source upon request

2. **You must include this notice** (or equivalent) in your deployed application's "About" or "Licenses" section

3. **The GPL applies to OpenSCAD and this tool**, which means:
   - Your `.scad` model files retain your license
   - The web application (including OpenSCAD WASM) is GPL-3.0-or-later
   - Your parameter configurations are not affected
   - Generated STL files (data output) are not GPL-licensed
   - The Manifold library (Apache-2.0) is compatible with GPL

### Obtaining OpenSCAD Source

The source code for OpenSCAD is available at:
- https://github.com/openscad/openscad
- https://github.com/openscad/openscad-wasm (WASM port)
- https://github.com/openscad/openscad-playground (playground build system)

To build OpenSCAD WASM from source, see:
- https://github.com/openscad/openscad-wasm

---

## OpenSCAD "chokusen" Icon Theme (GPL-2.0-or-later)

The Classic desktop-layout mode uses a subset of the icon theme shipped with
the OpenSCAD desktop application, so power users see the exact toolbar
iconography they know from desktop OpenSCAD.

**License**: GNU General Public License v2.0 or later (OpenSCAD repository license)
**Project**: https://openscad.org/
**Source Code**: https://github.com/openscad/openscad (`resources/icons/chokusen/` and `resources/icons/chokusen-dark/`)
**Pinned Commit**: `fa8ff8916a9090d9bc64e9d3ad2725ba1aa74dce`
**Retrieved**: 2026-08-06 (original 26); 2026-08-07 (indent, unindent, export-dxf, zoom-in, zoom-out, measure-distance, measure-angle); 2026-08-07 (vcr-control-start, vcr-control-step-back, vcr-control-play, vcr-control-pause, vcr-control-step-forward, vcr-control-end — the Animate panel's playback buttons)
**Vendored Location**: `public/vendor/openscad-icons/` (39 SVGs per theme)
**Redistribution**: under this repository's GPL-3.0-or-later umbrella (GPL-2.0-or-later permits this)

The pinned commit is content-identical to the tag this project transcribes
its UI structure from, `openscad-2026.01.01-TEST2` (`f2bfab1e`): the git tree
hashes of both icon directories match exactly at the two commits
(`chokusen/svg` = `83494843fe36b6fdbdaeefceea9224fae66531a5`,
`chokusen-dark/svg` = `d6b0c5043a8f589953155a6a6822c5e557246120`), so the
icons and the transcribed structure describe the same release.

The OpenSCAD logo, application icon, and name are **not** included — see the
"Trademarks / No Affiliation" section below. Only functional toolbar glyphs
are vendored.

---

## Three.js (MIT)

Generated web applications use Three.js for 3D preview rendering.

**License**: MIT License
**Project**: https://threejs.org/
**Source Code**: https://github.com/mrdoob/three.js

```
MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## liblouis (LGPL-2.1-or-later) and liblouis-js Bindings (GPL-3.0)

The Braille Card Customizer translates text to Unicode braille entirely client-side using liblouis compiled to WebAssembly/asm.js, running in a Web Worker.

**License**: LGPL-2.1-or-later (engine); GPL-3.0 (JavaScript bindings, `easy-api.js`); individual translation tables carry their own license headers (mostly LGPL-2.1-or-later)
**Project**: https://liblouis.io/
**Source Code**: https://github.com/liblouis/liblouis (engine), https://github.com/liblouis/liblouis-js (JS bindings)
**Usage**: `scripts/setup-liblouis.js` copies the emscripten engine build and a curated set of UEB/US translation tables (with their full include closure) from the `liblouis` / `liblouis-build` npm packages into `public/liblouis/` (gitignored) at build time; `src/worker/liblouis-worker.js` loads them at runtime. A `NOTICE.txt` with attribution is written alongside the deployed assets.

---

## clipper2-js (BSL-1.0)

SVG path offset calculations use clipper2-js for polygon offsetting (Minkowski sum).

**License**: Boost Software License 1.0  
**Project**: https://github.com/niceDev0908/clipper2-js  
**Usage**: Used by `src/js/svg-offset.js` for inward/outward path offset in the SVG preparation workspace

---

## OpenStreetMap Data (ODbL 1.0)

The hidden ASCII City Walk game renders walkable city scenes from bundled
extracts of OpenStreetMap data (building footprints, building heights, and
roads).

**License**: Open Database License (ODbL) 1.0 — data, not software
**Attribution**: Map data © OpenStreetMap contributors
**Copyright page**: https://www.openstreetmap.org/copyright
**ODbL text**: https://opendatacommons.org/licenses/odbl/1-0/
**Vendored Location**: `public/examples/ascii-city/*.json` (trimmed extracts
generated by `scripts/bake-city-extract.mjs` from the public Overpass API;
each file carries its own attribution/license stamp, and
`public/examples/ascii-city/README.md` documents regeneration)

The extracts are a derivative database of OpenStreetMap redistributed under
the ODbL. The game shows the attribution in its own UI wherever the data is
displayed. The rendered game view is a produced work; the underlying data
remains © OpenStreetMap contributors.

---

## JSON Schema (Various)

This tool uses JSON Schema (draft 2020-12) for parameter validation.

**Specification**: https://json-schema.org/
**License**: The JSON Schema specification is available under various open licenses

---

## Reference Projects

This tool was inspired by patterns from:

### openscad-web-gui (Reference Only)
- **License**: GPL-3.0
- **Source**: https://github.com/seasick/openscad-web-gui
- **Note**: Referenced for architecture patterns; code is not directly included

---

## Test Fixtures

### Universal Cuff Utensil Holder (CC0-1.0)
- **File**: `tests/fixtures/universal-cuff/universal_cuff_utensil_holder.scad`
- **Author**: Volksswitch (https://www.volksswitch.org)
- **License**: CC0 1.0 Universal (public domain dedication, stated in the file's own header)
- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: Included verbatim as a test fixture. Real assistive-technology
  source of realistic size (1,017 lines), used by the production-parity and
  editor specs — a 28-line sample cannot reproduce editor layout defects.

---

## Your Model Files

The `.scad` files you process with this tool retain their original license. This tool does not change the licensing of your parametric models.

If your model is licensed under a permissive license (MIT, Apache-2.0, CC0, etc.), the generated web app can be distributed freely (subject to OpenSCAD GPL compliance).

If your model is licensed under GPL or a similar copyleft license, the generated web app may have additional distribution requirements beyond OpenSCAD's.

---

## Trademarks / No Affiliation

Any third-party product names, company names, or logos mentioned in this repository (including in historical references) are the property of their respective owners.

- Such mentions are for **identification/informational purposes only**.
- This project is **not affiliated with, sponsored by, or endorsed by** any third parties unless explicitly stated.
- Do **not** use third-party logos or branding in this project without permission.

---

## Rendering Techniques & References

### Shape-Vector Character Rendering

Certain rendering techniques in this project were inspired by research and educational articles on advanced character-based rendering approaches.

**Reference**: Alex Harri, character-based rendering technique article  
**URL**: https://alexharri.com/blog/ascii-rendering  
**Usage**: Educational reference for technique concepts  
**Note**: Implementation is original/clean-room; no code was copied

### Three.js Examples Modules (MIT)

This project uses modules from the Three.js examples collection (e.g., controls and loaders).

**License**: MIT (covered by the Three.js license above)  
**Source**: https://github.com/mrdoob/three.js/tree/dev/examples

---

## Iosevka Term (OFL-1.1)

The mono UI variant self-hosts the Iosevka Term Regular WOFF2 font.

**License**: SIL Open Font License 1.1  
**Author**: Belleve Invis  
**Project**: https://github.com/be5invis/Iosevka  
**Version**: v34.2.1  
**Vendored Location**: `public/fonts/iosevka-term-regular.woff2`

### SIL Open Font License 1.1

```
Copyright 2015-2024 The Iosevka Project Authors (https://github.com/be5invis/Iosevka)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

---

## Questions?

For licensing questions about:
- **This tool** → See [LICENSE](LICENSE) (GPL-3.0-or-later)
- **OpenSCAD** → See https://openscad.org/about.html
- **Your models** → Consult your own licensing terms
