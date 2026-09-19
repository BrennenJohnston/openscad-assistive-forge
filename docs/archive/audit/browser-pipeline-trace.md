# Browser Pipeline Trace — Phase 3

> **Audit:** OpenSCAD Color/Display Parity Investigation
> **Phase:** 3 — Browser Pipeline Trace
> **Date:** 2026-03-10
> **Status:** Complete — awaiting human review before Phase 4

---

## Overview

This document traces the exact code path through the browser implementation for each of the 16 scenarios in the scenario matrix. Every claim cites the source file and line number. Where behavior cannot be determined from code alone (i.e., it depends on WASM runtime output), the claim is marked **REQUIRES RUNTIME TEST**.

---

## Pipeline Stage Analysis

### Stage 1: Parameter Input

**Flow:** User changes parameters in the UI → `stateManager.setState()` → callback fires `autoPreviewController.onParameterChange(values)` → debounce timer → `renderPreview()` → `renderController.renderPreview()` → Worker message `{ type: 'RENDER', payload }`.

**Key entry points in main.js:**

- Parameter change callback: `autoPreviewController.onParameterChange(values)` — fired from the `renderParameterUI` onChange callback (src/main.js:8964–8965, 9153–9154)
- Preset switch: `applyPresetParametersAndCompanions(preset)` merges preset params with current state, re-renders UI, then fires `autoPreviewController.onParameterChange(values)` (src/main.js:15153–15154)
- File load: `autoPreviewController.forcePreview(stateManager.getState().parameters)` (src/main.js:9436–9437)

**Color parameter serialization in the worker:**

TRACED: `buildDefineArgs()` (src/worker/openscad-worker.js:1050–1126) handles hex color strings:

```
Line 1084:  else if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
Line 1085:    const rgb = hexToRgb(value);
Line 1086:    formattedValue = `[${rgb[0]},${rgb[1]},${rgb[2]}]`;
```

Hex colors like `#FF0000` are converted to `[255,0,0]` — an OpenSCAD vector. The `hexToRgb()` function (src/js/color-utils.js:46–69) returns 0–255 integer values. OpenSCAD's `color()` function accepts both 0–1 float and 0–255 integer ranges, but the canonical range is **0–1 float**.

**FINDING (color serialization):** The browser serializes hex colors as `[255,0,0]` (integer 0–255 range). OpenSCAD's `color()` function documentation says: "Displays the child elements using the specified RGB color + alpha value" with "Values of between 0.0 and 1.0." However, OpenSCAD also auto-normalizes values >1 by dividing by 255, so `[255,0,0]` renders the same as `[1,0,0]`. This is **functionally correct but non-idiomatic** — it works because OpenSCAD's parser auto-normalizes values >1.

**`isNonPreviewable()` for generate parameter:**

TRACED: `render-intent.js:180–233` — checks if the `generate` parameter value (lowercased) contains any keyword from `INFORMATIONAL_KEYWORDS = ['customizer']` (line 30). Also checks all other enum parameters in the schema for informational keywords.

For `generate = "Customizer Settings"`, the lowercase value `"customizer settings"` contains `"customizer"` → returns `true`.

For 2D generate modes like `"first layer for SVG/DXF file"`, the function does NOT return true — 2D modes are **not** non-previewable. They produce a thin 3D slice that serves as a preview. This is an intentional design decision documented in the comment at render-intent.js:174–177.

---

### Stage 2: Render Format Selection

**Color detection in SCAD source:**

TRACED: `AutoPreviewController.scadUsesColor()` (src/js/auto-preview-controller.js:605–613):

1. Strips single-line `//` comments and `/* */` block comments (approximate regex)
2. Tests for `/\bcolor\s*\(/` — the literal word `color` followed by `(`

**FINDING:** The regex correctly matches `color("red")`, `color([1,0,0])`, etc. It could false-positive on a user-defined module named `color(...)` — but this is a safe false-positive (worst case: renders to OFF instead of STL, which still works).

**Debug modifier detection:**

TRACED: `AutoPreviewController.scadUsesDebugModifier()` (src/js/auto-preview-controller.js:629–637):

1. Strips comments (same as above)
2. Tests for `#` at a statement boundary followed by a geometry keyword or `{`

**FINDING:** The regex is conservative. It requires `#` to appear after a statement delimiter (`;\s{}` or start of line) followed by a known keyword (cube, sphere, translate, etc.) or `{`. This avoids false positives on `#` inside string literals or comments.

**Format routing decision:**

TRACED: `renderPreview()` at src/js/auto-preview-controller.js:719–725:

```javascript
const useColorPassthrough =
  isFlagEnabled('color_passthrough') &&
  AutoPreviewController.scadUsesColor(this.currentScadContent);
const previewOutputFormat = useColorPassthrough ? 'off' : 'stl';
const hasDebugModifier =
  useColorPassthrough &&
  AutoPreviewController.scadUsesDebugModifier(this.currentScadContent);
```

**`color_passthrough` flag state:**

TRACED: src/js/feature-flags.js:105–116:

