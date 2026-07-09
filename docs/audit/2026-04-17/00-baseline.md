# 00 — Baseline metrics

OpenSCAD Assistive Forge — Professional Code Review, 2026-04-17.

This file captures raw, **pre-analysis** numbers so every later phase can cite a single source for "what the codebase looked like at the start of the review."

- **No analysis or recommendations appear here.** Those are produced in phases 1–7.
- Every number is reproducible from the commands listed below.
- Working tree at capture time: only `webkit-logs.txt` was untracked; no source files modified.
- Today: 2026-04-17.
- Pixi `0.63.2` is installed; commands were issued as `pixi run …` per [.cursor/rules/env-tool.mdc](../../../.cursor/rules/env-tool.mdc). When pixi is absent, the equivalent `npm run …` line works.

---

## 1. Repo metadata

- App name / version: `openscad-assistive-forge` `4.4.0` ([package.json:2-3](../../../package.json)).
- Node toolchain target: `nodejs >=20` ([pixi.toml:20](../../../pixi.toml)).
- Build system: `vite ^7.3.1` ([package.json:82](../../../package.json)), tests `vitest ^4.0.17` + `@playwright/test ^1.57.0` ([package.json:69-83](../../../package.json)).
- Production dependencies: 19. Dev dependencies: 19.
  - Production deps include the libraries Phase 1 must compare custom code against: `clipper2-js`, `path-bool`, `svg-path-commander`, `imagetracerjs`, `jszip`, `three`, `@codemirror/*` ([package.json:87-107](../../../package.json)).
  - Dev deps include `colorjs.io` (note: declared in `devDependencies`, not runtime — Phase 1 should record this), `@axe-core/playwright`, `lighthouse`, `vnu-jar`, `happy-dom`, `jsdom` ([package.json:67-86](../../../package.json)).

---

## 2. Directory size and file counts

Captured with `Get-ChildItem -Recurse -File` and `Measure-Object -Property Length -Sum`.

- `src/` — 85 files, 2,702,707 bytes (≈ 2.58 MiB).
  - `src/js/` — 74 files, 1,646,460 bytes.
  - `src/styles/` — 9 files, 519,418 bytes.
  - `src/worker/` — 1 file, 92,329 bytes.
- `tests/` — 136 files, 8,429,039 bytes total (includes binary baselines and fixtures).
  - `tests/unit/` — 63 files, 1,325,120 bytes.
  - `tests/e2e/` — 35 files, 542,286 bytes.
  - `tests/visual/` — 15 files, 674,251 bytes.
