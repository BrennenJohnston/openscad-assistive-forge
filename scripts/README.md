# Scripts

Utility scripts for development and testing.

## download-wasm.js

Downloads OpenSCAD WASM binaries from the official repository.

```bash
npm run setup-wasm
```

This fetches `openscad.wasm`, `openscad.js`, and `openscad.worker.js` into `public/wasm/`. About 15-30MB total.

## setup-libraries.js

Downloads OpenSCAD library bundles (MCAD, BOSL2, etc.) for use in the web app.

```bash
npm run setup-libraries
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
3. Document here
4. Use `chalk` for colored output (already installed)
5. Test on Windows and Unix

See `docs/TROUBLESHOOTING.md` for common issues.
