# Color Passthrough: Research Findings

**Date:** 2026-03-01 (updated 2026-03-12)
**Related Issues:** #009 (Preserve color coding scheme), #011 (OpenSCAD color passthrough and `#` modifier transparency)
**Status:** Fully enabled — COFF per-face color passthrough verified working at runtime.

---

## Summary

The stakeholder wants multi-color SCAD files to display with their assigned colors in the 3D preview. The app now uses **OFF format with inline per-face colors** when the SCAD source contains `color()` calls, falling back to STL (single-color) otherwise.

This document records the findings of the Phase 6B research spike, the COFF verification result, and the current implementation.

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

### COFF Verification Result (2026-03-10)

The WASM build (`OpenSCAD-2025.03.25.wasm24456`) **does** emit per-face color data in
OFF output, but only after two local Layer 2 fixes were applied:

1. **Invocation fix:** The Manifold backend requires `--enable=render-colors` to include
   per-face colors. This flag was added to the CLI args in `openscad-worker.js`.
2. **Parser fix:** OpenSCAD's `export_off.cc` writes inline integer colors (0-255) with
   a plain `OFF` header (not `COFF`). The parser in `preview.js` was updated to detect
   inline colors by checking `parts.length >= n + 4` regardless of header, and to
   auto-detect integer vs float color scale.

E2E probe confirms `hasColors=true` for multi-color SCAD files.

---

## The `#` Debug Modifier

**Desktop behavior:** The `#` modifier renders objects semi-transparently (pink overlay) in the OpenSCAD GUI preview. It is a *display-only* effect and does **not** affect exported geometry. Objects marked with `#` are included in the export at full opacity.

**Implication:** There is no way to get the `#` transparency effect in exported OFF/STL/AMF files. This is a fundamental design decision in OpenSCAD, not a limitation of this app.

**Current behavior:** When `#` is detected, the app applies a fixed `#ff5151` (pink) color override to all faces. A dual-render approach (normal COFF colors + semi-transparent pink overlay) is planned — see Phase 3 of the parity remediation plan.

---

## Color Parameter Legend (Supplementary)

In addition to COFF per-face colors, the app provides a **color parameter legend**:

- When a SCAD file has **two or more** color-type parameters (e.g., `keyguard_color`, `frame_color`), a small legend appears in the bottom-left of the 3D preview.
- The legend shows each color parameter's name alongside a swatch of its current value.
- The legend updates when parameters change.

This complements the per-face colors by giving the user a named reference for each color parameter.

---

## Implementation Status (2026-03-12)

Color passthrough is **fully enabled** (`rollout: 100`, `killSwitch: false`).

### What was built

| Component | File | Description |
|-----------|------|-------------|
| Feature flag | `src/js/feature-flags.js` | `color_passthrough` flag, rollout=100, kill-switch disabled |
| SCAD color detector | `src/js/auto-preview-controller.js` | `AutoPreviewController.scadUsesColor()` static method |
| OFF/COFF parser | `src/js/preview.js` | `PreviewManager.loadOFF()` — parses OFF with inline colors, builds vertex-colored geometry |
| Pipeline routing | `src/js/auto-preview-controller.js` | Passes `outputFormat: 'off'` to render when flag+color detected; chooses `loadOFF` vs `loadSTL` based on `result.format` |
| Cache support | `src/js/auto-preview-controller.js` | Cache entries now store `format` field; `loadCachedPreview` chooses correct loader |
| Render-colors flag | `src/worker/openscad-worker.js` | Adds `--enable=render-colors` to CLI args for Manifold backend |
| Inline color detect | `src/js/preview.js` | Detects inline colors by `parts.length` regardless of `OFF`/`COFF` header |

### Override / disable

To disable at runtime without a code change:
```
?flag_color_passthrough=false
```

Or disable in code:
```javascript
// In feature-flags.js:
color_passthrough: { ..., killSwitch: true }
```

### Known Limitations

- **Performance:** OFF is a text format; for very large models, parsing may be slower than binary STL.
- **Memory:** Vertex colors increase per-vertex data size.
- **Detection heuristic:** `scadUsesColor()` regex scan is approximate; may miss edge cases where `color` appears in variable names.
- **Alpha omission:** Per-face alpha values from COFF (`parts[n+4]`) are intentionally not read — only RGB is extracted. Three.js material transparency is handled separately via `debugHighlight` overlay.

---

## Future Work

1. ~~**Verify COFF output**~~ — Done (2026-03-10). COFF confirmed working.
2. ~~**Increase rollout to 100**~~ — Done (2026-03-10). Kill-switch disabled.
3. Consider automatic format selection based on `result.format` from the worker (rather than pre-flight regex scan), so detection is perfectly accurate.
4. Implement `#` debug modifier dual-render (normal COFF colors + pink overlay) — see parity remediation plan Phase 3.

---

## References

- [OFF Format Specification](https://en.wikipedia.org/wiki/OFF_(file_format))
- [OpenSCAD color() documentation](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color)
- [OpenSCAD # modifier](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#%23_Debug_modifier)
- OpenSCAD WASM build: `OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip`
