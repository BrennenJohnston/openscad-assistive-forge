# Phase 7 — Additional recommended changes (mission-aligned)

**Audit date**: 2026-04-17
**Status**: Read-only — no source modifications.
**Scope**: Items the project's accessibility-first mission would benefit from, **not** already covered by [Phase 6 refactor recommendations](./06-refactor-recommendations.md). Organized by criticality so the team can decide what (if anything) to act on.

The plan classifies this phase's outputs into three buckets:
- **Mission-critical** — changes the project's stated mission demands; the audit recommends acting on these soon, even though they fall outside the Phase 6 refactor backlog.
- **Worth considering** — improvements that align with the mission and would deliver clear value, but the team can defer based on capacity.
- **Log-for-later** — Option C territory the charter explicitly defers (WASM upstream contributions, SBOM, PWA, perf budgets, mobile). Captured here for future audit cycles, not for this one's action list.

Provenance flags `OBSERVED` / `INFERRED` / `UNVERIFIED` as in prior phases.

---

## 0. Headline summary

| # | Item | Bucket | Mission impact |
| --- | --- | --- | --- |
| 1 | **Keyboard shortcuts are not advertised to assistive technology** (`aria-keyshortcuts` count = 0 across the entire codebase) | **Mission-critical** | High — the app ships F4-F12, Ctrl+E, etc.; a screen-reader user has no way to discover them from the UI |
| 2 | **`docs/source-code-foundation-assessment.md` contains 4 inaccuracies** about how the WASM bridge actually works | **Mission-critical** | High — design decisions downstream of the doc are made on false premises |
| 3 | **No human screen-reader walkthrough has been performed in this audit cycle** | **Mission-critical** | High — the project's audience deserves human verification, not just axe-core / Lighthouse |
| 4 | **Service-worker hardcodes `Version: 4.3.0` in a JSDoc comment** while `package.json` is `4.4.0` | Worth considering | Low (the runtime `CACHE_VERSION` is templated correctly; only the comment drifts) |
| 5 | **Cross-browser parity (Firefox, WebKit/Safari) is configured but `webkit-logs.txt` is the only artifact** | Worth considering | Medium — WebKit accessibility differs subtly from Chromium |
| 6 | **Voice-control compatibility (Dragon NaturallySpeaking, Apple Voice Control) was not exercised** | Worth considering | Medium — a known motor-accessibility surface |
| 7 | **17 `role="region"` landmarks** in `index.html` (the count cited in Phase 4 §4.4) overload AT landmark navigation | Worth considering (= [Phase 6 DD6](./06-refactor-recommendations.md#6-defer-design-require-api-or-product-decisions)) | Low — covered by deferred-design item |
| 8 | **`csp-reporter.js` is wired but never produces a report** (3 unused exports) | Worth considering | Low (Q1 deletes the unused exports; this captures the broader question of CSP enforcement strategy) |
| 9 | **Print stylesheet is minimal** (1 `@media print` block in `components.css`) | Worth considering | Low — but `@print` is part of universal access |
| 10 | **`prefersReducedData()` is implemented but only consulted from one site** | Worth considering | Medium — assistive users on metered/limited connections benefit from honoring the signal app-wide |
| 11 | **OpenSCAD WASM upstream contributions** (UP-1..UP-8 from [03-wasm-bridge-fitness.md §3](./03-wasm-bridge-fitness.md#3-consider-upstreaming-candidates)) | **Log-for-later** (Option C) | High when shipped, but not in scope for this audit |
| 12 | **SBOM is 30 days stale**; no automated regeneration cadence | **Log-for-later** | Low |
| 13 | **PWA offline-degradation behavior is not tested in the suite** | **Log-for-later** | Medium for users in low-connectivity environments |
| 14 | **Runtime perf budgets** (LCP, INP, CLS during a render) are not measured by CI | **Log-for-later** | Medium |
| 15 | **Mobile-specific accessibility audit** (touch targets at small viewports, gesture alternatives) | **Log-for-later** | Medium |

---

## 1. Mission-critical

### 1.1 Advertise keyboard shortcuts via `aria-keyshortcuts`

**OBSERVED**:
- `Grep "aria-keyshortcuts" .` over the entire repo: **0 hits**.
- `src/js/keyboard-config.js` (1130 LOC) defines a rich shortcut catalog including:
  - `render` → `F6`
  - `preview` → `F5`
  - `reloadAndPreview` → `F4`
  - `cancelRender` → `Escape`
  - `download` → `F7`
  - `exportParams` → `Ctrl+Shift+E`
  - `toggleExpertMode` → `Ctrl+E`
  - `focusMode` → `f`
  - …(continues; full list in `DEFAULT_SHORTCUTS` starting at `src/js/keyboard-config.js:18`)
- The buttons that trigger these actions (e.g., the "Render" button, "Download STL" button) do NOT carry the `aria-keyshortcuts` attribute that would announce the shortcut to screen-reader users.

**Mission impact**:
- WCAG 4.1.2 (Name, Role, Value) at AA + WAI-ARIA 1.2 §6.6.2 explicitly recommend `aria-keyshortcuts` for any UI control that can be activated by a key chord.
- Project audience: keyboard-first users, low-vision users using AT, and motor-disability users who use sticky-keys/onscreen-keyboards. All three benefit directly from shortcut announcements.
- Today, a NVDA user navigating to the "Render" button hears "Render, button" and must consult external documentation to learn that F6 also triggers it.

**Recommendation**:
- Add `aria-keyshortcuts="F6"` (etc.) to each button the keyboard catalog routes to.
- Auto-generate the attribute from `DEFAULT_SHORTCUTS` so the catalog stays the single source of truth.
- Estimated work: ~30-50 LOC in a new `src/js/keyboard-shortcuts-binder.js` that, on init, walks each `[data-action]` element and applies `aria-keyshortcuts` from the active config. Catalog-driven, so user customizations propagate automatically.

**Verification**:
- After the change, an NVDA user navigating to the Render button hears "Render, button, F 6."
- Lighthouse / axe-core do not currently flag missing `aria-keyshortcuts` (the spec calls it "recommended," not "required") — manual NVDA verification is the test.

### 1.2 Correct doc inaccuracies in `docs/source-code-foundation-assessment.md`

**OBSERVED** (consolidated from [Phase 3 §4](./03-wasm-bridge-fitness.md#4-doc-inaccuracies-to-correct)):

| Doc location | Current text | Reality |
| --- | --- | --- |
| §2.1 row "CSG Tree / Products" | "Not implemented (menu item disabled)" | Export to `.csg` works today via the standard download path (`src/js/download.js:53-60`, `src/worker/openscad-worker.js:1242`). Only inline display is missing. |
| §2.1 row "Memory usage" | "Estimated from JS heap; no WASM heap visibility" | The code DOES read the WASM heap (`openscadModule.HEAP8.length`). The defect is that the allocated buffer ≠ used memory, and the worker's own comments at `src/worker/openscad-worker.js:2118-2123` admit it. |
| §2.1 row "Check Validity" | "Geometry heuristic: count vertices/triangles via Three.js mesh" | True, but the "non-manifold" check at `src/js/design-panel-controller.js:136-138` is unreachable in practice (it requires `!geo.index`, which never happens for STL outputs). |
| §2.1 row "Display AST" | (no text suggesting the label is misleading) | The user-facing label and announcement use the word "AST" but show a parameter dictionary. |

**Mission impact**:
- The `source-code-foundation-assessment.md` doc is the project's reference for "what works, what's simulated, what's deferred." Future contributors and reviewers (including the Phase 6 refactor execution team) will make decisions based on it.
- Inaccuracies here cascade: a new contributor sees "Memory usage: estimated from JS heap" and writes a fix targeting the wrong place.

**Recommendation**:
- Apply 4 doc edits as part of the same PR that ships the BR-1..BR-5 Quick Wins (so the doc and code change in lockstep).
- Estimated work: ~30 LOC of markdown.

### 1.3 Schedule a manual screen-reader walkthrough

**OBSERVED** (from Phase 4 §7 + §9 deferrals):
- The audit ran Lighthouse and analyzed the codebase statically.
- The Playwright a11y suite (`tests/e2e/accessibility.spec.js`, ~100 cases, 2520 LOC) was NOT re-run in this audit cycle (deferred to Phase 5 capacity, then deferred again).
- No NVDA / VoiceOver / JAWS / Orca walkthrough is recorded for the 2026-04-17 audit cycle.

**Mission impact**:
- Lighthouse and axe-core combined catch ~30-40 % of real accessibility defects (a well-documented industry baseline). The remaining 60-70 % require human + AT verification.
- For an accessibility-first project, the absence of regular manual walkthroughs is the single biggest blind spot.

**Recommendation**:
- Establish a quarterly "AT walkthrough" cadence covering at minimum:
  - NVDA + Firefox on Windows (largest free desktop AT pairing)
  - VoiceOver + Safari on macOS (largest macOS AT pairing)
  - VoiceOver + Safari on iOS (mobile pairing)
  - TalkBack + Chrome on Android (Android pairing)
- Each walkthrough exercises the "core 5" journeys: first-visit, file upload, parameter change + preview, render + download, save project + reload.
- Document each session in `docs/vpat/evidence/m{milestone}/` (the directory already exists with templates from m0 + m1 — see `docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md`).
- Effort: ~4-6 hours per platform per quarter; the template makes documentation mechanical.

---

## 2. Worth considering

### 2.1 Service-worker version comment drift

**OBSERVED**:
- `public/sw.js:4` has the comment `* Version: 4.3.0`.
- `package.json:3` reports the project version as `4.4.0`.
- The runtime `CACHE_VERSION` constant uses the build-time token `__SW_CACHE_VERSION__` (replaced by `vite.config.js:4`) — so the actual cache key is correct.
- Only the human-facing comment is stale.

**Mission impact**:
- Trivial — but the project ships a service worker that is the runtime contract for offline behavior. Stale version comments here can mislead developers debugging cache issues.

**Recommendation**:
- Either replace the JSDoc comment with the same `__APP_VERSION__` token (already used elsewhere per `vite.config.js:5`), or drop the version comment entirely (the `CACHE_VERSION` constant is the source of truth).
- ~1 LOC.

### 2.2 Cross-browser parity not actively tested

**OBSERVED**:
- `playwright.config.js` defines projects for `chromium` (default), `firefox`, and `webkit`.
- The repository root contains an untracked `webkit-logs.txt` — the only artifact from a prior WebKit run.
- No CI evidence that Firefox or WebKit specs run on every commit.
- WebKit is gated behind macOS runners (per `playwright.config.js:71-79`).

**Mission impact**:
- WebKit / Safari accessibility differs from Chromium in several subtle ways (live region announcement timing, focus-visible heuristics, `inert` attribute support). An accessibility-first project should validate parity.
- Firefox uses NV Access's accessibility tree differently from Chromium; some `aria-*` interpretations diverge.

**Recommendation**:
- Audit the GitHub Actions workflow (`.github/workflows/test.yml`) to confirm whether Firefox + WebKit specs run. If not, add a job (Linux Firefox + macOS WebKit) — even if only on `main` branch / nightly.
- Capture per-browser snapshots in `tests/visual/baselines/{platform}/` (also addresses the Phase 5 T-04 finding).
- Effort: 1-2 days for CI plumbing + baseline generation.

### 2.3 Voice-control compatibility (Dragon, Apple Voice Control)

**OBSERVED**:
- The project lists "Voice Input Users" as a target audience (`index.html:775`).
- Voice control software (Dragon NaturallySpeaking, Apple Voice Control, Windows Speech Recognition, talon) typically activates UI controls by speaking their visible label.
- Today's app: many buttons have `aria-label` for SR users but the visible text is an icon (SVG). Voice-control software cannot speak "click rotate camera" if the only visible text is the rotation glyph — the user must say "click 1" / "click 2" / etc., which requires labels-on-grid overlays in the voice-control app.

**Mission impact**:
- Real but bounded: voice-control users rely heavily on visible labels; the project's icon-heavy toolbars are a known friction point.

**Recommendation**:
- Add visible (or visible-on-focus) text labels to icon-only buttons for voice-control affordance. The "labels-on-icon-buttons" pattern is widely documented.
- Alternative: add a "Voice mode" toggle in preferences that shows visible text on every interactive control.
- Effort: ~50-100 LOC in `components.css`; opt-in toggle handled by `mode-manager.js`.

### 2.4 17 `role="region"` landmarks audit

**OBSERVED** (from [Phase 4 §4.4](./04-accessibility-conformance.md#44-17-roleregion-landmarks--borderline)):
- 14 literal `role="region"` matches plus 3 dynamically-added ones via JS = 17 region landmarks.
- WAI-ARIA practice recommends ≤5-10 named regions for a page.
- All regions are properly named (`aria-labelledby` or `aria-label`), so they don't *fail* — but they do clutter NVDA's `D` (jump-by-landmark) and JAWS's `R` (jump-by-region) navigation.

**Mission impact**:
- For a Tier-1 user (audit cycle's primary audience): every extra landmark adds keystrokes to navigate to the one they want.
- For a Tier-2 user (skim-readers): clutters the document outline.

**Recommendation**:
- Already in [Phase 6 DD6](./06-refactor-recommendations.md#6-defer-design-require-api-or-product-decisions). Captured here for cross-reference.

### 2.5 `csp-reporter.js` strategy

**OBSERVED**:
- `src/main.js:114` imports `initCSPReporter` from `csp-reporter.js`.
- `csp-reporter.js` exports `getViolations`, `clearViolations`, `hasViolations` — none are called anywhere (Phase 1 §4.1 dead code list).
- The reporter listens for `securitypolicyviolation` events but has no consumer for the data it collects.

**Mission impact**:
- CSP is a security primitive, not strictly an accessibility one — but a CSP violation on a font load (e.g., `font-src` blocking the OpenSCAD font fallback) silently degrades text rendering, which is an accessibility concern.

**Recommendation**:
- Decide one: (a) remove `csp-reporter.js` entirely (Quick Win Q1 already removes the 3 unused exports; this would remove the rest), OR (b) wire the reporter's output to a logging endpoint or to the in-app `console-panel.js` for developer visibility.
- Either choice removes the "dormant capability" smell.

### 2.6 Print stylesheet coverage

**OBSERVED**:
- `src/styles/components.css` has exactly 1 `@media print` block (line 11031), scoped to `tutorial-overlay`/`tutorial-backdrop` — i.e., it hides the tutorial overlay when printing.
- No other `@media print` rules exist.

**Mission impact**:
- Some users print SCAD parameter listings or saved-projects lists for offline reference. Today's print output is the unmodified screen layout, including drawers, nav rails, and dark-mode backgrounds (which waste ink).
- Cognitive accessibility: a printed list of design parameters supports memory and review for users with cognitive disabilities.

**Recommendation**:
- Add a print-mode block that:
  - Hides the toolbar, drawers, and modals (`display: none !important`)
  - Forces white background + black text (overrides theme tokens)
  - Renders the active parameter list as a printable table
- Effort: ~50 LOC in `components.css`.

### 2.7 `prefersReducedData()` is implemented but underused

**OBSERVED**:
- `src/js/storage-manager.js:305-312` defines `prefersReducedData()` (reads `navigator.connection.saveData`).
- `Grep "prefersReducedData" src/`: only 1 hit (the same file at line 378, used internally by `shouldDeferLargeDownloads`).
- The function is not consulted by:
  - `library-manager.js` (~85 KB OpenSCAD libraries downloaded eagerly)
  - `image-import.js` (raster→SVG vectorization is CPU-heavy and bandwidth-heavy)
  - `manifest-loader.js` (downloads asset manifests up front)
- The PWA `public/sw.js` cache strategies don't differentiate by save-data mode.

**Mission impact**:
- Users on metered connections (rural broadband, mobile-only households, developing-country contexts) can find the app's data usage prohibitive — and these populations overlap heavily with assistive-tech users.

**Recommendation**:
- Add a feature-flagged "Lite mode" controlled by `prefersReducedData()` that:
  - Defers OpenSCAD library downloads to first use
  - Skips eager font preloading
  - Lowers the default render quality tier
- Effort: ~50-100 LOC across `library-manager.js`, `manifest-loader.js`, `quality-tiers.js`. Opt-in toggle in preferences for users who don't have `Save-Data` set.

---

## 3. Log-for-later (Option C — explicitly out of scope per charter)

These items are recorded for future audit cycles. The charter ([plan §non-goals](../../../.cursor/plans/professional_code_review_plan_68eb907c.plan.md)) explicitly defers all of them.

### 3.1 OpenSCAD WASM upstream contributions

The 8 candidates from [Phase 3 §3](./03-wasm-bridge-fitness.md#3-consider-upstreaming-candidates), bundled into Phase A / Phase B / Phase C of an upstream PR effort:

**Phase A — highest impact-to-effort ratio** (already proposed in `source-code-foundation-assessment.md` §7):
- UP-1: Real progress callback (Emscripten hook from CGAL/Manifold)
- UP-2: Structured AST export (`--export-format=ast-json`)

**Phase B — additional bridges this audit identified**:
- UP-3: Real CGAL manifold check exposed via `Module` export
- UP-4: Geometry stats (volume, surface area, bbox) from CGAL
- UP-5: Real WASM memory accounting (`getMemoryUsageBytes()` binding)
- UP-6: Structured error objects (`--error-format=json`)

**Phase C — operational improvements**:
- UP-7: Native `OPENSCADPATH` / `-I` library include flag
- UP-8: `roof()` / `projection()` CGAL crash fix

**Why log-for-later**: each requires C++ work, an OpenSCAD-side review cycle, and a release waiting period. Approach as a multi-quarter parallel track to the in-app refactor work.

### 3.2 SBOM regeneration cadence

**OBSERVED**:
- `sbom.json` is **826,393 bytes**, last modified **2026-03-18** (~30 days stale).
- No `pixi run sbom:regenerate` task observed in `package.json`.
- No CI evidence of SBOM regeneration on dependency changes.

**Why log-for-later**: SBOM hygiene is a security/supply-chain concern explicitly deferred from this audit. Recommended for a follow-up audit cycle:
- Add a CI job that regenerates SBOM on every `package.json` change.
- Consider integrating SBOM diffing into PR checks.

### 3.3 PWA offline-degradation testing

**OBSERVED**:
- `public/sw.js` defines 7 cache strategies (app shell, static, fonts, examples, WASM, libraries, images) — comprehensive.
- `public/manifest.json` declares the app as `display: standalone` with appropriate icons + shortcuts.
- No test in `tests/` exercises the app under simulated offline conditions.

**Why log-for-later**: PWA is explicitly a deferred topic. For a future cycle:
- Add a Playwright spec that loads the app once, then simulates offline (`page.context().setOffline(true)`), reloads, and verifies the app shell still functions.
- Verify graceful degradation when WASM cache is missing offline.

### 3.4 Runtime performance budgets

**OBSERVED**:
- [Phase 0 §7.6](./00-baseline.md#76-bundle-budget--pixi-run-check-bundle) reports bundle size budgets (390.50 KB / 500 KB gzipped, PASS).
- No runtime budget exists for LCP (Largest Contentful Paint), INP (Interaction to Next Paint), CLS (Cumulative Layout Shift), or Time-To-First-Render.
- Lighthouse run produced an accessibility score; the performance category was not requested.

**Why log-for-later**: Perf budgets are explicitly deferred. For a future cycle:
- Add a Lighthouse-based performance budget check to CI.
- Define targets specific to assistive-tech use cases (e.g., "First parameter render completes in <2 s on a mid-tier 2020 laptop with NVDA running").

### 3.5 Mobile-specific accessibility audit

**OBSERVED**:
- 25 `min-width: 44/48px` or `min-height: 44/48px` rules across `components.css` + `layout.css` — touch targets are well above WCAG 2.5.8 minimum (24px).
- No mobile-specific Lighthouse run; the 2026-04-17 audit used desktop emulation only.
- Visual baselines include `disclosures-mobile-320.png`, `mobile-layout.png`, `drawer-headers-mobile-480.png` — so mobile layouts are tested for visual regression but not for AT.
- TalkBack (Android) and VoiceOver-on-iOS walkthroughs not recorded.

**Why log-for-later**: Mobile accessibility is explicitly deferred. For a future cycle:
- Run Lighthouse with mobile emulation (`--form-factor=mobile`).
- Add the iOS VoiceOver + Android TalkBack pairings to the manual walkthrough cadence (recommendation 1.3).
- Audit the gesture vocabulary used by the touch interface (drag-and-drop, pinch-zoom in preview) for keyboard alternatives.

---

## 4. Cross-references to prior phases

These items were identified in earlier phases but warrant reiteration as "additional changes to consider beyond the refactor backlog":

| Source | Item | Phase 7 bucket |
| --- | --- | --- |
| [01 §3.4](./01-architecture-redundancy.md#34-srcjsanimation-controllerjs--orphaned-but-has-a-pinned-reason) | Decide fate of `animation-controller.js` (481 LOC orphan) | (= [Phase 6 DD1](./06-refactor-recommendations.md#6-defer-design-require-api-or-product-decisions)); cross-referenced |
| [01 §2.4](./01-architecture-redundancy.md#24-in-house-code-that-may-be-solvable-by-a-library-we-already-ship) | Investigate `path-bool` ↔ `clipper2-js` overlap | (= [Phase 6 L1](./06-refactor-recommendations.md#4-library-shadow-removal)); cross-referenced |
| [02 §13](./02-complexity-hotspots.md#13-indexhtml--6372-lines--single-page-app-shell) | `index.html` modal-extraction decision | (= [Phase 6 DD4](./06-refactor-recommendations.md#6-defer-design-require-api-or-product-decisions)); cross-referenced |
| [05 §5](./05-tests-and-safety-net.md#5-visual-regression-baseline-drift) | Cross-platform visual baselines | (= [Phase 6 T-04](./06-refactor-recommendations.md#211-t-01t-05--test-hygiene-quick-fixes)); cross-referenced |
| [04 §1](./04-accessibility-conformance.md#1-lighthouse-rerun-fresh-2026-04-17) | Bump `--color-text-muted` globally to slate-11 | (= [Phase 6 DD5](./06-refactor-recommendations.md#6-defer-design-require-api-or-product-decisions)); cross-referenced |
| [04 §9](./04-accessibility-conformance.md#9-unverified-items-deferred) | NVDA/VoiceOver/JAWS manual walkthrough | Mission-critical (= §1.3 above) |

---

## 5. Items the audit verified are **already healthy**

Not gaps — but worth recording so future audits don't re-investigate:

- **Skip-link**: present at `index.html:57` (`<a href="#main-content" class="skip-link">Skip to main content</a>`). **OBSERVED**.
- **PWA manifest**: complete (`public/manifest.json` defines name, icons at 128/192/512px, maskable icon, shortcuts, categories, theme/background colors). **OBSERVED**.
- **Service worker cache strategy**: comprehensive 7-tier strategy in `public/sw.js`. **OBSERVED**.
- **`prefers-reduced-data`** detection: `prefersReducedData()` defined in `storage-manager.js:305-312`. (Underused — see §2.7 above.) **OBSERVED**.
- **Touch targets**: 25 rules with `min-width/height: 44px` or `48px`. **OBSERVED**.
- **Heading hierarchy**: 37 heading elements with consistent H1 → H2 → H3 cascade. **OBSERVED**.
- **VPAT documentation**: 8 markdown files under `docs/vpat/` including milestone evidence templates. **OBSERVED**.
- **WCAG token system**: `--focus-ring`, `--color-focus`, `--color-text-secondary` tokens with HC + dark + forced-colors variants. (Phase 4 confirmed.) **OBSERVED**.

These pieces are in place; the recommendations above are about strengthening what's already a strong foundation.

---

## 6. Provenance flags

- All counts and file paths cited above are **OBSERVED** from direct ripgrep / Glob / Read passes during this audit cycle.
- Mission-impact characterizations are **INFERRED** from the project's stated audience and from WCAG / WAI-ARIA reference material; reviewers may apply their own weighting.
- Bucket assignments (Mission-critical / Worth considering / Log-for-later) are this audit's recommendation; the team retains discretion to re-prioritize.
- Effort estimates are **INFERRED** from current LOC counts; the executor should re-measure before starting any item.

---

## 7. Closing note for the audit cycle

This phase concludes the 2026-04-17 read-only audit. The artifacts produced:

```
docs/audit/2026-04-17/
├── 00-baseline.md
├── 01-architecture-redundancy.md
├── 02-complexity-hotspots.md
├── 03-wasm-bridge-fitness.md
├── 04-accessibility-conformance.md
├── 05-tests-and-safety-net.md
├── 06-refactor-recommendations.md
└── 07-additional-recommended-changes.md  ← this file
```

No source files were modified. Every recommendation cites observed evidence with file:line references. The audit is reproducible from the recipes documented in each phase report and from the helper scripts under `.audit-scratch/`.

The team's next decision: **which Quick Wins from [Phase 6 §2](./06-refactor-recommendations.md#2-quick-wins--one-page-micro-plans) to schedule for the next sprint, and whether to commit to the cadences proposed in §1.3 (manual screen-reader walkthroughs) and §3.x (SBOM, perf, PWA, mobile)**.
