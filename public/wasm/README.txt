OpenSCAD WASM Files
===================

This directory contains OpenSCAD's WebAssembly engine with Manifold support,
built for Forge from OpenSCAD's own source with two changes.

Build: OpenSCAD-2026.04.03+forge.2 (98d891340e, CGAL_ALWAYS_ROUND_TO_NEAREST, 8 MiB stack)
Source: https://github.com/openscad/openscad at commit
        98d891340e6007524e69f399162016f9b22584ff, the commit behind the
        official 2026.04.03 snapshot
Recipe: scripts/build-openscad-wasm.sh, run by the "Build OpenSCAD wasm"
        workflow (.github/workflows/build-openscad-wasm.yml)
Previous Build: OpenSCAD-2026.04.03+forge.1, the same build with
        Emscripten's 64 KiB stack
License: GPL-2.0-or-later (see COPYING in repository root)

Contents:
- openscad-official/openscad.js    - Emscripten-compiled JavaScript loader
- openscad-official/openscad.wasm  - WebAssembly binary with Manifold CSG support
- openscad-official/INTEGRITY.json - Build name, sizes and SHA-256 of the two files
- openscad-official.zip            - The two engine files as the recipe built them

The Two Changes:
1. The build adds the compile definition CGAL_ALWAYS_ROUND_TO_NEAREST beside
   the CGAL_DISABLE_ROUNDING_MATH_CHECK that OpenSCAD's CMakeLists.txt already
   sets for Emscripten.
2. The engine is linked with an 8 MiB stack (-sSTACK_SIZE=8388608).
Nothing else differs from upstream: built without them (the "baseline"
variant), the recipe gives the official 2026.04.03 engine back byte for byte.

Why the first:
WebAssembly can only round to nearest. Without the definition, CGAL's interval
arithmetic expects to switch the rounding mode and is unsound in a browser.
minkowski() hulls failed a CGAL assertion and fell back to a method that took
about a minute on some models, and the meshes that did come out differed
slightly from desktop OpenSCAD's. With it, those models preview in seconds and
have the volume desktop OpenSCAD gives them.

Why the second:
Emscripten's default stack is 64 KiB. A model that repeats a module a few
dozen to a few hundred levels deep ran past it, and the overrun damaged memory
instead of stopping: Firefox and Safari failed with "indirect call to null"
and similar. OpenSCAD's own recursion guard assumes 8 MiB on Emscripten, so it
never fired. With 8 MiB, such models render as on desktop in Firefox and
Safari; Chrome still stops at a depth of its own (its script stack). Ordinary
models render in the same time.

Why This Engine?
- Includes Manifold geometry engine (5-30x faster CSG operations)
- Built from OpenSCAD's source in OpenSCAD's own build image
- Supports --enable=manifold, --enable=fast-csg flags

Performance Benefits:
- Complex boolean operations: 5-30x faster
- Minkowski operations: 10-30x faster
- Binary STL export: 18x faster than ASCII

Earlier Builds:
- OpenSCAD-2026.04.03+forge.1: the same with the 64 KiB stack, replaced
  because deep models overran it
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
