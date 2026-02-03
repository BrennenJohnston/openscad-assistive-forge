# Expert Mode Guide

Expert Mode provides a code editor for directly editing OpenSCAD source files. This guide covers everything you need to work with code in OpenSCAD Assistive Forge.

## What You'll Learn

- How to switch between Standard and Expert modes
- How to use the code editor
- How to write customizer-compatible code
- How to debug syntax errors

---

## When to Use Expert Mode

Use Expert Mode when you need to:

- Edit OpenSCAD code directly
- Add new parameters or features
- Fix syntax errors in the source
- Work with code not designed for the Customizer
- Fine-tune model logic

Standard Mode is better for:

- Quick parameter adjustments
- Non-programmers customizing existing models
- Touch/mobile devices

---

## Switching Modes

### Enter Expert Mode

- Click the **"Expert Mode"** toggle button in the header
- Or press `Ctrl+E` (keyboard shortcut)

### Exit Expert Mode

- Click the **"Standard Mode"** toggle button
- Or press `Ctrl+E` again

### What Happens on Switch

When you switch modes:

1. Your code changes are preserved
2. Cursor position is maintained
3. Parameters sync in both directions
4. Unsaved changes indicator shows if you have edits

---

## The Code Editor

### Editor Types

OpenSCAD Assistive Forge offers two editor options:

| Editor | Best For | Features |
|--------|----------|----------|
| **Monaco** | Most users | VS Code-like experience, autocomplete hints |
| **Textarea** | Screen reader users | Full accessibility, native browser behavior |

The app automatically selects the best editor based on your preferences and accessibility settings.

### Switching Editors

If you prefer a specific editor:

1. Open **Settings** (gear icon)
2. Find **Editor Preference**
3. Choose "Monaco", "Textarea", or "Auto"

### Monaco Editor Features

- Syntax highlighting for OpenSCAD
- Line numbers
- Error underlining
- Code folding (collapse sections)
- Find and replace (`Ctrl+F`, `Ctrl+H`)
- Multiple cursors (`Alt+Click`)

### Textarea Editor Features

- Full screen reader support
- Native browser find (`Ctrl+F`)
- Native undo/redo
- Syntax highlighting via overlays
- High contrast mode support

---

## Keyboard Shortcuts

### Navigation

| Action | Shortcut |
|--------|----------|
| Go to line | `Ctrl+G` |
| Find | `Ctrl+F` |
| Replace | `Ctrl+H` |
| Go to start | `Ctrl+Home` |
| Go to end | `Ctrl+End` |

### Editing

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |
| Cut line | `Ctrl+X` (no selection) |
| Copy line | `Ctrl+C` (no selection) |
| Delete line | `Ctrl+Shift+K` |
| Duplicate line | `Ctrl+Shift+D` |
| Move line up | `Alt+Up` |
| Move line down | `Alt+Down` |

### Preview

| Action | Shortcut |
|--------|----------|
| Render preview | `Ctrl+Enter` |
| Toggle mode | `Ctrl+E` |
| Save code | `Ctrl+S` |

---

## OpenSCAD Basics

### Variables and Parameters

Variables become customizer parameters when annotated:

```openscad
// Basic variable (not shown in customizer)
internal_value = 10;

// Customizer parameter (shown in UI)
width = 50; // [10:100]
```

### Customizer Annotations

Add comments after variables to control their UI:

```openscad
// Slider with range
width = 50; // [10:100]

// Slider with step
height = 25; // [10:5:100]

// Dropdown
shape = "cube"; // [cube, sphere, cylinder]

// Checkbox
show_holes = true; // [true, false]
```

### Parameter Groups

Organize parameters into sections:

```openscad
/* [Dimensions] */
width = 50;  // [10:100]
height = 30; // [10:100]

/* [Features] */
show_holes = true;
hole_count = 4; // [1:10]

/* [Hidden] */
internal_value = 10; // Not shown in UI
```

### Common Annotations

| Syntax | Result |
|--------|--------|
| `// [10:100]` | Slider from 10 to 100 |
| `// [10:5:100]` | Slider with step of 5 |
| `// [a, b, c]` | Dropdown with options |
| `// [true, false]` | Checkbox |
| `// [10:0.1:100]` | Slider with decimal step |

---

## Vector Parameters

Vectors define multi-dimensional values:

```openscad
// 3D size vector
size = [50, 30, 20]; // Width, Depth, Height

// 2D position
offset = [10, 5];

// Color (RGBA)
color = [1, 0.5, 0, 1]; // Orange, full opacity
```

### Vector Ranges

You can add ranges to vector components:

```openscad
// Each component gets its range
size = [50, 30, 20]; // [[10:100], [10:100], [10:50]]
```

---

## Working with Code

### Adding New Parameters

1. Declare a variable at the top of your file
2. Add a comment with range/options
3. Use the variable in your geometry

