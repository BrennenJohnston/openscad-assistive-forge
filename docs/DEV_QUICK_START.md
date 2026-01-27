# Developer Quick Start

Quick reference for working on OpenSCAD Assistive Forge.

## Setup

```bash
git clone https://github.com/BrennenJohnston/openscad-assistive-forge.git
cd openscad-assistive-forge
npm install

# First time only:
npm run setup-wasm        # downloads OpenSCAD WASM (~15-30MB)
npm run setup-libraries   # downloads OpenSCAD libraries
npx playwright install    # for E2E tests
```

## Common commands

```bash
npm run dev              # dev server at http://localhost:5173
npm run build            # production build
npm run preview          # preview production build

npm run lint             # ESLint check
npm run test:run         # unit tests (Vitest)
npm run test:e2e         # E2E tests (Playwright)
npm run check-a11y       # accessibility audit (Lighthouse)
```

## Project structure

```
src/
  main.js              Entry point
  js/                  Core modules (parser, ui-generator, preview, etc.)
  styles/              CSS
  worker/              OpenSCAD WASM worker
public/
  sw.js                Service worker
  examples/            Example .scad files
  wasm/                OpenSCAD WASM (downloaded)
tests/
  unit/                Vitest tests
  e2e/                 Playwright tests
docs/                  Documentation
```

## Architecture

No backend. Everything runs in the browser:

1. Load `.scad` file -> parser extracts Customizer annotations
2. UI generator builds form controls from the parsed parameters
3. User changes a parameter -> state updates -> worker runs OpenSCAD
4. Worker returns STL bytes -> Three.js displays the preview
5. Export downloads the STL/OBJ/AMF/3MF/OFF

The worker isolates OpenSCAD WASM so the UI stays responsive.

## Testing

Unit tests (`tests/unit/`) cover the parser, validation, UI generation, and utilities. E2E tests (`tests/e2e/`) cover full workflows: file upload, rendering, export, accessibility.

E2E tests can timeout on Windows. Use `npm run test:e2e` which has timeout protection. See `TROUBLESHOOTING.md` if things hang.

## Before submitting a PR

```bash
npm run lint
npm run test:run
npm run test:e2e
npm run build
```

Test manually in the browser. Check keyboard navigation and screen reader announcements if you changed UI.

## Common issues

WASM not loading: run `npm run setup-wasm`

Tests failing after dependency changes: delete `node_modules` and `package-lock.json`, reinstall.

E2E tests hanging: see `TROUBLESHOOTING.md` for Windows-specific workarounds.

Service worker not updating: in browser console, unregister all service workers and hard refresh.

## Useful links

- Live demo: https://openscad-assistive-forge.pages.dev/
- OpenSCAD docs: https://openscad.org/documentation.html
- Three.js docs: https://threejs.org/docs/
- Vite docs: https://vitejs.dev/
