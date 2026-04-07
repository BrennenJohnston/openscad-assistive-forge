OpenSCAD WASM Files
===================

This directory contains the official OpenSCAD WebAssembly build with Manifold support.

Source: https://files.openscad.org/snapshots/
Build: OpenSCAD-2026.04.03-WebAssembly-web.zip
Build Date: April 3, 2026
Previous Build: OpenSCAD-2025.03.25.wasm24456 (March 25, 2025)
License: GPL-2.0-or-later (see COPYING in repository root)

Contents:
- openscad-official/openscad.js   - Emscripten-compiled JavaScript loader
- openscad-official/openscad.wasm - WebAssembly binary with Manifold CSG support
- openscad-official.zip           - Original downloaded archive

Why This Build?
- Includes Manifold geometry engine (5-30x faster CSG operations)
- Official build maintained by OpenSCAD core team
- Same build used by OpenSCAD Playground (ochafik.com/openscad2)
- Supports --enable=manifold, --enable=fast-csg flags

Performance Benefits:
- Complex boolean operations: 5-30x faster
- Minkowski operations: 10-30x faster
- Binary STL export: 18x faster than ASCII

Previous Build:
- Replaced: openscad-wasm-prebuilt@1.2.0 (npm package, no Manifold support)
- Reason: Lacked Manifold, outdated, slow performance on complex models

To Update:
1. Download latest from: https://files.openscad.org/playground/
2. Extract OpenSCAD-YYYY.MM.DD.wasmXXXXX-WebAssembly-web.zip
3. Replace files in openscad-official/
4. Update this README with new build date and version