**Example:**

```openscad
/* [Dimensions] */
box_size = 50; // [10:200] Size of the box in mm

cube([box_size, box_size, box_size]);
```

### Using Modules

Modules are reusable code blocks:

```openscad
module rounded_box(size, radius) {
    minkowski() {
        cube([size.x - radius*2, size.y - radius*2, size.z - radius*2]);
        sphere(r=radius);
    }
}

// Use the module
rounded_box([50, 30, 20], 3);
```

### Conditional Features

Use `if` statements for toggleable features:

```openscad
/* [Features] */
show_handle = true;
show_lid = false;

difference() {
    base_box();
    if (show_handle) handle_cutout();
}

if (show_lid) lid();
```

---

## Debugging Errors

### Reading Error Messages

Errors appear in:

1. Red banner at the top
2. Line highlighting in the editor
3. Console output (if expanded)

**Example error:**

```
ERROR: Parser error in line 15: syntax error
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "syntax error" | Typo, missing semicolon | Check the line indicated |
| "Undefined variable" | Variable not declared | Add variable or fix spelling |
| "Unknown module" | Module not defined | Define module or check include |
| "CGAL error" | Geometry problem | Simplify or fix model |

### Error Line Highlighting

The editor highlights error lines:

- Red background or underline
- Click the error to jump to that line
- Fix the error and re-render

---

## Code Synchronization

### How Sync Works

Standard Mode and Expert Mode share the same code:

1. Edit a parameter in Standard Mode → Code updates
2. Edit code in Expert Mode → Parameters update (if parseable)

### Sync Limitations

Some code changes break sync:

- Changing variable names
- Using expressions as default values
- Complex computed parameters

When sync fails, you'll see parameters marked as "raw" (text input instead of slider).

### Manual Sync

If parameters seem out of sync:

1. Save your code (`Ctrl+S`)
2. Switch to Standard Mode
3. Parameters reload from current code

---

## Performance Tips

### Resolution Variables

Control render detail with `$fn`, `$fa`, `$fs`:

```openscad
// Global resolution (affects all curved surfaces)
$fn = 32; // [12:64] Number of fragments

// Or per-object
sphere(r=10, $fn=64);
```

Higher values = smoother curves but slower renders.

### Draft Mode

For quick iteration, use lower resolution:

```openscad
// Development: fast
$fn = 12;

// Production: smooth
// $fn = 64;
```

### Optimization Hints

1. Use `$fn` around 24-32 for previews
2. Increase to 64+ only for final export
3. Avoid deeply nested `difference()` operations
4. Cache sub-modules with `render()`

---

## Advanced Features

### Include and Use

For multi-file projects:

```openscad
// Include runs the file (defines + executes)
include <library/utils.scad>

// Use only imports modules (no execution)
use <library/shapes.scad>
```

### Libraries

OpenSCAD has built-in libraries:

```openscad
use <MCAD/boxes.scad>
use <BOSL2/std.scad>
```

Note: Library availability depends on the WASM build.

### Special Variables

| Variable | Purpose |
|----------|---------|
| `$fn` | Number of fragments for curves |
| `$fa` | Minimum angle for fragments |
| `$fs` | Minimum size for fragments |
| `$t` | Animation time (0-1) |
| `$vpr` | Viewport rotation |
| `$vpd` | Viewport distance |

---

## Accessibility in Expert Mode

### Screen Reader Support

The textarea editor provides full screen reader support:

- Line-by-line reading
- Character navigation
- Announces error locations
- Works with all major screen readers

### High Contrast

Both editors support high contrast mode:

- Toggle via HC button
- Syntax colors adjust automatically
- Error highlighting remains visible

### Keyboard Navigation

Expert Mode is fully keyboard accessible:

- Tab to enter/exit editor
- All shortcuts work without mouse
- Focus management on mode switch

---

## Troubleshooting Expert Mode

### Code Not Rendering

1. Check for syntax errors (red highlighting)
2. Click "Render" manually
3. Check console for error details

### Parameters Not Showing

Ensure your annotations are correct:

```openscad
// Correct
width = 50; // [10:100]

// Wrong (space before bracket)
width = 50; //[10:100]

// Wrong (wrong brackets)
width = 50; // (10:100)
```

### Editor Not Loading

If Monaco fails to load:

1. Check your internet connection (Monaco loads from CDN)
2. Try the textarea editor (Settings → Editor → Textarea)
3. Disable browser extensions that block scripts

---

**Related Guides:**

- [Standard Mode Guide](./STANDARD_MODE_GUIDE.md) - Parameter-based customization
- [Getting Started](./GETTING_STARTED.md) - First-time user introduction
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) - Keyboard and screen reader use
- [OpenSCAD Documentation](https://openscad.org/documentation.html) - Full language reference
