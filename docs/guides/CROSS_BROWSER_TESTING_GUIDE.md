# Cross-Browser Testing Guide — v1.2.0

**Version**: v1.2.0  
**Last Updated**: 2026-01-13  
**Purpose**: Ensure consistent functionality across all supported browsers

---

## 🎯 Overview

This guide provides step-by-step instructions for testing the OpenSCAD Web Customizer Forge across different browsers and devices.

---

## 🌐 Supported Browsers

According to `docs/BUILD_PLAN_NEW.md`, we target:

| Browser | Minimum Version | Release Date | Rationale |
|---------|----------------|--------------|-----------|
| **Chrome** | 67+ | 2018 | Web Workers, WASM, ES6 modules |
| **Firefox** | 79+ | 2020 | SharedArrayBuffer support |
| **Safari** | 15.2+ | 2021 | Cross-origin isolation support |
| **Edge** | 79+ | 2020 | Chromium-based |

---

## 📋 Quick Test Script (5 Minutes)

Use this for rapid verification across browsers:

### 1. Initial Load (30 seconds)
1. Open production URL: https://openscad-web-customizer-forge-gutg7h11z.vercel.app
2. ✅ Page loads without errors
3. ✅ Welcome screen displays
4. ✅ No console errors (F12 → Console tab)

### 2. Example Load (1 minute)
1. Click "Try Simple Box" button
2. ✅ Parameters appear (10 params, 3 groups)
3. ✅ Status shows "File loaded successfully"
4. ✅ No console errors

### 3. Auto-Preview (2 minutes)
1. Change "Width" slider from 50 to 60
2. ✅ Status shows "Changes detected..." (yellow)
3. ✅ After debounce (~0.35s default), status shows "Generating preview..." (blue)
4. ✅ After 5-10s, status shows "Preview ready" (green)
5. ✅ 3D preview updates with new geometry
6. ✅ No console errors

### 4. Download (1.5 minutes)
1. Click "Download STL" button
2. ✅ Status shows "Generating full quality STL..."
3. ✅ After 10-30s, download begins
4. ✅ File downloads with name like `simple_box-abc123-20260113.stl`
5. ✅ File size is reasonable (e.g., 50-200 KB)

### 5. Keyboard Navigation (30 seconds)
1. Press Tab key repeatedly
2. ✅ Focus moves through all controls
3. ✅ Focus indicators are visible (3px solid ring)
4. ✅ Can adjust slider with arrow keys
5. ✅ Can activate buttons with Enter/Space

**Total Time**: ~5 minutes per browser

---

## 🖥️ Desktop Browser Testing

### Chrome (Latest)

**Setup:**
1. Download from https://www.google.com/chrome/
2. Open DevTools (F12)
3. Enable "Preserve log" in Console tab

**Test Steps:**
1. Run Quick Test Script (above)
2. Check Performance tab for render times
3. Check Memory tab for memory usage
4. Verify WebGL is working (3D preview)

**Expected Results:**
- ✅ All tests pass
- ✅ Preview render: 2-8s
- ✅ Full render: 10-30s (Simple Box)
- ✅ Memory usage: ~150-200 MB
- ✅ No console errors

**Common Issues:**
- WASM fails to load → Check COOP/COEP headers
- SharedArrayBuffer undefined → Check cross-origin isolation
- Preview doesn't render → Check WebGL support

---

### Firefox (Latest)

**Setup:**
1. Download from https://www.mozilla.org/firefox/
2. Open DevTools (F12)
3. Check Console for errors

**Test Steps:**
1. Run Quick Test Script
2. Verify SharedArrayBuffer is available (not in private mode)
3. Test 3D preview with WebGL

**Expected Results:**
- ✅ All tests pass
- ✅ Performance similar to Chrome
- ✅ No Firefox-specific errors

**Common Issues:**
- SharedArrayBuffer disabled in private mode → Use normal mode
- WASM loads slower → Expected, Firefox WASM is slightly slower
- WebGL warnings → Usually safe to ignore

**Firefox-Specific Checks:**
```javascript
// In browser console
typeof SharedArrayBuffer !== 'undefined'  // Should be true
```

---

### Safari (15.2+)

**Setup:**
1. macOS only (or iOS Safari for mobile)
2. Enable Develop menu: Safari → Preferences → Advanced → Show Develop menu
3. Open Web Inspector (Cmd+Option+I)

**Test Steps:**
1. Run Quick Test Script
2. Check for Safari-specific WASM issues
3. Test file picker (system modal)

**Expected Results:**
- ✅ All tests pass
- ✅ Performance acceptable (may be slightly slower)
- ✅ File picker works correctly
- ✅ No Safari-specific errors

**Common Issues:**
- WASM fails to load → Check Safari version (15.2+)
- File picker looks different → Expected, system modal
- WebGL performance slower → Expected on older Macs

