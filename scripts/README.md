# Scripts

Utility scripts for development, checks and CI. Everything in this folder is
listed below.

| Script | What it does | Run it via |
|---|---|---|
| `download-wasm.js` | Downloads the Liberation fonts (details below) | `npm run setup-wasm` |
| `setup-libraries.js` | Downloads the four OpenSCAD library bundles | `npm run setup-libraries` |
| `setup-liblouis.js` | Copies the braille engine and tables into `public/liblouis/` | `npm run setup-liblouis` |
| `run-e2e-safe.js` | Runs Playwright without hanging the Windows terminal | `npm run test:e2e` |
| `import-check.js` | Fails if any `import` resolves to nothing. Required CI gate | `npm run import-check` |
| `css-variable-audit.js` | Fails if a `--color-*` / `--focus-*` token is missing from the mono block. Required CI gate | `npm run css-variable-audit` |
| `check-bundle-budget.js` | Fails if a gzipped bundle exceeds its budget. Required CI gate | `npm run check-bundle` |
| `check-e2e-complete.mjs` | Fails a Playwright run that reports tests which never started, so a run the clock cut short cannot report green | CI only, per browser lane |
| `inject-sw-version.js` | Writes the build's cache version into `dist/sw.js` | automatically, from `vite.config.js` |
| `generate-icons.js` | Generates the PWA icon set | by hand, when the icons change |
| `parse-off-colors.js` | Reads face colours out of OpenSCAD OFF output; used by the geometry-parity work | by hand |
| `desktop-audit.ps1` | Runs desktop OpenSCAD (2021.01 CGAL and 2026.01.03 Manifold) over the keyguard fixture or a full preset sweep and captures reference output, geometry stats, face colours and screenshots | by hand, Windows, with desktop OpenSCAD installed |

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

Copies the liblouis braille-translation engine (emscripten build) and a curated set of translation tables — including their full `include` closure — from `node_modules` into `public/liblouis/` for the Braille Card Customizer. Also writes a `tables.json` catalog for the UI and a `NOTICE.txt` with attribution. Runs automatically as part of `prebuild`.

```bash
npm run setup-liblouis
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

See `docs/TROUBLESHOOTING.md` for common issues.
