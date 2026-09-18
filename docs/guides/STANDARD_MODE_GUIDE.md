# Standard Mode Guide

Standard Mode is the full view of the Assistive Forge interface; Simplified, the default, hides the working panels. This guide covers parameter types, presets, exports, image measurement, the reference overlay, and the drawing editor.

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

### The drawing editor

When you give a design an SVG, the app checks whether it needs preparation.
OpenSCAD imports an SVG as one 2D shape, so a drawing with several shapes
needs a decision about each one. A badge next to the file input says what
happened:

- **SVG Ready** (green): one shape, or prepared without questions
- **Needs review** (amber): several shapes, so the editor opens for you
- **Unsupported features** (red): gradients, clip paths or other features
  that cannot be flattened

**One picture.** The editor shows what your drawing will print as, with the
list of shapes beside it. **Compare with original** shows the before and
after side by side.

**Roles.** Each shape has one of three roles:

- **On**: the shape prints, at its layer, raised or engraved as the layer's
  style says
- **Cut out**: cut out of the shape it sits in, like the inside of an O
- **Off**: left out

The role control shows all three words, so what you read and what a screen
reader reads are the same. Arrow keys move between them.

With layers, the picture paints every On shape in its layer's color: layer 1
deep blue, layer 2 orange, layer 3 yellow-green, each lighter than the last
so the order reads in grayscale too. A Cut out is paper with a dashed edge.
A shape turned Off keeps its layer's color, muted under a diagonal hatch, so
you can see it is still there. The legend under the picture names each.

**Choosing shapes.** The list and the picture point at each other: move over
a row and its shape lights up in the drawing; move over the drawing and its
row is marked. Click either to choose it. Ctrl (Cmd on a Mac) adds or removes
a shape, Shift takes a range, and Ctrl+A chooses every shape while the list
is focused. **Delete selected** appears with the number chosen. With several
shapes chosen, the switch on any chosen row sets all of them, and the editor
says how many.

On a touch screen, one finger scrolls the page and two fingers zoom and pan
the picture. A tap chooses a shape. **Fit**, **+** and **−** do the same
without pinching. Pressing inside an outline chooses whatever is under your
finger, usually the background behind it, because an outline is the line
itself, not the space inside it. The mark that appears as you move shows
which shape you are about to choose.

**More, on each row.** Each row has a **More** button holding the shape's
offset, its layer where the design has layers, and **Delete**. Every shape
starts on layer 1, and three layers are always offered, each with its own
height on the charm. Choose a layer under More.

**The result combines by itself.** Combining shapes into one outline is the
slow step, and its cost depends on how complicated the shapes are, not on how
many there are: two hundred rectangles take a tenth of a second, two hundred
curves half a second. Forge combines the drawing a third of a second after
your last change, off the page's own thread, and says so under the picture:
"Combining 146 shapes, about 2 seconds. Apply is ready when they are
combined." You can keep choosing while it works. Apply and Save wait for the
result, and a change made while it combines starts it again. After the first
combine on your machine, the estimate is based on that measurement. Above a
thousand shapes, Forge asks you to simplify the drawing first and names both
numbers.

**Removing shapes.** Off leaves a shape in the list but out of the result. To
take shapes out of the list:

| Action | How |
|--------|-----|
| Remove one shape | **More** on its row, then **Delete** |
| Remove the chosen shapes | Choose them, then **Delete selected** |
| Remove every shape below a size | Type a size in **Smaller than … mm²** and press **Delete those** |
| Keep only the biggest | Type a number in **Keep largest …** and press **Delete the rest** |
| Put the last removal back | **Undo delete** (one step, this session only) |

Sizes are measured at the design width in the editor's header, so they are
the size the shape will print. Removals are saved with the project.

**Shapes too thin to print.** Forge measures every shape at the width the
charm will print the drawing: the charm's design box, which the editor's
width box starts at. It counts the shapes under half a millimeter and says so
above the list: "33 shapes are thinner than 0.5 mm at 12 mm wide and may not
print." Each such row carries a **thin** mark, and a screen reader hears why:
too thin to print, or too small to trace clearly, which means under three
pixels in the picture. Nothing is changed for you. **Turn those off** sets
every flagged shape to Off in one press, **Turn those back on** puts them
back, and any single row can be turned back on by hand. The floor and the
width are numbers you can change.

