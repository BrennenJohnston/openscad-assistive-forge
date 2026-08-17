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

### Viewing Preferences and the Classic Interface

Switching between the Forge interface and Classic keeps your code,
parameter values, and camera position, but each interface remembers its
own viewing preferences: grid, axes and tick markings, edges,
measurements, status bar, model color and appearance, auto-rotate, and
Classic's color scheme. A view setting you change in one interface stays
in that interface. Editor settings such as font size are shared, because
both interfaces use the same editor.

---

## The Code Editor

### Which editor you get

There are two, and the app picks for you. There is no setting to choose
between them.

| Editor | When you get it | What it gives you |
|--------|-----------------|-------------------|
| **CodeMirror 6** | Normally | Syntax colouring, line numbers, code folding, bracket matching, find and replace, bookmarks, wrapped-line markers |
| **Plain text editor** | When your operating system asks for increased contrast | A real `<textarea>`: your browser's own text handling, its own find, its own undo, plus line numbers and a lightweight colour overlay |

The switch happens at startup and follows your system's "increase contrast"
setting (`prefers-contrast: more` in browser terms). If you turn that on in
Windows, macOS or your Linux desktop, you get the plain text editor, because a
plain `<textarea>` is the most predictable thing to hand to a screen reader or a
magnifier. If you leave it off, you get CodeMirror.

Everything else in this guide -- writing parameters, annotations, debugging --
works the same in both.

### CodeMirror features

- Syntax colouring using the OpenSCAD desktop application's own colour scheme
- Line numbers
- Code folding, with plus and minus boxes in the gutter like the desktop
- Bracket matching (Preferences ▸ Editor)
- Find and replace
- Bookmarks (Edit menu)
- Markers showing where a long line wraps and continues (Preferences ▸ Editor)

### Plain text editor features

- A real `<textarea>`, so your screen reader treats it as ordinary editable text
- Your browser's own find and its own undo and redo
- Line numbers and a status bar
- A colour overlay behind the text, marked `aria-hidden` so it never reaches
  assistive technology

---

## Keyboard Shortcuts

These are the CodeMirror editor's keys, checked against the version the app
ships. On a Mac, read `Ctrl` as `Cmd`.

### Navigation

| Action | Shortcut |
|--------|----------|
| Find | `Ctrl+F` |
| Find next | `Ctrl+G` or `F3` |
| Find previous | `Ctrl+Shift+G` or `Shift+F3` |
| Go to line | `Ctrl+Alt+G` |
| Go to start | `Ctrl+Home` |
| Go to end | `Ctrl+End` |

Replace lives inside the find panel: press `Ctrl+F`, then use the replace field
that opens with it. There is no separate shortcut for it.

### Editing

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` (`Cmd+Shift+Z` on Mac, `Ctrl+Shift+Z` on Linux) |
| Delete line | `Ctrl+Shift+K` |
| Copy line downwards | `Shift+Alt+Down` |
| Move line up | `Alt+Up` |
| Move line down | `Alt+Down` |
| Comment or uncomment | `Ctrl+/` |

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

The plain text editor is an ordinary `<textarea>`, so your screen reader reads
it the way it reads any editable text box: line by line, character by character,
with your usual review keys. Its colour overlay is marked `aria-hidden`, so it
never adds noise.

Turning on your system's "increase contrast" setting is what gives you that
editor. There is no in-app control that swaps them.

> Not yet confirmed by ear. The behaviour above is what the code does; nobody
> has yet sat down with NVDA, JAWS or VoiceOver and worked through Expert Mode.
> If you do, please tell us what you find.

### High Contrast

- The **HC** button in the header switches the app to its high-contrast theme.
  That is an in-app theme change and it does **not** swap the editor.
- Your **system's** increase-contrast setting is what swaps the editor to the
  plain text one, at startup.
- Windows High Contrast (forced colors) is respected in both editors.
- In the Classic interface the editor keeps the desktop application's light
  appearance; dark and high-contrast themes apply in the Assistive Forge
  interface only.

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

Check the annotation is on the same line as the variable, and that the range or
option list is in **square** brackets:

```openscad
// Works
width = 50; // [10:100]

// Also works -- the space after the slashes is optional
width = 50; //[10:100]

// Does not work -- round brackets are not an annotation
width = 50; // (10:100)

// Does not work -- the annotation must be on the assignment line
// [10:100]
width = 50;
```

Two other reasons parameters go missing:

- Anything under a `/* [Hidden] */` group heading is deliberately not shown.
- A variable whose value is an expression rather than a plain literal, such as
  `width = base * 2;`, is not offered as a control. OpenSCAD's own Customizer
  behaves the same way.

### Editor Not Loading

The editor is part of the app and is not fetched from anywhere, so a network
problem cannot stop it appearing. If the editor area is blank:

1. Reload the page
2. Check the browser console (`F12`) for an error and include it if you report
   the problem
3. If you have your system's "increase contrast" setting on, you are meant to
   see the plain text editor rather than the coloured one -- that is the design,
   not a fault

---

**Related Guides:**

- [Standard Mode Guide](./STANDARD_MODE_GUIDE.md) - Parameter-based customization
- [Getting Started](./GETTING_STARTED.md) - First-time user introduction
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) - Keyboard and screen reader use
- [OpenSCAD Documentation](https://openscad.org/documentation.html) - Full language reference
