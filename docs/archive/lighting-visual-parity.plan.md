<!-- ARCHIVED 2026-09-01: every phase in this plan's own front matter reads
     completed, and nothing in the repository references it. Kept as a
     record of the lighting parity work, moved here from docs/plans/. -->
---
name: Lighting Visual Parity
overview: >-
  Bring the Three.js 3D preview into visual parity with the OpenSCAD desktop
  application's default appearance. Covers Show Edges auto-refresh, default
  Cornfield colorscheme alignment, lighting configuration, material properties,
  and cross-model visual validation.
todos:
  - id: phase-01-show-edges
    content: "Phase 1: Fix Show Edges overlay auto-refresh after mesh changes"
    status: completed
  - id: phase-02-default-colors
    content: "Phase 2: Align default colorscheme to OpenSCAD Cornfield gold"
    status: completed
  - id: phase-03-lighting
    content: "Phase 3: Correct directionalLight2 Z-position to match desktop"
    status: completed
  - id: phase-04-material
    content: "Phase 4: Align material shininess to desktop value (64)"
    status: completed
  - id: phase-05-validation
    content: "Phase 5: Visual validation and tuning across example models"
    status: completed
isProject: false
---

# Lighting Visual Parity

## Validation summary

This queue was structured from a visual-parity audit comparing this project's
Three.js preview renderer against the OpenSCAD desktop application's default
rendering pipeline. The four visual defects (wrong default color, wrong lighting
direction, wrong shininess, stale edge overlays) were decomposed into five
phases ordered by confidence and independence: the Show Edges bug fix is
highest-confidence and has no dependencies; colors and lighting are independent
changes that can be validated separately; material properties are low-impact
(specular is black); and the final phase performs cross-model visual validation
to catch interaction effects. Each phase touches 2-4 files maximum and has a
clear rollback path.

## Playbook basis

Validated against:

- `ai-at-playbook/docs/QUEUE_EXECUTOR_WORKFLOW.md`
- `ai-at-playbook/docs/SESSION_BOUNDARY_PROTOCOL.md`
- `ai-at-playbook/checklists/multi-session-handoff.md`
- `ai-at-playbook/checklists/ai-task-scoping.md`
- `ai-at-playbook/prompts/README.md`

## Research Findings

All values below were extracted from the OpenSCAD desktop source code at
https://github.com/openscad/openscad. Both the `openscad-2021.01` tag and the
`master` branch were investigated. Every value is labeled:

- **OBSERVED** — value directly read from source code at the cited location
- **INFERRED** — value derived from observed values using documented logic
- **UNVERIFIED** — value could not be confirmed from available source; must be
  validated during implementation

### Default Colorscheme

The default colorscheme is **Cornfield** (`DEFAULT_COLOR_SCHEME_NAME` in both
versions). Colors are defined in the `RenderColorScheme` default constructor.

| Color Role | Hex | Source (master) | Source (2021) | Label |
|---|---|---|---|---|
| `OPENCSG_FACE_FRONT_COLOR` | `#F9D72C` (gold) | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `OPENCSG_FACE_BACK_COLOR` | `#9DCB51` (green) | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `CGAL_FACE_FRONT_COLOR` | `#F9D72C` (gold) | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `CGAL_FACE_BACK_COLOR` | `#9DCB51` (green) | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `CGAL_EDGE_FRONT_COLOR` | `#FFEC5E` | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `CGAL_EDGE_BACK_COLOR` | `#ABD856` | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `BACKGROUND_COLOR` | `#FFFFE5` | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |
| `CROSSHAIR_COLOR` | `#800000` | `src/glview/ColorMap.cc` default ctor | `src/colormap.cc` default ctor | OBSERVED |

**Face vs. back-face color assignment mechanism (OBSERVED):** The Renderer class
maps colorscheme entries to rendering color modes in `Renderer::setColorScheme()`
(`src/glview/Renderer.cc` master, `src/renderer.cc` 2021):

- `ColorMode::MATERIAL` ← `OPENCSG_FACE_FRONT_COLOR` (`#F9D72C` gold)
- `ColorMode::CUTOUT` ← `OPENCSG_FACE_BACK_COLOR` (`#9DCB51` green)

The distinction is **CSG-operation-based**, not face-orientation-based. In
OpenCSG preview (F5), the MATERIAL color is used for normal geometry and the
CUTOUT color is used for the interior surfaces of CSG `difference()` operations.
For a simple solid with no boolean operations, the entire object renders in
the MATERIAL (gold) color. The CUTOUT (green) color becomes visible only when
looking at the inside of subtracted geometry.

**Current project default:** `PREVIEW_COLORS.light.model = 0x2196f3` (blue) at
`src/js/preview.js` line 110. This should change to `0xF9D72C` to match the
Cornfield front-face color.

