# Project status

**Project**: OpenSCAD Assistive Forge  
**Current version**: 4.1.0  
**Last updated**: 2026-02-24  

This is a single-maintainer project. This file is here so I don’t have to answer “is it abandoned?” and “what’s next?” in every issue thread.

## Where it’s at

- The web app works: upload a Customizer-enabled `.scad`, tweak params, preview, export.
- It’s intentionally **client-side only** (no accounts, no uploads, no backend).
- The CLI is included for developers who want to scaffold standalone customizers.

## What’s solid (things I’m pretty happy with)

- **Accessibility-first UI**: keyboard, screen reader friendliness, high contrast / forced colors support
- **ZIP multi-file support** for `include` / `use`
- **Presets / undo / sharing** workflows (depending on the model)
- **Test coverage** exists (unit + e2e)

## Known rough edges

- **Very complex models can be slow** (that’s mostly “OpenSCAD in the browser” reality).
- **Mobile** works, but I still consider it “supported, not optimized”.
- Browsers differ in small ways (especially around performance and memory pressure).

## What I’d like to do next

In no particular order:

- Keep polishing the “first run” experience and error messages (OpenSCAD failures can be weird).
- More real-world examples in `public/examples/`.
- Tighten documentation so it reads more like a hobby project and less like an enterprise checklist.

## If you’re reading this as a contributor

- Bugs + accessibility regressions: please file issues.
- PRs are welcome, but smaller PRs are more likely to land.

See `CONTRIBUTING.md` and `docs/DEVELOPMENT_WORKFLOW.md`.

