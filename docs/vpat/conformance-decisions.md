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
| 1.3.1 | Info and Relationships | Not Evaluated | | |
| 1.3.2 | Meaningful Sequence | Not Evaluated | | |
| 1.3.3 | Sensory Characteristics | Not Evaluated | | |
| 1.4.1 | Use of Color | Not Evaluated | | |
| 1.4.2 | Audio Control | Not Applicable | | No audio content |
| 2.1.1 | Keyboard | Supports | Code review | All interactive elements have keyboard handlers. Drawers, modals, camera controls, and parameter inputs support keyboard operation. `focus-trap.js` ensures Tab/Shift+Tab cycling. Manual AT verification recommended. |
| 2.1.2 | No Keyboard Trap | Supports | Code review | `focus-trap.js` implements Escape key handling for all traps. Modals and drawers restore focus to trigger on close. No infinite focus loops. |
| 2.1.4 | Character Key Shortcuts | Not Evaluated | | |
| 2.2.1 | Timing Adjustable | Not Applicable | | No time limits |
| 2.2.2 | Pause, Stop, Hide | Not Evaluated | | Auto-rotate preview |
| 2.3.1 | Three Flashes or Below Threshold | Supports | | No flashing content |
| 2.4.1 | Bypass Blocks | Supports | Code review | Skip link present in `index.html` (line 62): `<a href="#main-content" class="skip-link">Skip to main content</a>`. Targets `#main-content` landmark. |
| 2.4.2 | Page Titled | Not Evaluated | | |
| 2.4.3 | Focus Order | Supports | Code review | DOM order follows logical visual sequence: header → parameters panel → preview → actions. Focus traps maintain order within modals/drawers. Manual AT verification recommended. |
| 2.4.4 | Link Purpose (In Context) | Not Evaluated | | |
| 2.5.1 | Pointer Gestures | Not Evaluated | | |
| 2.5.2 | Pointer Cancellation | Not Evaluated | | |
| 2.5.3 | Label in Name | Not Evaluated | | |
| 2.5.4 | Motion Actuation | Not Applicable | | No motion input |
| 3.1.1 | Language of Page | Not Evaluated | | |
| 3.2.1 | On Focus | Not Evaluated | | |
| 3.2.2 | On Input | Not Evaluated | | |
| 3.3.1 | Error Identification | Not Evaluated | | |
| 3.3.2 | Labels or Instructions | Not Evaluated | | |
| 4.1.1 | Parsing | Not Applicable | | HTML5 parsing rules |
| 4.1.2 | Name, Role, Value | Supports | Code review | Drawers use `aria-expanded`, `aria-controls`, `aria-label`. Modals use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Icon buttons have `aria-label`. Verified in `drawer-controller.js`, `modal-manager.js`. |

---

## WCAG 2.2 Level AA Criteria

| Criterion | Name | Status | Evidence | Notes |
|-----------|------|--------|----------|-------|
| 1.2.4 | Captions (Live) | Not Applicable | | No live audio |
| 1.2.5 | Audio Description (Prerecorded) | Not Applicable | | No video content |
| 1.3.4 | Orientation | Not Evaluated | | |
| 1.3.5 | Identify Input Purpose | Not Evaluated | | |
| 1.4.3 | Contrast (Minimum) | Not Evaluated | | |
| 1.4.4 | Resize Text | Not Evaluated | | |
| 1.4.5 | Images of Text | Not Evaluated | | |
| 1.4.10 | Reflow | Not Evaluated | | |
| 1.4.11 | Non-text Contrast | Not Evaluated | | |
| 1.4.12 | Text Spacing | Not Evaluated | | |
| 1.4.13 | Content on Hover or Focus | Not Evaluated | | |
| 2.4.5 | Multiple Ways | Not Evaluated | | |
| 2.4.6 | Headings and Labels | Not Evaluated | | |
| 2.4.7 | Focus Visible | Supports | Code review | All interactive elements use `:focus-visible` with `--focus-ring-width: 3px` (4px in high contrast mode). Focus ring uses `var(--color-focus)` with adequate contrast. Verified in `components.css` and `variables.css`. |
| 2.4.11 | Focus Not Obscured (Minimum) | Not Evaluated | | WCAG 2.2 new |
| 2.5.7 | Dragging Movements | Not Evaluated | | WCAG 2.2 new |
| 2.5.8 | Target Size (Minimum) | Not Evaluated | | WCAG 2.2 new |
| 3.1.2 | Language of Parts | Not Applicable | | Single language |
| 3.2.3 | Consistent Navigation | Not Evaluated | | |
| 3.2.4 | Consistent Identification | Not Evaluated | | |
| 3.2.6 | Consistent Help | Not Applicable | | WCAG 2.2 new, no help mechanism |
| 3.3.3 | Error Suggestion | Not Evaluated | | |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | Not Applicable | | No legal/financial transactions |
| 3.3.7 | Redundant Entry | Not Evaluated | | WCAG 2.2 new |
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
