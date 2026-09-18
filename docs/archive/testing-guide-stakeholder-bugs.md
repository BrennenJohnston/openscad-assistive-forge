# Testing Guide: Stakeholder Bug Fixes

Verification steps for the 7 fixes applied to bugs 1, 3, 4, and 5.

> **Prerequisites**: Run `npm run dev` to start the Vite dev server, then open the app in a browser. Open DevTools console (F12) throughout all tests.

---

## Phase 1: Unit Tests (automated)

Run the existing unit test suite first to confirm nothing is broken, then add targeted regression tests.

```bash
npm run test:run
```

### 1A. New unit test: schema unwrapping in analyzePresetCompatibility

Open `tests/unit/preset-manager.test.js` and verify or add these cases inside the `analyzePresetCompatibility` describe block:

**Test case: full schema object with `.parameters` wrapper**

```javascript
it('unwraps schema.parameters when passed a full schema object', () => {
  const preset = { width: 100, height: 50 }
  const fullSchema = {
    parameters: { width: { type: 'number' }, height: { type: 'number' } },
    groups: ['Settings'],
    hiddenParameters: { $fn: { type: 'number' } },
    libraries: ['BOSL2']
  }
  const result = presetManager.analyzePresetCompatibility(preset, fullSchema)
  expect(result.isCompatible).toBe(true)
  expect(result.extraParams).toEqual([])
  expect(result.missingParams).toEqual([])
  // Critically: groups, hiddenParameters, libraries must NOT appear as missing params
})
```

**Test case: hidden parameter filtering**

```javascript
it('excludes hidden parameters from comparison', () => {
  const preset = { width: 100 }
  const schema = { width: { type: 'number' }, $fn: { type: 'number' } }
  const result = presetManager.analyzePresetCompatibility(preset, schema, ['$fn'])
  expect(result.isCompatible).toBe(true)
  expect(result.missingParams).not.toContain('$fn')
})
```

Run:

```bash
npm run test:run -- tests/unit/preset-manager.test.js
```

**Pass criteria**: All existing tests pass. The two new tests pass. No `groups`, `parameters`, `hiddenParameters`, or `libraries` appear in `extraParams` or `missingParams` when a full schema object is supplied.

---

## Phase 2: Manual Browser Testing

### Test 2A: Bug 1 -- Console warnings for missing companion files

**What was fixed**: Synthetic WARNING messages now appear in the Console panel for missing companion files, and the ERROR-path console output forwarding from the WASM worker is fixed.

**Steps**:

1. Open the app in the browser.
2. Upload the `keyguard_demo.scad` file from `public/examples/keyguard-demo/` -- but do **NOT** upload `openings_and_additions.txt`.
3. Look at the **Companion Files** panel. Confirm it shows `openings_and_additions.txt` as "Missing."
4. Expand the **Console** panel (click the console badge or the panel header).
5. Ensure the **Warnings** filter checkbox is checked.

**Pass criteria**:
- [ ] A line reading `WARNING: Can't open include file 'openings_and_additions.txt'.` appears in the Console panel.
- [ ] The console badge increments when the warning is emitted.
- [ ] Unchecking the "Warnings" filter hides the line; re-checking shows it.

**DevTools verification**: In the browser console, confirm no errors in the render-controller CONSOLE handler. You should see `[App]` log lines related to updateProjectFilesUI.

---

### Test 2B: Bug 1 -- ERROR path console output forwarding

**Steps**:

1. Upload a SCAD file that uses `include <nonexistent_file.scad>` as an actual include statement (not a variable assignment). You can create a minimal test file:
   ```scad
   include <this_file_does_not_exist.scad>
   cube(10);
   ```
2. Trigger a render (Preview or Generate).
3. Check the Console panel.

**Pass criteria**:
- [ ] If the WASM engine produces any WARNING or ERROR output before failing, it appears in the Console panel (not silently swallowed).
- [ ] In DevTools, confirm the ERROR message payload now has a `consoleOutput` field (look for `[RenderController]` or `[OpenSCAD ERR]` log lines).

---

### Test 2C: Bug 3 -- include_screenshot wiring to overlay

**What was fixed**: The `include_screenshot` SCAD parameter now controls overlay visibility.

**Prerequisite**: You need a SCAD file that declares the `include_screenshot` parameter. Create a test file:

```scad
/* [Display] */
include_screenshot = "no"; // [yes, no]
screenshot_file = "test_screenshot.png";

cube(10);
```

**Steps**:

1. Upload the test SCAD file above.
2. Upload an image file (PNG, SVG, or JPG) as a companion file, named `test_screenshot.png`.
3. In the parameter panel, find the **Display** group and the `include_screenshot` dropdown.
4. Set `include_screenshot` to **"yes"**.

