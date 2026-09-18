# Documentation

Everything you need to use, develop or deploy OpenSCAD Assistive Forge.

## Using the app

If you just want to customize models, start here:

- [Getting Started](./guides/GETTING_STARTED.md) -- your first five minutes with the app
- [What's new in version 5](./updates/WHATS_NEW_v5.md) -- the illustrated tour of the release
- [Classic Interface Guide](./guides/CLASSIC_UI_GUIDE.md) -- the desktop-style interface, who it is for, and how it differs
- [Run Offline (Install as a Desktop App)](./guides/RUN_OFFLINE_GUIDE.md) -- PWA install on Chrome / Edge, offline use, workshop checklist, group-policy force-install
- [Standard Mode Guide](./guides/STANDARD_MODE_GUIDE.md) -- parameter types, presets, the drawing editor, image measurement, reference overlay
- [Expert Mode Guide](./guides/EXPERT_MODE_GUIDE.md) -- code editing for power users
- [Using Libraries](./guides/LIBRARIES_GUIDE.md) -- the four bundled libraries, and bringing your own
- [Accessibility Guide](./guides/ACCESSIBILITY_GUIDE.md) -- keyboard, screen reader, high contrast
- [Accessibility Highlights](./guides/ACCESSIBILITY_HIGHLIGHTS.md) -- the short version of the above
- [How It All Fits Together](./guides/CONCEPTUAL_MODEL.md) -- SCAD files, projects, presets, and companion files
- [Troubleshooting](./guides/TROUBLESHOOTING_USER_GUIDE.md) -- common problems and fixes

### Specialized workflows

- [Keyguard Workflow](./guides/KEYGUARD_WORKFLOW_GUIDE.md) -- AAC keyguard customization for clinicians
- [Braille Card Designer](./guides/BRAILLE_CARD_GUIDE.md) -- type text, get a 3D-printable braille card (on-device liblouis translation)
- [One-Link Sharing](./guides/MANIFEST_SHARING_GUIDE.md) -- publish a design so one link opens it ready to customize
- [AI toolchain quick start](./guides/AI_TOOLCHAIN_QUICK_START.md) -- pointing a tool at Forge, or developing here with an agent
- [Welcome Screen](./guides/WELCOME_SCREEN.md) -- the tutorial and role cards on the front page
- [Forge or the official Playground?](./guides/CHOOSING_FORGE_VS_PLAYGROUND.md) -- which tool fits which job

---

## The project

- [Project status](./project/PROJECT_STATUS.md) -- where it is at, what is next
- [Release notes](./project/RELEASE_NOTES.md) -- every release, newest first
- [Releasing](./project/RELEASING.md) -- how a release is cut
- [Maintainers](./project/MAINTAINERS.md) and [authors](./project/AUTHORS.md)
- [Contributing](../.github/CONTRIBUTING.md), the [security policy](../.github/SECURITY.md) and the [code of conduct](../.github/CODE_OF_CONDUCT.md)

---

## Developing

If you're setting up the project for development or thinking about forking:

- [Dev Quick Start](./developing/DEV_QUICK_START.md) -- clone, install, run
- [Quick reference](./developing/QUICK_REFERENCE.md) -- the commands for a change
- [Architecture](./developing/ARCHITECTURE.md) -- how the pieces fit together, with flowcharts and a "for forkers" debugging guide
- [Development Workflow](./developing/DEVELOPMENT_WORKFLOW.md) -- branches, commits, PRs
- [Testing](./developing/TESTING.md) -- running unit and E2E tests
- [Troubleshooting (dev)](./developing/TROUBLESHOOTING.md) -- Playwright, builds, Windows quirks
- [Performance](./developing/PERFORMANCE.md) -- bundle budget, caching, worker architecture
- [Responsive UI](./developing/RESPONSIVE_UI.md) -- breakpoints and the layout system
- [Render Trigger Map](./developing/RENDER_TRIGGER_MAP.md) -- every code path that starts a render
- [Preset-specific companion files](./developing/design-d1-preset-companion-files.md) -- the design record
- [Tile author guide](./guides/TILE_AUTHOR_GUIDE.md) -- adding an example model
- [Golden SVG procedure](./guides/GOLDEN_SVG_PROCEDURE.md) -- checking a drawing against a known-good file

---

## Deploying

- [Deployment Guide](./deploying/DEPLOYMENT.md) -- Cloudflare Pages, nginx, Apache
- [Security Admin Guide](./deploying/SECURITY_ADMIN_GUIDE.md) -- CSP, headers, compliance
- [Site Facts](./deploying/SITE_FACTS.md) -- how the site approaches safety and privacy, verifiable
- [Rollback Runbook](./deploying/ROLLBACK_RUNBOOK.md) -- production rollback procedures

---

## Accessibility and compliance

- [Accessibility Conformance](./accessibility/ACCESSIBILITY_CONFORMANCE.md) -- WCAG 2.2 AA conformance statement
- [VPAT (WCAG 2.2)](./accessibility/vpat/VPAT-2.5-WCAG.md) -- Voluntary Product Accessibility Template
- [Conformance Decisions](./accessibility/vpat/conformance-decisions.md) -- per-criterion status tracking
- [Camera controls](./accessibility/CAMERA_CONTROLS_ACCESSIBILITY.md) -- how the 3D camera meets WCAG 2.2
- [Browser Support](./accessibility/BROWSER_SUPPORT.md) -- what browsers we test against
- [Mobile limitations](./accessibility/MOBILE_LIMITATIONS.md) -- what a phone can and cannot do
- [Known Issues](./accessibility/KNOWN_ISSUES.md) -- current limitations and workarounds

> **Where's the source of truth?** Use `conformance-decisions.md` + evidence files in `accessibility/vpat/evidence/` for criterion-level status. `ACCESSIBILITY_CONFORMANCE.md` is the summary.

---

## Reference

- [Handoff contract](./specs/FORGE_HANDOFF_CONTRACT.md) -- what a tool can build against: links in, files out
- [Manifest Stability Contract](./specs/MANIFEST_STABILITY_CONTRACT.md) -- what stays stable for people who publish share links
- [Parameter Schema Spec](./specs/PARAMETER_SCHEMA_SPEC.md) -- Customizer annotation JSON format
- [UI Standards](./specs/UI_STANDARDS.md) -- design tokens, component and styling contracts
- [Color System](./guides/COLOR_SYSTEM_GUIDE.md) -- the token palette and its contrast targets
- [OpenSCAD language reference](./reference/OPENSCAD_LANGUAGE_REFERENCE.md)
- [Open source projects used](./reference/OPEN_SOURCE_PROJECTS.md) and [open source guides](./reference/OPEN_SOURCE_GUIDES.md)

---

## Notes, research and the archive

- `notes/` -- working notes: the NVDA listening pack, the screen reader lessons, the color pass-through, the dependency status
- `research/` -- background reading
- `archive/` -- retired documents and dated records: old audits, investigations, plans. Each says what was true on the day it was written and is not maintained afterwards.

---

## Folder layout

```
docs/
  guides/         User and workflow guides
  updates/        What's new, with pictures
  project/        Status, release notes, releasing, maintainers, authors
  developing/     Architecture, workflow, testing, performance
  deploying/      Deployment, security, site facts, rollback
  accessibility/  Conformance, the VPAT, browser support, known issues
  specs/          The contracts and the parameter schema
  reference/      The OpenSCAD language reference and open-source references
  notes/          Working notes (dated records, not maintained)
  research/       Background research (dated records)
  archive/        Retired documents and old audits
```
