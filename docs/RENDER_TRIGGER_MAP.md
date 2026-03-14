# Render Trigger Map

**Purpose:** Single-source-of-truth document mapping every code path that can trigger an OpenSCAD render (preview or full). Used as the ground-truth reference for investigating BUG-B (unexpected display content in Customizer Settings mode) and BUG-C (spontaneous renders).

**Architecture layer:** Layer 3 (frontend) → Layer 2 (worker bridge) → Layer 1 (WASM binary, frozen).

**Last audited:** 2026-03-03 against `src/main.js`, `src/js/auto-preview-controller.js`, `src/js/render-controller.js`

---

## Render Entry Points

There are two public methods on `AutoPreviewController` that trigger preview renders, plus a direct path through `RenderController` for full renders:

| Method | Layer | Description |
|---|---|---|
| `autoPreviewController.onParameterChange(params)` | Layer 3 | Debounced: waits for the configured debounce interval, then calls `renderPreview()`. Skipped if `isNonPreviewableParameters()` returns true. |
| `autoPreviewController.forcePreview(params)` | Layer 3 | Immediate: skips debounce, calls `renderPreview()` directly. Also skipped if `isNonPreviewableParameters()`. |
| `autoPreviewController.renderFull(params, opts)` | Layer 3 | Full-quality render, bypasses preview cache. Calls `renderController.renderFull()`. |
| `renderController.renderFull(content, params, opts)` | Layer 3 | Direct full render, used for non-STL formats. No preview caching. |

---

## Auto-Guard: `isNonPreviewableParameters()`

**Location:** `src/js/auto-preview-controller.js` line 513

Before executing any `renderPreview()` call, `AutoPreviewController` checks `isNonPreviewableParameters(parameters)`. If it returns `true`, the render is **skipped** and an error is emitted with:

- `code: 'NO_GEOMETRY'` for `generate` values containing `"customizer"` keywords

`isNonPreviewable()` returns `true` only for generate values containing "customizer" keywords. 2D-producing modes (SVG, DXF, first layer) are classified as previewable and proceed to render; if the WASM worker returns `MODEL_IS_2D`, the catch block in `renderPreview()` triggers a draft SVG fallback via `renderDraft2DPreview()`.

---

## All Render Call Sites in `src/main.js`

### Auto Triggers (no direct user gesture at that moment)

| Line | Method | Trigger Event / Context | Notes |
|---|---|---|---|
| 3377 | `forcePreview` | Application initialization — first-visit deferred preview after post-init state is set | Fires after worker warmup completes on first page load |
| 4616 | `onParameterChange` | `renderController.setMemoryWarningCallback` — memory warning fires and quality is 'auto' | Auto-triggered after a render causes a memory spike; clears preview cache and re-renders |
| 8983 | `onParameterChange` | File load — URL parameters are applied and file is initialized | Double-fires alongside line 8964 (once in UI callback, once immediately after) |
| 9238 | `forcePreview` | File load — initial render after `loadFile()` completes successfully | Fires for every file load, not just first visit |
| 11900 | `onParameterChange` | Deep-link manifest load — preset parameters are applied from URL `?manifest=...&preset=...` | |
| 11926 | `onParameterChange` | Manifest `defaults.autoPreview === true` triggers preview after manifest loads | Only if manifest explicitly opts in |

### User-Explicit Triggers (direct user gesture)

