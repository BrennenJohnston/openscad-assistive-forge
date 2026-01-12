# OpenSCAD Web Customizer Forge

> Transform OpenSCAD Customizer-enabled `.scad` files into deployable web applications with automatic parameter extraction, schema-driven UI generation, and iterative validation.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenSCAD](https://img.shields.io/badge/OpenSCAD-WASM-orange.svg)](https://openscad.org/)

## 🎯 What This Tool Does

**OpenSCAD Web Customizer Forge** bridges the gap between OpenSCAD's powerful parametric modeling and modern web deployment:

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  OpenSCAD File  │ ──▶  │  Parameter Schema │ ──▶  │  Vercel Web App     │
│  (.scad)        │      │  (JSON Schema)    │      │  + STL Generation   │
│  + Customizer   │      │  + UI Metadata    │      │  + 3D Preview       │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
        ▲                                                    │
        │              ┌──────────────────┐                  │
        └───────────── │  Validation      │ ◀────────────────┘
                       │  Harness         │
                       │  (Schema/UI/STL) │
                       └──────────────────┘
```

### Key Features

- **Extract** → Parse OpenSCAD Customizer annotations into a standardized parameter schema
- **Scaffold** → Generate a complete, deployable web application from the schema
- **Validate** → Compare parameter schemas, UI rendering, and STL outputs between OpenSCAD and web versions
- **Sync** → Apply safe auto-fixes for detected parity issues

## 📋 Requirements

### For v1 (OpenSCAD → Web)

Your `.scad` file must include **OpenSCAD Customizer annotations**:

```scad
/*[Dimensions]*/
width = 50;       // [10:100]
height = 30;      // [10:80]
shape = "round";  // [round, square, hexagon]

/*[Options]*/
hollow = true;    // Create hollow version
wall_thickness = 2; // [1:0.5:5]

/*[Hidden]*/
$fn = 100;
```

**Supported annotation types:**
- `/*[Group Name]*/` — Parameter grouping
- `// [min:max]` or `// [min:step:max]` — Numeric ranges
- `// [opt1, opt2, opt3]` — Dropdown enums
- `// Comment text` — Help/description text
- `/*[Hidden]*/` — Internal parameters (not shown in UI)

## 🚀 Quick Start

```bash
# Install the CLI
npm install -g openscad-web-customizer-forge

# Extract parameters from your .scad file
forge extract my-model.scad --out params.schema.json

# Generate a web app scaffold
forge scaffold --schema params.schema.json --scad my-model.scad --out ./my-web-app

# Validate parity between OpenSCAD and web versions
forge validate ./my-web-app --ref openscad-cli
```

## 📖 Documentation

- [Build Plan](docs/BUILD_PLAN.md) — Development roadmap and phased implementation
- [Parameter Schema Specification](docs/specs/PARAMETER_SCHEMA_SPEC.md) — JSON Schema format for parameters
- [Examples](examples/) — Sample projects demonstrating the workflow

## 🔧 How It Works

### 1. Parameter Extraction

The tool parses your `.scad` file and extracts Customizer annotations into a `params.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "width": {
      "type": "number",
      "default": 50,
      "minimum": 10,
      "maximum": 100,
      "x-ui-group": "Dimensions",
      "x-ui-order": 0
    }
  }
}
```

### 2. Web App Generation

The scaffold command generates a Vercel-ready web application:

```
my-web-app/
├── public/
│   ├── index.html          # Schema-driven UI
│   ├── worker.js           # OpenSCAD WASM runner
│   └── my-model.scad       # Your OpenSCAD file
├── vercel.json             # Deployment config
├── params.schema.json      # Parameter schema
└── THIRD_PARTY_NOTICES.md  # License compliance
```

### 3. Validation

The validation harness compares:

| Layer | What's Compared | Auto-fixable? |
|-------|-----------------|---------------|
| Schema | Names, types, defaults, ranges | ✅ Yes |
| UI | Labels, help text, grouping | ⚠️ Partial |
| STL | Bounding box, volume, surface distance | ❌ No (tolerances only) |

## ⚖️ Licensing

- **This tool**: MIT License
- **Generated web apps**: Include OpenSCAD (GPL) — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- **Your .scad files**: Your license (preserved in generated apps)

## 🙏 Acknowledgments

This project was inspired by the validation patterns developed in:
- [braille-card-and-cylinder-stl-generator](https://github.com/BrennenJohnston/braille-card-and-cylinder-stl-generator)
- [braille-stl-generator-openscad](https://github.com/BrennenJohnston/braille-stl-generator-openscad)

OpenSCAD WASM integration references:
- [openscad-web-gui](https://github.com/seasick/openscad-web-gui) (GPL-3.0)
- [OpenSCAD](https://openscad.org/) (GPL-2.0+)

## 🤝 Contributing

Contributions welcome! Please read the build plan first to understand the phased approach.

## 📊 Project Status

**Current Phase**: Phase 0 — Specification & Planning

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Finalize specs + baseline artifacts | 🔄 In Progress |
| 1 | OpenSCAD Customizer extractor | ⏳ Pending |
| 2 | Vercel web template | ⏳ Pending |
| 3 | Validation harness | ⏳ Pending |
| 4 | Iterative correction loop | ⏳ Pending |
