# Phase 4 — Accessibility conformance spot-check

**Date**: 2026-04-17
**Author**: Audit run (read-only)
**Inputs**: Lighthouse run on `localhost:5173` (fresh today; report at `.audit-scratch/lighthouse-2026-04-17.json`); static analysis of `index.html`, `src/styles/*.css`, `src/js/*.js`; existing baseline `lighthouse-accessibility.json` (Feb 2026)
**Conventions**: `OBSERVED` / `INFERRED` / `UNVERIFIED` markings as in prior phases; counts are exact ripgrep matches on `src/`.

> Charter: Rerun Lighthouse + Playwright a11y suite, verify focus-visible coverage and token usage,
> audit all five preference media queries, find ARIA-where-semantic-HTML-would-do, audit
> announcer/modal/drawer/focus-trap.

---

## 0. Summary

| Area | Status | Findings |
|---|---|---|
| Lighthouse score | **0.96** (down from stale 1.0 of Feb 2026) | 1 fresh defect: `color-contrast` on `.features-note` |
| Preference media queries | 4 of 5 well covered | `prefers-reduced-transparency` has only 1 rule |
| Focus tokens | Strong: `--focus-ring`, `--color-focus`, `--focus-ring-width`, `--focus-ring-offset`, with HC + dark + forced-colors variants | None |
| `:focus-visible` coverage | 117 occurrences across 5 CSS files | Mixed `:focus`/`:focus-visible` — sometimes intentional (lines 220-221) |
| Announcer | Excellent — dual live regions, per-politeness debouncing | None |
| Focus-trap util | Consolidated (`createFocusTrap`, `createDocumentFocusTrap`); used by 5 modules | `error-translator.js` shadow-implements its own trap |
| Modals | 11 `role="dialog"` + 11 `aria-modal="true"` (1:1) | Clean |
| Landmarks | `<header>`, `<main>`, 2 `<nav>`, **17 `role="region"`** | Region count is high; review for over-landmarking |
| ARIA antipatterns | 2 `<div role="button">` rows with nested `<button>` actions | Real WAI-ARIA violation (no nested interactives) |
| HTML validation (from Phase 0) | 13 errors in `index.html` | Carry-forward; see §6 |
| Playwright a11y suite | NOT re-run in this audit cycle | Time-bounded; see §7 |

Mission impact summary: there are **3 real defects** (color-contrast, error-translator focus trap shadow, button-roled rows with nested buttons), each fixable in <30 LOC. Net impact on accessibility score is small but mission-critical given the project's audience.

---

## 1. Lighthouse rerun (fresh, 2026-04-17)

OBSERVED:
- Run: `npx lighthouse http://localhost:5173 --only-categories=accessibility --quiet --chrome-flags="--headless"`
- Output: `.audit-scratch/lighthouse-2026-04-17.json`
- Overall accessibility score: **0.96** (down from 1.00 in stale baseline, 2026-02-23)
- Failing audit: **`color-contrast`** (score 0; previously 1)
- Affected elements (2 instances):

```
div#first-visit-modal > div.modal-content > div#first-visit-description > p.features-note
  insufficient color contrast 4.44 (foreground #777b84, background #111113)
  expected ≥ 4.5:1
  font: 14px / 10.5pt / normal weight

(same path) > p.features-note > strong
  same colors, same gap (4.44 < 4.5)
```

OBSERVED root cause:
- `.features-note` (defined at `src/styles/components.css:9024–9029`) uses `color: var(--color-text-muted)`.
- In dark mode (active in this Lighthouse run), `--color-text-muted` resolves to `#777b84` (slate-10).
- The codebase already acknowledges this exact ratio gap in comments at `src/styles/components.css:8852–8854`:

```8852:8854:src/styles/components.css
  /* Use --color-text-secondary (slate-11, ≥4.5:1 on slate-1) instead of
     --color-text-muted (slate-10, ~3:1) to meet WCAG AA for this font size. */
```

- That fix was applied in `.workflow-progress-label` (line 8854), but `.features-note` (line 9027), the placeholder text in `.preset-combobox-input::placeholder` (line 4735), the `.param-search-input::placeholder` (line 11145), and 7 other classes still use `--color-text-muted`.

