# KI-012 WASM Input Capture Protocol

> **Purpose:** Capture the exact inputs that the WASM OpenSCAD engine receives
> for three conditions (baseline, Bug A, Bug B) so they can be replayed on
> desktop OpenSCAD and the official WASM Playground in later phases.
>
> **Prerequisite:** Phase 1 capture tool (`captureWasmInputs`) is implemented
> in `src/main.js` and available at `window.__forgeDebug.captureWasmInputs()`.
>
> **Date:** 2026-04-04
> **Investigation:** KI-012 — LWFL Keyguard Geometry Discrepancies

---

## Prerequisites

| Item | Details |
|------|---------|
| Dev server | `pixi run dev` (or `npm run dev`) — note the port in the terminal output |
| Keyguard project | See "Fixture note" below |
| Browser | Chrome or Edge with DevTools accessible (F12) |
| Debug toggles | All toggles should be in their **default (off)** state before capture |

### Fixture note

The `.volkswitch/keyguard-test-bundle.zip` contains only 4 presets (Grid 30,
TouchChat 45, Proloquo 20, LAMP WFL84) — **none of which include the LWFL
preset** needed to reproduce Bug A and Bug B. The full stakeholder project is
required instead.

**Recommended approach:** Load the unzipped full project folder (e.g.,
`ready_to_print_designs/`) via the app's folder upload. The full ZIP may fail
to load depending on file size; the unzipped folder works reliably.

The LWFL preset name is **"iPad 7,8,9 - Fintie - LWFL"**.

### Verify clean toggle state

Before starting, open the browser console and confirm no debug toggles are
active:

```js
__forgeDebug.getToggles()
```

Expected output — all three should be `false`:

```
csgBypass: false
sourceOverrides: false
desktopQuality: false
```

If any are `true`, clear them:

```js
__forgeDebug.toggleCsgBypass(false)
__forgeDebug.toggleSourceOverrides(false)
__forgeDebug.toggleDesktopQuality(false)
```

---

## Bug Definitions

### Bug A — Home button tab persists when disabled

| Parameter | Value |
|-----------|-------|
| `expose_home_button` | `"no"` |

**Expected (desktop):** Right edge is a straight line along the Y-axis.
**Actual (web):** A tab juts out where the home button cutout would be.

### Bug B — Ghost cutouts when upper message bar disabled

| Parameter | Value |
|-----------|-------|
| `expose_upper_message_bar` | `"no"` |

**Expected (desktop):** Solid surface above grid positions #1 and #12.
**Actual (web):** Partially rendered square cutouts / notched angles in both
corners.

---

## Capture Procedure

### Capture 1 of 3: Baseline (no bugs)

This capture provides a reference render where both bug-triggering parameters
are at their default values.

1. **Load the full keyguard project.** Upload the unzipped stakeholder project
   folder (e.g., `ready_to_print_designs/`) via the app's folder upload.
   The `.volkswitch/keyguard-test-bundle.zip` does **not** contain the LWFL
   preset — use the full project instead.

2. **Select the LWFL preset.** From the preset dropdown, choose
   **"iPad 7,8,9 - Fintie - LWFL"**. Wait for the preset to load and
   parameters to populate.

3. **Verify default parameter values.** In the customizer panel, confirm:
   - `expose_home_button` = `"yes"` (default)
   - `expose_upper_message_bar` = `"yes"` (default)

4. **Wait for any auto-preview render to complete.** Look for the 3D preview
   to update and check the console for render-complete messages.

5. **Capture WASM inputs.** In the browser console, run:

   ```js
   await __forgeDebug.captureWasmInputs()
   ```

   This triggers a full-quality STL render and downloads a ZIP file named
   `wasm-capture-<timestamp>.zip`.

6. **Rename the ZIP** to `baseline-capture.zip`.

7. **Verify ZIP contents.** Extract and confirm the following files are present:
   - `scad-source.scad` — the main SCAD file
   - `companion-files/` — directory with companion file(s)
     (e.g., `openings_and_additions.txt`)
   - `callmain-args.json` — the exact `callMain()` arguments
   - `metadata.json` — parameters, toggles, capabilities, timing
   - `run-desktop.sh` — bash script for desktop CLI reproduction
   - `run-desktop.ps1` — PowerShell script for desktop CLI reproduction

8. **Spot-check `metadata.json`.** Open it and verify:
   - `parameters.expose_home_button` is `"yes"`
   - `parameters.expose_upper_message_bar` is `"yes"`
   - `toggles.csgBypass` is `false`
   - `toggles.sourceOverrides` is `false`
   - `stats.triangles` is a non-zero number

