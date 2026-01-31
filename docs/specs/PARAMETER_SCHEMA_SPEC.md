# Parameter Schema Specification

## Overview

This document defines the **Parameter Schema** format used by the OpenSCAD Assistive Forge. The schema serves as the intermediate representation between OpenSCAD Customizer annotations and generated web application UIs.

**Usage in v1 (Web App)**: Parameters are extracted at runtime in the browser and converted to this schema format internally for UI generation.

**Usage in v2 (CLI Toolchain)**: The `forge extract` command generates `params.schema.json` files following this specification.

The Parameter Schema is based on **JSON Schema (draft 2020-12)** with custom extensions for UI metadata.

## Goals

1. **Lossless extraction**: Capture all OpenSCAD Customizer information
2. **UI-ready metadata**: Include everything needed to render a form UI
3. **Validation-friendly**: Support runtime validation of parameter values
4. **Bidirectional**: Support both OpenSCAD to Web and Web to OpenSCAD workflows

---

## Schema Structure

### Root Object

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "params.schema.json",
  "title": "Model Name",
  "description": "Model description extracted from file header",
  "type": "object",
  "properties": { ... },
  "required": [ ... ],
  "x-forge-version": "1.0.0",
  "x-forge-source": {
    "type": "openscad",
    "file": "model.scad",
    "extractedAt": "2026-01-12T12:00:00Z"
  },
  "x-forge-groups": [ ... ]
}
```

### Custom Extensions (x-forge-*)

All custom extensions use the `x-forge-` prefix to avoid conflicts with standard JSON Schema.

| Extension | Location | Purpose |
|-----------|----------|---------|
| `x-forge-version` | root | Schema format version |
| `x-forge-source` | root | Source file metadata |
| `x-forge-groups` | root | Ordered list of parameter groups |
| `x-forge-group` | property | Group assignment for a parameter |
| `x-forge-order` | property | Display order within group |
| `x-forge-help` | property | Extended help text |
| `x-forge-unit` | property | Unit of measurement (mm, deg, etc.) |
| `x-forge-hidden` | property | Parameter should not appear in UI |
| `x-forge-depends` | property | Conditional visibility rules |
| `x-forge-render-as` | property | UI rendering hint (e.g. `"toggle"`, `"select"`, `"slider"`) |

### Group IDs vs Labels (Important)

- **`x-forge-groups[].id`** is the stable identifier used by code and stored on each property in **`x-forge-group`**.
- **`x-forge-groups[].label`** is the human-visible label shown in the UI.

**Rule**: `properties.<name>.x-forge-group` MUST reference a group `id` (not the label).

**Recommended group-id generation (when extracting from `/*[Label]*/`)**:
- Lowercase
- Trim whitespace
- Replace spaces/underscores with `-`
- Remove non-alphanumeric characters except `-`
- Collapse multiple `-`

Example: `"Palm Loop Info"` → `palm-loop-info`

---

## Parameter Types

### Numeric (Integer or Float)

**OpenSCAD Source:**
```scad
width = 50;           // [10:100]
height = 30.5;        // [10:0.5:80]
```

**Schema Representation:**
```json
{
  "width": {
    "type": "integer",
    "default": 50,
    "minimum": 10,
    "maximum": 100,
    "x-forge-group": "dimensions",
    "x-forge-order": 0
  },
  "height": {
    "type": "number",
    "default": 30.5,
    "minimum": 10,
    "maximum": 80,
    "multipleOf": 0.5,
    "x-forge-group": "dimensions",
    "x-forge-order": 1
  }
}
```

**UI Rendering:**
- Range slider with min/max bounds
- Numeric input with step buttons
- Display current value

### Enum (Dropdown)

**OpenSCAD Source:**
```scad
shape = "round";  // [round, square, hexagon]
```

**Schema Representation:**
```json
{
  "shape": {
    "type": "string",
    "default": "round",
    "enum": ["round", "square", "hexagon"],
    "x-forge-group": "options",
    "x-forge-order": 0
  }
}
```

**Notes:**
- `enum` may contain **strings or numbers**. Example: `"enum": [0, 2, 4, 6]`.
- If `enum` contains numbers, set `"type": "integer"` (or `"number"`).

**UI Rendering:**
- Dropdown select or radio button group
- First value is default (unless explicitly specified)

### Boolean

**OpenSCAD Source:**
```scad
hollow = true;  // Make hollow version
```

**Schema Representation:**
```json
{
  "hollow": {
    "type": "boolean",
    "default": true,
    "description": "Make hollow version",
    "x-forge-group": "options",
    "x-forge-order": 1
  }
}
```

**UI Rendering:**
- Checkbox or toggle switch
- Label includes description

### Yes/No Enum (Special Case)

**OpenSCAD Source:**
```scad
include_mount = "yes";  // [yes, no]
```

**Schema Representation:**
```json
{
  "include_mount": {
    "type": "string",
    "default": "yes",
    "enum": ["yes", "no"],
    "x-forge-group": "options",
    "x-forge-order": 2,
    "x-forge-render-as": "toggle"
  }
}
```

**UI Rendering:**
- Can render as toggle (recommended) or dropdown
- `x-forge-render-as: "toggle"` hints at preferred rendering

### Variable Naming (Extraction Guidance)

OpenSCAD commonly uses special variables like **`$fn`**. When extracting parameters from OpenSCAD source, parameter names MAY start with `$`.

**Recommended identifier matcher**: `[$]?[A-Za-z_][A-Za-z0-9_]*`

### String (Free Text)

**OpenSCAD Source:**
```scad
label_text = "Hello";  // Text to engrave
```

**Schema Representation:**
```json
{
  "label_text": {
    "type": "string",
    "default": "Hello",
    "description": "Text to engrave",
    "x-forge-group": "Text",
    "x-forge-order": 0
  }
}
```

**UI Rendering:**
- Text input field
- Optional maxLength constraint if detected

---

## Groups

Groups organize parameters into collapsible sections in the UI.

### Group Definition

**OpenSCAD Source:**
```scad
/*[Dimensions]*/
width = 50;  // [10:100]
height = 30; // [10:80]

