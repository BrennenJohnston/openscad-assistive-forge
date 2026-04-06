# KI-012 WASM Build Version Bisect Protocol

> **Purpose:** Determine whether the Bug A and Bug B geometry issues are
> specific to our April 2026 WASM build by testing with older builds. If older
> builds render correctly, this confirms a regression and narrows the window
> for pinpointing the responsible upstream commit.
>
> **Prerequisites:** Phase 2 capture bundles extracted, dev server functional,
> `swap-wasm-build.ps1` script available in this directory.
>
> **Date:** 2026-04-05
> **Investigation:** KI-012 — LWFL Keyguard Geometry Discrepancies

---

## Prerequisites

| Item | Details |
|------|---------|
| Dev server | `pixi run dev` (or `npm run dev`) |
| Swap script | `swap-wasm-build.ps1` in this directory |
| Keyguard project | Full stakeholder project folder (not the test bundle) |
| Browser | Chrome or Edge with DevTools accessible |
| Internet access | Required to download WASM snapshots (~3 MB each) |

---

## Available WASM Builds (Jan–Apr 2026)

The following WebAssembly-web builds are available on
[files.openscad.org/snapshots/](https://files.openscad.org/snapshots/).
Archive sizes indicate possible engine changes between dates.

### Recommended Bisect Set

| Build Date | Archive Name | Size (bytes) | Why |
|------------|-------------|-------------|-----|
| **2025.03.25** | `OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip` | 2,947,329 | Previous build before our upgrade (old naming) |
| **2026.01.03** | `OpenSCAD-2026.01.03-WebAssembly-web.zip` | 3,222,966 | Earliest Jan 2026 — matches the desktop reference date |
| **2026.01.16** | `OpenSCAD-2026.01.16-WebAssembly-web.zip` | 3,267,687 | Notable ~44KB size jump from 2026.01.15 — possible significant change |
| **2026.02.01** | `OpenSCAD-2026.02.01-WebAssembly-web.zip` | 3,269,926 | Start of February |
| **2026.03.01** | `OpenSCAD-2026.03.01-WebAssembly-web.zip` | 3,278,478 | Start of March |
| **2026.03.28** | `OpenSCAD-2026.03.28-WebAssembly-web.zip` | 3,277,232 | End of March (just before our build) |
| **2026.04.03** | `OpenSCAD-2026.04.03-WebAssembly-web.zip` | 3,284,651 | Our current build (control) |

### Full Inventory (if finer bisect needed)

<details>
<summary>All 2026 WebAssembly-web builds (click to expand)</summary>

**January 2026:**
- 2026.01.03 (3,222,966)
- 2026.01.12 (3,222,964)
- 2026.01.13 (3,222,969)
- 2026.01.14 (3,222,883)
- 2026.01.15 (3,224,038) — ⬆ slight size increase
- 2026.01.16 (3,267,687) — ⬆ **+43KB jump**
- 2026.01.17 (3,267,692)
- 2026.01.18 (3,267,689)
- 2026.01.19 (3,267,906)
- 2026.01.25 (3,270,785)
- 2026.01.27 (3,270,782)
- 2026.01.29 (3,269,941)

**February 2026:**
- 2026.02.01 (3,269,926)
- 2026.02.03 (3,269,935)
- 2026.02.04 (3,269,930)
- 2026.02.07 (3,270,051)
- 2026.02.09 (3,276,754) — ⬆ +7KB jump
- 2026.02.10 (3,276,746)
- 2026.02.11 (3,276,752)
- 2026.02.13 (3,276,762)
- 2026.02.15 (3,276,393)
- 2026.02.16 (3,276,390)
- 2026.02.18 (3,277,358)
- 2026.02.19 (3,277,239)
- 2026.02.25 (3,277,259)

**March 2026:**
- 2026.03.01 (3,278,478)
- 2026.03.07 (3,278,467)
- 2026.03.14 (3,277,157)
- 2026.03.16 (3,277,255)
- 2026.03.20 (3,277,221)
- 2026.03.22 (3,277,231)
- 2026.03.28 (3,277,232)

**April 2026:**
- 2026.04.01 (3,284,670) — ⬆ +7KB jump from March
- 2026.04.02 (3,284,292)
- 2026.04.03 (3,284,651) — **our current build**
- 2026.04.04 (3,284,651)

</details>

---

## Bisect Strategy

Use binary search to narrow the regression window efficiently:

```
Round 1:  Test Jan 2026 and Mar 2026
          ├── Both clean    → bugs introduced between Mar 28 and Apr 03
          ├── Both buggy    → test pre-upgrade build (2025.03.25)
          ├── Jan clean, Mar buggy → bisect Feb (Round 2)
          └── Jan buggy, Mar clean → unexpected; investigate

Round 2:  Test the month boundary where the transition occurs
          e.g., if Jan clean + Mar buggy → test Feb 01

Round 3:  Continue halving the range until you have a 1–2 week window
```

If all builds including 2025.03.25 show bugs, the issue is long-standing and
not a regression — it's a fundamental WASM Manifold limitation that also
affected the previous build (which was replaced precisely because of geometry
discrepancies).

---

## Execution Protocol

### Step 0 — Confirm current build reproduces bugs (control)

Before swapping, verify that the current build (2026.04.03) reproduces both
bugs. This ensures the test setup is valid.

1. Run `pixi run dev` (or `npm run dev`)
2. Load the full stakeholder project
3. Select "iPad 7,8,9 - Fintie - LWFL" preset
4. Set `expose_home_button = "no"` → confirm Bug A visible
5. Set `expose_home_button = "yes"`, `expose_upper_message_bar = "no"` → confirm Bug B visible
6. Record triangle counts and screenshot in the results file under "Control"

### Step 1 — Swap to a test build

```powershell
cd docs\audit\ki-012-investigation
.\swap-wasm-build.ps1 -BuildDate "2026.01.03"
```

The script:
- Downloads the archive (cached for re-use)
- Backs up the current build (first run only)
- Extracts `openscad.js` and `openscad.wasm`
- Updates `INTEGRITY.json` with new hashes/sizes

### Step 2 — Restart dev server

Stop the current dev server (Ctrl+C) and restart:

```powershell
pixi run dev
```

**Important:** Hard-refresh the browser (Ctrl+Shift+R) to clear the WASM
cache. The app loads the WASM module once; a soft refresh may use the cached
old module.

Verify the build loaded correctly by checking the browser console for:

```
[Worker] WASM build: OpenSCAD-2026.01.03
```

### Step 3 — Test Bug A

1. Load the stakeholder project and select the LWFL preset
2. Set `expose_home_button = "no"`
3. Wait for render to complete
4. Inspect the right edge: is Bug A (tab artifact) present?
5. Record in the results file: YES / NO / PARTIAL

### Step 4 — Test Bug B

1. Reset `expose_home_button = "yes"`
2. Set `expose_upper_message_bar = "no"`
3. Wait for render to complete
4. Inspect upper corners near #1 and #12: is Bug B (ghost cutouts) present?
5. Record in the results file: YES / NO / PARTIAL

### Step 5 — Record metadata

For each build tested, record:

| Field | How to check |
|-------|-------------|
| Build date | Console: `[Worker] WASM build: ...` |
| Archive name | Printed by `swap-wasm-build.ps1` at swap time |
| Bug A present | Visual inspection of right edge |
| Bug B present | Visual inspection of upper corners |
| Render time | Console: look for render duration in ms |
| Any errors | Console: WASM warnings, integrity warnings, etc. |

### Step 6 — Repeat for next build

Swap to the next build in the bisect sequence:

```powershell
.\swap-wasm-build.ps1 -BuildDate "2026.03.28"
```

Then restart the dev server and repeat Steps 2-5.

### Step 7 — Restore original build

After all testing is complete:

```powershell
.\swap-wasm-build.ps1 -Restore
```

This restores the backed-up 2026.04.03 build and INTEGRITY.json.

---

## Decision Matrix

| Jan 2026 | Mar 2026 | Pre-upgrade (2025.03.25) | Conclusion |
|----------|----------|--------------------------|------------|
| Clean | Clean | n/a | **Regression in Apr 2026 builds** — bisect Apr 01–03 |
| Clean | Buggy | n/a | **Regression between Jan and Mar** — bisect Feb |
| Buggy | Buggy | Clean | **Regression between Mar 2025 and Jan 2026** — 9-month gap, test Dec 2025 builds |
| Buggy | Buggy | Buggy | **Long-standing WASM Manifold limitation** — not a regression; matches INTEGRITY.json's `previousBuild.reason` |
| Clean | Clean (but bugs in Apr) | n/a | **Regression in Apr 2026 specifically** — test 2026.04.01 and 2026.04.02 |

### Cross-reference with Phase 3 & 4

| Phase 3 (Desktop) | Phase 4 (Playground) | Phase 5 (Bisect) | Overall Conclusion |
|--------------------|---------------------|-------------------|-------------------|
| Desktop correct | Playground buggy | All WASM builds buggy | WASM Manifold computes differently from native — long-standing platform difference |
| Desktop correct | Playground buggy | Only recent builds buggy | WASM Manifold regression — file upstream issue with specific commit range |
| Desktop correct | Playground correct | Our builds buggy | Our WASM build is different from the playground's — investigate build provenance |
| Desktop buggy | Playground buggy | All builds buggy | Manifold engine bug (all platforms) — file upstream issue against Manifold |

---

## Troubleshooting

### swap-wasm-build.ps1 fails to download

- Verify internet access: `Invoke-WebRequest https://files.openscad.org/snapshots/ -Method HEAD`
- Check that the build date matches an available archive (see the full inventory above)
- For old naming convention builds (pre-2026), the script auto-detects the full name
  by fetching the directory listing

### Dev server shows WASM integrity warning

The swap script updates `INTEGRITY.json` with correct hashes and sizes. If you
still see warnings:

- Ensure you stopped and restarted the dev server after the swap
- Hard-refresh (Ctrl+Shift+R) to bypass the browser cache
- Check that both `openscad.js` and `openscad.wasm` exist in `public/wasm/openscad-official/`

### WASM build doesn't load or crashes

- Older builds may lack features our app depends on (e.g., Manifold backend,
  `--export-format=binstl`). If the build doesn't support these:
  - Check the console for error messages
  - Note "build failed to load" in the results and move to the next build
  - This itself is useful data (the feature was added between this build and the next)

### App behaves differently with older WASM

- The `openscad.js` loader API may differ between builds. If the worker fails
  to initialize, check the console for API-related errors.
- Our app expects `callMain()` to exist. Very old builds may use a different
  entry point. Builds from 2025+ should all support `callMain()`.

### Render takes much longer or produces different triangle counts

- Expected: different WASM builds may have different performance characteristics
  and may produce slightly different triangle counts for the same model.
- Record the triangle count for each build — significant deviations (>5%) from
  the baseline may indicate a different CSG algorithm or mesh simplification.

---

## Cache Management

The swap script caches downloaded archives in `_wasm-cache/` within this
directory. This avoids re-downloading when testing the same build multiple
times. To clear the cache:

```powershell
Remove-Item docs\audit\ki-012-investigation\_wasm-cache -Recurse -Force
```

The backup of the original build is stored in `_wasm-backup/`. This is created
on the first swap and preserved across subsequent swaps.

Both `_wasm-cache/` and `_wasm-backup/` are local-only directories and should
not be committed.

---

## Output Files

```
docs/audit/ki-012-investigation/
├── swap-wasm-build.ps1              (automation script)
├── version-bisect-protocol.md       (this file)
├── version-bisect-results.md        (results template)
├── _wasm-cache/                     (downloaded archives, gitignored)
│   ├── OpenSCAD-2026.01.03-WebAssembly-web.zip
│   ├── OpenSCAD-2026.02.01-WebAssembly-web.zip
│   └── ...
└── _wasm-backup/                    (original build backup, gitignored)
    ├── openscad.js
    ├── openscad.wasm
    └── INTEGRITY.json
```

---

## Next Steps

After recording all results in `version-bisect-results.md`:

- **If regression identified:** Note the date range and proceed to Phase 6
  (Findings Report) with the regression window documented.
- **If long-standing:** Include this in the Phase 6 report as evidence that
  the issue predates the current build.
- **If only our build is affected:** Re-download and re-verify the 2026.04.03
  archive to rule out a corrupted download.
