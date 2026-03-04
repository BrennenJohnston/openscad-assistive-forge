# Conceptual Model: SCAD Files, Projects, Presets, and Companion Files

This guide explains how the building blocks of OpenSCAD Assistive Forge fit
together. Understanding this model will help you know where to save things,
how to share your work, and what happens when you reload a project.

---

## The four building blocks

```
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT  (a saved bundle you can open later)                   │
│  ┌────────────────┐   ┌─────────────────────────────────────┐  │
│  │  SCAD File     │   │  Preset 1  (iPad 9th gen, 8×6 grid) │  │
│  │  (design)      │   │  Preset 2  (Samsung Tab, 6×4 grid)  │  │
│  │                │   │  ...                                 │  │
│  └────────────────┘   └─────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Companion Files                                          │  │
│  │    openings_and_additions.txt  (hole definitions)         │  │
│  │    default.svg  (reference shape)                         │  │
│  │    screenshot.png  (tablet screenshot for alignment)      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## SCAD File — the design

A SCAD file is the **OpenSCAD source code** that describes the 3D geometry of
your design. For a keyguard project, this might be named
`keyguard_v3.scad`.

- You upload it (or a ZIP containing it) once.
- You don't usually need to edit it directly — the parameter UI lets you
  customise the design without touching the code.
- The SCAD file is the unchanging "template". It doesn't know about specific
  tablets or grid sizes until you supply parameter values.

---

## Parameters / Presets — the configuration

**Parameters** are the knobs and dropdowns you see in the Parameters panel.
Each parameter changes one aspect of the design (rail height, number of rows,
tablet model, etc.).

A **Preset** is a **saved snapshot of one particular set of parameter values**,
given a name.

> **Example:** "iPad 9th Gen – TouchChat 8×6" is a preset that stores
> `tablet = iPad 9th gen`, `rows = 8`, `columns = 6`, and so on.

Why use presets?

- You can switch between different device configurations in one click.
- You can share a preset with a colleague so they get exactly your settings.
- The design (SCAD file) never changes — only the parameters you pass to it.

The Presets panel shows all available presets. The selected preset is highlighted.
When you change a parameter manually, the preset is marked "modified" until you
save a new preset or revert.

---

## Companion Files — extra files the design needs

Some designs need additional files to work correctly:

| File type | What it does |
|-----------|--------------|
| `openings_and_additions.txt` | Defines which grid cells have cutouts and where special features go |
| `default.svg` | An SVG template shape the SCAD reads to create openings |
| `screenshot.png` | Your tablet screenshot; used in Image Measurement for pixel coordinates |

These files are called **companion files** because they travel alongside the
SCAD file to complete the design.

- The SCAD file contains `include` or `import` statements that reference
  companion files by name.
- If a companion file is missing, OpenSCAD may fail or produce wrong output.
- The Companion Files panel lists all files currently loaded. Upload missing
  files here.

**Preset-specific companion files:** Some designs use different companion files
for different presets. When you switch presets, the app may automatically swap
the companion files too (for example, swapping `openings_and_additions.txt` to
match the new preset).

---

## Project — saving everything together

A **Project** is the app's way of saving the **entire working context**:

- The SCAD file content
- All companion files
- All your presets
- The current parameter values and which preset is selected

When you click **Save Project**, all of the above is bundled and stored in your
browser's local storage under a project name. When you click **Open Project**
and select the same name, everything is restored exactly as you left it.

You can also **export a project as a ZIP file** to share it with colleagues or
move it to a different computer.

---

## Workflow map: what to click when

| I want to… | What to do |
|---|---|
| Start a new keyguard | Upload the SCAD file (or ZIP), adjust parameters, save a preset |
| Save settings for a specific tablet | Set the parameters, click "Save Preset", give it a name |
| Reload yesterday's work | Open a saved project (browser storage or ZIP) |
| Share settings with a colleague | Export a preset as JSON, or share the whole project ZIP |
| Change just the openings file | Upload the new companion file via the Companion Files panel |
| Export for 3D printing | Generate STL, then Download |
| Export for laser cutting | Switch Output Format to SVG or DXF, then Generate and Download |

---

## Mental model: "I'm designing a keyguard for iPad 9th Gen"

Here is how each concept maps to your real workflow:

1. **Load the SCAD file** → the design template is loaded
2. **Select the "iPad 9th gen" preset** (or create one) → the parameter
   snapshot for that device is applied to the design
3. **Upload your screenshot as a companion file** → the image measurement
   tool can now read pixel positions from it
4. **Adjust hole sizes and rail heights** → you're changing parameters;
   the preset is now "modified"
5. **Save Preset as "iPad9-ClientName-v2"** → the configuration is stored
6. **Click Generate STL** → OpenSCAD compiles the SCAD file with the saved
   parameter values and companion files
7. **Save Project** → the SCAD file, companion files, and all presets are
   bundled for next time

---

## Frequently asked questions

**Q: Where is the SCAD file stored?**
A: In the browser's memory while the app is open. It's also stored inside the
Project when you save. It is NOT uploaded to any server — everything runs locally
in your browser.

**Q: If I change a parameter, does it affect other presets?**
A: No. Changing a parameter only affects the currently active preset. Other
presets keep their own saved values.

**Q: What happens if I close the browser without saving?**
A: The app auto-saves your current parameter state as a draft for a short time.
If you return to the same URL, you may be offered to restore the draft. For
permanent storage, always click "Save Project".

**Q: Can I use the same SCAD file with different companion files?**
A: Yes. You can upload different companion files at any time. If different presets
need different companion files, the app can be configured to swap them automatically
when you switch presets (preset-specific companion files feature).

**Q: What is the difference between OpenSCAD Output and Errors and Warnings?**
A: **OpenSCAD Output** shows everything the engine prints — ECHO statements,
timing info, and errors — in the exact order they occurred. It's the "raw log".
**Errors and Warnings** shows only problems (errors and warnings), structured in
a table with file names and line numbers so you can click through to the code.
Use Errors and Warnings when debugging; use OpenSCAD Output when you want to
see `echo()` values.

---

**Related guides:**

- [Keyguard Workflow Guide](./KEYGUARD_WORKFLOW_GUIDE.md) — step-by-step for
  clinicians and caregivers
- [Getting Started](./GETTING_STARTED.md) — first-time user introduction
- [Standard Mode Guide](./STANDARD_MODE_GUIDE.md) — all UI panels documented
