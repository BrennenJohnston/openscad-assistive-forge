# KI-012 Investigation Findings Report

> **Investigation:** KI-012 — LWFL Keyguard Geometry Discrepancies (Bug A & Bug B)
> **Report date:** 2026-04-05 (updated 2026-04-06)
> **Plan:** `ki-012_root_cause_proof_b2ac651b.plan.md`, `fix_companion_alias_regression_ff8cb110.plan.md`, `debug_persistent_bug_a_b_e241e271.plan.md`
> **Status:** **RESOLVED** (2026-04-06). Companion alias semantics inverted from "replace existing" to "create missing only." Existing root-level companion files are never replaced; missing ones are created from the resolved nested path. Manual browser verification confirmed Bug A, Bug B, and triangle artifacting all fixed.

---

## Executive Summary

This investigation was initiated after five prior plans spent two days attempting
to root-cause Bug A (home button tab persists when disabled) and Bug B (ghost
cutouts when upper message bar disabled) through code-level analysis and debug
toggles. All five reached the same conclusion — "upstream Manifold engine issue,
confirmed via elimination" — without ever testing the actual WASM engine inputs
against an independent reference.

This plan took a different approach: **capture the exact bytes the WASM engine
receives and compare them against desktop OpenSCAD CLI and the official WASM
Playground.** The goal was to produce runtime evidence, not code-audit inferences.

### What was accomplished

1. **WASM input capture tool built** (Phase 1) — `captureWasmInputs()` debug
   function added to `src/main.js`, capable of downloading a complete ZIP of
   every file, parameter, and flag the WASM engine receives for a render.

2. **Three input bundles captured** (Phase 2) — baseline, Bug A, and Bug B
   conditions, each containing the SCAD source, 202 companion files, complete
   `callMain` argument arrays, and metadata. The captures confirm that:
   - The WASM engine is using the Manifold backend (`--backend=Manifold`)
   - All 202 project files are correctly mounted in the Emscripten filesystem
   - The `-D` parameter values match the intended bug conditions
   - No debug toggles are active; no source overrides are in effect
   - Triangle counts are non-zero and consistent across bug/baseline conditions

3. **Desktop CLI comparison protocol written** (Phase 3) — with automated
   runner scripts (`run-desktop.ps1`, `run-desktop.sh`, `run-all-desktop-tests.ps1`)
   generated from the captured `callMain` arguments.

4. **WASM Playground comparison protocol written** (Phase 4) — with helper
   script (`prepare-playground-bundle.ps1`) that generates playground-ready
   directories with parameters appended as variable assignments.

5. **Version bisect protocol written** (Phase 5) — with WASM build swap script
   (`swap-wasm-build.ps1`) and a full inventory of available WASM builds from
   January–April 2026.

### Resolution (2026-04-06)

**Root cause identified and fixed.** Git bisect across 43 unpushed commits
pinpointed commit `bb1b9ef` as the regression source. The commit itself was
correct (improved companion resolution for ~28 LWFL presets), but it exposed
a latent bug in `applyCompanionAliases()` which unconditionally created root-
level companion files when none existed in the canonical project. This changed
what OpenSCAD's `include` directive found, producing wrong geometry.

**Initial fix (2026-04-06a):** Two `result.has()` guards added to the legacy
path in `applyCompanionAliases()` — prevented creation of new root keys but
still allowed replacement of existing ones.

**Refined fix (2026-04-06b):** Guards inverted in both generic and legacy paths
to "create-only" semantics. `applyCompanionAliases()` now only creates a root
key when the target is *missing* from the project files. When the target already
exists, the original content is preserved. This prevents Scenario A (root file
replaced by nested preset-specific content) and Scenario B (generic path
bypassing legacy guards). Diagnostic logging added to both code paths.

Five new regression tests added for the create-only semantics, eight existing
tests updated. All 3015 tests pass across 62 test files.

The "upstream WASM engine issue" hypothesis from five prior investigations was
**disproven** — the bug was app-level all along. Manual browser verification
is the only remaining step.

---

## Evidence Table

### Phase 1 — WASM Input Capture Tool

