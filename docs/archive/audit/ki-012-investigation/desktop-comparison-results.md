# KI-012 Desktop CLI Comparison Results

> **Protocol:** [desktop-comparison-protocol.md](desktop-comparison-protocol.md)
> **Date executed:** 2026-04-05
> **Executed by:** Automated via `run-all-desktop-tests.ps1` (Cursor agent)

---

## Environment

### OpenSCAD Versions

| Build | Version string | Download date | Source |
|-------|---------------|---------------|--------|
| April 2026 Nightly | NOT AVAILABLE | — | — |
| January 2026 Nightly | OpenSCAD version 2026.01.03 | pre-installed | `C:\Program Files\OpenSCAD (Nightly)\openscad.com` |

### System

| Item | Value |
|------|-------|
| OS | Windows 10 (10.0.26200) |
| CPU | (not recorded) |
| RAM | (not recorded) |

### Script Fix Applied

The original `run-all-desktop-tests.ps1` had a quoting bug: `Start-Process -ArgumentList`
passed the array directly, causing Windows' C runtime to strip the inner double quotes from
`-D` values (e.g. `type_of_keyguard="3D-Printed"` became `type_of_keyguard=3D-Printed`).
This caused a parser error on all three bundles.

**Fix:** Arguments containing quotes or spaces are now backslash-escaped and wrapped in
outer double quotes before being joined into a single argument string for `Start-Process`.

---

## WASM Capture Reference Data

Triangle counts from WASM renders (from `metadata.json`):

| Bundle | expose_home_button | expose_upper_message_bar | WASM Triangles | WASM Size (bytes) |
|--------|--------------------|--------------------------|----------------|-------------------|
| Baseline | `"yes"` | `"yes"` | 56,780 | 2,839,084 |
| Bug A | `"no"` | `"yes"` | 56,158 | 2,807,984 |
| Bug B | `"yes"` | `"no"` | 56,548 | 2,827,484 |

---

## Test 1: April 2026 Nightly + Manifold Backend

**NOT EXECUTED** — April 2026 nightly is not installed. Only the January 2026
nightly (2026.01.03) is available on this system.

---

## Test 2: January 2026 Nightly + Manifold Backend

### 2a. Baseline (both params "yes")

| Metric | Value |
|--------|-------|
| Render time | 0.505 s (wall clock ~2 s including startup) |
| Triangle count | 59,016 |
| File size (bytes) | 2,950,884 |
| OpenSCAD exit code | 0 |
| Stderr warnings | none |
| Manifold status | NoError |
| Genus | 89 |
| Vertices | 29,332 |

**Visual inspection:** PENDING — STL at `baseline-capture/work/baseline-jan2026.stl`

---

### 2b. Bug A (expose_home_button = "no")

| Metric | Value |
|--------|-------|
| Render time | 0.677 s (wall clock ~2 s) |
| Triangle count | 58,388 |
| File size (bytes) | 2,919,484 |
| OpenSCAD exit code | 0 |
| Stderr warnings | none |
| Manifold status | NoError |
| Genus | 88 |
| Vertices | 29,020 |

**Bug A symptom check:**

- Does a tab jut out on the right edge where the home button cutout would be?
  - [ ] YES — Bug A reproduces on desktop
  - [x] NO — Right edge is a straight line (correct geometry)
  - [ ] PARTIAL — Describe: _________

**Confirmed clean by visual inspection (2026-04-05).** Desktop produces correct geometry.

---

### 2c. Bug B (expose_upper_message_bar = "no")

| Metric | Value |
|--------|-------|
| Render time | 0.631 s (wall clock ~2 s) |
| Triangle count | 58,732 |
| File size (bytes) | 2,936,684 |
| OpenSCAD exit code | 0 |
| Stderr warnings | none |
| Manifold status | NoError |
| Genus | 90 |
| Vertices | 29,188 |

**Bug B symptom check:**

