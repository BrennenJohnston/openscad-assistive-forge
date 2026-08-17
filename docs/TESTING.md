# Testing

This repo has unit tests (Vitest) and browser tests (Playwright). Most of the time, you only need a couple commands.

## Quick start

```bash
# Unit tests
npm run test:run

# E2E tests
npm run test:e2e
```

If you want the interactive runners:

```bash
npm run test:ui
npm run test:e2e:ui
```

## Where the tests live

| Path | What it is | How to run it |
|---|---|---|
| `tests/unit/*.test.js` | Vitest. 108 files, 3,957 tests as of 2026-08-16 | `npm run test:run` |
| `tests/e2e/*.spec.js` | Playwright against the dev server | `npm run test:e2e` |
| `tests/e2e-prod/*.spec.js` | Playwright against the **built** app under the deployed Content Security Policy | `npm run test:e2e:prod` |
| `tests/visual/*.visual.spec.js` | Screenshot comparison, baselines per platform | `npm run test:visual` |
| `scripts/parity/` | Geometry comparison against desktop OpenSCAD | `npm run parity` |
| `tests/fixtures/` | Models and data the tests use | -- |

The production lane exists because styling that works in the dev server can be
refused by the real policy. Anything touching CSS, the editor, or the Content
Security Policy should run `npm run test:e2e:prod` as well.

Harness files that live under `build/` must be named `*.pwalk.js`, not
`*.spec.js` -- Vitest picks up `build/*.spec.js` and tries to run it.

## Troubleshooting

### Playwright can’t find browsers

```bash
npx playwright install
```

### E2E feels flaky locally

- Try `npm run test:e2e:ui` and rerun the single test while watching the page.
- If you’re on Windows and things hang, see `docs/TROUBLESHOOTING.md`.

## Coverage (optional)

```bash
npm run test:coverage
```

This writes an HTML report into `coverage/`.

## Manual testing protocol

Some features cannot be reliably automated. Follow these steps with DevTools open (F12).

### Cache Clear (Item 6)

1. Load the app, upload a model (or load an example), verify it renders.
2. Open DevTools **Network** tab.
3. Click "Clear Cache" in settings.
4. **Expected:** Page reloads within 5 seconds. No frozen tab, no hung fetch requests.
5. After reload, verify the app is functional: upload a file again, confirm parameters appear.

**Debug tips:**

- If the page freezes, check the Network tab for pending requests.
- Check the Console for service worker errors (`[SW]` prefixed messages).
- If stuck, try `navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()))` in the console, then hard-refresh.

### Direct Launch Link (Item 7)

Requires a publicly hosted file for full testing.

1. Host a test `.zip` bundle on a CORS-enabled server (GitHub raw URL, Cloudflare R2, etc.).
2. Navigate to: `http://localhost:5173/?project=<hosted-url>`
3. **Expected:** ZIP downloads automatically, model loads, presets appear in dropdown.
4. Check the console for CORS errors or fetch failures.
5. Test with an invalid URL: `http://localhost:5173/?project=https://invalid.example.com/x.zip`
6. **Expected:** A clear error message displayed, no crash, no blank screen.

For local-only testing without a server:

1. Navigate to `http://localhost:5173/?scad=<url-to-scad-file>` with a publicly accessible `.scad` file.
2. Verify the file downloads and parameters appear.

### Multi-File Project Walkthrough (Clinician Flow)

This replicates the end-to-end workflow for a multi-file SCAD project with presets:

1. Upload a project ZIP that includes a `.scad` file, companion files, and a presets `.json`.
2. Verify the preset dropdown shows "design default values" first, plus the imported presets.
3. Select a named preset from the dropdown.
4. Modify a numeric parameter by typing an exact value (e.g., `7`) into the spinbox.
5. Verify the spinbox accepts the exact value without rounding to a slider step.
6. Click "Preview" / wait for auto-preview and verify the 3D preview updates.
7. Click Save (or Add Preset) to preserve the modification.
8. Select a different preset, then re-select the original.
9. Verify the modified value persisted.
10. Click "Import / Export" and then "Export All Presets".
11. Open the exported JSON and verify:
    - `fileFormatVersion: "1"` is present.
    - `"design default values": {}` is the first key in `parameterSets`.
    - Modified preset values match what you saved.

### Regression checklist

After any changes, verify:

- [ ] `npm run test:run` -- all unit tests pass (108 files, 3,957 tests).
- [ ] `npm run test:e2e` -- E2E tests pass on Chromium.
- [ ] Vector parameter widgets still render correctly.
- [ ] Expert Mode toggle (Ctrl+E) is functional.
- [ ] Share link generation and loading works.
- [ ] `npx playwright test tests/e2e/accessibility.spec.js` -- axe-core passes.
- [ ] `npm run build && npm run check-bundle` -- budgets met.

Measured 2026-08-16: core app **475 KB** gzipped against a 500 KB budget, main
CSS 58 KB against 150 KB, all assets 844 KB against 1 MB. The core app is at
95% of its budget, so a new dependency is a real decision rather than a
formality.

---

## Known Parity Gaps (Forge vs Desktop OpenSCAD)

These are known differences between Forge's WASM-based rendering and the desktop OpenSCAD application:

| Feature | Desktop | Forge (WASM) | Notes |
|---------|---------|-------------|-------|
| **Animations (`$t`)** | Supported | Supported, but slower | The Animate panel sets `$t` per frame and re-renders for real. A WASM render takes 0.3 to 10 seconds, so the frame rate you ask for is a ceiling, not a promise -- playback renders a frame, then waits out whatever is left of the budget |
| **Text rendering** | Uses system fonts | Requires bundled fonts | Only the Liberation family is bundled; other fonts are unavailable |
| **OpenSCAD version** | Latest release | 2026.04.03 official WASM build, with Manifold | Vendored in `public/wasm/openscad-official/`; see its `README.txt` for how to update |
| **Performance** | Native speed | Slower for complex models | Models with >100K faces may be significantly slower in WASM |
| **File access** | Full filesystem | Upload/URL only | No direct filesystem access; all files must be uploaded or fetched via URL |
| **Customizer GUI** | Native Qt widgets | HTML form controls | Behavior should match, but rendering differs |
| **Library support** | Full MCAD/BOSL2 | Bundled subset | Libraries must be included in the WASM filesystem |

These gaps are documented to set expectations. They do not represent bugs unless desktop parity is explicitly planned.
