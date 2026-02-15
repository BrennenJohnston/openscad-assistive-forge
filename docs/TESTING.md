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

Unit tests:

`tests/unit/*.test.js`

E2E tests:

`tests/e2e/*.spec.js`

Fixtures used by tests:

`tests/fixtures/`

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

## Stakeholder manual testing protocol

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

1. Host `keyguard-test-bundle.zip` on a CORS-enabled server (GitHub raw URL, Cloudflare R2, etc.).
2. Navigate to: `http://localhost:5173/?project=<hosted-url>`
3. **Expected:** ZIP downloads automatically, model loads, presets appear in dropdown.
4. Check the console for CORS errors or fetch failures.
5. Test with an invalid URL: `http://localhost:5173/?project=https://invalid.example.com/x.zip`
6. **Expected:** A clear error message displayed, no crash, no blank screen.

For local-only testing without a server:

1. Navigate to `http://localhost:5173/?scad=<url-to-scad-file>` with a publicly accessible `.scad` file.
2. Verify the file downloads and parameters appear.

### Keyguard Workflow Walkthrough (Volkswitch Clinician Flow)

This replicates the exact workflow Ken's clinicians follow:

1. Upload the keyguard ZIP (`.volkswitch/keyguard-test-bundle.zip`).
2. Verify the preset dropdown shows "design default values" first, plus the imported presets.
3. Select "iPad 9 - LTROP - TouchChat 45" from the dropdown.
4. Modify `number_of_rows` by typing an exact value (e.g., `7`) into the spinbox.
5. Verify the spinbox accepts the exact value without rounding to a slider step.
6. Click "Preview" / wait for auto-preview and verify the 3D preview updates.
7. Click Save (or Add Preset) to preserve the modification.
8. Select a different preset, then re-select the original.
9. Verify the modified `number_of_rows` value persisted.
10. Click "Import / Export" and then "Export All Presets".
11. Open the exported JSON and verify:
    - `fileFormatVersion: "1"` is present.
    - `"design default values": {}` is the first key in `parameterSets`.
    - Modified preset values match what you saved.

### Regression checklist

After any changes, verify:

- [ ] `npm run test:run` -- all unit tests pass (1184+).
- [ ] `npm run test:e2e` -- E2E tests pass on Chromium.
- [ ] Vector parameter widgets still render correctly.
- [ ] Expert Mode toggle (Ctrl+E) is functional.
- [ ] Share link generation and loading works.
- [ ] `npx playwright test tests/e2e/accessibility.spec.js` -- axe-core passes.
- [ ] Bundle size is within the 153KB gzipped budget (`npm run build` and check dist).