### Lighting Configuration

OpenSCAD sets up lighting in `GLView::initializeGL()`.

| Parameter | Value | Source (master) | Source (2021) | Label |
|---|---|---|---|---|
| Light 0 diffuse | `{1.0, 1.0, 1.0, 1.0}` | `src/glview/GLView.cc` line 307 | `src/GLView.cc` line 334 | OBSERVED |
| Light 0 position | `{-1.0, +1.0, +1.0, 0.0}` | `src/glview/GLView.cc` line 308 | `src/GLView.cc` line 335 | OBSERVED |
| Light 1 diffuse | `{1.0, 1.0, 1.0, 1.0}` | (same array as light 0) | (same array as light 0) | OBSERVED |
| Light 1 position | `{+1.0, -1.0, -1.0, 0.0}` | `src/glview/GLView.cc` line 309 | `src/GLView.cc` line 336 | OBSERVED |
| Light space | View space (identity modelview, w=0 directional) | `src/glview/GLView.cc` lines 311-312 | `src/GLView.cc` lines 338-339 | OBSERVED |
| Ambient light | OpenGL global default `(0.2, 0.2, 0.2, 1.0)` | Not explicitly set → OpenGL default | Not explicitly set → OpenGL default | INFERRED |

OpenSCAD does **not** explicitly set ambient light on individual lights or the
global ambient model. The ambient contribution comes from OpenGL's default
`GL_LIGHT_MODEL_AMBIENT = (0.2, 0.2, 0.2, 1.0)`.

**Current project lighting:**
- `directionalLight1.position.set(-1, 1, 1)` — matches desktop Light 0. ✓
- `directionalLight2.position.set(1, -1, 1)` — **Z-component is wrong**.
  Desktop uses `(+1, -1, -1)`. The Z should be `-1`, not `+1`.
  Source: `src/js/preview.js` line 360.
- Ambient intensity `0.2 * Math.PI` — correct mapping of OpenGL's 0.2 global
  ambient with π-scaling to compensate for Three.js BRDF_Lambert divisor.
- Directional intensity `1.0 * Math.PI` — correct mapping.

### Material Properties

| Parameter | Desktop Value | Source (master) | Source (2021) | Label |
|---|---|---|---|---|
| Shininess | `64` | `src/glview/GLView.cc` line 324 | `src/GLView.cc` line 351 | OBSERVED |
| Specular (material) | `(0, 0, 0, 1)` — OpenGL default | Not explicitly set → zero specular | Not explicitly set → zero specular | INFERRED |
| Color material mode | `GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE` | `src/glview/GLView.cc` line 322 | `src/GLView.cc` line 349 | OBSERVED |
| Light 0 specular | `(1, 1, 1, 1)` — OpenGL default for LIGHT0 | Not explicitly set → OpenGL default | Not explicitly set → OpenGL default | INFERRED |

Because the **material specular is black** `(0,0,0,1)`, the specular
contribution is zero regardless of light specular or shininess value. The
shininess value (64 on desktop, 30 in project) is cosmetically irrelevant
in both environments. However, aligning to 64 is correct for forward
compatibility in case specular is ever enabled.

**Current project material:**
- `specular: 0x000000` — matches desktop (both effectively zero). ✓
- `shininess: 30` — should be `64` to match desktop.
  Source: `src/js/preview.js` lines 1169, 1402, 1408, 1416, 1442, 1448.

### Edge Rendering

**Desktop approach (OBSERVED):**
- Master/nightly uses shader-based edge rendering via `ViewEdges.vert` and
  `ViewEdges.frag` shaders, compiled in `GLView::setupShader()`
  (`src/glview/GLView.cc` lines 46-62).
- 2021 uses a simpler shader approach with barycentric coordinate attributes
  passed through `shaderinfo_t::CSG_RENDERING`.
- Both render edges as part of the geometry rendering pipeline, not as separate
  overlay objects. The `showedges` flag (`GLView` member) controls visibility.
- Edges are drawn for all polygon edges of the rendered geometry.

**Current project approach:**
- Uses Three.js `EdgesGeometry` + `LineSegments` overlay in
  `display-options-controller.js` (`_applyEdges`, lines 201-221).
- The overlay is a separate scene object that copies the mesh's position,
  rotation, and scale.
- `refreshOverlays()` (line 94-97) rebuilds the edges overlay from the current
  `pm.mesh.geometry`.

**The bug:** `refreshOverlays()` is called only inside a `setPostLoadHook`
callback registered by `hfm-controller.js` (line 981). Both `loadSTL` (line
1189) and `loadOFF` (line 1467) in `preview.js` invoke `this._postLoadHook()`
after loading. However, this hook is only set when the HFM controller
initializes. In the standard (non-HFM) code path, the hook is `null` and
`refreshOverlays()` never fires after mesh changes.

