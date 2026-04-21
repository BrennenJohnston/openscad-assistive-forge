# Phase 3 — WASM bridge fitness

**Date**: 2026-04-17
**Author**: Audit run (read-only)
**Inputs**: `src/worker/openscad-worker.js`, `src/js/error-translator.js`, `src/js/design-panel-controller.js`, `src/js/preview.js`, `src/main.js`, `src/js/render-controller.js`, `src/js/auto-preview-controller.js`, `src/js/download.js`, `docs/source-code-foundation-assessment.md`
**Conventions**:
- `OBSERVED` — verified directly in code with file:line citation.
- `INFERRED` — derived by combining two or more observations.
- `UNVERIFIED` — claim from documentation not re-checked in this audit.
- "Bridging" = JS code that fakes a WASM capability the binary does not natively expose.

> Charter: classify each "simulated" feature in `docs/source-code-foundation-assessment.md` as
> **Adequate-as-simulated** / **Stop-bridging** / **Consider-upstreaming**, map
> `error-translator.js` coverage of WASM stderr, and recommend additions to the
> upstream contribution candidate list.

---

## 0. Summary table

| # | Bridge | Doc claim | OBSERVED reality | Verdict | Mission impact |
|---|---|---|---|---|---|
| 1 | Display AST | "re-parses annotation comments to extract parameter metadata" | Renders `JSON.stringify(extractParameters(scad))` and labels it "AST". `design-panel-controller.js:65–109` | **Stop-bridging (relabel)** — wording is misleading; it is the parameter dictionary, not an AST. | Low — power-user feature; mislabeling harms trust |
| 2 | CSG Tree / Products | "Not implemented (menu item disabled)" | **Doc inaccurate.** No in-app *display*, but `csg` IS a downloadable export format (`src/js/download.js:58`) and the worker writes `/tmp/output.csg` (`src/worker/openscad-worker.js:1242`). OpenSCAD WASM produces a real CSG tree text file. | **Doc fix** — export works today; add a note to the assessment doc | Low |
| 3 | Check Validity | "Geometry heuristic: count vertices/triangles via Three.js mesh" | True, plus a `vertexCount % 3 !== 0` "non-manifold" check that **only fires for non-indexed geometry** (`design-panel-controller.js:136–138`). OpenSCAD WASM always emits indexed geometry → branch is unreachable. | **Stop-bridging (or document)** — feature reports "Valid" for inputs that may be non-manifold. | Medium — accessibility-first users trust the label |
| 4 | Geometry Info | "Three.js bounding-box calculation after STL import" | True. `preview.js:2342–2362` — but `volume = size.x * size.y * size.z` (bounding-box volume) is displayed as **"Volume: N mm³"** in `design-panel-controller.js:187`. For a sphere this overstates real volume by ~1.9×; for a hollow shell, by 5–100×. | **Stop-bridging (relabel)** — rename to "Bounding box volume" or compute signed-tetrahedron volume. | Medium — measurement is shown to all users without caveat |
| 5 | Memory usage | "Estimated from JS heap; no WASM heap visibility" | **Doc inaccurate.** Code reads `openscadModule.HEAP8.length` (allocated WASM buffer), not JS heap, AND admits in inline comments that "percentage-based checks are meaningless" (`openscad-worker.js:2118–2123`). Yet the UI shows a `<div role="progressbar" aria-valuenow={fictional %}>` bar (`main.js:3432–3438`), with warning thresholds at 75 % / 90 %. | **Stop-bridging** — remove the % bar (or display only absolute MB) | High for screen reader users — `aria-valuenow` exposes fictional value to AT |
| 6 | Progress callbacks | "Placeholder spinner with no percentage" | True. Worker emits hardcoded milestones (5/10/12/15/17/20/30 → `-1` indeterminate during render → 95) at `openscad-worker.js:2310–2403`. Indeterminate path uses CSS `.indeterminate` animation (`main.js:3262–3266`). | **Adequate-as-simulated** + **Consider-upstreaming** — current spinner is honest; real progress requires C++ hook | Low (current); High if upstreamed |
| 7 | Error reporting | "Captured from WASM stderr stream" | True; **also a second user-friendly translator runs on the main thread**. Two `translateError()` functions in two places, with overlapping but non-identical pattern tables. See §3. | **Stop-bridging (consolidate)** — one translation table, not two | Medium — user sees the worker's first-pass message, not the richer `error-translator.js` version, in some paths |

