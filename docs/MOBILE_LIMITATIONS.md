# Mobile Browser Limitations

This document describes known limitations when using the OpenSCAD Web Customizer on mobile devices.

## Overview

The OpenSCAD Web Customizer works on mobile browsers (iOS Safari, Android Chrome) but with some limitations due to mobile hardware constraints and browser capabilities. This document helps users understand what to expect and how to work around common issues.

## Memory Constraints

**Issue**: Mobile browsers have stricter memory limits than desktop browsers.

**Impact**:
- Complex models may fail with "out of memory" errors
- Memory limit is typically 256-512MB on mobile vs 1-2GB on desktop
- Rendering large or complex models may crash the browser tab

**Workarounds**:
1. **Reduce `$fn` value**: Use lower circle resolution (e.g., `$fn=32` instead of `$fn=100`)
2. **Simplify geometry**: Reduce the number of operations and mesh complexity
3. **Use preview quality**: Iterate with preview quality ($fn capped at 24), only generate full quality for final export
4. **Clear browser cache**: If memory errors persist, clear cache and close other tabs
5. **Restart browser**: Close and reopen the browser to free up memory

**Status**: Known limitation of mobile browsers. Cannot be fully resolved client-side.

## Viewport Resizing

**Issue**: Virtual keyboard and browser chrome (address bar, toolbar) change the viewport height dynamically.

**Status**: ✅ **SOLVED** in v1.4

**Implementation**:
- Uses CSS `dvh` (dynamic viewport height) units for modern browsers
- Fallback for older browsers via Visual Viewport API polyfill
- Sticky action bar remains accessible when keyboard is open
- Layout adjusts smoothly when keyboard appears/disappears

**What Works**:
- Parameter inputs remain accessible when keyboard is open
- Action buttons (Generate STL, Download) stay visible
- No content gets clipped or hidden behind keyboard

## Slower Rendering Performance

**Issue**: Mobile CPUs are less powerful than desktop CPUs.

**Impact**:
- STL generation takes 2-3x longer on mobile devices
- **Preview quality renders**: 5-15 seconds (vs 2-8s on desktop)
- **Full quality renders**: 30-120 seconds (vs 10-60s on desktop)
- Very complex models may timeout (30s preview, 60s full quality)

**Mitigations**:
- Auto-preview uses aggressive $fn capping on mobile (max 24 vs 48 on desktop)
- Render time estimates account for mobile performance
- Progress indicators keep user informed during long renders
- Timeout warnings appear with options to simplify or retry

**Recommendations**:
- Test complex models on desktop first
- Use simpler models for mobile demonstrations
- Be patient with render times
- Consider reducing model complexity for mobile users

## Touch Target Sizes

**Requirement**: WCAG 2.1 Level AAA requires minimum 44×44px touch targets.

**Status**: ✅ **IMPLEMENTED**

**Details**:
- All buttons, sliders, and interactive elements meet 44×44px minimum
- Increased padding on mobile breakpoint (< 768px width)
- Larger slider thumbs (32px vs 20px on desktop)
- Adequate spacing between controls to prevent mis-taps
- File upload drop zone has large hit area

## File Upload on iOS

**Issue**: iOS Safari has quirks with file input behavior.

**Status**: ✅ **WORKS** with caveats

**What Works**:
- Single .scad file upload via file picker
- ZIP file upload and extraction
- Multiple file selection (for ZIP contents)

**Caveats**:
- File picker shows "Choose File" instead of "Upload" (iOS system dialog)
- Drag-and-drop **not supported** on iOS (automatically falls back to file picker)
- ZIP files work but may show warning dialog on older iOS versions (< 15)
- File names with non-ASCII characters may display incorrectly

**Workarounds**:
- Use file picker button instead of drag-and-drop on iOS
- Use ASCII-friendly file names when possible
- Update to latest iOS for best compatibility

## SharedArrayBuffer Support

**Issue**: Some older mobile browsers don't support SharedArrayBuffer, which is required for multithreaded WASM.

**Status**: ✅ **HANDLED** with fallback

**Details**:
- App detects SharedArrayBuffer availability
- Falls back to single-threaded WASM if unavailable
- Single-threaded mode is slower but functional
- Warning message informs user about degraded performance

**Affected Browsers**:
- iOS Safari < 15.2
- Android Chrome < 92 (depending on site isolation)
- Firefox Android < 79

**Recommendations**:
- Update to latest browser version
- Consider using desktop for complex models
- Simple models work fine in single-threaded mode

## 3D Preview Performance

**Issue**: Mobile GPUs have less memory and processing power than desktop GPUs.

**Impact**:
- Large STL files (>100K triangles) may cause stuttering or lag
- Orbit controls may feel less responsive
- Preview may not render at 60 FPS
- Very large models (>500K triangles) may not render at all

**Mitigations**:
- Preview quality automatically reduces mesh complexity
- LOD (Level of Detail) system reduces vertices for preview
- Vertex count warning appears for large models (>50K vertices)
- Option to simplify preview mesh for better performance

**Recommendations**:
- Download STL and view in dedicated 3D app for large models
- Use preview for basic verification only
- Reduce preview quality if lag occurs

## Landscape vs Portrait Orientation

**Status**: ✅ **SUPPORTED**

**Details**:
- Layout adapts to orientation changes
- Parameters panel stacks in portrait mode
- Preview resizes to fit available space
- No loss of functionality in either orientation

**Recommendations**:
- Landscape orientation recommended for better workflow
- Portrait mode works for quick parameter adjustments
- Preview quality better in landscape (larger viewport)