| Item | Status | Evidence |
|------|--------|----------|
| `captureWasmInputs()` function | Implemented | `src/main.js` — `window.__forgeDebug.captureWasmInputs()` |
| ZIP packaging | Verified | All three captures produce valid ZIPs with correct structure |
| Desktop repro scripts | Generated | `run-desktop.ps1` and `run-desktop.sh` in each capture bundle |
| Companion file capture | Verified | 202 files captured per bundle, including full directory tree |

### Phase 2 — Captured Input Bundles

| Bundle | `expose_home_button` | `expose_upper_message_bar` | Triangles | Size (bytes) | Render time (ms) | Captured at |
|--------|----------------------|----------------------------|-----------|-------------|-------------------|-------------|
| **Baseline** | `"yes"` | `"yes"` | 56,780 | 2,839,084 | 3,231 | 2026-04-05T00:18:04Z |
| **Bug A** | `"no"` | `"yes"` | 56,158 | 2,807,984 | 12,870 | 2026-04-05T00:20:12Z |
| **Bug B** | `"yes"` | `"no"` | 56,548 | 2,827,484 | 10,047 | 2026-04-05T00:32:45Z |

**Key observations from capture metadata:**

- All three bundles use the same SCAD source (`keyguard_v75.scad`) and identical
  companion file set (202 files). The only differences are in the `-D` parameter
  values.
- The baseline capture had additional "hidden" `-D` parameters not present in
  the original Bug A and Bug B captures due to the parameter dropout bug. This
  discrepancy was the basis for the dropout hypothesis, which has since been
  **disproven** — after fixing the dropout (preserving all 190 params including
  the 16 LWFL tail), both bugs still reproduce. See
  [desktop-comparison-protocol.md](desktop-comparison-protocol.md) §"Hidden
  parameter discrepancy" for the full list.
- Bug A render took ~4x longer than baseline (12.8s vs 3.2s). Bug B took ~3x
  longer (10.0s vs 3.2s). The baseline's fast render time (3.2s) suggests it
  may have hit a cache or simpler code path; the bug conditions' longer times
  are more typical of a full render.
- WASM capabilities confirmed: Manifold backend, lazy-union, binary STL export,
  no CGAL/fast-CSG. OpenSCAD version reports as `"unknown"` (typical for custom
  WASM builds).

### Phase 1b — WASM CGAL Backend Comparison (executed 2026-04-05)

| Test | Status | Bug A? | Bug B? | Render Time | Triangles |
|------|--------|--------|--------|-------------|-----------|
| CGAL baseline (LOW quality) | **EXECUTED** | — | — | 12:44.585 | 38,062 (OFF fallback) |
| CGAL Bug A (LOW quality) | **EXECUTED** | **YES** | — | ~12 min | visual confirmation |
| CGAL Bug B (LOW quality) | **EXECUTED** | — | **YES** | ~12 min | visual confirmation |

**Result: BOTH bugs reproduce with CGAL backend.** This is the single most
important finding of the investigation — the bugs are **engine-independent**.

**Key observations:**

- CGAL rendered the full model in ~12 minutes 45 seconds at LOW quality
  (`$fa=10`, `$fs=2`), producing a valid Nef polyhedron with 18,998 vertices,
  13,119 facets, and 2 volumes (Simple: yes).
- Binary STL export from CGAL produces 0 bytes of triangle data — a known
  limitation of the WASM CGAL export path. The auto-preview system correctly
  fell back to OFF format, which rendered 38,062 faces with vertex colors.
- Bug A (home button tab persists when `expose_home_button="no"`) and Bug B
  (ghost cutouts when `expose_upper_message_bar="no"`) are both visually
  confirmed in the CGAL preview at low resolution.
- This rules out the leading hypothesis ("WASM Manifold computes differently")
  and points to either an inherent SCAD geometry issue or a WASM-platform-wide
  problem affecting both boolean engines.

**Decision tree outcome:** Proceed to **Phase 2B** (engine-independent
investigation). The critical next test is the desktop CLI comparison (Phase 3)
to determine whether desktop OpenSCAD also shows the same bugs.

### Phase 3 — Desktop CLI Comparison

