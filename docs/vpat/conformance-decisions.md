# WCAG 2.2 Conformance Decisions Log

**Created**: 2026-02-02  
**Purpose**: Track conformance status for each WCAG criterion with evidence references

---

## How to Use This Document

1. **During AT testing**: Record pass/fail for each criterion tested
2. **When issues found**: Link to GitHub issue and evidence file
3. **When fixed**: Update status and add evidence reference
4. **At VPAT time**: Use this as source of truth for conformance claims

---

## Conformance Status Key

| Status | Meaning |
|--------|---------|
| **Supports** | Fully conforms to the criterion |
| **Partially Supports** | Some functionality conforms, some does not |
| **Does Not Support** | Does not conform to the criterion |
| **Not Applicable** | Criterion does not apply to this product |
| **Not Evaluated** | Has not yet been tested |

---

## WCAG 2.2 Level A Criteria

| Criterion | Name | Status | Evidence | Notes |
|-----------|------|--------|----------|-------|
| 1.1.1 | Non-text Content | Partially Supports | | **3D Canvas Boundary**: The WebGL preview canvas renders visual 3D geometry that cannot be directly described to screen readers—this is an inherent limitation of real-time 3D rendering. **Mitigations provided**: (1) Model statistics announced via live region (triangles, dimensions, render time), (2) STL export for tactile 3D printing, (3) Textual error messages for render failures. All other non-text content (icons, images) has text alternatives. |
| 1.2.1 | Audio-only and Video-only | Not Applicable | | No audio/video content |
| 1.2.2 | Captions (Prerecorded) | Not Applicable | | No audio/video content |
| 1.2.3 | Audio Description or Media Alternative | Not Applicable | | No audio/video content |
| 1.3.1 | Info and Relationships | Supports | Code audit | Proper heading hierarchy (h1→h2→h3), ARIA landmarks on all major regions, form labels on all inputs (verified via axe E2E), `details`/`summary` for disclosure widgets, semantic HTML throughout. |
| 1.3.2 | Meaningful Sequence | Supports | Code audit | DOM order follows logical visual sequence: header → skip link → main → parameters → preview → actions. CSS does not reorder content in a way that breaks reading order. |
| 1.3.3 | Sensory Characteristics | Supports | Code audit | No instructions rely solely on shape, size, visual location, or sound. All button icons have accompanying `aria-label` text. Error states use both color and icons. |
| 1.4.1 | Use of Color | Supports | Code audit | All color-coded states include icons (checkmark for success, X for error, warning triangle, info circle). Documented in ACCESSIBILITY_GUIDE.md. Radix color palette designed for color blindness. |
| 1.4.2 | Audio Control | Not Applicable | | No audio content |
| 2.1.1 | Keyboard | Supports | Code review | All interactive elements have keyboard handlers. Drawers, modals, camera controls, and parameter inputs support keyboard operation. `focus-trap.js` ensures Tab/Shift+Tab cycling. Manual AT verification recommended. |
| 2.1.2 | No Keyboard Trap | Supports | Code review | `focus-trap.js` implements Escape key handling for all traps. Modals and drawers restore focus to trigger on close. No infinite focus loops. |
| 2.1.4 | Character Key Shortcuts | Supports | Code audit | Keyboard shortcuts (arrow keys, +/-, Escape) only activate when relevant elements have focus (preview canvas, modals). No single-character shortcuts fire globally. |
| 2.2.1 | Timing Adjustable | Not Applicable | | No time limits |
| 2.2.2 | Pause, Stop, Hide | Supports | Code audit | Auto-rotate has an explicit toggle button. `prefers-reduced-motion: reduce` blocks auto-rotate from enabling and automatically disables it if active. No other auto-updating content. |
| 2.3.1 | Three Flashes or Below Threshold | Supports | | No flashing content |
| 2.4.1 | Bypass Blocks | Supports | Code review | Skip link present in `index.html` (line 62): `<a href="#main-content" class="skip-link">Skip to main content</a>`. Targets `#main-content` landmark. |
| 2.4.2 | Page Titled | Supports | Code audit | `<title>OpenSCAD Assistive Forge</title>` present in index.html. Describes the purpose of the page. |
| 2.4.3 | Focus Order | Supports | Code review | DOM order follows logical visual sequence: header → parameters panel → preview → actions. Focus traps maintain order within modals/drawers. Manual AT verification recommended. |
| 2.4.4 | Link Purpose (In Context) | Supports | Code audit | All links have descriptive text or `aria-label`. External links include "(opens in new tab)" in their label. |
| 2.5.1 | Pointer Gestures | Supports | Code audit | 3D preview uses multi-point orbit gestures but provides single-pointer camera buttons (rotate, pan, zoom) as alternatives. All other controls are single-pointer. |
| 2.5.2 | Pointer Cancellation | Supports | Code audit | Standard HTML button click behavior uses up-event activation. No custom down-event actions that cannot be aborted. |
| 2.5.3 | Label in Name | Supports | Code audit | All buttons with visible text have matching accessible names. Icon-only buttons use `aria-label` describing the action. |
| 2.5.4 | Motion Actuation | Not Applicable | | No motion input |
| 3.1.1 | Language of Page | Supports | Code audit | `<html lang="en">` present in index.html. |
| 3.2.1 | On Focus | Supports | Code audit | No unexpected context changes on focus. Focus moves predictably through interactive elements. |
| 3.2.2 | On Input | Supports | Code audit | Parameter changes trigger preview via user-initiated action (auto-preview toggle or explicit button). No unexpected context changes on input. |
| 3.3.1 | Error Identification | Supports | Code audit | `error-translator.js` provides user-friendly error messages with title, explanation, and suggestion. Errors announced via `aria-live="assertive"` region. |
| 3.3.2 | Labels or Instructions | Supports | Code audit | All parameter inputs have labels. Sliders include min/max/step hints. Help tooltips (?) provide additional instructions. Textarea editor has screen reader instructions. |
| 4.1.1 | Parsing | Not Applicable | | HTML5 parsing rules |
| 4.1.2 | Name, Role, Value | Supports | Code review | Drawers use `aria-expanded`, `aria-controls`, `aria-label`. Modals use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Icon buttons have `aria-label`. Verified in `drawer-controller.js`, `modal-manager.js`. |

