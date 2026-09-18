# KI-012 WASM Root Cause Probe — Audit Results

> **Plan:** `wasm_root_cause_probe_ca8d5ecb.plan.md`
> **Date started:** 2026-04-05
> **Status:** Phase C artifacts created. Testing pending. See also
> [phase-4-wasm-validation-protocol.md](phase-4-wasm-validation-protocol.md)
> for the CSG-injection-aware validation (automated runner with bug heuristics,
> markdown output, and cross-run comparison available).

---

## Phase A: Version Bisect

See [version-bisect-results.md](version-bisect-results.md) for the full bisect template.

| Build | Bug A | Bug B | Notes |
|-------|-------|-------|-------|
| 2026.04.03 (control) | YES | YES | Our current build |
| 2026.01.03 | _____ | _____ | Matches desktop reference |
| 2025.03.25 | _____ | _____ | Previous build |

**Phase A conclusion:** _pending_

---

## Phase B: WASM Playground Comparison

See [playground-comparison-results.md](playground-comparison-results.md) for the full template.

| Platform | Bug A | Bug B | Notes |
|----------|-------|-------|-------|
| ochafik.com/openscad2 | _____ | _____ | |
| Official Playground | _____ | _____ | |

**Phase B conclusion:** _pending_

---

## Phase C: Diagnostic SCAD Probes

**Probe file:** [wasm-diagnostic-probes.scad](wasm-diagnostic-probes.scad)

### How to run

**WASM (via app):**

1. Load `wasm-diagnostic-probes.scad` in the app
2. Set `probe_id` to 1–4 (or 0 for all probes)
3. Export STL for each probe
4. Record triangle count, render time, and console echo output

**Desktop CLI:**

```bash
# Run each probe individually
for i in 1 2 3 4; do
  openscad -D "probe_id=$i" -o "probe_c${i}_desktop.stl" wasm-diagnostic-probes.scad
done

# Run all probes at once
openscad -D "probe_id=0" -o "probe_all_desktop.stl" wasm-diagnostic-probes.scad
```

**PowerShell equivalent:**

```powershell
foreach ($i in 1..4) {
  openscad -D "probe_id=$i" -o "probe_c${i}_desktop.stl" wasm-diagnostic-probes.scad
}
openscad -D "probe_id=0" -o "probe_all_desktop.stl" wasm-diagnostic-probes.scad
```

### Probe C1: Rounding Mode / Predicate Sensitivity

**Tests:** `fesetround(FE_UPWARD)` no-op in WASM (Candidate 1).
Creates geometry at float64 precision boundaries where CGAL's interval
arithmetic must correctly bound predicates. If rounding modes are broken,
`difference()` produces wrong results near degenerate configurations.

| Metric | WASM | Desktop | Match? |
|--------|------|---------|--------|
| Triangle count | _______ | _______ | YES / NO |
| STL file size (bytes) | _______ | _______ | YES / NO |
| Render time | _______ | _______ | |
| `C1_IDENTITY_TEST` echo value | _______ | _______ | YES / NO |
| Visual artifacts? | YES / NO | YES / NO | |

**Observations:**

_Describe any visible differences — stray faces, missing walls, thin-wall
artifacts in the precision-boundary geometry._

---

### Probe C2: Clipper2 Integer Coordinate Overflow

**Tests:** Clipper2 int64 coordinate overflow at large scales (Candidate 2).
Uses `offset()` on increasingly large squares (50→500→5000→100000 units).
If Clipper's integer scaling wraps at 32 bits, larger squares will have
pointy artifacts or degenerate triangles.

| Scale | WASM triangles | Desktop triangles | Match? |
|-------|----------------|-------------------|--------|
| 50×50 (safe) | _______ | _______ | YES / NO |
| 500×500 (moderate) | _______ | _______ | YES / NO |
| 5000×5000 (large) | _______ | _______ | YES / NO |
| 100000×100000 (extreme) | _______ | _______ | YES / NO |
| Negative offset (200×200) | _______ | _______ | YES / NO |
| Star polygon offset | _______ | _______ | YES / NO |

_Note: To get per-scale triangle counts, run each pattern separately
or inspect the STL visually for artifacts at each scale level._

