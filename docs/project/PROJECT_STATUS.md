# Project status

**Project**: OpenSCAD Assistive Forge  
**Current version**: 5.0.0  
**Last updated**: 2026-09-17  

This is a single-maintainer project. This file is here so I don’t have to answer “is it abandoned?” and “what’s next?” in every issue thread.

## Where it’s at

- The web app works: upload a Customizer-enabled `.scad`, tweak params, preview, export.
- It’s intentionally **client-side only** (no accounts, no uploads, no backend).
- The welcome screen ships ready-to-use tools: the **Charm Designer** (with its drawing editor) and the **Braille Card Designer** (card / charm / sign, with on-device liblouis braille translation).
- There are **three views**: **Simplified** (parameters, preview, one Generate button) and **Standard** (adds the console, libraries, companion files, reference images and measurement), both in the Assistive Forge interface, and **Classic**, which reproduces the OpenSCAD desktop window. On your first visit the app asks for Assistive Forge or Classic, and you can switch at any time.
- The Charm Designer's drawing editor was walked with my own logo five times before this release and fixed after each walk: the wall behind a picture is left out by itself, every shape starts on layer 1 and three layers are always offered, shapes can be chosen together and one switch sets them all, a conversion runs behind a dialog you can stop, the result combines by itself, too-thin shapes are counted at the width the charm prints and can be turned off in one press, and a picture can be cropped and traced again.
- Giving the Charm Designer a picture is a job you drive rather than wait out: one sentence says what the picture appears to be and what it will cost, you press Start, a bar moves, and Cancel really stops it. The tracing and the combining both run off the main thread, so the page keeps answering.
- The stencil work grew bigger than I expected, so I have shelved it. The Stencil Maker is not part of this version. I will pick it up another time.

## What’s solid (things I’m pretty happy with)

- **Accessibility-first UI**: keyboard, screen reader friendliness, high contrast / forced colors support
- **Braille toolset**: type text, get printable braille — translation runs entirely in the browser
- **ZIP multi-file support** for `include` / `use` with hardened companion file resolution
- **The drawing editor**: one picture, a shapes panel with one row per shape, roles a person can read, hover and touch on the drawing itself, transform baking and path offset
- **Presets / undo / sharing** workflows with project-native preset support and numeric sorting
- **Test coverage** exists (6,150+ unit tests across 199 files, plus end-to-end suites on four browsers, a production-CSP lane, and visual regression)

## Known rough edges

- **Very complex models can be slow** (that’s mostly “OpenSCAD in the browser” reality).
- **Mobile** works, but I still consider it “supported, not optimized”.
- Browsers differ in small ways (especially around performance and memory pressure).

## What I’d like to do next

In no particular order:

- Keep polishing the “first run” experience and error messages (OpenSCAD failures can be weird).
- More real-world examples in `public/examples/`.
- Finish tightening the documentation. A full review in August 2026 found that most guides written before May described a version of the app that no longer exists; the inventory and the fixes are in `docs/audit/2026-08-16-documentation-inventory.md`.
- A real screen-reader listening run with NVDA — the script is written (`docs/notes/NVDA_LISTENING_PACK.md`); measurement got the page as far as it can.

## If you’re reading this as a contributor

- Bugs + accessibility regressions: please file issues.
- PRs are welcome, but smaller PRs are more likely to land.

See `.github/CONTRIBUTING.md` and `docs/developing/DEVELOPMENT_WORKFLOW.md`.

