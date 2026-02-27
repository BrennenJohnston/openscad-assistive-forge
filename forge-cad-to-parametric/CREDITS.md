# Credits & Acknowledgments — forge-cad-to-parametric

This file acknowledges all open-source projects, algorithms, and references that contributed
to this tool.

For third-party software licenses and compliance information, see the dependency list in
[pyproject.toml](pyproject.toml) and each project's respective license file.

---

## Core Mesh Analysis

### trimesh

The primary mesh loading, cross-section, and comparison engine used in all analysis stages.

- **URL**: https://github.com/mikedh/trimesh
- **License**: MIT
- **Role**: STL/OBJ loading, Z-profile extraction, cross-section slicing, volume/area comparison

### ezdxf

DXF file parsing for 2D profile extraction from layer-based CAD exports.

- **URL**: https://github.com/mozman/ezdxf
- **License**: MIT
- **Role**: DXF entity reading, polyline and spline extraction

### CadQuery (optional)

STEP file analysis for higher-fidelity feature recognition from BREP models.

- **URL**: https://github.com/CadQuery/cadquery
- **License**: Apache-2.0
- **Role**: STEP loading, face/edge topology analysis

---

## Code Generation

### SolidPython2

OpenSCAD code generation library used as the emitter backend.

- **URL**: https://github.com/jeff-dh/SolidPython
- **License**: LGPL-2.1-or-later
- **Role**: Programmatic OpenSCAD AST construction and serialization

---

## CLI & Terminal UI

### Click

- **URL**: https://github.com/pallets/click
- **License**: BSD-3-Clause
- **Role**: CLI command structure, argument parsing, interactive prompts

### Rich

- **URL**: https://github.com/Textualize/rich
- **License**: MIT
- **Role**: Terminal tables, panels, progress bars, colored output

---

## Deployment Target

### openscad-assistive-forge

The web-based OpenSCAD customizer that this tool's output is designed to target.

- **URL**: https://github.com/BrennenJohnston/openscad-assistive-forge
- **License**: GPL-3.0-or-later
- **Role**: Customizer annotation format reference, parameter parser compatibility target

---

## Algorithm References

### raviriley/STL-to-OpenSCAD-Converter

Reference implementation for polyhedron generation from mesh data.

- **URL**: https://github.com/raviriley/STL-to-OpenSCAD-Converter
- **License**: MIT
- **Role**: Polyhedron generation pattern reference (literal mesh transcription approach)

### InverseCSG (MIT CSAIL)

CSG reconstruction algorithm research reference.

- **URL**: https://people.csail.mit.edu/taoy/inversecsg/
- **License**: MIT
- **Role**: Academic reference for CSG reconstruction limitations and approaches

### Szalinski (University of Washington)

Parametric pattern discovery from mesh arrays.

- **URL**: https://homes.cs.washington.edu/~reinhard/szalinski/
- **License**: Research reference
- **Role**: Academic reference for parametric lifting from mesh repetitions

---

## OpenSCAD Ecosystem

### OpenSCAD

The parametric 3D CAD modeler that is the output target.

- **URL**: https://openscad.org/
- **License**: GPL-2.0-or-later
- **Role**: Output platform, Customizer annotation host

### BOSL2

OpenSCAD library providing patterns and idioms referenced in the emitter.

- **URL**: https://github.com/BelfrySCAD/BOSL2
- **License**: BSD-2-Clause
- **Role**: OpenSCAD library patterns reference (2D-first architecture idioms)

---

## Special Thanks

- The Plug Puller v4.0 conversion project, which provided the retrospective analysis that
  defined the 8-stage pipeline
- The trimesh community for excellent documentation and cross-section utilities
- The OpenSCAD Customizer feature developers for the annotation format this tool targets

---
