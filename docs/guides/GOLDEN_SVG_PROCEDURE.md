# Desktop OpenSCAD Golden SVG Procedure

This document describes how to create "golden" reference outputs from desktop OpenSCAD for validating the Forge SVG/DXF export workflow.

## Purpose

When debugging SVG export issues (like the Volkswitch keyguard workflow), we need a known-good reference to compare against. The desktop OpenSCAD application is the authoritative source for expected output.

## Prerequisites

1. Desktop OpenSCAD installed (version 2021.01 or later recommended)
2. The test SCAD files and companion files
3. Access to the OpenSCAD Customizer panel

## Procedure for Volkswitch Keyguard Golden SVG

### Step 1: Prepare Files

1. Download or locate `keyguard_v74.scad` (or the minimal test fixture `keyguard_minimal.scad`)
2. Ensure `openings_and_additions.txt` is in the same directory

### Step 2: Open in Desktop OpenSCAD

1. Open the SCAD file in OpenSCAD
2. Verify no "file not found" errors appear in the console
3. Open the Customizer panel (View > Customizer)

### Step 3: Configure for Laser-Cut SVG

Set the following parameters in the Customizer:

| Parameter | Value |
|-----------|-------|
| `type_of_keyguard` | `Laser-Cut` |
| `generate` | `first layer for SVG/DXF file` |

### Step 4: Render

1. Press F5 (Preview) to see the 2D projection
2. Press F6 (Render) for full geometry generation
3. Wait for rendering to complete

### Step 5: Export SVG

1. Go to File > Export > Export as SVG...
2. Save as `keyguard_v74_golden.svg`
3. Note the file size and approximate geometry

### Step 6: Validate SVG

Open the golden SVG in a text editor and verify:

- [ ] File starts with `<svg` tag
- [ ] Contains `<path>`, `<polygon>`, or `<polyline>` elements
- [ ] File size is reasonable (typically 10KB-500KB for keyguards)
- [ ] ViewBox has non-zero dimensions

### Step 7: Document Results

Create a reference entry with:

```
File: keyguard_v74_golden.svg
Date: YYYY-MM-DD
OpenSCAD Version: X.X.X
Parameters:
  - type_of_keyguard: Laser-Cut
  - generate: first layer for SVG/DXF file
  - [other relevant params]
File Size: XX KB
Contains Geometry: Yes/No
Path Count: ~N elements
ViewBox: "X Y W H"
```

## Comparing Forge Output to Golden Reference

When validating Forge SVG export:

1. **Structure**: Both should start with `<svg` and contain geometric elements
2. **Non-empty**: File size should be > 100 bytes
3. **ViewBox**: Should have similar dimensions (within 10% tolerance)
4. **Element Count**: Path/polygon count should be similar (not necessarily exact)

### Acceptable Differences

- Precision differences in coordinates (floating point)
- Different element ordering
- Different SVG styling attributes
- Minor bounding box variations

### Failure Indicators

- Forge output is empty or < 100 bytes
- Missing `<svg>` root element
- No geometric elements (paths, polygons)
- Zero-size viewBox

## Quick Test Procedure

For rapid testing without full Volkswitch complexity:

```scad
// test-2d.scad - Minimal 2D test
square([50, 50]);
```

1. Save as `test-2d.scad`
2. In desktop OpenSCAD, render and export as SVG
3. Golden output should contain a single `<rect>` or `<polygon>` element
4. Repeat in Forge and compare

## Console Output Verification

Desktop OpenSCAD console output should be visible in the Console panel.
For Volkswitch, look for:

- `ECHO:` lines from the designer
- Configuration guidance messages
- Warning messages about dependencies

Forge should display the same console output in its Console Output modal.

## Troubleshooting

### Empty SVG Output

If desktop OpenSCAD produces empty SVG:
- Verify `generate` is set to `first layer for SVG/DXF file`
- Check that the model produces 2D output (not 3D)
- Look for error messages in console

### Include File Errors

If "can't open include file" appears:
- Verify companion files are in the same directory
- Check file permissions
- Ensure filename case matches exactly

### SVG Contains No Visible Geometry

The model may be producing geometry outside the viewBox or at very small scale:
- Check the generated SVG's viewBox dimensions
- Try zooming out in SVG viewer
- Verify model parameters produce visible output