/*[Options]*/
hollow = true;
```

**Schema Representation (x-forge-groups):**
```json
{
  "x-forge-groups": [
    {
      "id": "dimensions",
      "label": "Dimensions",
      "order": 0,
      "collapsed": false
    },
    {
      "id": "options",
      "label": "Options",
      "order": 1,
      "collapsed": false
    },
    {
      "id": "hidden",
      "label": "Hidden",
      "order": 99,
      "hidden": true
    }
  ]
}
```

### Hidden Group

Parameters in `/*[Hidden]*/` are internal constants and should not appear in the UI.

**Schema Representation:**
```json
{
  "$fn": {
    "type": "integer",
    "default": 100,
    "x-forge-group": "hidden",
    "x-forge-hidden": true
  }
}
```

---

## Conditional Visibility (x-forge-depends)

Some parameters should only be visible when other parameters have specific values.

**OpenSCAD Source (with comment hint):**
```scad
utensil_handle_type = "circular";  // [rectangular, circular]
// Only for circular handles:
add_split_in_side = "no";  // [yes, no]
```

**Schema Representation:**
```json
{
  "add_split_in_side": {
    "type": "string",
    "default": "no",
    "enum": ["yes", "no"],
    "x-forge-depends": {
      "utensil_handle_type": "circular"
    }
  }
}
```

**UI Behavior:**
- Parameter hidden when condition is false
- Value preserved (not reset) when hidden

### Complex Dependencies

```json
{
  "x-forge-depends": {
    "$and": [
      { "utensil_handle_type": "circular" },
      { "different_sized_openings": "yes" }
    ]
  }
}
```

---

## Help Text and Descriptions

### Inline Comment (description)

```scad
width = 50;  // [10:100] Width of the base plate
```

→ `"description": "Width of the base plate"`

### Preceding Comment (x-forge-help)

```scad
// This is a longer explanation that appears
// before the parameter definition
width = 50;  // [10:100]
```

→ `"x-forge-help": "This is a longer explanation that appears before the parameter definition"`

### UI Rendering

- `description` → Inline label or tooltip
- `x-forge-help` → Expandable help section or info icon

---

## Units (x-forge-unit)

**OpenSCAD Source:**
```scad
width = 50;  // [10:100] in mm
angle = 45;  // [0:90] degrees
```

**Schema Representation:**
```json
{
  "width": {
    "type": "number",
    "default": 50,
    "x-forge-unit": "mm"
  },
  "angle": {
    "type": "number",
    "default": 45,
    "x-forge-unit": "deg"
  }
}
```

**Standard Units:**
- `mm` (millimeters)
- `cm` (centimeters)
- `in` (inches)
- `deg` (degrees)
- `rad` (radians)
- `%` (percentage)

---

## Complete Example

Based on `universal_cuff_utensil_holder.scad`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "universal-cuff-params.schema.json",
  "title": "Universal Cuff Utensil/Tool Holder",
  "description": "Customizable assistive device for holding utensils and tools",
  "type": "object",
  "x-forge-version": "1.0.0",
  "x-forge-source": {
    "type": "openscad",
    "file": "universal_cuff_utensil_holder.scad",
    "license": "CC0-1.0",
    "author": "Volksswitch",
    "extractedAt": "2026-01-12T18:00:00Z"
  },
  "x-forge-groups": [
    { "id": "part-to-print", "label": "Part to Print", "order": 0 },
    { "id": "palm-loop-info", "label": "Palm Loop Info", "order": 1 },
    { "id": "circular-loop-info", "label": "Circular Loop Info", "order": 2 },
    { "id": "utensil-mount-info", "label": "Utensil Mount Info", "order": 3 },
    { "id": "utensil-holder-info", "label": "Utensil Holder Info", "order": 4 },
    { "id": "thumb-rest-info", "label": "Thumb Rest/Loop Info", "order": 5 },
    { "id": "tool-interface-info", "label": "Tool Interface Info", "order": 6 },
    { "id": "tool-cup-info", "label": "Tool Cup Info", "order": 7 },
    { "id": "tool-saddle-info", "label": "Tool Saddle Info", "order": 8 },
    { "id": "circular-grip-info", "label": "Circular Grip Info", "order": 9 },
    { "id": "hidden", "label": "Hidden", "order": 99, "hidden": true }
  ],
  "properties": {
    "part": {
      "type": "string",
      "default": "palm loop",
      "enum": [
        "palm loop",
        "circular loop",
        "utensil holder",
        "thumb loop",
        "circular grip",
        "tool interface",
        "tool cup",
        "tool saddle",
        "rotating tool interface"
      ],
      "x-forge-group": "part-to-print",
      "x-forge-order": 0
    },
    "palm_loop_height": {
      "type": "integer",
      "default": 30,
      "minimum": 15,
      "maximum": 75,
      "x-forge-group": "palm-loop-info",
      "x-forge-order": 0,
      "x-forge-unit": "mm"
    },
    "palm_loop_length": {
      "type": "integer",
      "default": 80,
      "minimum": 45,
      "maximum": 125,
      "x-forge-group": "palm-loop-info",
      "x-forge-order": 1,
      "x-forge-unit": "mm"
    },
    "palm_loop_width": {
      "type": "integer",
      "default": 8,
      "minimum": 7,
      "maximum": 60,
      "x-forge-group": "palm-loop-info",
      "x-forge-order": 2,
      "x-forge-unit": "mm"
    },
    "include_lower_utensil_mount": {
      "type": "string",
      "default": "yes",
      "enum": ["yes", "no"],
      "description": "cannot be used with lower tool mount",
      "x-forge-group": "palm-loop-info",
      "x-forge-order": 3,
      "x-forge-render-as": "toggle"
    },
    "$fn": {
      "type": "integer",
      "default": 100,
      "x-forge-group": "hidden",
      "x-forge-hidden": true
    },
    "fudge": {
      "type": "number",
      "default": 0.005,
      "x-forge-group": "hidden",
      "x-forge-hidden": true
    }
  }
}
```

