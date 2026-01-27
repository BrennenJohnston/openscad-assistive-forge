# Docs

Developer documentation for OpenSCAD Assistive Forge.

## Start here

If you're setting up the project for the first time, read `DEV_QUICK_START.md`. It covers cloning, installing dependencies, downloading the WASM, and running the dev server.

After that:

- `TESTING.md` - running unit and E2E tests
- `TROUBLESHOOTING.md` - common issues (especially Playwright on Windows)
- `DEPLOYMENT.md` - deploying to Cloudflare Pages

## Folder layout

```
docs/
  guides/      How-to guides (accessibility, workflows, security testing)
  specs/       Formal specs (parameter schema, UI standards, camera controls)
  research/    Background research and experiments
  notes/       Dev logs by date (working notes, not polished)
  archive/     Old docs kept for git history context
```

## Reference docs

- `ARCHITECTURE.md` - module map and Mermaid diagrams
- `specs/PARAMETER_SCHEMA_SPEC.md` - how Customizer annotations become JSON
- `PERFORMANCE.md` - bundle size, caching, worker architecture
- `DEVELOPMENT_WORKFLOW.md` - branching and commit conventions
- `guides/ACCESSIBILITY_GUIDE.md` - accessibility features and testing