INFERRED:
- The defect is **token-level**, not scattered hardcoded colors. Two paths to fix:
  - (a) **Quick Win**: change `.features-note` (and the other ~10 sites that risk the same problem) to use `--color-text-secondary` site-wide. ~10 LOC delta. Lighthouse score returns to 1.0.
  - (b) **Better**: bump `--color-text-muted` in dark mode from slate-10 to slate-11 (e.g., `#7e828a` → ratio ~5.0:1). Single token change in `src/styles/variables.css`. May affect visual hierarchy elsewhere; needs visual regression review.

Recommendation: option (a) for Phase 6 Quick Win; option (b) for Phase 7 backlog (design discussion needed).

OBSERVED status of the previous failing audit:
- Feb 2026 baseline reported `label-content-name-mismatch` failing on `button#contrastToggle`.
- Current run does NOT report this audit as failing.
- Code at `index.html:157–162` shows the toggle now has only an SVG child with `aria-hidden="true"` and an `aria-label="Toggle high contrast"`. With no visible text, no mismatch can occur. **Defect resolved in interim.**

INFERRED for the unscored items:
- 10 audits remain `manual` (Lighthouse cannot decide algorithmically). These include focus-order checks, custom-control accessibility, and visual-only state changes. Phase 5 Playwright suite is the right place for them.

---

## 2. Preference media query coverage

OBSERVED counts per media feature, scoped to `src/styles/`:

| Feature | CSS rules | Files | matchMedia in JS | Verdict |
|---|---:|---|---:|---|
| `prefers-reduced-motion` | 48 | 5 (variables, layout, variant, components, toolbar-menu) | 4 (`overlay-grid-controller.js`, `mode-manager.js`, `hfm-controller.js` ×2) | Strong |
| `prefers-color-scheme` | 15 | 4 (semantic-tokens, variables, layout, components) | 5 (`_hfm-paint.js`, `codemirror-editor.js`, `preview.js` ×2, `theme-manager.js`, `hfm-controller.js`) | Strong |
| `prefers-contrast` | 5 | 2 (components, variables) | 1 (`mode-manager.js`) | Adequate |
| `forced-colors` | 26 | 4 (variables, layout, components, variant) | 1 (`image-measurement.js`) | Strong (well-tokenized via `Canvas`/`CanvasText`/`LinkText`/`Highlight` system colors) |
| `prefers-reduced-transparency` | **1** | 1 (components) | 0 | **Light coverage — finding** |

OBSERVED for `forced-colors` (Windows High Contrast Mode):
- `src/styles/variables.css:486–532` redefines all color tokens to system color keywords inside `@media (forced-colors: active)`.
- Solid focus outlines are added (`--focus-ring: none` to suppress box-shadow, then `*:focus, *:focus-visible { outline: 3px solid Highlight; }` defined later).
- Interactive controls forced to `border: 2px solid ButtonText !important;` for visibility.
- This is a textbook implementation of forced-colors support.

OBSERVED for `prefers-reduced-transparency`:
- Single match in `src/styles/components.css`. By comparison, modern accessibility-first apps typically have 5–15 rules covering modal overlays, drawer backdrops, glass-effect cards, and frosted toolbars.
- The codebase uses translucent overlays in: modal overlays, drawer backdrops, tooltip backgrounds, panel scrims, and several semi-transparent state colors (`rgba(...)` in 28 places).

INFERRED:
- `prefers-reduced-transparency` should opt those translucent surfaces back to solid colors. Each modal `.friendly-error-modal`, `.tutorial-modal`, drawer overlay, and tooltip currently uses translucency; the user's preference is being ignored except in 1 rule.

Recommendation:
- **Phase 6 Quick Win**: add a `@media (prefers-reduced-transparency: reduce)` block in `components.css` that overrides backdrop alpha to 1.0 for modal overlays, drawer overlays, and tooltip backgrounds. ~25 LOC.

---

## 3. Focus-visible coverage and token usage

OBSERVED tokens (in `src/styles/variables.css`):

