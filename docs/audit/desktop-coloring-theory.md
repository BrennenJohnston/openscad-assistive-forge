# Desktop Coloring Theory — Phase 2 Finding

> **Audit:** OpenSCAD Color/Display Parity Investigation
> **Phase:** 2 — Desktop Semantics Verification
> **Date:** 2026-03-10
> **Status:** Theory established — validated against User Manual PDFs and OpenSCAD source repository

---

## Summary

OpenSCAD Desktop operates with **three separate coloring systems** that run in parallel during display. The stakeholder's keyguard project uses all three to convey manufacturing-process semantics. The browser app currently collapses all three into a single-color mesh, losing all semantic information.

---

## System 1: User-Assigned Colors — the `color()` Function

**Scope:** F5 Preview (Compile mode) only.

The `color()` function wraps child geometry in an explicit RGBA value:

```openscad
color("red")   cube(10);       // named color
color("#3366FF") sphere(5);    // hex notation
color([0.2, 0.8, 0.2]) cylinder(r=5, h=10); // RGB vector
```

### Documented Behavior

From the OpenSCAD User Manual — Transformations section:

> "Displays the child elements using the specified RGB color + alpha value. **This is only used for the F5 preview as CGAL and STL (F6) do not currently support color.** The alpha value defaults to 1.0 (opaque) if not specified."

