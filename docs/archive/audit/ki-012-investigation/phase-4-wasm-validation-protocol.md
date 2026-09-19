# Phase 4: Independent WASM Binary Validation

> **Plan:** `regression_root_cause_fix_3cb860ad`
> **Date:** 2026-04-05
> **Status:** Tooling complete (enhanced with bug heuristics, markdown output, cross-run comparison) — awaiting manual execution
> **Prerequisite:** Phase 3 fix applied (hasCompanionFiles guard re-added)
> **Automated runner:** `await __forgeDebug.runPhase4Validation()`

---

## Context

Phase 1 and Phase 3 confirmed that **CSG color injection** was the root cause
of Bug A (home-button tab persists) and Bug B (ghost cutouts). The fix re-added
the `hasCompanionFiles` guard that prevents `injectCsgColors()` from running on
multi-file projects like the LWFL keyguard.

**However**, the earlier ki-012 investigation concluded "WASM issue confirmed"
based on tests that ran *with CSG injection enabled*. That conclusion may have
been a false positive — the bugs the investigation attributed to the WASM engine
may have actually been caused by the CSG injection rewriting the SCAD source.

Phase 4 resolves this ambiguity by testing:

1. **Is the CSG injection fix sufficient?** With the guard in place, are Bug A
   and Bug B gone on the current WASM binary (2026.04.03)?
2. **Does the WASM upgrade have independent geometry issues?** Comparing
   triangle counts between old (2025.03.25) and new (2026.04.03) binaries
   with CSG injection disabled reveals any upgrade-specific differences.
3. **Do triangle counts approach desktop reference values?** Desktop OpenSCAD
   2026.01.03 produces 59,016 triangles for baseline. If WASM triangle counts
   are now closer to this, it confirms CSG injection was distorting the geometry.

---

## Prerequisites

| Item | Details |
|------|---------|
| Dev server | `pixi run dev` (or `npm run dev`) |
| Swap script | `swap-wasm-build.ps1` in this directory |
| Keyguard project | Full stakeholder project folder |
| Browser | Chrome or Edge with DevTools accessible |
| Phase 3 fix | `hasCompanionFiles` guard in `auto-preview-controller.js` |

### Verify Phase 3 fix is active

Before testing, confirm the guard is in place by loading the project and
checking the console after a render:

```js
// Should NOT see "[AutoPreview] Injecting CSG colors" in console
// Should see normal STL render without OFF format
```

Or use the automated check:

```js
await __forgeDebug.validateWasmBinary()
```

This helper confirms CSG injection is bypassed for multi-file projects and
captures triangle counts for the current parameter configuration.

---

## Test Matrix

Six renders total — three conditions × two WASM binaries:

| # | WASM Build | expose_home_button | expose_upper_message_bar | Tests |
|---|------------|--------------------|-----------------------------|-------|
| 1 | 2026.04.03 (current) | "yes" | "yes" | Baseline triangle count |
| 2 | 2026.04.03 (current) | "no"  | "yes" | Bug A should be FIXED |
| 3 | 2026.04.03 (current) | "yes" | "no"  | Bug B should be FIXED |
| 4 | 2025.03.25 (old) | "yes" | "yes" | Old-binary baseline |
| 5 | 2025.03.25 (old) | "no"  | "yes" | Old-binary Bug A check |
| 6 | 2025.03.25 (old) | "yes" | "no"  | Old-binary Bug B check |

### Desktop reference values (from Phase 3 of ki-012 investigation)

| Condition | Desktop triangles | Desktop genus | Desktop status |
|-----------|-------------------|---------------|----------------|
| Baseline  | 59,016 | 89 | NoError |
| Bug A condition | 58,388 | 88 | NoError (correct geometry) |
| Bug B condition | 58,732 | 90 | NoError (correct geometry) |

---

## Quick Path: Automated Runner

The automated runner executes all three conditions (baseline, Bug A, Bug B)
in sequence, programmatically overriding parameters between renders. It:

- Compares triangle counts against desktop reference values
- Runs **bug detection heuristics** (compares WASM baseline→condition triangle
  deltas against desktop deltas to assess whether Bug A/B are fixed)
- Generates **copy-pasteable markdown tables** matching this protocol's format
- **Persists results to localStorage** keyed by WASM build, enabling automatic
  Part A vs Part B comparison

### Steps

1. Start dev server: `pixi run dev` (or `npm run dev`)
2. Load the LWFL keyguard project and select the "iPad 7,8,9 - Fintie - LWFL" preset
3. Wait for the initial auto-preview to complete
4. Open DevTools console (F12) and run:

```js
const results = await __forgeDebug.runPhase4Validation()
```

5. The runner tests baseline, Bug A, and Bug B conditions automatically
6. Review the console output:
   - **Summary table** — per-condition triangle counts and desktop deltas
   - **Bug assessment** — heuristic LIKELY_FIXED / LIKELY_PRESENT / INCONCLUSIVE
   - **Decision** — PASS / INVESTIGATE / INCOMPLETE
   - **Markdown table** — copy-paste directly into the Results section below
7. **Visually verify** Bug A and Bug B in the 3D preview (heuristics are not
   definitive — check the actual geometry)

**For Part B (old WASM binary):** swap the build, restart dev server, reload
the project, and run the same command again. Results from both runs are
stored in localStorage. After Part B, generate the comparison table:

```js
__forgeDebug.getPhase4History()
```

This prints the combined comparison table ready for the protocol.

### Helper commands

| Command | Purpose |
|---------|---------|
| `await __forgeDebug.runPhase4Validation()` | Run full 3-condition test suite |
| `await __forgeDebug.validateWasmBinary()` | Run single-condition validation |
| `await __forgeDebug.compareGeometry()` | Compare current render against desktop ref |
| `__forgeDebug.getPhase4History()` | List all runs + generate comparison table |
| `__forgeDebug.clearPhase4History()` | Clear stored results before re-running |

---

## Manual Path: Step-by-Step Execution

### Part A: Current WASM Build (2026.04.03)

#### Step 1 — Start dev server

```powershell
pixi run dev
```

#### Step 2 — Load project and verify CSG guard

1. Open the app in browser, open DevTools console (F12)
2. Upload the full stakeholder keyguard project folder
3. Select the **"iPad 7,8,9 - Fintie - LWFL"** preset
4. Wait for auto-preview to complete
5. Check the console — confirm NO "Injecting CSG colors" message appears

#### Step 3 — Run automated validation

```js
const results = await __forgeDebug.validateWasmBinary()
```

This runs the baseline render and reports:
- Whether CSG injection is bypassed
- Triangle count and STL size
- Comparison against desktop reference (if available)
- WASM build identifier

Record the output in the results table below.

#### Step 4 — Test Bug A condition

1. Set `expose_home_button = "no"`
2. Wait for render to complete
3. **Visual check:** Is the home-button tab gone? (It should be.)
4. Run `await __forgeDebug.compareGeometry()` to capture triangle count
5. Record results

#### Step 5 — Test Bug B condition

1. Reset `expose_home_button = "yes"`
2. Set `expose_upper_message_bar = "no"`
3. Wait for render to complete
4. **Visual check:** Are ghost cutouts gone? (They should be.)
5. Run `await __forgeDebug.compareGeometry()` to capture triangle count
6. Record results

---

### Part B: Old WASM Build (2025.03.25)

#### Step 6 — Swap to old build

```powershell
cd docs\audit\ki-012-investigation
.\swap-wasm-build.ps1 -BuildDate "2025.03.25"
```

#### Step 7 — Restart dev server

Stop the current dev server (Ctrl+C) and restart:

```powershell
pixi run dev
```

Hard-refresh the browser (Ctrl+Shift+R). Verify the console shows:

```
[Worker] WASM build: OpenSCAD-2025.03.25
```

#### Step 8 — Repeat tests 2–5 with old binary

Repeat Steps 2–5 using the old WASM binary. Record results in the Part B
columns of the results table.

#### Step 9 — Restore original build

```powershell
.\swap-wasm-build.ps1 -Restore
```

Restart dev server and verify the 2026.04.03 build is back.

---

## Results

### Part A: Current WASM Build (2026.04.03)

| Metric | Baseline | Bug A cond. | Bug B cond. |
|--------|----------|-------------|-------------|
| expose_home_button | "yes" | "no" | "yes" |
| expose_upper_message_bar | "yes" | "yes" | "no" |
| Triangle count | 56,780 | 56,158 | 56,548 |
| STL size (bytes) | 2,839,084 | 2,807,984 | 2,827,484 |
| Render time (ms) | 3,271 | 3,421 | 3,331 |
| Bug A visible? | N/A | **YES** | N/A |
| Bug B visible? | N/A | N/A | **YES** |
| CSG injection active? | NO | NO | NO |
| Console warnings | none | none | none |

### Part B: Old WASM Build (2025.03.25)

