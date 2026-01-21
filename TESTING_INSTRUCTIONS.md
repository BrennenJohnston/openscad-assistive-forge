# Testing Instructions - Tutorial Enhancement (v2.4)

## Overview

This document provides testing instructions for the Educator Tutorial Enhancement and new UI Orientation tutorial implemented in v2.4.

## Changes Summary

1. **Selector Visibility Logic**: Updated `tutorial-sandbox.js` to select the first *visible* element from comma-separated selectors
2. **Enhanced Educator Tutorial**: Added drawer/panel hints for mobile and desktop
3. **New UI Orientation Tutorial**: 6-step non-gated walkthrough of app layout
4. **Welcome Screen Update**: Added "UI Orientation (1 min)" button below Accessibility Spotlights
5. **Documentation**: Updated guides and created research documentation

## Manual Testing Required

### Test 1: Selector Visibility Logic (Desktop Viewport ≥768px)

**Goal:** Verify that desktop-specific controls are highlighted in tutorials

**Steps:**
1. Open the app in a desktop browser (viewport ≥768px)
2. Click "Start Tutorial" on the Educators card
3. Proceed to Step 2 (Adjust Parameters)
4. **Expected:** The `#collapseParamPanelBtn` (left panel collapse button) should be highlighted, NOT `#mobileDrawerToggle` (which should be hidden on desktop)
5. Exit the tutorial
6. Click "UI Orientation (1 min)" button
7. Proceed to Step 2 (Parameters Panel)
8. **Expected:** The `#collapseParamPanelBtn` should be highlighted
9. Proceed to Step 5 (Camera Controls)
10. **Expected:** The `#cameraPanelToggle` (right-side camera panel button) should be highlighted

**Pass Criteria:**
- Desktop controls are highlighted correctly
- No visual glitches or overlapping highlights
- Tutorial panel positions correctly near highlighted elements

---

### Test 2: Selector Visibility Logic (Mobile Viewport <768px)

**Goal:** Verify that mobile-specific controls are highlighted in tutorials

**Steps:**
1. Open the app in a mobile browser or use browser DevTools to simulate mobile (viewport <768px)
2. Click "Start Tutorial" on the Educators card
3. Proceed to Step 2 (Adjust Parameters)
4. **Expected:** The `#mobileDrawerToggle` ("Params" button) should be highlighted, NOT `#collapseParamPanelBtn` (which should be hidden on mobile)
5. Exit the tutorial
6. Click "UI Orientation (1 min)" button
7. Proceed to Step 2 (Parameters Panel)
8. **Expected:** The `#mobileDrawerToggle` should be highlighted
9. Proceed to Step 5 (Camera Controls)
10. **Expected:** The `#cameraDrawerToggle` (camera drawer button in actions bar) should be highlighted

**Pass Criteria:**
- Mobile controls are highlighted correctly
- Tutorial panel docks to bottom of screen on mobile
- No horizontal scrolling or layout issues

---

### Test 3: Educator Tutorial Flow

**Goal:** Verify the enhanced educator tutorial includes drawer/panel hints