---

## 1. Bridge-by-bridge findings

### 1.1 Display AST — `design-panel-controller.js:65–109`

OBSERVED:
- `showAST()` calls `this.extractParameters(scad)` (which is `src/js/parser.js#extractParameters`) and serializes the result.
- The modal title says **"Parsed Parameters (AST)"**, the `aria-label` says **"Parsed parameter AST"**, and the menu item text in `main.js:2397` says **"Display AST…"**.
- The screen-reader announcement (`announceImmediate("AST displayed with X parameters")`) reinforces the AST framing.

INFERRED:
- A user familiar with OpenSCAD desktop expects "Display AST" to show the abstract syntax tree of their SCAD program — the recursive structure of modules, expressions, and primitives that the parser produces.
- What we actually show is a flat array of `{ name, type, default, min, max, ... }` objects derived from `// description: ...` annotation comments. This is the *Customizer parameter list*, not the AST.

Recommendation: **Stop-bridging via relabel**. Rename the menu/heading/announcement to "Display Parameters" (or "Parameter Schema"). No code-removal required, only string changes. ~5 LOC. This is a Phase 6 "Quick Win" candidate.

### 1.2 CSG Tree / Products — doc says disabled, code says working

OBSERVED:
- `src/js/download.js:53–60` lists `csg` in `OUTPUT_FORMATS` with `description: "OpenSCAD CSG tree format"`.
- `src/worker/openscad-worker.js:1242` constructs `outputFile = /tmp/output.${format}`. OpenSCAD's `--export-format` defaults to the file-extension format, so `format='csg'` produces a `.csg` text file via the same `callMain(['-o', '/tmp/output.csg', ...])` path used for STL.
- The "Display CSG Tree" menu item the doc references does not exist in `index.html` (no `id="design-csg-btn"` or similar). Confirmed: no UI surface for inline CSG-tree display.

INFERRED:
- The doc statement "Not implemented (menu item disabled)" conflates two things: there is no **inline display** of the CSG tree (true), but **export to .csg is functional** (the doc misses this).

Recommendation: **Doc fix only**. Update `docs/source-code-foundation-assessment.md` table row to: *"In-app display: not implemented. Export-to-`.csg`: works today via the standard download path."* No code change needed.

### 1.3 Check Validity — `design-panel-controller.js:115–156`

OBSERVED:
```115:156:src/js/design-panel-controller.js
  checkValidity() {
    const pm = this.getPreviewManager();
    if (!pm?.mesh) {
      announceImmediate('No model loaded — render first to check validity');
      return;
    }

    const geo = pm.mesh.geometry;
    const positionAttr = geo?.attributes?.position;
    if (!positionAttr) {
      announceImmediate('Geometry has no vertex data');
      return;
    }
    // ... vertex / triangle count tally ...
    if (!geo.index && vertexCount % 3 !== 0) {
      issues.push('vertex count is not a multiple of 3 (non-manifold)');
    }
```

- The non-manifold check (`vertexCount % 3 !== 0`) is gated on `!geo.index` — i.e., only runs for non-indexed Three.js BufferGeometry.
- OpenSCAD WASM emits ASCII or binary STL; `STLLoader` always produces non-indexed geometry, but the vertex count of any STL is `triangles × 3`, so `vertexCount % 3 === 0` *by construction*. The check is therefore unreachable for inputs the app actually loads.
- `OBSERVED`: there is no other validity assertion. A genuinely non-manifold mesh (e.g., one with self-intersections) renders to STL just fine and passes this check as "Valid".

INFERRED:
- The "Valid: N triangles, M vertices" message implies CGAL-grade validation. The check actually guarantees only that "the mesh has at least one face and the vertex array is well-formed."

