# Phase 5 — Tests & Safety Net

**Audit date:** 2026-04-17
**Status:** Read-only — no source modifications
**Inputs:** `pixi run test:coverage` (Vitest v8 coverage), Playwright e2e/visual configs, manual test-file inspection
**Source data:**
- `.audit-scratch/coverage-2026-04-17.log` (full coverage table, 3013 unit tests, 62 files passing in 48 s)
- `tests/visual/baselines/win32/` (13 PNG baselines), `tests/visual/baselines/linux/.gitkeep` (empty)
- `playwright.config.js` line 61 (`snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}'`)

---

## Summary table

| Concern | Severity | Affected modules / LOC |
| --- | --- | --- |
| Largest hotspots have **0 % unit coverage** | **HIGH** | `tutorial-sandbox.js` (3300), `main.js` (11 303), `saved-projects-ui.js` (1747), `file-handler.js` (1741), `hfm-controller.js` (1311), `image-measurement.js` (1046) — together ~18.4k LOC |
| Five tests **mirror production** code instead of importing it (AI-tests-of-AI-code) | **HIGH** | `cli-manifest.test.js`, `svg-validation.test.js`, `image-companion-mounting.test.js`, `saved-projects-load.test.js`, `color-contrast.test.js` |
| Unit tests assert on **private fields** (`_brightnessScale`, `_lastAspect`, `_internal`) | MEDIUM | `preview.test.js`, `memory-monitor.test.js`, `auto-preview-controller.test.js`, `display-options-controller.test.js`, `render-controller.test.js`, `parity-harness.test.js`, `hfm.test.js`, `svg-preparer-workspace.test.js` |
| `cli-manifest.test.js` literally **never imports** `cli/commands/manifest.js` | **HIGH** | Real CLI behavior is unverified by this suite; `pixi run test` would still pass if the real CLI were broken |
| Visual baselines only exist for `win32`; `linux/.gitkeep` is empty, no `darwin/` directory | MEDIUM | All 13 visual specs in `tests/visual/core-ui.visual.spec.js` will create-on-first-run on any non-Windows host (= silent baseline drift in CI) |
| Library-manager test prints `localStorage.getItem is not a function` stderr but still passes | LOW | `tests/unit/library-manager.test.js` (silent JSDOM environment defect) |
| `error-translator.test.js` asserts on **literal UI copy** (`title === 'Code Problem Found'`) — duplicated content drifts | LOW | `tests/unit/error-translator.test.js` 28 cases |
| Coverage report counts **non-existent file** `parameter-detail-controller.js` (only `param-detail-controller.js` exists, 125 LOC) | INFO | Earlier audit notes were imprecise; correcting here |

**Headline numbers** (OBSERVED, `.audit-scratch/coverage-2026-04-17.log:6033-6105`):

```
Test files: 62 unit (Vitest), 33 e2e + 1 visual (Playwright) = 96 total
Unit tests: 3013 passing, 0 failing, 48 s wall clock
Coverage:   48.28 % statements / 44.82 % branches / 49.78 % functions / 48.87 % lines
```

Coverage measures the **wrong denominator**: v8 only reports on files that any test imports. Modules that no test ever touches don't appear at all, so the 48 % figure overstates safety. The next section quantifies that gap.

---

## 1. Hotspots without characterization tests

### 1.1 Files in coverage table at 0 %

These files **are imported** by at least one test (so v8 sees them) but no assertions exercise their bodies. Each line shows `% Stmts | LOC | uncovered range` from `.audit-scratch/coverage-2026-04-17.log`:

| File | LOC | % Stmts | Uncovered |
| --- | ---: | ---: | --- |
| `csp-reporter.js` | 137 | 0 | 25-137 |
| `dialogs.js` | 265 | 0 | 26-265 |
| `param-detail-controller.js` | 125 | 0 | 14-? |
| `drawer-controller.js` | 226 | 0 | 15-225 |
| `file-handler.js` | 1741 | **0.59** | 74-122, 244-1741 |
| `hfm-controller.js` | 1311 | **3.6** | 35-165, 211-1311 |
| `saved-projects-ui.js` | 1747 | 0 | 57-1747 |
| `textarea-editor.js` | 728 | 0 | 17-728 |
| `ui-mode-controller.js` | ~838 | **5.94** | 17-783, 799-809 |
| `unit-sync.js` | 77 | 0 | 12-77 |
| `shared-image-store.js` | 131 | **4.22** | 20-131 |