**Steps:**
1. Click "Start Tutorial" on the Educators card
2. Read through all 8 steps
3. **Expected content changes:**
   - **Step 1 (Welcome)**: Should mention "New to the interface? Try 'UI Orientation' (1 minute) after this tour."
   - **Step 2 (Adjust Parameters)**: Should mention mobile ("tap Params") and desktop ("collapse button") controls
   - **Step 3 (See Preview)**: Should mention "Expand 'Preview Settings & Info' to view status, dimensions, and quality settings"
   - **Step 5 (Generate)**: Should mention "More options like Share Link and Export Params live in the 'Actions' menu"
   - **Step 8 (You're Ready!)**: Should mention "Run 'UI Orientation' if you're new to the layout"

**Pass Criteria:**
- All new hints are present and clearly worded
- Tutorial completes successfully
- Focus returns to "Start Tutorial" button on exit

---

### Test 4: UI Orientation Tutorial

**Goal:** Verify the new UI Orientation tutorial is non-gated and covers all drawers

**Steps:**
1. Load the welcome screen
2. Scroll down to the "UI Orientation (1 min)" button (below Accessibility Spotlights)
3. Click the button
4. **Expected:** Simple Box example loads, then tutorial starts automatically
5. Verify all 6 steps:
   - **Step 1**: App Layout overview (centered, no highlight)
   - **Step 2**: Parameters Panel (highlights mobile drawer toggle OR desktop collapse button)
   - **Step 3**: Preview Settings & Info (highlights `#previewDrawerToggle`)
   - **Step 4**: Actions Menu (highlights `#actionsDrawerToggle`)
   - **Step 5**: Camera Controls (highlights mobile drawer OR desktop panel toggle)
   - **Step 6**: Ready to Explore (centered, no highlight)
6. **Expected:** "Next" button is ALWAYS enabled (no completion gates)
7. Press "Next" through all steps without interacting with highlighted elements
8. **Expected:** Tutorial completes successfully

**Pass Criteria:**
- Tutorial loads simple-box example before starting
- All steps are skippable (no completion requirements)
- Highlights appear on correct elements
- Tutorial duration is under 2 minutes

---

### Test 5: Keyboard Navigation

**Goal:** Verify tutorials are fully keyboard accessible

**Steps:**
1. Use only keyboard to navigate
2. Tab to "Start Tutorial" button (Educators card) and press Enter
3. Tutorial should open with focus inside the panel
4. Press **Tab** to navigate between Back/Next buttons
5. Press **Arrow Right** to advance to next step
6. Press **Arrow Left** to go back to previous step
7. Press **Escape** to exit tutorial
8. **Expected:** Focus returns to "Start Tutorial" button

**Repeat for UI Orientation tutorial:**
1. Tab to "UI Orientation (1 min)" button and press Enter
2. Verify keyboard navigation works as above

**Pass Criteria:**
- All tutorial controls are keyboard accessible
- Arrow keys navigate between steps
- Escape exits tutorial
- Focus is restored to trigger button on exit

---

### Test 6: Screen Reader Announcements

**Goal:** Verify tutorials announce steps and completion states

**Test with NVDA, JAWS, or VoiceOver:**
1. Start Educators tutorial
2. **Expected announcement:** "Educator Quick Start started. Step 1 of 8."
3. Press Next
4. **Expected announcement:** "Step 2 of 8: Adjust Parameters"
5. If step has completion requirement, complete the action
6. **Expected announcement:** "Action completed. Next enabled."
7. Complete tutorial
8. **Expected announcement:** "Tutorial closed."

**Repeat for UI Orientation tutorial:**
1. Start UI Orientation
2. **Expected announcement:** "UI Orientation started. Step 1 of 6."
3. Verify all steps announce correctly

**Pass Criteria:**
- Step transitions are announced clearly
- Step numbers and titles are announced
- Completion states are announced (for gated steps in Educators tutorial)
- Exit announcements are clear

---

### Test 7: Visual Accessibility (High Contrast Mode)

**Goal:** Verify tutorials work in high contrast mode

**Steps:**
1. Enable high contrast mode (HC button in header)
2. Start Educators tutorial
3. **Expected:** Tutorial panel has visible borders and text
4. **Expected:** Spotlight cutout has visible outline around highlighted elements
5. Repeat for UI Orientation tutorial

**Test with Windows High Contrast Mode:**
1. Enable Windows High Contrast Mode (Settings > Accessibility > Contrast themes)
2. Reload the app
3. Start tutorials
4. **Expected:** All tutorial UI is visible and distinguishable

**Pass Criteria:**
- Tutorial panel is visible in high contrast
- Highlighted elements are clearly distinguished
- Text is readable
- Buttons have visible focus indicators

---

### Test 8: Welcome Screen UI Orientation Button

**Goal:** Verify the new UI Orientation button is visible and functional

**Steps:**
1. Load welcome screen
2. Scroll down to Accessibility Spotlights section
3. **Expected:** "UI Orientation (1 min)" button is visible below the spotlights
4. Button should have:
   - Text: "🧭 UI Orientation (1 min)"
   - Outline button style (`btn-outline`)
   - Minimum 44px height (WCAG AAA touch target)
5. Click the button
6. **Expected:** Simple Box example loads, then UI Orientation tutorial starts

**Pass Criteria:**
- Button is visible and styled correctly
- Button loads simple-box example
- Tutorial launches automatically after example loads
- Button is keyboard accessible (Tab to reach, Enter to activate)

---

## Automated Testing (Future Enhancement)

Consider adding Playwright tests for:
- Selector visibility on different viewport sizes
- Tutorial navigation flow
- Focus restoration on exit
- ARIA announcements (via accessibility snapshot)

---

## Success Criteria Summary

✅ All selectors highlight correctly on mobile and desktop viewports  
✅ Educator tutorial includes drawer/panel hints  
✅ UI Orientation tutorial is non-gated and completes in under 2 minutes  
✅ Welcome screen shows UI Orientation button  
✅ Keyboard navigation works for all tutorials  
✅ Screen reader announcements are clear and timely  
✅ High contrast mode support is maintained  
✅ Focus restoration works on tutorial exit

---

## Related Documentation

- [Welcome Screen Feature Paths](docs/guides/WELCOME_SCREEN_FEATURE_PATHS.md)
- [Welcome Feature Paths Inventory](docs/WELCOME_FEATURE_PATHS_INVENTORY.md)
- [Tutorial Design Research](docs/research/TUTORIAL_DESIGN_RESEARCH.md)
- [Accessibility Guide](docs/guides/ACCESSIBILITY_GUIDE.md)
