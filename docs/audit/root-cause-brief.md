# Root Cause Classification & Decision Brief — Phase 5

> **Audit:** OpenSCAD Color/Display Parity Investigation
> **Phase:** 5 — Root Cause Classification and Decision Brief
> **Date:** 2026-03-10
> **Status:** Complete — decision-ready for operator review

---

## 1. Discrepancy Matrix

All 16 scenarios from the scenario matrix with desktop truth, browser behavior, gap status, and root-cause bucket.

| ID | Category | Desktop Truth | Browser Behavior | Status | Root Cause Bucket |
|----|----------|---------------|------------------|--------|-------------------|
| **S-001** | color | F5: user `color()` applied — 3D-printed keyguard shows distinct color | If COFF: per-face colors displayed. If no COFF: single-color mesh. | **UNVERIFIED** — depends on COFF | WASM/Engine |
| **S-002** | color | F5: user `color()` applied — laser-cut keyguard shows distinct color | Same as S-001 | **UNVERIFIED** — depends on COFF | WASM/Engine |
| **S-003** | color | F5: user `color()` applied — "first layer" shows distinct color | Same as S-001 | **UNVERIFIED** — depends on COFF | WASM/Engine |
| **S-004** | color | F6: engine-assigned CSG colors — yellow (positive) / green (subtracted) | WASM does F6-equivalent; COFF would contain CSG colors if render-colors feature is compiled in | **UNVERIFIED** — depends on COFF | WASM/Engine |
| **S-005** | transparency | F5: object rendered twice — once normally + once as transparent pink `#` overlay | Object rendered once; ALL face colors replaced with `#ff5151` at 50% opacity; underlying colors lost | **GAP** — approximation, not parity | Preview Renderer |
| **S-006** | color | F5: per-object `color()` + `#` overlay visible | Infrastructure built and enabled (rollout: 100). Outcome depends on COFF. | **UNVERIFIED** — depends on COFF | WASM/Engine |
| **S-007** | blank-display | Empty viewport when no geometry produced | `previewManager.clear()` removes mesh on NO_GEOMETRY error | **FIXED** — BUG-B; pending runtime verification | Render Intent / State |
| **S-008** | stale-state | Console actions do not trigger renders; viewport stays blank | Debounce timer cancelled + pending params cleared on mode switch; console-interaction path not explicitly addressed | **PARTIALLY FIXED** — BUG-C | Render Intent / State |
| **S-009** | workflow | File > Export > Export as SVG — familiar menu workflow | Different UI flow; stakeholder could not identify the process | **GAP** — workflow unclear | UI / Workflow |
| **S-010** | workflow | Single unified console panel | Two separate panels (Console Output + OpenSCAD Messages) with unclear distinction | **GAP** — browser-specific design | UI / Workflow |
| **S-011** | stale-state | Console updates only on explicit user actions (F5/F6/export) | Auto-preview debounce fires 800ms after parameter changes; user doesn't perceive trigger | **BY DESIGN** — auto-preview UX gap | Render Intent / State |
| **S-012** | workflow | Console shows "WARNING: Can't open include file 'X'" | Warning not visible with "Warnings" checked; capture pipeline exists (`printErr` callback) but WASM emission unverified | **UNVERIFIED** — WASM virtual FS behavior | WASM/Engine |
| **S-013** | blank-display | SCAD `import()`/`surface()` loads image file; screenshot appears behind keyguard | File mounted in virtual FS but image not displayed; WASM image format support unknown | **GAP** — WASM capability | WASM/Engine |
| **S-014** | stale-state | Each preset renders fully; compile is independent | `_callMainInvoked` guard detects double `callMain()`; forces worker restart; companion files cleaned on every render | **FIXED** — BUG-A; pending runtime verification | Render Intent / State |
| **S-015** | workflow | N/A — meta-request for "base OpenSCAD functionality" in browser | Infrastructure exists but multiple gaps remain | **N/A** — aggregates all other scenarios | N/A |
| **S-016** | color | Grid color adjustable via Edit > Preferences > 3D View (UNVERIFIED) | No grid color/darkness control | **GAP** — feature request | UI / Workflow |