| Metric | WASM | Desktop | Match? |
|--------|------|---------|--------|
| Total triangle count (all scales) | _______ | _______ | YES / NO |
| STL file size (bytes) | _______ | _______ | YES / NO |
| Render time | _______ | _______ | |
| Visual artifacts at scale 3-4? | YES / NO | YES / NO | |

**Observations:**

_Describe any pointy artifacts, missing corners, or degenerate triangles
at the larger coordinate scales._

---

### Probe C3: 2D Offset Precision (linear_extrude pattern)

**Tests:** Accumulated precision loss in `offset()` + `difference()` +
`linear_extrude()` chains (matches keyguard construction pattern).
Four sub-patterns test simple frames, double-offset round-trips,
nested differences with offsets, and multi-cutout patterns.

| Metric | WASM | Desktop | Match? |
|--------|------|---------|--------|
| Triangle count | _______ | _______ | YES / NO |
| STL file size (bytes) | _______ | _______ | YES / NO |
| Render time | _______ | _______ | |
| Ghost faces visible? | YES / NO | YES / NO | |
| Missing walls? | YES / NO | YES / NO | |

**Sub-pattern detail (if total counts differ):**

| Pattern | Description | WASM | Desktop | Match? |
|---------|-------------|------|---------|--------|
| 1 | Simple offset frame | _______ | _______ | YES / NO |
| 2 | Double-offset round-trip | _______ | _______ | YES / NO |
| 3 | Nested difference + offset (Bug B pattern) | _______ | _______ | YES / NO |
| 4 | Multi-cutout difference | _______ | _______ | YES / NO |

**Observations:**

_This probe most closely mirrors the keyguard's construction pattern.
Note any ghost cutouts or incomplete subtractions, especially in
patterns 3 and 4._

---

### Probe C4: Coordinate System Extremes / 32-bit Truncation

**Tests:** Geometry at different coordinate magnitudes (Candidate 4).
Same `difference()` at origin, 1e3, 1e6, plus a high-$fn sphere
and sub-millimeter scaled geometry. If wasm32 truncates coordinate-
related integers, geometry at large coordinates will be corrupted.

| Coordinate | WASM triangles | Desktop triangles | Match? |
|------------|----------------|-------------------|--------|
| Origin | _______ | _______ | YES / NO |
| translate([1e3, 1e3, 0]) | _______ | _______ | YES / NO |
| translate([1e6, 1e6, 0]) | _______ | _______ | YES / NO |
| High-$fn sphere (128) | _______ | _______ | YES / NO |
| Sub-mm (0.01× scale) | _______ | _______ | YES / NO |

| Metric | WASM | Desktop | Match? |
|--------|------|---------|--------|
| Total triangle count | _______ | _______ | YES / NO |
| STL file size (bytes) | _______ | _______ | YES / NO |
| Render time | _______ | _______ | |

**Observations:**

_If the origin and 1e3 patterns match but 1e6 differs, this confirms
32-bit coordinate truncation. If the high-$fn sphere differs, this
points to vertex buffer index overflow._

---

### Phase C Summary

| Probe | Candidate Tested | WASM = Desktop? | Failure Mode Detected? |
|-------|-----------------|-----------------|----------------------|
| C1 — Rounding mode | fesetround no-op | YES / NO | YES / NO |
| C2 — Clipper overflow | Clipper2 int64 overflow | YES / NO | YES / NO |
| C3 — Offset precision | 2D offset + extrude | YES / NO | YES / NO |
| C4 — Coord extremes | wasm32 size_t/long | YES / NO | YES / NO |

**Phase C conclusion:**

- [ ] **All probes match** — The failure modes tested by these probes are
      NOT the root cause. The bug requires the complexity of the full
      keyguard model to manifest (interaction effects, not single-operation
      failures).
- [ ] **Probe C1 differs** — Rounding mode failure confirmed. The WASM
      `fesetround` no-op causes wrong predicates. File upstream issue
      and investigate CGAL rounding workarounds.
- [ ] **Probe C2 differs** — Clipper integer overflow confirmed at large
      coordinates. Check if keyguard model coordinates exceed the safe
      range for wasm32 Clipper.