## Battery and Data Usage

**Issue**: WASM execution and 3D rendering are power-intensive.

**Impact**:
- Extended use will drain battery faster
- Initial WASM download is ~20-30MB (one-time)
- Subsequent visits use cached WASM

**Recommendations**:
- Use WiFi for initial load to avoid mobile data charges
- Keep device plugged in for extended editing sessions
- WASM caches automatically for offline use after first load

## PWA (Progressive Web App) Support

**Status**: ✅ **SUPPORTED**

**What Works**:
- Install as standalone app on home screen
- Offline support after initial load
- App-like experience without browser chrome
- Service worker caches static assets

**Installation**:
- **iOS**: Safari → Share → Add to Home Screen
- **Android**: Chrome → Menu → Add to Home Screen

**Benefits**:
- Faster loading (cached assets)
- Full-screen experience
- Offline parameter editing (rendering requires WASM which caches on first use)

## Audio Feedback

**Status**: ❌ **NOT IMPLEMENTED**

**Note**: No audio feedback or haptic feedback is provided. Visual feedback only (progress bars, status messages, animations).

## Clipboard Support

**Status**: ✅ **PARTIAL SUPPORT**

**What Works**:
- Copy parameter values as text
- Copy generated code snippets
- Export parameters as JSON

**Limitations**:
- iOS requires user interaction for clipboard access
- "Copy to clipboard" buttons work but may show permission prompt
- Automatic clipboard operations blocked by iOS

## Known Issues

### iOS-Specific

1. **Memory warnings**: iOS aggressively terminates tabs using too much memory
   - **Workaround**: Close other tabs, simplify model

2. **Scroll momentum**: Parameters panel may have fast scroll momentum
   - **Workaround**: Use careful swipes or drag scrollbar directly

3. **Input zoom**: Inputs may zoom page when focused (iOS < 16)
   - **Workaround**: Pinch to zoom out, or use external keyboard

### Android-Specific

1. **Back button**: Android back button may exit app unexpectedly
   - **Workaround**: Use in-app navigation, or install as PWA

2. **Text selection**: Text selection may be difficult in dense parameter UI
   - **Workaround**: Long-press carefully or use landscape mode

## Feature Support Matrix

| Feature | iOS Safari | Android Chrome | Firefox Android | Notes |
|---------|-----------|----------------|-----------------|-------|
| File Upload | ✅ | ✅ | ✅ | iOS: no drag-drop |
| ZIP Support | ✅ | ✅ | ✅ | iOS may show warning |
| 3D Preview | ✅ | ✅ | ✅ | Performance varies |
| Parameter UI | ✅ | ✅ | ✅ | Fully functional |
| STL Download | ✅ | ✅ | ✅ | All formats supported |
| Presets | ✅ | ✅ | ✅ | Stored in localStorage |
| PWA Install | ✅ | ✅ | ✅ | Recommended |
| Offline Mode | ✅ | ✅ | ✅ | After first load |
| Theme Toggle | ✅ | ✅ | ✅ | All themes work |
| Keyboard Shortcuts | ⚠️ | ⚠️ | ⚠️ | Limited on mobile |
| Drag and Drop | ❌ | ✅ | ✅ | iOS fallback to picker |

Legend:
- ✅ Fully supported
- ⚠️ Limited support
- ❌ Not supported

## Testing

Mobile compatibility tested on:
- iOS 15.2+ (Safari)
- Android 10+ (Chrome 92+)
- Various screen sizes (320px to 768px width)

## Reporting Issues

If you encounter mobile-specific issues:

1. Check this document first for known limitations
2. Try the suggested workarounds
3. Update your browser to the latest version
4. If issue persists, report it with:
   - Device model and OS version
   - Browser name and version
   - Steps to reproduce
   - Screenshot if applicable

## Future Improvements

Planned enhancements for mobile:
- Adaptive $fn based on device memory (detect available RAM)
- Render quality presets (Low/Medium/High for mobile users)
- Better progress indicators for long renders
- Offline model library for common shapes
- Haptic feedback for parameter changes (where supported)

## Best Practices for Mobile Users

1. **Start simple**: Test with simple models first
2. **Preview first**: Always use preview quality before full quality
3. **Save often**: Save presets regularly (localStorage persists)
4. **Use WiFi**: Download WASM on WiFi, not mobile data
5. **Landscape mode**: Use landscape for better workflow
6. **Install PWA**: Install as home screen app for best experience
7. **Close tabs**: Close other tabs when rendering complex models
8. **Update browser**: Keep browser updated for best compatibility
9. **Be patient**: Mobile renders take longer - expect 2-3x desktop time
10. **Desktop for complex**: Use desktop for very complex models (>100K triangles)

## Accessibility on Mobile

All accessibility features work on mobile:
- VoiceOver (iOS) and TalkBack (Android) supported
- Keyboard navigation (external keyboard)
- High contrast mode
- Scalable text (respects system font size)
- Touch target sizes (44×44px minimum)
- Screen reader announcements

## Summary

The OpenSCAD Web Customizer works on mobile devices with reasonable limitations. For best experience:

- **Simple models**: Excellent experience on all devices
- **Medium models**: Good experience with patience
- **Complex models**: Recommend desktop for initial development, mobile for parameter tweaking

The PWA installation and offline support make mobile usage practical for field demonstrations, quick edits, and on-the-go customization.

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-15  
**Applies to**: OpenSCAD Web Customizer v2.4+
