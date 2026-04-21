# 02 — Complexity hotspots

OpenSCAD Assistive Forge — Professional Code Review, 2026-04-17.

This phase deep-dives the largest files in `src/` (and `index.html`), proposes split shapes, scores risk, and lists the characterization tests Phase 5 must add before any of these splits land. It is a **read-only** analysis; nothing here moves code yet.

- Per the plan, the targeted set is the top-10 largest source files (JS/CSS) plus `index.html`.
- All splits below are stated as *outcomes* (what shape the code should take), not as patches. Phase 6 turns them into ranked, micro-planned recommendations.
- Each split is annotated with: estimated LOC delta, risk score (Low / Medium / High), and the **characterization test** required before it ships.

Provenance flags as in [Phase 1 §7](./01-architecture-redundancy.md): **OBSERVED** | **INFERRED** | **UNVERIFIED**.

---

## 0. Methodology + line-count calibration

Baseline [00-baseline.md §3-§4](./00-baseline.md) reports per-file LOC using `Get-Content <file> | Measure-Object -Line`. PowerShell's `Measure-Object -Line` counts only **non-empty** lines, so the published numbers undercount blank lines. This phase uses **physical line count** (matches `cloc` / `tokei` semantics), produced by [.audit-scratch/file-anatomy.mjs](../../../.audit-scratch/file-anatomy.mjs) and [.audit-scratch/css-anatomy.mjs](../../../.audit-scratch/css-anatomy.mjs).

Calibration delta per file (**OBSERVED**):

| File | Baseline (non-empty) | Phase 2 (physical) | Δ |
|---|---:|---:|---:|
| `src/main.js` | 11,303 | 12,653 | +1,350 (≈ +12 %) |
| `src/styles/components.css` | 11,957 | 13,994 | +2,037 (≈ +17 %) |
| `src/styles/layout.css` | 3,797 | 4,382 | +585 (≈ +15 %) |
| `src/js/preview.js` | 4,144 | 4,734 | +590 (≈ +14 %) |
| `src/js/tutorial-sandbox.js` | 3,300 | 3,659 | +359 (≈ +11 %) |
| `src/worker/openscad-worker.js` | 2,556 | 2,827 | +271 (≈ +11 %) |
| `src/js/ui-generator.js` | 2,362 | 2,732 | +370 (≈ +16 %) |
| `src/js/auto-preview-controller.js` | 1,857 | 2,042 | +185 (≈ +10 %) |
| `src/js/saved-projects-manager.js` | 2,027 | 2,242 | +215 (≈ +11 %) |
| `src/js/saved-projects-ui.js` | 1,562 | 1,753 | +191 (≈ +12 %) |
| `src/js/file-handler.js` | 1,568 | 1,744 | +176 (≈ +11 %) |
| `src/js/preset-manager.js` | 1,531 | 1,724 | +193 (≈ +13 %) |

Relative ranking is unchanged. From here on, all "lines" means **physical lines**. The baseline numbers remain valid for relative comparison and bundle-budget context.

---

## 1. `src/main.js` — 12,653 lines · the entry-point god-module

> **Verdict:** the single largest architectural debt in the repo. **Decompose-First.** Recommend extracting at least 8 controller-shaped subsystems into existing or new modules; the residual `main.js` should be a wiring shell of ≤ 1,500 lines.

**OBSERVED structure** (from [.audit-scratch/anatomy/main.js.md](../../../.audit-scratch/anatomy/main.js.md)):

- 28 top-level declarations.
- 0 exports — pure entry point loaded from `index.html`.
- 7 module-level `let` / `var` bindings (controller singletons + project-id state).
- **196 `addEventListener(…)` calls inside the file.**
- 13 module-level `STORAGE_KEY_*` string constants.
- The function shape is dominated by **one giant `initApp` function** that begins at `src/main.js:304` and the next named top-level function (`renderLibraryUI`) doesn't appear until `src/main.js:12012`. That makes `initApp` ≈ **11,708 physical lines long** — by itself larger than every other file in the project except `components.css`.

**INFERRED:** every `addEventListener` inside `initApp` is wiring a UI event to a controller that already lives in its own `*-controller.js` module (Phase 1 §1.2 confirmed `file-handler`, `auto-preview-controller`, `render-controller`, `comparison-controller`, `tutorial-sandbox`, etc.). `initApp` is therefore an orchestration script, not a feature module — but it does too much orchestration in one place.

### 1.1 Recommended split (target shape)

> Each row below is one **outcome**. It assumes the destination controller already exists or that a new `*-controller.js` will be added. Phase 6 will rank these.

