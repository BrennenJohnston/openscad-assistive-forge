# Standard Mode Guide

Standard Mode is the default interface. This guide covers everything you can do here: parameter types, presets, exports, image measurement, and the reference overlay.

---

## Parameter Types

### Sliders (Numeric Parameters)

Sliders control numeric values like dimensions, counts, and percentages.

**How to adjust:**
- Drag the slider handle
- Click anywhere on the slider track
- Use arrow keys when focused (fine control)
- Type a value in the number input (if shown)

**Keyboard controls:**
- `Left/Down Arrow`: Decrease by step
- `Right/Up Arrow`: Increase by step
- `Page Down`: Decrease by 10 steps
- `Page Up`: Increase by 10 steps
- `Home`: Set to minimum
- `End`: Set to maximum

### Dropdowns (Selection Parameters)

Dropdowns let you choose from predefined options.

**How to use:**
1. Click the dropdown to open the list
2. Click an option to select it
3. Or use keyboard: `Up/Down` to navigate, `Enter` to select

### Checkboxes (Boolean Parameters)

Checkboxes toggle features on or off.

**How to use:**
- Click to toggle
- Or press `Space` when focused

### Text Inputs

Text inputs accept custom strings (labels, names, etc.).

**How to use:**
1. Click the input field
2. Type your text
3. Press `Tab` or `Enter` to apply

### Vector Parameters

Vector parameters control multiple related values (like X, Y, Z coordinates).

**How to use:**
- Adjust each component individually
- Tab between components
- Arrow keys adjust the focused component

**Example:** A "Size" vector might have Width (X), Depth (Y), and Height (Z) inputs.

---

## Working with Parameters

### Parameter Groups

Models with many parameters organize them into collapsible groups:

- Click a group header to expand/collapse
- Groups help you focus on related settings
- Some models have "Basic" and "Advanced" groups

### Parameter Help

Most parameters include help text:

1. Click the **?** button next to a parameter
2. Read the tooltip that appears
3. Press `Escape` or click elsewhere to close

### Resetting Parameters

**Reset one parameter:**
- Click the **↺** button next to the parameter

**Reset all parameters:**
- Click **"Reset All"** in the Parameters panel header
- Confirms before resetting

### Undo and Redo

Every parameter change is tracked:

- **Undo**: `Ctrl+Z` (or `Cmd+Z` on Mac)
- **Redo**: `Ctrl+Shift+Z` (or `Cmd+Shift+Z`)

Undo history includes the last 50 changes.

---

## Preview Controls

### Camera Movement

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Rotate | Click + drag | Arrow keys |
| Zoom | Scroll wheel | `+` / `-` |
| Pan | Shift + drag | `Shift + Arrow` |
| Reset | Double-click | `Home` |

### Auto-Rotate

Auto-rotate slowly spins the model for presentation:

1. Click the **Auto-rotate** button (circular arrow icon)
2. Adjust speed with the **Auto-rotate speed** slider next to it in the
   Camera panel
3. Click again to stop

**Note:** Auto-rotate is disabled if you have "Reduce Motion" enabled in your system settings.

### Preview Quality

Quality affects render detail and speed:

| Quality | Best For | Render Time |
|---------|----------|-------------|
| Draft | Quick iteration | Fastest |
| Normal | General use | Balanced |
| High | Final review | Slower |

Change quality in the **Preview Settings** panel.

### Model Colors

Preview colors can be customized:

1. Open **Preview Settings**
2. Find **Model Color** picker
3. Choose a color
4. Note: This is preview only; exported models use their defined colors

### Your View Settings Are Per Interface

The Assistive Forge and Classic interfaces each remember their own viewing
preferences: grid on and off and its size and color, axes and tick
markings, edges, measurements, the status bar, model color and appearance,
auto-rotate, and Classic's color scheme. Changing one of these in Classic
never changes it in the Forge interface, and switching interfaces brings
back each side's own saved look. Your code, parameter values, and camera
position stay the same across both interfaces, so you always see the same
object in the same pose. In Classic, the grid is controlled from
**Preferences ▸ 3D View**.

---

## Presets

Presets save your parameter values for reuse.

### Saving a Preset

1. Adjust parameters to your desired values
2. Click **"Save Preset"** in the Parameters panel
3. Enter a descriptive name
4. Click **Save**

### Loading a Preset

1. Click the **Presets** dropdown
2. Select a saved preset
3. Parameters update immediately

### Managing Presets

