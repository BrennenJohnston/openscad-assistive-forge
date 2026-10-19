OpenSCAD WASM Files
===================

This directory contains OpenSCAD's WebAssembly engines. openscad-official/ is
the Forge engine, the one the app starts with: OpenSCAD's own source with
Manifold support, built for Forge with three changes.

Build: OpenSCAD-2026.04.03+forge.3 (98d891340e, CGAL_ALWAYS_ROUND_TO_NEAREST, 8 MiB stack, WebAssembly exceptions)
Source: https://github.com/openscad/openscad at commit
        98d891340e6007524e69f399162016f9b22584ff, the commit behind the
        official 2026.04.03 snapshot
Recipe: scripts/build-openscad-wasm.sh, wasm-exceptions variant, run by the
        "Build OpenSCAD wasm" workflow
        (.github/workflows/build-openscad-wasm.yml)
Previous Build: OpenSCAD-2026.04.03+forge.2, the same built with
        Emscripten's JavaScript-based exceptions
License: GPL-2.0-or-later, OpenSCAD's own (its text is
        licenses/OpenSCAD-COPYING on the engine-research branch)
Research branch: engine-research in this repository holds this engine alone,
        the patches, the measurements behind them and a page to try it.

Contents:
- openscad-official/openscad.js    - Emscripten-compiled JavaScript loader
- openscad-official/openscad.wasm  - WebAssembly binary with Manifold CSG support
- openscad-official/INTEGRITY.json - Build name, sizes and SHA-256 of the two files
- openscad-official.zip            - The two engine files as the recipe built them
- engines.json                     - The four official OpenSCAD snapshots a
                                     person can choose instead: each zip's
                                     address, size and SHA-256, and its two
                                     files' sizes and SHA-256
- engines/<id>/                    - Those snapshots, written by
                                     npm run setup-wasm (not committed)

The Three Changes:
1. The compile definition CGAL_ALWAYS_ROUND_TO_NEAREST beside the
   CGAL_DISABLE_ROUNDING_MATH_CHECK that OpenSCAD's CMakeLists.txt already
   sets for Emscripten.
2. WebAssembly's own exceptions (-fwasm-exceptions) in place of Emscripten's
   JavaScript-based ones, with the libraries built the same way.
3. An 8 MiB stack (-sSTACK_SIZE=8388608).
Built with none of them (the "baseline" variant), the recipe gives the
official 2026.04.03 engine back byte for byte. Why each change was made, what
it measured, and how the toolchain differs from the official build are in the
engine-research branch's README.

INTEGRITY.json's knownIssues lines about projection() and roof() are older
than the current measurements: projection() renders on this engine and on the
four official snapshots, and roof() is not switched on in any of them (an
unknown module).

Why This Engine?
- Includes Manifold geometry engine (5-30x faster CSG operations)
- Built from OpenSCAD's source with a pinned, repeatable recipe
- Supports --enable=manifold, --enable=fast-csg flags

Performance Benefits:
- Complex boolean operations: 5-30x faster
- Minkowski operations: 10-30x faster
- Binary STL export: 18x faster than ASCII

Earlier Builds:
- OpenSCAD-2026.04.03+forge.2: JavaScript-based exceptions, replaced because
  Chrome stopped deep models at about 110 levels
- OpenSCAD-2026.04.03+forge.1: the 64 KiB stack, replaced because deep models
  overran it
- OpenSCAD-2026.04.03: the official snapshot, replaced because of the
  rounding fault
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
