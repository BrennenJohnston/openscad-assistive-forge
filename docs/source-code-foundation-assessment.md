# Source Code Foundation Assessment

**Document type**: Decision document  
**Date**: 2026-02-21  
**Scope**: Should OpenSCAD Assistive Forge build a custom WASM binary from the OpenSCAD C++ source, or continue with the current black-box WASM approach?

---

## 1. Current Integration Approach

OpenSCAD Assistive Forge integrates with OpenSCAD entirely at the compiled WASM boundary:

| Aspect | Detail |
|--------|--------|
| **WASM source** | Pre-built `openscad.js` loaded from `/public/wasm/openscad-official/` |
| **Interface** | CLI-style via `Module.callMain([...args])` in `src/worker/openscad-worker.js` |
| **Input** | `.scad` content + resolved library files posted to the worker as `ArrayBuffer` |
| **Output** | STL / OBJ / SVG / AMF binary response from the worker |
| **Parameter extraction** | Independent JS parser in `src/js/parser.js` reads Customizer annotation comments |
| **Error reporting** | Captured from WASM stderr stream and forwarded to `ErrorLogPanel` |
| **No direct access to** | AST, CSG tree, geometry validation, memory counters, render progress |

This approach is effectively **vendor-neutral at the application layer**: the web app never inspects OpenSCAD internals. The WASM binary is treated as a black box that accepts SCAD text and returns geometry.

---

## 2. What Custom WASM Builds Would Unlock

### 2.1 Currently Simulated Features

Several "Design" menu items are currently implemented with approximations because the WASM binary offers no callback hooks:

| Feature | Current approximation | True implementation (custom WASM) |
|---|---|---|
| **Display AST** | `parser.js` re-parses annotation comments to extract parameter metadata | WASM-level AST export via added Emscripten binding |
| **CSG Tree / Products** | Not implemented (menu item disabled) | OpenSCAD's `--export-ast` / CSG-tree output mode |
| **Check Validity** | Geometry heuristic: count vertices/triangles via Three.js mesh | CGAL manifold check already performed during render |
| **Geometry Info** | Three.js bounding-box calculation after STL import | WASM callback provides precise dimensions with no re-import |
| **Memory usage** | Estimated from JS heap; no WASM heap visibility | `malloc_usable_size` or Emscripten `getTotalMemory()` bindings |
| **Progress callbacks** | Placeholder spinner with no percentage | `EMSCRIPTEN_KEEPALIVE` progress hook during CSG evaluation |

### 2.2 New Capabilities Not Currently Possible

- **Incremental re-renders**: Custom build could expose a scene-graph API, enabling parameter changes to retrigger only affected subtrees rather than full re-render.  
- **Accurate error positions**: Current WASM stderr only provides line numbers from OpenSCAD's internal error formatter. A custom build could expose structured error objects.  
- **Variable-resolution preview**: Custom build could expose the `$fn` override at the WASM boundary without resending the full SCAD file.

---

## 3. Build Complexity Analysis

> The following is based on OpenSCAD's public repository at <https://github.com/openscad/openscad> and its Emscripten web build documentation as of early 2026.

### 3.1 Build System

OpenSCAD uses **CMake** with **vcpkg** for dependency management. The official web (WASM) build uses a Docker image that pre-bakes the Emscripten toolchain and all C++ dependencies. Key dependencies include:

| Dependency | Role | WASM status |
|---|---|---|
| CGAL 5.x | CSG booleans, mesh validity | Supported via Emscripten port |
| Boost | Utilities, filesystem | Supported |
| GLEW / OpenGL | Rendering preview (not used in headless web mode) | Excluded from headless build |
| double-conversion | Number formatting | Small, widely supported |
| Manifold (optional) | Alternative CSG backend | WASM port available independently |

The existing Docker-based Emscripten build (`wasm/build_wasm.sh` in the OpenSCAD repo) can produce a working `openscad.js` + `openscad.wasm`. Adding custom Emscripten bindings requires:

1. Writing a `src/bridge/forge_bridge.cpp` file exposing C++ AST/progress hooks as `EMSCRIPTEN_BINDINGS`
2. Re-running the CMake + Emscripten build
3. Validating that no CGAL or Manifold behavior changed

**Estimated effort**: 3–6 focused sessions for a single maintainer with Emscripten experience; substantially more without prior experience.

### 3.2 Binary Size

The current pre-built `openscad.wasm` is approximately **11–15 MB** (gzipped ~4–5 MB). A custom build adding bridge code would add negligible binary size. However, switching from the CGAL backend to Manifold (if pursued) could change the size meaningfully.

### 3.3 CI/CD Requirements

A custom WASM build requires:
- A CI job running a Docker container with Emscripten + all dependencies (~3–8 GB image)
- Triggered on upstream OpenSCAD releases **and** on changes to `forge_bridge.cpp`
- Artifact storage and CDN delivery for the new `openscad.js` + `.wasm`

This is technically achievable with GitHub Actions + GitHub Releases artifacts, but represents ongoing maintenance work every time OpenSCAD releases a new version.

---