### Status Summary

| Status | Count | Scenarios |
|--------|-------|-----------|
| UNVERIFIED (depends on COFF runtime test) | 6 | S-001, S-002, S-003, S-004, S-006, S-012 |
| GAP (confirmed divergence) | 5 | S-005, S-009, S-010, S-013, S-016 |
| FIXED (pending runtime verification) | 2 | S-007, S-014 |
| PARTIALLY FIXED | 1 | S-008 |
| BY DESIGN (auto-preview behavior) | 1 | S-011 |
| N/A (meta-request) | 1 | S-015 |

---

## 2. Root Cause Bucket Summary

### Bucket 1: WASM/Engine — 7 scenarios

**Scenarios:** S-001, S-002, S-003, S-004, S-006, S-012, S-013

**Description:** The WASM binary (`OpenSCAD-2025.03.25.wasm24456`) is a pre-compiled artifact (Layer 1 — frozen). Whether it produces the expected output is the single largest unknown in this audit.

**Sub-group A — COFF output (S-001, S-002, S-003, S-004, S-006):**

The entire JavaScript color passthrough pipeline is built, tested, and enabled:

- `scadUsesColor()` detection: `auto-preview-controller.js:605–613`
- `color_passthrough` flag at rollout 100: `feature-flags.js:105–116`
- Format routing to OFF: `auto-preview-controller.js:719–722`
- Worker renders to `/tmp/output.off`: `openscad-worker.js:1313`
- `loadOFF()` parses COFF header and per-face RGBA: `preview.js:1074–1264`

62 unit tests confirm the JS pipeline is correct (`tests/unit/parity-probes.test.js`).

**UPDATE (2026-03-11, COFF Upstream Investigation):** Root cause identified and fixed.
The WASM binary never writes a `COFF` header — OpenSCAD's `export_off.cc` always writes `OFF`, appending colors inline after face vertex indices. Two local bugs prevented color detection:
1. Worker did not pass `--enable=render-colors` to the WASM binary (invocation-level fix in `openscad-worker.js:1332`)
2. Parser gated color detection on `COFF` header and required RGBA (4 channels), but OpenSCAD writes `OFF` header with RGB-only for opaque colors (parser fix in `preview.js:1127-1171`)

Both fixes have been applied. S-001 through S-004 and S-006 are **expected to be resolved** — pending runtime verification via `tests/e2e/coff-color-probe.spec.js`.

**Sub-group B — Warning emission (S-012):**

The worker captures all WASM console output via `module.print` and `module.printErr` callbacks (`openscad-worker.js:407–415`). The pipeline delivers this to the main thread as `consoleOutput` (`openscad-worker.js:2533`). The open question is whether the WASM virtual filesystem handles a missing `include` file by emitting the standard "WARNING: Can't open include file" message to stderr. Emscripten's MEMFS may return an empty file or a silent error instead. **Requires runtime test.**

**Sub-group C — Image import (S-013):**

The SCAD code uses `import()` or `surface()` to load a screenshot image. Companion files are mounted in the virtual FS at `/work/` (`openscad-worker.js:719–814`). Whether the WASM build supports image format parsing for `surface()` is a WASM capability question. This is likely a Layer 1 limitation since image support depends on compiled-in libraries (libpng, etc.).

**Fixable within current architecture?**

| Sub-group | If WASM cooperates | If WASM doesn't cooperate |
|-----------|-------------------|--------------------------|
| A (COFF) | No fix needed — JS pipeline handles it | **Blocked.** Requires new WASM build with `render-colors` feature, OR client-side color derivation from SCAD source (major architectural change). |
| B (Warnings) | No fix needed — capture pipeline exists | Partially addressable: add synthetic warning when companion file is missing. |
| C (Image) | No fix needed | **Blocked.** Requires WASM rebuild with image library support. |

**Layer 1 (WASM) limitation?** Yes — all sub-groups depend on WASM build contents that cannot be modified at the JS layer.

---

### Bucket 2: Worker Serialization — 0 scenarios