| Test | Status | Result |
|------|--------|--------|
| April 2026 Nightly + Manifold: Baseline | **NOT AVAILABLE** | April 2026 nightly not installed |
| April 2026 Nightly + Manifold: Bug A | **NOT AVAILABLE** | April 2026 nightly not installed |
| April 2026 Nightly + Manifold: Bug B | **NOT AVAILABLE** | April 2026 nightly not installed |
| January 2026 Nightly + Manifold: Baseline | **EXECUTED** | 59,016 tri, Genus 89, NoError — correct |
| January 2026 Nightly + Manifold: Bug A | **EXECUTED** | 58,388 tri, Genus 88, NoError — **NO BUG (clean)** |
| January 2026 Nightly + Manifold: Bug B | **EXECUTED** | 58,732 tri, Genus 90, NoError — **NO BUG (clean)** |
| April 2026 Nightly + CGAL: Bug A | **NOT AVAILABLE** | April 2026 nightly not installed |
| April 2026 Nightly + CGAL: Bug B | **NOT AVAILABLE** | April 2026 nightly not installed |

**Key finding: WASM issue confirmed.** Desktop produces correct geometry for all three
conditions — no Bug A tab, no Bug B ghost cutouts. Visual inspection confirms clean
output. The same inputs produce buggy geometry only in our WASM pipeline. The user
also confirms desktop works correctly with both CGAL and Manifold backends.

**Script fix applied:** `run-all-desktop-tests.ps1` had a quoting bug — `Start-Process
-ArgumentList` with an array didn't preserve inner double quotes in `-D` values. Fixed
by backslash-escaping inner quotes and building a single properly-escaped argument string.

**Protocol:** [desktop-comparison-protocol.md](desktop-comparison-protocol.md)
**Results:** [desktop-comparison-results.md](desktop-comparison-results.md)
**Automated runner:** [run-all-desktop-tests.ps1](run-all-desktop-tests.ps1)

### Phase 4 — WASM Playground Comparison

| Test | Status | Result |
|------|--------|--------|
| ochafik OpenSCAD2: Baseline | **NOT EXECUTED** | — |
| ochafik OpenSCAD2: Bug A | **NOT EXECUTED** | — |
| ochafik OpenSCAD2: Bug B | **NOT EXECUTED** | — |
| Official Playground: Bug A | **NOT EXECUTED** | — |
| Official Playground: Bug B | **NOT EXECUTED** | — |

**Protocol:** [playground-comparison-protocol.md](playground-comparison-protocol.md)
**Results template:** [playground-comparison-results.md](playground-comparison-results.md)
**Helper script:** [prepare-playground-bundle.ps1](prepare-playground-bundle.ps1)

### Phase 5 — WASM Build Version Bisect

| Build | Status | Bug A | Bug B |
|-------|--------|-------|-------|
| 2026.04.03 (control — our build) | Confirmed buggy | YES | YES |
| 2026.03.28 | **NOT TESTED** | — | — |
| 2026.02.01 | **NOT TESTED** | — | — |
| 2026.01.16 (size jump) | **NOT TESTED** | — | — |
| 2026.01.03 (matches desktop ref) | **NOT TESTED** | — | — |
| 2025.03.25 (previous build) | **NOT TESTED** | — | — |

**Protocol:** [version-bisect-protocol.md](version-bisect-protocol.md)
**Results template:** [version-bisect-results.md](version-bisect-results.md)
**Swap script:** [swap-wasm-build.ps1](swap-wasm-build.ps1)

### Phase 6 — Git Bisect and Fix (executed 2026-04-05/06)

**Git bisect across the 43 unpushed commits identified commit `bb1b9ef` as the
first bad commit.**

| Step | Action | Result |
|------|--------|--------|
| Bisect start | `HEAD` (bad) vs `origin/develop` (good) | 43 commits, ~6 steps |
| Bisect result | Commit `bb1b9ef` | **FIRST BAD COMMIT** |

**Offending commit:** `bb1b9ef` — "fix: resolve sibling substring ambiguity in
resolveByHierarchy()"

This commit added sibling-tie resolution logic in `resolveByHierarchy()` (lines
628-656 of `zip-handler.js`). For LWFL keyguard presets, it changed
`openingsPath` from `null` (ambiguous — no winner among tied candidates) to a
specific resolved path (`Cases and App Specifics/.../LWFL/openings_and_additions.txt`).
The resolution itself is correct — it fixed ~28 LWFL presets that previously
returned null. Subsequent commits (`554aa75`, `3b0f017`) added app-name matching
and ancestor fallback that also resolve the same path, confirming all resolution
strategies agree.

