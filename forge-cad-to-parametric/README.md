# forge-cad-to-parametric

A Python CLI tool that automates the conversion of CAD exports (STL/OBJ/STEP/DXF) into
parametric OpenSCAD files with Customizer annotations, compatible with
[openscad-assistive-forge](https://github.com/BrennenJohnston/openscad-assistive-forge).

## Why this exists

Manually converting a physical CAD design into parametric OpenSCAD is error-prone and
time-consuming. The 8-stage analysis pipeline in this tool automates the geometry-analysis
phases (Z-profile extraction, variant differencing, topology classification, feature detection,
boundary detection) and generates a pre-filled YAML questionnaire for the human-judgment stages.
The user reviews and confirms the analysis, then the tool emits a parametric `.scad` file that
loads directly into the forge web UI.

This tool was developed alongside the Plug Puller v4.0 conversion project. The retrospective
from that project identified that without systematic Z-profile analysis and pocket-vs-protrusion
classification, even expert-guided conversions required 3+ correction iterations.

## Install

```bash
cd forge-cad-to-parametric
pip install -e .
# For STEP file support (requires CadQuery):
pip install -e ".[step]"
```

## Quick start

```bash
# 1. Initialise a new project from a CAD folder
forge-cad init ./my-project --source "./Plug Puller 4.0/"

# 2. Interactively review and confirm the auto-analysis
forge-cad review ./my-project

# 3. Generate the parametric .scad file
forge-cad generate ./my-project

# 4. Validate the output against the source geometry
forge-cad validate ./my-project
```

The generated `.scad` file can then be loaded into the
[openscad-assistive-forge](https://openscad-assistive-forge.pages.dev/) web UI for
browser-based preview and customization.

## Commands

| Command | Description |
|---------|-------------|
| `forge-cad init <project-dir> --source <cad-dir>` | Scan CAD folder, run auto-analysis, generate `project.yaml` |
| `forge-cad review <project-dir>` | Interactive CLI walkthrough to confirm/adjust detections |
| `forge-cad generate <project-dir>` | Emit parametric `.scad` from confirmed `project.yaml` |
| `forge-cad validate <project-dir>` | Compare generated STL against source meshes |
| `forge-cad status <project-dir>` | Show current project state |

## Architecture

The tool implements an 8-stage analysis pipeline:

- **Stage 0** — Platform semantics: detect file types, coordinate systems
- **Stage 1** — Z-profile extraction: identify unique Z-levels per component
- **Stage 2** — Variant differencing: compute what changed between variants
- **Stage 3** — Topology classification: classify components as body/pocket/feature
- **Stage 4** — Feature detection: cross-section analysis and primitive fitting
- **Stage 6** — Boundary detection: find shared faces for eps expansion

Each stage produces results stored in `project.yaml`. The interactive review lets the user
confirm or override each detection before code generation.

## Output format

Generated `.scad` files follow these conventions (compatible with forge's parameter parser):

- `/* [Section Name] */` Customizer section headers
- `param = value; // [min:max:step] description` parameter annotations
- 2D-first architecture: all geometry defined as 2D profiles, extruded to 3D
- Pocket-and-fill CSG for recessed features
- `eps = 0.01` convention for boolean subtraction clearance
- Enable/disable toggles for each optional feature

## Dependencies

| Package | License | Role |
|---------|---------|------|
| trimesh | MIT | Mesh loading, Z-profile extraction, validation |
| ezdxf | MIT | DXF 2D profile parsing |
| solidpython2 | LGPL-2.1+ | OpenSCAD code generation |
| numpy | BSD | Numerical operations |
| scipy | BSD | Cross-section analysis |
| click | BSD | CLI framework |
| rich | MIT | Terminal UI |
| pyyaml | MIT | YAML form persistence |
| cadquery | Apache-2.0 | STEP analysis (optional) |

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Credits

See [CREDITS.md](CREDITS.md) for full acknowledgments.
