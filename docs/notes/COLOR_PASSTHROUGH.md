# Color Passthrough: Research Findings

**Date:** 2026-03-01 (updated 2026-03-14)
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

### Multi-Color COFF Verification (2026-03-14)

Multi-color COFF passthrough — where a single mesh contains faces with **two or
more distinct colors** — has been verified end-to-end across the full pipeline:

**Desktop baseline (Phase 0):** The `keyguard-frame-multicolor` scenario
(keyguard + frame, `show_keyguard_with_frame="yes"`) produces COFF with two
face-color groups:

| Color | RGB | Hex | Faces | Geometry |
|-------|-----|-----|-------|----------|
| Red | (255, 0, 0) | `#FF0000` | 9,130 | Keyguard overlay |
| Turquoise | (64, 224, 208) | `#40E0D0` | 4,988 | Frame |

Total: 14,118 faces, 6,981 vertices. Render time: 0.246 s (Manifold).

**Parser verification (Phase 1):** Unit tests feeding multi-color COFF through
the parser extraction logic (mirroring `loadOFF()` lines 1206-1307) confirm:

- Per-face color accumulation works independently per face — no single-color
  collapse.
- Integer color scale (0-255) auto-detected correctly via first-face max > 1.
- Quad faces fan-triangulate into multiple triangles preserving per-face color.
- `colors.length === positions.length` geometry guard passes for all-colored
  face data.
- 27 unit tests covering multi-color, quad, mixed-color/uncolored, and
  first-face-black edge cases.

**Browser E2E verification (Phase 3):** Pixel sampling on Chromium and Edge
confirms 2+ distinct face-color groups render in the WebGL canvas. The
`color-debug-test.scad` fixture (`color("red")` cube + `color("#00ff00")`
sphere) produces red and green pixel regions verified via `readPixels` after
rAF-timed rendering.

**Interaction matrix (Phase 4 regression sweep):** All downstream consumers
verified compatible with multi-color meshes:

| Consumer | Multi-color safe? | Evidence |
|----------|-------------------|----------|
| Color override toggle | Yes — disables `vertexColors`, applies solid; re-enabling restores per-vertex multi-color | E2E pixel-verified |
| `#` dual-render | Yes — normal mesh preserves per-face colors; highlight overlay is additive | E2E verified |
| auto-bed | Yes — transforms Z positions only, no color interaction | Code-verified |
| Viewport image (clipboard) | Yes — WebGL canvas captures rendered vertex colors | Code-verified |
| STL export re-render | Yes — full render now uses OFF for preview; separate STL render populates download. `shouldPreserveColorPreview` remains as a safety net for edge cases. | E2E verified |
| SVG/DXF export | N/A — 2D format, no face colors | E2E verified |
| Full render preview | Yes — OFF path uses `loadOFF()` | E2E pixel-verified |
| Color legend | Partial — shows SCAD parameter colors, not per-face COFF colors | Code-verified |

---

## The `#` Debug Modifier

**Desktop behavior:** The `#` modifier renders objects semi-transparently (pink overlay) in the OpenSCAD GUI preview. It is a *display-only* effect and does **not** affect exported geometry. Objects marked with `#` are included in the export at full opacity.

**Implication:** There is no way to get the `#` transparency effect in exported OFF/STL/AMF files. This is a fundamental design decision in OpenSCAD, not a limitation of this app.

**Current behavior:** When `#` is detected, the app creates a dual-render: two meshes in a `THREE.Group` — the normal mesh with real COFF per-face colors (or theme default for plain OFF) and a semi-transparent `#ff5151` pink overlay at ~50% opacity. This matches desktop OpenSCAD's F5 preview behavior where `#`-marked geometry is rendered twice (normal + transparent pink). The `#` modifier alone (without `color()`) now routes to OFF format and triggers dual-render. Implemented in Phase 3 of the parity remediation plan.

---

## Color Parameter Legend (Supplementary)

In addition to COFF per-face colors, the app provides a **color parameter legend**:

- When a SCAD file has **two or more** color-type parameters (e.g., `keyguard_color`, `frame_color`), a small legend appears in the bottom-left of the 3D preview.
- The legend shows each color parameter's name alongside a swatch of its current value.
- The legend updates when parameters change.

This complements the per-face colors by giving the user a named reference for each color parameter.

---

## Full Render Color Passthrough (2026-03-15)

Previously, the Generate button (full render) always requested STL from the WASM
engine. Since STL carries no color data, the app used `shouldPreserveColorPreview`
to keep the draft-quality colored mesh in the viewer instead of loading the
full-quality STL result. This meant users saw draft-quality geometry after a full
render.

**Current behavior:** When `color_passthrough` is enabled and the SCAD source
contains `color()` calls or `#` debug modifiers, `renderFull()` now passes
`outputFormat: 'off'` to the worker. The worker renders with
`--enable=render-colors`, producing COFF with per-face colors. The full-quality
COFF is loaded into the 3D viewer via `loadOFF()`, replacing the draft preview
with full-quality colored geometry.

**Download path:** After the OFF render updates the preview, a second STL render
runs to populate `fullQualitySTL` for download via `getCurrentFullSTL()`. This
dual-render approach ensures the download file is always in the user-selected
format (typically STL) while the preview shows full-quality multi-color geometry.

**`shouldPreserveColorPreview` is no longer the primary mechanism.** It remains
as a safety net for edge cases where the full render result is STL and the current
preview has vertex colors (e.g., if color passthrough is disabled mid-render).