- Are there partial square cutouts / notched angles near grid positions #1 and #12?
  - [ ] YES — Bug B reproduces on desktop
  - [x] NO — Surface is solid above those positions (correct geometry)
  - [ ] PARTIAL — Describe: _________

**Confirmed clean by visual inspection (2026-04-05).** Desktop produces correct geometry.
The genus anomaly (89→90) was a misleading quantitative indicator — the topology
difference does not manifest as the visual ghost cutout bug. The genus difference
may reflect a legitimate topological change in the message bar region that is
geometrically correct.

---

## Test 3 (Optional): April 2026 Nightly + CGAL Backend

Not executed (April 2026 nightly not available).

---

## Triangle Count Comparison Matrix

| Bundle | WASM (Apr 2026) | Desktop Jan 2026 | Desktop Apr 2026 | Desktop Apr CGAL |
|--------|-----------------|-------------------|-------------------|-------------------|
| Baseline | 56,780 | 59,016 | — | — |
| Bug A | 56,158 | 58,388 | — | — |
| Bug B | 56,548 | 58,732 | — | — |

### Delta Analysis (vs. baseline within each platform)

| Bundle | WASM delta | Desktop Jan 2026 delta |
|--------|------------|------------------------|
| Bug A | -622 (-1.1%) | -628 (-1.1%) |
| Bug B | -232 (-0.4%) | -284 (-0.5%) |

The per-platform deltas are very consistent, suggesting both platforms are computing
essentially the same geometry. The ~4% absolute difference between WASM and desktop
triangle counts (59,016 vs 56,780) is attributable to the different Manifold engine
versions.

### Genus Analysis

| Bundle | WASM | Desktop Jan 2026 | Genus delta from baseline |
|--------|------|-------------------|---------------------------|
| Baseline | (not captured) | 89 | — |
| Bug A | (not captured) | 88 | -1 (expected: removed one opening) |
| Bug B | (not captured) | 90 | **+1 (ANOMALOUS: expected decrease)** |

---

## Summary

### Bug A (home button tab)

| Environment | Bug present? | Triangle count |
|-------------|-------------|----------------|
| WASM (our app) | **YES** | 56,158 |
| Desktop Jan 2026 + Manifold | **NO** (visually confirmed clean) | 58,388 |
| Desktop Apr 2026 + Manifold | — | — |
| Desktop Apr 2026 + CGAL | — | — |

### Bug B (ghost cutouts)

| Environment | Bug present? | Triangle count |
|-------------|-------------|----------------|
| WASM (our app) | **YES** | 56,548 |
| Desktop Jan 2026 + Manifold | **NO** (visually confirmed clean) | 58,732 |
| Desktop Apr 2026 + Manifold | — | — |
| Desktop Apr 2026 + CGAL | — | — |

---

## Conclusion

### Conclusion — WASM engine issue confirmed

Desktop OpenSCAD 2026.01.03 + Manifold produces **correct geometry** for all three
bundles. Visual inspection confirms no Bug A (no tab artifact) and no Bug B (no ghost
cutouts). The same inputs produce buggy geometry only in our WASM pipeline.

The user also confirms that desktop OpenSCAD produces correct output with both CGAL
and Manifold backends. The bugs are **WASM-specific**.

**Root cause determination based on desktop comparison:**

- [x] **WASM engine issue** — Desktop produces correct geometry with the same inputs.
      Both Bug A and Bug B are absent on desktop but present in our WASM renders.
      The problem is either in the WASM build of OpenSCAD itself (e.g. 32-bit float
      precision vs 64-bit double on desktop, or a WASM-specific Manifold code path)
      or in how our app constructs/passes data to the WASM engine.
- [ ] **Manifold engine issue** — Desktop + Manifold shows the same bugs; CGAL is correct
- [ ] **Manifold regression** — Jan 2026 is correct, Apr 2026 shows bugs
- [ ] **Input issue** — Desktop also shows bugs regardless of backend/version (revisit app)
- [ ] **Inconclusive** — Describe: _________

**Notes / observations:**

