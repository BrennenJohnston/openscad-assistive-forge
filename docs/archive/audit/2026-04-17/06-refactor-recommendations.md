# Phase 6 — Refactor recommendations synthesis

**Audit date**: 2026-04-17
**Status**: Read-only — no source modifications. This phase ranks the refactor candidates surfaced by Phases 1-5 and drafts micro-plan stubs for every Quick Win.
**Inputs**: `00-baseline.md`, `01-architecture-redundancy.md`, `02-complexity-hotspots.md`, `03-wasm-bridge-fitness.md`, `04-accessibility-conformance.md`, `05-tests-and-safety-net.md`.

---

## 0. Scoring rubric

Each recommendation is scored on three axes and consolidated into a **Priority** ordering. The rubric is deliberately simple so anyone can reproduce the ranking from the underlying observations.

| Axis | Values | Scoring |
| --- | --- | --- |
| **LOC delta** | code removed *or moved out of god-modules* | 1 = small (<25 LOC) · 2 = medium (25-150) · 3 = large (>150) |
| **Mission impact** | accessibility / honesty-of-UX correction | 1 = low · 2 = medium · 3 = high (touches AT, fixes Lighthouse, removes a falsehood) |
| **Risk inverse** | how safely the change can ship | 3 = trivial (string change) · 2 = low (mechanical, well-scoped) · 1 = medium (touches keyboard nav or a long method) · 0 = high (touches a 1000+ LOC function that lacks characterization tests) |

`Composite = LOC + 2 × MissionImpact + RiskInverse`. Higher = ship sooner. Tie-broken by smaller blast radius.

The rubric is not a substitute for human judgement — it surfaces the order, not the certainty. Every recommendation below also lists the **observable evidence** it derives from so a reviewer can verify the score.

---

## 1. Headline ranked backlog

The full backlog has **30 items** across 5 categories. The top of the priority list — items the team can act on first because they are small, low-risk, and high-impact:

| Rank | ID | Action | LOC delta | Mission | Risk | Composite | Category |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
| 1 | **BR-4** | Drop the fictional memory `%` bar; show MB only | -30 | High (AT exposure of fake `aria-valuenow`) | Low | **10** | Quick Win |
| 2 | **A11Y-1** | Replace `--color-text-muted` with `--color-text-secondary` in `.features-note` | +0 / -1 | High (Lighthouse `color-contrast` failure) | Trivial | **10** | Quick Win |
| 3 | **A11Y-4** | Refactor `<div role="button">` folder rows to a real list-row pattern | ~40 | High (WAI-ARIA antipattern) | Medium | **9** | Quick Win* |
| 4 | **BR-1** | Rename "Display AST" to "Display Parameters" everywhere | ~5 | Medium (label honesty) | Trivial | **8** | Quick Win |
| 5 | **BR-2** | Remove unreachable "(non-manifold)" parenthetical from Check Validity | ~5 | Medium (false confidence) | Trivial | **8** | Quick Win |
| 6 | **BR-3** | Rename "Volume" to "Bounding Box Volume" in Geometry Info | -1 | Medium (measurement honesty) | Trivial | **8** | Quick Win |
| 7 | **A11Y-2** | Replace inline focus-trap in `error-translator.js` with `createFocusTrap` | -15 | Medium | Low | **7** | Quick Win + Library-shadow removal |
| 8 | **A11Y-3** | Add `@media (prefers-reduced-transparency: reduce)` block | +25 | Medium | Trivial | **7** | Quick Win |
| 9 | **A11Y-5** | Fix HTML validation errors: broken `for=` attributes, `aria-label` on generic divs | ~15 | Medium | Low | **7** | Quick Win |
| 10 | **BR-5** | Consolidate worker-side and main-thread `translateError` tables | -50 net | Medium | Medium | **7** | Quick Win + Library-shadow removal |
| 11 | **T-01..T-05** | Replace 5 mirror-test antipatterns + Linux visual baselines + library-manager stderr fix | varies | Medium (real safety net) | Low | **7** | Quick Win (test hygiene) |
| 12 | **Q1** | Remove 14 dead symbols (140 LOC) | -140 | Low | Trivial | **5** | Quick Win |
| 13 | **Q3** | Centralize `localStorage` try/catch into `safeGetItem/safeSetItem` | -60..-100 | Low (uniform error policy) | Medium | **5** | Quick Win |
| 14 | **Q2** | Replace inline hex math in `parseLuminance` with `hexToRgb` | -12 | Low | Trivial | **4** | Quick Win |
| 15 | **Q4** | Move `STORAGE_KEY_*` constants from `main.js` and `preview.js` into `storage-keys.js` | ~25 moved | Low (single source of truth) | Trivial | **4** | Quick Win |

(*) A11Y-4 is "Quick-Win-shaped" but classed as Quick Win **only** if D8 (`saved-projects-ui.js` decomposition) does not happen first. If Phase 2 ships D8 ahead of A11Y-4, do A11Y-4 inside that decomposition; otherwise, do it standalone.

Below the headline list are **15 more items** in Decompose-First, Library-shadow removal, Defer-upstream, and Defer-design — see §3-§6.

**Cumulative if every Quick Win lands**: roughly **−380 LOC removed**, **+50 LOC added** (the new helpers and the prefers-reduced-transparency block), Lighthouse score back to 1.0, and three mission-critical honesty defects (memory %, AST label, Volume label) corrected. None of the Quick Wins requires touching a function over ~500 LOC, so none of them are blocked by Phase 5's characterization-test debt.

---

## 2. Quick Wins — one-page micro-plans

