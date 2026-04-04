# QA Parity Fix Plan Validation Report

## Scope

This report validates `C:\Users\WATAP\.cursor\plans\qa_parity_fix_plan_84e638ba.plan.md` against the original request:

> Research what needs to be fixed from the QA transcript, then write a plan to fix the problem.

## Verdict

The plan is **directionally correct but incomplete**.

It does a good job covering:

- natural preset sorting mismatch
- renderer-side geometry suspects
- a diagnostic-first approach instead of jumping straight to a risky engine change

It does **not fully accomplish the requested goal yet**, because it narrows the geometry investigation too early to only three renderer-side suspects:

1. CSG color injection
2. preview quality reduction
3. OpenSCAD WASM / backend version

The repo has at least **two additional parity-critical paths** that can produce the exact QA symptoms and should be in the plan before any final fix is chosen:

1. **Preset-specific companion file resolution**
2. **Parameter type / `-D` serialization correctness**

## What The Plan Gets Right

### 1. Preset ordering root cause is correctly identified

The plan is correct that preset ordering differs because the UI sorts names lexicographically instead of naturally.

Relevant code:

- `src/js/preset-manager.js`
- `src/main.js`

Those paths currently use `localeCompare()` without `numeric: true`, which can place `"iPad 10,11"` before `"iPad 7,8,9"`.

This part of the plan should be kept.

### 2. Renderer-side geometry investigation is reasonable

The plan correctly identifies these as plausible contributors:

- `AutoPreviewController.injectCsgColors()` in `src/js/auto-preview-controller.js`
- preview tessellation settings in `src/js/render-controller.js`
- backend differences in `src/worker/openscad-worker.js`

Those are all real parity surfaces and deserve investigation.

### 3. The diagnostic-first structure is good

Trying to isolate cause before changing the engine or updating the vendored WASM is the right shape of plan.

## What The Plan Misses

### 1. It omits preset-specific companion file resolution

This is the biggest gap.

The failing QA cases are exactly the kinds of cases that depend on the correct `openings_and_additions.txt` content being mounted for the selected preset:

- home button cutout differences
- upper message/command bar differences
- camera cutout differences
- case-dependent missing wall behavior

In this repo, those files are not always simple root-level files. They are often resolved per preset through a heuristic aliasing system in:

- `src/js/zip-handler.js`
- `src/js/file-handler.js`
- `src/main.js`

Important details already in the codebase:

- `buildPresetCompanionMap()` uses token scoring and hierarchy fallbacks
- `applyCompanionAliases()` remounts preset-specific files to root-level names
- some mappings are intentionally marked as `ancestor-fallback`
- the stakeholder keyguard fixture already has extensive tests in `tests/unit/zip-handler.test.js`

That means a preset can render the wrong geometry even if the OpenSCAD engine is perfect, simply because the wrong companion file was mounted.

This is a direct match for the QA transcript, especially where behavior changes based on case/app combinations.

### 2. It omits parameter schema and `-D` serialization validation

The repo already contains a critical parity fix in `buildDefineArgs()` in `src/worker/openscad-worker.js`:

- string params like `"yes"` / `"no"` must remain strings when the schema says `string`
- only schema-typed booleans should become `true` / `false`

That matters for parameters like:

- `expose_home_button`
- `expose_camera`
- bar-related `expose_*` settings

If the extracted schema or import path types any of these incorrectly, the OpenSCAD conditionals can diverge from desktop behavior even with the correct SCAD source and backend.

The plan should explicitly include validating the failing preset's parameter values and emitted `-D` args.

### 3. It duplicates at least one toggle that already exists

The plan proposes adding a developer toggle for CGAL vs Manifold.

That is already present:

- `src/main.js`
- `src/js/feature-flags.js`

There is already a persisted engine toggle using `openscad-forge-manifold-engine`.

This part of the plan should be changed from "build a new toggle" to "use and document the existing toggle during diagnosis."

### 4. It does not separate preview-only issues from full-render issues

The app has separate preview/full render paths in `src/js/auto-preview-controller.js`.

Both paths can inject colors, and they may run with different output/quality behavior.

The QA transcript appears to be based on what the user visually sees in the app. The plan should explicitly determine whether the mismatch is:

- preview only
- full render/export too
- both

Without that distinction, the fix could target the wrong layer.

## Recommended Changes To The Plan

The plan should be amended so Phase 1 becomes:

1. Reproduce the failing preset and record the exact preset name, parameter values, engine, and whether the issue appears in preview, full render, or both.
2. Log the resolved companion mapping for the failing preset and confirm which `openings_and_additions.txt` path is actually mounted.
3. Validate schema types and emitted `-D` arguments for the failing `expose_*` and case-related parameters.
4. Only after steps 1-3, test renderer-side suspects:
   - bypass CSG color injection
   - desktop-quality render settings
   - existing CGAL toggle
   - newer WASM build if still unresolved

## Minimum Additions Required For This To Be A Complete Fix Plan

- Add a companion-file verification step for the exact failing stakeholder presets.
- Add regression tests for any failing preset-to-companion mapping discovered.
- Add parameter serialization validation for the failing presets.
- Reword the engine-toggle step to use the existing toggle instead of creating a new one.
- Add an explicit decision point for preview-only vs full-render parity failures.

## Final Assessment

**As written:** the plan is a strong partial plan, but not a complete validation of what needs to be fixed.

**With the amendments above:** it would satisfy the original request much better, because it would cover both:

- renderer/backend parity risks
- app-layer project/preset mounting risks

That combined scope is what is needed to confidently explain and fix the QA-reported gaps.
