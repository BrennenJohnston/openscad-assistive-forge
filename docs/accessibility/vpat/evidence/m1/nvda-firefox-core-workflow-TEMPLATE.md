# AT Testing Evidence: Core Workflow

**Date**: YYYY-MM-DD  
**Tester**: [Your Name]  
**AT**: NVDA [Version, e.g., 2024.4]  
**Browser**: Firefox [Version, e.g., 134]  
**OS**: Windows [Version, e.g., 11 24H2]

## Test Workflow

Core workflow tested: Upload → Edit Parameters → Preview → Export

**Test file used**: `public/examples/simple-box/simple_box.scad`  
**App URL**: `http://localhost:5173` (run `npm run dev` first)

### NVDA Quick Reference

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move between controls |
| `Enter` or `Space` | Activate button/link |
| `Arrow keys` | Adjust slider, navigate dropdown |
| `Escape` | Close modal/drawer |
| `Ctrl` | Stop NVDA speaking |
| `NVDA+S` | Toggle speech |
| `NVDA+Q` | Quit NVDA |

---

### Phase 1: Page Load & Navigation

| Step | Action | Expected | Pass/Fail | Notes |
|------|--------|----------|-----------|-------|
| 1 | Navigate to app with NVDA | Page title "OpenSCAD Assistive Forge" announced | | |
| 2 | Tab once | Skip link announced | | |
| 3 | Enter on skip link | Focus moves to main content area | | |

### Phase 2: File Upload & Parameters

| Step | Action | Expected | Pass/Fail | Notes |
|------|--------|----------|-----------|-------|
| 4 | Tab to file input | "Load file" or similar announced | | |
| 5 | Upload simple_box.scad | Parameters render within 3 seconds | | |
| 6 | Tab through parameter groups | Group headers announced ("Dimensions", "Features", "Advanced") | | |
| 7 | Tab through individual params | Label + current value announced for each | | |

### Phase 3: Parameter Editing

| Step | Action | Expected | Pass/Fail | Notes |
|------|--------|----------|-----------|-------|
| 8 | Find "Width" slider, use arrow keys | Value change announced (debounced ~350ms) | | |
| 9 | Find "include_lid" dropdown, change value | New selection announced | | |
| 10 | Change "ventilation" to "yes" | Dependent params ("hole_count", "hole_diameter") appear and announce | | |

### Phase 4: Render & Export

| Step | Action | Expected | Pass/Fail | Notes |
|------|--------|----------|-----------|-------|
| 11 | Tab to Render button, press Enter | "Rendering" announced, then success | | |
| 12 | Wait for preview | Render completes, status announced | | |
| 13 | Tab to Export STL, press Enter | Download initiates | | |

### Phase 5: Drawer & Modal Focus Tests

**Mobile viewport test**: Resize browser window to < 768px width before testing Parameters drawer.

| Component | How to Open | Focus Trap Works? | Escape Closes? | Focus Returns? | Pass/Fail |
|-----------|-------------|-------------------|----------------|----------------|-----------|
| Parameters drawer (mobile viewport) | Toggle button in header | | | | |
| Settings modal | Settings icon in header | | | | |
| Features Guide modal | Help/Guide button | | | | |
| Preset modal (if available) | Preset button in parameters | | | | |

**Focus trap verification**: After opening, Tab repeatedly. Focus should cycle within the component, not escape to page behind.

## Issues Found

<!-- List any issues with GitHub issue links -->
- None found / [#123](link): Description

## WCAG Criteria Verified

Based on this session, the following criteria were manually verified:

| Criterion | What You're Checking | Status | Notes |
|-----------|---------------------|--------|-------|
| 2.1.1 Keyboard | All functions work with keyboard only (no mouse) | Pass/Fail | |
| 2.1.2 No Keyboard Trap | Can always Tab out of any component (drawers/modals close with Escape) | Pass/Fail | |
| 2.4.1 Bypass Blocks | Skip link works and moves focus to main content | Pass/Fail | |
| 2.4.3 Focus Order | Tab order is logical (header → params → preview → actions) | Pass/Fail | |
| 2.4.7 Focus Visible | Can always see which element has focus (3px outline) | Pass/Fail | |
| 4.1.2 Name, Role, Value | Buttons/controls have meaningful names announced by NVDA | Pass/Fail | |
| 4.1.3 Status Messages | Status changes announced without stealing focus (render progress, errors) | Pass/Fail | |

## Additional Observations

<!-- Note anything unexpected, confusing, or noteworthy that doesn't fit above -->

**Positive observations** (things that worked particularly well):
- 

**Concerns or suggestions** (not necessarily failures, but could be improved):
- 

## Screenshots/Recordings

<!-- Optional: attach evidence of testing, e.g., Speech Viewer screenshots -->

## Tester Signature

By completing this form, I attest that the above testing was performed as described.

**Tested by**: _____________________  
**Date**: _____________________