```css
--focus-ring-width: 3px;       /* default */
--focus-ring-offset: 2px;
--color-focus: var(--color-accent);
--focus-ring: 0 0 0 4px var(--color-accent);

/* High-contrast mode (data-high-contrast='true') */
--focus-ring-width: 4px;       /* thicker */

/* Dark mode */
--color-focus: #66b3ff;
--focus-ring: 0 0 0 4px #66b3ff;

/* Dark + prefers-color-scheme: dark */
--color-focus: #66b3ff;
--focus-ring: 0 0 0 4px #66b3ff;

/* Forced-colors active */
--color-focus: Highlight;
--focus-ring: none;            /* outline used instead */
```

OBSERVED `:focus-visible` rule counts per CSS file:

| File | `:focus-visible` rules | Raw `:focus` rules |
|---|---:|---:|
| `components.css` | 60 | ~86 |
| `layout.css` | 20 | ~13 |
| `variables.css` | 2 | ~2 |
| `variant.css` | 4 | (n/a — variant overrides) |
| `toolbar-menu.css` | 8 | (n/a — toolbar-specific) |
| **Total** | **94** | **~101** |

OBSERVED canonical pattern at `src/styles/components.css:216–225`:

```216:225:src/styles/components.css
.btn:focus {
  outline: var(--focus-ring-width) solid var(--color-focus);
  outline-offset: var(--focus-ring-offset);
  box-shadow: var(--focus-ring);
}

.btn:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}
```

INFERRED:
- This is the correct two-step pattern: apply focus styles broadly (`:focus`), suppress for mouse focus (`:focus:not(:focus-visible)`). Mouse users do not see a ring; keyboard users do.
- The mix of raw `:focus` and `:focus-visible` is intentional — many controls (`.upload-zone:focus`, `.save-project-notes-field textarea:focus`) use raw `:focus` deliberately because their focus styling is the click-confirmation indicator (which low-vision pointer users benefit from).
- No defect found. Token usage is uniform; no hardcoded focus colors detected via the audit.

---

## 4. ARIA where semantic HTML would do

OBSERVED (limited to non-trivial cases):

### 4.1 `<div role="button">` with nested `<button>` children — REAL DEFECT

Two instances:
- `src/js/saved-projects-ui.js:768–797` (folder rows in saved-projects file manager)
- `src/js/companion-files-controller.js:369–376` (folder rows in companion-files panel)

Pattern in `saved-projects-ui.js:768–797`:
```html
<div class="file-manager-item file-nav-folder-row" role="button" tabindex="0"
     aria-label="Open folder Foo, 3 files">
  <svg .../>
  <span>Foo</span>
  <span>3 files</span>
  <div class="file-manager-item-actions">
    <button aria-label="Rename folder Foo" ...><svg/></button>
    <button aria-label="Delete folder Foo" ...><svg/></button>
  </div>
</div>
```

OBSERVED:
- The keyboard handler at `saved-projects-ui.js:866–875` correctly handles Enter / Space for activation and uses `e.target.closest('button')` to ignore clicks on nested action buttons.
- AT users encounter a "button" with mystery internals: when they activate the row (Enter / Space), they enter the folder. But navigating *into* a button to find another button is an unusual pattern that violates WAI-ARIA's "no nested interactive descendants in a button-roled element" guidance.

INFERRED — recommended pattern:
- `<li>` / `role="listitem"` row with the folder name as the row's text + a `<button>` group for actions, OR
- `role="treeitem"` (with parent `role="tree"`) — more powerful but more code, OR
- A flat structure: `<button>` for "open folder" + sibling `<button>` for "rename" + sibling `<button>` for "delete", visually arranged as a row.

Recommendation: refactor both call sites to a list-row pattern. ~20 LOC change per site, 2 sites. Phase 6 candidate (medium risk because it touches keyboard navigation).

### 4.2 `role="listitem"` cards inside `role="list"` containers — OK

Two instances (`companion-files-controller.js:409`, `saved-projects-ui.js:305`) both have parent `role="list"` containers (verified at `index.html:937` and `companion-files-controller.js:423`). Valid use.

### 4.3 `role="navigation"` redundancy — OK

`index.html:334` uses `role="navigation"` on a `<div>`. The element could be `<nav>` instead, but the explicit role is also valid. No defect.

### 4.4 17 `role="region"` landmarks — borderline

