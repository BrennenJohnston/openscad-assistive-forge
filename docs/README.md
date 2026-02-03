# Documentation

Documentation for OpenSCAD Assistive Forge.

## User Guides

Start here if you're using the application:

- [Getting Started](./guides/GETTING_STARTED.md) - First-time user introduction
- [Standard Mode Guide](./guides/STANDARD_MODE_GUIDE.md) - Parameter customization
- [Expert Mode Guide](./guides/EXPERT_MODE_GUIDE.md) - Code editing interface
- [Accessibility Guide](./guides/ACCESSIBILITY_GUIDE.md) - Screen reader, keyboard, high contrast
- [Troubleshooting (Users)](./guides/TROUBLESHOOTING_USER_GUIDE.md) - Common issues and solutions

### Specialized Workflows

- [Keyguard Workflow](./guides/KEYGUARD_WORKFLOW_GUIDE.md) - AAC keyguard customization for clinicians

---

## Developer Guides

If you're setting up the project for development:

- [DEV_QUICK_START.md](./DEV_QUICK_START.md) - Clone, install, run dev server
- [TESTING.md](./TESTING.md) - Running unit and E2E tests
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Developer troubleshooting (Playwright, builds)
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - Branching and commit conventions

---

## Administrator Guides

For deploying and operating the application:

- [Deployment Guide](./DEPLOYMENT.md) - Cloudflare Pages, nginx, Apache, monitoring
- [Security Admin Guide](./SECURITY_ADMIN_GUIDE.md) - CSP, headers, compliance
- [Rollback Runbook](./ROLLBACK_RUNBOOK.md) - Production rollback procedures

---

## Compliance Documentation

- [VPAT (WCAG 2.2)](./vpat/VPAT-2.5-WCAG.md) - Voluntary Product Accessibility Template
- [Accessibility Conformance](./ACCESSIBILITY_CONFORMANCE.md) - WCAG 2.2 AA conformance statement
- [Conformance Decisions](./vpat/conformance-decisions.md) - WCAG criterion status tracking
- [Browser Support](./BROWSER_SUPPORT.md) - Supported browsers and versions
- [Known Issues](./KNOWN_ISSUES.md) - Current limitations and workarounds

> **Source of truth:** Use `conformance-decisions.md` + evidence files in `vpat/evidence/` for criterion-level status. `ACCESSIBILITY_CONFORMANCE.md` is a summary statement.

---

## Reference Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Module map and Mermaid diagrams
- [specs/PARAMETER_SCHEMA_SPEC.md](./specs/PARAMETER_SCHEMA_SPEC.md) - Customizer annotation JSON format
- [specs/UI_STANDARDS.md](./specs/UI_STANDARDS.md) - Component and styling standards
- [specs/CAMERA_CONTROLS_ACCESSIBILITY.md](./specs/CAMERA_CONTROLS_ACCESSIBILITY.md) - 3D camera accessibility
- [PERFORMANCE.md](./PERFORMANCE.md) - Bundle size, caching, worker architecture

---

## Folder Layout

```
docs/
  guides/      User and workflow guides
  specs/       Formal specifications
  vpat/        Accessibility compliance (VPAT, evidence)
  research/    Background research and experiments
  notes/       Dev logs by date (working notes)
  archive/     Old docs kept for git history
```