- **Rename**: Load preset, save with new name, delete old
- **Delete**: Click the trash icon next to the preset name
- **Export**: Use "View Params JSON" to copy values

### Sharing Presets

To share a preset with someone else:

1. Click **Advanced** → **"View Params JSON"**
2. Copy the JSON text
3. Share via email, document, or message

To import a shared preset:

1. Click **Advanced** → **"Apply Params JSON"**
2. Paste the JSON text
3. Click **Apply**

---

## Projects

Projects save everything: code, parameters, and metadata.

### Saving a Project

1. Click **"Save Project"** in the header toolbar
2. Enter a project name
3. The project is saved to your browser's storage (IndexedDB)

### Loading a Project

1. Open the **Saved Projects** panel
2. Select a project from your saved list
3. Everything restores: code, parameters, and settings

### Exporting and Importing Projects

To move a project to another device, export it as a ZIP from the Saved Projects panel. To import, upload the ZIP using **Open File**.

### Project vs Preset

| Feature | Preset | Project |
|---------|--------|---------|
| Saves parameters | Yes | Yes |
| Saves code | No | Yes |
| Portable | Via JSON export | ZIP export from Saved Projects |
| Use case | Same model, different settings | Complete backup |

---

## Exporting

### Available Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| **STL** | `.stl` | 3D printing (most common) |
| **OBJ** | `.obj` | Software with color support |
| **3MF** | `.3mf` | Not available in this browser build — use STL or OBJ, which slicers accept |
| **OFF** | `.off` | Academic/research |
| **AMF** | `.amf` | Multi-material printing |
| **SVG** | `.svg` | Laser cutting (2D only) |
| **DXF** | `.dxf` | CNC/laser cutting (2D only) |

### Export Process

1. Click **"Export"** in the header toolbar
2. Click the format button (e.g., "STL")
3. Wait for processing (may take seconds for complex models)
4. File downloads automatically

### Export Quality

Export quality is chosen from the **File** menu, under **Export Quality**: Model default, Low (fast), Medium (balanced), or High (smooth). It starts at Model default each session and is independent of the preview quality setting. Preview quality never affects exported files.

### 2D Export (SVG/DXF)

For models designed for laser cutting:

1. Ensure the model produces 2D output
2. Click **Export** → **SVG** or **DXF**
3. Open in vector software (Inkscape, Illustrator) or send to laser cutter

---

## Working with Files

### Supported File Types

| Type | Description |
|------|-------------|
| `.scad` | OpenSCAD source file |
| `.zip` | Multiple files (for `include`/`use`) |
| `.json` | Saved project or preset |

### Multi-File Projects

If your model uses `include` or `use` statements:

1. Create a `.zip` containing all `.scad` files
2. Maintain the folder structure referenced in the code
3. Upload the `.zip` file

### File Size Limits

| What you open | Limit |
|---|---|
| A single `.scad` file | 5 MB |
| A `.zip` project | 250 MB |
| An STL you are only viewing | 250 MB |
| A folder | 2,000 files and 500 MB |

Opening a folder warns you above 200 files or 150 MB. That is a warning, not a
refusal -- large projects simply render more slowly, because every file the
model depends on has to be handed to the OpenSCAD engine before it can start.

### SVG Preparation

When you upload an SVG file (or select one from the gallery), the app analyzes it to determine whether it needs preparation for OpenSCAD. OpenSCAD imports SVG as 2D geometry, so multi-element SVGs need to be combined into a single compound path using boolean operations (union for foreground shapes, difference for holes).

**What happens automatically:**

1. The SVG is analyzed for complexity (number of elements, fills, strokes, transforms)
2. A status badge appears next to the file input:
   - **SVG Ready** (green): Single-element SVG or successfully auto-prepared
   - **Needs review** (amber): Multiple elements detected — the editor opens for you to review
   - **Unsupported features** (red): Gradients, clip-paths, or other features that cannot be flattened
3. Simple SVGs are auto-prepared silently. Complex or ambiguous SVGs open the preparation editor

**The SVG Preparation Editor:**

The editor shows a side-by-side view of your source SVG and the prepared result. Below the previews, an object list shows each detected shape with its assigned role:

- **Foreground**: Becomes solid geometry in the final shape
- **Hole**: Subtracted from the foreground (creates cutouts)
- **Ignore**: Dropped from the output entirely

Every role change updates the prepared result preview in real time, so you can see exactly what your changes do before applying.

**Editor controls:**