**Sources:**
- OpenSCAD User Manual PDF: `OpenSCAD User Manual_Transformations`, page 11 (local: `C:\Users\WATAP\Documents\Research\OpenSCAD_AF\OpenSCAD Book\`)
- Wiki: https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color

### Implications

- In F5 Preview: objects display in user-assigned colors
- In F6 Render: `color()` calls are **ignored** — all objects revert to engine defaults
- In Export (STL): no color data (STL has no color support)
- In Export (OFF/COFF): per-face RGBA can be included if the engine supports it

### Stakeholder Usage (S-001, S-002, S-003)

The stakeholder uses `color()` to distinguish manufacturing object types:
- 3D-printed keyguard → one color (S-001, image9)
- Laser-cut keyguard → different color (S-002, image10)
- "First layer" preview → third color (S-003, image11)

---

## System 2: Engine-Assigned CSG Operation Colors (Undocumented)

**Scope:** Both F5 Preview and F6 Render. NOT user-controllable.

When OpenSCAD performs CSG (Constructive Solid Geometry) Boolean operations — `union()`, `difference()`, `intersection()` — the rendering engine automatically color-codes the resulting faces based on their origin in the Boolean operation tree.

### Default Face Color Scheme

| Face Origin | Assigned Color | Meaning |
|---|---|---|
| **Positive face** (original surface of a base primitive) | **Yellow / gold** | This surface existed on the original primitive before any Boolean operations |
| **Subtracted face** (surface created by a `difference()` operation) | **Green** | This surface was created where one solid was cut away from another |

### Documentation Status

**This behavior is NOT documented in the OpenSCAD User Manual.** It is an implementation detail of the rendering engine that has been present since the CGAL backend was introduced.

The User Manual says F6 "does not currently support color" — meaning user `color()` calls are ignored. But users observe multiple colors in F6 renders because the engine applies its own internal CSG face coloring. The documentation never explains where these colors come from.

### Source Code Evidence

The mechanism was formalized and extended in July 2024 via:

**GitHub Issue #5065** — "Display colors when rendering using F6"
https://github.com/openscad/openscad/issues/5065

- Opened by @kintel (OpenSCAD maintainer), March 2024
- Confirmed that `color()` only worked in F5 Preview
- Proposed extending color support to F6 using Manifold's OriginalID mechanism
- Closed as implemented, July 2024

**GitHub PR #5185** — "Color support in 3D rendering (includes OFF color import / export, green subtracted faces)"
https://github.com/openscad/openscad/pull/5185

- Merged by @kintel, July 14, 2024
- Implemented per-face color tracking using Manifold's OriginalID mechanism
- Added green coloring for subtracted faces to Manifold rendering to match CGAL's existing behavior
- Added OFF format import/export with per-face color data (COFF)

Key quotes from the PR discussion:

@kintel (OpenSCAD maintainer):
> "What do you think about the idea of using this feature to make rendering with default colors use a different color for negative object (e.g. green subtracted from yellow), to make Manifold rendering look the same as CGAL rendering?"

@elalish (Manifold author):
> "Manifold can handle this without any properties by using our `OriginalID` — we keep track of the runs of triangles that are from each separate input mesh, so those can easily be put into separate draw calls with different rendering materials / colors if you keep track of the mapping of `OriginalID` to material."

@ochafik (PR author, in the final image):
> "faces that result from differences have always been colored green in preview mode, and that color is now there too in render mode (and exported to file, again if you export to OFF only for now)"

### Technical Mechanism

1. Each primitive in the CSG tree gets a unique **OriginalID** from the Manifold library
2. When Manifold computes Boolean operations (union, difference, intersection), it tracks which OriginalID each resulting face came from
3. The result is a mesh where each triangle has metadata linking it back to its source primitive
4. The renderer maps this metadata to colors:
   - Faces from positive operations → yellow/gold
   - Faces from negative operations (subtraction surfaces) → green
   - Faces from explicitly `color()`-ed primitives → the user's color (if `render-colors` feature is enabled)
5. This data is **exported in COFF format** as per-face RGBA values

### Stakeholder Usage (S-004)

The stakeholder observes these engine-assigned colors in the "Rendered first layer" (image12) and explicitly acknowledges them:

> "Rendered first layer (OpenSCAD makes these color choices):"

The stakeholder has learned to read the yellow/green face coloring as semantic information: yellow faces = original surfaces of the keyguard base plate; green faces = surfaces created by Boolean cutting operations (holes, slots, etc.). This is an emergent visual affordance — OpenSCAD did not design this for semantic purposes, but the stakeholder uses it that way.

---

## System 3: Modifier Character Colors — Display-Only Overlays

**Scope:** F5 Preview (Compile mode) only.

OpenSCAD's modifier characters alter how objects appear in the preview viewport:

| Modifier | F5 Preview Effect | F6 Render Effect | Export Effect |
|---|---|---|---|
| `#` (Debug) | Object drawn normally PLUS an additional copy in **transparent pink** overlay | Object included at full opacity with engine colors. No pink. No transparency. | Object included as normal solid geometry. No transparency. |
| `%` (Background) | Object drawn in **transparent gray**. Excluded from CSG operations. | Object excluded from render. | Object excluded from export. |
| `*` (Disable) | Object completely ignored. | Object excluded. | Object excluded. |
| `!` (Root) | Only this subtree is displayed. | Only this subtree is rendered. | Only this subtree is exported. |

### Documented Behavior

From the OpenSCAD User Manual — Modifier Characters section:

> `#` Debug Modifier: "Use this subtree as usual in the rendering process but also draw it unmodified in transparent pink."

> "Note: The color changes triggered by character modifiers appear only in 'Compile' mode, not 'Compile and Render (CGAL)' mode. (As per the color section.)"

**Sources:**
- OpenSCAD User Manual PDF: `OpenSCAD User Manual_Modifier Characters`, pages 1–2 (local: `C:\Users\WATAP\Documents\Research\OpenSCAD_AF\OpenSCAD Book\`)
- Wiki: https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier

### Stakeholder Usage (S-005, S-006)

The stakeholder uses `#` to overlay the keyguard semi-transparently through the frame:

> "I'm leveraging the '#' capability of OpenSCAD to display the keyguard along with the frame and also provide some transparency."

This is a visual QA technique: the stakeholder can see both the frame and the keyguard simultaneously, with the keyguard shown in transparent pink through the frame structure. This is only visible in F5 Preview.

---

## Interaction Between the Three Systems

The three systems have a defined precedence and interaction model:

### In F5 Preview (Compile mode)

1. If an object has an explicit `color()` → **System 1 wins** (user color displayed)
2. If an object has no `color()` → **System 2 applies** (yellow/gold default for positive, green for subtracted)
3. If an object has a `#` modifier → **System 3 overlays** on top of System 1 or 2 (transparent pink copy added)
4. If an object has a `%` modifier → **System 3 replaces** (transparent gray, excluded from CSG)

### In F6 Render (CGAL/Manifold)

1. **System 1 is ignored** (`color()` has no effect) — UNLESS the Manifold `render-colors` feature is enabled (post-July 2024)
2. **System 2 applies** (yellow for positive faces, green for subtracted faces, or user colors if `render-colors` is active)
3. **System 3 is ignored** (modifier character display effects have no effect)

### In Export (STL/OFF/SVG/DXF)

1. **System 1**: No color in STL. Per-face RGBA in COFF (colored OFF). SVG color behavior UNVERIFIED.
2. **System 2**: Per-face RGBA in COFF if the engine includes it. No color in STL.
3. **System 3**: No effect. `#`-marked objects are included as normal geometry. `%`-marked objects are excluded.

---

## Implications for the Browser App

### What the Stakeholder Expects

The stakeholder expects the browser to replicate the **F5 Preview** visual output — all three coloring systems active simultaneously:
- User `color()` calls producing semantic object-type colors (System 1)
- Engine CSG face coloring visible in rendered views (System 2)
- `#` modifier producing transparent pink overlays (System 3)

### What the Browser Currently Delivers

The browser renders all geometry as a single-color mesh because:
- It uses STL format (no color data) as the primary pipeline — OR —
- It uses OFF format but the WASM build may not include per-face color data
- There is no F5/F6 distinction in the browser — the WASM engine performs a render (equivalent to F6)
- The `#` modifier's transparent pink overlay is a display-only effect that cannot be replicated from exported geometry

### Critical Unknown for Phase 3/4

The WASM build date (`OpenSCAD-2025.03.25.wasm24456`) is after PR #5185 was merged (July 2024). The critical question is:

**Does this WASM build include the `render-colors` feature, and does its OFF output contain per-face RGBA data (COFF)?**

- If **yes**: the browser pipeline can extract per-face colors (both user `color()` and engine CSG colors) from the WASM output
- If **no**: the browser has no source of color data and must either derive colors independently or accept single-color rendering

This is the primary question for Phase 4's Probe 1 (COFF Output Verification).

---

## Validation Summary

| Claim | User Manual PDFs | OpenSCAD GitHub | Confidence |
|---|---|---|---|
| `color()` is F5 only | ✅ Explicitly documented (Transformations, p.11) | ✅ Confirmed | **CONFIRMED** |
| `#` transparency is F5 only | ✅ Explicitly documented (Modifier Characters, pp.1–2) | ✅ Confirmed | **CONFIRMED** |
| `$preview` distinguishes F5/F6 | ✅ Explicitly documented (Other Language Features, p.6) | ✅ Confirmed | **CONFIRMED** |
| F6 shows engine-assigned per-face colors | ❌ Not documented (but consistent with "no color support" statement) | ✅ Confirmed by #5065, PR #5185 | **CONFIRMED** (source code) |
| Yellow = positive, Green = subtracted | ❌ Not in User Manual | ✅ Explicitly stated in PR #5185 by @kintel and @ochafik | **CONFIRMED** (source code) |
| Manifold OriginalID tracks face provenance | ❌ Not in User Manual | ✅ Explained by @elalish (Manifold author) in #5065 | **CONFIRMED** (source code) |
| COFF carries per-face RGBA in OFF export | ❌ Not in User Manual | ✅ Implemented in PR #5185 | **CONFIRMED** (source code) |
| Stakeholder S-004 uses undocumented System 2 | ✅ Consistent with documentation gap | ✅ Consistent with PR discussion | **HIGH CONFIDENCE** |

---

## References

### OpenSCAD User Manual (local PDFs)

Location: `C:\Users\WATAP\Documents\Research\OpenSCAD_AF\OpenSCAD Book\`

- `OpenSCAD User Manual_Transformations` — color() specification (p.11)
- `OpenSCAD User Manual_Modifier Characters` — # debug modifier specification (pp.1–2)
- `OpenSCAD User Manual_Other Language Features` — $preview variable (p.6)
- `OpenSCAD User Manual_CSG Modelling` — union/difference/intersection (no color mentions)
- `OpenSCAD User Manual_Export` — supported export formats (OFF listed)
- `OpenSCAD User Manual_Importing Geometry` — OFF import support

### OpenSCAD Source Repository

- Issue #5065: https://github.com/openscad/openscad/issues/5065
- PR #5185: https://github.com/openscad/openscad/pull/5185
- Issue #5218 (Manifold color edge cases): https://github.com/openscad/openscad/issues/5218

### OpenSCAD Wiki (fetched 2026-03-10)

- https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color
- https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier
- https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer
