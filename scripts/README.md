# Scripts

Utility scripts for development, checks and CI. Everything in this folder is
listed below.

| Script | What it does | Run it via |
|---|---|---|
| `download-wasm.js` | Downloads the Liberation fonts (details below) | `npm run setup-wasm` |
| `setup-libraries.js` | Downloads the four OpenSCAD library bundles | `npm run setup-libraries` |
| `setup-liblouis.js` | Copies a liblouis release's braille tables (the Unified English Braille tables the app offers and everything they include) into `public/liblouis/` | `build-liblouis-wasm.sh`, during the build |
| `run-e2e-safe.js` | Runs Playwright without hanging the Windows terminal | `npm run test:e2e` |
| `import-check.js` | Fails if any `import` resolves to nothing. Required CI gate | `npm run import-check` |
| `css-variable-audit.js` | Fails if a `--color-*` / `--focus-*` token is missing from the mono block. Required CI gate | `npm run css-variable-audit` |
| `check-bundle-budget.js` | Fails if a gzipped bundle exceeds its budget. Required CI gate | `npm run check-bundle` |
| `nvda-tail.mjs` | Appends what NVDA said, and the keys it heard, since the last call to a record file under a step's label; reads NVDA's own log | `npm run nvda-tail -- "<step>"`, by hand during a listening run |
| `check-mermaid.mjs` | Parses every Mermaid diagram in the tracked Markdown with Mermaid itself, the way GitHub renders them; fails on the first one it rejects | `npm run check-mermaid` |
| `check-e2e-complete.mjs` | Fails a Playwright run that reports tests which never started, so a run the clock cut short cannot report green | CI only, per browser lane |
| `inject-sw-version.js` | Writes the build's cache version into `dist/sw.js` | automatically, from `vite.config.js` |
| `generate-icons.js` | Generates the PWA icon set | by hand, when the icons change |
| `parse-off-colors.js` | Reads face colours out of OpenSCAD OFF output; used by the geometry-parity work | by hand |
| `desktop-audit.ps1` | Runs desktop OpenSCAD (2021.01 CGAL and 2026.01.03 Manifold) over the keyguard fixture or a full preset sweep and captures reference output, geometry stats, face colours and screenshots | by hand, Windows, with desktop OpenSCAD installed |
| `validate-example.mjs` | Static checks over the shipped example models | `npm run validate:examples`, and in CI |
| `e2e-shard.mjs` | Packs the e2e suite into CI shards by measured cost | CI only, per browser lane |
| `bake-city-extract.mjs` | Bakes an OpenStreetMap extract for the Alt View's city scene | by hand |
| `city-elevation.mjs` | Adds an elevation block to a baked city extract | by hand |
| `city-light-poles.mjs` | Merges a public street-light register into a baked extract | by hand |
| `bench-city-walk.mjs` | Frame-time bench for the city scene; refuses headless and software GL | by hand |
| `census-city-walk.mjs` | Placement census over the shipped extracts and builders | by hand |
| `seq-city-walk.mjs` | Frame-sequence stability instrument for the city converter | by hand |
| `stability-city-walk.mjs` | Still-image stability instrument for the city converter | by hand |
| `build-potrace-wasm.sh` | Compiles Potrace to WebAssembly from one pinned, checksummed tarball into `public/wasm/potrace/` | the "Build Potrace wasm" workflow, or by hand with emsdk active |
| `potrace-glue.c` | The code between Potrace and the browser: an ink mask in, SVG path data out. Compiled by the script above | not run directly |
| `make-icon-fixtures.mjs` | Draws the two stock-icon-shaped fixtures the credit-line tests trace, so none has to be downloaded | by hand, when the fixtures change |
| `verify-potrace-wasm.mjs` | Traces shapes whose answers are known and fails a build that came out mirrored, hole-less or with its settings unwired | the same workflow, right after the build |
| `build-liblouis-wasm.sh` | Compiles liblouis to WebAssembly from one pinned, checksummed release tarball into `public/wasm/liblouis/`, builds a native `lou_translate` from the same tarball, and copies the shipped tables with `setup-liblouis.js` | the "Build liblouis wasm" workflow, or by hand with emsdk, a C compiler and make |
| `verify-liblouis-wasm.mjs` | Translates the test phrases with the built wasm and with the native `lou_translate`, both English tables, and fails on any difference; also checks positions, back-translation and the retry | the same workflow, after the build, once with the release's tables and once with the shipped ones |
| `build-openscad-wasm.sh` | Builds OpenSCAD's WebAssembly engine from one pinned upstream commit in OpenSCAD's build image (pinned by digest), as upstream or with CGAL_ALWAYS_ROUND_TO_NEAREST added, into `build/openscad-wasm/`; never writes `public/wasm/` | the "Build OpenSCAD wasm" workflow, or by hand with Docker |

The three required CI gates run inside the Unit Tests job. If you add a script,
add it to this table.

## download-wasm.js

Downloads **Liberation fonts** for OpenSCAD `text()` support. WASM binaries are vendored in git (`public/wasm/openscad-official/`) and do not need to be downloaded.

```bash
npm run setup-wasm
```

This fetches Liberation fonts (~2MB) into `public/fonts/` with SHA-256 checksum verification. The WASM files (`openscad.js` + `openscad.wasm`) are already tracked in the repository.

## setup-libraries.js

Downloads OpenSCAD library bundles (MCAD, BOSL2, etc.) for use in the web app.

```bash
npm run setup-libraries
```

## setup-liblouis.js

Copies the braille translation tables of a liblouis release into `public/liblouis/`: the Unified English Braille Grade 1 and Grade 2 tables the braille tools offer, every table they include, a `tables.json` catalog the worker reads, and a `NOTICE.txt`. `scripts/build-liblouis-wasm.sh` runs it with the tables folder of the release it builds the engine from, so the tables always match the engine.

```bash
node scripts/setup-liblouis.js --from <tables folder> --liblouis <version> [--out <dir>]
```

## run-e2e-safe.js

Wrapper for Playwright E2E tests that prevents terminal hangs on Windows.

```bash
npm run test:e2e        # headless (recommended)
npm run test:e2e:headed # headed mode
```

Playwright has known issues on Windows PowerShell/CMD that cause terminal freezes. This wrapper adds timeout enforcement, force-kills hung processes, and handles Ctrl+C properly.

If tests still hang, check Task Manager for orphaned `node.exe` or `chrome.exe` processes.

Configuration (edit `CONFIG` object in the script or use env vars):

```bash
PW_FAILSAFE_TIMEOUT=300000 node scripts/run-e2e-safe.js
```

Exit codes: 0 = passed, 1 = failed, 124 = timeout.

## Adding scripts

When adding new scripts:

1. Use ES modules (`.js` with shebang `#!/usr/bin/env node`)
2. Add an npm script in `package.json`
3. Add a row to the table at the top of this file
4. Test on Windows and Unix

Removing one means undoing all of those in the same change, or the repository
is left with orphan references.

See `docs/developing/TROUBLESHOOTING.md` for common issues.
