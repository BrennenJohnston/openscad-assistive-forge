# KI-012 WASM Playground Comparison Protocol

> **Purpose:** Test the same SCAD model with Bug A and Bug B conditions in the
> official OpenSCAD WASM Playground (and alternative playgrounds) to determine
> whether the bugs reproduce independently of our app. If they do, the WASM
> engine is definitively the source of the issue.
>
> **Prerequisite:** Phase 2 capture bundles (`bug-a-capture/`, `bug-b-capture/`,
> `baseline-capture/`) are extracted in `docs/audit/ki-012-investigation/`.
>
> **Date:** 2026-04-05
> **Investigation:** KI-012 — LWFL Keyguard Geometry Discrepancies

---

## Prerequisites

| Item | Details |
|------|---------|
| Capture bundles | `baseline-capture/`, `bug-a-capture/`, `bug-b-capture/` directories extracted from Phase 2 |
| Internet access | Required for playground sites |
| Browser | Chrome or Edge (same browser used for our app testing, for consistency) |
| Helper script | `prepare-playground-bundle.ps1` (creates playground-ready directories) |

---

## Playground Options

### Primary: ochafik's OpenSCAD2 Playground

**URL:** [https://ochafik.com/openscad2](https://ochafik.com/openscad2)

**Why primary:** This playground has a file manager sidebar that supports
uploading multiple files with directory structure. This is critical because
the keyguard SCAD source depends on ~200 companion files organized in a
directory tree.

### Fallback: Official OpenSCAD Playground

**URL:** [https://openscad.org/playground/](https://openscad.org/playground/)

**Why fallback:** Simpler UI, may not support multi-file uploads. If companion
file upload is not supported, a self-contained SCAD approach (Strategy C below)
is needed.

### Recording the playground's WASM build version

Before testing, record the playground's OpenSCAD version. Look for:

- A version string in the UI (often in a status bar or "About" section)
- Run `version()` in the SCAD editor and check the console output
- Check the browser's Network tab for the WASM file URL (may include a version
  or date in the filename)

Our app's WASM build reports `version: "unknown"` but dates to early April 2026.
The playground may use a different build. **If the playground's build is
significantly older or newer, note this in the results** — it affects
interpretation.

---

## Preparation: Generate Playground-Ready Bundles

The capture bundles contain raw data (ZIP structure with `callmain-args.json`,
etc.). The helper script extracts just what the playground needs.

```powershell
cd docs\audit\ki-012-investigation

# Generate playground-ready directories for all three bundles
.\prepare-playground-bundle.ps1 -BundleDir bug-a-capture
.\prepare-playground-bundle.ps1 -BundleDir bug-b-capture
.\prepare-playground-bundle.ps1 -BundleDir baseline-capture
```

Each command creates a `<bundle>/playground-ready/` directory containing:

- `scad-source.scad` — the main SCAD file **with `-D` parameter values
  appended as variable assignments at the end** (since the playground has no
  CLI `-D` flag support)
- All companion files in their original directory structure

The appended parameter assignments use OpenSCAD's variable override semantics:
a variable assigned later in the file takes precedence over earlier definitions.
This is equivalent to the `-D` flag behavior on the CLI.

---

## Testing Strategies

### Strategy A — Full reproduction with file upload (preferred)

Upload the complete `playground-ready/` directory tree to the playground.
This preserves the exact same inputs as the WASM engine in our app.

**When to use:** The playground supports uploading directories or multiple
files with preserved paths.

### Strategy B — Simplified reproduction with inlined companion data

If the playground cannot handle directory uploads, inline the critical
companion file (`openings_and_additions.txt` for the LWFL preset) directly
into the SCAD source.

**When to use:** Playground only supports a single file editor.

**How:** The `prepare-playground-bundle.ps1` script has a `-InlineCompanion`
flag that produces a single self-contained SCAD file with the companion data
embedded. See the script's help text for details.

### Strategy C — Minimal reproduction (last resort)

If neither Strategy A nor B works (e.g., the SCAD file is too large for the
playground's editor, or companion file inlining breaks compilation), construct
a minimal SCAD snippet that isolates the specific boolean operation that
produces Bug A or Bug B.

**When to use:** Both Strategy A and B fail. This approach is more labor-
intensive and less conclusive (it tests a simplified model, not the exact
same inputs).

---

## Execution Protocol

### Step 0 — Run the helper script

```powershell
cd docs\audit\ki-012-investigation
.\prepare-playground-bundle.ps1 -BundleDir bug-a-capture
.\prepare-playground-bundle.ps1 -BundleDir bug-b-capture
.\prepare-playground-bundle.ps1 -BundleDir baseline-capture
```

Verify each `playground-ready/` directory contains `scad-source.scad` and the
companion file tree.

### Step 1 — Open the playground and record version

1. Navigate to [https://ochafik.com/openscad2](https://ochafik.com/openscad2)
2. Record the OpenSCAD WASM version (check the UI, console, or network tab)
3. Note whether the playground supports:
   - [ ] Multi-file upload / file manager
   - [ ] Customizer panel
   - [ ] Console output with warnings/errors

If the playground does not support multi-file upload, fall back to
Strategy B or C.

### Step 2 — Test Baseline (sanity check)

Before testing bug conditions, verify the baseline renders correctly.

1. **Upload files:** Upload the contents of `baseline-capture/playground-ready/`
   to the playground (either via file manager or paste the SCAD into the editor).

2. **Render:** Click "Render" (F6 or the render button).

3. **Check result:**
   - Does the model compile without errors?
   - Does the 3D preview show a recognizable keyguard shape?
   - Is the right edge smooth (no home button tab artifact)?
   - Are the upper corners solid (no ghost cutouts)?

4. **Record** the render time, any console warnings, and take a screenshot.

If the baseline fails to compile, check:
- Companion file paths are correct (the SCAD uses relative paths)
- The playground supports the `include` / `use` statements
- No filesystem path issues (forward vs. backslash)

### Step 3 — Test Bug A (expose_home_button = "no")

1. **Upload files:** Upload the contents of `bug-a-capture/playground-ready/`
   to the playground. If reusing the same session, clear/replace the SCAD
   source and ensure the companion files haven't changed (they should be
   identical across captures).

2. **Verify parameters:** Open the SCAD source and confirm at the end of the
   file:

   ```scad
   // === PARAMETER OVERRIDES (from captured -D args) ===
   expose_home_button = "no";
   expose_upper_message_bar = "yes";
   ```

3. **Render** the model.

4. **Inspect for Bug A symptoms:**

   | Check | What to look for |
   |-------|-----------------|
   | **Right edge** | Is it a straight line along the Y-axis (correct), or does a tab jut out where the home button cutout would be (Bug A present)? |
   | **General integrity** | Any other artifacts, missing faces, or unexpected geometry? |

5. **Record results** in `playground-comparison-results.md`:
   - Bug A present: YES / NO / PARTIAL
   - Console warnings (copy any geometry-related warnings)
   - Screenshot

### Step 4 — Test Bug B (expose_upper_message_bar = "no")

1. **Upload files:** Upload the contents of `bug-b-capture/playground-ready/`
   to the playground.

2. **Verify parameters:** Confirm at the end of the SCAD source:

   ```scad
   // === PARAMETER OVERRIDES (from captured -D args) ===
   expose_home_button = "yes";
   expose_upper_message_bar = "no";
   ```

3. **Render** the model.

4. **Inspect for Bug B symptoms:**

   | Check | What to look for |
   |-------|-----------------|
   | **Upper corners** | Are positions #1 and #12 solid (correct), or are there partial square cutouts / notched angles (Bug B present)? |
   | **General integrity** | Any other artifacts? |

5. **Record results** in `playground-comparison-results.md`.

### Step 5 — Repeat on official playground (if available)

If time permits, repeat Steps 2-4 on the official OpenSCAD playground at
[https://openscad.org/playground/](https://openscad.org/playground/). This
provides a second independent data point and may use a different WASM build.

Record the version separately.

### Step 6 — Try the Customizer approach (optional)

If the playground has a Customizer panel (parameter editor UI):

1. Upload the **unmodified** `scad-source.scad` (without the appended parameter
   overrides) plus all companion files.
2. Use the Customizer panel to set `expose_home_button = "no"` for Bug A, or
   `expose_upper_message_bar = "no"` for Bug B.
3. Render and compare with the appended-override approach.

This tests whether the Customizer vs. variable-assignment approach affects
the result.

---

## Decision Matrix

| Playground Result | Conclusion |
|-------------------|------------|
| **Bugs reproduce on playground** | **WASM engine issue definitively confirmed.** Our app is irrelevant — the official WASM build produces the same buggy geometry with the same inputs. |
| **Playground renders correctly** | **Our app is doing something different.** Revisit: callMain arguments, file mounting order, WASM build version, or other app-specific behavior. |
| **Playground shows different bugs** | **Version-specific behavior.** The playground's WASM build differs from ours. Proceed to Phase 5 (Version Bisect) to isolate the build. |
| **Playground fails to compile** | **Inconclusive for this strategy.** The playground may lack features our WASM setup provides. Try Strategy B or C. |

### Cross-reference with Phase 3 (Desktop Comparison)

| Desktop Result | Playground Result | Overall Conclusion |
|----------------|-------------------|-------------------|
| Correct | Bugs present | WASM Manifold engine bug (not present in desktop native Manifold) |
| Correct | Correct | Our app's WASM invocation is different from the playground's |
| Bugs present | Bugs present | Manifold engine bug affecting both WASM and desktop |
| Bugs present | Correct | Build version difference; need Phase 5 bisect |

---

## Important Differences from Our App's WASM Setup

The playground comparison is not a perfect 1:1 match with our app. Key
differences to be aware of:

| Factor | Our App | Playground |
|--------|---------|------------|
| WASM build | Bundled in `public/wasm/` (April 2026) | Playground's own build (version TBD) |
| Parameter passing | `-D` flags via `callMain()` | Variable assignments appended to SCAD source |
| File mounting | Emscripten FS via `FS.writeFile()` | Playground's file manager |
| Backend flag | `--backend=Manifold` via `callMain()` | Playground's default (may or may not be Manifold) |
| Resolution | `$fa=12`, `$fs=2` via `-D` | Appended to SCAD source |

If the playground does not use the Manifold backend by default, check if there
is a UI toggle or setting to enable it. Results with a different backend (e.g.,
CGAL) are still useful but must be noted.

---

## Troubleshooting

### Playground can't find companion files

- Ensure the directory structure matches what the SCAD source expects. The SCAD
  uses paths like:

  ```
  Cases and App Specifics/iPad 7,8,9/Fintie-equivalent Case/LWFL/openings_and_additions.txt
  ```

- Some playgrounds may not support spaces in filenames/paths. If so, Strategy B
  (inlining) is required.

### SCAD source too large for playground editor

- The SCAD file (`keyguard_v75.scad`) is a large, complex file. Some playground
  editors may struggle with it.
- Try Strategy C (minimal reproduction) if the editor is unresponsive.

### Render takes too long / times out

- The full model takes ~10-13 seconds on our WASM setup. The playground may
  have different resource limits.
- If rendering times out, try reducing `smoothness_of_circles_and_arcs` from
  40 to 20 (edit the appended parameter line) and note the change.

### "Backend not available" or Manifold-related errors

- The playground may not have Manifold support. If it only has CGAL, the
  comparison is still valuable: if CGAL renders correctly where our Manifold
  WASM doesn't, this further narrows the issue to Manifold.
- Record which backend the playground uses.

### Parameter overrides don't take effect

- OpenSCAD's variable scoping means the last assignment wins. If the SCAD
  file uses `function`-based parameter defaults that aren't overridable by
  simple assignment, the appended overrides may not work.
- In that case, manually edit the parameter definition at the top of the SCAD
  file instead.

---

## Output Files

```
docs/audit/ki-012-investigation/
├── baseline-capture/
│   └── playground-ready/          (generated by helper script)
│       └── scad-source.scad       (with baseline params appended)
├── bug-a-capture/
│   └── playground-ready/
│       └── scad-source.scad       (with Bug A params appended)
├── bug-b-capture/
│   └── playground-ready/
│       └── scad-source.scad       (with Bug B params appended)
├── playground-comparison-protocol.md   (this file)
├── playground-comparison-results.md    (results template)
└── prepare-playground-bundle.ps1       (helper script)
```

---

## Next Steps

After recording all results in `playground-comparison-results.md`:

- **If WASM engine issue confirmed:** Proceed to Phase 5 (Version Bisect) to
  identify whether this is a regression or a long-standing issue.
- **If our app is different:** Investigate callMain differences, file mounting
  order, or WASM build provenance.
- **If inconclusive:** Document what worked and what didn't; consider building
  a minimal SCAD reproduction (Strategy C) for further testing.