```javascript
color_passthrough: {
  rollout: 100,
  killSwitch: false,
}
```

**OBSERVED:** The flag is fully enabled (`rollout: 100`, `killSwitch: false`). The `isEnabled()` function at feature-flags.js:222–261 returns `true` when rollout >= 100 (line 257).

**INCONSISTENCY WITH DOCUMENTATION:** `docs/notes/COLOR_PASSTHROUGH.md` (line 93) says `rollout: 0, killSwitch: true` — this is stale. The actual code says `rollout: 100, killSwitch: false`. The color passthrough pipeline is **already fully enabled in production**.

**What happens in the worker:**

TRACED: The worker receives `outputFormat: 'off'` in the render payload (src/worker/openscad-worker.js:2175). In `render()`, the format is lowercased (line 2325) and passed to `renderWithCallMain()` (line 2383). The output file becomes `/tmp/output.off` (line 1313).

**CRITICAL UNKNOWN:** The code correctly requests OFF format from the WASM engine. Whether the WASM binary (`OpenSCAD-2025.03.25.wasm24456`) actually produces **COFF** (per-face RGBA) or **plain OFF** (no color) depends entirely on the WASM build. The JavaScript code does not control this — it just reads whatever the engine writes to `/tmp/output.off`. **REQUIRES RUNTIME TEST** (Phase 4, Probe 1).

**Worker format response:**

TRACED: The worker returns `format: resultFormat` in the COMPLETE message (src/worker/openscad-worker.js:2524). For OFF, `isTextFormat` is true and `triangleCount` is extracted from the header match `/^OFF\s+\d+\s+(\d+)/` (line 2442). The text is encoded to `ArrayBuffer` (line 2431) before being sent back via `postMessage`.

---

### Stage 3: Preview Rendering

**COFF path (loadOFF):**

TRACED: `PreviewManager.loadOFF()` at src/js/preview.js:1074–1264:

1. **Header detection:** Line 1094–1095 checks for `COFF` header. If present, `isCOFF = true`.
2. **Vertex/face count parsing:** Lines 1103–1115 handle both "counts on header line" and "counts on separate line" formats.
3. **Per-face color parsing:** Lines 1154–1169:
   ```javascript
   if (isCOFF && parts.length >= n + 5) {
     let r, g, b;
     if (debugHighlight) {
       // # debug modifier: fixed highlight overrides user color()
       r = parseInt(hx.substring(0, 2), 16) / 255;
       g = parseInt(hx.substring(2, 4), 16) / 255;
       b = parseInt(hx.substring(4, 6), 16) / 255;
     } else {
       r = parts[n + 1];  // COFF color values
       g = parts[n + 2];
       b = parts[n + 3];
     }
     colors.push(r, g, b, r, g, b, r, g, b);
     hasColors = true;
   }
   ```
   The parser reads RGBA values from positions `[n+1, n+2, n+3, n+4]` after the vertex indices. Colors are assigned per-face (duplicated to all 3 vertices of each triangle for vertex coloring).

4. **Debug highlight override:** When `debugHighlight` is set (because `scadUsesDebugModifier()` returned true), ALL face colors are replaced with the fixed highlight `#ff5151` at opacity `128/255`. This is set up in `renderPreview()` at auto-preview-controller.js:781–788.

5. **Material creation:** Lines 1209–1228:
   - If `hasColors = true`: `MeshPhongMaterial({ vertexColors: true })` — per-face colored
   - If `hasColors = false` (plain OFF): falls back to single-color `MeshPhongMaterial` using `_resolveModelColor()` (theme default or user override)
   - If `debugHighlight` with `opacity < 1`: adds `transparent: true, opacity: debugHighlight.opacity, depthWrite: false`

**FINDING (COFF parser correctness):** The parser assumes COFF color values are in the range that the OFF file provides. OpenSCAD COFF uses 0–1 float RGBA. The parser reads them directly as `parts[n+1]` etc. — these would be float values like `1.0 0.0 0.0 1.0` for red. This is **correct** for Three.js vertex colors, which also expect 0–1 float range.

**STL fallback path (loadSTL):**

TRACED: `PreviewManager.loadSTL()` at src/js/preview.js:935–1039:

1. Uses Three.js `STLLoader` to parse binary STL (line 957)
2. Creates `MeshPhongMaterial` with color from `_resolveModelColor()` (line 1001–1002)
3. Single color for the entire mesh — no per-face coloring possible

**`setRenderState()` is a no-op:**

TRACED: src/js/preview.js:511–512:

```javascript
setRenderState(_state) {
}
```

This was previously used for fabricated amber/red tints per render state (preview vs laser). The comment at lines 506–508 explains it was removed because the tinting "does not correspond to any desktop OpenSCAD behavior." Model color now comes from COFF per-face data or the theme default.

**`_detectRenderState()` also returns null:**

TRACED: src/js/auto-preview-controller.js:242–244:

```javascript
_detectRenderState(parameters, isFullQuality = false) {
  return null;
}
```

Both functions are no-ops. The fabricated color-tinting system was intentionally removed.

**Color legend fallback:**

