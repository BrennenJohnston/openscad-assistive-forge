# Contributing

Thanks for your interest in contributing to **OpenSCAD Web Customizer Forge**.

This project’s core goal is to make **one of the most accessible SCAD interfaces available**. Contributions that improve accessibility, clarity, and reliability are especially welcome.

## Quick start (local dev)

### Prerequisites

- Node.js **18+**

### Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## What to work on

- **Accessibility improvements** (keyboard navigation, focus management, ARIA, contrast, reduced motion)
- **Better error messages** for common OpenSCAD/CGAL failures
- **Examples**: add or improve models in `public/examples/`
- **Docs**: make onboarding and usage clearer
- **Tests**: improve unit/E2E coverage for new behavior

## Development workflow

### Code style

- Run formatting: `npm run format`
- Run linting: `npm run lint`

### Tests

```bash
# unit tests
npm run test:run

# e2e tests (safe wrapper)
npm run test:e2e
```

On Windows, see `docs/TROUBLESHOOTING.md#playwright-terminal-hangs-windows` if Playwright gets stuck.

### Asset setup (optional)

```bash
npm run setup-wasm
npm run setup-libraries
```

## Accessibility acceptance checklist (for UI changes)

When you change UI behavior or markup, please verify:

- [ ] **Keyboard-only**: feature is usable without a mouse
- [ ] **Visible focus**: focus order makes sense and focus rings are visible
- [ ] **Screen reader**: controls have names/labels; status changes are announced when needed
- [ ] **Reduced motion**: animations are not required for understanding/operation
- [ ] **High contrast**: content remains readable and controls remain discoverable
- [ ] **Touch targets**: tap targets remain usable at small viewports

If you add new interactive patterns, prefer semantic HTML (`button`, `details/summary`, `fieldset/legend`, etc.) before adding ARIA.

## UI styling standards (for theme-consistent UI changes)

For drawer headers, icons, spacing, and token usage across **all themes** (including **high contrast** and **forced-colors**), follow:

- `docs/guides/UI_STANDARDS.md`

## Submitting changes

- Keep PRs focused: one behavior change per PR when possible.
- Include a short test plan in your PR description (what you ran, what you clicked).
- If your change impacts accessibility, say **what you tested** (keyboard + at least one screen reader if available).

## License

By contributing, you agree that your contributions will be licensed under the project license: **GPL-3.0-or-later** (see `LICENSE`).