### 1.2 Files **absent from the coverage report** (no test imports at all)

OBSERVED by cross-referencing `Glob('src/js/*.js')` (74 files) against the coverage table (~50 files):

| File | LOC | Notes |
| --- | ---: | --- |
| `tutorial-sandbox.js` | **3300** | Phase 2 hotspot #2; only e2e Playwright spec (`tutorials.spec.js`) exercises it through the UI |
| `main.js` | **11 303** | Phase 2 hotspot #1; entry-point only — no `import` from any unit test (verified by `Grep` for `from '.*main\.js'` in `tests/`) |
| `image-measurement.js` | 1046 | Used by `preview.js`; never directly tested |
| `toolbar-menu-controller.js` | 887 | Phase 2 hotspot |
| `overlay-grid-controller.js` | 1088 | Phase 2 hotspot |
| `camera-panel-controller.js` | 619 | |
| `gamepad-controller.js` | 424 | |
| `edit-actions-controller.js` | 275 | |
| `design-panel-controller.js` | 209 | The "simulated AST/CSG/Validity" surface from Phase 3 — **untested** |
| `animation-controller.js` | 195 | |
| `preview-settings-drawer.js` | 188 | |
| `keyboard-config.js`, `html-utils.js`, `color-utils.js`, `_seq.js`, `_hfm.js`, `_hfm-lut.js` | <500 each | Pure utility modules; no tests |

**Total uncovered LOC** in the listed files (0 % + zero-import combined): approximately **22 800 LOC** out of ~38 k in `src/js/` — i.e. **roughly 60 % of the front-end JavaScript has no characterization safety net** before any of the Phase 6 refactors begin. The published 48 % statement coverage figure measures only the ~40 % of the codebase that tests *touch at all*.

### 1.3 Refactor-blocking gaps (sorted by Phase 2/3 priority)

The combined Phase 2 (complexity hotspots) and Phase 3 (WASM bridge) findings recommend splitting/relabeling the following files. Each one currently lacks the characterization tests needed to make refactors safe:

| Phase 2/3 candidate | Coverage today | Required tests before refactor |
| --- | --- | --- |
| `main.js` (split into bootstrap + UI wiring + state plumbing) | **0 %** | Smoke e2e covering each top-level `init…()` block; DOM-level snapshot of initial app shell |
| `tutorial-sandbox.js` (extract sandbox core) | **0 %** unit | Promote `tests/e2e/tutorials.spec.js` into a regression baseline; add unit coverage for pure helpers (`createSandboxState`, scoring utilities) |
| `saved-projects-ui.js` (Phase 4 ARIA antipattern + 1747 LOC) | **0 %** | DOM-level tests for folder-row keyboard navigation, project-card focus order, drag-and-drop fallback |
| `file-handler.js` (1741 LOC, IndexedDB-backed) | **0.59 %** | Pure-function tests for filename validation, MIME detection, archive parsing; integration tests behind a minimal `idb` stub |
| `hfm-controller.js` (1311 LOC) | **3.6 %** | Pure-function tests for `_hfm-paint.js` are good (95 %) — the controller wrapping needs equivalent tests for state transitions |
| `design-panel-controller.js` (Phase 3 mislabeled "AST"/Validity/Volume) | **not in report** | Tests pinning the *current* misleading behavior so Phase 6 relabels can be done without regressing other panels |
| `error-translator.js` ↔ `openscad-worker.js` (Phase 3 duplicate `ERROR_TRANSLATIONS`) | 85.23 % main / worker untested | Property-style tests asserting that *both* dispatch paths produce equivalent `{title, explanation, suggestion}` for a shared corpus of stderr fixtures |
| `ui-mode-controller.js` (Phase 2 hotspot, 5.94 %) | **5.94 %** | Mode-transition tests covering compact ↔ expanded ↔ tutorial transitions and ARIA announcer side-effects |

