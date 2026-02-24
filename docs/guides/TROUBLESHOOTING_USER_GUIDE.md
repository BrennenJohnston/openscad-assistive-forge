# Troubleshooting Guide

Solutions for common issues when using OpenSCAD Assistive Forge.

## Quick Fixes

Before diving into specific issues, try these common solutions:

1. **Refresh the page** (`Ctrl+R` or `Cmd+R`)
2. **Clear browser cache** (especially after updates)
3. **Try a different browser** (Chrome often works best)
4. **Check your internet connection**

---

## Model and Rendering Issues

### Model Won't Load

**Symptoms:** File selected but nothing happens, or "Failed to load" error.

**Solutions:**

1. **Check file format**: Only `.scad`, `.zip`, and `.json` files are supported
2. **Check file size**: Maximum 5 MB for single files, 20 MB for ZIP
3. **Check ZIP structure**: If using includes, ensure file paths in code match ZIP structure
4. **Try the example models**: If examples work, the issue is with your file

### Preview Shows Nothing / Black Screen

**Symptoms:** Parameters load but preview area is empty or black.

**Solutions:**

1. **Check for model errors**: Look for red error banners
2. **Click "Render"**: Auto-preview may be disabled
3. **Check WebGL**: Your browser may have WebGL disabled
   - Go to `chrome://gpu` (Chrome) or `about:support` (Firefox)
   - Look for "WebGL" status
4. **Update graphics drivers**: Outdated drivers can cause WebGL issues

### Render Takes Too Long / Never Completes

**Symptoms:** "Rendering..." message stays indefinitely, or very slow.

**Solutions:**

1. **Reduce quality setting**: Use Draft for faster previews
2. **Simplify the model**: High `$fn` values dramatically increase render time
3. **Check for infinite loops**: Some parameter combinations may cause loops
4. **Wait longer**: Complex models can take 30+ seconds
5. **Check memory**: Yellow/red warnings indicate memory pressure

### "WASM Error" or "OpenSCAD Error"

**Symptoms:** Error message mentioning WASM, OpenSCAD, or geometry issues.

**Solutions:**

1. **Check OpenSCAD syntax**: The code may have syntax errors
2. **Check for non-manifold geometry**: Boolean operations on invalid shapes fail
3. **Reduce complexity**: Very complex models may exceed memory limits
4. **Refresh and retry**: WASM can sometimes enter bad state

---

## Parameter Issues

### Parameters Not Showing

**Symptoms:** Model loads but parameter panel is empty.

**Solutions:**

1. **Check for Customizer annotations**: Parameters need special comments
   ```openscad
   // This won't show:
   width = 50;
   
   // This will show:
   width = 50; // [10:100]
   ```
2. **Check for Hidden group**: Parameters in `/* [Hidden] */` don't show
3. **Check syntax**: Annotations need correct format

### Slider Won't Move / Stuck

**Symptoms:** Clicking or dragging slider has no effect.

**Solutions:**

1. **Try keyboard**: Focus the slider and use arrow keys
2. **Check range**: Value may already be at min/max
3. **Refresh page**: UI state may be corrupted

### Parameter Changes Not Affecting Preview

**Symptoms:** Adjusting parameters doesn't change the model.

**Solutions:**

1. **Check auto-preview**: May be disabled (memory warning)
2. **Click "Render"**: Manually trigger preview update
3. **Check parameter usage**: The parameter may not be used in geometry

### Values Reset After Refresh

**Symptoms:** Your parameter changes disappear when you refresh.

**Solutions:**

1. **Save as Preset**: Use "Save Preset" to persist values
2. **Save Project**: Use "Save Project" to store to browser storage (IndexedDB)
3. **Check browser storage**: Your browser may be clearing storage
4. **Private/Incognito mode**: Storage doesn't persist in private mode

---

## Export Issues

### Export Button Not Working

**Symptoms:** Clicking export format button does nothing.

**Solutions:**

1. **Wait for render**: Export requires successful render first
2. **Check for errors**: Fix any model errors before export
3. **Check popup blocker**: Browser may be blocking download
4. **Try different format**: Some formats may not work with certain models

### Downloaded File Empty or Corrupt

**Symptoms:** File downloads but won't open in slicer software.

**Solutions:**

1. **Check for model errors**: Errors can produce invalid output
2. **Try different format**: OBJ if STL fails, or vice versa
3. **Check file size**: Very small file suggests export failed
4. **Re-render and export**: Sometimes second attempt works

### 2D Export (SVG/DXF) Produces Nothing

**Symptoms:** SVG or DXF export yields empty file.

**Solutions:**

1. **Check model is 2D**: SVG/DXF only work with 2D models (using `projection()` or 2D primitives)
2. **Use 3D format**: If model is 3D, use STL or OBJ instead

---

## Performance Issues

### App Running Slowly

**Symptoms:** Interface laggy, parameters slow to respond.

**Solutions:**

