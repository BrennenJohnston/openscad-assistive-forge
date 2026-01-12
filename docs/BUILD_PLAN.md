---
name: OpenSCAD↔Web Bridge Tool (Consolidated Feasibility + Build Plan)
date: 2026-01-12
last_validated: 2026-01-12
validated_by: Claude Opus 4.5
status: consolidated_plan
supersedes:
  - "C:\\Users\\WATAP\\.cursor\\plans\\openscad-web_bridge_tool_303c433e.plan.md"
  - "docs/development/openscad-web_bridge_tool_303c433e.plan.md"
inputs:
  - "Example OpenSCAD project: universal_cuff_utensil_holder.scad"
  - "  └── License: CC0 Public Domain (ideal for demo/testing)"
  - "  └── Customizer annotations: VERIFIED (groups, enums, ranges)"
  - "  └── Parts: 9 printable parts, ~1000 lines, well-organized"
outputs:
  - "New standalone repository (do NOT modify the working braille web app repo)"
  - "Recommended repo name: openscad-web-customizer-forge"
  - "  └── Alternative: CustomizerBridge, ParamForge, SCAD2Web"
  - "CLI that can: extract → scaffold → validate"
  - "Generated Vercel-ready web app template that runs OpenSCAD via WASM (client-side) + schema-driven UI"
---

## Executive feasibility verdict (should we proceed?)

**Proceed with v1** if the goal is: **turn an OpenSCAD Customizer-enabled `.scad` into a web app** (Vercel deployable) that provides matching param inputs and generates STL client-side, plus an automated **schema/UI/STL parity validator**.

**Do not proceed (or re-scope)** if the goal is: **automatically translate arbitrary OpenSCAD geometry into a native JS/Three/JSCAD generator**. That is low-feasibility for general OpenSCAD programs.

### What makes this feasible in your example

The sample file `universal_cuff_utensil_holder.scad` includes OpenSCAD Customizer group headers and typed param hints like:

- `/*[Group]*/` sections
- enums: `// [a,b,c]`
- ranges: `// [min:max]`

That gives the bridge tool a **reliable, non-heuristic** parameter source for v1 extraction.

---

## Non-goals (v1 hard boundaries)

- **No automatic geometry translation**: `.scad` is the geometry source; the web app runs OpenSCAD (WASM) to compute STL.
- **No “infer parameters from arbitrary SCAD”**: v1 requires Customizer annotations and/or a `params.json` manifest.
- **No “infer schema from arbitrary web apps”**: v1 supports web→OpenSCAD only for schema-first web generators.

---

## Architecture: how the bridge works (v1)

### Core idea: intermediate “Parameter Schema”

Define a project-local schema artifact as the bridge tool’s single source of truth:

- `params.schema.json` (JSON Schema + UI metadata extensions)

This schema is generated from:

- OpenSCAD Customizer parsing (OpenSCAD→Web), or
- existing schema-first web project inputs (Web→OpenSCAD, constrained)

### Web runtime (OpenSCAD→Web)

Generated Vercel app is a mostly-static frontend:

- **Main thread**: UI form + 3D preview + download controls + accessibility behaviors
- **Web Worker**: OpenSCAD WASM runtime + virtual FS + STL export

STL generation flow:

1. UI produces a param dict (validated against `params.schema.json`)
2. Worker writes `.scad` + any includes into virtual FS
3. Worker runs OpenSCAD with `-D` overrides (or equivalent) and fixed tessellation settings
4. Worker returns STL bytes (`ArrayBuffer`)
5. UI downloads + optionally previews

---

## License and distribution strategy (must decide early)

**OpenSCAD is GPL-licensed**, and distributing OpenSCAD/WASM in a web app likely triggers GPL obligations for that distributed runtime.

v1 requirement:

- generated web app includes:
  - `THIRD_PARTY_NOTICES.md`
  - prominent “About / Licenses” UI section
  - a clear path to obtain corresponding source for the shipped OpenSCAD artifact

Important nuance:

- treat `seasick/openscad-web-gui` as **GPL-3.0** (per GitHub UI) and **reference-only** unless a license review confirms otherwise.

---

## Validation: what “iterative parity” means (v1)

Validation is layered, and only some layers can be auto-fixed:

1. **Schema parity** (automatable)
   - names, types, defaults, ranges/enums, units, grouping/order
2. **UI parity** (partially automatable)
   - labels/help text can be compared; resolving intent often needs human review
3. **STL parity** (automatable with tolerances)
   - compare mesh outputs under controlled settings; never expect exact triangle equality

Suggested STL metrics (robust order):

- bounding box extents (tolerance)
- volume + surface area (tolerance)
- sampled surface distance (approx Hausdorff / nearest-neighbor) (tolerance)

Determinism requirements:

- enforce fixed tessellation (`$fn/$fa/$fs`) and stable export flags
- version-pin the OpenSCAD artifact used for validation (CLI/Docker vs WASM)

---

## Concrete v1 deliverable (based on your “universal cuff” use case)

**Input**:

- `C:\Users\WATAP\Documents\github\OpenSCAD to Web program\Customizable Universal Cuff Utensil_Tool Holder - 3492411\files\universal_cuff_utensil_holder.scad`

**Output**:

- a new generated web app repo folder (Vercel-ready) that:
  - shows all Customizer parameters as a web UI
  - generates STL in-browser via OpenSCAD WASM worker
  - supports “preset parameter sets” + shareable URLs
  - includes license notices and source links

---

## Repository separation (your requirement)

Create a **new repo** for the general tool (recommended):

- `braille-card-and-cylinder-stl-generator` stays stable/production
- new repo: `openscad-web-bridge` (tool + templates + examples)

