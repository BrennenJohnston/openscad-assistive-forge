# 🧪 Testing Instructions - v1.10.0 Library Bundles

**Quick Start Guide for Manual Testing**

---

## ⚡ TL;DR - 5 Minute Test

1. **Open the app**: http://localhost:5173
2. **Upload test file**: Look for example buttons, find "Library Test" or upload `public/examples/library-test/library_test.scad`
3. **Check library panel**: Should see "📚 Libraries" with MCAD marked "required"
4. **Generate STL**: Click the button and verify no errors
5. **Success**: If STL downloads, library system works! 🎉

---

## 📋 Current Status

✅ **Setup Complete**
- Libraries downloaded (MCAD, BOSL2)
- Manifests created
- Test example ready
- Dev server running

⏳ **Needs Testing**
- Library detection
- Worker mounting
- Rendering with libraries
- UI functionality

---

## 🎯 Primary Test Objective

**Verify that the library-test example works:**

The test uses MCAD's `roundedBox()` function. If this renders successfully, it proves:
1. Parser detects library usage ✓
2. Library manager auto-enables MCAD ✓
3. Worker mounts MCAD files ✓
4. OpenSCAD can access library functions ✓
5. Rendering pipeline integrates correctly ✓

---

## 🚀 Step-by-Step Test

### Step 1: Load the Test Example

**Option A - From Welcome Screen** (easiest):
- Open http://localhost:5173
- Look for example buttons
- Click "Library Test" if available

**Option B - Manual Upload**:
- Click "Upload .scad file"
- Navigate to: `public/examples/library-test/library_test.scad`
- Select and upload

### Step 2: Verify Library Detection

Open browser DevTools (F12) and check Console tab for:

```
✅ Expected messages:
OpenSCAD Web Customizer v1.10.0
Detected libraries: ['MCAD']
Auto-enabled libraries: ['MCAD']
[Library] enable: MCAD
```

### Step 3: Check UI

Look in the parameters panel for "📚 Libraries" section:

```
📚 Libraries [1]
  ▼ Expand to see:
    
    ☑ ⚙️ MCAD (required)
       Mechanical CAD components
```

**Verify**:
- Badge shows "1"
- MCAD is checked
- "required" badge visible
- Panel can expand/collapse

### Step 4: Test Rendering

**Configure parameters** (should be defaults):
- Style: "Rounded"
- Width: 50
- Depth: 30
- Height: 25
- Radius: 5

**Trigger render**:
- Wait for auto-preview (if enabled), OR
- Click "Generate STL" button

**Note on URL Parameters (Stability Fix)**:
- If you load a shared URL with out-of-range values, the app now **clamps** them to the model's min/max.
- Example: `width=18` → clamped to `20`, `height=96` → clamped to `50`.
- This prevents CGAL assertion failures from invalid geometry.

**Watch console for**:
```
✅ Expected worker messages:
[Worker] Rendering with parameters: {...}
[Worker FS] Mounting library: MCAD from /libraries/MCAD
[Worker FS] Created directory: MCAD
[Worker FS] Mounted file: MCAD/boxes.scad (XXX bytes)
[Worker FS] Successfully mounted library: MCAD (36 files)
[Worker] Render complete: NNN triangles
```

### Step 5: Verify Success

**Success indicators**:
- ✅ No error messages
- ✅ Status shows "Ready" or "Preview ready"
- ✅ 3D preview shows rounded box (if preview enabled)
- ✅ "Download STL" button becomes active
- ✅ Clicking download works

**Failure indicators**:
- ❌ Error: "Failed to render model"
- ❌ Error: "File not found: MCAD/boxes.scad"
- ❌ Console shows library mounting errors
- ❌ Render times out

---

## 🔍 What to Look For

### Console Messages (Good Signs)

```javascript
// 1. Detection
"Detected libraries: ['MCAD']"

// 2. Auto-enable
"Auto-enabled libraries: ['MCAD']"

// 3. Worker mounting
"[Worker FS] Mounting library: MCAD from /libraries/MCAD"
"[Worker FS] Successfully mounted library: MCAD"

// 4. Render success
"[Worker] Render complete: 296 triangles"
```

### Console Errors (Problem Signs)

```javascript
// ❌ Detection failed
"Detected libraries: []" // Should have MCAD

// ❌ Mounting failed
"Failed to fetch /libraries/MCAD/manifest.json"
"Failed to mount library: MCAD"

// ❌ File not found
"Error: Cannot find file: MCAD/boxes.scad"
```

---

## 🐛 Common Issues & Fixes

### Issue 1: Library Not Detected

**Symptoms**: Console shows `Detected libraries: []`

**Fix**:
- Verify include statement in test file: `use <MCAD/boxes.scad>;`
- Check parser.js has library detection code
- Refresh browser (Ctrl+Shift+R)

### Issue 2: Manifest Not Found

**Symptoms**: `Failed to fetch /libraries/MCAD/manifest.json`

**Fix**:
- Verify file exists: `public/libraries/MCAD/manifest.json`
- Check manifest.json is valid JSON
- Verify dev server is running
- Check Network tab in DevTools for 404 errors

### Issue 3: Worker Can't Find Library Files