**No scenarios fall into this bucket.** Probe 4 (13 test cases) confirmed that hex color serialization via `buildDefineArgs()` (`openscad-worker.js:1084–1086`) is functionally correct. The 0–255 integer range (`[255,0,0]`) instead of 0–1 float (`[1,0,0]`) is non-idiomatic but safe — OpenSCAD auto-normalizes values > 1.

Minor inconsistency noted: the `buildDefineArgs` regex only matches 6-digit hex, while `hexToRgb()` in `color-utils.js` supports 3-digit hex expansion. This does not affect real usage since the UI color picker produces 6-digit hex.

---

### Bucket 3: Preview Renderer — 1 scenario

**Scenarios:** S-005

**Description:** The Three.js viewer's `#` debug modifier approximation loses underlying object colors.

**Code locations:**
- Debug highlight override in `loadOFF()`: `preview.js:1156–1161`
- Material creation with transparency: `preview.js:1208–1221`
- Debug highlight constants: `color-utils.js:14–22`
- `#` detection gate (requires `color()` present): `auto-preview-controller.js:723–725`

**The gap:**

| Aspect | Desktop OpenSCAD F5 | Browser (COFF path) |
|--------|----------------------|---------------------|
| Normal geometry | Rendered with `color()` values or CSG colors | ALL face colors replaced with `#ff5151` |
| `#`-marked object | Rendered a second time as transparent pink overlay | Single render — only the pink version exists |
| Net visual | User sees normal colors AND pink overlay simultaneously | User sees only a uniform pink translucent mesh |
| Per-face alpha | N/A (display effect, not data) | COFF alpha is read but discarded (`preview.js:1167`); transparency is material-level only |

Desktop renders the `#` object twice: once normally as part of the CSG tree, and once additionally as a transparent pink overlay. The browser replaces ALL face colors with the fixed highlight, rendering only once. This means even when COFF provides correct per-face colors, the browser's `#` handling overwrites them.

**Secondary issue — detection gate:** `hasDebugModifier` is only evaluated when `useColorPassthrough` is true (`auto-preview-controller.js:723`). A SCAD file using `#` without any `color()` calls takes the STL path, where `#` is completely invisible. The stakeholder's keyguard file uses both `color()` and `#`, so this gate passes for their use case.

**Fixable within current architecture?** Yes.

- **Dual-render approach:** Modify `loadOFF()` to render the mesh twice when `debugHighlight` is active — once with COFF per-face colors (normal render), once with the `#ff5151` overlay at 50% opacity. This requires adding a second `Mesh` object to the scene but no architectural change.
- **Remove detection gate:** Allow `scadUsesDebugModifier()` to be checked independently of `scadUsesColor()`, routing to OFF even when only `#` is present.
- **Per-face alpha support:** Read COFF alpha into the vertex color buffer (currently discarded) to support future per-face transparency.

**Layer 1 (WASM) limitation?** Partially. The fundamental constraint is that the WASM engine performs F6-equivalent rendering where `#` is a display-only effect with no export representation. The browser's client-side detection and dual-render workaround is the best achievable approximation — true F5 mode from the WASM engine is not available.

---

### Bucket 4: Render Intent / State — 4 scenarios

**Scenarios:** S-007, S-008, S-011, S-014

**Description:** Wrong render mode selected, stale geometry not cleared, or unexpected render triggered.

#### S-007 — Blank display (FIXED by BUG-B)

When `generate = "Customizer Settings"`, the mesh is now explicitly cleared:

1. `isNonPreviewable()` returns true: `render-intent.js:185–199`
2. Error code `NO_GEOMETRY` dispatched: `auto-preview-controller.js:675–692`
3. `handleConfigDependencyError()` calls `previewManager.clear()`: `main.js:5067–5079`
4. Mesh removed from Three.js scene: `preview.js:3575–3600`

**Status:** Code-confirmed, unit-tested (Probe 5). Requires runtime verification.

#### S-008 — Spontaneous geometry (PARTIALLY FIXED by BUG-C)

Stale debounce timers are cancelled and pending parameters cleared when entering non-previewable mode:

- Debounce timer cancelled: `auto-preview-controller.js:666–668`
- Pending parameters cleared: `auto-preview-controller.js:670–673`
- Render audit counter added for diagnostics: `auto-preview-controller.js:646–654`

**Remaining gap:** The console-interaction trigger path is not explicitly addressed. If opening/closing the console panel triggers `onParameterChange()` via a DOM layout change, a render could still occur.

**Status:** Primary path fixed. Edge case unverified.

#### S-011 — Console updates unexpectedly (BY DESIGN)

Auto-preview fires debounced renders 800ms after parameter changes (`auto-preview-controller.js:54`). This is the browser's equivalent of desktop's auto-reload-on-file-change. The user may not perceive their UI interaction as a render trigger. This is a design characteristic, not a bug.

**Addressable by:** Adding a visible "rendering..." indicator when auto-preview fires, so the user understands why the console updated.

#### S-014 — Preset switch degradation (FIXED by BUG-A)

Three fixes prevent state corruption across preset switches:

1. `_callMainInvoked` guard: `openscad-worker.js:1458–1473` — detects double `callMain()` and forces worker restart
2. `clearMountedFiles()` on every render: `openscad-worker.js:2236–2239` — prevents stale companion files
3. `clearPreviewCache()` on project file change: `auto-preview-controller.js:299–305` — prevents stale cached results

**Status:** Code-confirmed. Requires runtime verification across 3+ sequential preset switches.

**Fixable within current architecture?** Yes — all fixes are already implemented. Remaining work is runtime verification and S-011 UX improvement.

**Layer 1 (WASM) limitation?** No — the WASM's single-invocation constraint for `callMain()` is correctly handled by the worker restart mechanism.

---

### Bucket 5: UI / Workflow — 3 scenarios

**Scenarios:** S-009, S-010, S-016

**Description:** The browser's interface design differs from desktop OpenSCAD conventions, causing confusion.

#### S-009 — SVG export workflow unclear

Desktop OpenSCAD uses File > Export > Export as SVG after completing an F6 render. The browser's export flow is structurally different. The `resolve2DExportIntent()` function (`render-intent.js:116–163`) correctly adjusts parameters for 2D export, and the worker's two-pass fallback handles 3D-to-2D conversion (`openscad-worker.js:1489–1527`). The gap is that the user cannot find or understand the workflow, not that the workflow doesn't function.

#### S-010 — Console vs Messages confusion

Desktop OpenSCAD has a single console. The browser has two panels (Console Output + OpenSCAD Messages). This is a browser-specific design decision with no desktop equivalent.

#### S-016 — Grid color/darkness control

The stakeholder wants grid customization. Desktop OpenSCAD's grid control exists in Edit > Preferences > 3D View, but the extent of grid-specific customization is UNVERIFIED. The browser has no grid control. This may be a feature request rather than a parity gap.

**Fixable within current architecture?** Yes — all are UI-level changes. S-009 requires workflow redesign/documentation. S-010 requires console panel unification or clearer labeling. S-016 requires a Three.js scene configuration control.

**Layer 1 (WASM) limitation?** No.

---

## 3. WASM-Blocked Limitations

The following gaps **cannot be resolved by any correction path** without either (a) recompiling the WASM binary with different options, or (b) implementing client-side workarounds that approximate the missing behavior.

