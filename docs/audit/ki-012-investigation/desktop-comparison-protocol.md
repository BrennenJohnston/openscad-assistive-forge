# KI-012 Desktop CLI Comparison Protocol

> **Purpose:** Run the captured WASM input bundles through desktop OpenSCAD CLI
> to determine whether the same inputs produce correct or buggy geometry on
> desktop. This is the critical test that prior investigations never performed.
>
> **Prerequisite:** Phase 2 capture bundles (`baseline-capture/`, `bug-a-capture/`,
> `bug-b-capture/`) are extracted in `docs/audit/ki-012-investigation/`.
>
> **Date:** 2026-04-05
> **Investigation:** KI-012 — LWFL Keyguard Geometry Discrepancies

---

## Prerequisites

| Item | Details |
|------|---------|
| OpenSCAD Nightly (April 2026) | Latest nightly from [files.openscad.org/snapshots/](https://files.openscad.org/snapshots/) — must support `--backend=Manifold` |
| OpenSCAD Nightly (January 2026) | Matching the desktop reference that originally showed correct geometry |
| STL viewer | OpenSCAD GUI, 3D Builder (Windows), PrusaSlicer, or any mesh viewer for visual inspection |
| Capture bundles | `baseline-capture/`, `bug-a-capture/`, `bug-b-capture/` directories |

### OpenSCAD installation

Download both nightly versions from the snapshots archive. On Windows, the
portable ZIP is recommended so both versions can coexist:

```
C:\OpenSCAD\
  nightly-2026-01\openscad.exe
  nightly-2026-04\openscad.exe
```

Verify each version:

```powershell
C:\OpenSCAD\nightly-2026-04\openscad.exe --version
C:\OpenSCAD\nightly-2026-01\openscad.exe --version
```

Record the full version strings in the results file.

---

## Automated Runner Script

A master runner script automates Steps 0-6 (minus visual inspection):

```powershell
# April 2026 nightly + Manifold backend
.\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-04\openscad.exe" -Label "apr2026"

# January 2026 nightly + Manifold backend
.\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-01\openscad.exe" -Label "jan2026"

# April 2026 nightly + CGAL backend (optional, if Manifold shows bugs)
.\run-all-desktop-tests.ps1 -OpenScadExe "C:\OpenSCAD\nightly-2026-04\openscad.exe" -Label "apr2026-cgal" -Backend ""
```

The script creates working directories, copies companion files recursively,
runs each bundle, collects exit codes / triangle counts / timing, and prints
a summary table. Visual inspection must still be done manually.

---

## Known Issues with Generated Scripts (resolved)

### 1. Non-recursive companion file copy (FIXED)

The `run-desktop.ps1` and `run-desktop.sh` scripts originally used
non-recursive copy commands. This has been fixed in all capture bundles
and in the capture tool source (`src/main.js`). The scripts now use
`-Recurse` (PowerShell) / `-r` (bash).

### 2. Hidden parameter discrepancy

The **baseline** capture includes additional "hidden" parameters not present in
the Bug A and Bug B captures:

| Parameter | Baseline | Bug A | Bug B |
|-----------|----------|-------|-------|
| `add_rounded_corners_for_strength` | `"yes"` | absent | absent |
| `approx_dovetail_width` | `4` | absent | absent |
| `chamfer_size` | `0.75` | absent | absent |
| `cut_out_screen` | `"no"` | absent | absent |
| `horizontal_rail_width` | `2` | absent | absent |
| `preferred_rail_height` | `4` | absent | absent |
| `rail_slope` | `90` | absent | absent |
| `split_line` | `0` | absent | absent |
| `swap_camera_and_home_button` | `"no"` | absent | absent |
| `trim_to_screen` | `"no"` | absent | absent |
| `vertical_rail_width` | `2` | absent | absent |
| `accent_*_data`, `novachat*_data` | present | absent | absent |

These are likely SCAD parameters with defaults that only get serialized when
the capture tool detects them. Since OpenSCAD uses the SCAD file's built-in
defaults for any parameter not overridden via `-D`, this difference should
**not** affect geometry, but record it in the results for completeness.

---

## Execution Protocol

### Step 0 — Prepare working directories

For each bundle, create a clean working directory that preserves the full
companion file tree alongside the SCAD source:

```powershell
$bundles = @("baseline-capture", "bug-a-capture", "bug-b-capture")
$investigationDir = "docs\audit\ki-012-investigation"

foreach ($bundle in $bundles) {
    $workDir = "$investigationDir\$bundle\work"
    if (Test-Path $workDir) { Remove-Item $workDir -Recurse -Force }
    New-Item $workDir -ItemType Directory -Force | Out-Null

    # Copy SCAD source
    Copy-Item "$investigationDir\$bundle\scad-source.scad" $workDir

    # Copy companion files PRESERVING directory structure
    if (Test-Path "$investigationDir\$bundle\companion-files") {
        Copy-Item "$investigationDir\$bundle\companion-files\*" $workDir -Recurse -Force
    }
}
```

**Verify** that the key file for the LWFL preset exists at:

```
<bundle>\work\Cases and App Specifics\iPad 7,8,9\Fintie-equivalent Case\LWFL\openings_and_additions.txt
```

### Step 1 — Run baseline with April 2026 nightly

```powershell
$openscad = "C:\OpenSCAD\nightly-2026-04\openscad.exe"
$workDir = "docs\audit\ki-012-investigation\baseline-capture\work"

Push-Location $workDir

# Run with the same args from callmain-args.json (the generated script,
# but with the corrected working directory setup from Step 0)
& $openscad --backend=Manifold --export-format=binstl `
    -D 'type_of_keyguard="3D-Printed"' `
    -D 'keyguard_thickness=4' `
    -D 'screen_area_thickness=4' `
    -D 'generate="keyguard"' `
    -D 'type_of_tablet="iPad 9th generation"' `
    -D 'orientation="landscape"' `
    -D 'expose_home_button="yes"' `
    -D 'expose_upper_message_bar="yes"' `
    -D '$fa=12' -D '$fs=2' `
    -o "baseline-apr2026.stl" `
    scad-source.scad

Pop-Location
```

> **Note:** For brevity, only the key parameters are shown above. Use the full
> `-D` argument list from the generated `run-desktop.ps1` script in each
> bundle. The key difference between bundles is `expose_home_button` and
> `expose_upper_message_bar`.

### Step 2 — Run Bug A with April 2026 nightly

```powershell
$workDir = "docs\audit\ki-012-investigation\bug-a-capture\work"
Push-Location $workDir

# Same as baseline but with expose_home_button="no"
# Use the full -D args from bug-a-capture/run-desktop.ps1
& $openscad --backend=Manifold --export-format=binstl `
    <... all -D args from bug-a-capture/run-desktop.ps1 ...> `
    -o "bug-a-apr2026.stl" `
    scad-source.scad

Pop-Location
```

### Step 3 — Run Bug B with April 2026 nightly

```powershell
$workDir = "docs\audit\ki-012-investigation\bug-b-capture\work"
Push-Location $workDir

# Same as baseline but with expose_upper_message_bar="no"
# Use the full -D args from bug-b-capture/run-desktop.ps1
& $openscad --backend=Manifold --export-format=binstl `
    <... all -D args from bug-b-capture/run-desktop.ps1 ...> `
    -o "bug-b-apr2026.stl" `
    scad-source.scad

Pop-Location
```

### Step 4 — Repeat Steps 1-3 with January 2026 nightly

Replace `$openscad` with the January 2026 build path. Name the output files
`baseline-jan2026.stl`, `bug-a-jan2026.stl`, `bug-b-jan2026.stl`.

### Step 5 — Visual inspection

Open each STL in a mesh viewer. For each output, check:

| Check | What to look for |
|-------|-----------------|
| **Bug A symptom** | Right edge of keyguard: is it a straight line (correct) or does a tab jut out where the home button cutout would be (buggy)? |
| **Bug B symptom** | Upper corners near grid positions #1 and #12: is the surface solid (correct) or are there partial square cutouts / notched angles (buggy)? |
| **General integrity** | Are there any manifold errors, degenerate triangles, or visual artifacts? |

### Step 6 — Record triangle counts

For binary STL files, the triangle count is at bytes 80-83 (little-endian uint32):

```powershell
function Get-StlTriangleCount($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    [BitConverter]::ToUInt32($bytes, 80)
}

Get-StlTriangleCount "baseline-apr2026.stl"
Get-StlTriangleCount "bug-a-apr2026.stl"
Get-StlTriangleCount "bug-b-apr2026.stl"
```

### Step 7 — Optional: test without Manifold backend

If bugs appear with `--backend=Manifold`, re-run with the CGAL backend
(remove the `--backend=Manifold` flag) to determine if the issue is
Manifold-specific:

```powershell
& $openscad --export-format=binstl `
    <... all -D args ...> `
    -o "bug-a-apr2026-cgal.stl" `
    scad-source.scad
```

---

## Decision Matrix

| Desktop April 2026 | Desktop January 2026 | Conclusion |
|--------------------|--------------------|------------|
| Correct for both bugs | Correct for both bugs | **WASM engine issue confirmed** — same inputs produce correct geometry on desktop but buggy geometry in WASM |
| Shows same bugs | Shows same bugs | **NOT a WASM issue** — the Manifold backend has a bug that affects both desktop and WASM equally |
| Correct | Shows same bugs | Unlikely, but would indicate a desktop regression that was later fixed |
| Shows same bugs | Correct | **Manifold regression between Jan and Apr 2026** — bisect further (Phase 5) |

### If Manifold backend shows bugs but CGAL doesn't:

This would confirm the bug is in the Manifold boolean engine specifically,
not in OpenSCAD's parameter handling or geometry generation. File an upstream
issue against Manifold with the minimal reproduction.

---

## Troubleshooting

### OpenSCAD can't find companion files

Ensure the companion files are in the same directory as `scad-source.scad`
**with their full directory structure preserved**. The SCAD source references
companion files via paths like:

```
Cases and App Specifics/iPad 7,8,9/Fintie-equivalent Case/LWFL/openings_and_additions.txt
```

If the tree structure is flattened, `use` / `include` calls will fail.

### Render produces 0-byte STL or error

- Check that the OpenSCAD version supports `--backend=Manifold`
- Check the console stderr output for SCAD compile errors
- Try without `--export-format=binstl` to get ASCII STL (easier to debug)

### `$fa` and `$fs` parameters not recognized

On some shells, `$fa` and `$fs` may be interpreted as shell variables.
Ensure proper escaping:

```powershell
# PowerShell: use single quotes or backtick-escape
-D '$fa=12' -D '$fs=2'
```

---

## Output Files

Save all generated STLs alongside the capture bundles:

```
docs/audit/ki-012-investigation/
├── baseline-capture/
│   └── work/
│       ├── baseline-apr2026.stl
│       └── baseline-jan2026.stl
├── bug-a-capture/
│   └── work/
│       ├── bug-a-apr2026.stl
│       ├── bug-a-apr2026-cgal.stl  (optional)
│       └── bug-a-jan2026.stl
├── bug-b-capture/
│   └── work/
│       ├── bug-b-apr2026.stl
│       ├── bug-b-apr2026-cgal.stl  (optional)
│       └── bug-b-jan2026.stl
├── desktop-comparison-protocol.md  (this file)
├── desktop-comparison-results.md   (results template)
└── run-all-desktop-tests.ps1       (automated runner)
```

---

## Next Steps

After recording all results in `desktop-comparison-results.md`:

- **If WASM issue confirmed:** Proceed to Phase 4 (WASM Playground Comparison)
  for independent confirmation
- **If Manifold regression:** Proceed to Phase 5 (Version Bisect) to pinpoint
  the commit
- **If app issue:** Revisit callMain arguments and file mounting
