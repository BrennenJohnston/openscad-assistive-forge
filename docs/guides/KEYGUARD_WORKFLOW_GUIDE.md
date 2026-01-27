# AAC Keyguard Customization Workflow

A guide for clinicians, OTs, SLPs, and caregivers who are customizing AAC keyguards using OpenSCAD Assistive Forge.

## What are AAC keyguards?

Keyguards are physical overlays placed on tablets or speech-generating devices. They have raised edges around each button area, providing tactile feedback and preventing accidental touches on adjacent cells. Users with motor challenges can more accurately select buttons.

Common use cases:
- Grid-based AAC apps (TouchChat, Proloquo2Go, LAMP Words for Life)
- Hybrid layouts with buttons and text
- Custom layouts for specific vocabularies

3D printing keyguards is cheaper and faster than ordering commercial ones, and you can iterate on the design until it fits perfectly.

## Why use this customizer?

Traditional keyguard creation requires installing OpenSCAD, learning CAD programming, and manually editing code. This web customizer removes those barriers:

- No installation, runs in any browser
- Visual controls instead of code
- Instant 3D preview
- Save presets for reuse across clients

## Before you begin

Gather this information:
- Device model (iPad 10.2", Samsung Tab A 10.1", etc.)
- AAC app grid size (4x7, 8x6, custom)
- Button size in the app (usually in app settings)
- User's motor challenges and hand size
- Current keyguard issues if replacing one (holes too big/small, rails too high/low)

## Quick workflow

### 1. Load a keyguard model

Upload a `.scad` file or load an example. Volksswitch Keyguard is a good starting point for grid-based apps on tablets.

### 2. Set basic parameters

Grid configuration:
- `rows` / `columns`: match the app's grid size
- `grid_spacing`: distance between button centers (measure in the app)

Hole dimensions:
- `hole_width` / `hole_height`: typically 2-4mm smaller than button size
- `hole_shape`: "rectangle" or "rounded" (rounded reduces finger catching)

Rail height:
- Start with 3mm for most users
- Increase to 4-5mm for users who need more guidance
- Decrease to 2mm if high rails feel restrictive

Base plate:
- `base_thickness`: 1.5-3mm typical
- `corner_radius`: rounded corners for safety

### 3. Generate and inspect

Click "Generate Model" and wait for the preview (10-30 seconds). Use the camera controls to inspect hole alignment, rail consistency, and overall fit.

### 4. Download and print

Export as STL and import into your slicer (Cura, PrusaSlicer, etc.).

Recommended print settings:
- Material: PETG (more durable) or PLA (easier to print)
- Layer height: 0.2mm
- Infill: 20-30%
- Supports: usually not needed

Print time: 2-6 hours depending on size.

### 5. Test and iterate

Test the printed keyguard with the client:
- Can they hit targets accurately?
- Are holes too big (unintended activations) or too small (difficulty hitting)?
- Are rails comfortable?

Document what needs adjusting and print again. Expect 2-4 iterations before perfect fit.

## Parameter reference

### Rail height guide

| Height | Best for |
|--------|----------|
| 2mm | Good fine motor control, avoid finger catching |
| 3mm | Most common starting point |
| 4mm | Users who need more tactile guidance |
| 5mm | Significant motor challenges or tremor |

### Hole sizing

Rule of thumb: make holes 2-4mm smaller than button size. This provides tactile guidance without restricting access.

Small hands or stylus users can use smaller holes. Large hands need larger holes to avoid catching.

### Materials comparison

| Material | Pros | Cons |
|----------|------|------|
| PETG | Flexible, durable | Slightly harder to print |
| PLA | Easy to print | More brittle |
| TPU | Very flexible | Requires special settings |

Use PETG for production, PLA for test prints.

## Troubleshooting

Holes don't line up: verify `grid_spacing` matches the app's actual button spacing (measure with a ruler).

Keyguard doesn't fit: check device model number, verify you're using the right device dimensions, check for device case (keyguards usually fit bare devices).

Rails too high, fingers catch: reduce `rail_height` by 0.5-1mm, try rounded holes, increase `hole_width` slightly.

User still hits adjacent buttons: increase `rail_height`, decrease `hole_width`.

Print warped: use brim or raft for bed adhesion, increase bed temperature by 5°C.

## Sharing configurations

To share a configuration with another clinician:

1. Advanced menu -> "View Params JSON"
2. Copy to clipboard
3. Share via email or document
4. Recipient loads the JSON to reproduce the exact model

## Resources

Keyguard models:
- Volksswitch: https://volksswitch.org
- Forbes AAC: https://www.forbesaac.com/
- Makers Making Change: https://makersmakingchange.github.io/OpenAT-Resources/

3D printing for accessibility:
- Print Disability: https://printdisability.org/about-us/accessible-graphics/3d-printing/
- AT Maker forums: https://www.atmakers.org/forums/