| Metric | Baseline | Bug A cond. | Bug B cond. |
|--------|----------|-------------|-------------|
| expose_home_button | "yes" | "no" | "yes" |
| expose_upper_message_bar | "yes" | "yes" | "no" |
| Triangle count | 48,234 | 47,468 | 48,360 |
| STL size (bytes) | 2,411,784 | 2,373,484 | 2,418,084 |
| Render time (ms) | 2,994 | 3,356 | 3,546 |
| Bug A visible? | N/A | **YES** | N/A |
| Bug B visible? | N/A | N/A | **YES** |
| CSG injection active? | NO | NO | NO |
| Console warnings | none | none | none |

### Comparison: New vs Old WASM Binary

| Condition | New (2026.04.03) | Old (2025.03.25) | Desktop ref | New vs Desktop | Old vs Desktop |
|-----------|------------------|-------------------|-------------|----------------|----------------|
| Baseline  | 56,780 tri | 48,234 tri | 59,016 tri | -3.8% | -18.3% |
| Bug A cond. | 56,158 tri | 47,468 tri | 58,388 tri | -3.8% | -18.7% |
| Bug B cond. | 56,548 tri | 48,360 tri | 58,732 tri | -3.7% | -17.7% |

---

## Decision Tree

```
Are Bug A and Bug B fixed with the CSG guard?
│
├── YES (both bugs gone on both binaries)
│   → (not taken)
│
├── Bug A or Bug B persists on 2026.04.03 only
│   → (not taken)
│
├── *** Bug A or Bug B persists on BOTH binaries *** ← THIS PATH
│   │
│   └── CSG injection was NOT the sole root cause.
│       There is an additional WASM-specific or app-level issue.
│       → Revisit ki-012 investigation; the "WASM issue" may be real.
│
└── Bugs persist on old binary but NOT on new
    → (not taken)
```

**Decision path taken:** Bug A and Bug B persist on BOTH WASM binaries with
CSG injection confirmed disabled. The bugs are WASM-platform-specific and
independent of the CSG color injection issue.

---

## Executed: 2026-04-05

**Tested by:** Human operator with visual verification
**Logs:** `localhost-1775428720593.log` (2026.04.03), `localhost-1775428984632.log` (2025.03.25)

## Conclusions

1. **CSG injection was NOT the root cause of Bug A or Bug B.** The Phase 1
   "confirmation" was based on unit tests proving variable scoping breakage
   in `injectCsgColors()`, not on visual browser verification. The scoping
   bug is real (and correctly guarded), but it was not causing the visual bugs.

2. **Both WASM builds show the bugs.** The WASM upgrade from 2025.03.25 to
   2026.04.03 did not introduce the regression. The bugs are pre-existing.

3. **The heuristic "LIKELY_FIXED" was misleading.** Triangle count deltas
   matched desktop closely for the 2026.04.03 build, but the bugs are
   about geometry correctness, not triangle counts. The WASM engine
   produces wrong geometry with similar facet counts.

4. **The old build is substantially worse.** 18.3% fewer triangles than
   desktop (vs 3.8% for the new build) and Bug B delta goes in the wrong
   direction (+126 tri vs desktop -284). The WASM upgrade improved
   fidelity even if it didn't fix the bugs.

5. **STL output was never affected by CSG injection.** Phase 4 STL byte
   counts are identical to Phase 2 captures (made before CSG fix). The
   `renderFull()` STL path always used raw source.

## Origin/Develop Baseline Verification (2026-04-05)

**Tested:** Live demo at `https://1a383292.openscad-assistive-forge.pages.dev/`
**Result:** Bug A and Bug B are **NOT present** in the deployed version.

This confirms:
- The regression IS real — introduced in the 43 unpushed commits
- The WASM binary is NOT the cause — deployed uses same old build (2025.03.25)
  and is clean, while local + old build shows bugs
- The app code changes are sending different inputs to the WASM engine
- **Top suspect:** Parameter formatter refactor (commit `554aa75`) which
  unified `buildDefineArgs`/`formatScadValue` — if any parameter encoding
  changed, the WASM engine would receive different `-D` values
- **Next step:** Git bisect across the 43 commits (~6 iterations)

## Notes

- Phase 4 automated runner produced correct data but the triangle-count
  heuristic is insufficient for visual bug detection. Future validation
  should prioritize visual verification over automated heuristics.
- The old WASM build (2025.03.25) Bug B delta is anomalous: +126 tri
  (more triangles when message bar disabled) vs desktop -284 (fewer).
  This confirms the old build has geometry issues beyond just the bugs.