**Verification (Phase 2 E2E):** The `full-render-color.spec.js` test confirms:
- Draft preview shows 2+ color groups (red + green) via pixel sampling.
- After Generate, full render preview still shows 2+ color groups.
- Console logs confirm `hasColors=true` appears for both draft and full render.
- Download file is valid binary STL (not OFF), with non-zero triangle count.

---

## Implementation Status (2026-03-15)

Color passthrough is **fully enabled** (`rollout: 100`, `killSwitch: false`).

### What was built

| Component | File | Description |
|-----------|------|-------------|
| Feature flag | `src/js/feature-flags.js` | `color_passthrough` flag, rollout=100, kill-switch disabled |
| SCAD color detector | `src/js/auto-preview-controller.js` | `AutoPreviewController.scadUsesColor()` static method |
| OFF/COFF parser | `src/js/preview.js` | `PreviewManager.loadOFF()` — parses OFF with inline colors, builds vertex-colored geometry |
| Pipeline routing (preview) | `src/js/auto-preview-controller.js` | `renderPreview()` passes `outputFormat: 'off'` when flag+color detected; chooses `loadOFF` vs `loadSTL` based on `result.format` |
| Pipeline routing (full render) | `src/js/auto-preview-controller.js` | `renderFull()` passes `outputFormat: 'off'` when flag+color detected; loads COFF via `loadOFF()` for preview, then runs a second STL render for download |
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
- **Mixed colored/uncolored faces:** If some faces have inline color and others do not, `colors.length < positions.length`, and the color attribute is silently dropped. The entire mesh falls back to solid theme color. This does not occur in practice (OpenSCAD wraps all geometry in `color()` calls), but is a latent fragility.
- **First-face-black edge case:** If the first face has RGB (0,0,0), `Math.max(0,0,0) = 0 ≤ 1` selects float scale, causing subsequent integer values (e.g., 255) to be used unscaled. Three.js clamps to 1.0, rendering all non-black colors as white. Not triggered by any current keyguard scenario.
- **Full render dual-render cost:** When color passthrough is active, `renderFull()` performs two WASM renders — first OFF for the preview, then STL for download. This doubles the render time for the Generate button. A future optimization could derive STL client-side from the parsed OFF geometry.

---

## Future Work

1. ~~**Verify COFF output**~~ — Done (2026-03-10). COFF confirmed working.
2. ~~**Increase rollout to 100**~~ — Done (2026-03-10). Kill-switch disabled.
3. Consider automatic format selection based on `result.format` from the worker (rather than pre-flight regex scan), so detection is perfectly accurate.
4. ~~**Implement `#` debug modifier dual-render**~~ — Done (Phase 3). Normal COFF colors + semi-transparent pink overlay in a `THREE.Group`.
5. ~~**Final verification**~~ — Done (2026-03-12). 1982 tests pass, 0 failures. All 16 parity scenarios verified.
6. ~~**Multi-color COFF verification**~~ — Done (2026-03-14). Multi-color passthrough verified end-to-end. 2069 tests pass, 0 failures.
7. ~~**Full render color passthrough**~~ — Done (2026-03-15). `renderFull()` now routes through OFF when color passthrough is active. Dual-render: OFF for preview, STL for download. 2075 unit tests pass, E2E verified.
8. Color legend showing actual per-face COFF colors instead of SCAD parameter-derived colors.
9. Alpha channel passthrough (COFF alpha is currently ignored).
10. First-face-black edge case fix in color scale detection (use global max instead of first-face max).
11. Material-per-face-group architecture (if vertex colors prove insufficient for complex multi-color meshes).
12. Dual-format caching: cache both OFF and STL from a single WASM render to avoid the second STL render in the full render path.

---

## S-013: WASM Image Support (`surface()` with PNG)

### Layer 2 — Binary File Mount (Resolved)

The `mountFiles()` function in `openscad-worker.js` previously passed file content
through `TextDecoder`, corrupting binary files like PNG images. This was fixed by
detecting binary content (via BOM/magic-byte heuristic) and writing raw
`Uint8Array` data to the WASM filesystem. Unit tests confirm binary round-trip
fidelity.

### Layer 1 — `surface()` Image Support (WASM Build Dependent)

OpenSCAD's `surface(file = "image.png")` command requires `libpng` to be compiled
into the binary. Whether the current WASM build (`OpenSCAD-2025.03.25.wasm24456`)
includes `libpng` is **unverified at runtime**.

**Manual verification steps:**

1. Start the dev server (`pixi run dev` or `npm run dev`)
2. Upload `tests/fixtures/surface-image-test.scad` along with companion files:
   - `tests/fixtures/test-heightmap.dat` (text heightmap — should always work)
   - `tests/fixtures/test-image.png` (image heightmap — requires libpng)
3. Set the `show_mode` parameter to `"png"` or `"both"`
4. Check the browser console for errors:
   - **Success:** A 3D surface renders from the PNG data
   - **Failure:** `WARNING: Can't open file 'test-image.png'` or silent empty geometry

**Known limitation:** If the WASM build lacks `libpng`, `surface()` with image
files will silently produce empty geometry. Users should use `.dat` text heightmaps
as a reliable alternative. This is a compile-time constraint of the upstream
OpenSCAD WASM distribution, not a bug in this application.

---

## References

- [OFF Format Specification](https://en.wikipedia.org/wiki/OFF_(file_format))
- [OpenSCAD color() documentation](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color)
- [OpenSCAD # modifier](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#%23_Debug_modifier)
- OpenSCAD WASM build: `OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip`
