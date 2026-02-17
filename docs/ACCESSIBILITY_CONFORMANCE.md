# Accessibility Conformance Statement

**Product**: OpenSCAD Assistive Forge  
**Version**: 4.2.0  
**Date**: 2026-02-02  
**Standard**: WCAG 2.2 Level AA

> **Note:** For detailed, criterion-level conformance status with evidence links, see [`docs/vpat/conformance-decisions.md`](./vpat/conformance-decisions.md). This document provides a summary statement; the decisions log is the source of truth for WCAG criterion status.

---

## Conformance Statement

OpenSCAD Assistive Forge strives to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA. This conformance statement describes our accessibility commitment and current status.

### Conformance Level

**Target**: WCAG 2.2 Level AA  
**Current Status**: Partially Conformant

"Partially Conformant" means that some portions of the content do not fully conform to the accessibility standard. See the detailed assessment below.

---

## Accessibility Features

### Navigation and Operation

- **Full keyboard support**: All features accessible without a mouse
- **Skip links**: Jump directly to main content
- **Focus indicators**: Visible focus outlines on all interactive elements
- **Logical tab order**: Navigation follows visual layout
- **Keyboard shortcuts**: Common actions have keyboard equivalents

### Screen Reader Support

- **ARIA landmarks**: Page regions properly identified
- **Live regions**: Status updates announced automatically
- **Descriptive labels**: All controls have accessible names
- **Error announcements**: Form validation errors announced
- **State changes**: Mode switches and actions announced

### Visual Design

- **Color contrast**: All text meets 4.5:1 minimum ratio
- **Text resizing**: Content readable at 200% zoom
- **No color-only information**: Color is not the only indicator
- **Focus visible**: Clear focus indicators on all elements
- **High contrast support**: Works with system high contrast modes

### Alternative Content

- **Text alternatives**: Icons have text equivalents
- **Error messages**: Clear, specific error descriptions
- **Help text**: Instructions for complex controls
- **Status messages**: Programmatically determinable

---

## Known Limitations

### 3D Preview

The 3D preview canvas presents inherent accessibility challenges:

- **Non-text content**: 3D models cannot be fully described in text
- **Mitigation**: Textual feedback for model statistics (triangles, dimensions)
- **Mitigation**: Export to STL for tactile printing

### Monaco Code Editor

The Monaco editor has some assistive technology limitations:

- **Mitigation**: Accessible textarea fallback available
- **Mitigation**: User can select preferred editor in Settings
- **Status**: Textarea provides full feature parity for core operations

### Complex Parameter Values

Some OpenSCAD parameters contain expressions that cannot be parsed:

- **Mitigation**: Falls back to text input (raw mode)
- **Status**: Preserves original value exactly

---

## Testing Methodology

### Automated Testing

- **Lighthouse**: Accessibility audits on every build (current score: 96%)
- **axe-core**: WCAG violation scanning
- **HTML validation**: Semantic markup verification

### Manual Testing

The following assistive technology combinations have been tested:

| Screen Reader | Browser | Platform | Result |
|---------------|---------|----------|--------|
| NVDA 2024.x | Chrome | Windows | [VERIFY] |
| NVDA 2024.x | Firefox | Windows | [VERIFY] |
| JAWS 2024 | Chrome | Windows | [VERIFY] |
| JAWS 2024 | Edge | Windows | [VERIFY] |
| VoiceOver | Safari | macOS | [VERIFY] |

**Notes**: Results marked `[VERIFY]` require criterion-level evidence in [`docs/vpat/evidence/`](./vpat/evidence/). See [`conformance-decisions.md`](./vpat/conformance-decisions.md) for current status. JAWS users may experience improved navigation with the accessible text editor option enabled.

### Test Workflow

The following core workflow has been verified with assistive technology:

1. Navigate to application
2. Load an OpenSCAD file
3. Modify parameter values
4. Preview the changes
5. Switch to Expert Mode
6. Edit code
7. Return to Standard Mode
8. Export STL file

---

## VPAT Availability

A full Voluntary Product Accessibility Template (VPAT) 2.5 based on WCAG 2.2 is available:

- **Location**: [VPAT-2.5-WCAG.md](./vpat/VPAT-2.5-WCAG.md)
- **Format**: ITI VPAT 2.5 (Rev 508)
- **Coverage**: 59 WCAG 2.2 criteria (38 Level A + 21 Level AA)

---

## Feedback and Support

### Reporting Accessibility Issues

We welcome feedback on accessibility. To report an issue:

1. **GitHub Issues**: Create an issue with the "accessibility" label
2. **Email**: Contact information in SECURITY.md for sensitive reports

When reporting, please include:
- Assistive technology used (name, version)
- Browser and operating system
- Steps to reproduce the issue
- Expected vs. actual behavior

### Response Commitment

Accessibility issues are treated with high priority:

| Severity | Response Target |
|----------|-----------------|
| Blocker (cannot complete core workflow) | 24 hours |
| Major (feature inaccessible) | 72 hours |
| Minor (inconvenient but workable) | 2 weeks |

---

## Continuous Improvement

We are committed to improving accessibility over time:

### Current Priorities

1. Expand screen reader testing coverage
2. Improve 3D preview accessibility
3. Enhance mobile accessibility
4. Add accessibility preference persistence

### Monitoring

- Lighthouse accessibility scores tracked in CI
- Accessibility regression tests in E2E suite
- Regular manual testing with assistive technology

---

## Legal Information

### Section 508

This product supports Section 508 of the Rehabilitation Act for users who require assistive technology.

### WCAG 2.2

This product targets conformance with WCAG 2.2 Level AA, the current W3C accessibility guideline.

### Disclaimer

This conformance statement represents our current understanding and testing results. Accessibility is an ongoing effort, and we continuously work to improve the experience for all users.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial conformance statement |