| Limitation | Scenarios | Description | Workaround Feasibility |
|------------|-----------|-------------|----------------------|
| **No F5 Preview mode** | S-005 (partial) | The WASM engine performs F6-equivalent rendering. F5-only features (`color()` display, `#` overlay, `%` background modifier) have no native engine support. | Client-side: detect `color()` and `#` via regex, apply approximate rendering. Already partially implemented. Dual-render for `#` is achievable. |
| **COFF emission unknown** | S-001–S-004, S-006 | If the WASM binary does not include the `render-colors` feature (PR #5185), OFF output will lack per-face RGBA data. | Client-side color derivation from SCAD source is theoretically possible but constitutes major architectural work (parse `color()` assignments, map to geometry faces). |
| **Virtual FS warning behavior** | S-012 | Emscripten's MEMFS may not trigger the same warning as desktop's filesystem when an `include` file is missing. | Synthetic warning: detect missing companion files before render and inject a warning into the console output. |
| **Image format support** | S-013 | The WASM build may not include image parsing libraries needed for `surface()` with PNG/JPEG inputs. | No JS-layer workaround for `surface()` image import. A pre-processing step that converts images to height-map `.dat` files is theoretically possible but complex. |

**Critical determination required:** A single runtime test (documented in `docs/audit/parity-probe-results.md`, Probe 1 Manual Verification Procedure) will resolve the COFF question and immediately reclassify S-001 through S-004 and S-006 as either **resolved** or **Layer 1 blocked**.

---

## 4. Decision Brief: Three Correction Paths

### Overview

| Path | Philosophy | Effort | WASM Dependency | Scenarios Resolved |
|------|-----------|--------|-----------------|-------------------|
| **A** | Strict Desktop Parity | Very High | Blocking if no COFF | Up to 14 of 16 |
| **B** | Minimal Desktop Baseline | Low | Conditional | 5–10 of 16 |
| **C** | Constrained Hybrid | Moderate | Conditional | 8–13 of 16 |

All three paths share a prerequisite: **run the COFF runtime test first** (15 minutes of manual work). The result fundamentally changes the scope of every path.

---

### Path A: Strict Desktop Parity

**Philosophy:** Match desktop OpenSCAD behavior exactly for all scenarios. Highest fidelity, highest effort.

**What this path does:**

1. **Color passthrough (S-001–S-004, S-006):** If COFF works, no action needed. If COFF doesn't work, build a client-side color derivation engine that parses SCAD source, extracts `color()` assignments, and maps them to geometry faces. Alternatively, recompile the WASM binary with `render-colors` enabled.
2. **`#` modifier dual-render (S-005):** Implement two-pass rendering in `loadOFF()` — first pass with COFF colors, second pass with `#ff5151` overlay. Remove the `#` detection gate so `#` works without `color()`.
3. **Unified console (S-010):** Merge Console Output and OpenSCAD Messages into a single panel matching desktop OpenSCAD's layout.
4. **SVG export workflow (S-009):** Redesign export UI to match desktop's File > Export > Export as SVG convention with clear step-by-step guidance.
5. **Missing file warning (S-012):** Inject synthetic "WARNING: Can't open include file" into console output when companion files are known missing before render.
6. **Image import (S-013):** Investigate WASM image library support; if blocked, implement pre-processing pipeline.
7. **Auto-preview indicator (S-011):** Add visible "rendering..." feedback when auto-preview debounce fires.
8. **Grid control (S-016):** Add grid color/opacity controls to the viewer settings.
9. **Runtime-verify BUG-A/B/C (S-007, S-008, S-014):** Confirm existing fixes are effective end-to-end.

**Scenario resolution:**

| Scenario | Resolved? | Notes |
|----------|-----------|-------|
| S-001–S-004, S-006 | Yes (if COFF) / Requires WASM rebuild (if no COFF) | COFF: zero work. No COFF: major effort or Layer 1 blocker. |
| S-005 | Yes (approximate — dual-render) | Client-side approximation. True F5 parity not possible. |
| S-007 | Yes | Already fixed (BUG-B). |
| S-008 | Yes | BUG-C fix + console-interaction edge case investigation. |
| S-009 | Yes | Export UI redesign. |
| S-010 | Yes | Console unification. |
| S-011 | Yes | Render indicator. |
| S-012 | Yes | Synthetic warning. |
| S-013 | Partial | Depends on WASM image support; workaround complex. |
| S-014 | Yes | Already fixed (BUG-A). |
| S-015 | Yes | Aggregate — resolved if all others are. |
| S-016 | Yes | Grid controls. |

**Stakeholder experience:** The browser tool would closely replicate the desktop OpenSCAD visual experience. The stakeholder would see per-object colors, approximate `#` transparency, clean blank states, familiar console layout, and guided SVG export. The remaining gap would be the `#` modifier's dual-render approximation (close but not pixel-identical to desktop).

**Risks:**
- If COFF is not emitted: Path A requires either a WASM rebuild (requires build infrastructure) or a SCAD-source color derivation engine (estimated weeks of work, fragile for complex SCAD files).
- Console unification and export UI redesign are substantial UI refactors.

---

### Path B: Minimal Desktop Baseline

**Philosophy:** Fix the most impactful gaps, document known limitations. Lowest effort.

**What this path does:**

1. **Runtime-verify COFF output (prerequisite).** If COFF works: S-001–S-004 and S-006 are immediately resolved. If not: document as known limitation.
2. **Runtime-verify BUG-A/B/C fixes (S-007, S-008, S-014).** Confirm existing code fixes work end-to-end.
3. **Update stale documentation.** `COLOR_PASSTHROUGH.md` currently says `rollout: 0, killSwitch: true` but code says `rollout: 100, killSwitch: false`. Update to reflect reality.
4. **Document known limitations.** Write user-facing documentation explaining:
   - `#` modifier transparency is approximate (S-005)
   - Console has two panels (S-010)
   - SVG export workflow differs from desktop (S-009)
   - Grid control not available (S-016)

**Scenario resolution:**

| Scenario | Resolved? | Notes |
|----------|-----------|-------|
| S-001–S-004, S-006 | If COFF works: Yes. If no COFF: Documented limitation. | Zero code changes — existing pipeline handles it. |
| S-005 | No (documented limitation) | Current approximation stands. |
| S-007 | Yes (verify BUG-B) | Already implemented. |
| S-008 | Partial (verify BUG-C) | Primary path fixed; edge case documented. |
| S-009 | No (documented limitation) | Workflow difference documented. |
| S-010 | No (documented limitation) | Dual-console design documented. |
| S-011 | No (documented as by-design) | Auto-preview behavior explained. |
| S-012 | No (documented limitation) | WASM warning behavior documented. |
| S-013 | No (documented limitation) | Image import limitation documented. |
| S-014 | Yes (verify BUG-A) | Already implemented. |
| S-015 | Partial | Core rendering works; UX gaps documented. |
| S-016 | No (documented limitation) | Feature request acknowledged. |

**Stakeholder experience:** If COFF works, the stakeholder sees per-object colors in the preview — the highest-impact win. Blank display and preset switching work correctly. The `#` modifier shows an approximate pink overlay (all-pink instead of normal+pink). SVG export, console layout, and grid control remain different from desktop, with documentation explaining the differences.

If COFF does not work, the stakeholder sees a single-color mesh with a color legend showing parameter swatches as a fallback. Documentation explains this is a WASM limitation.

**Risks:**
- If COFF doesn't work, the most impactful gap (color passthrough) remains.
- Documented limitations may not satisfy the stakeholder's expectation of "base OpenSCAD functionality" (S-015).

---

### Path C: Constrained Hybrid

**Philosophy:** Fix what's fixable at the JS layer, improve workarounds for WASM-blocked gaps, document the rest. Pragmatic middle ground.

**What this path does:**

1. **All of Path B** — runtime verification, documentation updates.
2. **Improve `#` modifier approximation (S-005):** Dual-render in `loadOFF()` — normal COFF colors + `#ff5151` overlay. Remove the detection gate so `#` works without `color()`.
3. **Synthetic missing-file warning (S-012):** Before render, check if companion files referenced by `include` directives are missing; inject "WARNING: Can't open include file" into console output.
4. **Auto-preview indicator (S-011):** Show a visible "Rendering..." or spinner when auto-preview debounce fires, so the user understands why the console updated.
5. **Improve color legend fallback:** If COFF doesn't work, enhance the single-color fallback with a more informative legend showing all color parameters and their semantic meaning (object type mappings).
6. **SVG export guidance (S-009):** Add contextual help text or a guided flow for SVG export, short of a full UI redesign.
7. **Console panel labeling (S-010):** Add descriptive labels/tooltips to clarify the distinction between Console Output and OpenSCAD Messages, short of full unification.
8. **Update COLOR_PASSTHROUGH.md and OFF triangle count regex** (cosmetic fixes from Phase 4 findings).

**Scenario resolution:**

| Scenario | Resolved? | Notes |
|----------|-----------|-------|
| S-001–S-004, S-006 | If COFF works: Yes. If no COFF: Improved fallback (legend), but still single-color. | COFF: zero work. No COFF: better fallback UX. |
| S-005 | Yes (improved approximation) | Dual-render: normal colors + pink overlay. Closer to desktop. |
| S-007 | Yes (verify BUG-B) | Already implemented. |
| S-008 | Yes (verify BUG-C + edge case) | Investigate console-interaction trigger path. |
| S-009 | Partial | Contextual guidance, not full redesign. |
| S-010 | Partial | Better labels/tooltips, not full unification. |
| S-011 | Yes | Render indicator. |
| S-012 | Yes | Synthetic warning for known missing files. |
| S-013 | No (documented limitation) | WASM image support is Layer 1. |
| S-014 | Yes (verify BUG-A) | Already implemented. |
| S-015 | Mostly | Core behaviors replicated; UX polish improved. |
| S-016 | No (documented limitation) | Acknowledged; lower priority than color/display gaps. |

**Stakeholder experience:** If COFF works, the stakeholder sees per-object colors AND an improved `#` overlay (dual-render: normal colors visible through the pink layer, matching desktop more closely). Missing-file warnings appear. Auto-preview has a visual indicator. SVG export has contextual guidance.

If COFF doesn't work, the stakeholder sees an enhanced single-color fallback with a detailed color legend explaining object-type-to-color mappings. The `#` modifier still applies a highlight effect (though single-color). The experience is degraded from COFF but better than current.

**Risks:**
- The dual-render `#` implementation requires renderer changes (moderate complexity).
- Console panel improvements may be insufficient if the stakeholder expects full desktop parity (S-015).
- If COFF doesn't work, the improved fallback is still meaningfully different from desktop.

---

### Path Comparison Matrix

| Scenario | Path A | Path B | Path C |
|----------|--------|--------|--------|
| **S-001** (3D-print color) | ✅ COFF / 🔧 rebuild | ✅ COFF / 📄 doc | ✅ COFF / 📊 legend |
| **S-002** (Laser color) | ✅ COFF / 🔧 rebuild | ✅ COFF / 📄 doc | ✅ COFF / 📊 legend |
| **S-003** (First layer color) | ✅ COFF / 🔧 rebuild | ✅ COFF / 📄 doc | ✅ COFF / 📊 legend |
| **S-004** (Engine colors) | ✅ COFF / 🔧 rebuild | ✅ COFF / 📄 doc | ✅ COFF / 📊 legend |
| **S-005** (`#` transparency) | ✅ dual-render | ❌ current approx | ✅ dual-render |
| **S-006** (Color passthrough) | ✅ COFF / 🔧 rebuild | ✅ COFF / 📄 doc | ✅ COFF / 📊 legend |
| **S-007** (Blank display) | ✅ BUG-B | ✅ BUG-B | ✅ BUG-B |
| **S-008** (Spontaneous render) | ✅ full fix | ⚠️ partial | ✅ investigate edge | 
| **S-009** (SVG workflow) | ✅ redesign | 📄 doc | ⚠️ guidance |
| **S-010** (Console panels) | ✅ unify | 📄 doc | ⚠️ labels |
| **S-011** (Console updates) | ✅ indicator | 📄 doc | ✅ indicator |
| **S-012** (Missing file warn) | ✅ synthetic | 📄 doc | ✅ synthetic |
| **S-013** (Image import) | ⚠️ depends on WASM | 📄 doc | 📄 doc |
| **S-014** (Preset degrade) | ✅ BUG-A | ✅ BUG-A | ✅ BUG-A |
| **S-015** (Parity request) | ✅ | ⚠️ partial | ⚠️ mostly |
| **S-016** (Grid control) | ✅ | 📄 doc | 📄 doc |

Legend: ✅ Resolved, ⚠️ Partially resolved, ❌ Not resolved, 📄 Documented, 📊 Improved fallback, 🔧 Requires WASM rebuild

### Effort Estimates

| Path | JS/Renderer Work | UI Work | WASM Work | Documentation | Total |
|------|-----------------|---------|-----------|---------------|-------|
| **A** | Dual-render, color derivation (if no COFF) | Console unification, export redesign, grid controls | Possible rebuild | Full update | Very High |
| **B** | None (existing code) | None | None | Known-limitation docs, COLOR_PASSTHROUGH.md update | Low |
| **C** | Dual-render, synthetic warnings, legend improvement | Contextual guidance, panel labels, render indicator | None | Targeted updates | Moderate |

---

## 5. Prerequisite Action (All Paths)

Before selecting a path, execute the COFF runtime test:

1. Open the app in a browser with DevTools Console open
2. Load a SCAD file containing multiple `color()` calls (e.g., `tests/fixtures/color-debug-test.scad`)
3. Look for the console diagnostic at `auto-preview-controller.js:808–814`:
   - **`COFF ✓`** → WASM emits per-face RGBA. S-001–S-004, S-006 are resolved.
   - **`OFF (no color)`** → WASM strips color data. 5 scenarios are Layer 1 blocked.
4. Additionally verify: `[Preview] Loading COFF` vs `[Preview] Loading OFF` at `preview.js:1116–1118`

**This single test changes the scope of every correction path.** It takes approximately 15 minutes and eliminates the audit's largest unknown.

---

## 6. Additional Findings (Housekeeping)

These items surfaced during the investigation and should be addressed regardless of which path is selected:

| Finding | Location | Impact | Action |
|---------|----------|--------|--------|
| `COLOR_PASSTHROUGH.md` is stale | `docs/notes/COLOR_PASSTHROUGH.md:92–115` | Developer confusion — doc says gated, code says enabled | Update to reflect `rollout: 100, killSwitch: false` |
| Worker OFF triangle count regex misses COFF | `openscad-worker.js:2441` | Cosmetic — `stats.triangles` reports 0 for COFF | Update regex to `/^C?OFF\s+\d+\s+(\d+)/` |
| `setRenderState()` is intentionally a no-op | `preview.js:511–512` | None — correct decision; fabricated tinting was wrong | No action needed; document the rationale |
| Per-face alpha from COFF discarded | `preview.js:1167` | Prevents future per-face transparency support | Note for future if dual-render is implemented |

---

## References

### Phase 1–4 Deliverables

- **Scenario matrix:** `docs/audit/scenario-matrix.md` — 16 scenarios with corpus extraction and desktop verification
- **Desktop coloring theory:** `docs/audit/desktop-coloring-theory.md` — three-system model with GitHub source validation
- **Browser pipeline trace:** `docs/audit/browser-pipeline-trace.md` — 16 scenarios traced through 5 stages with code citations
- **Parity probe results:** `docs/audit/parity-probe-results.md` — 5 probes, 57 unit tests, manual COFF verification procedure

### Key Source Files

| File | Key Functions | Lines |
|------|--------------|-------|
| `src/js/auto-preview-controller.js` | `scadUsesColor()`, `scadUsesDebugModifier()`, `renderPreview()` | 605–637, 644–830 |
| `src/js/preview.js` | `loadOFF()`, `loadSTL()`, `setRenderState()`, `clear()` | 511–512, 935–1264, 3575–3600 |
| `src/worker/openscad-worker.js` | `buildDefineArgs()`, `renderWithCallMain()`, `_callMainInvoked` guard | 1050–1126, 1304–1477, 2441 |
| `src/js/render-intent.js` | `isNonPreviewable()`, `resolve2DExportIntent()` | 116–233 |
| `src/js/feature-flags.js` | `color_passthrough` flag | 105–116 |
| `src/js/color-utils.js` | `hexToRgb()`, `DEBUG_HIGHLIGHT_*` | 14–69 |

### Test Files

- `tests/unit/parity-probes.test.js` — 57 Phase 4 probe tests
- `tests/unit/parity-harness.test.js` — 31 Phase 1 regression fixtures
- `tests/fixtures/color-debug-test.scad` — Multi-color SCAD fixture for runtime testing
