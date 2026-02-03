# Voluntary Product Accessibility Template (VPAT®)

## WCAG 2.2 Edition

**Version**: 2.5 (February 2024 VPAT Format)  
**Product**: OpenSCAD Assistive Forge  
**Product Version**: 1.0  
**Report Date**: 2026-02-02  
**Contact**: [Project Maintainer via GitHub Issues]

---

## About This Document

This Voluntary Product Accessibility Template (VPAT®) documents the accessibility conformance of OpenSCAD Assistive Forge against the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA criteria.

### Evaluation Methods

- Automated testing: axe-core, Lighthouse accessibility audit
- Manual testing: Keyboard navigation, screen reader testing
- Assistive technology testing: NVDA, JAWS, VoiceOver
- User testing: Feedback from users with disabilities

### Applicable Standards

This report covers conformance to:

- Web Content Accessibility Guidelines (WCAG) 2.2 Level A
- Web Content Accessibility Guidelines (WCAG) 2.2 Level AA

---

## Terms

The terms used in the Conformance Level column are defined as follows:

| Term | Definition |
|------|------------|
| **Supports** | The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation. |
| **Partially Supports** | Some functionality of the product does not meet the criterion. |
| **Does Not Support** | The majority of product functionality does not meet the criterion. |
| **Not Applicable** | The criterion is not relevant to the product. |
| **Not Evaluated** | The product has not been evaluated against the criterion. This can be used only in WCAG 2.x Level AAA. |

---

## WCAG 2.2 Report

### Table 1: Success Criteria, Level A

| Criteria | Conformance Level | Remarks and Explanations |
|----------|-------------------|-------------------------|
| **1.1.1 Non-text Content** | Supports | All images have alternative text. Icon buttons have accessible names. 3D preview has text description of model statistics. |
| **1.2.1 Audio-only and Video-only (Prerecorded)** | Not Applicable | Application contains no audio or video content. |
| **1.2.2 Captions (Prerecorded)** | Not Applicable | Application contains no audio or video content. |
| **1.2.3 Audio Description or Media Alternative (Prerecorded)** | Not Applicable | Application contains no audio or video content. |
| **1.3.1 Info and Relationships** | Supports | Semantic HTML used throughout. Form labels associated with inputs. Headings structure content logically. ARIA landmarks identify regions. |
| **1.3.2 Meaningful Sequence** | Supports | DOM order matches visual order. Tab sequence follows logical flow. |
| **1.3.3 Sensory Characteristics** | Supports | Instructions do not rely solely on shape, color, size, or visual location. Error messages include text descriptions. |
| **1.4.1 Use of Color** | Supports | Color is not the only means of conveying information. Status indicators include icons and text. Error states have multiple cues. |
| **1.4.2 Audio Control** | Not Applicable | Application has no auto-playing audio. |
| **2.1.1 Keyboard** | Supports | All functionality available via keyboard. Custom widgets implement standard keyboard patterns. 3D preview controllable via arrow keys. |
| **2.1.2 No Keyboard Trap** | Supports | Focus can be moved away from all components. Escape key closes modals. Tab exits editor when appropriate. |
| **2.1.4 Character Key Shortcuts** | Supports | Single-character shortcuts only active when relevant control is focused. No global single-key shortcuts. |
| **2.2.1 Timing Adjustable** | Not Applicable | Application has no time limits for user actions. |
| **2.2.2 Pause, Stop, Hide** | Supports | Auto-rotate feature can be paused. Respects prefers-reduced-motion setting. No other auto-updating content. |
| **2.3.1 Three Flashes or Below Threshold** | Supports | Application contains no flashing content. |
| **2.4.1 Bypass Blocks** | Supports | Skip-to-main-content link provided. ARIA landmarks allow screen reader navigation. |
| **2.4.2 Page Titled** | Supports | Page has descriptive title. Title updates to reflect loaded model. |
| **2.4.3 Focus Order** | Supports | Focus order follows logical sequence. Tab moves through controls predictably. |
| **2.4.4 Link Purpose (In Context)** | Supports | Link text describes destination. External links are marked. |
| **2.5.1 Pointer Gestures** | Supports | All path-based gestures have single-pointer alternatives. 3D navigation available via buttons. |
| **2.5.2 Pointer Cancellation** | Supports | Actions trigger on up-event. Dragging operations can be cancelled. |
| **2.5.3 Label in Name** | Supports | Visible labels match accessible names. Button text matches aria-label where used. |
| **2.5.4 Motion Actuation** | Not Applicable | Application does not use device motion. |
| **3.1.1 Language of Page** | Supports | HTML lang attribute set to "en". |
| **3.2.1 On Focus** | Supports | Focus does not trigger unexpected context changes. |
| **3.2.2 On Input** | Supports | Input changes do not trigger unexpected context changes. Parameter changes update preview, not navigation. |
| **3.3.1 Error Identification** | Supports | Errors are identified in text. Error messages indicate which field has issue. Parse errors show line numbers. |
| **3.3.2 Labels or Instructions** | Supports | All inputs have visible labels. Parameter help available via tooltip. Required formats indicated. |
| **4.1.1 Parsing** | Not Applicable | HTML5 specification makes this obsolete. Valid HTML5 used. |
| **4.1.2 Name, Role, Value** | Supports | Custom components use appropriate ARIA roles. State changes announced. Slider values exposed. |

### Table 2: Success Criteria, Level AA