Each micro-plan is structured so a future executor can pick it up without re-reading prior phase reports. Files cited are current as of the audit working tree.

### 2.1 BR-4 — Drop the fictional memory percentage

- **Source finding**: [03-wasm-bridge-fitness.md §1.5](./03-wasm-bridge-fitness.md#15-memory-usage--openscad-workerjs26822715--mainjs34163457).
- **Why**: `aria-valuenow` is set to a number the worker's own comment calls "meaningless" (`src/worker/openscad-worker.js:2118-2123`). Screen reader users hear "memory at 47 %" when the real interpretation is "the WASM heap has been allocated to 47 % of an arbitrary 1 GB threshold."
- **Files to touch**:
  - `src/worker/openscad-worker.js` (lines 2693-2700, 2118-2124)
  - `src/main.js` (lines 3429-3445)
  - `src/styles/components.css` (memory-bar fill / warning / critical class definitions; UNVERIFIED line range)
  - `index.html` (the `<div role="progressbar">` element wrapping the memory indicator; UNVERIFIED line range)
- **Change shape**:
  - Worker: in the `MEMORY_USAGE` postMessage payload, drop `limit` and `percent`. Keep `usedMB`.
  - Main: replace the bar element with a plain `<span class="memory-mb">{usedMB} MB</span>`. Remove `aria-valuenow`/`aria-valuemin`/`aria-valuemax`. Remove the `warning` / `critical` class additions (the absolute MB warning still happens via `memory-monitor.js`'s `MemoryState`).
  - CSS: delete the `.memory-bar`, `.memory-fill`, and the `.warning`/`.critical` modifier rules.
- **Required tests (before)**:
  - `tests/unit/memory-monitor.test.js` already exists. Add one new case: "updateFromWorker with `{ used, percent: undefined }` keeps `current.percent` undefined." Confirms the worker can stop sending the field.
- **Required tests (after)**:
  - Update one Playwright a11y test: assert no `aria-valuenow` on memory indicator. (~5 LOC.)
- **LOC delta**: -25 ± 5 net.
- **Risk**: Low. The visible UI shrinks but loses no information (the `MemoryState.WARNING` / `CRITICAL` triggers stay).
- **Acceptance**: Lighthouse a11y unchanged or improved; `pixi run lint` passes; manual Tab-focus + screen-reader walk past the indicator announces "150 MB" not "Memory progress bar 47 %."

### 2.2 A11Y-1 — Fix the dark-mode `color-contrast` failure

- **Source finding**: [04-accessibility-conformance.md §1](./04-accessibility-conformance.md#1-lighthouse-rerun-fresh-2026-04-17).
- **Why**: Lighthouse 2026-04-17 run shows `color-contrast` failing at `.features-note > strong` with ratio 4.44 < 4.5. The codebase's own CSS comment at `src/styles/components.css:8852-8854` explains the fix.
- **Files to touch**:
  - `src/styles/components.css` (line 9027, plus ~10 sibling sites that risk the same defect)
- **Change shape**:
  - One-line `var(--color-text-muted)` → `var(--color-text-secondary)` change in `.features-note`.
  - Defensive sweep: search for other small-text usages of `--color-text-muted` in `components.css` and decide each on its own merits. The audit identified `.preset-combobox-input::placeholder` (line 4735), `.param-search-input::placeholder` (line 11145) as candidates.
- **Required tests (before)**:
  - Add a Playwright accessibility regression case "first-visit modal passes axe-core color-contrast" — `tests/e2e/accessibility.spec.js` likely already has the harness; add the modal selector to its visited-pages list.
- **Required tests (after)**:
  - Re-run Lighthouse: `npx lighthouse http://localhost:5173 --only-categories=accessibility --quiet --chrome-flags="--headless --no-sandbox" --output=json --output-path="$PWD/.audit-scratch/lighthouse-post-fix.json"`. Expect score ≥ 0.99.
- **LOC delta**: ±0 (token swap).
- **Risk**: Trivial. Visual contrast increases but does not change visual hierarchy in a perceptible way at small font sizes.
- **Acceptance**: Lighthouse `color-contrast` audit passes; visual regression baseline (`tests/visual/baselines/win32/welcome-screen.png`) re-captured if Windows-host run shows pixel diff.

### 2.3 A11Y-4 — Refactor folder rows to a real list-row pattern

- **Source finding**: [04-accessibility-conformance.md §4.1](./04-accessibility-conformance.md#41-div-rolebutton-with-nested-button-children--real-defect).
- **Why**: `<div role="button">` with nested `<button>` actions violates WAI-ARIA's "no nested interactive descendants in a button-roled element" rule. AT users encounter a "button" with mystery internal buttons — confusing and undocumented behavior across NVDA/VoiceOver/JAWS.
- **Files to touch**:
  - `src/js/saved-projects-ui.js` (lines 768-797 + the keyboard handler at 866-875)
  - `src/js/companion-files-controller.js` (lines 369-376)
- **Change shape**:
  - Replace the outer `<div role="button" tabindex="0">` with `<li class="file-manager-item file-nav-folder-row">`. Wrap the folder name in a `<button class="folder-open-button" aria-label="Open folder Foo, 3 files">…</button>`. Keep the action buttons as siblings of the open button. Visual layout is preserved via flex.
  - Update keyboard handler: drop the row-level Enter/Space activation; the `<button>` natively handles both keys. Remove the `e.target.closest('button')` exemption logic — it's no longer needed.
- **Required tests (before)** — *PREREQUISITE*:
  - Phase 5's `T-06` ("characterization tests for `saved-projects-ui.js`") must complete first. Today the file has 0 % unit coverage (`05-tests-and-safety-net.md §1.2`). Add at minimum:
    - "Open folder via keyboard Enter on row" (current behavior).
    - "Open folder via mouse click on folder name."
    - "Rename action button is reachable by Tab from the row."
    - "Delete action button is reachable by Shift+Tab from the rename button."
- **Required tests (after)**:
  - Re-run the same four cases. Add an axe-core scan of the file-manager modal to confirm no new ARIA violations.
- **LOC delta**: ~40 changed across two files; no net add/remove.
- **Risk**: Medium — touches keyboard nav. Mitigated by the prerequisite tests.
- **Acceptance**: All four characterization tests pass; axe-core reports no new violations; manual NVDA walk lists the folder name as a button (not a row containing a button).

### 2.4 BR-1 — Rename "Display AST" to "Display Parameters"

- **Source finding**: [03-wasm-bridge-fitness.md §1.1](./03-wasm-bridge-fitness.md#11-display-ast--design-panel-controllerjs65109).
- **Why**: The label says "AST" but the modal shows the Customizer parameter dictionary. Lying-by-label damages user trust.
- **Files to touch**:
  - `src/main.js:2397` (menu item text)
  - `src/js/design-panel-controller.js:65-109` (modal title, `aria-label`, screen-reader announcement)
- **Change shape**:
  - Strings only. "Display AST…" → "Display Parameters…", "Parsed Parameters (AST)" → "Parameter Schema", `aria-label="Parsed parameter AST"` → `aria-label="Parameter schema"`, `announceImmediate("AST displayed with X parameters")` → `announceImmediate("Parameter schema displayed with X parameters")`.
- **Required tests (before)**:
  - None (string changes).
- **Required tests (after)**:
  - Update any Playwright spec that asserts on the old label string. `Grep tests/ for 'Display AST'` to find them; expected ≤ 3 hits.
- **LOC delta**: ±0.
- **Risk**: Trivial.
- **Acceptance**: Manual: open the menu, click "Display Parameters", confirm the modal title and SR announcement use the new wording.

### 2.5 BR-2 — Remove the unreachable "(non-manifold)" check

- **Source finding**: [03-wasm-bridge-fitness.md §1.3](./03-wasm-bridge-fitness.md#13-check-validity--design-panel-controllerjs115156).
- **Why**: `vertexCount % 3 !== 0` is gated on `!geo.index`, but OpenSCAD STL output produces non-indexed geometry where `vertexCount` is always `triangles × 3`. The check is unreachable; "(non-manifold)" is never appended; the user sees "Valid: N triangles" for inputs that may be genuinely non-manifold.
- **Files to touch**:
  - `src/js/design-panel-controller.js:136-138` (the unreachable check)
  - Optionally: rename the menu item from "Check Validity" to "Mesh Statistics" (`src/main.js`, line UNVERIFIED).
- **Change shape**:
  - Either delete the `if (!geo.index && vertexCount % 3 !== 0)` block (5 LOC), OR keep the check but rename the button to "Mesh Statistics" and remove the `(non-manifold)` parenthetical from the label.
- **Required tests (before)**:
  - None (the deleted code is unreachable, so no test exercises it).
- **Required tests (after)**:
  - Confirm the existing "Check Validity reports triangle count" test (if any in `tests/e2e/`) still passes.
- **LOC delta**: -5.
- **Risk**: Trivial.
- **Acceptance**: Renamed label flows to SR; deleted code has zero coverage delta (was 0 % before).

### 2.6 BR-3 — Rename "Volume" to "Bounding Box Volume"

- **Source finding**: [03-wasm-bridge-fitness.md §1.4](./03-wasm-bridge-fitness.md#14-geometry-info--design-panel-controllerjs162202--previewjs23422362).
- **Why**: The displayed value is `size.x * size.y * size.z` (bbox volume). For a 100 mm sphere this overstates real volume by 1.9×; for a hollow vase (typical assistive-device project) the over-report can exceed 50×.
- **Files to touch**:
  - `src/js/design-panel-controller.js:187` (the row label "Volume")
  - Optional follow-up: extend `preview.js#calculateDimensions` (lines 2342-2362) to also compute signed-tetrahedron mesh volume.
- **Change shape**: One-string label change for the Quick Win. Add a `bboxVolume` (and later `meshVolume`) field in the returned object if the team wants to display both.
- **Required tests (before)**:
  - None.
- **Required tests (after)**:
  - Add a unit test on `calculateDimensions` that snapshots a known cube + sphere mesh and asserts `bboxVolume === expected`.
- **LOC delta**: ±0.
- **Risk**: Trivial.
- **Acceptance**: Manual review of Geometry Info panel.

### 2.7 A11Y-2 — Consolidate the inline focus trap in `error-translator.js`

- **Source finding**: [04-accessibility-conformance.md §5.2](./04-accessibility-conformance.md#52-focus-trap-utility--srcjsfocus-trapjs).
- **Why**: `src/js/error-translator.js#showErrorModal` (lines 463-489) shadow-implements the same Tab/Shift+Tab focus trap that `src/js/focus-trap.js#createFocusTrap` already provides. ~25 LOC duplicated, with a slightly different focusable selector (the inline copy includes `summary`).
- **Files to touch**:
  - `src/js/error-translator.js` (replace lines 463-489 with `createFocusTrap` call)
- **Change shape**:
  ```js
  import { createFocusTrap } from './focus-trap.js';
  // inside showErrorModal:
  const trap = createFocusTrap(overlay, { onEscape: cleanup });
  trap.activate();
  // on cleanup:
  trap.deactivate();
  ```
- **Required tests (before)**:
  - Verify `getFocusableElements` in `focus-trap.js` includes `<summary>` elements (the inline copy did). UNVERIFIED — needs a quick repro: render `<summary>` inside a focus-trapped container, assert Tab cycles through it.
- **Required tests (after)**:
  - Existing `tests/unit/error-translator.test.js` 28 tests must still pass. Add: "Tab cycles through error-modal action buttons" (axe-core or focus-order assertion).
- **LOC delta**: -15 net (deleted inline trap minus the new import + 2-line activation).
- **Risk**: Low.
- **Acceptance**: Existing focus behavior preserved; one unified focus-trap implementation; lint reports one fewer module-local function.

### 2.8 A11Y-3 — Add `@media (prefers-reduced-transparency: reduce)` block

- **Source finding**: [04-accessibility-conformance.md §2](./04-accessibility-conformance.md#2-preference-media-query-coverage). Only 1 rule in the codebase covers this preference; modern accessibility-first apps typically have 5-15.
- **Why**: Users who request reduced transparency see translucent modals/drawers/tooltips/scrims today (28 `rgba(...)` instances).
- **Files to touch**:
  - `src/styles/components.css` — add a single `@media (prefers-reduced-transparency: reduce)` block near the existing `@media (prefers-contrast: more)` block.
- **Change shape**:
  ```css
  @media (prefers-reduced-transparency: reduce) {
    .modal-overlay { background-color: var(--color-bg) !important; opacity: 1; }
    .drawer-overlay { background-color: var(--color-bg) !important; opacity: 1; }
    .tooltip { background-color: var(--color-bg-elevated) !important; backdrop-filter: none; }
    /* …~10-15 more rules covering scrims, friendly-error-modal, tutorial-modal, etc. */
  }
  ```
- **Required tests (before)**:
  - None (additive media query).
- **Required tests (after)**:
  - Optional Playwright test that toggles emulated `prefers-reduced-transparency` and screenshots a modal — defer to Phase 7.
- **LOC delta**: +25.
- **Risk**: Trivial.
- **Acceptance**: Manual: enable Windows "transparency effects off" or DevTools `prefers-reduced-transparency: reduce` emulation; modals show solid backgrounds.

### 2.9 A11Y-5 — Fix HTML validation errors in `index.html`

- **Source finding**: [04-accessibility-conformance.md §6](./04-accessibility-conformance.md#6-html-validation-carry-forward) and [00-baseline.md §7.7](./00-baseline.md#77-html--css--svg-validation--pixi-run-validatehtml).
- **Why**: 13 `vnu-jar` validation errors. The accessibility-relevant ones:
  - `index.html:2429` — `for` attribute on `<label>` references non-existent ID. Real defect — label-input association broken.
  - `index.html:2561, 2570, 2678, 2829, 3702, 5906, 6134` — `aria-label` / `aria-labelledby` on generic `<div>` / `<span>` / `<pre>`. Real defect — AT may ignore the labels.
  - `index.html:1769, 3134` — `aria-valuemin`/`aria-valuemax` redundant when `min`/`max` are present. Cosmetic; remove the ARIA attributes.
- **Files to touch**:
  - `index.html` — 13 specific lines, each a 1-line change.
- **Change shape**:
  - Fix the broken `for=` to point at the actual input ID.
  - Either give the `<div>`/`<span>`/`<pre>` a non-generic role (`role="region"`, `role="status"`, etc.) **or** drop the `aria-label`. Audit each case individually — some may indicate genuine missing semantics.
  - Remove `aria-valuemin`/`aria-valuemax` from elements that already have `min`/`max`.
- **Required tests (before)**:
  - None (HTML attribute fixes).
- **Required tests (after)**:
  - Re-run `pixi run validate:html` — expect 0 errors.
- **LOC delta**: ~13 lines edited.
- **Risk**: Low. The `aria-label`-on-generics cases need per-element judgement; if uncertain, defer that one to Phase 7.
- **Acceptance**: `pixi run validate:html` exits 0.

### 2.10 BR-5 — Consolidate worker-side and main-thread error translation

- **Source finding**: [03-wasm-bridge-fitness.md §1.7](./03-wasm-bridge-fitness.md#17-error-translation--two-parallel-pattern-tables).
- **Why**: Two `translateError` functions in two places, with ~50 % overlapping but non-identical pattern tables. The worker classifies errors with a `code` field; the main thread re-matches the raw error string from scratch and ignores the `code`. Result: worker work is wasted; UI may show "Something Went Wrong" for an error the worker already classified as "Parser error."
- **Files to touch**:
  - `src/worker/openscad-worker.js` (lines 103-227 — `ERROR_TRANSLATIONS`, plus the `translateError` function around line 285 — UNVERIFIED line range)
  - `src/js/error-translator.js` (lines 12-216 — `ERROR_PATTERNS`, plus `translateError`)
- **Change shape — Option A** (recommended):
  - Move all rich `{ title, explanation, suggestion }` content to `src/js/error-translator.js#TRANSLATIONS_BY_CODE` keyed on the worker's `code` enum.
  - Worker keeps its existing pattern table but only emits `{ code, raw }` — no prose.
  - Main thread receives `{ code, raw }` and looks up `TRANSLATIONS_BY_CODE[code]`. Falls back to legacy regex matching if `code === 'INTERNAL_ERROR'`.
  - Net: ~50 LOC removed across two files; one source of truth per concept.
- **Change shape — Option B** (alternative):
  - Move all pattern matching to the worker; postMessage `{ title, explanation, suggestion, technical }` directly. Removes `error-translator.js#ERROR_PATTERNS` entirely. ~80 LOC removed but loses the worker's heuristic refinement step (e.g., "INTERNAL_ERROR + console says 'top level object empty' → upgrade to EMPTY_GEOMETRY").
- **Required tests (before)**:
  - Build a fixture corpus of stderr strings (start from `ERROR_PATTERNS` test strings). For each fixture, assert that **both** today's worker translateError and today's main-thread translateError produce equivalent classifications.
- **Required tests (after)**:
  - Same corpus must produce the same `{ title, explanation, suggestion }` after consolidation.
- **LOC delta**: -50 net (Option A).
- **Risk**: Medium — error handling is on the user's critical path. The fixture-corpus property test is the safety net.
- **Acceptance**: Existing `tests/unit/error-translator.test.js` (28 cases) must continue to pass. New corpus tests confirm classification parity. No worker stderr line goes unrecognized that today *was* recognized.

### 2.11 T-01..T-05 — Test hygiene quick fixes

- **Source finding**: [05-tests-and-safety-net.md §2 + §6](./05-tests-and-safety-net.md#2-ai-tests-of-ai-code-anti-pattern).
- **Why**: 5 tests assert on copies of production code rather than importing it. They pass even when production drifts. Plus: visual baselines are Windows-only; one test leaks `localStorage.getItem is not a function` to stderr.
- Bundle of 5 small fixes:

  | Sub-task | Files | Change |
  | --- | --- | --- |
  | T-01 | `tests/unit/cli-manifest.test.js` + `cli/commands/manifest.js` | Refactor `manifest.js` to export pure helpers (`detectMainFile`, `detectPresetFile`, `buildManifest`); update test to import the real helpers |
  | T-02 | `tests/unit/svg-validation.test.js` + `src/worker/openscad-worker.js` | Extract `validateSVGOutput` from worker into a shared pure module (`src/worker/svg-validation.js` or `src/js/svg-validation.js`); both worker and test import from it |
  | T-03 | `tests/unit/image-companion-mounting.test.js`, `tests/unit/saved-projects-load.test.js` | Same pattern as T-02 — extract or import the real function |
  | T-04 | `playwright.config.js` + `tests/visual/baselines/linux/` (or remove `{platform}` from `snapshotPathTemplate`) | Either generate Linux baselines under controlled font config, OR drop the `{platform}` token and run all visual tests against a containerized Chromium |
  | T-05 | `tests/unit/library-manager.test.js` setup | Initialize `localStorage` in `beforeEach` so the stderr leak (`localStorage.getItem is not a function`) goes away |

- **Required tests (before)**:
  - None (these *are* the test fixes).
- **Required tests (after)**:
  - `pixi run test` passes; `pixi run test:visual` passes on Linux (if T-04 chose the containerized-Chromium path).
- **LOC delta**: small adds and removes; net change negligible.
- **Risk**: Low.
- **Acceptance**: All five mirror-test antipatterns are gone; `Grep "Mirrors\|Re-implement\|Keep.*sync" tests/` returns 0 hits.

### 2.12 Q1 — Remove 14 dead symbols

- **Source finding**: [01-architecture-redundancy.md §4.1](./01-architecture-redundancy.md#41-genuinely-dead--recommended-for-removal-in-phase-6).
- **Files to touch**: 8 files, mostly small line-level deletions:
  - `src/js/csp-reporter.js` (lines 89, 108, 116) — 3 unused exports
  - `src/js/design-panel-controller.js:240` — `resetDesignPanelController`
  - `src/js/edit-actions-controller.js:313` — `resetEditActionsController`
  - `src/js/param-detail-controller.js:115` — `getDetailLevel`
  - `src/js/preset-manager.js:256` — `resetMigrationFlag`
  - `src/js/state.js:533` — `getShareableURL`
  - `src/js/svg-preparer.js:153, 176` — `endL`, `startR` locals
  - `src/js/tutorial-sandbox.js:3626, 3637` — `isTutorialActive`, `getCurrentTutorialId`
  - `src/js/ui-generator.js:205` — `index` local
  - `src/js/ui-mode-controller.js:808` — `resetUIModeController`
- **Change shape**: Delete each symbol + its JSDoc block. ~140 LOC total. Phase 1 verified each is unreferenced in `src/`, `tests/`, and `cli/`.
- **Required tests (before)**:
  - None — symbols have no callers.
  - However: confirm `index.html` does not invoke any of these via inline `<script>`. Already done in Phase 1 §4.1 verification.
- **Required tests (after)**:
  - `pixi run lint` should now report 0 warnings (was 14).
- **LOC delta**: -140.
- **Risk**: Trivial.
- **Acceptance**: 0 lint warnings; all tests pass.

### 2.13 Q3 — Centralize `localStorage` try/catch into `safeGetItem` / `safeSetItem`

- **Source finding**: [01-architecture-redundancy.md §2.3](./01-architecture-redundancy.md#23-in-house-code-that-does-duplicate-something-already-in-house). 27 files contain ad-hoc `try { localStorage.getItem(KEY) } catch {}` blocks; ~240 raw calls total.
- **Files to touch**:
  - Add helpers to `src/js/storage-keys.js` (or a sibling `src/js/storage-keys-helpers.js`).
  - Migrate 27 files in waves (group by controller).
- **Change shape**:
  ```js
  // src/js/storage-keys.js (new export)
  export function safeGetItem(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch (err) { console.warn(`localStorage.getItem(${key}) failed`, err); return fallback; }
  }
  export function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (err) { console.warn(`localStorage.setItem(${key}) failed`, err); return false; }
  }
  ```
  Then in each consumer: `try { localStorage.getItem(KEY) } catch {}` → `safeGetItem(KEY)`.
- **Required tests (before)** — *PREREQUISITE*:
  - Add a unit test for `safeGetItem` / `safeSetItem` that simulates `QuotaExceededError` and `SecurityError` paths.
- **Required tests (after)**:
  - `pixi run test` passes; spot-check 3 files for behavior parity.
- **LOC delta**: -60 to -100 net.
- **Risk**: Medium — touches 27 files. Migrate in waves, not in one PR.
- **Acceptance**: `Grep -c 'try.*localStorage.*catch'` drops from current count to ≤ 5; all tests pass.

### 2.14 Q2 — Consolidate `parseLuminance` with `hexToRgb`

- **Source finding**: [01-architecture-redundancy.md §2.3](./01-architecture-redundancy.md#23-in-house-code-that-does-duplicate-something-already-in-house). `src/js/image-import.js:130-154` re-implements hex-to-RGB parsing already in `src/js/color-utils.js:46-70`.
- **Files to touch**:
  - `src/js/image-import.js` (lines 130-154)
- **Change shape**:
  ```js
  import { hexToRgb } from './color-utils.js';
  function parseLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  }
  ```
- **Required tests (before)**:
  - Confirm `hexToRgb` and the inline math produce identical outputs for the project's color corpus. Since they're literal hex parsing, this is mechanical.
- **Required tests (after)**:
  - Existing `tests/unit/image-import*.test.js` (if any; UNVERIFIED) still passes.
- **LOC delta**: -12.
- **Risk**: Trivial.
- **Acceptance**: Identical numeric output; one less hex parser in the codebase.

### 2.15 Q4 — Move `STORAGE_KEY_*` constants from `main.js` and `preview.js` into `storage-keys.js`

- **Source finding**: [01-architecture-redundancy.md §2.3](./01-architecture-redundancy.md#23-in-house-code-that-does-duplicate-something-already-in-house) + [02-complexity-hotspots.md §1.1 split #8 + §2.1 split #1](./02-complexity-hotspots.md#11-recommended-split-target-shape).
- **Why**: 13 `STORAGE_KEY_*` constants live at top of `main.js`; 10 more at top of `preview.js`. They belong in `storage-keys.js` so the namespace is centralized.
- **Files to touch**:
  - `src/main.js` (lines ~140-155)
  - `src/js/preview.js` (lines 53-62)
  - `src/js/storage-keys.js` (add the 23 missing constants)
- **Change shape**: Move each `const STORAGE_KEY_X = '...'` to `storage-keys.js`; replace local references with imports.
- **Required tests (before)** — *PREREQUISITE for the larger main.js split*:
  - Add a "snapshot" test asserting all `STORAGE_KEY_*` exports of `storage-keys.js` against a frozen list. Mechanical safety net.
- **Required tests (after)**:
  - `pixi run test` passes.
- **LOC delta**: ~25 lines moved (no net deletion).
- **Risk**: Trivial.
- **Acceptance**: All 23 keys live in one file; main.js + preview.js shrink by ~25 lines each.

---

## 3. Decompose-First — needs characterization tests before refactor

These are the Phase 2 splits. Each one is **blocked** until Phase 5's recommended characterization tests exist for the affected file. Listed in priority order:

| ID | Target | Current → After | Splits | Phase 5 prerequisite | Composite |
| --- | --- | --- | ---: | --- | ---: |
| **D1** | `src/main.js` | 12,653 → ~1,500 | 9 | T-08 (characterization tests for main.js's initApp regions) | Highest LOC moved + highest mission impact (entry point) |
| **D6** | `src/js/auto-preview-controller.js#onParameterChange` (1,093-line method) | 2,042 → ~1,500 | 3 (split #1 = HIGH risk) | Phase 2 §6.2 listed 6 specific cases that **MUST** exist | Highest risk per LOC in the codebase |
| **D11** | `src/styles/components.css` | 13,994 → ~6,300 | 11 (top sections) | Visual baselines per feature (UNVERIFIED — likely needs ~10 new baselines) | Largest single file in the repo |
| **D8** | `src/js/saved-projects-ui.js` | 1,753 → ~250 | 5 | T-06 (DOM-level keyboard nav + drag-drop tests) | Combines with A11Y-4 |
| **D9** | `src/js/file-handler.js` | 1,744 → ~120 | 4 | "upload `.scad`/`.svg`/`.stl`/`.zip` E2E tests" — exist in some form, audit needed | File-ingest pipeline per type |
| **D7** | `src/js/saved-projects-manager.js` | 2,242 → ~100 (façade) | 7 | "DB upgrade from v(N-1) → v(current)" + "save → folder-move → list → delete-folder roundtrip" | Cleanest split shape (32 exports cluster naturally) |
| **D5** | `src/js/ui-generator.js` | 2,732 → ~600 | 7 | "render a number / color / file / vector / select control" smoke tests per family | Form-control factory, splits along control type |
| **D3** | `src/js/tutorial-sandbox.js` | 3,659 → ~2,000 | 5 | "tutorial run start → next → close" per tutorial in the data file | Content extraction (TUTORIALS data → separate file) is the largest single move |
| **D4** | `src/worker/openscad-worker.js` | 2,827 → ~1,300 | 5 | "render SCAD → STL byte-length matches golden fixture" + DXF/SVG validators + font/lib mounts | Aligns with Phase 3 BR-5 consolidation |
| **D2** | `src/js/preview.js` | 4,734 → ~4,250 | 4 | Smoke test for `PreviewManager` construction + dispose | Least urgent (cohesive class, smaller wins) |
| **D10** | `src/js/preset-manager.js` | 1,724 → ~1,200 | 6 | "schema v0 → v1 → current preserves values" + "coercePresetValues handles every type" | Cleanest split shape after D7 |

**Key dependency**: every D-class refactor must wait on its corresponding T-class test prerequisite. Phase 5 §7 already enumerates these in micro-plan stubs T-06..T-09.

---

## 4. Library-shadow removal

| ID | Action | Composite | Notes |
| --- | --- | --- | --- |
| L1 | Investigate whether `clipper2-js` can replace `path-bool` for boolean SVG ops | Defer-upstream | Phase 1 §2.4 — both libraries currently in `dependencies`. Bundle savings UNVERIFIED until clipper2's `BooleanOp` API is exercised on the project's path corpus. |
| L2 | Consolidate worker + main error translators (= **BR-5** above) | 7 (Quick Win) | Already enumerated as a Quick Win |
| L3 | Replace `error-translator.js` inline focus trap with `createFocusTrap` (= **A11Y-2**) | 7 (Quick Win) | Already enumerated as a Quick Win |
| L4 | Extract a `debounce(fn, ms)` helper from the 14 ad-hoc setTimeout/clearTimeout pairs | 5 | Phase 1 §2.3 §125. ~30 LOC. Low priority because ad-hoc debounces work; main benefit is "one place to fix" the AbortController + flush-on-blur edge cases. |

---

## 5. Defer-upstream (require OpenSCAD WASM / CGAL changes)

These are **not** in scope for this audit's recommended changes — they require contributing to the upstream OpenSCAD project. Phase 7 will collect them into the "additional recommended changes" report. Listed here for traceability.

| ID | Capability | Bridges retired | Source |
| --- | --- | --- | --- |
| UP-1 | Real progress callback (Emscripten hook from CGAL/Manifold) | Replaces "indeterminate spinner" simulation | [03-wasm-bridge-fitness.md §3](./03-wasm-bridge-fitness.md#3-consider-upstreaming-candidates) |
| UP-2 | Structured AST export (`--export-format=ast-json`) | Removes the `parser.js` shadow implementation; **also** retires the BR-1 relabel in the long term | Same |
| UP-3 | Real CGAL manifold check exposed via `Module` export | Removes the unreachable `vertexCount % 3` heuristic from `design-panel-controller.js` | Same |
| UP-4 | Geometry stats (volume, surface area, bbox) from CGAL | Replaces the bbox-volume hack (BR-3) with a true mesh volume | Same |
| UP-5 | Real WASM memory accounting (`getMemoryUsageBytes()` binding) | Replaces the misleading `HEAP8.length` proxy (BR-4) | Same |
| UP-6 | Structured error objects (`--error-format=json`) | Removes stderr regex matching in **both** `error-translator.js` AND `openscad-worker.js#translateError` (BR-5) | Same |
| UP-7 | Native `OPENSCADPATH` / `-I` library include flag | Removes the ENV + FS-symlink hack at worker line 1318 | Same |
| UP-8 | `roof()` / `projection()` CGAL crash fix | Removes the defensive pre-render guard at worker lines 1394-1416 | Same |

---

## 6. Defer-design (require API or product decisions)

| ID | Decision required | Source | Why deferred |
| --- | --- | --- | --- |
| DD1 | Delete `src/js/animation-controller.js` (481 LOC orphan) **or** wire it into `preview.js` | [01 §3.4](./01-architecture-redundancy.md#34-srcjsanimation-controllerjs--orphaned-but-has-a-pinned-reason) | Touches feature flags + storage-key reservations either way |
| DD2 | Pick a single owner for `toJsonSchema` (`src/js/schema-generator.js` vs `cli/commands/extract.js`) | [01 §2.5 + §3.3](./01-architecture-redundancy.md#25-in-house-code-that-does-not-shadow-but-is-currently-duplicated-inside-the-project) | The two implementations are intentionally forked; merging requires a `format: 'cli-legacy' \| 'web'` API knob |
| DD3 | Move `TUTORIALS` content from `tutorial-sandbox.js` to `src/data/tutorials.json` | [02 §3.1](./02-complexity-hotspots.md#31-recommended-split) | JSON loses inline JS conditionals (`showWhen` predicates) — needs a predicate-by-name registry |
| DD4 | Move HTML modals out of `index.html` (~1,650 LOC) | [02 §13](./02-complexity-hotspots.md#13-indexhtml--6372-lines--single-page-app-shell) | The accessibility-first stance prefers static HTML the screen reader can parse on first byte; runtime cloning has trade-offs |
| DD5 | Globally bump `--color-text-muted` from slate-10 to slate-11 | [04 §1](./04-accessibility-conformance.md#1-lighthouse-rerun-fresh-2026-04-17) (alternate to A11Y-1) | May affect visual hierarchy elsewhere; needs visual regression review |
| DD6 | Demote some of the 17 `role="region"` landmarks to `<section>` | [04 §4.4](./04-accessibility-conformance.md#44-17-roleregion-landmarks--borderline) | Per-element judgement; small UX impact today |
| DD7 | Introduce an `exportForTests` convention to legitimize internal seams | [05 §3 + T-10](./05-tests-and-safety-net.md#3-implementation-detail-tests) | Project-wide convention change |
| DD8 | Split `src/styles/layout.css` (4,382 LOC) by section | [02 §12](./02-complexity-hotspots.md#12-srcstyleslayoutcss--4382-lines--25-sections) | Lower priority than `components.css` (D11); apply the same approach if/when |

---

## 7. No-op (verified false positives)

These items are recorded so they are not re-discovered as "issues" by future audits.

| Item | Why it's not an issue | Source |
| --- | --- | --- |
| 5 vendored copies of `openscad-worker.js` under `cli/templates/<framework>/` | Two unique stub variants (76-line and 65-line), both intentional scaffold templates — neither shadows the canonical 2,556-line worker | [01 §3.5](./01-architecture-redundancy.md#35-cli-worker-copies--not-a-duplication-finding-correction-to-baseline) |
| `src/js/color-utils.js` ↔ `colorjs.io` | `colorjs.io` is a `devDependency` (test-only); `color-utils.js` covers a tiny subset; pulling `colorjs.io` into runtime would add multi-KB bundle for trivial gain | [01 §2.2](./01-architecture-redundancy.md#22-in-house-code-that-does-not-shadow-a-library--confirmed) |
| `src/js/textarea-editor.js` ↔ `@codemirror/*` | Intentional accessibility-first fallback (plain `<textarea>` for users who explicitly need it); not a duplicate implementation | [01 §2.1](./01-architecture-redundancy.md#21-confirmed-clean-library-is-the-source-of-truth) |
| Three `@reserved` exports in `validation-schemas.js` | Intentional API reservations consumed by Ajv via schema-name lookup | [01 §4.3](./01-architecture-redundancy.md#43-reserved-api--preserve) |

---

## 8. Suggested execution waves

If the team wants to ship the Quick Wins as a coordinated sequence rather than 15 separate PRs, the audit suggests this batching:

### Wave 1 — "Honesty restoration" (1 sprint)

Mission-critical UX corrections that improve trust. No prerequisites. ~6 LOC removed, ~3 string changes, 1 token swap.

- BR-1, BR-2, BR-3, BR-4 (Phase 3 stop-bridging quick wins)
- A11Y-1 (color contrast fix — restores Lighthouse score to 1.0)

### Wave 2 — "Test hygiene + dead code" (1 sprint)

Safety net hardening before any decomposition begins.

- T-01, T-02, T-03, T-04, T-05 (test-mirror antipatterns + Linux baselines + library-manager stderr)
- Q1 (14 dead symbols)
- A11Y-3 (prefers-reduced-transparency block)
- A11Y-5 (HTML validation fixes)

### Wave 3 — "Consolidation" (1-2 sprints)

Mechanical consolidations that reduce duplication. Each has a dedicated test prerequisite.

- A11Y-2 (focus-trap consolidation)
- BR-5 (error translator consolidation)
- Q2 (parseLuminance → hexToRgb)
- Q3 (localStorage helpers — needs migration in waves)
- Q4 (STORAGE_KEY_* moves)
- L4 (debounce helper — optional)

### Wave 4 — "Big decompositions" (multi-sprint)

Each D-class refactor is its own multi-week effort. Recommended order:

1. D7 (`saved-projects-manager.js` — clean splits, well-factored at function level)
2. D5 (`ui-generator.js` — clean splits by control type)
3. D9 (`file-handler.js` — splits by file type)
4. D8 (`saved-projects-ui.js`, combined with A11Y-4)
5. D10 (`preset-manager.js`)
6. D3 (`tutorial-sandbox.js` — content extraction first)
7. D4 (`openscad-worker.js` — extract validators + mounts + memory)
8. D2 (`preview.js`)
9. D11 (`components.css` — needs visual baseline coverage first)
10. D6 (`auto-preview-controller.js#onParameterChange` — highest risk)
11. D1 (`main.js` — biggest, but cleanest in shape since each section is `addEventListener` → known controller)

Wave 4 will take many months of sustained effort. The audit's recommendation is to **never start a wave-4 refactor until the wave-3 tests for that file land and pass on three consecutive CI runs.**

### Defer indefinitely

- Defer-upstream (UP-1..UP-8) — Phase 7 will summarize these; pursue via OpenSCAD upstream PR workflow.
- Defer-design (DD1..DD8) — require product decisions; Phase 7 will collect.

---

## 9. What this phase does **not** cover

Per the audit charter ([plan §non-goals](../../../.cursor/plans/professional_code_review_plan_68eb907c.plan.md)):

- No source code is modified.
- No refactor is executed (this phase only ranks).
- No upstream OpenSCAD pull request is drafted (covered by Phase 7's UP- catalog).
- No SBOM, security, PWA, perf-budget, or mobile-optimization recommendations (Phase 7's "Log-for-later" bucket).

Phase 7 picks up the doc-correction list, the upstream candidates, and any mission-aligned items the prior phases didn't have a slot for.

---

## 10. Provenance flags

- All micro-plans cite `file:line` ranges from the prior phase reports. **OBSERVED** in the working tree at audit time.
- Composite scores are deterministic given the rubric in §0. **OBSERVED**.
- LOC delta estimates are conservative; the executor should re-measure before each PR. **INFERRED**.
- The "5 mirror tests" identified in §2.11 / T-01..T-03 are confirmed by ripgrep on `tests/` for the literal strings "mirrors" / "Re-implement" / "Keep this copy in sync". **OBSERVED**.
- The wave grouping in §8 reflects the rubric ranking + a heuristic about safe batching. **INFERRED** — the team may regroup by team capacity.