---

## Validation Rules

### Schema Validation (JSON Schema)

- All parameter values must pass JSON Schema validation
- Types must match (integer vs number vs string vs boolean)
- Enum values must be in allowed list
- Numeric values must be within min/max bounds

### Extraction Validation

When extracting from OpenSCAD:

1. **All `/*[Group]*/` sections must be captured**
2. **All parameters with hints must have correct type inference**
3. **Default values must match OpenSCAD defaults exactly**
4. **Order must match source file order**

### Parity Validation

When comparing OpenSCAD ↔ Web:

| Check | Tolerance | Auto-fixable |
|-------|-----------|--------------|
| Parameter names | Exact match | ❌ |
| Parameter types | Exact match | ❌ |
| Default values | Exact match | ✅ |
| Min/max ranges | Exact match | ✅ |
| Enum values | Exact match | ✅ |
| Group assignment | Exact match | ✅ |
| Display order | Exact match | ✅ |
| Help text | Fuzzy match | ⚠️ |

---

## File Naming Conventions

| File | Purpose |
|------|---------|
| `params.schema.json` | Parameter schema (main artifact) |
| `params.defaults.json` | Default values only (for quick reset) |
| `params.presets.json` | Named parameter presets |

---

## Changelog

### 1.0.0-draft (2026-01-12)
- Initial draft specification
- Based on OpenSCAD Customizer syntax
- Custom extensions for UI metadata
