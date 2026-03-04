# Color Passthrough: Research Findings

**Date:** 2026-03-01 (updated 2026-03-03)
**Related Issues:** #009 (Preserve color coding scheme), #011 (OpenSCAD color passthrough and `#` modifier transparency)
**Status:** Feature-flagged implementation complete — COFF verification pending runtime test.

---

## Summary

The stakeholder wants multi-color SCAD files to display with their assigned colors in the 3D preview. Currently the app renders all geometry in a single theme-derived or user-overridden color because it uses **STL format**, which has no color data.

This document records the findings of the Phase 6B research spike and the current limitations.

---

## Format Capabilities

| Format | Color Support | OpenSCAD Export | Notes |
|--------|--------------|-----------------|-------|
| STL    | None         | Yes (binary/ASCII) | Current preview pipeline format |
| OFF    | Per-face RGBA (COFF variant) | Yes | Supported by worker (`outputFormat: 'off'`) |
| OBJ    | Via separate MTL file | Yes | Two-file output not practical for in-memory pipeline |
| AMF    | Per-object/per-face | Yes | XML-based, heavier to parse |
| 3MF    | Per-object    | Yes | ZIP container, heavyweight |

## Key Finding: OFF (COFF) Format

OpenSCAD's desktop build outputs **COFF** (Color OFF) when the model contains `color()` calls. The COFF format includes per-face RGBA values:

```
COFF
numVertices numFaces 0
x y z           ← per vertex
3 v0 v1 v2 r g b a   ← per face with color
```

The WASM build (`openscad-worker.js`) already supports OFF output:
- `renderWithCallMain()` accepts `format = 'off'`
- Triangle count is extracted from the OFF header
- Output is returned as a text string

### Untested

Whether the specific WASM build (`OpenSCAD-2025.03.25.wasm24456`) actually includes per-face color data in OFF output **has not been verified at runtime**. The WASM build may strip color data during the export pipeline, or the Manifold geometry backend may not propagate colors to the export stage.

### Testing Procedure

To verify, render a simple multi-color SCAD file to OFF and inspect the output:

```openscad
color("red")   translate([0,0,0]) cube(10);
color("blue")  translate([20,0,0]) cube(10);
color("green") translate([40,0,0]) cube(10);
```

Expected COFF output would contain lines like:
```
3 0 1 2 1.0 0.0 0.0 1.0    ← red face
3 3 4 5 0.0 0.0 1.0 1.0    ← blue face
```

If the output contains only bare face indices (`3 0 1 2`) with no color values, color passthrough at the format level is not available.

---

## The `#` Debug Modifier

**Desktop behavior:** The `#` modifier renders objects semi-transparently (pink overlay) in the OpenSCAD GUI preview. It is a *display-only* effect and does **not** affect exported geometry. Objects marked with `#` are included in the export at full opacity.

**Implication:** There is no way to get the `#` transparency effect in exported OFF/STL/AMF files. This is a fundamental design decision in OpenSCAD, not a limitation of this app.

**Workaround:** Users can wrap `#` objects in `color([r,g,b,0.5])` to achieve a similar visual in their SCAD design. If COFF passthrough is later implemented, the alpha channel would carry through to the 3D preview.

---

## Current Implementation (Fallback)

Since full color passthrough is unverified, the app implements a **color parameter legend** as a fallback:

- When a SCAD file has **two or more** color-type parameters (e.g., `keyguard_color`, `frame_color`), a small legend appears in the bottom-left of the 3D preview.
- The legend shows each color parameter's name alongside a swatch of its current value.
- The legend updates when parameters change.
- The 3D mesh remains single-color (the first/primary color parameter tints the whole model via `resolvePreviewColor()`).

This gives the stakeholder visual confirmation of their color choices without requiring format-level changes.

---

## Implementation Status (2026-03-03)

The full color passthrough pipeline is now implemented and gated behind the
`color_passthrough` feature flag (`rollout: 0`, `killSwitch: true`).

### What was built

| Component | File | Description |
|-----------|------|-------------|
| Feature flag | `src/js/feature-flags.js` | `color_passthrough` flag, rollout=0, kill-switch enabled |
| SCAD color detector | `src/js/auto-preview-controller.js` | `AutoPreviewController.scadUsesColor()` static method |
| OFF/COFF parser | `src/js/preview.js` | `PreviewManager.loadOFF()` — parses COFF, builds vertex-colored geometry |
| Pipeline routing | `src/js/auto-preview-controller.js` | Passes `outputFormat: 'off'` to render when flag+color detected; chooses `loadOFF` vs `loadSTL` based on `result.format` |
| Cache support | `src/js/auto-preview-controller.js` | Cache entries now store `format` field; `loadCachedPreview` chooses correct loader |

### Activation

To enable in production once COFF is verified:

```javascript
// In feature-flags.js, change:
color_passthrough: {
  rollout: 0,      // → change to 100
  killSwitch: true, // → change to false after bake-in
}
```

Or test immediately via URL parameter:
```
?feature_color_passthrough=true
```

### Verification procedure

Before increasing rollout, confirm COFF output from the WASM build:

1. Open the app and load a SCAD file containing:
   ```openscad
   color("red")   translate([0,0,0]) cube(10);
   color("blue")  translate([20,0,0]) cube(10);
   color("green") translate([40,0,0]) cube(10);
   ```
2. Enable the flag via URL: `?feature_color_passthrough=true`
3. Open DevTools → Application tab → check for `[Preview] COFF ✓` in the console log
4. If you see `[Preview] OFF (no color)` instead, the WASM build strips color data — stop here

### Risks

- Manifold backend may not propagate color metadata to the export stage.
- Performance: OFF is a text format; for large models, parsing may be slower than binary STL.
- Memory: vertex colors double the per-vertex data size.
- The `scadUsesColor()` regex scan is approximate; may miss edge cases where `color` appears in variable names.

---

## Future Work

1. **Verify COFF output** using the procedure above.
2. If verified, increase `rollout` to 100 and remove `killSwitch` after bake-in.
3. Consider automatic format selection based on `result.format` from the worker (rather than pre-flight regex scan), so detection is perfectly accurate.

---

## References

- [OFF Format Specification](https://en.wikipedia.org/wiki/OFF_(file_format))
- [OpenSCAD color() documentation](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color)
- [OpenSCAD # modifier](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#%23_Debug_modifier)
- OpenSCAD WASM build: `OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip`