**Editor controls:**

| Action | How |
|--------|-----|
| Change a role | Click **On**, **Cut out** or **Off**, or use arrow keys |
| Choose a shape | Click its row or the shape itself; Ctrl or Cmd adds, Shift takes a range |
| Choose every shape | Ctrl+A (Cmd+A on a Mac) with the list focused |
| Remove the chosen shapes | Delete or Backspace, or **Delete selected** |
| See the effect | The result combines on its own after each change |
| See the charm instead of the drawing | The **Drawing / Charm** switch in the toolbar |
| Draw the charm with the drawing as it stands | **Render preview**, in the Charm view |
| Crop the picture | **Crop** in the toolbar, then **Save crop** |
| Apply changes | **Apply** |
| Save it as a file | **Save SVG** (and **Save DXF** through the standalone door) |
| Keep the original | **Keep original** (bypasses preparation) |
| Reset roles | **Reset** returns to the automatic first pass (this does not bring deleted shapes back) |
| Shut what is open | `Escape` shuts the innermost thing: a row's **More** menu, the crop view, then the editor |
| Close the editor | **Close**, or `Escape` when nothing smaller is open |

**The Drawing / Charm switch.** The switch in the editor's toolbar swaps
between the drawing and the charm it makes. Every role, removal and layer is
still there when you switch back. While the editor is open, previews are
drawn at draft quality; your own quality setting returns when you close it.
In the Charm view, **Render preview** draws the charm with the drawing as it
stands, without applying anything. A note says it is a draft, and Close puts
the charm back. Apply is the only thing that changes your design.

**The wall.** A picture with a colored background arrives with that
background as one big shape, the wall. Its row starts as **Off**. A patch of
wall closed in by the artwork, like the inside of an A, becomes a **Cut
out**, and every other color is **On**, so the charm carries the drawing
rather than a plate with the drawing cut out of it. Turn the wall on if you
want it.

**Crop.** **Crop** in the toolbar opens a crop view in the drawing's place:
the kept rectangle clear, the rest shaded, and four sliders named **Top**,
**Bottom**, **Left** and **Right**, each a share of the picture from 0 to 90
percent, with a number box beside each. The sentence under the picture says
what stays. **Save crop** applies it: a traced picture is cropped in its
pixels and traced again, and an uploaded drawing is clipped shape by shape. A
crop starts the shape list over. **Undo crop** puts the picture back, one
step, for this session. **Cancel** or `Escape` leaves the drawing as it was.

**If the result looks like a solid blob:** everything set to On is merged
into one shape. When a drawing has an outline around its detail, merging
fills the outline and swallows the detail. Set the interior shapes to
**Off**, or to **Cut out** to cut them out.

**Warnings.** Unsupported features are listed in the editor's warnings. A
path with only a stroke and no fill cannot take part in the combining, and
its row carries a warning.

Your roles and the prepared drawing are saved with the project.

### Opening and saving a DXF

The editor takes `.dxf` as well as SVG and photos, and can save one back.
Forge's own OpenSCAD engine does the converting, in your browser. On a 40 x
25 mm drawing, DXF in and DXF out each took about 0.3 seconds.

Open a DXF from the welcome screen's **Edit a drawing or photo** line or
**Edit Drawing** in the Actions drawer. Forge says it is converting, then
the editor opens with each shape listed. **Save as DXF** sits beside **Save
edited SVG**.

A drawing that has been through the editor is rebuilt from its shapes, and
the rebuilt size can differ slightly: that 40 x 25 mm file came back 40.3 by
25.35. The app reports the saved size. If the difference matters for a fit,
take the SVG instead and convert it with your own tool.

OpenSCAD's DXF import reads drawing entities only. Text, dimensions and other
annotations are not read, so a file made only of those arrives empty, and
Forge says so. Export the drawing again with its outlines as geometry, or
send an SVG.

