# Maintainers Guide — OpenSCAD Assistive Forge

## Project Mission and Values

OpenSCAD Assistive Forge exists to make parametric 3D modelling accessible to everyone,
with a particular focus on designers of assistive technology — AAC keyguards, adaptive
switches, and other AT hardware. Every design decision prioritises:

1. **Accessibility first** — WCAG 2.2 compliance, screen reader support, keyboard-only
   workflows, and high-contrast theming are non-negotiable, not afterthoughts.
2. **AT-user empathy** — Features are evaluated against real AAC designer workflows, not
   abstract engineering taste.
3. **Stability over novelty** — The application is a production tool used daily by AT
   designers. Regressions cost real users real time.

---

## Maintainer Expectations

| Area | Expectation |
|---|---|
| **PR review turnaround** | Aim for first response within 7 days for community PRs, 48 h for bug fixes. |
| **Issue triage** | Label new issues within 7 days; close stale issues after 90 days with a comment. |
| **Accessibility testing** | Every PR that touches UI must be manually tested with keyboard-only navigation. Screen reader testing (NVDA/VoiceOver) is expected for new UI components. |
| **Code style** | ESLint + Prettier are enforced in CI. Run `npm run format` and `npm run lint` before opening a PR. |
| **Conventional commits** | Use [Conventional Commits](https://www.conventionalcommits.org/) format: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`, `ci:`. |

---

## Commit Conventions

```
<type>(<optional scope>): <short imperative summary>

[optional body — explain why, not what]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Examples:**
```
feat(presets): add replace-all import mode with confirmation dialog
fix(console): surface missing-include warnings from error.details path
docs(maintainers): add initial MAINTAINERS.md
```

---

## PR Template

When opening a pull request:

1. Reference the related issue (if any): `Closes #123`
2. Describe what changed and **why** (user impact)
3. List any accessibility considerations — new ARIA attributes, keyboard flows, etc.
4. Confirm you have run `npm run test:run` locally
5. Confirm keyboard-only navigation works for new/changed UI

---

## Release Process

1. Bump `version` in `package.json` and `pixi.toml`
2. Update `CHANGELOG.md` (if present) with a summary of changes
3. Create an annotated git tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
4. Push the tag: `git push origin vX.Y.Z`
5. Cloudflare Pages deploys automatically from the `main` branch

---

## How to Become a Maintainer

Maintainership is earned through sustained, high-quality contribution:

- At least 3 merged PRs that demonstrate domain understanding
- Familiarity with the AT-design workflow (AAC keyguard use case preferred)
- Willingness to review community PRs promptly and constructively
- Agreement to uphold the project's accessibility-first values

Reach out to an existing maintainer in an issue or discussion thread.

---

## Current Maintainers

| GitHub handle | Role |
|---|---|
| @BrennenJohnston | Project creator, lead maintainer |

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
All participants are expected to uphold it.

---

## Tech Stack Quick Reference

| Layer | Technology |
|---|---|
| Build | Vite 7, ES Modules |
| 3D Preview | Three.js |
| WASM Render | OpenSCAD compiled to WASM |
| UI | Vanilla JS, CSS custom properties |
| Testing | Vitest (unit), Playwright (E2E) |
| Accessibility | WCAG 2.2, axe-core, Lighthouse |
| Environment | pixi (optional), npm |