**Symptoms**: `Error: Cannot find file: MCAD/boxes.scad`

**Fix**:
- Verify MCAD directory has .scad files
- Check manifest.json lists "boxes.scad"
- Verify worker mounted files (check console)
- Try disabling and re-enabling library in UI

### Issue 4: OpenSCAD Engine Fails to Initialize

**Symptoms**:
- `Failed to initialize OpenSCAD engine`
- `[RenderController] Worker error: Event`
- `Worker not ready. Call init() first.`

**Fix**:
- Keep the worker constructor inline: `new Worker(new URL('../worker/openscad-worker.js', import.meta.url), { type: 'module' })`
- Avoid precomputing the worker URL outside the constructor (can break Vite worker bundling)
- Rebuild and preview: `npm run build` then `npm run preview`
- Clear the site data/service worker cache if the error persists

### Issue 4: MCAD Not Auto-Enabled

**Symptoms**: Library detected but not checked in UI

**Fix**:
- Check libraryManager.autoEnable() is called
- Verify state has detectedLibraries
- Manually check MCAD checkbox
- Check console for errors

---

## ✅ Quick Verification Checklist

Run through this 2-minute checklist:

- [ ] Dev server running (http://localhost:5173 accessible)
- [ ] Test file uploads without error
- [ ] Library panel visible in UI
- [ ] MCAD shows as "required" with badge
- [ ] Console shows detection message
- [ ] Render completes without errors
- [ ] STL file downloads successfully
- [ ] 3D preview shows rounded box (optional)

If all checked: **✅ Library system works!**

If any unchecked: **See troubleshooting above**

---

## 📚 Additional Tests (Optional)

### Test 2: Manual Toggle

1. Uncheck MCAD
2. Try to render
3. Should get error (library required but disabled)
4. Re-check MCAD
5. Render should succeed

### Test 3: BOSL2

1. Create simple file with: `include <BOSL2/std.scad>; cuboid([20,30,40]);`
2. Upload
3. Verify BOSL2 detected
4. Enable BOSL2
5. Render

### Test 4: State Persistence

1. Enable MCAD and BOSL2
2. Refresh browser
3. Upload any file
4. Check libraries still enabled

---

## 📞 Getting Help

### Detailed Testing Guide
For comprehensive test cases, see:
```
docs/guides/LIBRARY_TESTING_GUIDE.md
```

### Setup Verification
Verify setup completed correctly:
```
docs/changelogs/V1.10_TESTING_SETUP.md
```

### Feature Documentation
Full feature details:
```
docs/changelogs/CHANGELOG_v1.10.md
```

### Console Commands

Check library state in browser console:
```javascript
// Check localStorage
localStorage.getItem('openscad-customizer-libraries')

// Check if libraries available
await fetch('/libraries/MCAD/manifest.json').then(r => r.json())

// Check mounted libraries (in worker context)
// Look for [Worker FS] messages in console
```

---

## 🎯 Success Criteria

**Minimum for "Working"**:
- Library detected from test file ✓
- UI shows library controls ✓  
- MCAD auto-enabled ✓
- Render completes without errors ✓
- STL file generated ✓

**Ideal for "Production Ready"**:
- All above plus:
- Multiple browsers tested ✓
- Mobile devices tested ✓
- Performance acceptable ✓
- Accessibility verified ✓
- Documentation complete ✓

---

## 🚀 After Testing

### If Everything Works

1. Update completion summary with "✅ TESTED"
2. Create git commit with test results
3. Consider production deployment
4. Plan next features (v1.11)

### If Issues Found

1. Document specific errors
2. Check troubleshooting section
3. Review worker console messages
4. Test isolation (disable other features)
5. Report findings for fixes

---

## 📝 Test Report Template

Copy and fill out after testing:

```markdown
## Test Report - v1.10.0

**Date**: [Today]
**Tester**: [Your Name]
**Browser**: [Chrome/Firefox/Safari] [Version]

### Primary Test: Library Test Example
- [ ] File uploaded successfully
- [ ] MCAD detected: Yes / No
- [ ] MCAD auto-enabled: Yes / No
- [ ] Worker mounted MCAD: Yes / No
- [ ] Render succeeded: Yes / No
- [ ] STL downloaded: Yes / No

### Issues Found
1. [Description]
2. [Description]

### Console Errors
```
[Paste any error messages]
```

### Overall Status
- [ ] ✅ Working - Ready for production
- [ ] ⚠️ Working with minor issues
- [ ] ❌ Not working - needs fixes

### Recommendations
[Your feedback]
```

---

## 🎉 Expected Outcome

**When working correctly, you'll see:**

1. **Upload library_test.scad**
2. **Console**: "Detected libraries: ['MCAD']"
3. **UI**: Library panel with MCAD checked and badge "1"
4. **Click Generate**: Worker mounts MCAD, render succeeds
5. **Download**: STL file with rounded box geometry
6. **Preview**: 3D view shows smooth rounded corners

**Total time**: 30 seconds to 2 minutes (depending on render)

**This proves**: The entire library system pipeline works end-to-end! 🎊

---

**Ready to test? Start here**: http://localhost:5173

**Questions?** Check `docs/guides/LIBRARY_TESTING_GUIDE.md`

**Good luck! 🍀**