| Line | Method | Trigger Event / Context | Notes |
|---|---|---|---|
| 3877 | `onParameterChange` | Toolbar "Reload and Preview" menu item clicked | Also calls `fileActionsController.onReload()` first |
| 3892 | `onParameterChange` | Toolbar "Preview" menu item clicked | Immediate preview of current params |
| 5515 | `onParameterChange` | Preview quality `<select>` `change` event | User changes quality preset dropdown |
| 8155 | `forcePreview` | Companion file **added** — project files updated | Fires after file upload to project |
| 8221 | `forcePreview` | Companion file **removed** from project | |
| 8307 | `forcePreview` | Companion file **edited/updated** in the edit modal | |
| 8800 | `onParameterChange` | Parameter UI `change` callback — user edits a parameter in the UI | This is the primary per-parameter change trigger; debounced |
| 8964 | `onParameterChange` | File load with URL parameters — parameter UI re-rendered with URL values | Part of `?params=...` URL loading flow |
| 11881 | `onParameterChange` | Deep-link preset applied — parameter UI re-rendered callback | Fires for each individual UI change in the re-rendered form |
| 12105 | `onParameterChange` | Undo (`performUndo`) — parameter UI re-rendered callback | Fires for each individual UI change in the re-rendered form |
| 12113 | `onParameterChange` | Undo (`performUndo`) — after parameters are restored | |
| 12141 | `onParameterChange` | Redo (`performRedo`) — parameter UI re-rendered callback | |
| 12149 | `onParameterChange` | Redo (`performRedo`) — after parameters are restored | |
| 12197 | `onParameterChange` | "Reset Group" — parameter UI re-rendered callback | |
| 12204 | `onParameterChange` | "Reset Group" — after group defaults are applied | |
| 13683 | `renderFull` | "Generate" button clicked (STL format) — via `autoPreviewController.renderFull()` | Full quality, uses cached result if available |
| 13701 | `renderFull` | "Generate" button clicked (non-STL formats: DXF, SVG, etc.) — via `renderController.renderFull()` | Direct render, no cache |
| 14455 | `onParameterChange` | Render queue "Edit job" — parameter UI re-rendered callback | |
| 14907 | `onParameterChange` | Preset selection — parameter UI re-rendered callback | Fires for each UI change in the re-rendered form |
| 14956 | `onParameterChange` | Preset selection (`applyPresetParametersAndCompanions`) — after preset params and companion files are applied | **BUG-A investigation point:** companion file aliasing happens before this call |
| 16019 | `onParameterChange` | "Load Defaults" / reset to design defaults — parameter UI re-rendered callback | |
| 16027 | `onParameterChange` | "Load Defaults" — after default parameters are applied | |
| 16762 | `onParameterChange` | "Reset Group Parameters" — parameter UI re-rendered callback | |
| 16770 | `onParameterChange` | "Reset Group Parameters" — after group reset is applied | |
| 17061 | `onParameterChange` | Keyboard shortcut `preview` | |
| 17070 | `onParameterChange` | Keyboard shortcut `reloadAndPreview` | Also calls `fileActionsController.onReload()` |

---

## Internal Render Chain (within `AutoPreviewController`)

These are internal re-triggers that happen automatically after a render completes:

| Location | Method | Trigger | Notes |
|---|---|---|---|
| `auto-preview-controller.js` line 695–697 | `renderPreview` | After a render completes, if `pendingParameters` was set (a change came in during the render), fires immediately on next tick via `setTimeout(..., 0)` | This is the "catch up" mechanism for changes queued while a render was in progress |
| `auto-preview-controller.js` line 502 | `renderPreview` | Cache miss in `loadCachedPreview` — if cached entry is invalid, falls through to a new render | |

---

## Render Controller Internal Flow

```
onParameterChange(params)
  → debounce timer fires
  → isNonPreviewableParameters(params) → true: emit NO_GEOMETRY/MODEL_IS_2D error, SKIP render
  → renderPreview(params, hash)
    → renderController.renderPreview(scadContent, params, opts)
      → [if _moduleUsed] proactive restart (render-controller.js line 977–989)
      → worker.postMessage({ type: 'RENDER', ... })
        → clearMountedFiles() [ONLY if files provided — BUG-A: should be unconditional]
        → callMain(args)

forcePreview(params)
  → cancelPending()
  → [if busy] queue as pendingParameters
  → renderPreview(params, hash)  [same chain as above]

renderFull(params, opts) [STL]
  → renderController.renderFull(scadContent, params, opts)
  → [same restart + worker chain]

renderFull(content, params, opts) [non-STL — direct via renderController]
  → [same restart + worker chain, no cache]
```

---

## BUG Investigation Notes

### BUG-A (Preset Cycling Rendering Failures)
- **Primary call site:** `main.js` line 14956 — `onParameterChange(mergedParams)` after `applyPresetParametersAndCompanions`
- **Root cause candidates:**
  1. Worker's `clearMountedFiles()` is conditional on `files` being provided (worker line 2111). If preset switches update companion aliases but the files object looks identical, old mounted files can persist.
  2. `_callMainInvoked` guard (worker line 1439) only warns; does not cause worker restart.

### BUG-B (Display Shows Content When generate = Customizer Settings)
- **Call site:** Any `onParameterChange` or `forcePreview` call when `parameters.generate` contains `"customizer"`
- **Skip path:** `isNonPreviewableParameters()` → true → `setState(ERROR)` → `onError(error, 'preview')`
- **Gap:** `main.js` `handleConfigDependencyError()` (line 4997) handles `MODEL_IS_2D` and `EMPTY_GEOMETRY` but **has no case for `NO_GEOMETRY`**. The previous mesh remains visible.

### BUG-C (Unexpected Display Content — Spontaneous Renders)
- **Hypothesis 1:** Stale debounce timer fires after mode switch to `generate=Customizer Settings`. The `isNonPreviewableParameters()` check in `renderPreview()` (line 533) calls `this.onError()` but does **not** call `clearTimeout(this.debounceTimer)`.
- **Hypothesis 2:** The re-render triggered by `pendingParameters` on line 695–697 fires after a mode-change has made the params non-previewable.
- **Console panel status:** `console-panel.js` has no outbound events and does not call any render methods. Console expand/collapse cannot trigger a render.