- [ ] **Probe C3 differs** — Offset precision loss confirmed in the exact
      pattern used by the keyguard. This is likely the proximate cause
      of Bug B (ghost cutouts).
- [ ] **Probe C4 differs** — Coordinate system truncation confirmed.
      Investigate maximum coordinate values in the keyguard model.
- [ ] **Multiple probes differ** — List: _________. The root cause may
      be a combination of these failure modes.

---

## Phase D: WASM Runtime Diagnostics

**Implementation:** `__forgeDebug.probeWasmPlatform()` in `src/main.js`

### How to run

1. Open the app in a browser with DevTools console open
2. Wait for WASM to initialize (status bar shows "Ready")
3. Run in console:

```js
const probe = await __forgeDebug.probeWasmPlatform();
```

4. Results are printed to the console and returned as an object
5. Copy the returned `probe` object for the table below

### What it tests

The probe renders a small diagnostic model with three sub-probes:

- **Probe 1:** Baseline `difference()` of cubes (tests boolean operations)
- **Probe 2:** `offset(r=1)` + `linear_extrude()` (tests Clipper pathway)
- **Probe 3:** Precision-boundary `difference()` with 0.0001-unit offsets
  (surfaces rounding-mode failures — Candidate 1)

It also captures `echo()` output for `version()` and `$vpr`, checks
INTEGRITY.json for build metadata, and snapshots heap memory before
and after the render.

### Results

| Metric | Value |
|--------|-------|
| WASM build | _______ |
| WASM build date | _______ |
| OpenSCAD version string | _______ |
| $vpr | _______ |
| Manifold backend available | YES / NO |
| Binary STL available | YES / NO |
| Lazy union available | YES / NO |
| WASM init time (ms) | _______ |
| WASM memory before render (MB) | _______ |
| WASM memory after render (MB) | _______ |
| Memory growth during render (MB) | _______ |
| Memory growth during render (bytes) | _______ |
| Reference model triangle count | _______ |
| Reference model STL size (bytes) | _______ |
| Reference model render time (ms) | _______ |
| CGAL/rounding warnings | _______ |
| Total console warnings | _______ |
| Known issues (INTEGRITY.json) | _______ |

### Console output

_Paste raw `probe.consoleOutput` here:_

```
(pending)
```

**Phase D conclusion:** _pending_

---

## Phase E: Binary STL Vertex Comparison

_Pending — requires STL files from both WASM and desktop renders._

| Metric | WASM baseline | Desktop baseline | Delta |
|--------|---------------|------------------|-------|
| Triangle count | 56,780 | 59,016 | -2,236 (-3.8%) |
| Bounding box min | _______ | _______ | _______ |
| Bounding box max | _______ | _______ | _______ |
| Centroid | _______ | _______ | _______ |
| Max coordinate value | _______ | _______ | _______ |
| Min edge length | _______ | _______ | _______ |
| Max edge length | _______ | _______ | _______ |

**Phase E conclusion:**

- [ ] Bounding boxes match — geometry is structurally equivalent, only
      tessellation differs
- [ ] Bounding boxes differ — geometry construction is fundamentally
      different between WASM and desktop
- [ ] Pending

---

## Decision Tree Outcome

```
Phase A: Does WASM 2026.01.03 show the bugs?
|
+-- NO  --> Regression introduced Jan-Apr 2026
|           Binary bisect to exact date -> file upstream issue
|
+-- YES --> Long-standing WASM issue
    |
    Phase B: Does official Playground show the bugs?
    |
    +-- YES --> Upstream OpenSCAD WASM build issue
    |           Phase C probes identify which subsystem
    |           -> File upstream issue with probe results
    |
    +-- NO  --> Our app's invocation issue
                Audit: parameter encoding, FS mounting,
                module reuse, memory state
```

**Decision path taken:** _Fill in after Phase A and B are executed._

**Confirmed root cause:** _Fill in when definitively proven._

---

## Cross-Reference: Findings Report

After completing all phases, update the main
[findings-report.md](findings-report.md) with:

1. Phase C probe results (section "Phase C — Diagnostic SCAD Probes")
2. Phase D runtime diagnostics
3. Phase E STL comparison data
4. Updated root cause determination
5. Updated recommended next steps