- `scripts/` — 11 files, 98,868 bytes.
- `cli/` — 60 files, 261,168 bytes (templates that vendor copies of the worker — see §6).
- `docs/` — 1,571 files, ≈ 1.07 GiB total. Almost all of that mass (1,459 files / ≈ 1.07 GiB) sits under `docs/audit/ki-012-investigation/` (a prior incident's WASM-backup capture). `docs/` excluding that subtree is ≈ 25 MiB.
- `public/` — 2,295 files, ≈ 86.5 MiB. Includes vendored WASM and the OpenSCAD libraries fetched by `setup-libraries`.

Top-level configuration files of note (from `Get-ChildItem` on the project root):

- `index.html` — 264,012 bytes / **6,372 lines** (this is the single-page app shell).
- `lighthouse-accessibility.json` — 119,970 bytes, last written **2026-02-23**.
- `sbom.json` — 826,393 bytes (CycloneDX SBOM, generated separately; not regenerated for this audit).

---

## 3. Source file LOC totals

Captured per extension under `src/`:

- `.js` — 76 files, **60,957 lines** total.
- `.css` — 9 files, **18,291 lines** total.

Plus the application shell:

- `index.html` — **6,372 lines** (counted with `Get-Content | Measure-Object -Line`).

Cross-cutting note: `src/main.js` alone is 11,303 lines (≈ **18.5 %** of all JS LOC under `src/`).

---

## 4. Top-30 largest source files

Captured with `Get-ChildItem -Recurse -Filter "*.js" | Sort-Object Length -Descending | Select-Object -First 30` and the corresponding LOC count.

Format: `path` — `bytes` — `lines`.

JavaScript / worker:

- `src/main.js` — 444,500 — 11,303
- `src/js/preview.js` — 155,594 — 4,144
- `src/js/tutorial-sandbox.js` — 120,746 — 3,300
- `src/worker/openscad-worker.js` — 92,329 — 2,556
- `src/js/ui-generator.js` — 90,435 — 2,362
- `src/js/auto-preview-controller.js` — 70,052 — 1,857
- `src/js/saved-projects-manager.js` — 68,329 — 2,027
- `src/js/saved-projects-ui.js` — 65,356 — 1,562
- `src/js/file-handler.js` — 61,576 — 1,568
- `src/js/preset-manager.js` — 51,864 — 1,531
- `src/js/render-controller.js` — 47,244 — 1,260
- `src/js/overlay-grid-controller.js` — 41,802 — 1,088
- `src/js/hfm-controller.js` — 40,306 — 1,131
- `src/js/storage-manager.js` — 38,358 — 1,161
- `src/js/parser.js` — 35,076 — 972
- `src/js/zip-handler.js` — 35,014 — 953
- `src/js/svg-preparer-workspace.js` — 32,310 — 859
- `src/js/image-measurement.js` — 31,841 — 1,046
- `src/js/keyboard-config.js` — 31,826 — 1,130
- `src/js/toolbar-menu-controller.js` — 29,759 — 887
- `src/js/companion-files-controller.js` — 28,824 — 762
- `src/js/manifest-loader.js` — 25,520 — 689
- `src/js/_hfm.js` — 25,068 — 699
- `src/js/svg-preparer.js` — 24,595 — 702
- `src/js/ui-mode-controller.js` — 23,564 — 713
- `src/js/camera-panel-controller.js` — 19,620 — 619
- `src/js/error-translator.js` — 19,483 — 512
- `src/js/textarea-editor.js` — 17,850 — 634
- `src/js/comparison-view.js` — 16,916 — 528
- `src/js/quality-tiers.js` — 16,794 — 505

CSS (full list since only 9 files):

- `src/styles/components.css` — 315,248 — 11,957
- `src/styles/layout.css` — 114,895 — 3,797
- `src/styles/variant.css` — 43,859 — 1,265
- `src/styles/variables.css` — 19,143 — 526
- `src/styles/semantic-tokens.css` — 15,119 — 336
- `src/styles/toolbar-menu.css` — 9,124 — 313
- `src/styles/reset.css` — 944 — 72
- `src/styles/color-scales.css` — 845 — 17
- `src/styles/main.css` — 241 — 8

---

## 5. Test inventory

- Vitest unit specs: 62 files (`tests/unit/*.test.js`).
- Playwright E2E specs: 33 files (`tests/e2e/*.spec.js`).
- Visual-regression specs: 1 file (`tests/visual/core-ui.visual.spec.js`).
- Visual baselines: 13 PNG snapshots under `tests/visual/baselines/win32/`; the `tests/visual/baselines/linux/` folder contains only `.gitkeep` (no Linux baselines).
- Test runners not invoked in this baseline:
  - `pixi run test:coverage` — deferred to Phase 5 (it requires a longer block window and is the natural input for that phase).
  - `pixi run test:e2e` and `pixi run test:visual` — deferred to Phase 4 (a11y) and Phase 5 (safety net) respectively.
- The unit-test names line up 1-to-1 with the modules that Phase 2 will deep-dive (e.g., `preview.test.js`, `ui-generator.test.js`, `auto-preview-controller.test.js`, `render-controller.test.js`, `render-queue.test.js`). Phase 5 will measure how much they actually cover.

---

## 6. Worker copies in CLI templates

`src/worker/openscad-worker.js` exists as the canonical source plus 5 vendored copies under `cli/templates/<framework>/src/worker/openscad-worker.js`:

- `cli/templates/angular/src/worker/openscad-worker.js`
- `cli/templates/preact/src/worker/openscad-worker.js`
- `cli/templates/react/src/worker/openscad-worker.js`
- `cli/templates/svelte/src/worker/openscad-worker.js`
- `cli/templates/vue/src/worker/openscad-worker.js`

This is recorded as data here; Phase 1 decides whether they are duplicates of `src/worker/openscad-worker.js` or intentional template forks.

---

## 7. Scanner outputs (commands and counts only)

All commands run via `pixi run <task>`, which is a thin wrapper around the `npm run <task>` line in [package.json](../../../package.json).

### 7.1 Lint — `pixi run lint`

Result: 0 errors, **14 warnings**. Build does not fail.

All 14 warnings are `no-unused-vars` for symbols that match exported but currently unreferenced helpers. Phase 1 separates "test-only" exports from "genuinely dead":

- `src/js/csp-reporter.js:89` — `getViolations`
- `src/js/csp-reporter.js:108` — `clearViolations`
- `src/js/csp-reporter.js:116` — `hasViolations`
- `src/js/design-panel-controller.js:240` — `resetDesignPanelController`
- `src/js/edit-actions-controller.js:313` — `resetEditActionsController`
- `src/js/param-detail-controller.js:115` — `getDetailLevel`
- `src/js/preset-manager.js:256` — `resetMigrationFlag`
- `src/js/state.js:533` — `getShareableURL`
- `src/js/svg-preparer.js:153` — local `endL`
- `src/js/svg-preparer.js:176` — local `startR`
- `src/js/tutorial-sandbox.js:3626` — `isTutorialActive`
- `src/js/tutorial-sandbox.js:3637` — `getCurrentTutorialId`
- `src/js/ui-generator.js:205` — local `index`
- `src/js/ui-mode-controller.js:808` — `resetUIModeController`

### 7.2 Format — `pixi run format:check`

Result: **All matched files use Prettier code style.** No deltas.

### 7.3 Bloat scan — `pixi run bloat-scan`

Result: **0 blocking, 0 warning, 0 info** across 85 files scanned. No AI bloat patterns detected.

### 7.4 Import check — `pixi run import-check`

Result: **76 files checked, 0 unresolved imports.**

### 7.5 CSS variable audit — `pixi run css-variable-audit`

Result:

- 49 tokens in `semantic-tokens.css`.
- 46 tokens in the `variant.css` mono block.
- 3 tokens marked intentionally exempt.
- All non-exempt tokens are overridden in the mono block — passes.

### 7.6 Bundle budget — `pixi run check-bundle`

Run against the existing `dist/` (last built before this audit; **not** rebuilt as part of this baseline).

- Core App (no Monaco) — 390.50 KB gzipped (78.1 % of 500 KB budget). PASS.
  - Single asset: `index-6UttQ-Bv.js` — 1.29 MB raw, 390.50 KB gzipped.
- Main CSS — 48.59 KB gzipped (32.4 % of 150 KB budget). PASS.
  - Single asset: `index-CV3TZ-lU.css` — 354.53 KB raw, 48.59 KB gzipped.
- Total assets — 736.03 KB gzipped (71.9 % of 1 MB budget). PASS.
- Other notable bundle outputs in `dist/assets/` (raw bytes):
  - `three-Br9bUlDj.js` — 507,340.
  - `ajv-D7wvsuEj.js` — 117,366.
  - `jszip.min-CFs_62bo.js` — 97,190.
  - `openscad-worker-Du2dax-p.js` — 34,511.
  - `_hfm-B2O9coiT.js` — 10,356.
  - Source-map files (`.js.map`) for the same assets exist in `dist/assets/` and dominate disk size (e.g., `index-6UttQ-Bv.js.map` is 5,528,372 bytes); they are not shipped to clients via the budget metric.

### 7.7 HTML / CSS / SVG validation — `pixi run validate:html`

Run via `vnu-jar 26.2.20` against `index.html`. Result: **13 errors, 1 warning, 67 info notices.**

The 67 info notices are all the same class of message: "Trailing slash on void elements has no effect …" (a stylistic info, not an error). The 1 warning is XML-1.0 mappability ("two consecutive hyphens in a comment"). The **13 errors** are listed verbatim by location below; Phases 4 and 6 categorize them.

- `index.html:954` — `webkitdirectory` not allowed on `<input>` at this point.
- `index.html:1769` — `aria-valuemin` must not be used on an element which has a `min` attribute.
- `index.html:1769` — `aria-valuemax` must not be used on an element which has a `max` attribute.
- `index.html:2429` — value of `for` attribute on `<label>` must be the ID of a non-hidden form control.
- `index.html:2561` — `aria-labelledby` not allowed on `<div>` without an explicit non-generic role.
- `index.html:2570` — `aria-label` not allowed on `<div>` without an explicit non-generic role.
- `index.html:2678` — `aria-label` not allowed on `<span>` without an explicit non-generic role.
- `index.html:2829` — `aria-label` not allowed on `<div>` without an explicit non-generic role.
- `index.html:3134` — `aria-valuemin` not allowed when `min` is present (second occurrence).
- `index.html:3134` — `aria-valuemax` not allowed when `max` is present (second occurrence).
- `index.html:3702` — `aria-label` not allowed on `<span>` without an explicit non-generic role.
- `index.html:5906` — `aria-label` not allowed on `<pre>` without an explicit non-generic role.
- `index.html:6134` — `aria-label` not allowed on `<pre>` without an explicit non-generic role.

These are recorded here as raw observations. Phase 4 maps them to WCAG 2.2 AA criteria.

### 7.8 Lighthouse accessibility — saved baseline

The previously committed [lighthouse-accessibility.json](../../../lighthouse-accessibility.json) is dated **2026-02-23** (Lighthouse 12.8.2, Chrome 143).

- `categories.accessibility.score` = **1.0** (i.e. 100).
- One audit failed (weight = 0, so it does not lower the score):
  - `label-content-name-mismatch` — `score: 0`. Failing element: `button#contrastToggle` ("HC" visible label vs `aria-label="High contrast mode: OFF. Click to enable."`). Tagged `wcag21a / wcag253 / EN-9.2.5.3 / RGAA-6.1.5`.
- Phase 4 will re-run Lighthouse against a fresh dev server and record the delta.

---

## 8. Reproduction recipe

Every number above can be re-derived from the project root by running, in order:

- `pixi run lint`
- `pixi run format:check`
- `pixi run bloat-scan`
- `pixi run import-check`
- `pixi run css-variable-audit`
- `pixi run check-bundle` (requires an existing `dist/`; see [scripts/check-bundle-budget.js](../../../scripts/check-bundle-budget.js))
- `pixi run validate:html`
- For directory sizes: `Get-ChildItem -Path <dir> -File -Recurse | Measure-Object -Property Length -Sum`.
- For LOC: `Get-Content <file> | Measure-Object -Line`.

If `pixi` is absent, the equivalent `npm run <task>` form is documented in [package.json](../../../package.json) §`scripts`.

---

## 9. Provenance flags

Per the plan's hallucination safeguards:

- All counts, file lists, and scanner outputs above are **OBSERVED** — produced by running the listed commands during this review.
- The Lighthouse score in §7.8 is **OBSERVED** from the committed JSON, but it is also **stale** (2026-02-23). Phase 4 marks it `OBSERVED-stale` and re-runs.
- The bundle numbers in §7.6 are **OBSERVED** but reflect a `dist/` built **before** this audit started; Phase 6 should rebuild before publishing any "post-refactor delta" claim.