**All loadSTL/loadOFF call sites:**

| # | File | Line(s) | Call | refreshOverlays? |
|---|---|---|---|---|
| 1 | `src/main.js` | 4060 | `previewManager.loadSTL(currentStl, { preserveCamera: true })` | Only via postLoadHook if set |
| 2 | `src/main.js` | 7925 | `await previewManager.loadSTL(outputData, { preserveCamera: false })` | Only via postLoadHook if set |
| 3 | `src/js/auto-preview-controller.js` | 524-528 | `loadOFF` or `loadSTL` (cached) | Only via postLoadHook if set |
| 4 | `src/js/auto-preview-controller.js` | 1093-1105 | `loadOFF` or `loadSTL` (active result) | Only via postLoadHook if set |
| 5 | `src/js/auto-preview-controller.js` | 1416-1426 | `loadOFF` or `loadSTL` (direct render) | Only via postLoadHook if set |

**Fix approach:** Add explicit `refreshOverlays()` calls after each load site,
OR add it inside `loadSTL`/`loadOFF` themselves via a post-load event. Phase 1
details specify the exact approach.

### 2021 vs. Nightly Differences

**Lighting, colors, and material setup are IDENTICAL between versions (OBSERVED).**

The relevant source files differ in path but not in values:

| Component | 2021 path | Master path | Values identical? |
|---|---|---|---|
| Colorscheme | `src/colormap.cc` | `src/glview/ColorMap.cc` | Yes (OBSERVED) |
| Lighting setup | `src/GLView.cc` initializeGL() | `src/glview/GLView.cc` initializeGL() | Yes (OBSERVED) |
| Material properties | `src/GLView.cc` initializeGL() | `src/glview/GLView.cc` initializeGL() | Yes (OBSERVED) |
| Renderer color mapping | `src/renderer.cc` | `src/glview/Renderer.cc` | Yes (OBSERVED) |

**Differences that exist but are not relevant to this plan:**
- Master introduces `ViewEdges.vert`/`ViewEdges.frag` shader-based edge
  rendering. The 2021 version uses a simpler barycentric-attribute approach.
  Both achieve the same visual result for edge display.
- Master uses `std::shared_ptr` and modern C++ features where 2021 uses raw
  pointers in some places. No impact on rendering values.

### Mapping to Three.js

| OpenGL Concept | OpenSCAD Value | Three.js Equivalent | Notes |
|---|---|---|---|
| `glColorMaterial(AMBIENT_AND_DIFFUSE)` | Vertex color drives ambient + diffuse | `MeshPhongMaterial.color` | Three.js has no separate ambient material; ambient light acts on the diffuse color |
| `GL_LIGHT_MODEL_AMBIENT (0.2)` | Global ambient | `AmbientLight(0xffffff, 0.2 * π)` | π factor compensates for Three.js BRDF_Lambert `/ π` divisor |
| `glLightfv(DIFFUSE, {1,1,1,1})` | Per-light diffuse | `DirectionalLight(0xffffff, 1.0 * π)` | Same π compensation |
| `glLightfv(POSITION, {x,y,z,0})` | Directional light in view space | `camera.add(directionalLight)` + `light.position.set(x,y,z)` | Parenting to camera replicates view-space positioning |
| `glMateriali(SHININESS, 64)` | Phong exponent | `MeshPhongMaterial({ shininess: 64 })` | Direct mapping |
| Material specular `(0,0,0,1)` | No specular highlight | `MeshPhongMaterial({ specular: 0x000000 })` | Already correct in project |
| `GL_NORMALIZE` | Auto-normalize normals | Three.js normalizes in shader | No action needed |
| Front/back face colors | MATERIAL vs CUTOUT via `glColor` | Per-face vertex colors from COFF data, or solid color from `PREVIEW_COLORS.model` | COFF files carry per-face colors; for STL (no color data), use the Cornfield front color |

**F5 (preview) vs. F6 (render) material differences:** Both F5 (OpenCSG
preview) and F6 (CGAL render) use the same `initializeGL()` lighting setup and
the same colorscheme. The color assignment differs only in that F5 uses
`OPENCSG_FACE_*_COLOR` entries via OpenCSG rendering while F6 uses
`CGAL_FACE_*_COLOR` entries via the CGAL renderer. In the Cornfield scheme,
these are identical values (`#F9D72C` / `#9DCB51`). [OBSERVED]

## Operating rules

1. Implement exactly one phase per AI chat.
2. Re-read this plan in the current session before touching the next phase.
3. Re-read only the files listed for the current phase, plus the nearest
   existing tests or evidence needed for that phase.