Recommendation: **Stop-bridging** in current form. Either:
- (a) Remove the misleading `(non-manifold)` parenthetical and rename the button to "Mesh Statistics" (Quick Win, ~3 LOC). The button still provides useful triangle/vertex counts — just stop claiming validity. OR
- (b) Implement a real-by-best-effort manifold check: for indexed geometry, count edges shared by exactly 2 faces; flag any edge shared by 1 or >2 faces. Implementable in Three.js without WASM, ~40 LOC. Defer to Phase 6 backlog.

### 1.4 Geometry Info — `design-panel-controller.js:162–202` + `preview.js:2342–2362`

OBSERVED:
```2342:2362:src/js/preview.js
  calculateDimensions() {
    if (!this.mesh) return null;

    const box = new Box3().setFromObject(this.mesh);
    const size = box.getSize(new Vector3());
    const volume = size.x * size.y * size.z;
    // ...
    return {
      x: Math.round(size.x * 100) / 100,
      y: Math.round(size.y * 100) / 100,
      z: Math.round(size.z * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      triangles: Math.round(triangles),
    };
  }
```

- `volume = size.x * size.y * size.z` is the **bounding-box volume**, not the mesh volume.
- The Geometry Info modal displays this as **"Volume: N mm³"** in `design-panel-controller.js:187` with no qualifier.
- For comparison: a sphere of diameter D has bbox volume `D³` but real volume `π·D³/6 ≈ 0.524·D³`. A 100 mm sphere is reported as 1 000 000 mm³; real volume is ~523 599 mm³. ~1.9× over-report.
- For a hollow vase or thin-walled enclosure (common in OpenSCAD assistive-device projects), the over-report can exceed 10–50×.