The new repo can vendor a “blank” template derived from this project’s UX/accessibility patterns, but must not introduce breaking changes into the existing app.

---

## Build plan (phased, executable)

### Phase 0 — finalize constraints + baseline artifacts (1–2 days)

- Decide:
  - OpenSCAD/WASM artifact source and version pinning strategy
  - license compliance approach for generated apps
  - v1 support boundaries for Customizer parsing (enums, ranges, booleans, strings)

Deliverables:

- `docs/specs/PARAMETER_SCHEMA_SPEC.md` (defines extensions, UI metadata, dependency rules)
- example `params.schema.json` generated from the cuff `.scad`

### Phase 1 — OpenSCAD Customizer extractor (1–3 days)

- Implement a parser that extracts:
  - groups (`/*[Group]*/`)
  - param name, default value, hint (`// [..]`)
  - optional help text (preceding comments)

Deliverables:

- `bridge extract universal_cuff_utensil_holder.scad --out params.schema.json`

### Phase 2 — Vercel web template (OpenSCAD WASM wrapper) (3–7 days)

- Build the “blank slate” Vercel app template:
  - schema-driven UI rendering
  - worker-based OpenSCAD WASM execution
  - STL download + basic preview
  - accessibility requirements (keyboard, ARIA, contrast)

Deliverables:

- `bridge scaffold --schema params.schema.json --scad universal_cuff_utensil_holder.scad --out ./generated-web-app`

### Phase 3 — validation harness (3–10 days)

- Local reference renderer:
  - Docker OpenSCAD CLI runner (or local OpenSCAD if installed)
- Web renderer:
  - headless browser (Playwright) to run the generated app and download STL
- Compare:
  - schema parity + UI snapshot checks
  - STL metrics with tolerances

Deliverables:

- `bridge validate ./generated-web-app --cases cases.yaml --ref docker-openscad`

### Phase 4 — iterative correction loop (optional, v1.1)

- Safe auto-fixes only:
  - defaults/ranges/enums mismatches
  - missing parameters
  - label/help drift (opt-in)

Deliverables:

- `bridge sync --apply-safe-fixes`

---

## Open questions (need answers before coding)

1. Do you require the generated web app to run **fully offline** after first load (bundle all assets), or is CDN fetching acceptable?
2. Do you want the generated app to support **3D preview** for every model, or "download STL only" is OK for v1?
3. Is "Customizer metadata required" acceptable for your target users, or must we support heuristic parameter discovery?

---

## Validation notes (2026-01-12, Claude Opus 4.5)

### Claims verified as correct

| Claim | Status |
|-------|--------|
| `trimesh` is dev-only in braille Vercel repo | ✅ Verified (requirements-dev.txt line 13) |
| CloudCompare is not integrated | ✅ Verified (not in any requirements file) |
| Example `.scad` has Customizer metadata | ✅ Verified (lines 26-102: groups, enums, ranges) |
| `seasick/openscad-web-gui` is GPL-3.0 | ✅ Correctly noted as licensing consideration |

### Example file analysis (universal_cuff_utensil_holder.scad)

**License**: CC0 Public Domain Dedication — **ideal** for demo/testing, no attribution required.

**Customizer groups found** (9 total):
- `[Part to Print]` — dropdown with 9 parts
- `[Palm Loop Info]` — dimensions + toggles
- `[Circular Loop Info]` — diameter, width, grips, elastic slots
- `[Utensil Mount Info]` — mount params
- `[Utensil Holder Info]` — handle type, dimensions, splits
- `[Thumb Rest/Loop Info]` — thumb dimensions
- `[Tool Interface Info]` — interface dimensions
- `[Tool Cup Info]` — cup dimensions
- `[Tool Saddle Info]` — saddle dimensions
- `[Circular Grip Info]` — grip diameter
- `[Hidden]` — internal constants ($fn, fudge, chamfer)

**Parameter types detected**:
- Enums: `// [option1,option2,...]` (e.g., `part`, `utensil_handle_type`)
- Ranges: `// [min:max]` (e.g., `palm_loop_height = 30; // [15:75]`)
- Yes/No toggles: `// [yes,no]`
- Hidden params: `/*[Hidden]*/` section for internal use

This file is an **excellent v1 test case** because it exercises all major Customizer annotation types.

---

## Recommended next steps

### Immediate (before coding)

1. **Answer the 3 open questions above** — these determine scope
2. **Decide repo name** — suggested: `openscad-web-customizer-forge`
3. **Create the new GitHub repo** — empty, with MIT or Apache-2.0 license for the tool itself

### Phase 0 kickoff

1. **Copy this plan** to the new repo as `docs/BUILD_PLAN.md`
2. **Write `docs/specs/PARAMETER_SCHEMA_SPEC.md`** — define JSON Schema extensions for UI metadata
3. **Generate sample `params.schema.json`** from the cuff `.scad` (manual first, then automate)

### Technical decisions needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| OpenSCAD WASM source | Official WASM builds vs. community forks | Start with community (seasick) for reference, plan official later |
| UI framework | Vanilla JS, React, Vue | Vanilla JS for minimal deps (like braille app) |
| STL preview | Three.js (like braille app) | Yes, but optional in v1 |
| Offline mode | Bundle all assets vs. CDN | CDN acceptable for v1, offline as v1.1 |

---

## Related files in this workspace

- `docs/development/openscad-web_bridge_tool_303c433e.plan.md` — earlier version (superseded)
- `C:\Users\WATAP\.cursor\plans\openscad-web_bridge_tool_303c433e.plan.md` — Cursor plans copy (superseded)
- `C:\Users\WATAP\Documents\github\braille-stl-generator-openscad\` — OpenSCAD version of braille tool (reference for validation patterns)