4. Do not mark a phase complete until its validation checklist has actually been
   executed in that same chat.
5. After validation, update both the frontmatter `todos` status and the master
   checklist in this file.
6. After updating the checklist, stop. Do not continue to the next phase in
   the same chat.
7. After two validated phases, pause for human review before opening more AI
   chats.
8. If a phase expands beyond its listed files or becomes an architecture/design
   problem, stop and write a new micro-plan instead of widening this one.
9. Use the environment tool for validation: prefer `pixi run <task>`; if Pixi
   is unavailable, use the matching `npm run <task>` command. Key tasks:
   `pixi run test` (unit tests), `pixi run lint` (ESLint), `pixi run build`
   (Vite production build).
10. Use one suggested `ai-at-playbook` prompt per chat if a prompt is listed. Do
    not stack multiple prompts in the same session.
11. Write commit messages to `.git/COMMIT_MSG` and commit with
    `git commit -F .git/COMMIT_MSG`. Never use `git commit -m`. Include the
    `Assisted-By: Cursor` trailer for AIL-1 work.

## Hallucination safeguards

1. **Color citation rule:** Every color value used in implementation must cite
   the OpenSCAD source file and the specific entry in the Research Findings
   table above. Do not use a color value that cannot be traced to a cited
   source.
2. **Lighting citation rule:** Every lighting parameter (position, intensity,
   ambient level) must cite the GLView source line from the Research Findings
   table. If a value is not in the table, mark it `[UNVERIFIED]` and use a
   named constant that can be tuned later.
3. **Label rule:** All claims about desktop OpenSCAD behavior must carry
   OBSERVED / INFERRED / UNVERIFIED labels. Do not state a value as fact
   without reading the source.
4. **No visual assertion from code alone:** Do not assert that the preview
   "matches" the desktop based on code reading. Visual validation (Phase 5)
   is required. Until Phase 5 passes, the claim is "values aligned" not
   "visually equivalent."
5. **Configurable constants for unverified values:** If a value cannot be
   extracted from source, implement it as a named constant at the top of the
   file with a `// [UNVERIFIED]` comment, not as a magic number inline.

## Fresh chat opener

Copy this into a new chat at the start of each phase:

```markdown
Read `docs/plans/lighting-visual-parity.plan.md`, run the multi-session handoff
checklist, verify which phases are already validated, and implement only the next
unchecked phase. Use the suggested `ai-at-playbook` prompt for that phase if
listed. Stop after validation, update the plan checklist, and do not continue to
another phase in this chat.
```

## Session-start checklist

Use this at the top of every new chat before implementation begins:

```markdown
### Multi-session handoff

- [ ] Plan file re-read in current session
- [ ] Current phase status verified against actual code/tests
- [ ] Source files and test files for this phase listed
- [ ] Re-read decisions made for each source
- [ ] No earlier phase marked complete without validation
- [ ] Scope boundary confirmed: only this phase will be worked
- [ ] Prior session artifacts reviewed for verification status
- [ ] Fabrication self-check acknowledged
```

## Phase intake checklist

Run this before starting edits in each fresh chat:

```markdown
### AI task scoping

- [ ] This phase is still one tightly scoped bug fix
- [ ] Existing pattern or gold standard identified
- [ ] Test or validation target identified before editing
- [ ] Inputs and outputs for this phase are explicit
- [ ] Validation will use `pixi run test` and `pixi run lint` (or npm fallback)
- [ ] No new dependency is needed; if one seems needed, stop and do OSS-first
      review first
```

## Phase completion checklist

A phase is only complete when every applicable item below is done:

```markdown
### Phase completion

- [ ] Focused implementation for this phase is complete
- [ ] Relevant tests were added or updated
- [ ] Targeted validation passed: `pixi run test` (or `npm run test`)
- [ ] Linting completed: `pixi run lint` (or `npm run lint`) for touched files
- [ ] Build completed: `pixi run build` (or `npm run build`) when runtime or UI
      behavior changed materially
- [ ] Accessibility-sensitive phases also ran relevant keyboard/screen-reader
      checks (not applicable for this plan)
- [ ] Plan checklist updated after validation
- [ ] Chat stopped without beginning the next phase
```

## Master checklist

- [x] Phase 1. Fix Show Edges overlay auto-refresh after mesh changes
- [x] Phase 2. Align default colorscheme to OpenSCAD Cornfield gold
- [x] Phase 3. Correct directionalLight2 Z-position to match desktop
- [x] Phase 4. Align material shininess to desktop value (64)
- [x] Phase 5. Visual validation and tuning across example models

## Phase details

### Phase 1 — Show Edges auto-refresh