| Action | How |
|--------|-----|
| Change a role | Click a radio button or use arrow keys in the radio group |
| See the effect | The prepared result updates instantly |
| Apply changes | Click "Apply prepared SVG" |
| Keep the original | Click "Keep original" (bypasses preparation) |
| Reset roles | Click "Reset" to return to auto-classification |
| Expand to fullscreen | Click the fullscreen button (top-right) |
| Exit fullscreen | Press `Escape` or click the fullscreen button again |
| Close the editor | Press `Escape` or click the close button |

**Warnings:**

The editor surfaces warnings for unsupported features. For example, stroked paths (paths with only a `stroke` and no `fill`) cannot participate in boolean operations and are flagged with a warning badge. These elements are automatically set to "Ignore."

Your role assignments and prepared output are saved with the project, so reopening a saved project restores exactly where you left off.

---

## Image Measurement

Some models need pixel-based measurements -- for example, coordinates from a screenshot of a tablet app. The Image Measurement tool lets you load any image, move a crosshair around, and read X/Y pixel coordinates.

### How to use it

1. Open the **Image Measurement** panel in the preview settings area
2. Click **Browse** or drag an image onto the canvas (PNG, JPG, WebP, or GIF)
3. Move the mouse over the image to see coordinates update live, or focus the canvas and use arrow keys (1 px per press, Shift for 10 px steps)
4. Click **Copy X** or **Copy Y** to grab a value -- if a parameter input is focused, the value gets pasted in automatically

The image dimensions show up next to the Browse button so you can verify the file wasn't resized.

**Keyboard shortcut**: Press Enter while the canvas is focused to copy the Y coordinate. Scroll to zoom. Shift+drag to pan.

---

## Reference Image

Want to see how your model lines up against a reference image? The Reference Image puts any image behind the 3D model in the preview so you can compare visually.

### Setting it up

1. Open the **Reference Image** panel in the preview settings area
2. Pick an image from your project files, or upload one
3. Toggle **Show overlay** on
4. Enter the overlay's real-world width and height in mm

### Fine-tuning

- **Opacity slider** -- make the image more or less transparent
- **Fit to model** -- auto-sizes the image to match the model's footprint
- **Center** -- snaps the image back to the origin
- **Offset / Rotation** -- nudge or rotate for a better fit

### A note on accessibility

The overlay is purely visual -- screen reader users won't perceive it. If you need non-visual verification, use the Image Measurement tool to check dimensions by the numbers instead.

---

## Memory and Performance

### Memory Warnings

Complex models use significant memory. The app warns you at different levels:

| Level | What Happens |
|-------|--------------|
| **Warning** | Yellow badge appears; consider simplifying |
| **High** | Yellow banner with suggestions |
| **Critical** | Red banner; auto-preview disabled; save your work |

### Reducing Memory Usage

1. **Lower quality setting**: Use Draft for iteration
2. **Reduce $fn**: If you can edit code, lower resolution values
3. **Simplify model**: Fewer features = less memory
4. **Close other tabs**: Free up browser memory

### Recovery Mode

If the app crashed previously:

1. The app detects the crash on reload
2. Recovery mode starts automatically
3. Auto-preview is disabled
4. Save your work before making changes

---

## Tips and Best Practices

### For Beginners

1. Start with example models to learn the interface
2. Change one parameter at a time
3. Use Undo liberally (`Ctrl+Z`)
4. Save presets before major changes

### For Iteration

1. Use Draft quality for quick previews
2. Switch to High quality before export
3. Save presets at milestones
4. Use descriptive preset names

### For Collaboration

1. Export presets as JSON for sharing
2. Document parameter choices in notes
3. Include model version info in preset names

---

## Troubleshooting

### Preview Not Updating

- Check if auto-preview is enabled (may be disabled after memory warning)
- Click the manual "Render" button
- Try reducing quality setting

### Export Failed

- Wait for render to complete first
- Check for model errors (red error messages)
- Try a different export format

### Model Looks Wrong

- Reset parameters to defaults
- Check for conflicting parameter values
- Review parameter help text for valid ranges

### Slow Performance

- Use Draft quality
- Close other browser tabs
- Try a different browser (Chrome often fastest)
- Reduce model complexity if possible

---

**Related Guides:**

- [Getting Started](./GETTING_STARTED.md) - First-time user introduction
- [Expert Mode Guide](./EXPERT_MODE_GUIDE.md) - Code editing interface
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) - Keyboard and screen reader use
- [Troubleshooting](./TROUBLESHOOTING_USER_GUIDE.md) - Common issues and solutions
