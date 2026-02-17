# Getting Started

This guide walks you through your first session with OpenSCAD Assistive Forge -- from opening a model to exporting a file for 3D printing.

## What this app does

You pick a parametric 3D model (a `.scad` file), adjust its dimensions with sliders and dropdowns, preview the result, and download a file ready for printing or laser cutting. Everything happens in your browser -- nothing to install, nothing uploaded anywhere.

A few things that matter:

- Works with keyboard, mouse, touch, and screen readers
- Keeps all your data on your own computer
- Exports STL, OBJ, 3MF, and more

## Opening Your First Design

### Option 1: Load an Example

1. Open the app at your hosted URL
2. Look for the **Welcome Panel** in the center of the screen
3. Click **"Load Example"** to see available sample models
4. Select any example to load it

The example loads with default settings. You'll see a 3D preview on the right (or below on mobile).

### Option 2: Upload Your Own File

1. Click **"Open File"** in the header toolbar
2. Select a `.scad` file from your computer
3. Wait for the model to load (a few seconds)

If the file uses `include` or `use` statements for other files, upload a `.zip` containing all files together.

## Understanding the Interface

### Parameters Panel (Left Side)

This panel contains all adjustable settings for the current model. Each parameter has:

- **Name**: What the setting controls (e.g., "Width", "Height")
- **Control**: Slider, dropdown, checkbox, or text input
- **Help** (?): Click for more information about the parameter

Parameters are often grouped into sections like "Dimensions" or "Features". Click a section header to expand or collapse it.

### Preview Panel (Right Side)

The 3D preview shows what your model looks like with current settings. You can:

- **Rotate**: Click and drag, or use arrow keys
- **Zoom**: Scroll wheel, or use + / - keys
- **Pan**: Shift + drag, or Shift + arrow keys
- **Reset View**: Press Home key or use reset button

### Status Bar (Bottom)

Shows render progress and model statistics like file size and vertex count.

## Making Your First Change

Let's customize a simple parameter:

1. **Find a size parameter** like "Width" or "Height" in the Parameters panel
2. **Adjust the slider** by dragging it, clicking the track, or using arrow keys when focused
3. **Watch the preview update** after you release the slider

The preview regenerates automatically when you change a value. Complex models may take a few seconds.

### Tips for Beginners

- **Start small**: Change one parameter at a time
- **Use Undo**: Press `Ctrl+Z` (or `Cmd+Z` on Mac) to reverse changes
- **Reset a parameter**: Click the reset button (↺) next to any parameter
- **Reset all**: Use the "Reset All" button to return to defaults

## Exporting Your Design

When you're happy with your customization:

1. Click **"Export"** in the header toolbar
2. Choose your format:
   - **STL**: Standard format for 3D printing
   - **OBJ**: Includes vertex colors, works with most software
   - **3MF**: Modern format with better metadata
3. Click the format button to download the file

The export takes a few seconds for complex models. Your browser downloads the file automatically.

## Saving Your Work

### Save as Preset

To save your parameter values for later:

1. Click **"Save Preset"** in the Parameters panel
2. Enter a descriptive name (e.g., "Blue box 50mm wide")
3. Click **Save**

Load saved presets from the **Presets** dropdown in the Parameters panel.

### Save Project

To save the entire project (code + parameters):

1. Click **"Save Project"** in the header
2. Choose a filename
3. The `.json` file downloads to your computer

Load saved projects using **Open File** and selecting the `.json` file.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |
| Focus search | `Ctrl+F` |
| Reset view | `Home` |
| Rotate preview | Arrow keys |
| Zoom | `+` / `-` |
| Pan | `Shift + Arrow keys` |

## Reference tools

The preview settings area has two tools for working with reference images:

- **Image Measurement** -- load any image and read pixel coordinates from it. Handy when a model needs measurements from screenshots or reference drawings. Details in the [Standard Mode Guide](./STANDARD_MODE_GUIDE.md#image-measurement).
- **Reference Overlay** -- display an image behind the 3D model so you can compare alignment visually. Details in the [Standard Mode Guide](./STANDARD_MODE_GUIDE.md#reference-overlay).

## Next Steps

- **Explore examples**: Try different example models to see parameter types
- **Read the Accessibility Guide**: Learn about keyboard navigation and screen reader support
- **Check Troubleshooting**: Solutions for common issues

## Getting Help

- **Parameter help**: Click the ? button next to any parameter
- **Error messages**: Read carefully—they explain what went wrong
- **GitHub Issues**: Report bugs or request features

---

**Related Guides:**

- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) - Detailed accessibility information
- [Keyguard Workflow](./KEYGUARD_WORKFLOW_GUIDE.md) - AAC keyguard customization
- [Troubleshooting](../TROUBLESHOOTING.md) - Common issues and solutions