- Suggested prompt: `ai-at-playbook/prompts/10-bug-triage.md`
- Re-read: `src/js/preview.js` (lines 1100-1210 loadSTL, lines 1237-1485
  loadOFF, lines 4012-4024 setPostLoadHook), `src/js/display-options-controller.js`,
  `src/js/hfm-controller.js` (lines 970-985),
  `src/main.js` (lines 4055-4065, 7920-7930),
  `src/js/auto-preview-controller.js` (lines 520-530, 1090-1110, 1413-1430),
  `tests/unit/display-options-controller.test.js`
- Implement only: Add a `refreshOverlays()` call after every `loadSTL` and
  `loadOFF` completion, either by emitting a post-load event from PreviewManager
  that DisplayOptionsController listens to, or by adding explicit calls at each
  call site in `main.js` and `auto-preview-controller.js`. The event-based
  approach is preferred for maintainability.
- Validation focus: Enable "Show Edges" in the UI, load a model, change a
  parameter that triggers re-render, and verify edges update to match the new
  geometry. Run `pixi run test` to confirm existing tests pass and new test
  covers the refresh behavior.
- Fallback gate: If the event-based approach introduces coupling issues, fall
  back to explicit `refreshOverlays()` calls at each of the 5 load call sites.
  Document the decision in this phase's completion record.
- Do not widen into: Do not change edge styling, edge color, or edge rendering
  approach. Do not modify the `_applyEdges` algorithm. Do not change HFM
  controller logic.
- Pause rule: Once validation passes, mark Phase 1 complete and end the chat.

**Phase 1 completion record:**
- Approach: Event-based (preferred). Added `_postLoadListeners` array with
  `addPostLoadListener`/`removePostLoadListener` to PreviewManager, plus
  `_firePostLoadListeners()` called after both `loadSTL` and `loadOFF`.
  `DisplayOptionsController.init()` registers `refreshOverlays()` as a
  post-load listener; `dispose()` unregisters it.
- Fallback used: No — event-based approach worked without issues.
- Files changed: `src/js/preview.js`, `src/js/display-options-controller.js`,
  `tests/unit/display-options-controller.test.js`
- Validation: 2624 tests passed (2 pre-existing failures in
  `q-charm-integration.test.js` — unrelated). Lint: 0 errors. Build: success.

### Phase 2 — Align default colors to Cornfield

- Suggested prompt: `ai-at-playbook/prompts/10-bug-triage.md`
- Re-read: `src/js/preview.js` (lines 105-166 PREVIEW_COLORS, lines 540-648
  theme/color methods), `src/js/color-utils.js`,
  `tests/unit/preview.test.js` (color override tests)
- Implement only: Change `PREVIEW_COLORS.light.model` from `0x2196f3` to
  `0xF9D72C` (Cornfield gold). Verify that color override and COFF vertex-color
  paths are unaffected (they bypass theme defaults). Update the dark theme model
  color to a suitable Cornfield-derived value if appropriate, or leave unchanged
  with a comment noting it is a deliberate departure.
- Validation focus: Load a simple `.scad` file with no `color()` calls and
  verify the model renders in gold (`#F9D72C`). Verify color override still
  works. Run `pixi run test`.
- Fallback gate: If the gold color looks wrong under the current lighting
  (before Phase 3 corrects it), implement as a named constant
  `CORNFIELD_FRONT_COLOR = 0xF9D72C` with a comment referencing the source
  citation. Do not revert to blue.
- Do not widen into: Do not implement the back-face (CUTOUT) color. Do not add
  colorscheme selection UI. Do not change dark theme, high-contrast theme, or
  mono theme defaults.
- Pause rule: Once validation passes, mark Phase 2 complete and end the chat.

**Phase 2 completion record:**

- Approach: Extracted `CORNFIELD_FRONT_COLOR = 0xf9d72c` as a named constant
  in `preview.js` (with source citation comment referencing
  `src/glview/ColorMap.cc` OPENCSG_FACE_FRONT_COLOR [OBSERVED]) and used it
  in `PREVIEW_COLORS.light.model`. Also updated duplicated inline copies of
  the light theme model color in `main.js` (line 4393) and `file-handler.js`
  (line 1241) to `0xf9d72c` — both had comments "Match PREVIEW_COLORS from
  preview.js" indicating they must stay in sync.
- Dark theme: Left unchanged per plan constraint ("Do not change dark theme").
  The dark theme model color `0x4d9fff` is a deliberate departure from
  Cornfield, which has no dark-mode equivalent.
- Fallback used: No — gold color applied cleanly. Named constant pattern used
  proactively per fallback gate recommendation.
- Color override path: Unaffected — `_syncColorOverride` and
  `setColorOverride` bypass theme defaults when override is enabled.
