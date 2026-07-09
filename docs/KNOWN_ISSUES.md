# Known Issues

Things we know about but haven't fixed yet, along with workarounds you can use in the meantime. If you hit something not listed here, please [open an issue](https://github.com/BrennenJohnston/openscad-assistive-forge/issues).

**Last updated**: 2026-07-05

---

## Current Issues

### High Priority

#### KI-001: Complex Models May Cause Memory Issues

**Status**: Acknowledged (by design)  
**Affected**: All browsers  
**Severity**: Medium

**Description**: Models with very high polygon counts (>200,000 triangles) may cause the browser to run out of memory, especially on devices with limited RAM.

**Workaround**:
1. Reduce `$fn` parameter values (e.g., from 128 to 32)
2. Use the "Reduce Quality" button when memory warnings appear
3. Export your work before attempting very complex renders
4. Use a desktop browser with more available memory

**Root Cause**: WebAssembly memory constraints in browser environments.

---

#### KI-002: Code Editor AT Limitations

**Status**: Documented  
**Affected**: Expert Mode with screen readers  
**Severity**: Medium

**Description**: The CodeMirror 6 code editor has some limitations with certain assistive technology configurations, particularly with JAWS in some browser combinations.

**Workaround**:
1. Enable "Use accessible text editor" in Settings
2. The textarea fallback provides full AT compatibility
3. All editing features remain available

**Root Cause**: CodeMirror's complex DOM structure can interfere with some AT navigation patterns.

---

### Medium Priority

#### KI-003: Firefox WebGL Context Differences

**Status**: Monitoring  
**Affected**: Firefox  
**Severity**: Low

**Description**: Firefox may occasionally report different WebGL capabilities than Chrome/Edge, potentially affecting preview rendering quality.

**Workaround**: If preview looks incorrect, try refreshing the page or switching to Chrome/Edge.

**Root Cause**: Browser-specific WebGL implementations.

---

#### KI-004: Safari SharedArrayBuffer Performance

**Status**: Documented  
**Affected**: Safari 15.2-16.x  
**Severity**: Low

**Description**: Safari versions 15.2-16.x may show slower rendering performance compared to Chrome due to SharedArrayBuffer implementation differences.

**Workaround**: None required - functionality is correct, just slower.

**Root Cause**: Safari's SharedArrayBuffer implementation has different performance characteristics.

---

#### KI-005: Mobile Touch Gesture Conflicts

**Status**: Acknowledged  
**Affected**: Mobile browsers  
**Severity**: Low

**Description**: On mobile devices, pinch-to-zoom and rotate gestures may occasionally conflict with browser-level gestures.

**Workaround**: 
1. Use the on-screen rotation controls
2. Double-tap to reset the view
3. Use landscape orientation for more control space

**Root Cause**: Browser gesture handling varies by platform.

---

#### KI-012: LWFL Keyguard Geometry Discrepancies vs Desktop OpenSCAD

**Status**: Resolved (2026-04-06)  
**Affected**: LWFL keyguard preset in web app  
**Severity**: Medium

**Description**: Two geometry rendering bugs in the LWFL keyguard preset produced output that differed from desktop OpenSCAD:

- **Bug A — Home button tab persists when disabled:** Setting `expose_home_button = "no"` left a tab jutting out along the right edge.
- **Bug B — Ghost cutouts when upper message bar disabled:** Setting `expose_upper_message_bar = "no"` left partial square cutouts near grid positions #1 and #12.

**Root cause**: `applyCompanionAliases()` in `zip-handler.js` used overwrite semantics — when the ZIP already contained a root-level `openings_and_additions.txt`, the function replaced it with preset-specific content. This changed what SCAD `include` directives resolved to, producing wrong geometry. The fix adds `!result.has(target)` guards so aliases only create missing root keys, never replace existing ones.

**Resolution**: A 3-line guard addition converting `applyCompanionAliases()` from overwrite to create-only semantics. The parameter dropout fix in `ui-generator.js` (seeding `currentValues` from `initialValues`) was also discovered during the investigation.

**Investigation history**: Five prior investigation plans incorrectly attributed the issue to the upstream Manifold WASM engine based on code-level analysis alone. The successful investigation used captured-input comparison against desktop CLI and `git bisect` to identify the true root cause. See `docs/audit/ki-012-investigation/findings-report.md` for the full write-up.

**Developer toggles for diagnosis** (via browser console):
- `localStorage.setItem('openscad-forge-debug-preview-parity', '1')` — bypass preview overrides for A/B parity comparison
- `localStorage.setItem('openscad-forge-debug-desktop-quality', '1')` — use desktop-equivalent quality for preview
- `localStorage.setItem('openscad-forge-debug-no-csg-colors', '1')` — disable CSG color injection
- `localStorage.setItem('openscad-forge-debug-source-overrides', '1')` — bake parameters into source

---

### Low Priority

#### KI-006: Parameter Groups Without Parameters

**Status**: Cosmetic  
**Affected**: All browsers  
**Severity**: Low

**Description**: If an OpenSCAD file defines a parameter group comment but no customizer parameters follow it, an empty group header may appear.

**Workaround**: Edit the OpenSCAD file to remove empty group comments.

**Root Cause**: Parser handles groups and parameters independently.

---

#### KI-007: Very Long Parameter Names

**Status**: Cosmetic  
**Affected**: All browsers  
**Severity**: Low

**Description**: Parameter names exceeding 50 characters may be truncated in the UI.

**Workaround**: Use the tooltip (hover) to see the full name, or use shorter parameter names.

**Root Cause**: UI layout constraints.

---

