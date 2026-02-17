# AAC Keyguard Customization Workflow

A practical guide for clinicians, OTs, SLPs, and caregivers who customize AAC keyguards with OpenSCAD Assistive Forge.

## What are AAC keyguards?

Keyguards are physical overlays placed on tablets or speech-generating devices. They have raised edges around each button area so users get tactile feedback and are less likely to hit adjacent buttons by accident. People with motor challenges can select targets more accurately with a good keyguard.

Common use cases:

- Grid-based AAC apps (TouchChat, Proloquo2Go, LAMP Words for Life)
- Hybrid layouts with buttons and text bars
- Custom layouts for specific vocabularies

3D-printing keyguards is cheaper and faster than ordering commercial ones, and you can keep iterating until the fit is perfect.

## Why use this customizer?

Making a keyguard the old-fashioned way means installing OpenSCAD, learning its scripting language, and editing code by hand. This web customizer skips all of that:

- Nothing to install -- runs entirely in your browser (even on Chromebooks or locked-down school machines)
- Visual controls instead of code
- Live 3D preview so you can see changes immediately
- Built-in image measurement tool (no need for MS Paint or GIMP)
- Built-in reference overlay (no need for Inkscape vector tracing)
- Save and share presets so colleagues can reuse your work

## Before you begin

### Gather information

- **Device model** -- iPad 10th gen, Samsung Tab A 10.1", etc.
- **AAC app name and grid layout** -- grid size, button arrangement
- **Case or no case** -- keyguards are usually designed for a bare device

### Prepare a screenshot

1. Take a screenshot of the AAC app on the tablet (use the built-in screenshot feature)
2. Transfer it to your computer (Google Drive, email, AirDrop -- whatever you normally use)
3. You'll verify pixel dimensions later using the Forge's Image Measurement tool

### Printable data-collection form (optional)

Some keyguard projects include a downloadable form (PDF or Word) for recording measurements. Check the project's website or documentation for one -- having a paper record is handy when you need to share settings with a colleague or come back to the project later.

---

## Complete workflow

### 1. Load the keyguard model

Upload the keyguard `.scad` file. If the design uses companion files (like an openings-and-additions text file), pack everything into a `.zip` and upload that instead.

You can also use a direct-launch link if the project author provides one. These links load the model automatically.

### 2. Measure pixel coordinates

Many keyguard designs need pixel coordinates from your tablet screenshot -- they tell the model where status bars, message bars, and command bars sit on your specific device.

1. Open the **Image Measurement** panel in the preview settings area
2. Click **Browse** or drag your screenshot onto the canvas
3. Check that the image dimensions match what you'd expect for your tablet
4. Move the mouse (or use arrow keys) to position the crosshair on each boundary you need to measure
5. Click **Copy Y** to grab the Y-coordinate, then click in the parameter field and paste

**Keyboard shortcut**: Arrow keys move the crosshair 1 pixel at a time. Hold Shift for 10-pixel jumps. Press Enter to copy the Y coordinate.

### 3. Pixel vs. millimeter parameters

Keyguard designs typically split measurements into two groups:

**Pixel parameters** describe positions on the screen (measured from your screenshot):
- Status bar bottom edge
- Message bar boundaries
- Command bar boundaries
- Grid cell width and height in pixels

**Millimeter parameters** describe physical dimensions of the printed keyguard:
- Bar heights converted to mm
- Rail heights, base thickness, corner radii

The Forge shows "px" or "mm" next to each parameter so you always know which unit you're working in. If a parameter group/tab includes a unit hint in its name (e.g., "App Layout in px"), every parameter in that group inherits the hint automatically.

### 4. Configure tablet and grid parameters

**Tablet selection**: Pick your exact device model from the dropdown. This sets physical dimensions and the pixel-to-mm conversion the model uses internally.

**Grid configuration**: Set the number of rows and columns to match your AAC app, and enter the cell dimensions in pixels from your screenshot.

**Opening settings**: Adjust hole width, height, and corner radius.

**Rail height**: Start at 3 mm for most users, increase to 4-5 mm if the person needs stronger guidance, or drop to 2 mm if high rails feel restrictive.

### 5. Edit openings and additions

If the project includes a companion text file that controls which grid cells have openings and where extra features go (thumb notches, etc.), you can edit it right inside the Forge -- no need to open a separate text editor.