## 4. Maintenance Burden

### 4.1 Upstream Release Cadence

OpenSCAD typically releases a major version **once or twice per year** (recent examples: 2021.01, 2023.06). Point releases for critical bugs occur more frequently. Each upstream release could break the bridge API if OpenSCAD refactors its internal classes.

### 4.2 Single-Maintainer Capacity

| Factor | Assessment |
|---|---|
| Build reproducibility | Docker image mitigates environment drift; high confidence |
| Staying current with upstream | Each OpenSCAD release requires a build + regression test cycle (~2–4h) |
| Bridge API stability | OpenSCAD's internal C++ API is undocumented and subject to refactor |
| Testing scope | Web-facing WASM output must be tested for numerical regression against known models |
| Opportunity cost | Every hour on WASM maintenance is an hour not spent on UI/UX features |

For a **single maintainer**, maintaining a custom build is feasible but creates a recurring obligation that competes with feature development.

### 4.3 Upstream Contribution Opportunity

Adding a well-designed progress/AST callback to OpenSCAD's Emscripten build and upstreaming it would benefit the entire OpenSCAD web ecosystem. If accepted upstream, it eliminates the maintenance burden entirely — the official WASM would include the hooks.

---

## 5. Pros / Cons Comparison

| Criterion | Current (Black-box WASM) | Custom WASM Build |
|---|---|---|
| **Feature completeness** | Limited: no AST, no CGAL validity, no progress, no CSG tree | Full parity with desktop OpenSCAD's analysis features |
| **Build complexity** | Zero: use pre-built binary | High: Docker + Emscripten + CMake pipeline |
| **Maintenance burden** | Minimal: update path when upstream releases new WASM | Medium–High: re-build + regression test on each OpenSCAD release |
| **Single-maintainer feasibility** | Excellent | Feasible but creates recurring obligation |
| **Upstream contribution opportunity** | None | High: bridge code could be upstreamed |
| **Numerical correctness risk** | None (unmodified binary) | Low if bridge-only; higher if switching CSG backends |
| **Time-to-value** | Immediate | 3–6 sessions before any new feature is available |
| **User impact (near-term)** | Simulated validity check; no CSG tree | Accurate validity; CSG tree; render progress |
| **Dependency on Docker/CI infra** | None | Required for reproducible builds |

---

## 6. Decision Matrix

Weighted scoring (1 = worst, 5 = best):

| Criterion | Weight | Black-box WASM | Custom WASM |
|---|---|---|---|
| Feature completeness | 25% | 2 | 5 |
| Build / setup complexity (lower = better) | 20% | 5 | 2 |
| Maintenance burden (lower = better) | 25% | 5 | 2 |
| Single-maintainer feasibility | 20% | 5 | 3 |
| Upstream contribution opportunity | 10% | 1 | 5 |
| **Weighted total** | **100%** | **4.05** | **3.05** |

The current approach scores higher under single-maintainer constraints. The gap narrows if the bridge code can be upstreamed.

---

## 7. Recommendation

**Continue with the current black-box WASM approach** for the near term, with a structured path toward upstreaming.

### Rationale

1. The approximations for AST, validity checking, and geometry info are **adequate for the accessibility-first use case** — users can render, inspect, and export without needing CGAL-level validation.  
2. A custom WASM build would **not improve the core user workflow** (render → customize → export). It would improve diagnostic features used primarily by power users.  
3. Under single-maintainer capacity, the **ongoing CI cost** (re-build on each OpenSCAD release) is a non-trivial recurring obligation.

### Recommended Path Forward

**Phase A — Upstream contribution (0–6 months)**  
Author a minimal `progress_callback` and `ast_export` Emscripten binding against the OpenSCAD source and submit a pull request to `openscad/openscad`. This costs ~1–2 sessions and, if merged, eliminates the maintenance burden entirely.

**Phase B — Fork if upstream stalls (6–12 months)**  
If the pull request is not merged within 6 months, maintain a minimal fork of the Emscripten build with the `forge_bridge.cpp` added. Automate the build via GitHub Actions against OpenSCAD release tags.

**Phase C — Re-evaluate at each OpenSCAD major release**  
Reassess whether the upstream WASM has gained the needed hooks before each re-build cycle.

### Out of Scope

- Switching the CSG backend from CGAL to Manifold: while Manifold offers faster boolean operations, it changes numerical outputs and requires extensive regression testing. Defer until the upstream OpenSCAD project makes this switch and validates it.
- Custom OpenGL rendering: not applicable to headless WASM builds used in this project.

---

## 8. Re-evaluation Triggers

Revisit this decision if any of the following occur:

- OpenSCAD upstream merges a `progress_callback` or structured AST export into their official WASM build.
- A second maintainer joins the project, reducing the per-person maintenance burden.
- A stakeholder specifically requests CSG-tree visualization or sub-second incremental rendering (neither is a current accessibility requirement).
- The Manifold CSG backend is stabilized and adopted by upstream OpenSCAD for the web build.

---

*Document produced as part of the Toolbar Menu Parity Plan, Phase 10.*  
*No code changes accompany this document.*