| # | Subsystem to extract | Approximate source range in `main.js` | New module | Est. LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | Service-worker / update-banner / cache-clear flow | the 14 listeners around 697-895 | `src/js/sw-controller.js` (new) | ~600 | Low | Pure DOM wiring + postMessage routing; covered by `tests/unit/sw-manager.test.js` style tests. |
| 2 | First-visit modal / welcome flow | listeners around 1671 + supporting helpers | `src/js/welcome-controller.js` (new) | ~400 | Low | UI-only. Extract uses existing `modal-manager.js`. |
| 3 | Storage clear / export-backup / import-backup / import-folder | listeners 1359-1451 | `src/js/storage-actions-controller.js` (new) | ~700 | **Medium** | Touches `saved-projects-manager.js`. Needs file-system-access + IDB integration tests. |
| 4 | Project-export modal (preserve checkbox + STL-bundle) | 1144-1249 | `src/js/project-export-controller.js` (new) | ~450 | **Medium** | Couples render-controller output, file-handler, zip-handler. |
| 5 | Modal toolbar / open-with-recovery / smart-cache | 782-803 + smart-cache helpers | `src/js/modal-toolbar-controller.js` (new) | ~600 | Low | Pure modal wiring. |
| 6 | Library-UI bridge (`renderLibraryUI`, `getEnabledLibrariesForRender`) | 12012-12127 | move into `src/js/library-manager.js` | ~120 | Low | Already a 1-file responsibility; just relocate. |
| 7 | `DESKTOP_REFERENCE_GEOMETRY` + `findMatchingReference` | 12129-end | new `src/js/reference-geometry.js` or move into `overlay-grid-controller.js` | ~500 | Low | Pure data + lookup; trivially testable. |
| 8 | All `STORAGE_KEY_*` constants (lines 140-155) | top-of-file | move into `src/js/storage-keys.js` | ~15 | Low | Phase 1 §2.3 already recommends consolidating localStorage access; this is the same target. |
| 9 | `resolve2DExportParameters` / `checkBrowserSupport` / `showUnsupportedBrowser` | 224-282 | move into `src/js/file-handler.js` (export resolver) and `src/js/dependency-checker.js` (browser support) | ~80 | Low | Both already have natural homes per the import graph. |

**Estimated post-split state:** `src/main.js` shrinks from 12,653 to roughly 1,300-1,500 lines — the residual being the `initApp` orchestration that wires together the `*-controller.js` modules and decides their construction order.

### 1.2 Required characterization tests (Phase 5 owns)

Before any of the above ships:

- **E2E:** "service worker shows update banner, banner dismiss persists" (covers split #1).
- **E2E:** "first-visit modal shows once, subsequent visits skip" (covers split #2).
- **E2E:** "export backup / import backup roundtrip preserves projects + folders" (covers splits #3 and #4).
- **Unit:** snapshot of `STORAGE_KEY_*` constants exported from `storage-keys.js` so the rename is mechanical, not behavioural (covers split #8).
- **Visual:** baseline of the welcome modal at one preset size (covers split #2).

---

## 2. `src/js/preview.js` — 4,734 lines · the Three.js wrapper class

> **Verdict:** large but cohesive — single exported class `PreviewManager`. **Decompose-First**, but the splits are interior to one class, not module-level. Three plausible extractions.

**OBSERVED:** 19 top-level declarations, 5 exports (`isThreeJsLoaded`, `getThreeModule`, `CORNFIELD_BACK_COLOR`, `DESKTOP_SHININESS`, `PreviewManager`). Module-level `let`/`var`: 0 (state lives on `this`). 19 `addEventListener` calls, all inside class methods. `PreviewManager` class begins at `src/js/preview.js:196` and runs to end-of-file — so the class is ≈ 4,540 lines long.

10 `STORAGE_KEY_*` constants live at lines 53-62; per Phase 1 §2.3 these belong in `storage-keys.js`.

### 2.1 Recommended split

| # | Concern | Range (approx) | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | Storage-key constants | 53-62 | `src/js/storage-keys.js` | ~10 | Low | Trivial; depends on §1 split #8. |
| 2 | Camera-control button wiring (lines 1269-1362, 1849-1855, …) | 17 button listeners | `src/js/camera-panel-controller.js` (already exists, currently 619 LOC) | ~300 | Low | The panel controller already exists; preview shouldn't be mounting its buttons. |
| 3 | Color/light/shading constants (`PREVIEW_COLORS`, `LOD_CONFIG`, `CORNFIELD_*`, `DESKTOP_SHININESS`) | 96-194 | `src/js/preview-theme.js` (new) | ~100 | Low | Pure data. Currently duplicates color tokens that should be derivable from CSS variables (see Phase 4). |
| 4 | LOD-warning-dismissed flag handling | scattered | `src/js/preview-settings-drawer.js` (already exists, 222 LOC) | ~50 | Low | Settings-drawer is a natural home. |

**Estimated post-split state:** `src/js/preview.js` ≈ 4,250 lines, still large but now exclusively scene/render/camera/STL math — every line belongs.

### 2.2 Required characterization tests

- **Visual:** add a baseline of the empty preview pane (no loaded model) at default zoom — current visual suite has 13 baselines but verifying which one this maps to is **UNVERIFIED**; Phase 5 will check.
- **Unit:** assert `STORAGE_KEY_*` re-exports match before/after the move (mechanical safety).
- **Unit:** add a smoke test that constructs a `PreviewManager` against a stubbed canvas and disposes it — currently no such test exists (`tests/unit/preview*.test.js` does not exercise the whole class).

---

## 3. `src/js/tutorial-sandbox.js` — 3,659 lines · stateful tutorial engine

> **Verdict:** big but mostly content + many small functions. The **hot extraction** is the inline tutorial content (lines 825-1483); the rest is hard to split cleanly because of 23 module-level mutable bindings.

**OBSERVED** (from anatomy):

- 105 top-level declarations, 2 exports (`startTutorial`, `closeTutorial`).
- **23 module-level `let` bindings** — all are tutorial runtime state (`activeTutorial`, `currentStepIndex`, `tutorialOverlay`, `previousFocus`, `focusTrapCleanup`, etc.).
- Two unused exports identified in [Phase 1 §4.1](./01-architecture-redundancy.md): `isTutorialActive`, `getCurrentTutorialId`.

The single largest body of the file is the `TUTORIALS` constant at `src/js/tutorial-sandbox.js:825`, which runs until `saveTutorialProgress` at line 1483 — i.e. ≈ **658 lines of inline tutorial content data**.

### 3.1 Recommended split

| # | Concern | Range | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | `TUTORIALS` data | 825-1482 | `src/js/tutorial-content.js` (new export-only) **or** `src/data/tutorials.json` + a loader | ~660 | Low | Pure data. Loader is a 5-line `import`. JSON variant lets non-developers edit content. |
| 2 | Tutorial content data → JSON | as #1 but JSON | `src/data/tutorials.json` | ~660 | **Medium** | JSON loses inline JS conditionals (`showWhen` predicates). Would need predicate names referenced by string. Defer until §6. |
| 3 | Drawer-state observers (`setupDrawerObserver`, `clearDrawerObserver`, `handleDrawerStateChange`, `checkIfAnyTargetInsideDrawer`, `_showDrawerReopenPrompt`) | 612-799 | `src/js/tutorial-drawer-bridge.js` (new) | ~190 | Low | Already a self-contained sub-domain. |
| 4 | Resume / error dialogs (`showTutorialResumeDialog`, `showTutorialErrorDialog`) | 1537-1648 | `src/js/dialogs.js` (already exists, 196 LOC) | ~120 | Low | These are dialogs; they belong in the dialog module. |
| 5 | Two unused functions | 3626-3650 | delete (per Phase 1 §4.1) | ~30 | Low | Already on the dead-code list. |

**Estimated post-split state:** `tutorial-sandbox.js` ≈ 2,000 lines, focused exclusively on the runtime engine (step setup, focus trap, navigation, ARIA announcements). The 23 `let` bindings remain — they're inherent to the tutorial-runtime singleton.

### 3.2 Required characterization tests

- **E2E:** at least one tutorial run (start → next → close) per tutorial in the data file. Phase 5 will check whether such a spec exists.
- **Unit:** if data is moved to JSON (§3.1 #2), add a JSON-schema validation test.
- **A11y (Phase 4):** verify `setupFocusTrap` (line 1943) and `setBackgroundInert` (line 1955) keep working after split #3 — these are accessibility-critical.

---

## 4. `src/worker/openscad-worker.js` — 2,827 lines · the WASM bridge

> **Verdict:** **Decompose-First**, but only partially. Phase 3 (WASM bridge fitness) owns the harder questions. For Phase 2: extract output validators, file-mount helpers, and the error-translation table.

**OBSERVED:**

- 41 top-level declarations, 0 exports (worker entry, communicates via `self.postMessage`).
- 12 module-level `let` bindings — all WASM-instance / mount caches / capability flags / memory metrics.
- `ERROR_TRANSLATIONS` constant occupies `src/worker/openscad-worker.js:103-233` (≈ 131 lines).
- `render` function spans `src/worker/openscad-worker.js:2160-2660` (≈ 501 lines).
- `renderWithCallMain` spans 1233-1613 (≈ 381 lines).
- 4 output-validation/post-process functions (`validate2DOutput` 1614, `validateSVGOutput` 1634, `validateDXFOutput` 1706, `postProcessDXF` 1814) total ≈ 415 lines.
- 5 mount/unmount helpers (`mountFonts` 518, `mountFiles` 769, `clearMountedFiles` 935, `mountLibraries` 994, `clearLibraries` 1136) total ≈ 760 lines.

### 4.1 Recommended split

| # | Concern | Range | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | `ERROR_TRANSLATIONS` table + `translateError` | 103-285 | `src/worker/error-translations.js` (new) — sibling of `src/js/error-translator.js` | ~180 | Low | Phase 3 will check whether this table can/should merge with `src/js/error-translator.js` (currently 512 lines, separate concerns). For Phase 2: separate file inside the worker tree. |
| 2 | Output validators (2D / SVG / DXF / DXF post-process) | 1614-2096 | `src/worker/output-validators.js` (new) | ~415 | **Medium** | These are pure functions over WASM output. Risk = a regression in DXF compatibility (the file's section banner at line 1789 explains exactly why this code exists; that context must travel with the move). |
| 3 | File / font / library mount helpers | 518-1154 | `src/worker/wasm-fs.js` (new) | ~760 | **Medium** | Touches `openscad.FS` API directly. Needs a worker-level integration test before extraction. |
| 4 | Memory monitor (`MEMORY_WARNING_THRESHOLD_MB`, `checkMemoryBeforeRender`, `getMemoryUsage`) | 2096-end | `src/worker/wasm-memory.js` (new) | ~150 | Low | Self-contained. |
| 5 | The two `_callMainInvoked` / `wasmInitDurationMs` telemetry counters | 46, 84 | move into `src/js/memory-monitor.js` (already exists) **or** a new `src/worker/wasm-telemetry.js` | ~30 | Low | Tiny but pulls telemetry to one place. |

**Estimated post-split state:** `openscad-worker.js` ≈ 1,300 lines covering only `init`, `render`, `cancelRender`, and the message dispatcher. Each extracted file becomes independently testable.

### 4.2 Required characterization tests

- **Worker integration:** "render a known SCAD file → validate STL byte-length vs golden fixture." Phase 5 will check whether this exists; the import graph shows `tests/unit/openscad-worker*.test.js` is referenced but the spec file count line in [00-baseline.md §5](./00-baseline.md) lists 62 unit specs total — coverage for the worker specifically is **UNVERIFIED**.
- **Worker integration:** "DXF render → `postProcessDXF` produces output that passes `validateDXFOutput`" — guards split #2.
- **Worker integration:** "mountFonts → render with text() primitive → returns non-zero STL." — guards split #3.

---

## 5. `src/js/ui-generator.js` — 2,732 lines · form-control factory

> **Verdict:** large but well-factored — 23 named exports, each a single-purpose helper, plus a per-control-type create function (`createSliderControl`, `createNumberInput`, `createSelectControl`, `createToggleControl`, `createTextInput`, `createColorControl`, `createSvgGallery`, `createFileControl`, `createVectorControl`, `createRawControl`). **Decompose-First** by control family.

**OBSERVED:**

- 52 top-level declarations, 23 exports.
- 7 module-level `let` bindings (gallery state, parameter values, original limits, metadata) — Phase 1 already noted unused `index` at line 205.
- 32 `addEventListener` calls, all inside create functions.
- 10 distinct `create*Control` factories ranging from 50 to 600 lines each.

### 5.1 Recommended split

| # | Concern | Range | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | `createSliderControl` + `createNumberInput` + reset-button helpers | 1025-1402 | `src/js/controls/numeric.js` | ~380 | Low | Numeric is the largest single family. |
| 2 | `createSelectControl` + `createToggleControl` + `createTextInput` | 1403-1566 | `src/js/controls/discrete.js` | ~165 | Low | Three small kin. |
| 3 | `createColorControl` + `createSvgGallery` | 1567-1797 | `src/js/controls/visual.js` | ~230 | Low | Color picker + SVG gallery share preview semantics. |
| 4 | `createFileControl` (the 466-line monster, 1798-2263) | 1798-2263 | `src/js/controls/file.js` | ~470 | **Medium** | Touches FileSystemHandle, drag-drop, file-handler. Highest single-control LOC; deserves its own file. |
| 5 | `createVectorControl` + `createRawControl` | 2264-2533 | `src/js/controls/composite.js` | ~270 | Low | Both are composite controls. |
| 6 | Search / filter / jump-select (lines 820-1006) | 820-1006 | `src/js/controls/search.js` | ~190 | Low | Self-contained; uses combobox-nav already through wrapper. |
| 7 | Public API surface (renderParameterUI, setParameterValue, resetParameter, getDefaultValue, …) | top of file + line 2534 | stays in `ui-generator.js` (now becomes the orchestrator) | residual ~600 | — | The file becomes the registry: each control type is dispatched to its own module. |

**Estimated post-split state:** `ui-generator.js` ≈ 600 lines (orchestration + public API only). 6 new files, each ≤ 470 lines.

### 5.2 Required characterization tests

Each control family needs a unit smoke test before the split:

- "render a number param → DOM has slider + spinbox + reset button"
- "render a color param → DOM has `<input type='color'>` + hex input"
- "render a file param → DOM has file button + accept attr"
- "render a vector(3) param → DOM has 3 numeric inputs"
- "render a select param with enum → DOM has searchable combobox"

`tests/unit/ui-generator*.test.js` (exists per [00-baseline.md §5](./00-baseline.md)) — Phase 5 will measure whether each family is currently exercised.

---

## 6. `src/js/auto-preview-controller.js` — 2,042 lines · render dispatcher

> **Verdict:** one class, one *very* long method. **Decompose-First** at the method level inside the class.

**OBSERVED:** 4 top-level declarations, 2 exports (`PREVIEW_STATE` const, `AutoPreviewController` class). 0 module-level `let` (state on `this`). 0 module-scope event listeners. The class methods (from `Grep` over 2-space-indented method declarations):

- Constructor at line 43.
- `onParameterChange(parameters)` at `src/js/auto-preview-controller.js:384` → next method (`addToCache`) at line 1477. **`onParameterChange` is ≈ 1,093 lines long** — by far the densest single function in the codebase outside `main.js#initApp`.
- `clearPreviewCache()` at `src/js/auto-preview-controller.js:1509` → `needsFullRender` at 1907 ≈ 398 lines.

The two methods together account for ≈ 73 % of the file.

### 6.1 Recommended split

| # | Concern | Source | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | The "decide what to render and how" branching inside `onParameterChange` | within method | extract per-branch helpers (private static functions in the file) | restructure ~600 | **High** | Likely the project's most subtle code — preview-vs-full-render decision touches param hashing, color extraction, project-files, quality-resolver, and cache key. Splitting requires explicit characterization tests **first** (see §6.2). |
| 2 | Cache management (`addToCache`, `clearCache`, `clearPreviewCache`, `needsFullRender`, `getCurrentFullSTL`, `getCurrentFullOutput`) | 1477-1948 | `src/js/auto-preview-cache.js` (new) | ~470 | **Medium** | Cache is a separable concern from "should I trigger a render." Becomes a small, testable component. |
| 3 | Resolver injection points (`setPreviewQualityResolver`, `setPreviewParametersResolver`, `setPreviewCacheKeyResolver`) | 347-383 | stays — these are extension hooks | 0 | — | No-op; documented for completeness. |

**Estimated post-split state:** `auto-preview-controller.js` ≈ 1,500 lines, with cache concerns moved to a sibling. The big `onParameterChange` method is *internally* refactored but stays in the controller.

### 6.2 Required characterization tests **before** any restructuring

`onParameterChange` is the highest-risk-per-LOC code in the project. Phase 5 must confirm or add:

- "Changing a low-cost numeric parameter triggers preview render only" (covers the preview-vs-full branch).
- "Changing a parameter while a previous render is in-flight cancels the in-flight render" (covers the cancel path).
- "Two changes within debounce window collapse to one render" (covers the debounce path).
- "Cache hit returns instantly without invoking renderer" (covers the cache path).
- "When `setSchema` flags a parameter as full-render-only, low-cost path is skipped."
- "When `_detectRenderState` returns `RENDER_STATE.FULL_REQUIRED`, preview path is skipped."

If those tests do not exist, **the split #1 above is blocked**. Phase 5 will report and Phase 6 will rank accordingly.

---

## 7. `src/js/saved-projects-manager.js` — 2,242 lines · IDB + folder + asset persistence

> **Verdict:** large but **well-factored at the function level** — 32 named exports, each a clear DAL operation. **Decompose-First** by domain (projects / folders / files / assets / overlays / presets).

**OBSERVED:** 63 top-level declarations, 32 exports, 3 module-level `let` (`db`, `storageType`, `initPromise` — singleton DB + init guard). 0 events.

The 32 exports cluster naturally:

| Cluster | Exports | Approx range |
|---|---|---|
| Init / diagnostics | `initSavedProjectsDB`, `getStorageDiagnostics` | 117-298, 1211-1267 |
| Project CRUD | `listSavedProjects`, `saveProject`, `getProject`, `touchProject`, `updateProject`, `deleteProject`, `getSavedProjectsSummary`, `clearAllSavedProjects` | 602-1210 |
| Folder ops | `createFolder`, `getFolder`, `listFolders`, `renameFolder`, `deleteFolder`, `moveFolder`, `getFolderTree`, `getFolderBreadcrumbs`, `moveProject`, `getProjectsInFolder` | 1268-1759 |
| Project files (multi-file project support) | `addProjectFile`, `getProjectFiles`, `getProjectFileByPath`, `deleteProjectFile`, `deleteAllProjectFiles` | 1760-1918 |
| Assets (binary) | `storeAsset`, `getAsset`, `deleteAsset` | 1919-2021 |
| Overlays | `saveOverlayToProject`, `getProjectOverlays` | 2022-2121 |
| Presets | `savePresetToProject`, `getPresetsFromProject` | 2122-2241 |

### 7.1 Recommended split

| # | Concern | Source | Destination | LOC moved | Risk | Notes |
|---:|---|---|---|---:|:---:|---|
| 1 | DB init / IndexedDB low-level helpers (`getFromIndexedDB`, `saveToIndexedDB`, `deleteFromIndexedDB`, `clearIndexedDB`, `inferFileKind`, `saveProjectFilesInBatches`, `loadProjectFilesFromStore`) | 87-573 | `src/js/saved-projects/db.js` (new) | ~490 | **Medium** | Schema-version migration logic lives here. Needs a regression test for the `DB_VERSION` upgrade path. |
| 2 | Project CRUD | as above | `src/js/saved-projects/projects.js` (new) | ~600 | **Medium** | Largest cluster. Needs a roundtrip test "save → list → get → delete." |
| 3 | Folder ops | 1268-1759 | `src/js/saved-projects/folders.js` (new) | ~490 | Low | Self-contained. Folder tree + breadcrumb logic is naturally one file. |
| 4 | Project-files (multi-file) | 1760-1918 | `src/js/saved-projects/files.js` (new) | ~160 | Low | |
| 5 | Assets (binary) | 1919-2021 | `src/js/saved-projects/assets.js` (new) | ~100 | Low | Binary assets; small surface. |
| 6 | Overlays | 2022-2121 | `src/js/saved-projects/overlays.js` (new) | ~100 | Low | |
| 7 | Presets in projects | 2122-2241 | `src/js/saved-projects/presets.js` (new) | ~120 | Low | Cross-references `preset-manager.js` — keep wires explicit. |

**Estimated post-split state:** `saved-projects-manager.js` becomes the public façade re-exporting from the 7 sub-modules — about 100 lines. Each sub-module ≤ 600 lines and exercises one IDB store.

### 7.2 Required characterization tests

- **Unit:** existing `tests/unit/saved-projects*.test.js` coverage — Phase 5 measures.
- **Unit (new if absent):** "DB upgrade from `DB_VERSION = N-1` to current version" — covers split #1. The migration code at `initSavedProjectsDB` (lines 117-298) is the riskiest single area.
- **Unit (new if absent):** "save → folder-move → list-in-folder → delete-folder" roundtrip — covers splits #2 + #3.

---

## 8. `src/js/saved-projects-ui.js` — 1,753 lines · one giant `init` function

> **Verdict:** 1 export (`initSavedProjectsUI`), 43 event listeners *all inside that one function*. Same shape as `main.js#initApp`, scaled down. **Decompose-First** into sub-renderers.

**OBSERVED:** Only one top-level declaration. The single function spans almost the entire file. The 43 listeners cover 5 visual concerns:

- Folder header (click / dblclick / keydown / drag handlers) — listeners 350-378, 541-550.
- Project card (click / keydown / dragstart / dragend) — listeners 450-473.
- Action buttons (rename, move, delete, export, share, …) — many `btn.addEventListener('click')`.
- Modal helpers (file manager, dismiss).
- Drag-and-drop wiring.

### 8.1 Recommended split

| # | Concern | Destination | LOC moved | Risk | Notes |
|---:|---|---|---:|:---:|---|
| 1 | Folder tree renderer + handlers | `src/js/saved-projects/views/folders-view.js` | ~350 | **Medium** | Drag-and-drop logic must travel intact. |
| 2 | Project card renderer + handlers | `src/js/saved-projects/views/cards-view.js` | ~400 | **Medium** | Largest single concern. |
| 3 | Action buttons (rename / move / delete / export / share) | `src/js/saved-projects/views/actions.js` | ~500 | Low | Most are thin click handlers. |
| 4 | File manager modal | `src/js/saved-projects/views/file-manager.js` | ~250 | Low | Modal is already isolated. |
| 5 | `initSavedProjectsUI` becomes the wiring shell that constructs the four views | stays | residual ~250 | — | Mirror the same shape recommended for `main.js`. |

### 8.2 Required characterization tests

- **E2E:** "create folder → drag project into folder → rename folder → delete empty folder" (covers splits #1, #2, #3).
- **E2E:** "open file manager → rename file → delete file → close" (covers split #4).

---

## 9. `src/js/file-handler.js` — 1,744 lines · file ingest + example library

> **Verdict:** the file's role is well-defined (handle file uploads + restore-from-manifest + show processing overlay), but the **two large data exports** plus the 1,400-line `initFileHandler` function make it god-shaped. **Decompose-First** by data vs. behaviour.

**OBSERVED:** 8 top-level declarations, 4 exports. The two data exports are large:

- `EXAMPLE_DEFINITIONS` at `src/js/file-handler.js:133-215` (≈ 83 lines).
- `PROGRAM_DEFINITIONS` at `src/js/file-handler.js:216-241` (≈ 26 lines).
- `initFileHandler` at line 324 → end-of-file = ≈ 1,420 lines.

### 9.1 Recommended split

| # | Concern | Destination | LOC moved | Risk | Notes |
|---:|---|---|---:|:---:|---|
| 1 | `EXAMPLE_DEFINITIONS` + `PROGRAM_DEFINITIONS` + `findExampleKeyByFileName` + `restoreGalleryFromManifest` | `src/js/file-examples.js` (new) | ~250 | Low | Pure data + small lookup. |
| 2 | `showProcessingOverlay` | `src/js/processing-overlay.js` (new, paired with `src/styles/components.css` "Processing Overlay" section) | ~80 | Low | One UI concern. |
| 3 | Upload pipeline (SCAD / SVG / STL / ZIP branches inside `initFileHandler`) | split each branch into a sibling: `src/js/file-handlers/{scad,svg,stl,zip}.js` | ~1,300 | **Medium** | Each branch has its own validation, mounting, and error path. Risk = subtle ordering between branches if a future file-type is added. |
| 4 | The `initFileHandler` shell becomes the file-type dispatcher | stays | residual ~120 | — | |

### 9.2 Required characterization tests

- **E2E:** one upload spec per file type: "upload a `.scad` → renders." "upload a `.svg` → opens prep workspace." "upload a `.stl` → loads in preview." "upload a `.zip` → extracts and renders."
- **Unit:** `EXAMPLE_DEFINITIONS` schema validation — guards split #1.

---

## 10. `src/js/preset-manager.js` — 1,724 lines · preset persistence + migration + class

> **Verdict:** the file has a **clear three-layer split already encoded** — migration helpers (lines 1-323), coercion utilities (324-463), the `PresetManager` class (464-1668), and version comparators (1669-1722). **Decompose-First** along those existing seams.

**OBSERVED:** 18 top-level declarations, 9 exports. 1 module-level `let` (validator injection point). Both migration functions and the version comparators are pure and self-contained.

### 10.1 Recommended split

| # | Concern | Destination | LOC moved | Risk | Notes |
|---:|---|---|---:|:---:|---|
| 1 | Migration / legacy-storage helpers (`detectStorageVersion`, `checkMigrationAvailable`, `migrateFromLegacyStorage`, `dismissMigrationOffer`, `resetMigrationFlag`) | `src/js/preset-migration.js` (new) | ~270 | Low | Pure logic; tested by `tests/unit/preset-migration.test.js` (existence **UNVERIFIED**, Phase 5 will check). |
| 2 | Coercion (`coercePresetValues`, `autoDetectType`, `coerceToType`, `stringifyForOpenSCAD`) | `src/js/preset-coercion.js` (new) | ~200 | Low | Pure; ideal target for property-based tests. |
| 3 | OpenSCAD-format detectors (`isOpenSCADNativeFormat`, `isForgeFormat`) | move into `src/js/preset-coercion.js` (#2) | ~50 | Low | Same domain. |
| 4 | Version helpers (`extractScadVersion`, `compareVersions`) | `src/js/version-utils.js` (new) **or** existing `src/js/feature-flags.js` | ~60 | Low | These are general-purpose. |
| 5 | `PresetManager` class | stays | residual ~1,200 | — | Class itself is large but cohesive. Could be further decomposed but not as a Phase 6 priority. |
| 6 | `resetMigrationFlag` (already on dead-code list per Phase 1 §4.1) | delete | ~20 | Low | |

### 10.2 Required characterization tests

- **Unit:** "preset migration from schema v0 → v1 → current preserves values" — guards split #1.
- **Unit:** "coercePresetValues handles every type in the parameter type matrix" — guards split #2.

---

## 11. `src/styles/components.css` — 13,994 lines · 55 sections, splitable by feature

> **Verdict:** the file is well-banner-organized with **55 distinct sections**. **Decompose-First** by extracting feature-scoped sections into sibling files imported via Vite's `@import` or JS-side `import './x.css'` from the controller that owns each feature.

**OBSERVED** (from [.audit-scratch/anatomy/components.css.md](../../../.audit-scratch/anatomy/components.css.md)):

- 55 banner-style section headers.
- Top 11 sections by size occupy **7,724 lines** (≈ 55 % of the file):

| Lines | Range | Section | Suggested target |
|---:|---|---|---|
| 1,079 | 10013-11091 | Tutorial Overlay System / Spotlight / Coachmarks | `src/styles/features/tutorial.css` |
| 1,067 | 1565-2631 | Project File Manager Modal | `src/styles/features/project-file-manager.css` |
| 890 | 4684-5573 | Searchable Preset Combobox | `src/styles/features/searchable-combobox.css` |
| 813 | 3871-4683 | Auto Preview Indicator Styles | `src/styles/features/auto-preview-indicator.css` |
| 627 | 11565-12191 | Error Toast | `src/styles/features/error-toast.css` |
| 627 | 13368-13994 | SVG Preparation Workspace | `src/styles/features/svg-preparer.css` |
| 572 | 2632-3203 | Image Measurement Tool | `src/styles/features/image-measurement.css` |
| 552 | 492-1043 | Actions Drawer Toggle Button (Mobile) | `src/styles/features/actions-drawer.css` |
| 544 | 12588-13131 | Expert Mode (M2) Code Editor Interface | `src/styles/features/expert-mode-editor.css` |
| 521 | 1044-1564 | Folder Tree Styles | `src/styles/features/folder-tree.css` |
| 422 | 6548-6969 | Project Files Controls | `src/styles/features/project-files.css` |

### 11.1 Risk / mechanics

CSS does not have a lexical-import story like JS modules; ordering matters because of cascade specificity. Two extraction patterns are valid:

- **A) Build-side `@import`** at the top of `components.css`: keeps the resolution order identical and is invisible at runtime.
- **B) Per-controller `import './x.css'` from JS**: enables tree-shaking when a feature is fully removed but is harder to reason about (the load order depends on which controller imports first).

Either way, the **risk** is specificity drift: any rule that depended on cascade order between two sections must be made explicit. Visual-regression coverage (currently 13 baselines per [00-baseline.md §5](./00-baseline.md)) is the only safety net. Phase 5 will measure baseline coverage *per feature* before any extraction is approved.

### 11.2 Required characterization tests

- **Visual:** add baselines for any of the 11 large features that lack one. **UNVERIFIED**: which baselines exist; Phase 5 will list.
- **Visual:** add a "all panels open" snapshot before extraction so any specificity drift surfaces immediately.

---

## 12. `src/styles/layout.css` — 4,382 lines · 25 sections

> **Verdict:** smaller than `components.css` and more cohesive ("layout" really *is* one concern). **Worth-considering**, not a Phase 2 priority.

**OBSERVED:** 25 section banners. Largest sections:

| Lines | Section |
|---:|---|
| 553 | UI Preferences Panel (inside Advanced menu) |
| 471 | Mobile Camera Controls Drawer |
| 388 | Camera Controls Panel (Right Side Drawer) |
| 354 | Actions Bar Collapsible Drawer Pattern |
| 238 | Forced Colors Mode Adjustments for Layout |
| 237 | Compact Keyboard Shortcuts Icon-Only Popover |
| 216 | ECHO Message Drawer |

If the team decides to split `components.css` (§11), apply the same approach here. Otherwise, leave alone — the file is not pulling its weight as an extraction priority compared to `components.css`.

---

## 13. `index.html` — 6,372 lines · single-page app shell

> **Verdict:** large by single-page-app standards but architecturally appropriate. **Defer-design** for splitting; **Phase 4** owns the validation-error fixes already enumerated in [00-baseline.md §7.7](./00-baseline.md).

**OBSERVED:**

- 8 top-level semantic landmarks (`<section>` / `<aside>` / `<nav>` / `<header>` / `<footer>` / `<dialog>` / `<main>`).
- 15 named modal containers identified by `id="*Modal"` (lines 4686-6345 cover most of them).
- The bottom 1,650 lines (≈ 26 %) are modal markup; everything before line 4685 is the shell + drawers + panels.

Two candidate decompositions exist; neither is obviously a win:

| Option | What it would change | Why it's risky |
|---|---|---|
| A) Move every modal into a `<template>` element + clone-on-open in JS | Could relocate ~1,650 lines into JS modules paired with their controller; HTML shell shrinks to ~4,700 lines. | Each modal currently has its ARIA wiring inline. Moving to `<template>` requires the cloning controller to re-attach `aria-labelledby` / `role` / `aria-modal` correctly, every time. The current static markup is *easier to audit for accessibility*. |
| B) Extract HTML partials into separate files and stitch at build time (Vite plugin) | Smaller `index.html` source, no runtime cost. | Adds a build dependency. The accessibility-first stance prefers static HTML the screen-reader can parse on first byte. |

**Recommendation:** **do not extract** during this audit cycle. The 13 validation errors in baseline §7.7 (most are ARIA-on-generic-div / `aria-valuemin`-with-`min`) are the higher-priority `index.html` work; Phase 4 will plan those.

---

## 14. Summary scoreboard for Phase 6 hand-off

> Lines below are *moved* (not deleted), unless explicitly noted. Risk reflects what could regress, not what's hard.

| Hot file | Total LOC | Recommended target LOC after split | Splits | Highest-risk split |
|---|---:|---:|---:|---|
| `src/main.js` | 12,653 | ~1,500 (residual orchestrator) | 9 | Storage clear + export-backup (#3) |
| `src/styles/components.css` | 13,994 | ~6,300 (residual base) | 11 (top sections) | Specificity drift if any |
| `src/styles/layout.css` | 4,382 | unchanged for now | — | Defer |
| `src/js/preview.js` | 4,734 | ~4,250 | 4 | Camera-control wiring (#2) |
| `src/js/tutorial-sandbox.js` | 3,659 | ~2,000 | 5 | Drawer observer extraction |
| `src/worker/openscad-worker.js` | 2,827 | ~1,300 | 5 | Output validators (#2), file mounts (#3) |
| `src/js/ui-generator.js` | 2,732 | ~600 | 7 | `createFileControl` extraction (#4) |
| `src/js/auto-preview-controller.js` | 2,042 | ~1,500 | 3 | Internal `onParameterChange` restructure (#1) |
| `src/js/saved-projects-manager.js` | 2,242 | ~100 (façade) | 7 | DB init / migration (#1) |
| `src/js/saved-projects-ui.js` | 1,753 | ~250 (wiring shell) | 5 | Project card + folder tree |
| `src/js/file-handler.js` | 1,744 | ~120 (dispatcher) | 4 | Per-file-type branches (#3) |
| `src/js/preset-manager.js` | 1,724 | ~1,200 | 6 | Migration extraction (#1) |
| `index.html` | 6,372 | unchanged | — | Defer (Phase 4 owns validation fixes) |

**Cumulative LOC moved if every recommended split lands:** ≈ 30,000 lines relocated across ~40 new sibling files. **Net deletion** is small (~140 lines from Phase 1 §4.1 dead code, ~10-20 lines per split from removing now-redundant glue) — Phase 2 is primarily a re-shaping exercise, not a deletion exercise.

**Highest-risk single function in the codebase:** `auto-preview-controller.js#onParameterChange` (~1,093 lines, makes the preview-vs-full-render decision). Phase 5 must produce its characterization tests **before** Phase 6 schedules any restructuring.

**Highest-LOC single function in the codebase:** `main.js#initApp` (~11,708 lines). Has the clearest split shape because every section is just `addEventListener` → known controller.

---

## 15. Reproduction recipe

From the project root:

- `node .audit-scratch/file-anatomy.mjs <path-to-js> [...]` regenerates the per-file structure tables in `.audit-scratch/anatomy/`.
- `node .audit-scratch/css-anatomy.mjs <path-to-css> [...]` does the same for CSS section banners.
- `Get-Content <file> | Measure-Object -Line` returns the **non-empty** line count (matches baseline numbers).
- For physical line counts that match this phase's tables: PowerShell — `([System.IO.File]::ReadAllText($p) -split "`n").Length`; Bash — `wc -l <file>` (off by one when file ends without a newline).

---

## 16. Provenance flags

- §1-§11, §13, §14 — **OBSERVED** from anatomy scripts + direct file reads.
- §0 calibration table — **OBSERVED** from cross-tool comparison.
- §6.2 (the assertion that `onParameterChange` characterization tests "must" be added before split) — **INFERRED** from method size + behaviour scope; Phase 5 verifies whether the tests are already present.
- All "destination" filenames (e.g. `src/js/controls/numeric.js`) are **proposed**; none of these files exist yet.
- All LOC-removed estimates are **INFERRED** (conservative); Phase 6 re-verifies before any work lands.
- §11 visual-baseline coverage — **UNVERIFIED**; Phase 5 will list which features are baselined.