---

## WCAG 2.2 Level AA Criteria

| Criterion | Name | Status | Evidence | Notes |
|-----------|------|--------|----------|-------|
| 1.2.4 | Captions (Live) | Not Applicable | | No live audio |
| 1.2.5 | Audio Description (Prerecorded) | Not Applicable | | No video content |
| 1.3.4 | Orientation | Supports | E2E tests | Responsive layout works in both portrait and landscape. No orientation lock. Tutorial reposition verified in E2E tests. |
| 1.3.5 | Identify Input Purpose | Not Applicable | Code audit | No personal data inputs (name, email, address, phone). App is a parametric model customizer with numeric/text/dropdown parameter inputs. |
| 1.4.3 | Contrast (Minimum) | Supports | E2E tests + Code audit | Radix Colors palette meets 4.5:1 for text, 3:1 for UI elements. axe-core contrast checks pass across all four themes. HC mode achieves 7:1 (AAA). |
| 1.4.4 | Resize Text | Supports | Code audit | All text uses relative units (rem/em). Layout adapts at 200% zoom. No text clipping observed. |
| 1.4.5 | Images of Text | Supports | Code audit | No images of text used. All text is real text. Logo image has alt text. |
| 1.4.10 | Reflow | Partially Supports | Code audit | Responsive layout reflows at 320px CSS width. 3D preview canvas and Monaco editor may require horizontal scrolling at very narrow widths. Parameter panel and welcome screen fully reflow. |
| 1.4.11 | Non-text Contrast | Supports | Code audit | Focus indicators use 3px ring with `--color-focus` (sufficient contrast). Buttons have visible borders. Icons use `currentColor`. All checked with axe-core. |
| 1.4.12 | Text Spacing | Not Evaluated | | Requires manual testing with overridden letter-spacing (0.12em), word-spacing (0.16em), line-height (1.5), and paragraph spacing (2em). |
| 1.4.13 | Content on Hover or Focus | Supports | Code audit | Help tooltips are dismissible with Escape, persistent until dismissed, hoverable. `aria-describedby` links buttons to tooltip content. |
| 2.4.5 | Multiple Ways | Supports | Code audit | Parameter search input, jump-to-group dropdown, keyboard shortcuts, collapsible groups, and welcome screen examples all provide multiple navigation paths. |
| 2.4.6 | Headings and Labels | Supports | Code audit | Heading hierarchy h1→h2→h3 describes page structure. All form controls have descriptive labels. Section headings describe content areas. |
| 2.4.7 | Focus Visible | Supports | Code review | All interactive elements use `:focus-visible` with `--focus-ring-width: 3px` (4px in high contrast mode). Focus ring uses `var(--color-focus)` with adequate contrast. Verified in `components.css` and `variables.css`. |
| 2.4.11 | Focus Not Obscured (Minimum) | Supports | Code audit | Focus traps ensure focused elements are visible within modals/drawers. No sticky headers obscure focused elements. Tutorial spotlight moves with focused step targets. WCAG 2.2 new. |
| 2.5.7 | Dragging Movements | Supports | Code audit | 3D preview drag gestures have single-pointer button alternatives (camera panel). Slider drag has number input alternative. Split panel resize has keyboard resize. WCAG 2.2 new. |
| 2.5.8 | Target Size (Minimum) | Supports | E2E tests | `--size-touch-target: 44px` (exceeds WCAG 2.2 minimum of 24x24 CSS px). Verified in E2E touch target size tests. Reduced to 36px on compact viewport but still exceeds 24px minimum. WCAG 2.2 new. |
| 3.1.2 | Language of Parts | Not Applicable | | Single language |
| 3.2.3 | Consistent Navigation | Supports | Code audit | Navigation layout is consistent across all states (header, parameter panel, preview, actions). Toolbar position does not change between Standard and Expert modes. |
| 3.2.4 | Consistent Identification | Supports | Code audit | Same actions use consistent icons and labels throughout (e.g., Generate, Download, Reset). Theme toggle and HC toggle maintain consistent placement and labeling. |
| 3.2.6 | Consistent Help | Supports | Code audit | Help mechanism (Features Guide modal via "Help" button or "Open Help" links) is consistently available in the same location. Keyboard shortcut help available in tutorial. WCAG 2.2 new. |
| 3.3.3 | Error Suggestion | Supports | Code audit | `error-translator.js` maps raw OpenSCAD errors to user-friendly messages with title, explanation, and actionable suggestion. e.g., "undefined variable" → "Missing Variable" with suggestion to check spelling. |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | Not Applicable | | No legal/financial transactions |
| 3.3.7 | Redundant Entry | Not Applicable | Code audit | No multi-step forms that require re-entering previously provided information. Single-page application with persistent parameter state. WCAG 2.2 new. |
| 3.3.8 | Accessible Authentication (Minimum) | Not Applicable | | WCAG 2.2 new, no auth |
| 4.1.3 | Status Messages | Supports | Code review | Centralized `announcer.js` uses dual live regions: `#srAnnouncer` (polite) for routine status, `#srAnnouncerAssertive` (assertive) for errors. Implements debouncing (350ms default) and clear-then-set pattern for reliable announcements. |

