# Contributing

Hey — thanks for taking a look.

This is a one-person project, so I’m mostly trying to keep things easy to understand and hard to break. Accessibility improvements are always welcome.

## Local dev

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

**Alternative (Pixi):** If you have [Pixi](https://pixi.sh/) installed, you can
use `pixi run` instead of `npm run` for any task. Pixi provides a reproducible
environment with Node.js pinned via conda-forge. See `pixi.toml` for all
available tasks and their descriptions.

```bash
pixi install
pixi run dev
```

## What’s helpful

- Fixes for accessibility issues (keyboard traps, focus order, labeling, contrast, motion)
- Better error messages for common OpenSCAD / CGAL failures
- Example models in `public/examples/`
- Docs that help real people use the app
- Tests for bug fixes and new behavior

## Workflow

There’s a longer writeup in `docs/DEVELOPMENT_WORKFLOW.md`. The short version:

- Work from `develop`
- Keep PRs small when possible
- Include a quick test plan in the PR description (what you ran / clicked)

## Code quality

- Format: `npm run format`
- Lint: `npm run lint`
- Unit tests: `npm run test:run`
- E2E tests: `npm run test:e2e`

On Windows, see `docs/TROUBLESHOOTING.md#playwright-terminal-hangs-windows` if Playwright gets stuck.

## Accessibility checklist (for UI changes)

Please sanity-check:

- [ ] Keyboard-only: feature works without a mouse
- [ ] Focus: visible focus ring + sensible focus order
- [ ] Screen reader: controls have names/labels; status changes are announced when needed
- [ ] Reduced motion: no animation is required to understand/operate
- [ ] High contrast: still readable and usable
- [ ] Touch targets: still reasonable on small screens

If you’re adding a new interactive pattern, prefer semantic HTML (`button`, `details/summary`, `fieldset/legend`, etc.) before adding ARIA.

## UI consistency (so the themes don’t explode)

- Use the existing tokens in `src/styles/variables.css` and `src/styles/semantic-tokens.css`
- Avoid hardcoded colors when a token exists
- Test light/dark/high-contrast (and forced-colors if you can)

## License

By contributing, you agree your contributions are licensed under GPL-3.0-or-later (see `LICENSE`).