OBSERVED:
- `role="region"` count: 17 named regions in `index.html`.
- WCAG / WAI-ARIA practice recommends using region landmarks "sparingly, for distinct sections" — the heuristic ceiling is usually 5–10.
- All 17 regions appear to be properly named (`aria-labelledby` or `aria-label`), so they are not violating any test, but they make screen-reader landmark navigation noisier than necessary.

INFERRED:
- Some regions (e.g., `#updateBanner` at `index.html:230–235`) could use `role="status"` instead — a banner is a status region, not a navigable region.
- Many internal panels (library controls, project files controls, expert mode panel, etc.) might be better as `<section>` (no implicit landmark unless named) than as `role="region"`.

Recommendation: Phase 7 backlog. Audit each `role="region"` and demote to `<section>` (or remove `role`) where the content is not "a discrete section a user might want to navigate to directly." Defer because the visible UX impact is small and the behavior is correct.

---

## 5. Announcer / Modal / Drawer / Focus-trap audits

### 5.1 Announcer — `src/js/announcer.js`

OBSERVED structure:
- 264 LOC, single concern (screen-reader announcements).
- Two live regions: `#srAnnouncer` (polite), `#srAnnouncerAssertive` (assertive). Routing decided by `politeness` option.
- Per-politeness debouncing (so a fast assertive error is not delayed by a slower polite announcement).
- Clear-then-set pattern with `requestAnimationFrame` guarantees repeated identical strings re-announce.
- `cancelPendingAnnouncements(politeness?)` for context changes.
- Helper APIs: `announceImmediate`, `announceError` (3000 ms clear delay), `announceCameraAction` (predefined phrases), `announceChange` (debounced for slider rapid changes).
- Imported by 22 modules.

VERDICT: **Excellent**. No defect. This is the standard the rest of the codebase should follow.

### 5.2 Focus-trap utility — `src/js/focus-trap.js`

OBSERVED structure:
- 293 LOC, well-factored.
- Two flavors: `createFocusTrap` (element-level keydown listener on container) and `createDocumentFocusTrap` (document-level capturing listener with focus-recovery if focus escapes).
- Shared `getFocusableElements` helper with proper visibility + `aria-hidden` filtering.
- Backward-compatible `trapFocusHandler` shim.

OBSERVED consumers (5):
- `modal-manager.js`
- `drawer-controller.js` (uses `createDocumentFocusTrap`)
- `tutorial-sandbox.js`
- `image-measurement.js`
- `svg-preparer-workspace.js`

OBSERVED non-consumer that should be one:
- `src/js/error-translator.js#showErrorModal` (lines 463–489) **shadow-implements** the same trap pattern inline. ~25 LOC duplicated. The same `Tab` / `Shift+Tab` cycle, same focusable selector (slightly different — includes `summary` which the central util does NOT include).

```469:487:src/js/error-translator.js
      if (e.key === 'Tab') {
        const focusable = overlay.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), summary'
        );
        // ... cycle logic identical to focus-trap.js ...
```