This is separate from **Export for laser cutting** in the keyguard guide,
which exports a model you are customizing.

### Choosing what to keep from a photo

A photo is traced before it becomes a shape, and tracing has to decide what
counts as a line. **What to keep from the picture** offers four answers
wherever a picture enters Forge:

| Choice | What it keeps | Best for |
|--------|---------------|----------|
| **Line art** (the default) | The drawn lines. The color behind them is dropped. | Communication symbols, and any drawing on a colored background |
| **Solid shape** | The outline of the whole picture, filled in. | Very small pieces, where detail could not be felt anyway |
| **Light and dark** | Whatever is darker than the background. What Forge did before. | A plain pencil drawing on white paper |
| **Colors** | The picture separated into flat colors, one shape per color, with the color behind the picture as the wall. | A colored drawing or a logo whose colors are the point |

**Why Line art is the default.** Communication symbols are black line work
over a colored fill, and the fill carries meaning. Judging by brightness
alone puts a blue field and the black drawing on it in the same bucket, and
they merge: a black person symbol inside a blue square came back as a plain
blue square with the person gone. Line art asks two questions, is it dark and
is it close to gray, so black strokes survive and colored fills do not.

Two sliders, each with a number box beside it:

- **How dark counts as a line**: higher keeps more of the picture, lower
  keeps only the darkest strokes.
- **How colorful is still a line**: lower rejects colored fills more firmly.
  Raise it if a colored line is being dropped. Line art only.

After every change Forge says what happened: how many shapes it found, how
much of the picture became ink, and whether anything looks wrong, such as
almost nothing kept, or so much kept that the result will print as one
block. If the picture had a single color behind its lines, Forge names it,
so you can pick a filament near it. It says nothing when the picture has
several fills, because their average is a color that is in none of them.

**Tracing starts and stops when you say so.** The picture is shown with a
**Start conversion** button under it. While it works, a dialog stands in
front of the page with the stages by name (reading the picture, tracing the
shapes, preparing the drawing, updating the charm), a moving bar and a
**Cancel** that stops it at any stage and gives you the picture back. A
picture small enough to be done in a moment starts by itself when chosen,
and shows the dialog only if it takes longer. A setting changed afterwards
never starts a conversion by itself: it offers **Convert again**. When the
drawing needs a look, the editor opens once the dialog has gone.

Before you commit, Forge takes a **quick look** at a thumbnail and says
roughly what it will find: how busy the drawing is and how much of it will
become ink. It is a forecast, not a promise.

**Stock icons: the caption comes off.** Icons from symbol libraries usually
carry a line of credit along the bottom, and across nine of them the caption
was 76 to 97 percent of the shapes in the drawing. Traced as it is, it
becomes forty-odd tiny specks along the bottom edge of a charm. Forge finds
that line and takes it off, says so, and offers **Undo** in case the drawing
really did end in a row of small marks. It only fires when the marks look
like a caption: enough of them, all small, all low down, all in one band.
Removing the caption removes no obligation: if the icon's license asks for
credit, you still owe it, and the panel says so.

**Lines too thin to print.** Forge measures the thinnest line at the width
the charm will print it and says so in the editor: under about half a
millimeter a line may not print, or may be too faint to feel. On a charm
every shape is measured too (see "Shapes too thin to print" above). It is a
sentence, not an action.

**Nothing is uploaded.** Tracing and every choice above happen in your
browser. You are responsible for having the right to use any image you
bring. [ARASAAC](https://arasaac.org/),
[Mulberry Symbols](https://mulberrysymbols.org/) and
[Blissymbolics](https://blissymbolics.org/) publish openly licensed sets;
check each set's license before you share what you make.

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

The Reference Image puts any image behind the 3D model in the preview so you can compare visually.

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

### The position is saved with the project

The image's position, rotation, size and chosen surface are saved **with the
project**, so reopening it later puts the reference back where you left it.
Opacity and color are settings for how you like to work, so they stay the
same across every project rather than traveling with one.

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