#### KI-010: S-013 Surface Image Support — WASM Layer Unverified

**Status**: Layer 2 fix applied; Layer 1 requires manual runtime verification
**Affected**: `surface()` function with PNG/JPEG companion files
**Severity**: Low

**Description**: Phase 9 of the parity remediation fixed a Layer 2 bug where image companion files were mounted to the Emscripten virtual FS as data-URL strings instead of binary `Uint8Array` data. Whether the current WASM build includes `libpng` for `surface()` image rendering is unknown.

**How to verify (manual, requires a browser)**:
1. Start the dev server: `pixi run dev`
2. Open http://localhost:5173 and upload `tests/fixtures/surface-image-test.scad` together with a PNG companion file (use the folder-import or ZIP path so both files mount)
3. Open the browser console (F12) and trigger a render
4. If the console shows `Can't open` errors for the PNG, the WASM build lacks `libpng`; if the surface renders with height variation, image support works

**If WASM lacks libpng**: This is a Layer 1 limitation requiring a WASM rebuild. No JavaScript-layer fix is possible.

---

## Resolved Issues

### Code Review Remediation (2026-07-05)

| Issue | Description | Resolution |
|-------|-------------|------------|
| KI-009 | E2E tests needed combobox-aware preset selectors | `tests/e2e/helpers/preset-helpers.js` provides `selectPreset()` with combobox/native auto-detection, and the preset-touching specs use it; `preset-workflow.spec.js` adds combobox-enabled coverage by force-enabling the flag (`?flag_searchable_combobox=true`). Remaining nice-to-have: combobox-enabled runs of more specs. |
| KI-011 | Quoted `include "file"` / `use "file"` paths not detected by missing-file warnings | Already detected: `generateMissingFileWarnings()` (now in `src/worker/missing-file-warnings.js`, shared with unit tests) uses `/(?:include\|use)\s*(?:<([^>]+)>\|"([^"]+)")/g`, and the quoted-path cases are unit-tested. This entry's earlier claimed location (`file-param-resolver.js`) was also incorrect. |

### v4.3.0 CI Stabilization (2026-03-20)

| Issue | Description | Resolution |
|-------|-------------|------------|
| KI-008 | Firefox and WebKit E2E suites non-blocking in CI | Parallel workers (2), per-project timeout increases (90 s test / 15 s action / 45 s navigation), Liberation font caching, `continue-on-error` removed |

### Parity Remediation (2026-03-12)

All 16 desktop parity scenarios audited; 14 fully resolved, 1 partially resolved (S-013 Layer 1 pending runtime verification). See `docs/audit/parity-remediation-validation-report.md` for the full write-up.

| Scenario | Description | Resolution |
|----------|-------------|------------|
| S-001–S-004, S-006 | COFF per-face colors not shown in WASM preview | `--enable=render-colors` flag + COFF parser fix |
| S-005 | `#debug` modifier geometry invisible in preview | Dual-render: normal mesh + pink THREE.Group overlay |
| S-007 (BUG-B) | Blank viewport for non-previewable render modes | Mode guard added in render-controller |
| S-008 (BUG-C) | Console interaction spontaneously triggered renders | Render guard decoupled from console state |
| S-009 | No one-click SVG/DXF export | File > Export As SVG/DXF + guidance animation |
| S-010 | Console and Error Log were separate panels | Unified Console with Log/Structured views |
| S-011 | No rendering indicator during auto-preview | Non-blocking toast + pulsing badge |
| S-012 | Missing-file errors were silent | Synthetic warnings in desktop console format |
| S-014 (BUG-A) | Sequential renders could overlap via `_callMainInvoked` | Guard added; sequential renders now serialised |
| S-016 | Grid opacity not adjustable | Grid opacity slider with localStorage persistence |

### v4.1.0 → v4.2.0

| Issue | Description | Resolution |
|-------|-------------|------------|
| Vector parameters not supported | `[x,y,z]` style parameters were shown as text | Vector UI component added |
| No code editing capability | Users couldn't modify OpenSCAD code | Expert Mode implemented |
| Memory crashes without warning | App would crash on complex models | Graceful degradation UI added |

---

## Reporting New Issues

### Before Reporting

1. Check this document for known issues
2. Search [existing GitHub issues](https://github.com/openscad/openscad-assistive-forge/issues)
3. Try the issue in a Tier 1 browser (Chrome or Edge)
4. Clear browser cache and try again

### How to Report

Create a [new GitHub issue](https://github.com/openscad/openscad-assistive-forge/issues/new) with:

1. **Browser**: Name, version, operating system
2. **Steps to reproduce**: Numbered list of actions
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Error messages**: From browser console (F12 → Console tab)
6. **OpenSCAD file**: If applicable, attach a minimal example

### Issue Template

```markdown
## Description
[Brief description of the issue]

## Environment
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]
- Screen reader: [if applicable]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

## Expected Behavior
[What should happen]

## Actual Behavior
[What happens instead]

## Console Errors
```
[Paste any errors from browser console]
```

## Additional Context
[Any other relevant information]
```

---

## Issue Status Definitions

| Status | Meaning |
|--------|---------|
| **Acknowledged** | Issue confirmed, solution planned |
| **Documented** | Known limitation with workaround |
| **Monitoring** | Under observation, may resolve |
| **Investigating** | Actively being researched |
| **In Progress** | Fix being developed |
| **Resolved** | Fixed in specified version |
| **Won't Fix** | Cannot be fixed or by design |

---

## Contact

For urgent issues affecting accessibility or security, please follow the contact procedures in [SECURITY.md](../SECURITY.md).