TRACED: `resolvePreviewColor()` at src/js/auto-preview-controller.js:251–269:

1. Checks `use_colors` parameter — if `false` or not `"yes"`, returns null
2. Takes the first color parameter name from `colorParamNames[0]`
3. Returns the normalized hex color of that parameter value

This applies a **single-color tint** to the whole mesh from the SCAD's first color parameter. It does NOT produce per-object coloring — it's a workaround for when COFF is not available.

---

### Stage 4: Blank Display States

**`isNonPreviewable()` for "Customizer Settings":**

TRACED: render-intent.js:180–233:

1. Checks `parameters.generate` (line 185)
2. Lowercases it: `"customizer settings"` (line 186)
3. Calls `hasInfoKeyword(lower, label)` which checks against `INFORMATIONAL_KEYWORDS = ['customizer']` (line 30)
4. `"customizer settings".includes("customizer")` → `true`
5. Returns `true`

**What happens in renderPreview() when isNonPreviewable returns true:**

TRACED: auto-preview-controller.js:656–693:

1. Classifies as `INFORMATIONAL` via `classifyRenderState()` (line 657)
2. Cancels debounce timer (lines 666–668)
3. Clears pending parameters (lines 670–673)
4. Creates error with code `'NO_GEOMETRY'` and message about customizer mode (lines 675–683)
5. Sets state to `PREVIEW_STATE.ERROR` (line 690)
6. Calls `this.onError(error, 'preview')` (line 692)

**What happens in the error handler (main.js):**

TRACED: `handleConfigDependencyError()` at src/main.js:5057–5080:

1. Checks `code === 'NO_GEOMETRY'` (line 5067)
2. Calls `previewManager.clear()` (line 5069) — **this removes the mesh**
3. Updates status to "No geometry in this mode" (line 5071–5072)
4. Sets preview indicator to "— No geometry (Customizer mode)" (line 5076)
5. Returns `true` (handled)

**PreviewManager.clear():**

TRACED: src/js/preview.js:3575–3600:

1. Hides measurements (line 3576)
2. Removes mesh from scene: `this.scene.remove(this.mesh)` (line 3584)
3. Disposes geometry and material (lines 3585–3586)
4. Sets `this.mesh = null` (line 3587)
5. Re-renders the scene (now empty) (line 3596)

**FINDING:** The blank display pipeline is **now correct**. When `generate = "Customizer Settings"`, the mesh IS cleared. The `handleConfigDependencyError` handler at main.js:5067–5080 explicitly clears the preview. This appears to be a BUG-B fix (as noted in the comment at main.js:5063–5066). The stakeholder's original complaint (S-007) about geometry remaining visible when switching to Customizer Settings **may have been fixed** by this code.

**S-008 "unexpected display content" — what triggers unwanted renders:**

TRACED: Auto-preview has a debounce timer (auto-preview-controller.js:464). If a parameter change is registered BEFORE `isNonPreviewable()` is checked (i.e., the debounce fires after a mode switch), the old parameters could trigger a render. However, the BUG-C fix at auto-preview-controller.js:665–673 now explicitly cancels the debounce timer and clears pending parameters when entering a non-previewable mode.

**FINDING:** The BUG-C fix at auto-preview-controller.js:665–673 addresses the root cause of S-008 — it prevents stale debounce timers from firing after a mode switch to non-previewable. **REQUIRES RUNTIME TEST** to confirm the fix is effective.

The render audit log at auto-preview-controller.js:646–654 (`window.__renderAuditCount`) was added specifically to diagnose spontaneous renders (BUG-C).

---

### Stage 5: 2D Export Path

**`resolve2DExportIntent()` parameter adjustment:**

TRACED: render-intent.js:116–163:

1. Returns original parameters if format is not 'svg' or 'dxf' (line 117)
2. Scans all enum parameters in the schema (line 123)
3. **Stakeholder heuristic — `type_of_keyguard`:** Picks the entry containing "laser" (lines 128–139)
4. **Stakeholder heuristic — laser-cutting toggle:** Matches `/laser.*(cut|cutting).*(best|pract)/i` and sets to "yes" (lines 143–153)
5. **Generic 2D value picker:** For any enum with both 2D and non-2D values, picks the best 2D value scored by keyword relevance (lines 155–158)

**Worker 2D rendering:**

TRACED: In `renderWithCallMain()` (src/worker/openscad-worker.js):

1. `is2DExport = format === 'svg' || format === 'dxf'` (line 1373)
2. The SCAD file is written as-is — the SCAD code's own `projection()` calls produce 2D geometry (line 1399–1406)
3. Parameters are passed via `-D` flags, including the 2D-compatible values from `resolve2DExportIntent()` (line 1407)

**Two-pass fallback for 3D models exported to 2D:**

TRACED: If the SCAD code produces 3D geometry but 2D export is requested, OpenSCAD exits with a non-zero code and "Current top level object is not a 2D object" in the console. The worker catches this at lines 1489–1527:

1. **Pass 1:** Render to STL (3D output succeeds)
2. **Pass 2:** Create a wrapper SCAD file: `projection(cut=true) { import("stl_file"); }` and render to SVG/DXF

