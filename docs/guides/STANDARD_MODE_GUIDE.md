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

For a drawing of fifty shapes or fewer, every role change updates the prepared
result preview straight away, so you can see exactly what your changes do before
applying.

**Bigger drawings: the preview waits to be asked**

Combining shapes into one outline is the expensive step, and it grows steeply:
about a second for fifty shapes, a minute for two hundred. So above fifty shapes
the list and the original are shown immediately, and the "Will print as" pane
stays empty with a **Render preview** button under it. Press it when you want to
see the result; Forge tells you it is working and how long it took. Apply and
Save wait until you have rendered, so you are never applying something you have
not seen.

Above a thousand shapes Forge says so and asks you to simplify the drawing
first, naming both numbers.

**Removing shapes you do not want**

"Ignore" leaves a shape in the list but out of the result. To take shapes out of
the *list* as well, which is what you want when there are hundreds of them:

| Action | How |
|--------|-----|
| Remove one shape | The **Delete** button at the end of its row |
| Remove every shape below a size | Type a size in **Smaller than … mm²** and press **Delete those** |
| Keep only the biggest ones | Type a number in **Keep largest …** and press **Delete the rest** |
| Put the last removal back | **Undo delete** (one step, and only for this session) |

Sizes are measured against the design width in the editor's header, so they are
the size the shape will really print. If removing shapes brings the drawing under
fifty, the preview starts updating on its own again.

Removals are remembered with the project, so reopening it later shows the list
you left behind rather than starting over.

**Editor controls:**

| Action | How |
|--------|-----|
| Change a role | Click a radio button or use arrow keys in the radio group |
| See the effect | The prepared result updates instantly, or after **Render preview** on a big drawing |
| Apply changes | Click "Apply prepared SVG" |
| Save it as a file | Click "Save edited SVG" |
| Keep the original | Click "Keep original" (bypasses preparation) |
| Reset roles | Click "Reset" to return to auto-classification (this does not bring deleted shapes back) |
| Expand to fullscreen | Click the fullscreen button (top-right) |
| Exit fullscreen | Press `Escape` or click the fullscreen button again |

**If the result looks like a solid blob:** the preparer merges everything set to
Foreground into one shape. When a drawing has an outline around its detail --
the outline of a bird with an eye and feather strokes inside it, say -- merging
them fills the outline in and swallows the detail. That is not a bug, it is what
"print this as one shape" means. Set the interior shapes to **Ignore**, or to
**Hole** if you want them cut out, and the result comes back.

### Opening and saving a DXF

The drawing editor takes `.dxf` as well as SVG and photos, and can give one
back. Forge's own OpenSCAD engine does the converting, so nothing is uploaded
and no extra software is needed. MEASURED on a 40 x 25 mm drawing: DXF in took
about 0.3 seconds, DXF out about the same.

Open a DXF the way you would open anything else, from the welcome screen's
**Edit a drawing or photo** line or **Edit Drawing** in the Actions drawer.
Forge says it is converting, then the editor opens on the drawing with each
shape listed. When you are done, **Save as DXF** sits beside **Save edited
SVG**; you can take either, or both.

**Forge tells you the size it saved.** A drawing that has been through the
editor is rebuilt from its shapes, and rebuilding is not perfectly exact:
MEASURED on that same 40 x 25 mm file, the saved DXF came back 40.3 by 25.35.
Small, and it matters if you are cutting to a fit, so the app says the
measurement out loud rather than leaving you to find it at the machine. If the
number has moved and that is a problem, take the SVG instead and convert it
with your own tool.

**What Forge cannot read from a DXF.** OpenSCAD's DXF import reads drawing
entities. Text, dimensions and other annotation entities are outside that, so a
file made only of those arrives empty. Forge says so plainly instead of handing
you a blank drawing. Export the drawing again with its outlines as geometry, or
send an SVG.

This is separate from **9a. Export for laser cutting** in the keyguard guide,
which is about exporting a MODEL you are customising. This section is about a
drawing you already have.

### Choosing what to keep from a photo

A photo is traced before it becomes a shape, and tracing has to decide what
counts as a line. Three answers, offered as **What to keep from the picture**
wherever a picture enters Forge:

