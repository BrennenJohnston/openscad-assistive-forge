---
name: "Looking for Maintainers"
about: "Community call for co-maintainers and regular contributors"
title: "Looking for Maintainers"
labels: ["help wanted", "good first issue"]
assignees: BrennenJohnston
---

## Looking for Maintainers

**OpenSCAD Assistive Forge** is an accessibility-first, browser-based OpenSCAD customizer
used daily by AAC keyguard designers and other assistive technology creators. The project
is stable, in active use, and ready to welcome co-maintainers.

---

### Project Overview

- **What it does:** Lets AT designers customise parametric SCAD files (e.g. AAC keyguards
  for iPads) and export 3D-printable STL files — entirely in the browser, without installing
  OpenSCAD.
- **Who uses it:** AAC practitioners, occupational therapists, and maker-community members
  who create custom AT hardware.
- **Tech stack:** Vite, vanilla JS, Three.js, OpenSCAD WASM, Playwright, Vitest.
- **Accessibility commitments:** WCAG 2.2, screen reader support (NVDA/VoiceOver),
  keyboard-only workflows, high-contrast theming.

---

### Current State

- Stable — actively used in production by AT designers
- Test coverage — Vitest unit tests + Playwright E2E suite
- CI — Cloudflare Pages deploys on every merge to `main`
- Good documentation — README, inline JSDoc, sprint plans

---

### What Help Is Needed

| Area | Details |
|---|---|
| **Code review** | Review community PRs for correctness, accessibility, and code style |
| **Bug fixes** | Triage and fix issues filed by real AT users |
| **Feature development** | Implement items from the sprint backlog (see linked plan) |
| **Accessibility testing** | Manual NVDA / VoiceOver / keyboard-only QA on new features |
| **Documentation** | Improve tutorials, features guide, and README |

---

### What the Creator Provides

- Full context on every feature and design decision (happy to pair or answer questions in issues)
- Domain guidance on AAC / AT use cases
- Code review on your PRs
- Commit access once you've demonstrated consistent, quality contribution

---

### How to Get Involved

1. **Fork the repo** and pick any open issue tagged `help wanted` or `good first issue`
2. Read [`MAINTAINERS.md`](../../MAINTAINERS.md) for commit conventions and PR expectations
3. Open a PR — even small fixes are welcome
4. Comment here or on the issue if you'd like to pair on a task

No prior AAC experience required — curiosity and care for accessibility are enough.

---

### Tech Stack Summary

Vite · Vanilla JS (ES Modules) · Three.js · OpenSCAD WASM · Playwright · Vitest ·
CSS Custom Properties · WCAG 2.2