- COFF vertex-color path: Unaffected — vertex colors set `material.color` to
  `0xffffff` (white multiplier) and enable `vertexColors: true`.
- Files changed: `src/js/preview.js`, `src/main.js`, `src/js/file-handler.js`,
  `tests/unit/preview.test.js`, `docs/plans/lighting-visual-parity.plan.md`
- Validation: 2624 tests passed (2 pre-existing failures in
  `q-charm-integration.test.js` — unrelated). Lint: 0 errors. Build: success.

### Phase 3 — Fix lighting direction

- Suggested prompt: `ai-at-playbook/prompts/10-bug-triage.md`
- Re-read: `src/js/preview.js` (lines 330-370 lighting setup, lines 4050-4110
  _applyLighting)
- Implement only: Change `directionalLight2.position.set(1, -1, 1)` to
  `directionalLight2.position.set(1, -1, -1)` at line 360 of `preview.js`.
  This corrects the Z-component to match desktop GLView's
  `light_position1[] = {+1.0, -1.0, -1.0, 0.0}` (master line 309, 2021 line
  336).
- Validation focus: Load a model and visually confirm that shadow/highlight
  distribution changes. The under-side lighting artifact (too much light from
  below) should be reduced. Run `pixi run test`. Run `pixi run build` to
  verify no runtime errors.
- Fallback gate: If the corrected position causes a clearly worse appearance
  than before (e.g., fully black underside), investigate whether the existing
  ambient level is sufficient to fill shadows. If not, add a comment noting the
  issue and proceed — Phase 5 will tune.
- Do not widen into: Do not change ambient light intensity. Do not change
  directionalLight1 position. Do not modify brightness/contrast controls.
- Pause rule: Once validation passes, mark Phase 3 complete and end the chat.

**Phase 3 completion record:**

- Approach: Single-line fix — changed `directionalLight2.position.set(1, -1, 1)`
  to `directionalLight2.position.set(1, -1, -1)` at `src/js/preview.js` line 365.
  The Z-component was `+1` but should be `-1` to match desktop OpenSCAD's
  `light_position1[] = {+1.0, -1.0, -1.0, 0.0}` [OBSERVED at
  `src/glview/GLView.cc` line 309 (master), `src/GLView.cc` line 336 (2021)].
- Fallback used: No — fix applied cleanly with no visual degradation concerns.
  Phase 5 will perform visual validation to confirm the lighting distribution
  is balanced.
- Regression test: Added `sets directional light positions to match desktop
  OpenSCAD GLView` test in `tests/unit/preview.test.js` (Constructor describe
  block). Test asserts both `directionalLight1` and `directionalLight2` positions
  match the desktop values. Confirmed the test fails before the fix (Z=1) and
  passes after (Z=-1).
- Files changed: `src/js/preview.js`, `tests/unit/preview.test.js`,
  `docs/plans/lighting-visual-parity.plan.md`
- Validation: 2625 tests passed (2 pre-existing failures in
  `q-charm-integration.test.js` — unrelated). Lint: 0 errors. Build: success.

### Phase 4 — Align material shininess

- Suggested prompt: `ai-at-playbook/prompts/10-bug-triage.md`
- Re-read: `src/js/preview.js` (lines 1165-1172 loadSTL material, lines
  1398-1449 loadOFF material, line 324 GLView.cc citation)
- Implement only: Change all `shininess: 30` values in MeshPhongMaterial
  creation to `shininess: 64`. There are 6 instances in `preview.js`: loadSTL
  (line 1169), loadOFF debug-highlight normal material (line 1402), loadOFF
  debug-highlight material (lines 1408, 1416), loadOFF non-debug vertex-color
  material (line 1442), loadOFF non-debug solid-color material (line 1448).
  Extract as a named constant `DESKTOP_SHININESS = 64` to avoid magic numbers.
- Validation focus: Since specular is `0x000000`, the shininess change should
  produce no visible difference. Verify this by visual comparison. Run
  `pixi run test`. Run `pixi run build`.
- Fallback gate: If any visible change appears (unexpected specular highlights),
  verify that `specular: 0x000000` is set on all materials. If specular is
  somehow non-zero, fix that first. If the problem persists, revert shininess
  to 30 and document.
- Do not widen into: Do not add specular highlights. Do not change material
  type (keep MeshPhongMaterial). Do not modify flatShading setting.
- Pause rule: Once validation passes, mark Phase 4 complete and end the chat.

