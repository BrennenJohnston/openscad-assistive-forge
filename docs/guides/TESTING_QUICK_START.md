# Testing Quick Start Guide

**Version**: v1.2.0  
**Last Updated**: 2026-01-13  
**Time Required**: 5-30 minutes

---

## 🎯 Purpose

This guide helps you quickly verify that v1.2.0 is working correctly in production. Choose the testing level based on your available time.

---

## ⚡ 5-Minute Quick Test (Minimum Viable Testing)

**Goal**: Verify core functionality works in production

### Steps

1. **Open Production**
   - URL: https://openscad-web-customizer-forge.pages.dev
   - Press F12 to open DevTools
   - Check Console for errors

2. **Load Example**
   - Click "Try Simple Box"
   - ✅ Parameters appear (10 params)
   - ✅ No console errors

3. **Test Auto-Preview (v1.2.0 Core Feature)**
   - Change "Width" slider from 50 to 60
   - ✅ Status shows "Changes detected..." (yellow)
   - Wait 1.5 seconds
   - ✅ Status shows "Generating preview..." (blue)
   - Wait 5-10 seconds
   - ✅ Status shows "Preview ready" (green)
   - ✅ 3D preview updates

4. **Test Download**
   - Click "Download STL" button
   - Wait 10-30 seconds
   - ✅ File downloads (e.g., `simple_box-abc123-20260113.stl`)

5. **Test Cache**
   - Change Width back to 50
   - ✅ Preview loads instantly (< 1 second)

### Result

☐ **PASS** - All 5 steps completed successfully  
☐ **FAIL** - One or more steps failed (document which ones)

**If PASS**: Production is working! ✅  
**If FAIL**: See [PRODUCTION_VERIFICATION_CHECKLIST.md](PRODUCTION_VERIFICATION_CHECKLIST.md) for detailed troubleshooting

---

## 🌐 15-Minute Cross-Browser Test

**Goal**: Verify compatibility across major browsers

### Steps

Run the 5-Minute Quick Test in each browser:

1. **Chrome** (5 min)
   - ☐ Quick test passed

2. **Firefox** (5 min)
   - ☐ Quick test passed

3. **Safari** (5 min) - macOS only
   - ☐ Quick test passed

4. **Edge** (5 min) - Optional
   - ☐ Quick test passed

### Result

☐ **PASS** - All browsers passed  
☐ **PARTIAL** - Some browsers passed (document which failed)  
☐ **FAIL** - All browsers failed

**If PASS**: Cross-browser compatibility confirmed! ✅  
**If PARTIAL/FAIL**: See [CROSS_BROWSER_TESTING_GUIDE.md](CROSS_BROWSER_TESTING_GUIDE.md) for browser-specific troubleshooting

---

## 📱 30-Minute Comprehensive Test

**Goal**: Full verification including mobile and accessibility

### Steps

1. **Desktop Quick Test** (5 min)
   - Run 5-Minute Quick Test in Chrome

2. **Cross-Browser** (15 min)
   - Run in Firefox, Safari, Edge

3. **Mobile** (5 min)
   - Open on iPhone/iPad or Android
   - Load Simple Box example
   - Change one parameter
   - Verify preview updates

4. **Keyboard Navigation** (5 min)
   - Press Tab key repeatedly
   - ✅ All controls focusable
   - ✅ Focus indicators visible
   - Press `Ctrl+Enter` to generate STL
   - ✅ Shortcut works

### Result

☐ **PASS** - All tests passed  
☐ **FAIL** - One or more tests failed

**If PASS**: Full verification complete! ✅  
**If FAIL**: See [MANUAL_TESTING_PROCEDURES.md](MANUAL_TESTING_PROCEDURES.md) for detailed test cases

---

## 🔍 What to Look For

### ✅ Good Signs
- No console errors
- Status messages update correctly
- Preview renders in 2-8 seconds
- Full quality renders in 10-30 seconds
- Cache hits load instantly (< 1 second)
- 3D preview displays model correctly
- Download produces valid STL file

### ⚠️ Warning Signs
- Console warnings (may be OK if cosmetic)
- Slower render times (may be device-dependent)
- Preview quality looks low (expected for preview tier)

### ❌ Bad Signs
- Console errors (red text)
- Page doesn't load
- Examples don't load
- Preview never renders
- Download fails
- Keyboard navigation broken
- Focus indicators invisible

---

## 🐛 Common Issues

### Issue: "WASM failed to load"
**Solution**: Check COOP/COEP headers in Network tab. Should see:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

### Issue: Preview doesn't render
**Solution**: Check WebGL support at https://get.webgl.org/

### Issue: Render timeout after 60 seconds
**Solution**: Expected for complex models. Try Simple Box instead.

### Issue: Cache doesn't work
**Solution**: Verify parameter values are exactly the same. Cache is sensitive to exact matches.

---

## 📊 Testing Checklist

Use this for quick status tracking:

### Production Verification
- [ ] 5-Minute Quick Test (Chrome)
- [ ] Cross-Browser Test (Firefox, Safari, Edge)
- [ ] Mobile Test (iOS or Android)
- [ ] Keyboard Navigation Test

### v1.2.0 Features
- [ ] Auto-preview triggers on parameter change
- [ ] Debounce works (~0.35 second default delay)
- [ ] Cache works (instant load on repeated values)
- [ ] Progressive quality (preview fast, full quality slower)
- [ ] Visual state indicators (yellow, blue, green)
- [ ] Smart download button (reuses full quality when available)

### v1.1.0 Features
- [ ] URL parameters (share link works)
- [ ] Copy Share Link button
- [ ] localStorage persistence (draft auto-save)
- [ ] Export Parameters JSON
- [ ] Keyboard shortcuts (Ctrl+Enter, R, D)

### Core Features (v1.0)
- [ ] File upload (drag-and-drop)
- [ ] Example loading (all 3 models)
- [ ] Parameter UI (all control types)
- [ ] Manual STL generation
- [ ] STL download
- [ ] 3D preview

---

## 📚 Full Documentation

For more detailed testing:

| Document | Purpose | Time |
|----------|---------|------|
| [PRODUCTION_VERIFICATION_CHECKLIST.md](PRODUCTION_VERIFICATION_CHECKLIST.md) | Complete production checklist | 30 min |
| [CROSS_BROWSER_TESTING_GUIDE.md](CROSS_BROWSER_TESTING_GUIDE.md) | Browser-specific testing | 5 min/browser |
| [MANUAL_TESTING_PROCEDURES.md](MANUAL_TESTING_PROCEDURES.md) | 34 detailed test cases | 2-3 hours |

---

## ✅ Sign-Off

After completing testing, sign off here:

**Tester**: _____________________  
**Date**: _____________________  
**Time Spent**: _____ minutes  
**Tests Completed**: ☐ 5-min ☐ 15-min ☐ 30-min  
**Result**: ☐ PASS ☐ FAIL

**Notes**:
_____________________________________________  
_____________________________________________  
_____________________________________________

---

## 🎯 Next Steps

### If All Tests Pass ✅
1. Mark production as verified
2. Announce v1.2.0 release
3. Monitor for user-reported issues
4. Begin planning v1.3 features

### If Tests Fail ❌
1. Document all failures
2. Create GitHub issues
3. Prioritize fixes (P0 = critical)
4. Fix and redeploy
5. Re-run testing

---

**Quick Start Version**: 1.0  
**Last Updated**: 2026-01-18  
**Production URL**: https://openscad-web-customizer-forge.pages.dev
