# Browser Support Statement

**Version**: 4.2.0  
**Effective Date**: 2026-02-02  
**Status**: Production

---

## Supported Browsers

OpenSCAD Assistive Forge is tested and supported on the following browsers:

### Fully Supported (Tier 1)

These browsers receive full testing on every release and are recommended for the best experience.

| Browser | Minimum Version | Platform | Notes |
|---------|-----------------|----------|-------|
| **Google Chrome** | 92+ | Windows, macOS, Linux | Primary development target |
| **Microsoft Edge** | 92+ | Windows, macOS | Chromium-based, full compatibility |

### Supported (Tier 2)

These browsers are tested periodically and should work correctly for all features.

| Browser | Minimum Version | Platform | Notes |
|---------|-----------------|----------|-------|
| **Mozilla Firefox** | 102+ | Windows, macOS, Linux | ESR baseline supported |
| **Apple Safari** | 15.2+ | macOS, iOS | Requires iOS 15.2+ for full WASM support |

### Best Effort (Tier 3)

These browsers may work but are not regularly tested. Issues will be addressed as resources allow.

| Browser | Platform | Notes |
|---------|----------|-------|
| Chrome for Android | Android 10+ | Performance may vary on mobile |
| Safari for iOS | iOS 15.2+ | Limited by device memory |
| Opera | All platforms | Chromium-based, should work |

### Not Supported

The following browsers are **not supported** and may not function correctly:

- Internet Explorer (all versions)
- Microsoft Edge Legacy (non-Chromium)
- Safari versions prior to 15.2
- Any browser without WebAssembly support
- Any browser without WebGL 2.0 support

---

## Technical Requirements

### Required Web APIs

OpenSCAD Assistive Forge requires the following browser capabilities:

| API | Purpose | Fallback |
|-----|---------|----------|
| **WebAssembly** | OpenSCAD geometry engine | None (required) |
| **Web Workers** | Background rendering | None (required) |
| **WebGL 2.0** | 3D preview rendering | None (required) |
| **SharedArrayBuffer** | WASM threading | Single-threaded fallback |
| **localStorage** | User preferences | Session-only storage |
| **IndexedDB** | Project storage | localStorage fallback |

### Cross-Origin Isolation

For optimal performance, the application requires cross-origin isolation headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Browsers without these headers will operate in single-threaded mode, which may affect performance for complex models.

---

## Mobile Considerations

### Supported Mobile Use Cases

- Viewing and rotating 3D previews
- Adjusting simple parameters
- Exporting STL files

### Mobile Limitations

Due to hardware constraints, mobile browsers have the following limitations:

- **Memory**: Complex models (>50,000 triangles) may cause crashes
- **Performance**: Rendering is slower than desktop
- **Expert Mode**: Code editing works but is not optimized for touch
- **File handling**: Some export options may be limited

For the best experience with complex models, we recommend using a desktop browser.

---

## Accessibility Support

All supported browsers work with the following assistive technologies:

| Screen Reader | Browser | Support Level |
|---------------|---------|---------------|
| NVDA | Chrome, Firefox, Edge | Full |
| JAWS | Chrome, Edge | Full |
| VoiceOver | Safari (macOS/iOS) | Full |
| TalkBack | Chrome for Android | Partial |

### Accessibility Fallback

If you experience issues with the Monaco code editor and assistive technology:

1. Open Settings (gear icon)
2. Enable "Use accessible text editor"
3. This provides a native textarea with full AT compatibility

---

## Checking Your Browser

To verify your browser meets requirements:

1. Visit the application
2. If you see the welcome screen, your browser is compatible
3. If you see an error, check the console (F12) for specific messages

### Common Compatibility Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "WebAssembly not supported" | Browser too old | Update browser |
| Blank 3D preview | WebGL disabled | Enable hardware acceleration |
| Slow performance | SharedArrayBuffer unavailable | Check browser settings or use supported browser |
| Models fail to render | Insufficient memory | Use desktop browser or reduce model complexity |

---

## Getting Help

If you experience browser-specific issues:

1. Check this support statement for your browser version
2. Try the application in a Tier 1 browser (Chrome or Edge)
3. Report issues on [GitHub Issues](https://github.com/openscad/openscad-assistive-forge/issues)

When reporting, please include:
- Browser name and version
- Operating system
- Steps to reproduce
- Error messages from browser console (F12)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.2.0 | 2026-02-02 | Initial supported browsers statement |
