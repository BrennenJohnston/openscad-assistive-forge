# Braille Toolset Screen Reader Accessibility Review

**Product**: OpenSCAD Assistive Forge — Braille Card / Braille Charm / Braille Sign  
**Audit Date**: 2026-07-11  
**Target Standard**: WCAG 2.2 Level AA  
**Auditor**: Code review + axe-core E2E coverage (all three panel modes)

---

## Scope

The braille translation panel (`src/js/braille-panel.js`) in all three manifest-driven modes — card (`braille-wedge-card`), charm (`braille-charm`), sign (`braille-sign`) — plus the welcome-screen variant selector and the new warning/notice/pager UI introduced with the braille tools expansion.

## Summary

The expansion was built against the review checklist below; two issues found during the review were fixed in place. Axe-core scans (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`) now cover the panel in all three modes and in the warning, error, and multi-card notice states (`tests/e2e/braille-card.spec.js`).

## Checklist and findings

### Labels and descriptions — Supports

- Every control is a native input with a programmatic label: the text input, table select, caps toggle, card-size preset, margin preset + number (visible + `sr-only` label), auto-wrap, split, max-rows, render-all toggle, pager buttons.
- Help text is attached via `aria-describedby` (`brailleTextHelp`, `brailleTableHelp`, `brailleCapsHelp`, `brailleSizeHelp`, `brailleRenderAllHelp`).
- The panel is a `section` labelled by its `h3` heading; heading levels (h3 → h4 preview) fit the page outline.
- The welcome-screen variant `select` has a visible `label` ("Tool") mirroring the charm selector pattern.

### Live-region behaviour — Supports

- Braille preview: `aria-live="polite"` group — re-reads after the debounce, never interrupts typing.
- **Fit errors** (line/rows overflow, undividable word, truncation, charm cell budget): `role="alert"` container, announced immediately.
- **Informational warnings** (caps dropped, untranslatable characters, oversized-for-bed): moved from the former shared `role="alert"` box to `role="status"` so screen readers are not needlessly interrupted.
- Multi-card notice: `role="status"`; card-count changes additionally announced through `stateManager.announceChange()`.
- Pager status ("Card 1 of 2"): `aria-live="polite"`.

### Not color alone — Supports

- Every message carries a text prefix (**Error:** / **Warning:**) and an `aria-hidden` SVG icon (octagon / triangle / info circle) in addition to the tier colors.
- Tier colors use the existing semantic tokens (`--color-error-text` on `--color-error-bg`, amber equivalents) — Radix step-12-on-step-3 pairs, ≥ 4.5:1 in light and dark themes.

### Keyboard operability — Supports

- All controls are native elements (buttons, checkboxes, selects, inputs): tab order follows the visual order; pager ends are conveyed by `disabled` states; the layout `details` disclosure is keyboard-toggleable.
- No pointer-only or drag interactions were introduced.

### High contrast and forced colors — Supports

- `:root[data-high-contrast="true"]` widens message/notice borders.
- `@media (forced-colors: active)` maps panel, preview, message tiers, and notice to `Canvas`/`CanvasText`, keeps the error tier distinguishable by border weight, and sets icons to `currentcolor`.

### Reduced motion — Not applicable

No animation or motion was added by the expansion.

## Issues found and fixed during review

1. **Informational warnings interrupted screen readers.** The single warnings box used `role="alert"` for everything, so a "capitals converted to lowercase" note interrupted like a failure. Fixed by splitting into an alert-tier errors box and a status-tier warnings box.
2. **Severity was color-only.** The former warning list conveyed tier purely by background/border color. Fixed with text prefixes + icons (see above).

## Verification

- `tests/e2e/braille-card.spec.js` — axe scans of the panel in card mode (normal, warning-visible, error + multi-card notice states), charm mode (cell-budget error visible), and sign mode; keyboard pager test; role assertions for the alert/status tiers.
- Unit tests cover the layout engine (`braille-wrap.test.js`, including the SCAD All-cards chunk-parity mirror) and manifest/registry integration for all three examples.

## Remaining considerations (not blockers)

- The render-all checkbox lives inside the `role="status"` notice; if user feedback shows the re-announcements are chatty, move the toggle out of the live region.
- Braille preview text uses `lang="und"`; a future improvement could map the selected liblouis table to a BCP-47 language for the source-text line.