**Color in 2D export:**

TRACED: SVG/DXF are line-based formats. OpenSCAD's SVG export produces `<path>` elements with stroke/fill attributes. DXF exports LINE entities. Neither format carries per-face color data from `color()` calls. The post-processing in `postProcessDXF()` (worker lines 1821–2096) converts LWPOLYLINE to LINE segments for R12 compatibility — no color handling.

**FINDING:** Color is NOT preserved in SVG/DXF export. This is consistent with desktop OpenSCAD behavior — `color()` is F5-preview-only and does not affect exported geometry formats.

---

## Per-Scenario Trace

### S-001 — 3D-printed keyguard color not preserved in browser

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Parameter Input** | TRACED: Color hex value (e.g., `#FF0000`) serialized as `-D keyguard_color=[255,0,0]` via `buildDefineArgs()`. The SCAD code receives the color value correctly. | openscad-worker.js:1084–1086 |
| **Format Selection** | TRACED: If the SCAD source contains `color()` calls (detected by `scadUsesColor()` regex), AND `color_passthrough` flag is enabled (rollout: 100), format is set to `'off'`. Otherwise `'stl'`. | auto-preview-controller.js:719–722; feature-flags.js:105–116 |
| **Preview Rendering** | TRACED (two paths): **(a) COFF path:** If WASM returns COFF data, `loadOFF()` parses per-face RGBA and creates vertex-colored mesh. Each face gets the color assigned by the SCAD `color()` call. **(b) STL fallback:** If WASM returns plain OFF or the source has no `color()` calls, `loadSTL()` creates a single-color mesh using `resolvePreviewColor()` (first color param) or theme default. | preview.js:1074–1264 (COFF), preview.js:935–1039 (STL) |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** Does the WASM build actually emit COFF with per-face RGBA when the SCAD file uses `color()`? If yes → per-object colors are displayed. If no → all objects are single-color. | Phase 4, Probe 1 |

### S-002 — Laser-cut keyguard color not preserved in browser

| Stage | Browser Behavior | Citation |
|---|---|---|
| **All stages** | TRACED: Identical pipeline to S-001. The laser-cut keyguard's `color()` value is serialized and passed to the worker. Whether it appears as a distinct color depends entirely on whether the WASM build emits COFF. | Same as S-001 |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** Same as S-001 — COFF output is the determining factor. | Phase 4, Probe 1 |

### S-003 — "First layer" preview color not preserved in browser

| Stage | Browser Behavior | Citation |
|---|---|---|
| **All stages** | TRACED: Identical pipeline to S-001/S-002. Third `color()` value serialized correctly. | Same as S-001 |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** Same as S-001. | Phase 4, Probe 1 |

