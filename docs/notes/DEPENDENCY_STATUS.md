# Dependency status

A dated record of what this app ships against what upstream offers, for
the pieces that matter most: the OpenSCAD engine that renders models and
the liblouis engine that translates braille. I re-check these before
each major release; the table below is the 2026-09-01 reading.

## Summary

| Piece | We ship | Upstream newest | Decision |
|---|---|---|---|
| OpenSCAD WASM engine | OpenSCAD-2026.04.03 (vendored, integrity-pinned) | snapshot channel: OpenSCAD-2025.09.10.wasm27277 | **Hold.** The channel's newest build is older-dated than what we already vendor; no upgrade exists to take. |
| OpenSCAD desktop (verification binary) | 2026.01.03 nightly (CI pin) | snapshot channel: OpenSCAD-2025.09.10 win64 | **Hold**, same reason. |
| liblouis engine + tables | liblouis-build 3.2.0-rc (published 2017) + easy-api (liblouis npm ^0.4.0), curated UEB/US tables with their include closure | liblouis v3.38.0 (2026-06-01); liblouis/js-build has no releases (latest commit 2026-08-28) | **Proposal below — nothing moves without a decision and a translation parity check.** Braille output is accessibility-critical. |
| npm dependencies | lockfile at v5 prep | `npm audit`: **0 vulnerabilities** (2026-09-01) | Nothing to patch. Major bumps stay post-v5 candidates. |

## The OpenSCAD engine, in detail

The vendored engine lives in `public/wasm/openscad-official/` with
SHA-256 pins in `INTEGRITY.json` (build OpenSCAD-2026.04.03, Manifold and
CGAL enabled, known issues listed in the manifest). The official
snapshot channel at files.openscad.org has not published a newer
WebAssembly build since 2025-09-10 — that is *older* than the build we
vendor, so there is nothing to upgrade to. If the channel wakes up with
a newer build, the path is already written: run the geometry parity
harness (`npm run parity`) across versions, read the known-issues delta,
and replace the vendored bytes only with the integrity manifest updated
in the same change. The WASM files are a protected class in this repo;
they never move silently.

## The liblouis question, and my proposal

The braille engine this app ships was published to npm in 2017
(liblouis-build 3.2.0-rc, still the newest on npm). Upstream liblouis
reached 3.38.0 in June 2026. Nine years of table fixes — UEB refinements
included — are not in the app.

There is no drop-in fix: the js-build repository publishes no releases
(though its main branch saw commits as recently as 2026-08-28), so a
newer engine means building liblouis with emscripten ourselves and
vendoring the result like the OpenSCAD engine. The three honest paths:

1. **Self-build and vendor liblouis 3.38.0.** The durable fix. Real
   cost: an emscripten/autotools build pipeline (practically a
   WSL/container job on this machine), a vendoring layout with integrity
   pins, and a full translation parity run of the braille unit goldens
   plus eyes-on braille output before it ships. This is its own work
   package, not a release-week task.
2. **Refresh only the curated tables against the old engine.** Cheaper,
   but I do not recommend it blind: newer tables can use opcodes a
   2017 engine does not know, and the failure mode is *silent
   mistranslation* — the worst possible failure for braille. Any table
   refresh needs the same parity gate as path 1, which removes most of
   its cost advantage.
3. **Hold**, and schedule path 1 as its own future work package.

**My recommendation: hold for v5.0.0 and schedule the self-build as its
own package.** The current engine+tables pass every braille golden in
the suite; the risk of moving them under release pressure outweighs nine
years of fixes we have lived without. The decision stays open until I
sign one of the three paths.

## npm

`npm audit` on 2026-09-01: 0 vulnerabilities, nothing to patch. Major
version bumps of runtime dependencies wait until after v5.0.0 so the
release ships against the lockfile the whole round was verified on.