---

## Change Log

| Date | Criterion | Change | By |
|------|-----------|--------|-----|
| 2026-02-02 | All | Initial document created | Technical Fellow |
| 2026-02-02 | 1.1.1 | Updated to "Partially Supports" with 3D canvas boundary notes | Code audit |
| 2026-02-02 | 2.1.1, 2.1.2 | Updated to "Supports" based on focus-trap.js review | Code audit |
| 2026-02-02 | 2.4.1, 2.4.3, 2.4.7 | Updated to "Supports" based on skip link and focus styles review | Code audit |
| 2026-02-02 | 4.1.2, 4.1.3 | Updated to "Supports" based on ARIA and announcer.js review | Code audit |
| 2026-03-13 | Multiple | Accessibility audit: evaluated 29 previously "Not Evaluated" criteria. Fixed heading hierarchy (h1→h2→h3). Added `.visually-hidden` CSS class. Upgraded axe E2E tests to WCAG 2.2 tags. | Code audit + E2E review |

---

## Evidence File Naming Convention

```
docs/vpat/evidence/{milestone}/
  {at}-{browser}-{feature}-{date}.md

Examples:
  m1/nvda-chrome-vectors-2026-03-15.md
  m2/voiceover-safari-expert-2026-04-01.md
```

## Evidence File Template

```markdown
# AT Testing Evidence: [Feature Name]

**Date**: YYYY-MM-DD  
**Tester**: [Name/ID]  
**AT**: [Screen Reader] [Version]  
**Browser**: [Browser] [Version]  
**OS**: [Operating System] [Version]

## Test Workflows

| Workflow | Pass/Fail | Notes |
|----------|-----------|-------|
| [Workflow 1] | Pass | |
| [Workflow 2] | Fail | Issue #123 |

## Issues Found

- [#123](link): Description of issue

## Screenshots/Recordings

[Attach or link to evidence]

## WCAG Criteria Covered

- 2.1.1 Keyboard: Pass
- 2.4.3 Focus Order: Pass
- 4.1.2 Name, Role, Value: Partial (see #123)
```
