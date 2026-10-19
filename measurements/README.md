# Measurements

The numbers in the main README come from the files here. All of them were
taken by me with AI coding tools, between 2026-09-29 and 2026-10-18, on one
Windows laptop (Intel Iris Xe graphics) unless a section says otherwise.

## How the browser numbers were taken

Each model was opened in the Forge app (OpenSCAD Assistive Forge, run from
its own dev server) in Playwright's headless browsers: Chromium 143 with the
laptop's GPU (`--use-angle=d3d11`), Firefox 144 and WebKit 26. The engine
under test was served in place of the app's own through Playwright routes,
so the app's code was the same for every engine. A result line records the
app's final status, and the engine's own answer: `COMPLETE <triangles> tri
<milliseconds> ms`, the time from the render request to the engine's reply,
or `ERROR <code>`.

The builds named in the file names:

- **64 KiB stack**: upstream's CMake with the rounding fix only, linked with
  Emscripten's default stack, on OpenSCAD's own build image (Emscripten
  4.0.10).
- **8 MiB, JS exceptions** and **previous build**: the rounding fix and the
  8 MiB stack, still with Emscripten's JavaScript-based exceptions, on
  OpenSCAD's build image.
- **this engine**: the files in `engine/`.

## The files

| Folder | What it holds |
|---|---|
| `depth/` | A spiral model that recurses one level per segment, at depths from 10 to 400 (`spiral-*`), and the recursion fixture from the official comparison at depths from 150 to 30,000 (`deep-recursion-*`). `spiral-64kib-stack.md` is a table with desktop OpenSCAD 2026.01.03 beside the three browsers. The spiral itself is a third-party model and is not included. |
| `speed/` | Six ordinary models, each rendered once per file; Chromium twice per build, alternating builds, Firefox once. The models are third-party projects and are not included; their names are in each line. |
| `plug-puller/` | The workflow's Node check on four builds, copied from the run logs. |
| `official-comparison/` | Four official snapshots (2026.10.18, 2026.04.03, 2026.01.03, 2025.03.25) and this engine, on the same ten models in the app (`table.md`); the probe that made it (`engine_probe.mjs`, Playwright, Chromium only); the small models it used (`models/`). |

The official comparison ran on 2026-10-18 against the app's develop branch;
"no end" means the app's 90-second preview limit stopped the render, "MF"
counts "Minkowski failed" lines, and `RECURSION` is the app's name for any
recursion stop ("Model Too Deep" on screen). In those runs the engine's own
message, in the browser console, was Chrome's "Maximum call stack size
exceeded".
