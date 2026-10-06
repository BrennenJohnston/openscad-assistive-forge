# Dependency status

A dated record of what this app ships against what upstream offers, for
the pieces that matter most: the OpenSCAD engine that renders models and
the liblouis engine that translates braille. I re-check these before
each major release; the table below is the 2026-09-01 reading, with the
liblouis row updated on 2026-10-01.

## Summary

| Piece | We ship | Upstream newest | Decision |
|---|---|---|---|
| OpenSCAD WASM engine | OpenSCAD-2026.04.03+forge.1: OpenSCAD's 2026.04.03 source built here with one rounding fix (vendored, integrity-pinned) | snapshot channel: OpenSCAD-2026.09.29 (read 2026-09-30) | **Hold.** A newer upstream build has the same rounding fault until OpenSCAD takes the fix, and it needs its own parity run. |
| OpenSCAD desktop (verification binary) | 2026.01.03 nightly (CI pin) | snapshot channel: OpenSCAD-2025.09.10 win64 | **Hold**, same reason. |
| liblouis engine + tables | liblouis 3.39.0, built here from its release tarball (`scripts/build-liblouis-wasm.sh`), with the Unified English Braille tables and every table they include | liblouis v3.39.0 (2026-09-01) | **Done** (2026-10-01): built from source and checked against native liblouis; see below. |
| npm dependencies | lockfile at v5 prep | `npm audit`: **0 vulnerabilities** (2026-09-01) | Nothing to patch. Major bumps stay post-v5 candidates. |

## The OpenSCAD engine, in detail

The vendored engine lives in `public/wasm/openscad-official/` with
SHA-256 pins in `INTEGRITY.json` (build OpenSCAD-2026.04.03+forge.1,
Manifold and CGAL enabled, known issues listed in the manifest). It is
OpenSCAD's own source at the commit behind the official 2026.04.03
snapshot, built by `scripts/build-openscad-wasm.sh` with one compile
definition added, `CGAL_ALWAYS_ROUND_TO_NEAREST`. WebAssembly can only
round to nearest, and without that definition `minkowski()` could take
about a minute and gave meshes slightly off desktop OpenSCAD's;
`public/wasm/README.txt` has the detail. Built without the change, the
recipe gives the official engine back byte for byte, and the "Build
OpenSCAD wasm" workflow fails a pull request whose engine files are not
what the recipe builds.

The official snapshot channel at files.openscad.org publishes
WebAssembly builds again (2026.09.29 when I read it on 2026-09-30).
OpenSCAD's build still lacks the definition, so a newer official build
would bring the fault back. Moving to newer OpenSCAD source means a new
pinned commit in the recipe, the geometry parity harness
(`npm run parity`) across versions, the known-issues delta, and the
vendored bytes replaced only with the integrity manifest updated in the
same change. The WASM files are a protected class in this repo; they
never move silently.

## The liblouis question, answered (2026-10-01)

Until October 2026 the braille engine was the one published to npm in 2017
(liblouis-build 3.2.0-rc), called through bindings (liblouis-js 0.4.0) that
sized the output buffer in bytes and told liblouis it held that many
characters. Braille longer than its text ran off the end of the buffer, and a
word such as "See3D" stopped the translator. The braille tests it passed never
had more cells than letters, so they could not see it.

I took path 1. liblouis 3.39.0, the newest release, is compiled from its
checksummed release tarball by `scripts/build-liblouis-wasm.sh` in the "Build
liblouis wasm" workflow, the way Potrace is built. The same run builds a native
`lou_translate` from the same tarball and checks the wasm against it on 63 test
phrases in both English tables; they agree cell for cell. The binding is my own
(`src/js/liblouis-engine.js`): every buffer is sized in characters, and a
translation that stopped short is retried, never returned as if it were whole.
The tables come from the same tarball, Unified English Braille only; the U.S.
code from before 2016 is gone.

A later upgrade is a new version and checksum in the recipe, a workflow run,
and the checks that come with it.

## npm

`npm audit` on 2026-09-01: 0 vulnerabilities, nothing to patch. Major
version bumps of runtime dependencies wait until after v5.0.0 so the
release ships against the lockfile the whole round was verified on.
