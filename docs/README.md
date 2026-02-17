# Documentation

Everything you need to use, develop, or deploy OpenSCAD Assistive Forge.

## Using the app

If you just want to customize models, start here:

- [Getting Started](./guides/GETTING_STARTED.md) -- your first five minutes with the app
- [Standard Mode Guide](./guides/STANDARD_MODE_GUIDE.md) -- parameter types, presets, image measurement, reference overlay
- [Expert Mode Guide](./guides/EXPERT_MODE_GUIDE.md) -- code editing for power users
- [Accessibility Guide](./guides/ACCESSIBILITY_GUIDE.md) -- keyboard, screen reader, high contrast
- [Troubleshooting](./guides/TROUBLESHOOTING_USER_GUIDE.md) -- common problems and fixes

### Specialized workflows

- [Keyguard Workflow](./guides/KEYGUARD_WORKFLOW_GUIDE.md) -- AAC keyguard customization for clinicians

---

## Developing

If you're setting up the project for development or thinking about forking:

- [Dev Quick Start](./DEV_QUICK_START.md) -- clone, install, run
- [Architecture](./ARCHITECTURE.md) -- how the pieces fit together, with flowcharts and a "for forkers" debugging guide
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md) -- branches, commits, PRs
- [Testing](./TESTING.md) -- running unit and E2E tests
- [Troubleshooting (dev)](./TROUBLESHOOTING.md) -- Playwright, builds, Windows quirks

---

## Deploying

- [Deployment Guide](./DEPLOYMENT.md) -- Cloudflare Pages, nginx, Apache
- [Security Admin Guide](./SECURITY_ADMIN_GUIDE.md) -- CSP, headers, compliance
- [Rollback Runbook](./ROLLBACK_RUNBOOK.md) -- production rollback procedures

---

## Accessibility and compliance

- [VPAT (WCAG 2.2)](./vpat/VPAT-2.5-WCAG.md) -- Voluntary Product Accessibility Template
- [Accessibility Conformance](./ACCESSIBILITY_CONFORMANCE.md) -- WCAG 2.2 AA conformance statement
- [Conformance Decisions](./vpat/conformance-decisions.md) -- per-criterion status tracking
- [Browser Support](./BROWSER_SUPPORT.md) -- what browsers we test against
- [Known Issues](./KNOWN_ISSUES.md) -- current limitations and workarounds

> **Where's the source of truth?** Use `conformance-decisions.md` + evidence files in `vpat/evidence/` for criterion-level status. `ACCESSIBILITY_CONFORMANCE.md` is the summary.

---

## Reference

- [Architecture](./ARCHITECTURE.md) -- module map, Mermaid diagrams, debugging paths
- [Parameter Schema Spec](./specs/PARAMETER_SCHEMA_SPEC.md) -- Customizer annotation JSON format
- [UI Standards](./specs/UI_STANDARDS.md) -- component and styling contracts
- [Camera Controls Accessibility](./specs/CAMERA_CONTROLS_ACCESSIBILITY.md) -- 3D camera a11y spec
- [Performance](./PERFORMANCE.md) -- bundle budget, caching, worker architecture

---

## Research (background reading)

- [Comparable Projects](./research/COMPARABLE_PROJECTS.md) -- how similar tools work
- [WASM Threading Analysis](./research/WASM_THREADING_ANALYSIS.md) -- multi-threading investigation
- [Tutorial Design Research](./research/TUTORIAL_DESIGN_RESEARCH.md) -- UX research for guided tutorials
- [Project Sharing References](./research/PROJECT_SHARING_REFERENCES.md) -- URL import patterns

---

## Folder layout

```
docs/
  guides/      User and workflow guides
  specs/       Formal specifications
  vpat/        Accessibility compliance (VPAT, evidence)
  research/    Background research
  notes/       Dev logs by date (working notes)
  planning/    Retained planning artifacts (decision log, test corpus)
  archive/     Old docs kept for git history
```