**Safari-Specific Checks:**
- Check "Develop" → "Experimental Features" → Ensure WebAssembly features enabled
- Check cross-origin isolation headers in Network tab

---

### Edge (Latest)

**Setup:**
1. Download from https://www.microsoft.com/edge
2. Open DevTools (F12)
3. Edge is Chromium-based, should behave like Chrome

**Test Steps:**
1. Run Quick Test Script
2. Verify identical behavior to Chrome

**Expected Results:**
- ✅ All tests pass
- ✅ Performance identical to Chrome
- ✅ No Edge-specific issues

**Common Issues:**
- Should be minimal, Edge uses Chromium engine

---

## 📱 Mobile Browser Testing

### iOS Safari (iPhone/iPad)

**Setup:**
1. iPhone or iPad with iOS 15.2+
2. Open Safari browser
3. Navigate to production URL

**Test Steps:**
1. **Initial Load**
   - ✅ Page loads without errors
   - ✅ Layout is responsive (mobile-friendly)
   - ✅ Touch targets are large enough (44x44px)

2. **Example Load**
   - ✅ Tap "Try Simple Box" button
   - ✅ Parameters appear
   - ✅ Scrolling works smoothly

3. **Parameter Adjustment**
   - ✅ Tap slider, drag thumb
   - ✅ Tap dropdown, select option
   - ✅ Tap toggle, switches state
   - ✅ All touch interactions work

4. **Auto-Preview**
   - ✅ Change parameter
   - ✅ Preview renders (may be slower, 10-20s)
   - ✅ 3D preview updates

5. **3D Preview Controls**
   - ✅ One-finger drag rotates model
   - ✅ Two-finger pinch zooms
   - ✅ Two-finger drag pans
   - ✅ Gestures are smooth

6. **Download**
   - ✅ Tap "Download STL" button
   - ✅ File downloads (may prompt for location)
   - ✅ File can be opened in Files app

**Expected Results:**
- ✅ All core functionality works
- ✅ Performance acceptable (slower than desktop)
- ✅ Touch interactions smooth
- ⚠️ Render times 2-3x slower than desktop (expected)

**iOS-Specific Issues:**
- File picker is system modal (different UI) → Expected
- Memory limits lower (256MB) → May fail on complex models
- Preview render slower → Expected on mobile
- Download prompts for location → iOS behavior

**iOS Testing Checklist:**
- [ ] iPhone (small screen)
- [ ] iPad (tablet layout)
- [ ] Portrait orientation
- [ ] Landscape orientation

---

### Android Chrome (Phone/Tablet)

**Setup:**
1. Android device with Chrome browser
2. Navigate to production URL

**Test Steps:**
1. **Initial Load**
   - ✅ Page loads without errors
   - ✅ Layout is responsive
   - ✅ Touch targets are large enough

2. **Example Load**
   - ✅ Tap "Try Simple Box" button
   - ✅ Parameters appear
   - ✅ Scrolling works smoothly

3. **Parameter Adjustment**
   - ✅ All touch interactions work
   - ✅ Sliders respond to touch
   - ✅ Dropdowns work correctly

4. **Auto-Preview**
   - ✅ Preview renders (may be slower)
   - ✅ 3D preview updates

5. **3D Preview Controls**
   - ✅ Touch gestures work (rotate, zoom, pan)

6. **Download**
   - ✅ File downloads to Downloads folder
   - ✅ Notification appears

**Expected Results:**
- ✅ All core functionality works
- ✅ Performance similar to iOS Safari
- ✅ Download works correctly

**Android-Specific Issues:**
- Download notification → Expected Android behavior
- Back button behavior → Should work correctly
- Keyboard appears for text inputs → Expected

---

## 🧪 Feature-Specific Testing

### Auto-Preview System (v1.2.0)

**Test Debounce:**
1. Load Simple Box
2. Rapidly change Width slider (multiple times within the debounce window ~0.35s)
3. ✅ Only one render triggers (after the debounce window of no changes)
4. ✅ Status shows "Changes detected..." during debounce

**Test Caching:**
1. Change Width from 50 → 60, wait for preview
2. Change Width from 60 → 70, wait for preview
3. Change Width from 70 → 60 (back to previous)
4. ✅ Preview loads instantly from cache (< 1s)
5. ✅ Status shows "Preview ready" immediately

**Test Quality Tiers:**
1. Change parameter, wait for auto-preview
2. Note preview render time (should be 2-8s)
3. Click "Download STL"
4. Note full render time (should be 10-30s)
5. ✅ Full render takes longer (higher quality)

**Test State Indicators:**
1. Change parameter
2. ✅ Status shows yellow "Changes detected..."
3. ✅ After debounce (~0.35s default), status shows blue "Generating preview..."
4. ✅ After render, status shows green "Preview ready"
5. Change parameter again
6. ✅ Status shows yellow "Preview outdated" (stale)