1. **Close other tabs**: Free up browser memory
2. **Use Draft quality**: Lower preview quality uses less resources
3. **Simplify model**: Reduce complexity if possible
4. **Try Chrome**: Often faster than other browsers

### Memory Warning Appeared

**Symptoms:** Yellow or red banner about memory usage.

**Solutions:**

1. **Yellow warning**: 
   - Dismiss and continue (monitoring)
   - Consider reducing model complexity
2. **Red critical warning**:
   - Save your work immediately
   - Export STL if needed
   - Consider reloading in recovery mode
3. **Use "Reduce Quality" button**: Lower quality uses less memory
4. **Disable auto-preview**: Click the button in warning banner

### App Crashed / Page Unresponsive

**Symptoms:** Page freezes, "Page Unresponsive" message.

**Solutions:**

1. **Wait 30-60 seconds**: May be processing complex render
2. **Force close tab**: If truly stuck, close and reopen
3. **Use recovery mode**: Add `?recovery=true` to URL
4. **Report the issue**: Note what you were doing when it crashed

---

## Editor Issues (Expert Mode)

### Editor Not Loading

**Symptoms:** Switched to Expert Mode but no editor appears.

**Solutions:**

1. **Check internet**: Monaco Editor loads from CDN
2. **Try textarea editor**: Settings → Editor → Textarea
3. **Check browser extensions**: Ad blockers may block CDN
4. **Clear cache**: Cached Monaco may be corrupted

### Code Changes Not Syncing to Parameters

**Symptoms:** Edited code but Standard Mode shows old values.

**Solutions:**

1. **Check syntax**: Code must be valid to parse
2. **Save and switch**: Press `Ctrl+S` then switch modes
3. **Check annotation format**: Parameters need correct comments
4. **Use simple values**: Expressions can't sync (fall back to raw mode)

### Syntax Highlighting Missing

**Symptoms:** Code appears but all one color.

**Solutions:**

1. **Wait for Monaco**: Highlighting loads asynchronously
2. **Try textarea editor**: Has simpler highlighting
3. **Check file type**: Only `.scad` files get highlighting

---

## Accessibility Issues

### Screen Reader Not Announcing Changes

**Symptoms:** Using NVDA/JAWS/VoiceOver but not hearing updates.

**Solutions:**

1. **Check live regions**: Status messages use ARIA live regions
2. **Check screen reader settings**: Ensure live regions are enabled
3. **Focus the element**: Some announcements require focus
4. **Try different browser**: NVDA works best with Firefox, JAWS with Chrome

### Keyboard Navigation Not Working

**Symptoms:** Tab key doesn't move focus as expected.

**Solutions:**

1. **Press Escape first**: May be in a modal or trapped focus
2. **Check for modals**: Close any open dialogs
3. **Check browser mode**: Some modes capture keyboard
4. **Tab through entire page**: Focus may be in unexpected location

### High Contrast Mode Not Activating

**Symptoms:** Clicked HC button but colors unchanged.

**Solutions:**

1. **Check system settings**: May conflict with OS high contrast
2. **Try theme toggle**: Click Light/Dark buttons to reset
3. **Refresh page**: Theme state may be stuck

---

## Browser-Specific Issues

### Firefox Issues

**Common Firefox issues:**

1. **WebGL may be disabled**: Check `about:config` → `webgl.disabled`
2. **WASM may be slow**: Firefox WASM is sometimes slower than Chrome
3. **File downloads**: May prompt for save location each time

### Safari Issues

**Common Safari issues:**

1. **SharedArrayBuffer**: May not be available (affects threading)
2. **File input**: Sometimes finicky; try drag-and-drop
3. **LocalStorage**: More restrictive in private mode

### Edge Issues

**Common Edge issues:**

1. **Similar to Chrome**: Edge uses same engine, most issues same
2. **Enterprise policies**: IT policies may block features

---

## Still Having Issues?

### Before Reporting a Bug

1. **Try incognito/private mode**: Rules out extensions and cached data
2. **Try different browser**: Identifies browser-specific issues
3. **Check console for errors**: Press `F12` → Console tab
4. **Note steps to reproduce**: What exactly did you do?

### How to Report

Open an issue on [GitHub Issues](https://github.com/BrennenJohnston/openscad-assistive-forge/issues) with:

1. **Browser and version** (e.g., Chrome 120)
2. **Operating system** (e.g., Windows 11, macOS 14)
3. **Steps to reproduce** (numbered list)
4. **What you expected** vs **What happened**
5. **Console errors** (if any)
6. **Screenshots** (if visual issue)

### Get Help

- **GitHub Discussions**: For questions and community help
- **GitHub Issues**: For bugs and feature requests

---

**Related Guides:**

- [Getting Started](./GETTING_STARTED.md) - Basic usage
- [Standard Mode Guide](./STANDARD_MODE_GUIDE.md) - Parameter customization
- [Expert Mode Guide](./EXPERT_MODE_GUIDE.md) - Code editing
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) - AT support
