# Forge Integration Guide

This document describes how to use `forge-cad-to-parametric` output with
[openscad-assistive-forge](https://github.com/BrennenJohnston/openscad-assistive-forge).

## How the output .scad file is structured for forge

The generated `.scad` file follows the exact Customizer annotation format parsed by
forge's `src/js/parser.js`:

### Parameter section headers

```openscad
/* [Section Name] */
param_name = value; // description
```

### Number parameters with ranges

```openscad
body_thickness = 8; // [1:30:0.5] Total body thickness (Z height mm)
```

Forge parses `[min:max:step]` and renders a range slider.

### Boolean toggles

```openscad
enable_finger_holes = true; // Enable finger holes
```

Forge renders a checkbox.

### Dropdown parameters

```openscad
render_mode = "assembly"; // ["assembly", "body_only", "exploded"] Render mode
```

Forge renders a select/dropdown.

## Loading the file into the forge web UI

1. Go to https://openscad-assistive-forge.pages.dev/
2. Click the **Open File** button (or drag-and-drop)
3. Select the generated `.scad` file
4. The parameter panel auto-populates from the Customizer annotations
5. Adjust parameters and click **Render** to update the 3D preview
6. Click **Export STL** to download

## Using with multi-file projects

If your `.scad` file uses `include` or `use` to reference other `.scad` files:

1. Bundle all files into a `.zip` archive
2. Upload the `.zip` to forge instead of the individual `.scad`
3. Forge extracts and mounts all files via its virtual file system

## Using the forge CLI (openscad-forge)

The `openscad-forge` CLI from the forge project can work with output from
`forge-cad-to-parametric`:

```bash
# Install the forge CLI
cd /path/to/openscad-assistive-forge
npm install -g .

# Extract parameter schema from the generated .scad
openscad-forge extract ./Plug_Puller_v4.0_parametric.scad

# Scaffold a standalone customizer page
openscad-forge scaffold \
  --scad ./Plug_Puller_v4.0_parametric.scad \
  --template vanilla \
  --out ./my-plug-puller-customizer/
```

The scaffolded customizer can be deployed to any static hosting provider
(GitHub Pages, Cloudflare Pages, Vercel, etc.) without a backend.

## Accessibility features of the forge UI

The generated `.scad` file integrates with forge's accessibility-first UI:

- All parameter controls are keyboard-navigable
- Screen reader labels are derived from the parameter descriptions
- High contrast and reduced motion modes are supported
- The 3D preview has descriptive ARIA labels for the current render state

## Parameter naming conventions

The emitter generates parameter names that are readable in the forge UI:

| Good | Avoid |
|------|-------|
| `body_thickness` | `bt` |
| `enable_finger_holes` | `efh` |
| `finger_hole_diameter` | `fhd` |
| `plate_layer_1_thickness` | `plt1` |

Descriptions (in `// comments`) are used as labels in the forge UI — write them in
plain English for maximum accessibility.

## Testing your output in forge

Use the forge's built-in render comparison to check your generated model:

1. Load the `.scad` into forge
2. Export STL at default parameters
3. Compare against the source mesh using `forge-cad validate`

Any parameters that change the volume by more than 5% from source should be reviewed.