### Capture 2 of 3: Bug A (home button tab)

1. **Starting from the baseline state** (same preset still loaded), change
   the `expose_home_button` parameter to `"no"` in the customizer panel.

2. **Wait for auto-preview to complete** (~800ms debounce + render time).
   Visually confirm Bug A is visible: a tab jutting out along the right edge
   where the home button cutout would be.

3. **Capture WASM inputs:**

   ```js
   await __forgeDebug.captureWasmInputs()
   ```

4. **Rename the ZIP** to `bug-a-capture.zip`.

5. **Verify `metadata.json`:**
   - `parameters.expose_home_button` is `"no"`
   - `parameters.expose_upper_message_bar` is `"yes"`
   - `stats.triangles` is non-zero

### Capture 3 of 3: Bug B (ghost cutouts)

1. **Reset `expose_home_button` back to `"yes"`.**

2. **Change `expose_upper_message_bar` to `"no"`.**

3. **Wait for auto-preview to complete.** Visually confirm Bug B is visible:
   partial square cutouts / notched angles near grid positions #1 and #12.

4. **Capture WASM inputs:**

   ```js
   await __forgeDebug.captureWasmInputs()
   ```

5. **Rename the ZIP** to `bug-b-capture.zip`.

6. **Verify `metadata.json`:**
   - `parameters.expose_home_button` is `"yes"`
   - `parameters.expose_upper_message_bar` is `"no"`
   - `stats.triangles` is non-zero

---

## Post-Capture Verification Checklist

After all three captures, verify the complete set:

| File | Parameter State | Expected Visual |
|------|----------------|-----------------|
| `baseline-capture.zip` | both `"yes"` | Normal keyguard, no geometry artifacts |
| `bug-a-capture.zip` | `expose_home_button = "no"` | Tab on right edge (Bug A visible) |
| `bug-b-capture.zip` | `expose_upper_message_bar = "no"` | Cutouts near #1 and #12 (Bug B visible) |

### Cross-bundle consistency checks

1. **Same SCAD source across all three.** Diff `scad-source.scad` from each
   ZIP — they should be identical (the SCAD source doesn't change; only `-D`
   parameter values differ).

2. **Different `-D` args.** Compare `callmain-args.json` across the three ZIPs.
   The only difference should be the `-D` flag for the changed parameter.

3. **Same companion files.** The `companion-files/` directory contents should
   be identical across all three ZIPs.

4. **Triangle count variation.** Bug conditions may produce slightly different
   triangle counts due to different boolean operations being computed. Record
   the triangle counts from each `metadata.json` for reference:

   | Bundle | Triangles | Size (bytes) |
   |--------|-----------|-------------|
   | Baseline | _____  | _____ |
   | Bug A    | _____  | _____ |
   | Bug B    | _____  | _____ |

---

## File Storage

Save all three ZIPs to:

```
docs/audit/ki-012-investigation/
├── baseline-capture.zip
├── bug-a-capture.zip
├── bug-b-capture.zip
└── capture-protocol.md    (this file)
```

> **Note:** The ZIP files contain the stakeholder's SCAD source and are
> `.gitignored` via the existing rule for binary/generated artifacts. If they
> need to be shared, use a secure out-of-band channel.

---

## Troubleshooting

### `captureWasmInputs()` returns `null`

- **"Render controller not ready"** — The WASM engine hasn't initialized yet.
  Wait for the console to show WASM initialization complete, then retry.
- **"No model loaded"** — No file has been uploaded. Load the keyguard bundle
  first.

### ZIP downloads but is missing companion files

- The companion file directory is empty if `state.projectFiles` has only the
  main SCAD file. This would indicate the companion file
  (`openings_and_additions.txt`) was not loaded from the ZIP bundle. Re-upload
  the bundle and verify the console shows companion file detection.

### Render fails or returns 0 triangles

- Check the console for OpenSCAD error messages. A compile error in the SCAD
  source or missing companion file would cause this.
- Verify the preset was fully loaded (all parameters populated in the
  customizer panel).

### Wrong parameters in metadata

- The capture tool reads parameters from `stateManager.getState().parameters`.
  If a parameter change hasn't propagated yet (auto-preview debounce is 800ms),
  wait a moment and re-capture.

---

## Next Steps

After completing all three captures, proceed to:

- **Phase 3 (Desktop CLI Comparison):** Use the `run-desktop.sh` /
  `run-desktop.ps1` scripts from each ZIP to render on desktop OpenSCAD and
  compare geometry.
- **Phase 4 (WASM Playground Comparison):** Load `scad-source.scad` and
  companion files in the official OpenSCAD WASM Playground.