**Recommendation for Phase 6**: every Quick Win that touches one of the above files should explicitly include a "characterization tests first" task. Otherwise refactors are pure flying-blind.

---

## 2. AI-tests-of-AI-code anti-pattern

The plan's hallucination safeguards explicitly warn against tests that assert on a copy of the implementation. I found **five** tests that openly admit to mirroring production code in their own comments. None of them imports the production module under test:

### 2.1 `tests/unit/cli-manifest.test.js` (severity: HIGH)

```13:21:tests/unit/cli-manifest.test.js
// Re-implement the pure logic that the CLI exercises so we can unit-test it
// without spawning a process. Keep these mirrors in sync with manifest.js.

const COMPANION_EXTS = new Set(['.txt', '.svg', '.csv', '.dxf'])
const PRESET_EXT = '.json'
const PRESET_NAME_HINTS = ['preset', 'presets', 'params', 'parameters', 'config']

function detectMainFilePure(scadFiles, contentMap = new Map()) {
```

The 21 tests in this file assert on `detectMainFilePure` defined **inside the test file** — never on `cli/commands/manifest.js`. If the CLI's real `detectMainFile` regresses, the suite still passes. The "keep mirrors in sync" comment makes this explicit. **Fix path**: import the real helpers from `cli/commands/manifest.js` (refactor to export them if necessary), or delete the test entirely so the gap is visible in coverage.

### 2.2 `tests/unit/svg-validation.test.js` (severity: HIGH)

```5:14:tests/unit/svg-validation.test.js
 * Keep this copy in sync with openscad-worker.js if the implementation changes.
```

Same pattern: a copy of `validateSVGOutput` is defined in the test and asserted against. Real worker behavior is unverified. **Fix path**: extract `validateSVGOutput` into a shared pure module that both the worker and the test import (Phase 6 candidate — also unblocks Phase 1 library-shadowing follow-up).

### 2.3 `tests/unit/image-companion-mounting.test.js` (severity: MEDIUM)

```33:36:tests/unit/image-companion-mounting.test.js
// Data URL detection heuristic (mirrors mountFiles logic)
```

Same pattern. The heuristic is duplicated; the real `mountFiles` is not exercised.

### 2.4 `tests/unit/saved-projects-load.test.js` (severity: MEDIUM)

```20:42:tests/unit/saved-projects-load.test.js
 * Mirrors the fixed guard logic inside handleFile's `if (file)` block.
…
 * Mirrors the OLD (buggy) guard logic for comparison.
```

A regression test that asserts on a re-implementation of the guard rather than on `saved-projects-ui.js#handleFile`. Even keeps the buggy version around as a comparison case — which is double-jeopardy: both copies must be kept in sync with reality, manually.

### 2.5 `tests/unit/color-contrast.test.js` (severity: LOW)

```177:177:tests/unit/color-contrast.test.js
  // Keep in sync with `src/styles/variables.css` high contrast light mode tokens
```

Color tokens are duplicated from CSS into JavaScript test arrays. If `variables.css` ships a new shade, the test passes against the stale array. **Fix path**: parse `src/styles/variables.css` at test-time with a CSS parser (already a project dependency via PostCSS), or assert via JSDOM `getComputedStyle` after applying the stylesheet.

### Aggregate impact

These five files contain **roughly 95 individual `test()`/`it()` cases** that the suite reports as "passing" but that provide zero protection against drift in the real production code paths they purport to cover. Removing them would *lower* the headline test count but would make the safety net more honest.

---

## 3. Implementation-detail tests

These tests assert on private (`_`-prefixed) fields, internal mutable state, or `_internal` exported namespaces. They will break on any refactor that reorganizes internal storage, even if user-visible behavior is unchanged.

`Grep` hit list (`expect(.+\._` pattern):