**Pass criteria**:
- [ ] The overlay toggle in the preview area automatically turns ON.
- [ ] The overlay source dropdown shows `test_screenshot.png` as selected.
- [ ] The uploaded image appears as a semi-transparent overlay on the 3D preview.
- [ ] Setting `include_screenshot` back to **"no"** turns the overlay OFF.
- [ ] The overlay toggle unchecks and the image disappears from the preview.

**Edge case**: Load a preset that has `include_screenshot: "yes"`. The overlay should activate immediately after preset load.

---

### Test 2D: Bug 4 -- Imported preset auto-selection

**What was fixed**: After importing a preset, the dropdown now auto-selects the last imported preset.

**Steps**:

1. Upload any SCAD file (e.g., `keyguard_demo.scad`).
2. Customize a few parameters (change width, height, etc.).
3. Create a preset via the **+** button. Name it "Test Export Preset".
4. Open the **Manage Designs** modal.
5. Click **Export** on "Test Export Preset". Save the JSON file.
6. Delete "Test Export Preset" from the list.
7. Close the modal.
8. Open the **Manage Designs** modal again.
9. Click **Import** and select the JSON file you exported in step 5.
10. After the import success alert, check the preset dropdown.

**Pass criteria**:
- [ ] The success alert shows "Imported 1 design".
- [ ] The preset dropdown now shows "Test Export Preset" as the selected item (not "-- Select Design --").
- [ ] The parameter values from the preset are applied to the customizer.
- [ ] In DevTools, confirm a `[Preset] Setting selection:` log with the imported preset's ID.

---

### Test 2E: Bug 5 -- Preset compatibility warning (correct behavior)

**What was fixed**: The compatibility check is re-enabled and no longer treats schema structural keys as parameters.

**Steps**:

1. Upload `keyguard_demo.scad`.
2. Create a preset with the current parameters. Name it "Compat Test".
3. Now modify the SCAD source to add a new parameter. Create a modified version:
   ```scad
   /* [New Section] */
   new_feature_param = 42; // [0:1:100]
   ```
   Upload the modified file.
4. Select "Compat Test" from the preset dropdown.

**Pass criteria**:
- [ ] A compatibility warning dialog appears.
- [ ] The dialog lists `new_feature_param` as a **"New parameter"** (in the current file but not in the preset).
- [ ] The dialog does **NOT** list `groups`, `parameters`, `hiddenParameters`, or `libraries` as new or obsolete.
- [ ] Clicking **"Apply Anyway"** loads the preset. Clicking **"Cancel"** does nothing.
- [ ] The count of "obsolete" and "new" parameters is reasonable (1-2, not 213).

**Regression check**: Select a preset that was created with the same file version -- NO compatibility warning should appear.

---

### Test 2F: Bug 5 -- Compatible preset loads silently

**Steps**:

1. Upload `keyguard_demo.scad`.
2. Create a preset. Name it "Full Match".
3. Change some parameters manually.
4. Select "Full Match" from the dropdown.

**Pass criteria**:
- [ ] No compatibility warning dialog appears (all parameters match).
- [ ] The preset loads and parameters revert to the saved values.
- [ ] Status bar shows "Loaded preset: Full Match".

---

## Phase 3: DevTools Console Verification

Open DevTools (F12) throughout all tests and check for:

| Check | What to look for |
|---|---|
| No new errors | No uncaught exceptions or red errors in the console |
| CONSOLE handler fires | When WASM emits warnings, look for `updateConsoleOutput` being called |
| ERROR payload shape | On render failure, check the ERROR message has `consoleOutput` field |
| Overlay sync logs | When toggling `include_screenshot`, look for `[App] Overlay enable via include_screenshot` |
| Preset selection logs | After import, look for `[Preset] Setting selection:` with correct ID |

---

## Phase 4: Existing E2E Tests (non-regression)

Run the existing E2E test suite to confirm no regressions:

```bash
npx playwright test tests/e2e/preset-workflow.spec.js
npx playwright test tests/e2e/project-files.spec.js
npx playwright test tests/e2e/keyguard-workflow.spec.js
npx playwright test tests/e2e/basic-workflow.spec.js
```

**Pass criteria**: All existing tests pass. If any fail, check whether the failure is related to the changes or was pre-existing.

---

## Quick Reference: Files Changed

| File | Changes |
|---|---|
| `src/js/render-controller.js` | Fixed CONSOLE field mismatch; added consoleOutput forwarding in ERROR handler |
| `src/worker/openscad-worker.js` | Added `consoleOutput` field to ERROR payload |
| `src/main.js` | Synthetic warnings; `syncOverlayWithScreenshotParam`; import auto-select; re-enabled compatibility check |
| `src/js/preset-manager.js` | Schema unwrapping in `analyzePresetCompatibility` |