---

### URL Parameters (v1.1.0)

**Test URL Encoding:**
1. Load example, change 3 parameters
2. Check URL hash (should contain encoded params)
3. Copy URL
4. Open in new tab/window
5. ✅ Parameters match original values
6. ✅ Preview renders automatically

**Test Share Link:**
1. Click "Copy Share Link" button
2. ✅ Success message appears
3. Paste URL in new tab
4. ✅ Parameters restored correctly

---

### Keyboard Shortcuts (v1.1.0)

**Test Shortcuts:**
1. Load example
2. Press `Ctrl/Cmd + Enter`
3. ✅ STL generation starts
4. After completion, press `D`
5. ✅ STL downloads
6. Change parameters, press `R`
7. ✅ Parameters reset to defaults

---

### localStorage Persistence (v1.1.0)

**Test Auto-Save:**
1. Load example, change parameters
2. Wait 2 seconds (auto-save debounce)
3. Refresh page (F5)
4. ✅ "Resume Draft" button appears
5. Click button
6. ✅ Parameters restored

**Test Export:**
1. Click "Export Parameters" button
2. ✅ JSON file downloads
3. Open file
4. ✅ Contains current parameter values in JSON format

---

## 🐛 Common Issues and Solutions

### WASM Fails to Load

**Symptoms:**
- Error: "Failed to load OpenSCAD engine"
- Console error about WASM

**Solutions:**
1. Check COOP/COEP headers (Network tab)
2. Verify browser version meets minimum
3. Try different browser
4. Check if SharedArrayBuffer is available

**Debug:**
```javascript
// In browser console
typeof WebAssembly !== 'undefined'  // Should be true
typeof SharedArrayBuffer !== 'undefined'  // Should be true
```

---

### Preview Doesn't Render

**Symptoms:**
- 3D preview stays blank
- No errors in console

**Solutions:**
1. Check WebGL support: Visit https://get.webgl.org/
2. Update graphics drivers
3. Try different browser
4. Check if hardware acceleration is enabled

**Debug:**
```javascript
// In browser console
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
console.log(gl ? 'WebGL supported' : 'WebGL not supported');
```

---

### Render Timeout

**Symptoms:**
- Error: "This model is taking too long..."
- Render stops after 60 seconds

**Solutions:**
1. Reduce model complexity
2. Lower $fn value
3. Simplify geometry
4. Try on faster device

---

### File Upload Fails

**Symptoms:**
- File doesn't load
- Error about file type

**Solutions:**
1. Verify file is .scad extension
2. Check file size (< 5MB)
3. Verify file has Customizer annotations
4. Try example models first

---

## 📊 Test Results Template

**Browser**: _____________  
**Version**: _____________  
**OS**: _____________  
**Date**: _____________  
**Tester**: _____________

### Quick Test Results

| Test | Status | Time | Notes |
|------|--------|------|-------|
| Initial Load | ☐ Pass ☐ Fail | _____ | |
| Example Load | ☐ Pass ☐ Fail | _____ | |
| Auto-Preview | ☐ Pass ☐ Fail | _____ | |
| Download | ☐ Pass ☐ Fail | _____ | |
| Keyboard Nav | ☐ Pass ☐ Fail | _____ | |

### Performance Metrics

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Initial Load | < 3s | _____ | |
| WASM Init | < 10s | _____ | |
| Preview Render | 2-8s | _____ | |
| Full Render | 10-30s | _____ | |

### Issues Found

| Issue | Severity | Description | Reproducible |
|-------|----------|-------------|--------------|
| 1 | | | ☐ Yes ☐ No |
| 2 | | | ☐ Yes ☐ No |

### Overall Assessment

☐ **PASS** - All tests passed, no issues  
☐ **PASS WITH WARNINGS** - Minor issues, documented above  
☐ **FAIL** - Critical issues prevent use

---

## 📚 Resources

- **Production URL**: https://openscad-web-customizer-forge-gutg7h11z.vercel.app
- **Build Plan**: docs/BUILD_PLAN_NEW.md (Browser Requirements section)
- **Production Checklist**: PRODUCTION_VERIFICATION_CHECKLIST.md
- **Browser Compatibility Matrix**: docs/BUILD_PLAN_NEW.md (lines 442-456)

---

## 🎯 Next Steps

After completing cross-browser testing:

1. **Document Results** - Fill in test results template for each browser
2. **Report Issues** - Create GitHub issues for any failures
3. **Update Documentation** - Add any browser-specific notes to README
4. **Sign Off** - Mark testing complete in PRODUCTION_VERIFICATION_CHECKLIST.md

---

**Guide Version**: 1.0  
**Last Updated**: 2026-01-13  
**Next Review**: After v1.3 release
