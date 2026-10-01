OpenSCAD WASM Files
===================

This directory contains OpenSCAD's WebAssembly engine with Manifold support,
built for Forge from OpenSCAD's own source with one change.

Build: OpenSCAD-2026.04.03+forge.1 (98d891340e, CGAL_ALWAYS_ROUND_TO_NEAREST)
Source: https://github.com/openscad/openscad at commit
        98d891340e6007524e69f399162016f9b22584ff, the commit behind the
        official 2026.04.03 snapshot
Recipe: scripts/build-openscad-wasm.sh, run by the "Build OpenSCAD wasm"
        workflow (.github/workflows/build-openscad-wasm.yml)
Previous Build: OpenSCAD-2026.04.03, the official snapshot from
        https://files.openscad.org/snapshots/
License: GPL-2.0-or-later (see COPYING in repository root)

Contents:
- openscad-official/openscad.js    - Emscripten-compiled JavaScript loader
- openscad-official/openscad.wasm  - WebAssembly binary with Manifold CSG support
- openscad-official/INTEGRITY.json - Build name, sizes and SHA-256 of the two files
- openscad-official.zip            - The two engine files as the recipe built them

The One Change:
The build adds the compile definition CGAL_ALWAYS_ROUND_TO_NEAREST beside the
CGAL_DISABLE_ROUNDING_MATH_CHECK that OpenSCAD's CMakeLists.txt already sets
for Emscripten. Nothing else differs from upstream: built without the change,
the recipe gives the official 2026.04.03 engine back byte for byte.

Why:
WebAssembly can only round to nearest. Without the definition, CGAL's interval
arithmetic expects to switch the rounding mode and is unsound in a browser.
minkowski() hulls failed a CGAL assertion and fell back to a method that took
about a minute on some models, and the meshes that did come out differed
slightly from desktop OpenSCAD's. With it, those models preview in seconds and
have the volume desktop OpenSCAD gives them.

Why This Engine?
- Includes Manifold geometry engine (5-30x faster CSG operations)
- Built from OpenSCAD's source in OpenSCAD's own build image
- Supports --enable=manifold, --enable=fast-csg flags

Performance Benefits:
- Complex boolean operations: 5-30x faster
- Minkowski operations: 10-30x faster
- Binary STL export: 18x faster than ASCII

Earlier Builds:
- OpenSCAD-2026.04.03: the official snapshot, replaced because of the
  rounding fault above
- OpenSCAD-2025.03.25.wasm24456 (March 25, 2025)
- openscad-wasm-prebuilt@1.2.0 (npm package, no Manifold support): lacked
  Manifold, outdated, slow on complex models

To Update:
1. Change the pinned commit or the variant in scripts/build-openscad-wasm.sh
2. Run the "Build OpenSCAD wasm" workflow and download its web artifact
3. Check the artifact's SHA-256 against BUILD-INFO.txt in the run
4. Replace the files in openscad-official/, INTEGRITY.json and
   openscad-official.zip in one change. The workflow fails a pull request
   whose engine files are not what the recipe builds
5. Update this README with the new build name and what changed
