# Plug Puller v4.0 — Step-by-Step Walkthrough

This walkthrough converts the Plug Puller v4.0 CAD exports into a parametric OpenSCAD file
using `forge-cad-to-parametric`, then loads the result into
[openscad-assistive-forge](https://openscad-assistive-forge.pages.dev/) for web-based
customization.

## Source files

The Plug Puller v4.0 exports include:

```
Plug Puller 4.0/
├── Full General (Clean Overview)/        ← Full assembly (base for analysis)
│   └── Full General (Clean Overview).obj
├── Full (Plug Base Plates Removed)/      ← Variant with pocket fills removed
│   └── Full (Plug Base Plates Removed).obj
├── Plug Base Plate Layer 1/              ← Isolated component (Z: 0–3 mm)
│   └── Plug Base Plate Layer 1.obj
└── Plug Base Plate Layer 2/              ← Isolated component (Z: 0–6 mm)
    └── Plug Base Plate Layer 2.obj
```

## Step 1: Install

```bash
cd forge-cad-to-parametric
pip install -e .
```

## Step 2: Init

```bash
forge-cad init ./plug-puller-project \
  --source "./Plug Puller 4.0/" \
  --name "Plug Puller v4.0"
```

Expected output:

```
forge-cad init — Plug Puller v4.0
  Source : .../Plug Puller 4.0/
  Project: .../plug-puller-project/
  Output : Plug_Puller_v4.0_parametric.scad

  Loaded 4 mesh(es)
  Z-levels: [0.0, 3.0, 6.0, 8.0]

  Files detected   : 4
  Components found : 4
  Features found   : ~8 (finger holes, cord hook, wall notch, zip ties, velcro holes)

  ✓ project.yaml written to .../plug-puller-project/project.yaml
  Next step: forge-cad review ./plug-puller-project
```

## Step 3: Inspect project.yaml

The generated `project.yaml` should show:

```yaml
project:
  name: Plug Puller v4.0

components:
  - name: Full General (Clean Overview)
    role: base_solid          # ← tallest Z-range (0–8 mm)
    z_range: [0.0, 8.0]
    confirmed: false

  - name: Plug Base Plate Layer 1
    role: pocket_fill         # ← Z-range [0,3] ⊂ body [0,8] → RECESSED
    z_range: [0.0, 3.0]
    confirmed: false
    notes:
      - "Z-range [0.0, 3.0] ⊂ body [0.0, 8.0] → pocket_fill (recessed, not additive)"

  - name: Plug Base Plate Layer 2
    role: pocket_fill         # ← Z-range [0,6] ⊂ body [0,8] → RECESSED
    z_range: [0.0, 6.0]
    confirmed: false
```

> **Key insight**: The Z-range subset rule correctly classifies the plate layers as
> `pocket_fill` (recessed into the body), not `additive` (stacked on top). Without this
> classification, the generated model would be architecturally wrong.

## Step 4: Review

```bash
forge-cad review ./plug-puller-project
```

Walk through each component:

| Component | Auto-classified as | Action |
|-----------|-------------------|--------|
| Full General (Clean Overview) | base_solid | Confirm + rename to "body" |
| Full (Plug Base Plates Removed) | variant | Confirm (skip in codegen) |
| Plug Base Plate Layer 1 | pocket_fill | Confirm + rename to "plate_layer_1" |
| Plug Base Plate Layer 2 | pocket_fill | Confirm + rename to "plate_layer_2" |

Walk through each feature:

| Feature | Auto-classified as | Action |
|---------|-------------------|--------|
| ~circular (Ø25mm, center ~±16.5, 26.7) | circular_hole | Rename to "finger_holes" |
| ~rectangular (5×10mm at Y=0) | rectangular_slot | Rename to "cord_t_hook" |
| ~rectangular (26×4mm at Y=70) | rectangular_slot | Rename to "plug_wall_notch" |
| ~4× circular (Ø5mm grid) | circular_hole | Rename to "zip_tie_holes" |
| ~2× rectangular rotated | rectangular_slot | Rename to "velcro_holes" |

## Step 5: Generate

```bash
forge-cad generate ./plug-puller-project
```

This produces `Plug_Puller_v4.0_parametric.scad` with:

- `/* [Render Mode] */` section with assembly/body_only/exploded
- `/* [Global Parameters] */` with eps, body_thickness
- `/* [plate_layer_1 — pocket_fill] */` with plate_layer_1_thickness
- `/* [plate_layer_2 — pocket_fill] */` with plate_layer_2_thickness
- `/* [Feature Toggles] */` with enable_finger_holes, enable_cord_t_hook, etc.
- `body_2d()`, `plate_layer_1_2d()`, `plate_layer_2_2d()` modules
- `body_3d()`, `plate_layer_1_3d()`, `plate_layer_2_3d()` modules
- `plate_layer_1_pocket_2d()`, `plate_layer_1_pocket_3d()` — eps-expanded cutters
- `plate_layer_2_pocket_2d()`, `plate_layer_2_pocket_3d()` — eps-expanded cutters
- `finger_holes_3d()`, `cord_t_hook_3d()`, etc.
- `plug_puller_v4_0()` assembly module
- Render dispatcher

## Step 6: Validate

```bash
# Requires OpenSCAD installed and on PATH
forge-cad validate ./plug-puller-project
```

Sample output:

```
Validation Report
┌───────────────────┬──────────────┬───────────────┬───────────┐
│ Metric            │ Source       │ Generated     │ Deviation │
├───────────────────┼──────────────┼───────────────┼───────────┤
│ Volume (mm³)      │ 23450.123    │ 22980.456     │ 2.0%      │
│ Surface area (mm²)│ 8920.780     │ 8845.321      │ 0.8%      │
│ X extent          │ 80.000       │ 80.000        │ 0.0%      │
│ Y extent          │ 70.000       │ 70.000        │ 0.0%      │
│ Z extent          │ 8.000        │ 8.000         │ 0.0%      │
└───────────────────┴──────────────┴───────────────┴───────────┘

✓ Validation PASSED (max deviation 2.0%)
```

## Step 7: Load into openscad-assistive-forge

1. Open https://openscad-assistive-forge.pages.dev/
2. Click **Open File** and select `Plug_Puller_v4.0_parametric.scad`
3. The Customizer parameter UI appears on the left panel
4. Adjust parameters (body thickness, hole diameters, etc.) and preview
5. Click **Export STL** to download

Alternatively, use the forge CLI:

```bash
# Extract parameter schema (from the forge CLI, not forge-cad)
openscad-forge extract Plug_Puller_v4.0_parametric.scad

# Scaffold a standalone web customizer
openscad-forge scaffold --template vanilla --out ./my-customizer
```

## What the pocket-and-fill architecture looks like

```
Z (mm)
8 ┤████████████████████████████████████  ← body walls (surrounding the pockets)
  │████                          ████
6 ┤████  ██████████████████████  ████  ← plate_layer_2 fills to 6 mm
  │████  ██████████████████████  ████
3 ┤████  ████  ████████  ████  ████  ← plate_layer_1 fills to 3 mm
  │████  ████  ████████  ████  ████
0 ┤████████████████████████████████████  ← shared bottom face (print bed)
  └──────────────────────────────────→ X
```

The body starts as a full 8 mm slab. The plate layer footprints are subtracted as
full-height pockets, then each plate layer is union'd back in at its correct height.
Feature holes are cut through everything last.

This is the **correct** architecture. Stacking plates on top of the body produces the
wrong geometry (plates would protrude above the body instead of being recessed).