1. The `run-all-desktop-tests.ps1` script required a fix for `-D` value quoting —
   `Start-Process -ArgumentList` with an array doesn't preserve inner double quotes.
   The fix backslash-escapes inner quotes and wraps affected arguments in outer quotes.

2. All three renders completed without errors (Manifold status: NoError). Render
   times were ~0.5–0.7s on desktop vs 3–13s on WASM.

3. The Bug A and Bug B captures are missing the 16 "LWFL tail" parameters present
   in the baseline capture (due to the parameter dropout bug that existed at capture
   time). Since these parameters have defaults in the SCAD source, this should not
   affect geometry.

4. The genus anomaly in Bug B (89→90) was misleading — visual inspection shows the
   desktop geometry is correct despite the topology difference. Genus alone is not
   a reliable proxy for visual bug detection in this model.

5. The ~4% triangle count difference between WASM and desktop (56,780 vs 59,016
   for baseline) may be relevant — different tessellation or Manifold version
   behavior in the WASM build could contribute to the geometry errors.

---

## Discrepancies Noted

### Hidden parameter difference between captures

The baseline capture includes additional `-D` parameters not present in Bug A
and Bug B captures (see protocol for full list). Since these parameters have
defaults in the SCAD source, omitting them from `-D` should produce identical
behavior to passing the defaults explicitly. However, if results are
inconsistent, re-run Bug A and Bug B with the hidden parameters added to
confirm this is not a factor.

### Bug B duplicate capture

`bug-b-capture-2/` is a duplicate of `bug-b-capture/` with identical
metadata and timestamps. Only `bug-b-capture/` is used in this comparison.

### Triangle count variance between WASM and Desktop

All three bundles show a consistent ~4% increase in desktop triangle counts vs WASM.
This is attributable to the different Manifold engine versions (WASM build date
unknown vs desktop 2026.01.03) and is not a concern for the comparison.

---

## RESOLUTION ADDENDUM (2026-08-04) — variance is tessellation-only, parity confirmed

The parity harness (`npm run parity`, added on branch `remediation/track-1`)
settled this question with dimensional measurements instead of triangle
counts. WASM `OpenSCAD-2026.04.03` vs desktop Nightly `2026.01.03`
(Manifold, byte-identical `-D` inputs via the app's own
`scad-param-formatter.js`), 7 fixtures including all three keyguard-v75
reference configurations and the braille charm:

| Fixture | Volume Δ | BBox Δ | Facets Δ |
|---|---|---|---|
| cube-cyl-diff | 0.0000% | 0.0000 mm | 0% |
| sphere-fn | 0.0000% | 0.0000 mm | 0% (hash-identical) |
| keyguard-minimal | 0.0000% | 0.0000 mm | 0% (hash-identical) |
| kv75-3d-printed | 0.0000% | 0.0000 mm | −4.46% (11478 vs 12014) |
| kv75-laser-cut | 0.0000% | 0.0000 mm | −9.19% (6026 vs 6636) |
| kv75-frame-multicolor | 0.0000% | 0.0000 mm | −3.95% (13560 vs 14118) |
| braille-charm | 0.0000% | 0.0000 mm | 0% |

Every fixture passes the `matched` tolerance profile (volume ≤ 0.1%,
bbox ≤ 0.01 mm) even though the engines are different versions. The
facet-count deficit has **zero dimensional impact** — it is Manifold
tessellation bookkeeping, not missing or altered geometry. The planned
WASM version bisect (`version-bisect-results.md`) is therefore
unnecessary and was not executed.

WASM output is also deterministic run-to-run (canonical SHA-256 of the
triangle set matches across fresh renders), which is what allows the
`golden` profile (`npm run parity:ci`) to gate CI on hash equality
against `scripts/parity/golden/golden-manifest.json`.

Note: these renders postdate the removal of `injectCsgColors()` source
mutation (commit 52335d8) and the OFF-as-STL export fallback (d5a1f7d).
The user-facing geometry corruption KI-012 tracked came from those
pipeline defects, not from the WASM engine.
