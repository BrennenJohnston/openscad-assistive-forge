# Documentation

Everything you need to use, develop, or deploy OpenSCAD Assistive Forge.

## Using the app

If you just want to customize models, start here:

- [Getting Started](./guides/GETTING_STARTED.md) -- your first five minutes with the app
- [Classic Interface Guide](./guides/CLASSIC_UI_GUIDE.md) -- the desktop-style interface, who it is for, and how it differs
- [Run Offline (Install as a Desktop App)](./guides/RUN_OFFLINE_GUIDE.md) -- PWA install on Chrome / Edge, offline use, workshop checklist, group-policy force-install
- [Standard Mode Guide](./guides/STANDARD_MODE_GUIDE.md) -- parameter types, presets, image measurement, reference overlay
- [Expert Mode Guide](./guides/EXPERT_MODE_GUIDE.md) -- code editing for power users
- [Using Libraries](./guides/LIBRARIES_GUIDE.md) -- the four bundled libraries, and bringing your own
- [Accessibility Guide](./guides/ACCESSIBILITY_GUIDE.md) -- keyboard, screen reader, high contrast
- [Accessibility Highlights](./guides/ACCESSIBILITY_HIGHLIGHTS.md) -- the short version of the above
- [How It All Fits Together](./guides/CONCEPTUAL_MODEL.md) -- SCAD files, projects, presets, and companion files
- [Troubleshooting](./guides/TROUBLESHOOTING_USER_GUIDE.md) -- common problems and fixes

### Specialized workflows

- [Keyguard Workflow](./guides/KEYGUARD_WORKFLOW_GUIDE.md) -- AAC keyguard customization for clinicians
- [Braille Card Customizer](./guides/BRAILLE_CARD_GUIDE.md) -- type text, get a 3D-printable braille card (on-device liblouis translation)
- [One-Link Sharing](./guides/MANIFEST_SHARING_GUIDE.md) -- publish a design so one link opens it ready to customize
- [Welcome Screen](./guides/WELCOME_SCREEN.md) -- the tutorial and role cards on the front page
- [Forge or the official Playground?](./guides/CHOOSING_FORGE_VS_PLAYGROUND.md) -- which tool fits which job

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
- [IT Approval Guide](./guides/IT_APPROVAL_GUIDE.md) -- hand to security teams for allowlisting and enterprise deployment
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
- [Manifest Stability Contract](./specs/MANIFEST_STABILITY_CONTRACT.md) -- what stays stable for people who publish share links
- [Responsive UI](./RESPONSIVE_UI.md) -- breakpoints and the layout system
- [Colour System](./guides/COLOR_SYSTEM_GUIDE.md) -- the token palette and its contrast targets
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
  audit/       Dated audit and investigation records
  research/    Background research
  notes/       Dev logs by date (working notes)
  plans/       Live working protocols
  archive/     Retired docs, each with a dated note saying why
```

Everything under `audit/`, `notes/` and `research/` is a **dated record**: it
describes what was true on the day it was written and is not maintained
afterwards. Check its date before acting on it. The guides and the files in
`docs/` itself are the ones kept current.
