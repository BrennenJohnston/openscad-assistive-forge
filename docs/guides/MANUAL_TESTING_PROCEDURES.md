# Manual Testing Procedures — v3.1.0

**Version**: v3.1.0  
**Last Updated**: 2026-01-18  
**Purpose**: Detailed step-by-step testing procedures for all features

---

## 📋 Table of Contents

1. [Initial Setup](#initial-setup)
2. [Core Features Testing](#core-features-testing)
3. [Auto-Preview Testing](#auto-preview-testing)
4. [Legacy Features Testing](#legacy-features-testing)
5. [Accessibility Testing](#accessibility-testing)
6. [Error Handling Testing](#error-handling-testing)
7. [Performance Testing](#performance-testing)
8. [Regression Testing](#regression-testing)

---

## Initial Setup

### Prerequisites

- Modern browser (Chrome 67+, Firefox 79+, Safari 15.2+, Edge 79+)
- Internet connection
- Optional: Screen reader (NVDA, VoiceOver) for accessibility testing
- Optional: Mobile device for mobile testing

### Access Production Environment

1. Open browser
2. Navigate to: https://openscad-web-customizer-forge.pages.dev
3. Open DevTools (F12)
4. Check Console tab for any errors
5. Verify page loads without errors

**Expected Result:**
- ✅ Welcome screen displays
- ✅ Role-based Quick Start cards visible (Educators/Facilitators, Advanced Makers, Keyboard-Only, Low Vision, Voice Input, Screen Reader)
- ✅ "Start Tutorial" buttons visible on each card
- ✅ File upload zone visible
- ✅ No console errors
- ✅ No network request failures

---

## Core Features Testing

### Test 1: File Upload via Drag-and-Drop

**Objective:** Verify drag-and-drop file upload works correctly

**Steps:**
1. Locate a `.scad` file on your computer (or use example from `public/examples/`)
2. Drag file over the upload zone
3. Observe hover state (should show visual feedback)
4. Drop file

**Expected Result:**
- ✅ Hover state activates (border changes color)
- ✅ File loads successfully
- ✅ Status shows "File loaded: [filename]"
- ✅ Parameters appear in left panel
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:** _________________________________

---

### Test 2: File Upload via File Picker

**Objective:** Verify file picker fallback works

**Steps:**
1. Click "Choose File" button (or click upload zone)
2. System file picker opens
3. Navigate to `.scad` file
4. Select file, click "Open"

**Expected Result:**
- ✅ File picker opens
- ✅ File loads after selection
- ✅ Same behavior as drag-and-drop
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 3: Example Model Loading (Quick Start Cards)

**Objective:** Verify example models load correctly via the role-based Quick Start cards

**Steps:**

#### Simple Box
1. In the **Educators / Facilitators** card, click "Start Tutorial"
2. Wait for file to load

**Expected Result:**
- ✅ File loads successfully
- ✅ Parameters appear
- ✅ Status shows "File loaded: simple_box.scad"
- ✅ No console errors

#### Parametric Cylinder
1. In the **Keyboard-Only Users** card, click "Start Tutorial"
2. Wait for file to load

**Expected Result:**
- ✅ File loads successfully
- ✅ Parameters appear
- ✅ No console errors

#### Library Test
1. In the **Advanced Makers** card, click "Start Tutorial"
2. Wait for file to load

**Expected Result:**
- ✅ File loads successfully
- ✅ Libraries panel appears (if required)
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 4: Parameter UI Controls

**Objective:** Verify all parameter control types work correctly

**Setup:** Load Simple Box example

#### Range Slider
1. Locate "Width" parameter (should be a slider)
2. Click and drag slider thumb
3. Observe value display updates
4. Release mouse

**Expected Result:**
- ✅ Slider thumb moves smoothly
- ✅ Value display updates in real-time
- ✅ Value stays within min/max range (10-100)
- ✅ No console errors

#### Number Input
1. Locate number input for "Width"
2. Click input field
3. Type new value (e.g., "75")
4. Press Enter or Tab

**Expected Result:**
- ✅ Input accepts numeric value
- ✅ Value updates after Enter/Tab
- ✅ Slider position updates to match
- ✅ Invalid values rejected (e.g., "abc", "999")

#### Dropdown Select
1. Locate "Shape" parameter (dropdown)
2. Click dropdown
3. Select different option

**Expected Result:**
- ✅ Dropdown opens
- ✅ All options visible
- ✅ Selection updates
- ✅ Dropdown closes after selection

#### Toggle Switch
1. Locate "Hollow" parameter (toggle)
2. Click toggle

**Expected Result:**
- ✅ Toggle switches state (yes ↔ no)
- ✅ Visual state changes (on/off)
- ✅ Value updates in state

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 5: Parameter Groups

**Objective:** Verify collapsible groups work

**Setup:** Load a multi-group model (e.g., Universal Cuff via file upload)

**Steps:**
1. Locate "Dimensions" group header
2. Click header to collapse
3. Observe parameters hide
4. Click header again to expand
5. Repeat for other groups

**Expected Result:**
- ✅ Group collapses (parameters hidden)
- ✅ Group expands (parameters visible)
- ✅ Chevron icon rotates
- ✅ Other groups unaffected
- ✅ State persists during session

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 6: Reset to Defaults

**Objective:** Verify reset functionality

**Setup:** Load Simple Box

**Steps:**
1. Change 3-5 parameters to non-default values
2. Note current values
3. Click "Reset to Defaults" button
4. Observe parameters return to original values

**Expected Result:**
- ✅ All parameters reset to defaults
- ✅ UI controls update to show default values
- ✅ Status shows "Parameters reset to defaults"
- ✅ Preview updates automatically (if auto-preview enabled)

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 7: Manual STL Generation

**Objective:** Verify manual STL generation works

**Setup:** Load Simple Box

**Steps:**
1. Click "Generate STL" button
2. Observe status updates
3. Wait for completion (10-30s)
4. Check for success message

**Expected Result:**
- ✅ Button shows "Generating..." state (disabled)
- ✅ Status shows "Generating STL..." with progress
- ✅ Progress indicator visible
- ✅ After completion, status shows "STL ready"
- ✅ "Download STL" button enabled
- ✅ 3D preview updates with model
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Render Time:** _______ seconds

---

### Test 8: STL Download

**Objective:** Verify STL file download works

**Setup:** After Test 7 (STL generated)

**Steps:**
1. Click "Download STL" button
2. Wait for download to start
3. Locate downloaded file
4. Check filename format
5. Check file size

**Expected Result:**
- ✅ Download starts immediately
- ✅ Filename format: `simple_box-[hash]-[date].stl`
- ✅ File size reasonable (e.g., 50-200 KB for Simple Box)
- ✅ File can be opened in slicer software (optional verification)
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Filename:** _________________________________  
**File Size:** _______ KB

---

### Test 9: 3D Preview

**Objective:** Verify 3D preview displays and controls work

**Setup:** After STL generation

**Steps:**

#### Display
1. Observe 3D preview panel
2. Verify model is visible
3. Check lighting and shading

**Expected Result:**
- ✅ Model displays correctly
- ✅ Camera auto-fits to model bounds
- ✅ Grid helper visible
- ✅ Lighting looks professional
- ✅ No rendering artifacts

#### Orbit Controls
1. Left-click and drag → Rotate
2. Right-click and drag → Pan
3. Scroll wheel → Zoom

**Expected Result:**
- ✅ Rotation smooth and responsive
- ✅ Pan works correctly
- ✅ Zoom in/out works
- ✅ Controls feel natural
- ✅ No lag or stuttering

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Auto-Preview Testing

### Test 10: Auto-Preview Trigger

**Objective:** Verify auto-preview triggers after parameter change

**Setup:** Load Simple Box

**Steps:**
1. Change "Width" slider from 50 to 60
2. Release mouse
3. Observe status immediately
4. Wait ~1.5 seconds (default debounce; allow up to 2.5s on slower devices)
5. Observe status change
6. Wait for render to complete

**Expected Result:**
- ✅ Immediately after change: Status shows "Changes detected - preview updating..." (yellow indicator)
- ✅ After debounce: Status shows "Generating preview..." (blue indicator)
- ✅ After 2-8s: Status shows "Preview ready" (green indicator)
- ✅ 3D preview updates with new geometry
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Preview Render Time:** _______ seconds

---

### Test 11: Auto-Preview Debounce

**Objective:** Verify debounce prevents excessive renders

**Setup:** Load Simple Box

**Steps:**
1. Rapidly change "Width" slider multiple times (within the debounce window ~1.5s)
2. Release mouse
3. Observe status
4. Wait ~1.5 seconds (default debounce; allow up to 2.5s on slower devices)
5. Verify only ONE render triggers

**Expected Result:**
- ✅ Status shows "Changes detected..." during rapid changes
- ✅ Timer resets with each change
- ✅ Only one render starts after the debounce window of inactivity
- ✅ No multiple renders triggered
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 12: Render Cache

**Objective:** Verify render caching works

**Setup:** Load Simple Box

**Steps:**
1. Change "Width" from 50 to 60
2. Wait for preview to render (note time)
3. Change "Width" from 60 to 70
4. Wait for preview to render
5. Change "Width" from 70 back to 60
6. Observe immediate cache hit

**Expected Result:**
- ✅ First render (50→60): Takes 2-8 seconds
- ✅ Second render (60→70): Takes 2-8 seconds
- ✅ Cache hit (70→60): Loads instantly (< 1 second)
- ✅ Status shows "Preview ready" immediately on cache hit
- ✅ 3D preview updates instantly
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**First Render Time:** _______ seconds  
**Cache Hit Time:** _______ seconds

---

### Test 13: Progressive Quality Tiers

**Objective:** Verify preview quality is lower than full quality

**Setup:** Load Simple Box

**Steps:**
1. Change a parameter
2. Wait for auto-preview to complete
3. Note preview render time
4. Click "Download STL" button
5. Wait for full quality render
6. Note full render time
7. Compare times and visual quality

**Expected Result:**
- ✅ Preview render: 2-8 seconds
- ✅ Full render: 10-30 seconds (longer)
- ✅ Full render produces higher quality STL
- ✅ Visual difference noticeable (smoother curves in full quality)
- ✅ Status clearly indicates "Generating full quality STL..."

**Pass/Fail:** ☐ Pass ☐ Fail

**Preview Time:** _______ seconds  
**Full Quality Time:** _______ seconds

---

### Test 14: Visual State Indicators

**Objective:** Verify all preview states display correctly

**Setup:** Load Simple Box

**Steps:**

#### Idle State
1. Initial load (no preview yet)
2. Observe status

**Expected:** ✅ Status shows "Upload a model to begin" or similar

#### Pending State
1. Change parameter
2. Observe status immediately

**Expected:** ✅ Yellow indicator, "Changes detected - preview updating..."

#### Rendering State
1. Wait ~1.5s after parameter change (default debounce)
2. Observe status

**Expected:** ✅ Blue indicator, "Generating preview...", spinner visible

#### Current State
1. Wait for render to complete
2. Observe status

**Expected:** ✅ Green indicator, "Preview ready", checkmark icon

#### Stale State
1. After preview is current, change parameter again
2. Observe status immediately

**Expected:** ✅ Yellow indicator, "Preview outdated - parameters changed"

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 15: Smart Download Button

**Objective:** Verify download button logic is correct

**Setup:** Load Simple Box

**Steps:**

#### Scenario 1: Preview Current, No Full Quality
1. Change parameter, wait for preview
2. Observe button label

**Expected:** ✅ Button says "Download STL (Preview Quality)" or "Generate Full Quality"

#### Scenario 2: Full Quality Available
1. Click download button, wait for full render
2. Observe button label after completion

**Expected:** ✅ Button says "Download STL"

#### Scenario 3: Parameters Changed After Full Quality
1. After full quality render, change parameter
2. Wait for preview
3. Observe button label

**Expected:** ✅ Button says "Download STL (Preview Quality)" or "Generate Full Quality"

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Legacy Features Testing

### Test 16: URL Parameters

**Objective:** Verify URL parameter persistence works

**Setup:** Load Simple Box

**Steps:**
1. Change 3 parameters to non-default values
2. Check URL hash (should contain encoded params)
3. Copy URL from address bar
4. Open new browser tab
5. Paste URL and press Enter
6. Verify parameters match original

**Expected Result:**
- ✅ URL hash updates after parameter changes
- ✅ Hash contains encoded parameter data
- ✅ New tab loads with correct parameter values
- ✅ Preview renders automatically with new parameters
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 17: Copy Share Link

**Objective:** Verify share link button works

**Setup:** Load Simple Box, change parameters

**Steps:**
1. Click "Copy Share Link" button
2. Observe success message
3. Open new tab
4. Paste (Ctrl+V) into address bar
5. Press Enter
6. Verify parameters restored

**Expected Result:**
- ✅ Success message appears: "Link copied to clipboard!"
- ✅ URL is copied to clipboard
- ✅ Pasted URL loads page with parameters
- ✅ Parameters match original values

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 18: localStorage Persistence

**Objective:** Verify draft auto-save works

**Setup:** Load Simple Box

**Steps:**
1. Change 3 parameters
2. Wait 2 seconds (auto-save debounce)
3. Refresh page (F5)
4. Observe "Resume Draft" button
5. Click button
6. Verify parameters restored

**Expected Result:**
- ✅ After 2s, draft saved to localStorage (check DevTools → Application → Local Storage)
- ✅ After refresh, "Resume Draft" button appears
- ✅ Click button restores parameters
- ✅ Preview renders with restored parameters
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 19: Export Parameters JSON

**Objective:** Verify parameter export works

**Setup:** Load Simple Box, change parameters

**Steps:**
1. Click "Export Parameters" button
2. Wait for download
3. Locate downloaded JSON file
4. Open file in text editor
5. Verify contents

**Expected Result:**
- ✅ JSON file downloads
- ✅ Filename format: `simple_box_parameters_[date].json`
- ✅ File contains valid JSON
- ✅ JSON includes all current parameter values
- ✅ Format is readable

**Pass/Fail:** ☐ Pass ☐ Fail

**Sample JSON:**
```json
{
  "width": 60,
  "height": 40,
  "depth": 30,
  ...
}
```

---

### Test 20: Keyboard Shortcuts

**Objective:** Verify all keyboard shortcuts work

**Setup:** Load Simple Box

#### Ctrl/Cmd + Enter (Generate STL)
1. Press `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac)
2. Observe STL generation starts

**Expected:** ✅ Manual STL generation triggers

#### R (Reset)
1. Change parameters
2. Press `R` key
3. Observe parameters reset

**Expected:** ✅ All parameters reset to defaults

#### D (Download)
1. After STL generated, press `D` key
2. Observe download starts

**Expected:** ✅ STL file downloads

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Accessibility Testing

### Test 21: Keyboard Navigation

**Objective:** Verify full keyboard accessibility

**Setup:** Load Simple Box

**Steps:**
1. Press Tab key repeatedly
2. Observe focus moves through all controls
3. Verify focus indicators visible
4. Test all control types with keyboard:
   - Sliders: Arrow keys adjust value
   - Dropdowns: Arrow keys navigate, Enter selects
   - Toggles: Space toggles state
   - Buttons: Enter/Space activates
   - Groups: Enter/Space expands/collapses

**Expected Result:**
- ✅ Tab order is logical (top-to-bottom, left-to-right)
- ✅ All interactive elements focusable
- ✅ Focus indicators visible (3px solid ring)
- ✅ No focus traps
- ✅ All controls keyboard operable
- ✅ Shift+Tab moves backward

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 22: Skip Link

**Objective:** Verify skip-to-content link works

**Setup:** Fresh page load

**Steps:**
1. Press Tab key once (first tab on page)
2. Observe skip link appears
3. Press Enter
4. Verify focus jumps to main content

**Expected Result:**
- ✅ Skip link appears on first Tab
- ✅ Link text: "Skip to main content" or similar
- ✅ Enter key activates link
- ✅ Focus moves to main content area
- ✅ Skip link hides after use

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 23: Screen Reader (NVDA/VoiceOver)

**Objective:** Verify screen reader compatibility

**Setup:** Enable screen reader, load Simple Box

**Steps:**
1. Navigate through page with screen reader
2. Verify all controls have labels
3. Verify status updates are announced
4. Verify ARIA roles correct

**Expected Result:**
- ✅ All inputs have descriptive labels
- ✅ Labels are read aloud
- ✅ Status changes announced (live region)
- ✅ Errors announced (alert role)
- ✅ Groups have proper headings
- ✅ Navigation is logical

**Pass/Fail:** ☐ Pass ☐ Fail

**Screen Reader Used:** ☐ NVDA ☐ VoiceOver ☐ JAWS ☐ Other: _______

---

### Test 24: Color Contrast

**Objective:** Verify WCAG AA color contrast

**Setup:** Use browser DevTools or contrast checker

**Steps:**
1. Check text on background (body text, labels)
2. Check UI elements (buttons, inputs, borders)
3. Verify contrast ratios meet WCAG AA:
   - Text: 4.5:1 minimum
   - UI elements: 3:1 minimum

**Expected Result:**
- ✅ All text meets 4.5:1 contrast
- ✅ All UI elements meet 3:1 contrast
- ✅ Focus indicators meet 3:1 contrast
- ✅ Both light and dark mode meet requirements

**Pass/Fail:** ☐ Pass ☐ Fail

**Tool Used:** ☐ DevTools ☐ WebAIM Contrast Checker ☐ Other: _______

---

### Test 25: Forced Colors Mode (Windows High Contrast)

**Objective:** Verify UI remains usable in Windows High Contrast mode

**Setup:** Enable Windows High Contrast (Windows Settings → Ease of Access → High Contrast)

**Steps:**
1. Test all 4 default Windows High Contrast themes
2. For each theme, verify all text readable, buttons visible, focus indicators visible

**Expected Result:**
- ✅ All UI elements visible in all 4 themes
- ✅ Borders use system colors
- ✅ Focus outlines visible (not box-shadow)
- ✅ SVG icons remain visible

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 26: Camera Keyboard Controls

**Objective:** Verify keyboard alternatives for 3D camera (WCAG 2.2 SC 2.5.7)

**Setup:** Load Simple Box with 3D preview

**Steps:**
1. Focus 3D preview
2. Test Arrow keys (rotate), Shift+Arrows (pan), +/- (zoom)
3. Verify on-screen control buttons present and working (rotate, pan, zoom, reset)

**Expected Result:**
- ✅ Arrow keys rotate camera
- ✅ Shift+Arrows pan camera  
- ✅ +/- zoom camera
- ✅ On-screen control buttons visible (rotate, pan, zoom, reset)
- ✅ Controls are keyboard accessible

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 27: Screen Reader Announcements

**Objective:** Verify dedicated SR live region

**Setup:** Enable screen reader (NVDA/VoiceOver)

**Steps:**
1. Change parameter → verify announcement
2. Rapidly move slider → verify debounced announcements
3. Use camera controls → verify actions announced

**Expected Result:**
- ✅ Parameter changes announced
- ✅ Rapid changes debounced (1.5s)
- ✅ Visible status doesn't flicker
- ✅ Camera actions announced

**Screen Reader:** ☐ NVDA ☐ VoiceOver ☐ JAWS

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 28: Focus Not Obscured (WCAG 2.2 SC 2.4.11)

**Objective:** Verify focus not hidden by sticky headers

**Steps:**
1. Tab through all parameters
2. Verify focused elements not obscured by panel header
3. Check scroll-margin brings elements into view

**Expected Result:**
- ✅ All focused elements visible
- ✅ No focus hidden behind sticky UI
- ✅ Scroll-margin works correctly

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Platform + AT Testing Matrix

### Required Test Combinations (must pass before release)

| Platform | Browser | Assistive Technology | Check Count | Pass/Fail |
|----------|---------|---------------------|-------------|-----------|
| Windows | Firefox | NVDA | 5 | ☐ Pass ☐ Fail |
| Windows | Edge | NVDA | 3 | ☐ Pass ☐ Fail |
| Windows | Edge | High Contrast (all 4 themes) | 4 | ☐ Pass ☐ Fail |
| Windows | Chrome | Keyboard only | 5 | ☐ Pass ☐ Fail |
| macOS | Safari | VoiceOver | 5 | ☐ Pass ☐ Fail |
| macOS | Chrome | VoiceOver | 3 | ☐ Pass ☐ Fail |
| iOS | Safari | VoiceOver | 3 | ☐ Pass ☐ Fail |

### Optional Test Combinations (recommended)

| Platform | Browser | Assistive Technology | Check Count | Pass/Fail |
|----------|---------|---------------------|-------------|-----------|
| Windows | Chrome | JAWS | 3 | ☐ Pass ☐ Fail |
| Windows | Any | Dragon NaturallySpeaking | 3 | ☐ Pass ☐ Fail |
| Windows | Any | Windows Voice Control | 3 | ☐ Pass ☐ Fail |
| macOS | Any | macOS Voice Control | 3 | ☐ Pass ☐ Fail |
| Android | Chrome | TalkBack | 3 | ☐ Pass ☐ Fail |

### Windows High Contrast Theme Matrix

Test each of the 4 default Windows High Contrast themes:

| Theme | Text Readable | Focus Visible | Buttons Visible | Pass/Fail |
|-------|--------------|---------------|-----------------|-----------|
| High Contrast #1 (white text on black) | ☐ | ☐ | ☐ | ☐ Pass ☐ Fail |
| High Contrast #2 (black text on white) | ☐ | ☐ | ☐ | ☐ Pass ☐ Fail |
| High Contrast Black | ☐ | ☐ | ☐ | ☐ Pass ☐ Fail |
| High Contrast White | ☐ | ☐ | ☐ | ☐ Pass ☐ Fail |

### Detailed AT Check Lists

#### NVDA + Firefox/Edge (5 checks)

1. ☐ All parameter labels announced correctly
2. ☐ Tooltips read when help button focused
3. ☐ Parameter value changes announced (debounced)
4. ☐ Modal focus trapped and announced
5. ☐ Workflow progress steps announced on change

#### VoiceOver + Safari (5 checks)

1. ☐ Landmark navigation works (main, navigation)
2. ☐ All form controls have accessible names
3. ☐ Live regions announce status changes
4. ☐ Modal dialogs have proper role and focus
5. ☐ 3D preview controls announced

#### Keyboard Navigation (5 checks)

1. ☐ Tab order is logical (top-to-bottom, left-to-right)
2. ☐ All interactive elements focusable
3. ☐ Focus indicators visible (min 3px)
4. ☐ No focus traps (except intended modal traps)
5. ☐ All actions keyboard operable (Enter/Space)

#### Voice Control (3 checks)

1. ☐ All buttons addressable by visible label
2. ☐ Form inputs activatable by name
3. ☐ "Show numbers" overlay works correctly

---

## Error Handling Testing

### Test 25: Invalid File Type

**Objective:** Verify error handling for wrong file type

**Steps:**
1. Try to upload a `.txt` file
2. Observe error message

**Expected Result:**
- ✅ Error message: "This doesn't appear to be a valid .scad file"
- ✅ Message is user-friendly
- ✅ UI remains functional
- ✅ Can upload correct file after error

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 26: File Too Large

**Objective:** Verify error handling for oversized files

**Steps:**
1. Try to upload a file > 5MB
2. Observe error message

**Expected Result:**
- ✅ Error message: "File exceeds 5MB limit"
- ✅ Suggestion to reduce file size
- ✅ UI remains functional

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 27: Render Timeout

**Objective:** Verify timeout handling

**Setup:** Load complex model with very high $fn (if available)

**Steps:**
1. Set parameters that will cause long render
2. Click "Generate STL"
3. Wait 60 seconds
4. Observe timeout error

**Expected Result:**
- ✅ After 60s, render stops
- ✅ Error message: "This model is taking too long..."
- ✅ Suggestion to reduce complexity
- ✅ UI remains functional
- ✅ Can retry with different parameters

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 28: OpenSCAD Syntax Error

**Objective:** Verify error handling for malformed .scad

**Setup:** Create or upload .scad with syntax error

**Steps:**
1. Upload .scad with syntax error (e.g., missing semicolon)
2. Try to generate STL
3. Observe error message

**Expected Result:**
- ✅ Error message includes OpenSCAD error
- ✅ Error is translated to user-friendly language
- ✅ Line number shown (if available)
- ✅ UI remains functional

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Performance Testing

### Test 29: Initial Load Time

**Objective:** Measure initial page load performance

**Steps:**
1. Clear browser cache
2. Open DevTools → Network tab
3. Navigate to production URL
4. Record DOMContentLoaded time
5. Record Load time

**Expected Result:**
- ✅ DOMContentLoaded: < 3s
- ✅ Load (before WASM): < 5s
- ✅ First Contentful Paint: < 2s

**Pass/Fail:** ☐ Pass ☐ Fail

**DOMContentLoaded:** _______ ms  
**Load:** _______ ms  
**FCP:** _______ ms

---

### Test 30: WASM Initialization Time

**Objective:** Measure WASM load time

**Steps:**
1. Load Simple Box example
2. Start timer when file uploaded
3. Stop timer when status shows "Ready"

**Expected Result:**
- ✅ WASM initialization: < 10s on cable
- ✅ Progress indicator shown during load

**Pass/Fail:** ☐ Pass ☐ Fail

**Init Time:** _______ seconds

---

### Test 31: Render Performance

**Objective:** Measure render times for different models

**Simple Box:**
- Preview quality: _______ seconds (target: 2-8s)
- Full quality: _______ seconds (target: 10-30s)

**Parametric Cylinder:**
- Preview quality: _______ seconds (target: 3-10s)
- Full quality: _______ seconds (target: 15-40s)

**Universal Cuff:**
- Preview quality: _______ seconds (target: 5-15s)
- Full quality: _______ seconds (target: 30-60s)

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 32: Memory Usage

**Objective:** Verify no memory leaks

**Steps:**
1. Open DevTools → Performance Monitor
2. Load example
3. Generate STL 5 times with different parameters
4. Monitor memory usage
5. Check for significant growth

**Expected Result:**
- ✅ Baseline (page loaded): ~50-100 MB
- ✅ With WASM: ~150-200 MB
- ✅ After 5 renders: < 300 MB (no significant leak)

**Pass/Fail:** ☐ Pass ☐ Fail

**Baseline:** _______ MB  
**After 5 renders:** _______ MB  
**Growth:** _______ MB

---

## Regression Testing

### Test 33: v1.0 Core Features

**Objective:** Verify original features still work

- [ ] File upload (drag-and-drop)
- [ ] File upload (file picker)
- [ ] Parameter extraction
- [ ] UI generation (all control types)
- [ ] Manual STL generation
- [ ] STL download
- [ ] 3D preview
- [ ] Orbit controls

**Pass/Fail:** ☐ Pass ☐ Fail

---

### Test 34: v1.1 Features

**Objective:** Verify v1.1 features still work

- [ ] URL parameters
- [ ] Copy Share Link
- [ ] localStorage persistence
- [ ] Export Parameters JSON
- [ ] Keyboard shortcuts (Ctrl+Enter, R, D)
- [ ] All 3 example models

**Pass/Fail:** ☐ Pass ☐ Fail

---

## Test Summary

**Testing Date:** _____________  
**Tester:** _____________  
**Browser:** _____________  
**Version:** _____________  
**OS:** _____________

### Results Overview

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Core Features | 9 | | | |
| Auto-Preview (v1.2) | 6 | | | |
| v1.1 Features | 5 | | | |
| Accessibility | 4 | | | |
| Error Handling | 4 | | | |
| Performance | 4 | | | |
| Regression | 2 | | | |
| **TOTAL** | **34** | | | |

### Overall Status

☐ **PASS** - All tests passed  
☐ **PASS WITH WARNINGS** - Minor issues found  
☐ **FAIL** - Critical issues found

### Critical Issues

| Issue # | Test # | Description | Severity |
|---------|--------|-------------|----------|
| 1 | | | |
| 2 | | | |

### Recommendations

_____________________________________________  
_____________________________________________  
_____________________________________________

---

**Sign-Off:**

Tester: _____________________ Date: _____________

Reviewer: _____________________ Date: _____________

---

**Document Version**: 3.1  
**Last Updated**: 2026-01-18  
**Next Review**: After v3.2 release