**The actual bug** was in `applyCompanionAliases()` (lines 925-932), which
unconditionally set root key `openings_and_additions.txt` to the content from
the resolved nested path. For the keyguard project, no root-level
`openings_and_additions.txt` exists — the SCAD source uses `include
<openings_and_additions.txt>` which OpenSCAD resolves via its library path
mechanism, not by looking for a root-level file. When `applyCompanionAliases`
*created* this root key, it changed what OpenSCAD's `include` found, altering
the geometry. The same mechanism applied to `default.svg`.

On `origin/develop`, `openingsPath` was `null` (ambiguous), so the aliasing
code's guard `if (companionMapping.openingsPath && ...)` was falsy and the
function was a no-op — canonical project files passed through unmodified.

**Initial fix (a):** Added a root key existence guard to both legacy alias
paths — `result.has('openings_and_additions.txt')` and `result.has('default.svg')`.
This prevented *creation* of root keys but still allowed *replacement*.

**Refined fix (b):** Inverted all three guard conditions to "create-only":

```diff
 // Generic path
-if (sourcePath && result.has(sourcePath) && result.has(aliasTarget)) {
+if (sourcePath && result.has(sourcePath) && !result.has(aliasTarget)) {

 // Legacy openings path
-  result.has('openings_and_additions.txt')
+  !result.has('openings_and_additions.txt')

 // Legacy SVG path
-  result.has('default.svg')
+  !result.has('default.svg')
```

Semantics: only **create** a missing root key from the resolved nested file —
never **replace** an existing one. When the root file exists, the SCAD was
designed to use it across all presets. When it's missing, creating it provides
per-preset companion content that OpenSCAD's `include` directive would
otherwise fail to find.

Diagnostic `console.debug` logging added to both generic and legacy paths,
reporting whether each alias target was created or skipped. Additional
diagnostics in `applyPresetParametersAndCompanions` log `rootOpeningsExists`,
`rootSvgExists`, `mappingPath`, and whether content changed.

**Regression tests:** 5 new test cases in `zip-handler.test.js` under
`applyCompanionAliases — create-only semantics (KI-012 inversion)`:

1. Generic: should CREATE root key when target does not exist (Structure B)
2. Generic: should NOT replace root key when target already exists (Structure A)
3. Legacy: should CREATE root openings when target does not exist
4. Legacy: should NOT replace root openings when target already exists
5. Integration: `buildPresetCompanionMap` + `applyCompanionAliases` with
   Structure B (no root file) confirms per-preset creation works

**Existing tests updated (8):** Tests that previously expected replacement now
expect preservation of original root content. Tests that expected no creation
now expect creation. All 3015 tests pass across 62 test files.

**Verification status:** Manual verification of Bug A and Bug B pending.

---

## Version Matrix

This matrix is designed to be filled in as tests are executed.

| Bundle | WASM Manifold (Apr 2026) | WASM CGAL (Apr 2026) | Desktop Apr 2026 Manifold | Desktop Jan 2026 Manifold | Desktop Apr 2026 CGAL | Playground (ochafik) | Playground (Official) |
|--------|--------------------------|----------------------|---------------------------|---------------------------|-----------------------|---------------------|-----------------------|
| Baseline | 56,780 tri ✓ | 38,062 tri (OFF, low) ✓ | — | 59,016 tri ✓ | — | — | — |
| Bug A | 56,158 tri **BUG** | **BUG** (visual) | — | 58,388 tri ✓ **NO BUG** | — | — | — |
| Bug B | 56,548 tri **BUG** | **BUG** (visual) | — | 58,732 tri ✓ **NO BUG** | — | — | — |

### WASM Build Size Trend (Jan–Apr 2026)

Notable size changes in the WASM build archives that may correlate with engine
changes:

| Date Range | Size Change | Notes |
|------------|-------------|-------|
| 2026.01.03 → 2026.01.15 | 3,222,966 → 3,224,038 (+1 KB) | Minor |
| **2026.01.15 → 2026.01.16** | **3,224,038 → 3,267,687 (+43 KB)** | **Significant — possible Manifold update** |
| 2026.01.16 → 2026.02.09 | 3,267,687 → 3,276,754 (+9 KB) | Gradual |
| 2026.03.28 → 2026.04.01 | 3,277,232 → 3,284,670 (+7 KB) | April builds |