INFERRED:
- This is exactly the kind of "looks authoritative but is wrong" surface the audit is meant to flag. The X/Y/Z dimensions ARE correct (they're literal bbox extents). Only Volume is bogus.

Recommendation: **Stop-bridging via relabel + optional real computation**.
- Quick fix: rename the row label from "Volume" to "Bounding Box Volume" in `design-panel-controller.js:187`. ~1 LOC.
- Better fix: compute true mesh volume via the signed-tetrahedron method on the indexed geometry (~25 LOC, no WASM needed). Defer to Phase 6 backlog.

### 1.5 Memory usage — `openscad-worker.js:2682–2715` + `main.js:3416–3457`

OBSERVED, worker side:
```2118:2124:src/worker/openscad-worker.js
  // NOTE: We can only measure the allocated heap size, not actual usage.
  // HEAP8.length == buffer.byteLength, so percentage-based checks are meaningless.
  // Instead, warn based on absolute heap size (e.g., warn when heap > 1GB).
  const usedMB = heapAllocatedMB;
  const limitMB = MEMORY_WARNING_THRESHOLD_MB;
```

```2693:2700:src/worker/openscad-worker.js
  // IMPORTANT: heapTotalBytes is the ALLOCATED heap size, not actual used memory.
  // WASM linear memory grows in 64KB pages; once grown it never shrinks.
  // We use the warning threshold (1GB) as the "limit" for reporting purposes.
  const heapTotalBytes = openscadModule.HEAP8.length;
  const heapTotalMB = Math.round(heapTotalBytes / 1024 / 1024);
  const used = heapTotalBytes;
  const limit = MEMORY_WARNING_THRESHOLD_MB * 1024 * 1024;
  const percent = Math.round((used / limit) * 100);
```

OBSERVED, UI side:
```3429:3445:src/main.js
    if (text) {
      text.textContent = `${memoryInfo.usedMB || 0}MB`;
    }

    const percent = memoryInfo.percent || 0;
    if (barFill) {
      barFill.style.width = `${Math.min(percent, 100)}%`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', percent);
    }

    indicator.classList.remove('warning', 'critical');
    if (percent >= 90) {
      indicator.classList.add('critical');
    } else if (percent >= 75) {
      indicator.classList.add('warning');
    }
```

INFERRED:
- The worker's own comments admit the percentage is meaningless. The `usedMB` value reports allocated (not used) memory. Once WASM `HEAP8` grows to a watermark, it stays there forever. So even after the render finishes and the actual working set drops, the indicator stays "high."
- The UI then publishes `aria-valuenow` to assistive technology, telling screen reader users "memory is at 47 %" when the real interpretation is "the WASM heap has been grown to 47 % of an arbitrary 1 GB warning threshold."
- For an accessibility-first project, exposing fictional numbers via `aria-valuenow` is the worst class of bridging defect: it actively misleads the audience the project exists to serve.

Recommendation: **Stop-bridging**.
- Phase 6 Quick Win: drop the % bar entirely. Show only the raw "X MB allocated" text. Remove `aria-valuenow`. The 75/90 % warning thresholds become absolute (e.g., 750 MB / 900 MB).
- Estimated impact: ~25 LOC removed across `main.js` (memory-bar update) + ~5 LOC in the worker (drop the `percent` field from `MEMORY_USAGE` postMessage payload) + minor CSS in `components.css`.
- Risk: low — the affected UI is the small memory indicator in the toolbar; no test names imply % semantics.

### 1.6 Progress callbacks — `openscad-worker.js:2310–2403`, `main.js:3250–3273`

OBSERVED:
```2310:2403:src/worker/openscad-worker.js
    self.postMessage({
      type: 'PROGRESS',
      payload: { requestId, percent: 30, message: 'Compiling OpenSCAD...' },
    });
    // ...
    // Render to specified format
    const renderPromise = (async () => {
      // Note: render methods are blocking calls - we can't get intermediate progress
      // Use indeterminate progress messaging
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: -1,
          message: `Rendering model to ${formatName} (this may take a while)...`,
        },
      });
      // ... blocking callMain ...
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 95,
          message: `Processing ${formatName} output...`,
        },
      });
```

```3262:3273:src/main.js
    if (percent < 0) {
      // Indeterminate progress
      if (progressFill) {
        progressFill.classList.add('indeterminate');
        progressFill.style.width = '100%';
      }
    } else if (progressFill) {
      progressFill.classList.remove('indeterminate');
      progressFill.style.width = `${percent}%`;
    }
```

INFERRED:
- The progress timeline is: 5/10/12/15/17/20/30 (init + parse + mount) → `-1` indeterminate (the entire compile/render phase, which is the long part) → 95 (post-process) → 100.
- Honest summary: "the bar runs 0→30 % in the first second, then stays in indeterminate animation for 99 % of wall-clock time, then snaps to 100 %."
- This is a well-implemented placeholder, not a bridging defect. The CSS `.indeterminate` animation correctly signals "we don't know the percentage." The status text (e.g., "Rendering model to STL (this may take a while)…") gives the user something useful.

Recommendation: **Adequate-as-simulated**, but **Consider-upstreaming** the underlying capability. Section 4 expands.

### 1.7 Error translation — two parallel pattern tables

OBSERVED:
- Worker-side: `src/worker/openscad-worker.js#translateError` uses `ERROR_TRANSLATIONS` (18 patterns, lines 103–227). Returns `{ message, code, raw }`. Used at `openscad-worker.js:2566`. The `code` field is consumed by the worker's own heuristic refinement (e.g., `INTERNAL_ERROR` + console output containing "top level object is empty" → `EMPTY_GEOMETRY`).
- Main-thread: `src/js/error-translator.js#translateError` uses `ERROR_PATTERNS` (19 patterns, lines 12–216). Returns `{ title, explanation, suggestion, technical }`. Used at `main.js:4677` and `main.js:8148`.
- Pattern overlap matrix (selected):

| Concept | Worker pattern | Main pattern | Overlap |
|---|---|---|---|
| Syntax | `/Parser error/i` | `/syntax error/i` | NO — different match strings; OpenSCAD emits "Parser error" |
| Cancellation | `/Rendering cancelled\|timeout/i` | `/timeout\|timed out\|too long/i` + `/Render cancelled.*hard cancel/i` | Partial |
| Memory | `/out of memory\|memory allocation failed\|OOM/i` | `/out of memory\|memory limit\|allocation failed/i` | High |
| Unknown function | `/Unknown function/i` | `/unknown function[:\s]+(\w+)/i` | Yes (main captures name) |
| Undefined variable | `/Undefined variable/i` | `/undefined variable[:\s]+(\w+)/i` | Yes (main captures name) |
| Non-2-manifold | `/WARNING: Object may not be a valid 2-manifold/i` | (none) | Worker-only |
| Empty geometry | `/Current top[ -]?level object is empty/i` | (none) | Worker-only |
| Recursion | `/Recursion detected\|Stack overflow/i` | (none) | Worker-only |
| CGAL | `/CGAL assertion\|CGAL_assertion\|CGAL ERROR\|CGAL precondition/i` | `/CGAL assertion\|CGAL_assertion\|CGAL precondition/i` (no `ERROR`) | Near-identical |
| WASM abort | `/Aborted\(\|abort\(\|Emscripten.*abort/i` | identical | Identical |
| WASM unreachable | `/RuntimeError:\s*unreachable/i` | identical | Identical |
| WASM OOB | `/RuntimeError:\s*memory access out of bounds/i` | identical | Identical |
| Library required | (none) | `/use\s+(?:<([^>]+)>\|"([^"]+)")/i` | Main-only |
| Missing include | (none) | `/include\s+(?:<([^>]+)>\|"([^"]+)")/i` | Main-only |
| Geometry | (none) | `/invalid polygon/i`, `/non-planar face/i`, `/degenerate/i` | Main-only |

INFERRED:
- The two layers serve different purposes: the worker classifies for its own heuristic refinement (`code === 'INTERNAL_ERROR' && console contains X → upgrade to EMPTY_GEOMETRY`), while the main thread produces the title + explanation + suggestion for the UI.
- But the **second translation discards the worker's classification** — main-thread `translateError(error.message)` re-matches the raw error from scratch, ignoring `error.code` (no consumer of `code` was found in the main-thread error display path).
- Net effect: worker work is wasted in the UI presentation path. Worse, if worker emits "Parser error" → main thread doesn't recognize "Parser error" (its pattern is "syntax error"), so it falls through to the default "Something Went Wrong" template.

Recommendation: **Stop-bridging via consolidation**. Choose one of:
- (a) Have the main thread consume `error.code` from the worker and look up the rich `{title, explanation, suggestion}` from a single table keyed on code. Worker keeps a tiny code-emitter; main owns the prose. ~50 LOC moved + ~30 LOC removed.
- (b) Move all pattern matching to the worker, postMessage `{ title, explanation, suggestion, technical }` directly. Removes one whole table. ~80 LOC removed across two files.
- Option (b) is cleaner; option (a) preserves the worker's heuristic refinement step (which inspects accumulated console output). Recommend (a). Phase 6 Quick Win.

---

## 2. Stop-bridging candidates (consolidated list)

| ID | Bridge | Action | Approx LOC removed | Risk | Mission impact |
|---|---|---|---|---|---|
| BR-1 | Display AST label | Rename menu/heading/announcement to "Display Parameters" | +0 / -0 (string changes) | Trivial | Low — restores honesty of label |
| BR-2 | Check Validity "(non-manifold)" parenthetical | Remove the unreachable check + parenthetical OR rename button to "Mesh Statistics" | ~5 | Trivial | Medium — stops false confidence |
| BR-3 | Geometry Info "Volume" label | Rename to "Bounding Box Volume" (Quick Win) OR compute real mesh volume (~25 LOC, deferred) | -1 / +0 | Trivial | Medium — corrects measurement |
| BR-4 | Memory % bar + `aria-valuenow` | Drop the percentage; show only "X MB allocated" | ~30 | Low | High — removes fictional value from screen-reader output |
| BR-5 | Two error translation tables | Consolidate to one (worker emits code + raw, main owns prose) | ~50 net | Medium (touches error path) | Medium — uniform error UX |

Total estimated LOC delta from these stops: **~85 lines removed**, plus ~6 string edits.

---

## 3. Consider-upstreaming candidates

These are features the doc identifies as "true implementation requires custom WASM" plus things this audit surfaced. Each is a candidate for an upstream OpenSCAD pull request adding an Emscripten binding.

| ID | Capability | Upstream surface | Why upstream rather than fork |
|---|---|---|---|
| UP-1 | Real progress callback | `EMSCRIPTEN_KEEPALIVE` hook called from CGAL/Manifold during CSG eval | Single-maintainer maintenance burden of a fork is large; benefits all OpenSCAD-on-web projects |
| UP-2 | Structured AST export | `--export-format=ast-json` emitting one JSON object per node | Replaces the parser.js shadow-implementation; benefits documentation tooling everywhere |
| UP-3 | Real CGAL manifold check | Already runs internally during render; expose result via Module export | Removes need for the unreachable Three.js heuristic in `checkValidity` |
| UP-4 | Geometry stats (volume, surface area, bbox) from CGAL | Compute during render, attach to result | Replaces bbox-volume hack; correct for all mesh shapes |
| UP-5 | Real WASM memory accounting | `malloc_usable_size` aggregation or new `getMemoryUsageBytes()` binding | Removes need for the misleading `HEAP8.length` proxy |
| UP-6 | Structured error objects | `--error-format=json` emitting `{ line, column, severity, message, code }` | Removes need for stderr regex matching in BOTH `error-translator.js` AND `openscad-worker.js#translateError` |
| UP-7 | OPENSCADPATH `-I` / library include flag | Currently the worker hacks around this via `module.ENV.OPENSCADPATH` (worker line 1318) and FS symlinks | Smaller patch, big maintenance reduction |
| UP-8 | `roof()` / `projection()` CGAL crash fix | Upstream bug — multiple `RuntimeError: unreachable` patterns guard against this | Highest user-impact fix; the worker's pre-render guard at lines 1394–1416 is purely defensive |

Existing doc (`source-code-foundation-assessment.md` §7) already prioritizes **UP-1 + UP-2** for the proposed Phase A pull request. This audit additionally recommends bundling **UP-3, UP-4, UP-5, and UP-6** into the same PR if scope allows — they share the "expose internal state via Emscripten binding" pattern and would each retire a misleading bridge in this codebase.

---

## 4. Doc inaccuracies to correct

The following statements in `docs/source-code-foundation-assessment.md` should be updated based on direct code observation:

| Doc location | Doc says | Reality (cite) |
|---|---|---|
| §2.1 row "CSG Tree / Products" | "Not implemented (menu item disabled)" | Export-to-`.csg` works today; only inline display is missing. `src/js/download.js:53–60`, `src/worker/openscad-worker.js:1242` |
| §2.1 row "Memory usage" | "Estimated from JS heap; no WASM heap visibility" | We DO read the WASM heap (`openscadModule.HEAP8.length`). The defect is that allocated buffer ≠ used memory; the worker's own comments (`src/worker/openscad-worker.js:2118–2123`) admit this. |
| §2.1 row "Check Validity" | "Geometry heuristic: count vertices/triangles via Three.js mesh" | True, but the implicit "non-manifold" check is unreachable in practice (`src/js/design-panel-controller.js:136–138` requires `!geo.index`, which never happens for STL outputs). |
| §2.1 row "Display AST" | (no text suggesting the label is misleading) | The user-facing label and announcement use the word "AST" but show a parameter dictionary. Recommend doc note. |

These corrections are listed here for Phase 7 ("additional recommended changes"); no doc edits are made in this audit cycle.

---

## 5. Hand-off to subsequent phases

- **Phase 6 (refactor synthesis)** should ingest the BR-1…BR-5 list as Quick Wins.
- **Phase 7 (additional changes)** should ingest the doc-correction list (§4) and the UP-1…UP-8 upstream candidates (with cross-reference to the existing Phase A/B/C plan in `source-code-foundation-assessment.md`).
- **Phase 5 (tests)** must verify that BR-2…BR-4 changes are accompanied by characterization tests, since they touch user-visible labels that may have implicit assertions in Playwright a11y suites.

---

## 6. UNVERIFIED items (deferred)

- The exact OpenSCAD WASM version's `--help` output (whether `--export-format=ast-json` or similar already exists in any preview build). The audit charter is read-only and does not run the WASM binary in isolation.
- Whether `clipper2-js` exposes a manifold check that could implement option (b) of BR-2 without writing a new edge-counting routine.
- The desktop OpenSCAD UI's exact framing of "Display AST" (whether desktop also shows parameters or shows real AST). If desktop also shows parameters, the BR-1 relabel may not be needed.