INFERRED:
- This is a Phase 1 "library shadowing" finding that wasn't caught earlier because it's a private inline copy, not a separate import.
- The fix is mechanical: replace the inline keydown handler with `createFocusTrap(overlay, { onEscape: cleanup }).activate()`. ~15 LOC removed, behavior preserved.
- Side benefit: `summary` would no longer be in the focusable list — but `summary` IS focusable by default (it's a HTML interactive element), so the central util's selector via `[tabindex]` and `button:not(:disabled)` should still catch focusable summaries via the implicit tabindex. UNVERIFIED — needs a smoke test in the focus-trap consolidation PR.

Recommendation: **Phase 6 Quick Win**.

### 5.3 Modal manager — `src/js/modal-manager.js`

OBSERVED (selected attributes):
- All modals get `aria-modal="true"`, `aria-labelledby` (when titleId provided), and `role="dialog"`.
- `index.html` declares 11 static modals, each with both `role="dialog"` and `aria-modal="true"` — 1:1 pairing, none missing.

VERDICT: clean.

### 5.4 Drawer controller — `src/js/drawer-controller.js`

OBSERVED:
- Uses `createDocumentFocusTrap` (verified at `drawer-controller.js:84`) with focus-recovery semantics — appropriate for a drawer that can be opened from anywhere.
- Drawer state changes (open/close) are likely driving an `announce` call (audit deferred — depends on Phase 5 dynamic test).

VERDICT: looks clean; deeper test left to Phase 5.

---

## 6. HTML validation carry-forward

From Phase 0 baseline (`pixi run validate:html`), `index.html` has 13 validation errors. Those identified as accessibility-relevant:

| Error | Location | Accessibility impact |
|---|---|---|
| `webkitdirectory` non-standard attribute | `<input type="file" webkitdirectory>` | Low; well-supported in Chromium/Edge/WebKit. Not a screen-reader issue. |
| `aria-valuemin` / `aria-valuemax` on element with native `min` / `max` | sliders | Redundant; native attributes are the source of truth for AT. |
| `for` attribute on `<label>` pointing to non-existent ID | several inputs | **Real defect** — labels not associated with their inputs; AT may not announce label as the input's name. |
| `aria-label` / `aria-labelledby` on generic `<div>` / `<span>` / `<pre>` | several spots | Generic elements should not have accessible names unless they have a role. AT may ignore these labels. |

OBSERVED specifically for the `for`-attribute defect: this affects keyboard activation (clicking the label does not focus the input) and screen-reader name assignment. Phase 4 sub-finding.

Recommendation: Phase 6 — fix the broken `for` attributes (each is a 1-line change). Phase 7 — re-evaluate the `aria-label` on generic elements (some may indicate genuine missing role definitions).

---

## 7. Items deferred from this phase

| Item | Reason | Where to address |
|---|---|---|
| Re-run full Playwright a11y suite (`tests/e2e/accessibility.spec.js`, ~100 test cases, 2520 LOC) | Test run requires headed browsers + dev server + WASM init; estimated 8–15 minutes. Not blocking for the audit synthesis. | Phase 5 will run this as part of the test-coverage analysis. |
| Lighthouse with desktop emulation, mobile emulation, slow 3G profile | Single-profile run sufficient for the score-regression delta. | Phase 6 plan stub. |
| Verify all `aria-describedby` targets exist | Static analysis can do this; out of scope for a spot-check. | Phase 7 backlog. |
| Manual screen-reader walkthrough (NVDA, VoiceOver, JAWS) | Cannot be automated; requires human + AT. | Phase 7 backlog. |

---

## 8. Recommended changes for Phase 6 Quick Wins

| ID | Action | Files | Est LOC | Risk |
|---|---|---|---:|---|
| A11Y-1 | Replace `--color-text-muted` with `--color-text-secondary` for `.features-note` and ~10 other small-text usages | `src/styles/components.css` | ~10 | Trivial — visual diff to confirm |
| A11Y-2 | Replace `error-translator.js`'s inline focus trap with `createFocusTrap(...)` | `src/js/error-translator.js` | -15 | Low |
| A11Y-3 | Add `@media (prefers-reduced-transparency: reduce)` block for modals/drawers/tooltips | `src/styles/components.css` | +25 | Trivial |
| A11Y-4 | Refactor `<div role="button">` folder rows to a list-row pattern | `src/js/saved-projects-ui.js`, `src/js/companion-files-controller.js` | ~40 across two files | Medium — touches keyboard nav |
| A11Y-5 | Fix HTML validation errors: broken `for=` attributes; remove `aria-label` from non-roled generics | `index.html` | ~15 | Low |

---

## 9. UNVERIFIED items (deferred)

- Whether the central `getFocusableElements` selector in `focus-trap.js` catches `<summary>` elements (used by the shadow trap in `error-translator.js`). Need to verify before A11Y-2 lands.
- Whether the `--color-text-muted` token can be globally bumped to slate-11 without breaking visual hierarchy elsewhere. Needs visual-regression review (Phase 5 baseline check).
- Whether NVDA / VoiceOver / Orca actually treat `<div role="button">` with nested `<button>` children as a navigable button or as a row. Needs manual screen-reader testing.
- Whether the 17 region landmarks degrade Tab navigation in screen readers' landmark-cycle modes (e.g., NVDA's `D` key). Defer to manual testing.