| Choice | What it keeps | Best for |
|--------|---------------|----------|
| **Line art** (the default) | The drawn lines. The colour behind them is dropped. | Communication symbols, and any drawing on a coloured background |
| **Solid shape** | The outline of the whole picture, filled in. | Very small pieces, where detail could not be felt anyway |
| **Light and dark** | Whatever is darker than the background. What Forge did before. | A plain pencil drawing on white paper |

**Why Line art is the default.** Professional communication symbols are black
line work over a saturated fill, and the fill colour carries meaning. Judging by
brightness alone puts a blue field and the black drawing on top of it in the
same bucket, and they merge into one shape: MEASURED on a black person symbol
inside a blue square, the old tracing returned a plain blue square with the
person gone, and said nothing. Line art asks two questions instead of one - is
it dark, and is it close to grey - so black strokes survive and coloured fills
do not.

Both sliders can be moved, each with a number box beside it for setting an
exact value:

- **How dark counts as a line** - higher keeps more of the picture, lower keeps
  only the darkest strokes.
- **How colourful is still a line** - lower rejects coloured fills more firmly.
  Raise it if a coloured line is being dropped. It only applies to Line art.

After every change Forge says what happened: how many shapes it found, how much
of the picture became ink, and whether anything looked wrong - almost nothing
kept, or so much kept that the result will print as one block.

If the picture had a single colour behind its lines, Forge also names it, so you
can pick a filament near that colour and keep the symbol recognisable. It stays
quiet when the picture has several different fills, because an average of four
colours is a colour that is in none of them.

**Nothing is uploaded.** The tracing and every choice above happen in your
browser. You are responsible for having the right to use any image you bring.
If you need symbols you can share freely, [ARASAAC](https://arasaac.org/),
[Mulberry Symbols](https://mulberrysymbols.org/) and
[Blissymbolics](https://blissymbolics.org/) publish openly licensed sets; check
each set's own licence before you share what you make.

### Editing a drawing with no design open

You do not need an OpenSCAD project to use the editor. Two doors open it on a
file of its own:

- the **Edit a drawing or photo** line inside **Explore Features &
  Accessibility** on the welcome screen, and
- **Edit Drawing** in the Actions drawer, once a design is open.

Both accept an SVG or a photo saved as PNG or JPG. A photo is traced first, the
same way a photo dropped into a file parameter is. The editor then opens on it
with **Save edited SVG** as its main action, and the file you save is named
after the one you opened -- `bird-drawing.png` comes back as
`bird-drawing-edited.svg`.

Nothing is uploaded anywhere. The tracing, the editing and the saving all happen
in your browser, and your original file is never changed.
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

### Which surface it sits against

**Sits against** chooses the height the image is drawn at, by naming a surface
rather than asking for a number:

| Choice | Where the image goes |
|--------|----------------------|
| **Under the plate** | Just below the build plate. The default, and where it has always been |
| **Build plate** | Level with the plate itself |
| **Top of the model** | Just above the model's highest face, which is what you want when tracing something onto the top of a charm. It follows the model, so it moves when the model changes |
| **A height I choose** | Type the height in mm |

### Cropping

A photograph of a page is mostly page. **Crop** lets you keep the part you
want by typing the edges, with the picture beside the numbers showing the same
rectangle. If you type something that will not fit, the number is pulled back
to what actually fits, so the boxes always say what will really happen.

Cropping never changes your picture. It saves a copy named after the original
(`bird.png` becomes `bird-crop.png`), leaves the original in the list, and
points the overlay at the copy.

### Using it as a design

**Use as design** hands the image you have been tracing against to one of the
model's design parameters. It goes in the same way a file you chose by hand
would: a photograph is traced, the preparation editor opens if the drawing
needs it, and the design's proportions are measured at the same moment. If the
model has more than one design slot, you choose which one.

### Forge remembers where you put it

The image's position, rotation, size and chosen surface are saved **with the
project**, so reopening it later puts the reference back where you left it.
Opacity and colour are settings for how you like to work, so they stay the
same across every project rather than travelling with one.

Your images never leave your device. Cropping, tracing and measuring all
happen in your browser.

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
