# Project status

**Project**: OpenSCAD Assistive Forge  
**Current version**: 5.0.0 (in release preparation)  
**Last updated**: 2026-09-01  

This is a single-maintainer project. This file is here so I don’t have to answer “is it abandoned?” and “what’s next?” in every issue thread.

## Where it’s at

- The web app works: upload a Customizer-enabled `.scad`, tweak params, preview, export.
- It’s intentionally **client-side only** (no accounts, no uploads, no backend).
- The welcome screen ships ready-to-use tools: the **Charm Customizer** (with its SVG drawing editor), the **Braille Card Customizer** (card / charm / sign, with on-device liblouis braille translation), and the **Stencil Maker**.
- There are **two interfaces**: the guided **Assistive Forge** one, and **Classic**, which reproduces the OpenSCAD desktop window. The app asks which you want on your first visit and you can switch at any time.
- The stencil work grew bigger than I expected, so I’ve shelved the deeper stencil project for now — the Stencil Maker tile stays usable as it stands, and I’ll pick the rest up another time.

## What’s solid (things I’m pretty happy with)

- **Accessibility-first UI**: keyboard, screen reader friendliness, high contrast / forced colors support
- **Braille toolset**: type text, get printable braille — translation runs entirely in the browser
- **ZIP multi-file support** for `include` / `use` with hardened companion file resolution
- **SVG preparation workspace** with transform baking, path offset, role assignment, and fullscreen editing
- **Presets / undo / sharing** workflows with project-native preset support and numeric sorting
- **Test coverage** exists (5,100+ unit tests across 158 files, plus end-to-end suites on four browsers, a production-CSP lane, and visual regression)

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

See `CONTRIBUTING.md` and `docs/DEVELOPMENT_WORKFLOW.md`.