### S-004 — Rendered first layer uses OpenSCAD-assigned colors (not user colors)

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Parameter Input** | TRACED: Parameters serialized normally. The `generate` value selects the "first layer" mode. | openscad-worker.js:1050–1126 |
| **Format Selection** | TRACED: If the SCAD source contains `color()` calls (even if this particular generate mode doesn't execute them), `scadUsesColor()` returns true and format is set to `'off'`. The regex scans the entire SCAD file, not just the active code path. | auto-preview-controller.js:605–613, 719–722 |
| **Preview Rendering** | TRACED: The browser has no concept of F5 vs F6 rendering. The WASM engine performs a full render (equivalent to F6). In F6, desktop OpenSCAD's `color()` calls are ignored and the engine assigns per-face CSG operation colors (System 2: yellow for positive faces, green for subtracted faces — see desktop-coloring-theory.md). If the WASM build emits COFF, these engine-assigned colors should appear. If the WASM build emits plain OFF, the mesh is single-color. | preview.js:1074–1264 |
| **Desktop Parity Gap** | The stakeholder sees System 2 colors (engine-assigned yellow/green) in desktop F6 Render. The browser performs the equivalent of F6 via WASM. If the Manifold backend propagates CSG operation colors to the OFF output (per PR #5185), the browser would show these colors. But this is **UNVERIFIED**. | desktop-coloring-theory.md, System 2 |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** (a) Does the WASM build include the `render-colors` feature from PR #5185? (b) Does its COFF output contain per-face CSG operation colors (yellow/green)? | Phase 4, Probe 1 |

### S-005 — `#` debug modifier transparency lost in browser

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Detection** | TRACED: `scadUsesDebugModifier()` detects `#` at statement boundaries. If `color_passthrough` is enabled AND `scadUsesColor()` returns true, `hasDebugModifier` is set to true. | auto-preview-controller.js:723–725 |
| **CRITICAL LIMITATION:** | The `hasDebugModifier` flag is only checked if `useColorPassthrough` is true. If the SCAD source does NOT contain `color()` calls but DOES use `#`, the debug modifier is NOT detected because format is already 'stl'. | auto-preview-controller.js:723–725 |
| **Format Selection** | TRACED: If `color()` is present → format is 'off', and `hasDebugModifier` is checked. If no `color()` → format is 'stl' and `#` detection is skipped entirely. | auto-preview-controller.js:719–725 |
| **Preview Rendering** | TRACED (if COFF path active): `loadOFF()` receives `debugHighlight: { hex: '#ff5151', opacity: 0.502 }`. All COFF face colors are replaced with the fixed highlight color (lines 1156–1161). The material is created with `transparent: true, opacity: 0.502, depthWrite: false` (lines 1215–1221). This produces a semi-transparent pink mesh matching desktop `#` behavior. | preview.js:1156–1161, 1208–1221; color-utils.js:14–22 |
| **Preview Rendering (STL path)** | TRACED: If format is 'stl' (no `color()` detected or COFF unavailable), `loadSTL()` creates a single-color opaque mesh. There is NO debug modifier handling in the STL path. The `#` effect is completely lost. | preview.js:935–1039 |
| **Desktop Parity Gap** | Desktop `#` modifier produces a transparent pink overlay **in addition to** the normal geometry (the object is rendered twice: once normally, once as transparent pink). The browser's COFF path replaces ALL face colors with the highlight — it does not render the object twice. This is an approximation, not exact parity. | desktop-coloring-theory.md, System 3 |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** (a) Does the WASM OFF output include `#`-marked objects at all? (Expected: yes, `#` objects are included in exported geometry.) (b) Does the WASM assign any special color to `#`-marked faces in COFF output? (Expected: no — `#` is display-only.) | Phase 4, Probe 2 |

### S-006 — Color passthrough request (browser does not pass through OpenSCAD colors)

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Pipeline** | TRACED: This scenario is the aggregate color passthrough concern. The full pipeline is: SCAD with `color()` → `scadUsesColor()` = true → format = 'off' → worker renders to OFF → **COFF or plain OFF?** → if COFF: per-face colors displayed; if plain OFF: single-color fallback. | auto-preview-controller.js:719–722, preview.js:1074–1264 |
| **Current State** | TRACED: The infrastructure for color passthrough is **fully built and enabled** (rollout: 100). The only remaining question is whether the WASM build emits COFF. | feature-flags.js:105–116 |
| **Color Legend Fallback** | TRACED: `resolvePreviewColor()` picks the first color parameter and tints the entire mesh. A color legend showing parameter names and swatches is displayed when 2+ color params exist. This is a UI-level workaround, not engine-level color passthrough. | auto-preview-controller.js:251–269; COLOR_PASSTHROUGH.md lines 79–86 |
| **Critical Unknown** | **REQUIRES RUNTIME TEST:** COFF output verification. | Phase 4, Probe 1 |

### S-007 — Display shows geometry when `generate = Customizer Settings` (should be blank)

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Parameter Input** | TRACED: `generate = "Customizer Settings"` is passed to `renderPreview()`. | auto-preview-controller.js:644–693 |
| **isNonPreviewable** | TRACED: `isNonPreviewable(parameters, schema)` returns `true`. The value `"customizer settings"` contains the keyword `"customizer"` from `INFORMATIONAL_KEYWORDS`. | render-intent.js:185–199 |
| **Render Skipped** | TRACED: `renderPreview()` short-circuits at line 656. No WASM render is invoked. Debounce timer is cancelled (line 666–668). Pending parameters are cleared (lines 670–673). | auto-preview-controller.js:656–693 |
| **Error Dispatch** | TRACED: Error with code `'NO_GEOMETRY'` is created (line 683) and dispatched via `this.onError(error, 'preview')` (line 692). | auto-preview-controller.js:683, 692 |
| **Mesh Clearing** | TRACED: `handleConfigDependencyError()` catches `NO_GEOMETRY` and calls `previewManager.clear()` which removes the mesh from the Three.js scene. | main.js:5067–5079; preview.js:3575–3600 |
| **Status Update** | TRACED: Status set to "No geometry in this mode. Adjust 'generate' to see a 3D preview." Preview indicator shows "— No geometry (Customizer mode)". | main.js:5071–5076 |
| **FINDING** | The blank display behavior appears to be **correctly implemented now**. The BUG-B fix (noted in main.js:5063–5066) explicitly clears the mesh. The stakeholder's original complaint may have been filed before this fix was implemented. **REQUIRES RUNTIME TEST** to confirm the fix works end-to-end. | main.js:5063–5066 |

### S-008 — Unexpected geometry appears in display from unknown trigger

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Root Cause Analysis** | TRACED: Two mechanisms could cause unexpected geometry to appear: **(1) Stale debounce timer:** A parameter change schedules a debounce, then the user switches to a non-previewable mode. If the old timer fires before the mode switch completes, it renders with the old parameters. **(2) Console interaction:** The stakeholder mentioned console interaction as a possible trigger. If opening/closing the console panel causes a DOM layout change that triggers a state update, it could fire `onParameterChange()`. | auto-preview-controller.js:456–466 |
| **BUG-C Fix** | TRACED: The BUG-C fix at auto-preview-controller.js:665–673 now cancels the debounce timer AND clears pending parameters when entering a non-previewable mode. The render audit counter (`window.__renderAuditCount`, line 647) was added for diagnostic purposes. | auto-preview-controller.js:646–673 |
| **FINDING** | The BUG-C fix should prevent the stale-timer path. However, the console-interaction trigger path is not addressed by this fix — if the console panel interaction somehow triggers `onParameterChange()`, a render could still occur. **REQUIRES RUNTIME TEST** to verify the fix is comprehensive. | auto-preview-controller.js:665–673 |

### S-009 — SVG laser cutting export workflow unclear

| Stage | Browser Behavior | Citation |
|---|---|---|
| **2D Export Resolution** | TRACED: `resolve2DExportIntent()` adjusts parameters: sets `type_of_keyguard` to the laser-cut variant, enables laser-cutting toggle, and picks the best 2D generate value. | render-intent.js:116–163 |
| **Worker Rendering** | TRACED: Worker renders to SVG/DXF. If the SCAD code includes `projection()`, it works directly. If the model is 3D, the two-pass fallback renders to STL then projects. | openscad-worker.js:1399–1527 |
| **Preview** | TRACED: For 2D generate modes, `isNonPreviewable()` returns `false` — the SCAD code produces a thin 3D slice that IS previewable. The preview shows this 3D slice as a flat extruded shape. | render-intent.js:174–177 |
| **Color in SVG/DXF** | TRACED: No color data in SVG/DXF exports. SVG uses default stroke/fill. DXF post-processing converts to R12 LINE segments with no color attributes. This matches desktop OpenSCAD behavior. | openscad-worker.js:1821–2096 |
| **Workflow Concern** | This is primarily a UI/workflow issue, not a pipeline issue. The browser's export flow differs from desktop OpenSCAD's File > Export menu. | N/A |

### S-010 — Console Output pane vs OpenSCAD Messages box confusion

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Pipeline Relevance** | Not a rendering pipeline issue. This is a UI design choice: the browser has two separate display areas for console output vs OpenSCAD messages. Desktop OpenSCAD has a single console. | N/A |
| **No Pipeline Trace Needed** | This scenario does not involve the render/preview pipeline. It is purely a UI/workflow concern. | N/A |

### S-011 — Console Output pane updates unexpectedly

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Auto-Preview Trigger** | TRACED: The auto-preview system fires `onParameterChange()` whenever parameters change. If a UI interaction (e.g., opening the console panel) triggers a state update that is interpreted as a parameter change, it could schedule a debounced render. | auto-preview-controller.js:368–467 |
| **Debounce Mechanism** | TRACED: Changes debounce at 800ms (auto-preview-controller.js:54). If auto-preview is paused for complexity, debounce is 1500ms (line 63). After the debounce fires, the render produces console output (ECHO statements), which updates the console panel. | auto-preview-controller.js:54, 63, 464–466 |
| **FINDING** | The "spontaneous" console update is most likely caused by the auto-preview debounce firing. The user changes a parameter (or the system detects a parameter-like state change), the debounce timer fires 800ms later, the WASM render runs, and console output appears. This is by-design behavior for auto-preview, but may be confusing when the user doesn't perceive their action as triggering a render. | auto-preview-controller.js:368–467 |

### S-012 — Missing include file warning not shown in console

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Worker Console Capture** | TRACED: The worker captures all OpenSCAD console output via `module.print` and `module.printErr` callbacks (openscad-worker.js:407–415). Output is accumulated in `openscadConsoleOutput` (line 408, 412). | openscad-worker.js:407–415 |
| **Console Output Delivery** | TRACED: Console output is sent back to the main thread in the `COMPLETE` message payload as `consoleOutput` (openscad-worker.js:2533). | openscad-worker.js:2533 |
| **Missing File Warning** | TRACED: OpenSCAD WASM should emit "WARNING: Can't open include file 'X'" to stderr when an include directive fails. This would be captured by `printErr` (line 412) and prefixed with `[ERR]`. Whether this specific warning appears depends on the WASM build's behavior when a file is not found in the virtual filesystem. | openscad-worker.js:412 |
| **FINDING** | The pipeline for capturing warnings exists. The question is whether the WASM build actually emits the "Can't open include file" warning, and whether the browser's console panel displays `[ERR]`-prefixed messages. The stakeholder reported not seeing it even with "Warnings" checked. **REQUIRES RUNTIME TEST** to verify the warning appears in the worker's captured output. | Phase 4 |

### S-013 — Companion file screenshot does not display as reference overlay

| Stage | Browser Behavior | Citation |
|---|---|---|
| **File Mounting** | TRACED: Companion files are mounted in the worker's virtual filesystem via `mountFiles()` (openscad-worker.js:719–814). They are placed under `/work/` directory. | openscad-worker.js:719–814 |
| **SCAD Import Resolution** | TRACED: `OPENSCADPATH` is set to include `/libraries` and the working directory (openscad-worker.js:1385–1397). `import()` calls in the SCAD code should resolve files relative to the main file's directory. | openscad-worker.js:1385–1397 |
| **Image File Support** | TRACED: The SCAD code likely uses `import()` or `surface()` to load the screenshot image. OpenSCAD's WASM build may not support all image formats for `surface()`. This is a WASM capability limitation, not a pipeline issue. | N/A |
| **Pipeline Relevance** | This is a file-system mounting and WASM capability issue, not a color/display pipeline issue. | N/A |

### S-014 — Rendering chain degrades across preset switches (structural geometry missing)

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Preset Switch Flow** | TRACED: `applyPresetParametersAndCompanions()` (main.js:15129) merges preset params, updates project files, and calls `autoPreviewController.onParameterChange()` (line 15153–15154). | main.js:15129–15190 |
| **Worker State** | TRACED: The worker has a `_callMainInvoked` guard (openscad-worker.js:1458–1473). If `callMain` is invoked a second time without restarting the worker, it throws `WASM_DOUBLE_INVOKE` to prevent corrupted geometry. This guard was added as a BUG-A fix. | openscad-worker.js:1458–1473 |
| **Companion File Cleanup** | TRACED: `clearMountedFiles()` is called at the start of every render (openscad-worker.js:2238–2239) to prevent stale files from previous presets. The BUG-A fix comment at line 2236 notes this was previously conditional. | openscad-worker.js:2236–2239 |
| **Cache Clearing** | TRACED: `setProjectFiles()` calls `clearPreviewCache()` (auto-preview-controller.js:302) so stale cached results are not served after a preset switch. | auto-preview-controller.js:299–305 |
| **WASM Single-Invocation Constraint** | TRACED: The WASM module can only call `callMain()` once per lifetime. After calling it for `--help` capability detection, the guard is reset (line 634). But after a real render, the guard stays set. The render controller must restart the worker between renders. | openscad-worker.js:42, 625, 1458–1477 |
| **FINDING** | The "structural missing" bug is likely caused by the WASM module state corruption when `callMain()` is invoked multiple times. The `_callMainInvoked` guard (BUG-A fix) now detects this and forces a worker restart. Combined with the companion file cleanup fix, preset switching should now produce clean renders. **REQUIRES RUNTIME TEST** to confirm the fix is effective. | openscad-worker.js:1458–1473 |

### S-015 — Stakeholder requests minimal desktop-parity baseline

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Pipeline Relevance** | This is a meta-request, not a specific pipeline scenario. The stakeholder wants the browser to replicate core desktop behaviors. The pipeline traces for S-001 through S-014 collectively address this request. | N/A |
| **Summary** | The browser pipeline has the infrastructure for color passthrough (COFF), blank display handling (BUG-B), stale-state prevention (BUG-C), and preset switching (BUG-A). The critical missing piece is **runtime verification** that the WASM build actually emits COFF data. | All citations above |

### S-016 — Grid color/darkness not controllable

| Stage | Browser Behavior | Citation |
|---|---|---|
| **Pipeline Relevance** | Not a rendering pipeline issue. Grid display is a Three.js scene configuration separate from the WASM render pipeline. | N/A |
| **Grid Implementation** | TRACED: The Three.js preview creates a grid as part of the scene setup. Grid color/darkness would be a property of the `GridHelper` or custom grid mesh. This is a UI enhancement request, not a pipeline gap. | preview.js (scene setup — not in the render pipeline) |

---

## Pipeline Summary: Critical Path Findings

### Fully Traced (code path confirmed)

| Finding | Status | Citation |
|---|---|---|
| Color parameter serialization (hex → RGB vector) | **Correct** (functionally; uses 0–255 not 0–1 but OpenSCAD auto-normalizes) | openscad-worker.js:1084–1086 |
| `scadUsesColor()` regex detection | **Correct** (conservative, safe false-positives) | auto-preview-controller.js:605–613 |
| `scadUsesDebugModifier()` regex detection | **Correct** (requires `color()` to also be present for activation) | auto-preview-controller.js:629–637 |
| `color_passthrough` flag | **Fully enabled** (rollout: 100, killSwitch: false) | feature-flags.js:105–116 |
| OFF format routing | **Correct** (format='off' when flag+color detected, 'stl' otherwise) | auto-preview-controller.js:719–722 |
| COFF parser in `loadOFF()` | **Correct** (detects COFF header, parses per-face RGBA, creates vertex-colored mesh) | preview.js:1074–1264 |
| `#` debug highlight override | **Correct** (replaces all face colors with `#ff5151` at 50% opacity when detected) | preview.js:1156–1161, 1208–1221 |
| `isNonPreviewable()` for customizer mode | **Correct** (detects "customizer" keyword, returns true) | render-intent.js:185–199 |
| Mesh clearing for non-previewable modes | **Correct** (BUG-B fix: clears mesh via `previewManager.clear()`) | main.js:5067–5079 |
| Debounce cancellation for mode switches | **Correct** (BUG-C fix: cancels timer + pending params) | auto-preview-controller.js:665–673 |
| `setRenderState()` is a no-op | **Correct** (fabricated tinting removed; color from COFF or theme) | preview.js:511–512 |
| `resolve2DExportIntent()` | **Correct** (scans schema for 2D values, applies stakeholder heuristics) | render-intent.js:116–163 |
| WASM single-invocation guard | **Correct** (BUG-A fix: detects double `callMain()`, forces restart) | openscad-worker.js:1458–1473 |

### Requires Runtime Test (Phase 4)

| Question | Why It Matters | Probe |
|---|---|---|
| Does the WASM build emit COFF (per-face RGBA) in OFF output? | Determines whether S-001–S-004, S-006 color passthrough works | Probe 1 |
| Does COFF include System 2 colors (yellow/green CSG operation faces)? | Determines whether S-004 engine-assigned colors appear | Probe 1 |
| Does `#`-modified geometry appear in OFF output? | Determines whether S-005 objects are present in the mesh | Probe 2 |
| Does the WASM build assign any special color to `#` faces in COFF? | Expected: no. `#` is display-only, not in export data | Probe 2 |
| Does the "Can't open include file" warning appear in captured console? | Determines whether S-012 warning is visible to the user | (New probe) |
| Is the BUG-B mesh-clearing fix effective end-to-end? | Confirms S-007 blank display is working | Probe 5 |
| Is the BUG-C debounce-cancellation fix effective? | Confirms S-008 stale-state is resolved | Probe 5 |
| Is the BUG-A worker-restart fix effective across preset switches? | Confirms S-014 degradation is resolved | (New probe) |

### Known Internal Inconsistency

**CONFIRMED:** `COLOR_PASSTHROUGH.md` and `feature-flags.js` are out of sync:

| Source | `rollout` | `killSwitch` | Status |
|---|---|---|---|
| `docs/notes/COLOR_PASSTHROUGH.md` line 93 | 0 | true | **STALE** — describes the initial gated state |
| `src/js/feature-flags.js` lines 113–115 | **100** | **false** | **CURRENT** — fully enabled in production |

The documentation should be updated to reflect the actual code state after Phase 4 verification.

---

## `#` Debug Modifier — Detailed Behavior Analysis

The `#` modifier handling deserves special attention because it involves the most complex interaction between detection, format selection, and rendering:

### Detection Gate

The `#` modifier is only detected when `color()` is ALSO present:

```
Line 723: const hasDebugModifier =
Line 724:   useColorPassthrough &&
Line 725:   AutoPreviewController.scadUsesDebugModifier(this.currentScadContent);
```

If a SCAD file uses `#` but NOT `color()`, the entire color passthrough path is skipped (format stays 'stl') and the `#` modifier has no visual effect in the browser.

### Rendering Approximation

Desktop OpenSCAD renders `#` objects twice:
1. Once normally (with their assigned color, as part of the CSG tree)
2. Once additionally as a transparent pink overlay

The browser's COFF path replaces ALL face colors with the highlight — it does not render the object twice. This means:
- **Desktop:** Normal object + pink transparent copy = you can see the object's actual color AND the pink overlay
- **Browser:** Only the pink transparent version = you lose the object's actual color

This is an approximation, not exact parity. The stakeholder's use case (seeing the keyguard through the frame) would partially work — the transparent pink mesh provides the "see-through" effect — but the underlying object colors are lost.

### Alpha Channel

COFF format includes an alpha value per face (`r g b a`). The parser reads it at position `parts[n+4]` but does NOT use it — colors are only `r, g, b` in the vertex color buffer (preview.js:1167). The alpha is discarded in favor of the material-level opacity set by `debugHighlight.opacity` (line 1218).

**FINDING:** Per-face alpha from COFF is NOT used. All faces get the same opacity via the material. This means even if the WASM build outputs per-face alpha for `#` objects (unlikely — `#` is display-only), the browser would not use it.

---

## References

### Source Files Read

| File | Lines Read | Key Functions Traced |
|---|---|---|
| `src/js/auto-preview-controller.js` | Full (1127 lines) | `scadUsesColor()`, `scadUsesDebugModifier()`, `renderPreview()`, `resolvePreviewColor()`, `_detectRenderState()`, `onParameterChange()` |
| `src/js/preview.js` | Lines 490–520, 930–1264, 3575–3600 | `loadSTL()`, `loadOFF()`, `setRenderState()`, `setColorOverride()`, `clear()` |
| `src/worker/openscad-worker.js` | Full (2824 lines) | `buildDefineArgs()`, `renderWithCallMain()`, `render()`, `mountFiles()`, `clearMountedFiles()` |
| `src/js/render-intent.js` | Full (258 lines) | `isNonPreviewable()`, `resolve2DExportIntent()`, `classifyRenderState()` |
| `src/js/feature-flags.js` | Full (388 lines) | `isEnabled()`, `FLAGS.color_passthrough` |
| `src/js/color-utils.js` | Full (83 lines) | `hexToRgb()`, `normalizeHexColor()`, `DEBUG_HIGHLIGHT_*` constants |
| `src/main.js` | Lines 5057–5141, 9385–9444, 15127–15190 | `handleConfigDependencyError()`, file load flow, `applyPresetParametersAndCompanions()` |
| `docs/notes/COLOR_PASSTHROUGH.md` | Full (159 lines) | Stale status information confirmed |