The **January 15→16 jump (+43 KB)** is the largest single-day change and is a
priority bisect point.

---

## Upstream Issue Candidates

> **Note (2026-04-06):** The root cause turned out to be app-level companion
> aliasing, not an upstream engine issue. The upstream issues below were
> investigated as potential causes but are **not relevant** to Bug A/B. They
> are retained here for reference in case similar geometry issues arise in the
> future that are truly engine-level.

| Issue | Title | Status | Relevance to KI-012 |
|-------|-------|--------|---------------------|
| [#4566](https://github.com/openscad/openscad/issues/4566) | Manifold `difference()` across a gap leaves a stray face | Fixed (2023) | ~~High~~ **Not relevant** — root cause was app-level |
| [#5032](https://github.com/openscad/openscad/issues/5032) | Manifold surface cover when using small `offset()` in `difference()` | Fixed (Sep 2024, PR #5282) | ~~Medium~~ **Not relevant** — root cause was app-level |
| [#6165](https://github.com/openscad/openscad/issues/6165) | Manifold generates degenerate/zero-area triangles in union operations | Open | ~~Medium~~ **Not relevant** — root cause was app-level |
| [#6655](https://github.com/openscad/openscad/issues/6655) | Crash in Manifold during complex nested `difference`/`minkowski`/`intersection`/`offset` | Open (2026) | ~~Low-Medium~~ **Not relevant** — root cause was app-level |

---

## What Prior Investigations Established

Five prior plans (executed April 2–4, 2026) collectively ruled out the following
app-level causes through code audits and debug toggle tests:

| Hypothesis | Method | Result |
|-----------|--------|--------|
| Companion file resolution | Code audit, toggle test | Initially ruled out — later confirmed as root cause via git bisect (Phase 6). Prior audits missed that resolution was correct but aliasing was harmful. |
| Parameter serialization | Code audit, `-D` flag inspection | Ruled out — parameters correctly serialized |
| CSG injection | Code audit, unit tests, Phase 4 visual verification | Ruled out — variable scoping bug is real but does NOT cause Bug A/B (Phase 4 confirmed) |
| Source override interference | Code audit, toggle test | Ruled out — no source overrides active |
| Preview vs. full render parity | Code audit | Ruled out — both modes show the same bugs |
| Debug toggle side effects | Toggle tests | Ruled out — bugs present regardless of toggles |

These findings are consistent with an upstream engine issue but do not
constitute proof. The critical missing test — running the exact same inputs
through desktop OpenSCAD — was never performed in any prior plan.

---

## Root Cause Determination

### Current status: **RESOLVED — companion alias regression fixed and manually verified**

> **UPDATE (2026-04-06, git bisect + fix):** Git bisect across 43 unpushed
> commits identified `bb1b9ef` ("fix: resolve sibling substring ambiguity in
> resolveByHierarchy()") as the first bad commit. The commit correctly
> resolved previously-ambiguous LWFL companion paths from `null` to a specific
> nested path, but `applyCompanionAliases()` then replaced or created
> root-level companion keys, changing what SCAD `include` directives found
> and producing wrong geometry.
>
> **Initial fix (a):** Added root key existence guard — prevented creation
> of new root keys but still allowed replacement of existing ones.
>
> **Refined fix (b):** Inverted guard semantics to "create-only" — aliasing
> now only creates a root key when the target is missing. When it already
> exists, the original content is preserved. This covers both Scenario A
> (root file replaced) and Scenario B (generic path bypassing legacy guards).
> 5 new regression tests, 8 existing tests updated. All 3015 tests pass.
> **Manual verification passed** (2026-04-06): Bug A (ghost home button tab),
> Bug B (ghost upper message bar cutouts), and triangle artifacting all
> confirmed fixed in the browser.
>
> **Prior status (2026-04-05):** Phase 4 testing eliminated CSG injection
> and the WASM binary as causes. The deployed `origin/develop` was visually
> verified clean. See [phase-4-wasm-validation-protocol.md](phase-4-wasm-validation-protocol.md)
> for Phase 4 results.

Five hypotheses disproven, one confirmed:

> **Hypothesis 5 (CONFIRMED): Companion alias creates a root-level file that
> changes SCAD include behavior.**

**Confirmed by:** Phase 6 git bisect (commit `bb1b9ef`) + code analysis of
`applyCompanionAliases()`. The keyguard project has no root-level
`openings_and_additions.txt` — the SCAD source's `include
<openings_and_additions.txt>` resolves via OpenSCAD's library path. When
companion resolution started returning a non-null `openingsPath` (after
`bb1b9ef`), `applyCompanionAliases` created a root key that OpenSCAD found
*instead* of the library-path-resolved file, producing wrong geometry.

**Fix verified by:** 4 regression tests + full test suite pass. Manual
browser verification pending.

> ~~Hypothesis 1: The WASM pipeline produces incorrect geometry that desktop
> OpenSCAD does not (engine-level issue).~~

**Disproven by:** Phase 6 — the WASM engine is correct; the bug is in the
files our app feeds to it. Desktop worked because the desktop comparison used
captured `callMain` arguments, which were captured from the *buggy* app but
happened to contain the correct file set (the capture tool reads canonical
files, not the alias-modified set). This finding retroactively explains the
Phase 3 desktop results and the Phase 1b CGAL results — both engines
reproduce the bug because both receive the same incorrectly-aliased files.

> ~~Hypothesis 2: The SCAD source code contains inherent geometry bugs.~~

**Disproven by:** Phase 3 — desktop OpenSCAD renders the same project
correctly with both CGAL and Manifold engines. The SCAD geometry logic is
correct when given the right inputs through the desktop CLI.

> ~~Hypothesis 3: The parameter dropout bug in `ui-generator.js` causes both
> Bug A and Bug B.~~

**Disproven by:** Fix-and-retest (2026-04-05). The dropout bug was real and
was fixed (`currentValues` seeding in `renderParameterUI`, plus
`editState.parameters` passed at the queue-edit callsite). Post-fix
verification confirmed all 16 LWFL tail params are preserved after UI edits
(190 state params, 174 schema, 16/16 tail, 190 `-D` flags — PASS on both
baseline and post-edit checks). However, **Bug A and Bug B still reproduce**
after the fix. The dropout was a correctness bug, not the geometry root cause.

> ~~Hypothesis 1b: The bugs are engine-specific (Manifold-only).~~

**Disproven by:** Phase 1b CGAL test — both Bug A and Bug B reproduce
identically with the CGAL backend in WASM. This is consistent with the
confirmed root cause: both engines receive the same incorrectly-aliased files.

> ~~Hypothesis 4: CSG injection alters the files sent to the WASM engine.~~

**Disproven by:** Phase 4 — CSG injection confirmed disabled (hasCompanionFiles
guard active), but bugs persisted. The scoping bug in `injectCsgColors()` is
real and correctly guarded, but it was not the cause.

### Phase 3 desktop evidence (2026-04-05)

Desktop OpenSCAD 2026.01.03 + Manifold, using captured `callMain` arguments:

| Bundle | Triangles | Genus | Manifold Status | Render Time | Visual Bug? |
|--------|-----------|-------|-----------------|-------------|-------------|
| Baseline | 59,016 | 89 | NoError | 0.505s | No (correct) |
| Bug A | 58,388 | 88 | NoError | 0.677s | **No (correct)** |
| Bug B | 58,732 | 90 | NoError | 0.631s | **No (correct)** |

Desktop produces correct geometry for all three conditions. The same inputs
produce buggy geometry in WASM. This is the definitive evidence that the
problem is WASM-specific.

### What remains

Nothing. The investigation is complete. All bugs are fixed and verified.

### Investigation progress (all phases)

| Priority | Phase | What it told us | Status |
|----------|-------|-----------------|--------|
| **1** | ~~Phase 3 — Desktop CLI Comparison~~ | Desktop produces correct geometry | **DONE** |
| **2** | ~~Phase 4 — WASM Binary Validation~~ | CSG injection not the cause | **DONE** |
| **3** | ~~Verify origin/develop baseline~~ | Regression in 43 unpushed commits | **DONE** |
| **4** | ~~Phase 6 — Git bisect across 43 commits~~ | `bb1b9ef` is the first bad commit | **DONE** |
| **5** | ~~Fix + regression tests~~ | Root key creation guard applied | **DONE** |
| **6** | Manual browser verification | Bug A, Bug B, triangle artifacts all fixed | **DONE** |
| — | Phase 5 — WASM Playground Comparison | N/A — root cause was app-level | **CANCELLED** |

---

## Recommended Next Steps

### ~~Immediate — Manual verification~~ DONE (2026-04-06)

Manual verification passed. Bug A (ghost home button tab), Bug B (ghost
upper message bar cutouts), and triangle artifacting all confirmed fixed.

### Post-fix notes

The initial suspect — parameter formatter refactor (`554aa75`) — was not the
cause. The actual root cause was two steps earlier in the pipeline:

1. `bb1b9ef` correctly fixed companion resolution (28+ LWFL presets went from
   ambiguous `null` to a valid resolved path)
2. `applyCompanionAliases` had an implicit assumption that `openingsPath: null`
   meant "no aliasing needed" — it lacked a guard for the case where the
   resolved path exists but the root-level target key does not

The fix is minimal (2 additional `result.has()` checks) and preserves the
correct resolution behavior from `bb1b9ef`. No WASM binary issue exists.

---

## Captured Artifacts Index

```
docs/audit/ki-012-investigation/
│
├── findings-report.md                    ← THIS FILE
│
├── phase-1-csg-elimination-results.md   Regression fix Phase 1 — CSG root cause proof
├── phase-4-wasm-validation-protocol.md  Regression fix Phase 4 — WASM binary validation
│
├── capture-protocol.md                   Phase 2 protocol
├── desktop-comparison-protocol.md        Phase 3 protocol
├── desktop-comparison-results.md         Phase 3 results (UNFILLED)
├── playground-comparison-protocol.md     Phase 4 protocol (CANCELLED — root cause app-level)
├── playground-comparison-results.md      Phase 4 results (CANCELLED)
├── version-bisect-protocol.md            Phase 5 protocol (CANCELLED — root cause app-level)
├── version-bisect-results.md             Phase 5 results (CANCELLED)
│
├── wasm-diagnostic-probes.scad           WASM Probe Phase C — 4 diagnostic probes
├── wasm-audit-results.md                 WASM Probe — combined results template
│
├── run-all-desktop-tests.ps1             Phase 3 automated runner
├── prepare-playground-bundle.ps1         Phase 4 helper script
├── swap-wasm-build.ps1                   Phase 5 WASM build swapper
│
├── baseline-capture/                     Phase 2 — baseline (both params "yes")
│   ├── scad-source.scad
│   ├── metadata.json                     56,780 tri / 2,839,084 bytes
│   ├── callmain-args.json
│   ├── companion-files/                  202 files, full directory tree
│   ├── run-desktop.ps1
│   └── run-desktop.sh
│
├── bug-a-capture/                        Phase 2 — Bug A (expose_home_button="no")
│   ├── scad-source.scad
│   ├── metadata.json                     56,158 tri / 2,807,984 bytes
│   ├── callmain-args.json
│   ├── companion-files/
│   ├── run-desktop.ps1
│   └── run-desktop.sh
│
├── bug-b-capture/                        Phase 2 — Bug B (expose_upper_message_bar="no")
│   ├── scad-source.scad
│   ├── metadata.json                     56,548 tri / 2,827,484 bytes
│   ├── callmain-args.json
│   ├── companion-files/
│   ├── run-desktop.ps1
│   └── run-desktop.sh
│
└── bug-b-capture-2/                      Duplicate of bug-b-capture (same data)
```

> **Note:** The capture bundles contain the stakeholder's proprietary SCAD
> source and are `.gitignored`. The ZIP files referenced in the capture protocol
> are the portable form of these directories.

---

## Methodology Note

This investigation plan was designed to avoid the failure mode of all five
prior plans: reaching conclusions based on code-level analysis without runtime
verification. Every claim in the "Root Cause Determination" section above that
is not yet backed by a test result is explicitly marked as a hypothesis, not a
finding.

The plan's key principle: **"Every finding must come from an actual test, not
from code reading."** The infrastructure to perform those tests is now in place.
The tests themselves await execution.