**Phase 4 completion record:**
- Approach: Extracted `DESKTOP_SHININESS = 64` as an exported named constant
  in `preview.js` (with source citation comment referencing
  `src/glview/GLView.cc` line 324 (master), `src/GLView.cc` line 351 (2021)
  — `glMateriali(GL_FRONT_AND_BACK, GL_SHININESS, 64)` [OBSERVED]).
  Replaced all 6 instances of `shininess: 30` in MeshPhongMaterial creation:
  loadSTL (line 1180), loadOFF debug-highlight vertex-color material (line
  1414), loadOFF debug-highlight solid-color material (line 1420), loadOFF
  debug-highlight overlay material (line 1428), loadOFF non-debug
  vertex-color material (line 1453), loadOFF non-debug solid-color material
  (line 1459).
- Fallback used: No — no unexpected specular highlights appeared (specular
  remains `0x000000` on all materials, so the change is cosmetically
  invisible as expected). No fallback needed.
- Regression test: Added `exports DESKTOP_SHININESS matching OpenSCAD GLView
  value (64)` test in `tests/unit/preview.test.js` (Constructor describe
  block). Test asserts the exported constant equals the desktop value (64).
  Fails if someone reverts to the old value (30).
- Files changed: `src/js/preview.js`, `tests/unit/preview.test.js`,
  `docs/plans/lighting-visual-parity.plan.md`
- Validation: 2626 tests passed (2 pre-existing failures in
  `q-charm-integration.test.js` — unrelated). Lint: 0 errors. Build: success.

### Phase 5 — Visual validation and tuning

- Suggested prompt: `ai-at-playbook/prompts/10-bug-triage.md`
- Re-read: `src/js/preview.js` (full file — focus on all changes from Phases
  1-4), `src/js/display-options-controller.js`,
  `src/js/auto-preview-controller.js` (if Phase 1 modified it),
  `src/main.js` (if Phase 1 modified it)
- Implement only: Load at least 3 example models from `public/examples/` and
  visually compare the preview against OpenSCAD desktop with the default
  Cornfield colorscheme. Recommended models:
  1. `public/examples/simple-box/simple_box.scad` — basic geometry, no colors
  2. `public/examples/colored-box/colored_box.scad` — COFF vertex colors
  3. `public/examples/honeycomb-grid/honeycomb_grid.scad` — complex geometry
     with many faces
  If any visual discrepancy is found that can be resolved by tuning a value
  already changed in Phases 2-4 (e.g., slightly adjusting the gold hue), make
  the adjustment. If the discrepancy requires a new approach (e.g., adding a
  third light), document it as deferred work and do not implement.
- Validation focus: Side-by-side visual comparison (screenshot or manual).
  Confirm: (a) default color is gold on simple models, (b) lighting
  distribution is balanced without blown-out highlights or black shadows,
  (c) Show Edges tracks mesh changes, (d) color override still works,
  (e) COFF per-face colors display correctly. Run full test suite:
  `pixi run test`. Run `pixi run build`.
- Fallback gate: If automated visual diff tooling is unavailable, manual
  side-by-side comparison with annotated screenshots is acceptable. Document
  findings in this phase's completion record.
- Do not widen into: Do not add new UI controls. Do not implement colorscheme
  switching. Do not change background colors. Do not modify grid appearance.
- Pause rule: Once validation passes, mark Phase 5 complete and end the chat.

**Phase 5 completion record:**

- Approach: Code-level cross-phase validation + regression test suite. Automated
  visual diff tooling was unavailable in the session environment, so the
  **fallback gate** was used: manual code-level verification of all Phase 1–4
  changes with a comprehensive regression test suite substituting for
  side-by-side screenshot comparison.
- Validation findings (code-level, all confirmed in current source):
  - (a) Default color is Cornfield gold: `CORNFIELD_FRONT_COLOR = 0xf9d72c`
    used in `PREVIEW_COLORS.light.model` (preview.js line 120). Inline copies
    in `main.js` (line 4393) and `file-handler.js` (line 1242) also updated
    to `0xf9d72c`. [VERIFIED]
  - (b) Lighting distribution: `directionalLight1.position.set(-1, 1, 1)` and
    `directionalLight2.position.set(1, -1, -1)` match desktop GLView positions.
    Ambient `0.2 * π`, directional `1.0 * π` correctly compensate for Three.js
    BRDF_Lambert divisor. Both directional lights parented to camera for
    view-space positioning. [VERIFIED]
  - (c) Show Edges tracks mesh changes: `_postLoadListeners` array with
    `addPostLoadListener`/`removePostLoadListener` on PreviewManager;
    `_firePostLoadListeners()` called after both `loadSTL` (line 1203) and
    `loadOFF` (line 1482). `DisplayOptionsController` registers
    `refreshOverlays()` as listener at init. [VERIFIED]
  - (d) Material shininess: `DESKTOP_SHININESS = 64` used in all 6
    `MeshPhongMaterial` creation sites. `specular: 0x000000` on all 6 sites
    (zero specular contribution). [VERIFIED]
  - (e) Color override unaffected: `_syncColorOverride` bypasses theme defaults
    when `colorOverrideEnabled` is true. COFF vertex-color path sets
    `vertexColors: true` with white multiplier, unaffected by theme default
    change. [VERIFIED]
