# Third-Party Notices

This document lists the third-party software used by OpenSCAD Web Customizer Forge and the web applications it generates.

## OpenSCAD (GPL-2.0-or-later)

Generated web applications include OpenSCAD compiled to WebAssembly (WASM) for client-side STL generation.

**License**: GNU General Public License v2.0 or later
**Project**: https://openscad.org/
**Source Code**: https://github.com/openscad/openscad

### GPL Compliance for Generated Web Apps

When you deploy a generated web application that includes OpenSCAD WASM:

1. **You must provide access to the OpenSCAD source code** — either by:
   - Linking to the official GitHub repository, or
   - Hosting the source code yourself, or
   - Offering to provide the source upon request

2. **You must include this notice** (or equivalent) in your deployed application's "About" or "Licenses" section

3. **The GPL applies to OpenSCAD itself**, not to:
   - Your `.scad` model files (your license)
   - The generated web application's UI code (MIT, from this tool)
   - Your parameter configurations

### Obtaining OpenSCAD Source

The source code for OpenSCAD is available at:
- https://github.com/openscad/openscad

To build OpenSCAD WASM from source, see:
- https://github.com/openscad/openscad/blob/master/doc/testing.txt

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

## JSON Schema (Various)

This tool uses JSON Schema (draft 2020-12) for parameter validation.

**Specification**: https://json-schema.org/
**License**: The JSON Schema specification is available under various open licenses

---

## Reference Projects

This tool was inspired by patterns from:

### braille-card-and-cylinder-stl-generator
- **License**: MIT
- **Source**: https://github.com/BrennenJohnston/braille-card-and-cylinder-stl-generator

### openscad-web-gui (Reference Only)
- **License**: GPL-3.0
- **Source**: https://github.com/seasick/openscad-web-gui
- **Note**: Referenced for architecture patterns; code is not directly included

---

## Your Model Files

The `.scad` files you process with this tool retain their original license. This tool does not change the licensing of your parametric models.

If your model is licensed under a permissive license (MIT, Apache-2.0, CC0, etc.), the generated web app can be distributed freely (subject to OpenSCAD GPL compliance).

If your model is licensed under GPL or a similar copyleft license, the generated web app may have additional distribution requirements beyond OpenSCAD's.

---

## Questions?

For licensing questions about:
- **This tool** → See [LICENSE](LICENSE) (MIT)
- **OpenSCAD** → See https://openscad.org/about.html
- **Your models** → Consult your own licensing terms