| Criteria | Conformance Level | Remarks and Explanations |
|----------|-------------------|-------------------------|
| **1.2.4 Captions (Live)** | Not Applicable | Application has no live audio content. |
| **1.2.5 Audio Description (Prerecorded)** | Not Applicable | Application has no video content. |
| **1.3.4 Orientation** | Supports | Application works in both portrait and landscape orientations. No orientation lock. |
| **1.3.5 Identify Input Purpose** | Supports | Input types indicate purpose where applicable. Autocomplete attributes used appropriately. |
| **1.4.3 Contrast (Minimum)** | Supports | All text meets 4.5:1 contrast ratio. UI components meet 3:1 ratio. High contrast mode exceeds 7:1. |
| **1.4.4 Resize Text** | Supports | Text resizable to 200% without loss of functionality. Layout remains usable at larger sizes. |
| **1.4.5 Images of Text** | Supports | No images of text used except for logos. All text rendered as actual text. |
| **1.4.10 Reflow** | Partially Supports | Content reflows at 320px width. 3D preview may require horizontal scrolling on very narrow viewports. |
| **1.4.11 Non-text Contrast** | Supports | UI components and graphical objects meet 3:1 contrast. Focus indicators clearly visible. |
| **1.4.12 Text Spacing** | Supports | Adjusting text spacing does not cause content loss. CSS allows user overrides. |
| **1.4.13 Content on Hover or Focus** | Supports | Tooltips are dismissible (Escape), hoverable, and persistent until dismissed. |
| **2.4.5 Multiple Ways** | Supports | Multiple navigation methods: menu, keyboard shortcuts, search. Parameter panel provides direct access. |
| **2.4.6 Headings and Labels** | Supports | Headings describe content. Form labels indicate purpose. Group labels used for parameter sections. |
| **2.4.7 Focus Visible** | Supports | All focusable elements have visible focus indicator. Focus style meets 3:1 contrast. |
| **2.4.11 Focus Not Obscured (Minimum)** | Supports | Focused elements are not entirely hidden by sticky headers or other content. |
| **2.5.7 Dragging Movements** | Supports | Slider dragging has keyboard alternative (arrow keys). 3D rotation has button alternatives. |
| **2.5.8 Target Size (Minimum)** | Supports | Interactive targets are at least 24×24 CSS pixels. Most buttons exceed 44×44. |
| **3.1.2 Language of Parts** | Not Applicable | Application is single language (English). No embedded foreign language content. |
| **3.2.3 Consistent Navigation** | Supports | Navigation components appear in same relative order on all views. |
| **3.2.4 Consistent Identification** | Supports | Components with same functionality use consistent identification across application. |
| **3.2.6 Consistent Help** | Not Applicable | Application does not have separate help mechanism on each page. |
| **3.3.3 Error Suggestion** | Supports | Error messages suggest how to fix issues. Range violations indicate valid range. |
| **3.3.4 Error Prevention (Legal, Financial, Data)** | Not Applicable | Application does not involve legal, financial, or data transactions. |
| **3.3.7 Redundant Entry** | Supports | Application does not require re-entry of previously provided information. |
| **3.3.8 Accessible Authentication (Minimum)** | Not Applicable | Application has no authentication requirements. |
| **4.1.3 Status Messages** | Supports | Status messages use ARIA live regions. Render completion announced. Errors announced. Memory warnings announced. |

---

## Legal Disclaimer

This document is provided for informational purposes regarding the accessibility of OpenSCAD Assistive Forge. It is not a warranty or guarantee of accessibility. Conformance claims are based on testing at the time of report creation and may change as the product is updated.

The VPAT is a registered trademark of the Information Technology Industry Council (ITI).

---

## Report Information

| Field | Value |
|-------|-------|
| **Product Name** | OpenSCAD Assistive Forge |
| **Product Version** | 1.0 |
| **Report Version** | 1.0 |
| **Report Date** | 2026-02-02 |
| **VPAT Version** | 2.5 |
| **Evaluation Methods** | Automated (axe-core, Lighthouse), Manual testing, Screen reader testing (NVDA, JAWS, VoiceOver) |
| **Testing Environment** | Chrome 120, Firefox 120, Safari 17, Edge 120 on Windows 11 and macOS 14 |

---

## Notes and Caveats

### Partially Supported Criteria

**1.4.10 Reflow**: The 3D preview panel may require horizontal scrolling when the viewport is narrower than 320px. This is an inherent limitation of 3D visualization. Text content and parameter controls reflow correctly.

### Features Requiring User Configuration

- **High Contrast Mode**: Available via HC button in header
- **Reduced Motion**: Respects system preference; auto-rotate disabled automatically
- **Preferred Editor**: Screen reader users can select textarea editor in settings

### Assistive Technology Tested

| AT | Browser | OS | Result |
|----|---------|-----|--------|
| NVDA 2024.1 | Chrome 120 | Windows 11 | Full support |
| NVDA 2024.1 | Firefox 120 | Windows 11 | Full support |
| JAWS 2024 | Chrome 120 | Windows 11 | Full support |
| JAWS 2024 | Edge 120 | Windows 11 | Full support |
| VoiceOver | Safari 17 | macOS 14 | Full support |
| VoiceOver | Safari | iOS 17 | Core workflows supported |

### Known Limitations

1. **3D Preview**: The WebGL canvas is not directly accessible to screen readers. Equivalent information (model dimensions, file size, vertex count) is provided in text form.

2. **Monaco Editor**: The Monaco code editor has some accessibility limitations. A fully accessible textarea editor is available as an alternative.

3. **Complex Models**: Very complex models may cause memory pressure. The application provides warnings and graceful degradation.

---

## Revision History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2026-02-02 | Initial VPAT for version 1.0 |