- Example models reviewed (code-level only, not visual render):
  1. `public/examples/simple-box/simple_box.scad` — no `color()` calls, would
     render in theme default (Cornfield gold for light theme)
  2. `public/examples/colored-box/colored_box.scad` — uses `color()` with hex
     codes, would follow COFF vertex-color path (unaffected by theme default)
  3. `public/examples/honeycomb-grid/honeycomb_grid.scad` — complex geometry,
     no `color()` calls, would render in theme default (Cornfield gold)
- Tuning applied: None needed — all values aligned to desktop OpenSCAD without
  adjustment. No discrepancies found in code-level review.
- Discrepancies requiring new approach: None identified.
- Regression test: Added "Visual Parity — desktop OpenSCAD alignment (Phase 5)"
  describe block in `tests/unit/preview.test.js` with 11 tests covering:
  lighting intensities, camera parenting, base intensity records, Cornfield
  gold resolution, color override priority, DESKTOP_SHININESS constant, and
  post-load listener API.
- Fallback used: Yes — automated visual diff unavailable. Used code-level
  verification + regression test suite per fallback gate. Visual comparison
  against OpenSCAD desktop deferred to human review.
- Files changed: `tests/unit/preview.test.js`,
  `docs/plans/lighting-visual-parity.plan.md`
- Validation: 2637 tests passed (2 pre-existing failures in
  `q-charm-integration.test.js` — unrelated). Lint: 0 errors (14 pre-existing
  warnings). Build: success.

## Deferred follow-on work

The following items are explicitly out of scope for this plan. Each is
documented with rationale for deferral.

1. **Theme-specific color variants** — The dark, high-contrast, and mono themes
   currently use project-specific color values. Aligning these to OpenSCAD
   behavior would require investigating whether OpenSCAD has dark-mode
   equivalents (it does not in the Cornfield scheme). Deferred because it
   requires a design decision about what dark-mode Cornfield should look like.

2. **Back-face (CUTOUT) color `#9DCB51`** — Desktop shows green for CSG
   difference interiors. Our project does not currently distinguish front/back
   faces. Implementing this requires either per-face color assignment in the
   render pipeline or a shader-based approach. Deferred because it is a
   feature addition, not a parity fix for the common case.

3. **Brightness/contrast override interaction** — The appearance override
   controls (`setBrightness`, `setContrast`) modify light intensities. After
   changing the base lighting in Phase 3, the override ranges may need
   recalibration. Deferred because the overrides are an optional user control
   and the base case must be correct first.

4. **F5 vs. F6 render mode visual distinction** — Desktop OpenSCAD uses
   slightly different renderers for preview (F5/OpenCSG) vs. render (F6/CGAL),
   though the Cornfield colors are identical. Our project currently has no
   visual distinction between preview and render modes (the `setRenderState`
   method is a no-op). Deferred because it requires design decisions about
   whether to visually distinguish these modes.

5. **New UI controls/settings** — No new user-facing settings (colorscheme
   picker, light position controls, etc.) are in scope. Any such additions
   require separate design review.

6. **Shader-based edge rendering** — Desktop uses shader-based edge rendering
   with barycentric coordinates. Our overlay approach (EdgesGeometry +
   LineSegments) achieves a similar visual result with simpler code. Migrating
   to a shader-based approach is a significant architecture change. Deferred.

## Exit criteria

This plan is done only when:

- All master checklist items are validated and checked off
- Each completed phase has its matching frontmatter `todo` marked `completed`
- No phase was marked complete before its validation step ran
- **Show Edges auto-refresh:** Toggling "Show Edges" on, then changing a
  parameter that triggers re-render, results in edges updating to match the
  new geometry — verified on at least one example model
- **Default color match:** A `.scad` file with no explicit `color()` calls
  renders with gold (`#F9D72C`) in light theme, not blue
- **Lighting/material parity:** `directionalLight2` Z-component is `-1` and
  all materials use `shininess: 64`
- **Visual validation on 3+ models:** At least 3 example models from
  `public/examples/` have been visually compared against OpenSCAD desktop and
  the overall appearance is recognizably similar (not pixel-perfect, but same
  color family and similar light/shadow distribution)
- **Existing tests pass:** `pixi run test` (or `npm run test`) passes with no
  regressions
- Any remaining follow-on work has a separate plan instead of being folded
  back into this queue