| File | Hits | Examples |
| --- | ---: | --- |
| `preview.test.js` | **40** | `manager._brightnessScale`, `manager._contrastFactor`, `manager._lastAspect`, `manager._lastContainerWidth` |
| `display-options-controller.test.js` | 5 | |
| `render-controller.test.js` | 5 | |
| `auto-preview-controller.test.js` | 3 | |
| `hfm.test.js` | 2 | |
| `parity-harness.test.js` | 2 | |
| `svg-preparer-workspace.test.js` | 43 | (mostly assertions on internal workspace state objects) |

**Verdict**: `preview.test.js` and `svg-preparer-workspace.test.js` are the worst offenders. Phase 2 already proposes splitting `preview.js`; doing so will require substantial test rewriting because so many tests bind to the current internal field names.

`memory-monitor.test.js` uses `_internal.resetSingleton()` (line 25) which is a deliberate "reset for testability" hook — that's an acceptable seam, not an antipattern. Files that import a `_internal` namespace are listed as `feature-flags.test.js`, `preview.test.js`, `memory-monitor.test.js`; only `preview.test.js` is concerning at scale.

**Recommendation**: introduce a "public test API" convention (e.g. `exportForTests = { reset, _state }`) so private fields can be observed by tests *via a documented seam* rather than by inadvertently coupling to property names. Defer to Phase 6 as a low-priority cleanup.

---

## 4. Coupling between worker code and test execution

`tests/` does not import `src/worker/openscad-worker.js` directly. Instead, tests import the **pure helpers** that the worker also imports:

- `tests/unit/dxf-postprocess.test.js`
- `tests/unit/missing-file-warnings.test.js`
- `tests/unit/svg-validation.test.js` (the antipattern from §2.2)
- `tests/unit/file-param-resolver.test.js`
- `tests/unit/resolve-2d-export.test.js`

This is a sound architecture: workers can't run inside a Vitest JSDOM environment without a heavy harness, so isolating pure logic into shared modules is correct. The `svg-validation` test breaks the pattern by *copying* the function instead of importing it. Phase 6 should treat that as the canonical fix template for any other "I can't run the worker" excuse.

The worker's stateful render orchestration (`pollOutputs`, progress bookkeeping, error propagation) has no direct unit test. End-to-end coverage in `tests/e2e/` is the only safety net for that surface today.

---

## 5. Visual regression baseline drift

`playwright.config.js` (line 61) sets `snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}'`. The repository ships:

```
tests/visual/baselines/
├── linux/        ← only `.gitkeep`, no baselines
├── win32/        ← 13 PNGs (welcome, theme-light, theme-dark, high-contrast, mobile-layout,
│                   main-layout, header-controls, memory-banner-{warning,critical,emergency},
│                   memory-badge-warning, disclosures-{mobile-320,tablet-768},
│                   drawer-headers-mobile-480)
└── (no darwin/)
```

**Implication**: any Linux or macOS runner (CI, contributor laptops) will *create* baselines on the first run, then fail on the second run if any of the captured pixels differ. There is no committed baseline that exercises rendering on the platforms most likely to host CI. The visual suite therefore protects only Windows-host rendering, which is the smallest cross-platform surface for an accessibility-first web app.

`tests/visual/core-ui.visual.spec.js` uses generous tolerances (`maxDiffPixels: 100, threshold: 0.2`), which softens platform drift but doesn't eliminate it (font hinting and sub-pixel layout differ enough between Win/Linux/macOS to exceed those thresholds for several captured frames).

**Recommendation** (defer to Phase 7): commit Linux baselines generated under a fixed Chromium font configuration, OR remove the platform discrimination and run all visual tests against a containerized Chromium with controlled fonts. Either approach is a meaningful chunk of work; flag as "Worth considering" rather than "Quick Win."

---

## 6. Test-suite hygiene observations

Quick observations from the coverage log that don't merit their own section but are worth recording:

1. **Stderr leakage**: `tests/unit/library-manager.test.js` prints
   ```
   Failed to load library state: TypeError: localStorage.getItem is not a function
   ```
   on every run yet still passes. The JSDOM `localStorage` shim isn't initialized for this test file. This is benign today but masks any *new* localStorage misuse the test would otherwise catch. (`coverage-2026-04-17.log:5912-5929`)
2. **Vitest CLI warning**: every test file emits
   ```
   (node:30236) Warning: `--localstorage-file` was provided without a valid path
   ```
   indicating a misconfigured vitest argument somewhere in `package.json` or `vitest.config.js`. (`coverage-2026-04-17.log:5953`)
3. **Test count vs. expected suite breadth**: 62 unit test files cover 50 of the 74 source files in `src/js/` (68 % file-presence). The remaining 24 files are entirely untested or only e2e-tested. This matches the LOC analysis in §1.2.
4. **Coverage report misses worker, CLI, and `cli/templates/`**: these are loaded as ESM strings or run via spawn, so v8 instrumentation never reaches them. Real coverage is even lower than the 48 % headline once those surfaces are factored in.
5. **No "AAA" linting** for tests (no eslint-plugin-vitest rules detected). The duplicate-implementation tests in §2 would be auto-flagged by `vitest/no-duplicate-tests` and `no-duplicate-string`. Defer to Phase 7.

---

## 7. Recommendations rolled into Phase 6 backlog

The following items will surface in Phase 6 ("Refactor recommendations synthesis"). Captured here so the synthesis pass has a structured input.

| ID | Category | Effort | Description |
| --- | --- | --- | --- |
| T-01 | Quick Win | S | Replace `cli-manifest.test.js` mirror with a real import of `cli/commands/manifest.js` (or delete the file) |
| T-02 | Quick Win | S | Same for `svg-validation.test.js` — extract worker helper into a shared pure module imported by both worker and test |
| T-03 | Quick Win | S | Same for `image-companion-mounting.test.js` and `saved-projects-load.test.js` |
| T-04 | Quick Win | S | Add Linux visual baselines (or drop the `{platform}` template) so CI on non-Win hosts is meaningful |
| T-05 | Quick Win | XS | Fix the `library-manager.test.js` stderr leak by initializing `localStorage` in the test setup |
| T-06 | Decompose-First | M | Add characterization tests for `saved-projects-ui.js` *before* fixing the Phase 4 `<div role="button">` antipattern |
| T-07 | Decompose-First | M | Add characterization tests for `design-panel-controller.js` (Display AST / Validity / Volume) *before* the Phase 3 relabel |
| T-08 | Decompose-First | L | Add characterization tests for `tutorial-sandbox.js` and `main.js` *before* any of the Phase 2 splits |
| T-09 | Decompose-First | L | Replace `preview.test.js` private-field assertions with public-API assertions as part of the Phase 2 `preview.js` split |
| T-10 | Defer-design | L | Introduce an `exportForTests` convention to legitimize necessary internal seams (e.g. singleton resets) |

`T-01..T-05` are immediate cleanups that strengthen the safety net before any production refactor begins. `T-06..T-09` are explicit prerequisites for the high-value Phase 2/3/4 refactors.

---

## Phase 5 verdict

The test suite passes 3013 unit tests and reports 48 % statement coverage, but the safety net has three structural defects:

1. **The biggest hotspots are untested**: `main.js`, `tutorial-sandbox.js`, `saved-projects-ui.js`, `file-handler.js`, `hfm-controller.js`, and `image-measurement.js` together represent ~18 k LOC at 0 % unit coverage. Every Phase 2/3/4 recommendation that touches these files is a flying-blind refactor today.
2. **Five tests verify a copy of the code, not the code**: `cli-manifest.test.js` is the most egregious — it never imports the CLI at all. These tests pass while production drifts.
3. **Visual regression coverage is Windows-only**: `linux/.gitkeep` is empty and `darwin/` doesn't exist. Cross-platform CI is unprotected.

None of these defects block the audit, but every one of them must be addressed *before* the corresponding refactor in Phase 6 is executed. The next phase will fold these constraints into the prioritized refactor plan.
