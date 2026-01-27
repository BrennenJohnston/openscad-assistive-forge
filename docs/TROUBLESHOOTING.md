# Troubleshooting

Common issues and solutions when developing or testing OpenSCAD Assistive Forge.

## Playwright terminal hangs (Windows)

Playwright E2E tests can freeze the terminal on Windows PowerShell/CMD, especially in UI or debug mode.

Symptoms: terminal becomes unresponsive, Ctrl+C doesn't work, CPU usage stays low.

### Use the safe wrapper (recommended)

```bash
npm run test:e2e           # headless, includes timeout protection
npm run test:e2e:headed    # headed mode with protection
```

The wrapper (`scripts/run-e2e-safe.js`) adds a 2-minute timeout, force-kills hung processes, and handles Ctrl+C properly.

### If the terminal is already frozen

1. Try Ctrl+C several times (may take 10-30 seconds)
2. Open Task Manager and kill `node.exe`, `pwsh.exe`, and any `chromium.exe` processes
3. Clear test artifacts before retrying:

```bash
rm -rf test-results playwright-report
```

### Alternatives

- Run tests in Git Bash or WSL instead of PowerShell
- Force CI mode: `$env:CI=1; npx playwright test` (PowerShell)

## WASM not loading

Error: `Failed to load WASM module` or 404 errors for `.wasm` files.

```bash
npm run setup-wasm
ls public/wasm/
# should show: openscad.wasm, openscad.js, openscad.worker.js
```

If WASM download times out, check your network. The files are 15-30MB. Clear browser cache and restart the dev server.

## Build failures

Module not found or syntax errors:

```bash
rm -rf node_modules package-lock.json
npm install
```

Clear Vite cache:

```bash
rm -rf node_modules/.vite
npm run build
```

Check Node version (requires 18+):

```bash
node --version
```

## Unit tests fail

Run a single test file to isolate the issue:

```bash
npx vitest run tests/unit/parser.test.js
```

Enable verbose output:

```bash
npx vitest run --reporter=verbose
```

## E2E tests fail

Common causes: dev server not ready, WASM loading timeout, element timing issues.

Make sure the dev server is running in a separate terminal before running E2E tests, or let Playwright start it (check `playwright.config.js`).

View test artifacts:

```bash
npm run test:e2e:report
ls test-results/
```

## Slow dev server

On Linux/WSL, increase file watcher limit:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

Disable browser extensions that inject code. Close other resource-heavy applications.

## Quick reference

```bash
# safe commands
npm run dev
npm run build
npm run test:run
npm run test:e2e

# cleanup
rm -rf test-results playwright-report coverage
rm -rf dist
rm -rf node_modules package-lock.json && npm install
```