Check the project's documentation for the expected syntax and examples.

### 6. Verify alignment with the reference overlay

Use the **Reference Overlay** panel to display your screenshot behind the 3D model:

1. Upload your screenshot as the overlay source image
2. Toggle the overlay on
3. Enter the screen's physical dimensions in mm (you'll find these in the tablet parameters) as the overlay width and height
4. Dial the opacity up or down until you can compare comfortably
5. Use "Fit to model" to auto-size the overlay to the keyguard's bounding box

This gives you a full-colour comparison right in the browser -- no external vector-tracing tools required.

### 7. Generate and inspect

Click **Generate STL** and wait for the preview (usually 10-30 seconds). Check:

- Holes line up with the app's buttons
- Rails are even around each opening
- Status bar and message bar cutouts are positioned correctly
- The overlay image (if enabled) matches up

Use the **Snap Views** buttons (Top, Front, Side) for quick inspection angles.

### 8. Save your work

**Preset**: Click "Save Preset" in the Parameters panel. Use a descriptive name (e.g., "iPad10-TouchChat-8x6-ClientName").

**JSON export**: Use the Actions drawer to export parameters as a shareable JSON file.

### 9. Print

Export the STL and import it into your slicer (PrusaSlicer, Cura, etc.).

| Setting | Recommended |
|---------|-------------|
| Material | PETG (durable) or PLA (easier to print) |
| Layer height | 0.2 mm |
| Infill | 20-30 % |
| Supports | Usually not needed |

Typical print time: 2-6 hours depending on size.

### 10. Test and iterate

Try the printed keyguard with the client:

- Can they hit targets accurately?
- Are holes too big (accidental presses) or too small (hard to reach)?
- Are rails comfortable?
- Do cutouts line up with bars and buttons?

Write down what needs changing and print again. Two to four rounds is normal before the fit is right.

---

## Parameter quick-reference

### Rail height

| Height | Best for |
|--------|----------|
| 2 mm | Good fine motor control; avoids finger catching |
| 3 mm | Most common starting point |
| 4 mm | More tactile guidance needed |
| 5 mm | Significant motor challenges or tremor |

### Hole sizing

Rule of thumb: make holes 2-4 mm smaller than the on-screen button size. That gives tactile guidance without blocking access.

- Smaller hands or stylus users -- smaller holes work well
- Larger hands -- bigger holes help avoid catching

### Material comparison

| Material | Pros | Cons |
|----------|------|------|
| PETG | Slightly flexible, very durable | A bit trickier to print |
| PLA | Easy to print, cheap | More brittle over time |
| TPU | Very flexible | Needs special print settings |

Use PETG for the final version, PLA for quick test prints.

---

## Troubleshooting

**Holes don't line up** -- Re-measure cell width and cell height in pixels using the Image Measurement tool. Even a few pixels off can shift the grid noticeably.

**Keyguard doesn't fit the device** -- Double-check the tablet model selection. Also make sure you're designing for the bare device (remove any case first).

**Pixel values seem wrong** -- Confirm the screenshot wasn't resized during transfer. The Image Measurement tool shows dimensions when you load the file -- compare them against the expected resolution.

**Rails too high / fingers catch** -- Lower the rail height by 0.5-1 mm, try rounded openings, or widen the holes slightly.

**User still hits adjacent buttons** -- Raise the rails and/or shrink the holes.

**Print warps or lifts** -- Add a brim or raft in your slicer. Bumping the bed temperature up 5 °C can also help.

---

## Resources

**Keyguard projects and models:**
- [Makers Making Change](https://makersmakingchange.github.io/OpenAT-Resources/) -- open-source assistive technology designs
- [Forbes AAC](https://www.forbesaac.com/) -- AAC keyguard resources

**3D printing for accessibility:**
- [AT Makers](https://www.atmakers.org/forums/) -- community forums for assistive tech makers
- [Print Disability](https://printdisability.org/about-us/accessible-graphics/3d-printing/) -- 3D printing resources

---

**Related guides:**

- [Getting Started](./GETTING_STARTED.md) -- First-time user introduction
- [Standard Mode Guide](./STANDARD_MODE_GUIDE.md) -- All parameter types, Image Measurement, and Reference Overlay docs
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md) -- Keyboard, screen reader, and high-contrast support
