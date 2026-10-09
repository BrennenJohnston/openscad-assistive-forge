# Contributing

Thanks for taking a look.

This is a one-person project, so I try to keep things easy to understand and hard to break. Accessibility improvements are always welcome.

## Local setup

Clone and run the app as the [README](../README.md#develop-locally) describes.

## What helps most

- Fixes for accessibility issues (keyboard traps, focus order, labeling, contrast, motion)
- Better error messages for common OpenSCAD / CGAL failures
- Example models in `public/examples/`. There is a walkthrough in
  [docs/guides/TILE_AUTHOR_GUIDE.md](../docs/guides/TILE_AUTHOR_GUIDE.md) and a
  template to copy in `public/examples/_template/`. You do not need to know the
  app's code to add one.
- Docs that help real people use the app
- Tests for bug fixes and new behavior

## How a change gets in

1. Branch from `develop` (`fix/short-name`, `feat/short-name`, `docs/short-name`).
2. Open a pull request into `develop`. Keep it to one change a user would
   notice, or one coherent piece of housekeeping.
3. The checks have to pass. I squash-merge, so the pull request title becomes
   the one commit on `develop`.

`main` is the released version. [Releasing](../docs/project/RELEASING.md) says
how it moves.

### Pull request titles

The title is the commit message, so write it like one:

- `type(scope): what changed`, for example
  `fix(braille): keep the charm's dots inside the ADA ranges`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, `chore`
- 72 characters or fewer
- Plain words. No ticket codes or private shorthand.

### Pull request descriptions

Short is fine: what changed, and how you checked it (what you ran or clicked).
If you changed text that people read or hear (labels, alt text, error
messages, screen reader announcements), list it so I can review the wording.

### Changelog

If a user would notice the change, add one line under "Unreleased" in
`CHANGELOG.md`.

## Checks

- Format: `npm run format`
- Lint: `npm run lint`
- Unit tests: `npm run test:run`
- Browser tests: `npm run test:e2e`. A new spec can use the shared checks in
  `tests/e2e/helpers/invariants.js` (page errors, focus lost to the page body,
  markup shown as text); `docs/developing/TESTING.md` lists them.
- Example models: `npm run validate:example public/examples/<your-folder>`

On Windows, see `docs/developing/TROUBLESHOOTING.md#playwright-terminal-hangs-windows` if Playwright gets stuck.

## Accessibility checklist (for UI changes)

Please sanity-check:

- [ ] Keyboard-only: feature works without a mouse
- [ ] Focus: visible focus ring + sensible focus order
- [ ] Screen reader: controls have names/labels; status changes are announced when needed
- [ ] Reduced motion: no animation is required to understand/operate
- [ ] High contrast: still readable and usable
- [ ] Touch targets: at least 44 x 44 px, and never smaller than before

If you're adding a new interactive pattern, prefer semantic HTML (`button`, `details/summary`, `fieldset/legend`, etc.) before adding ARIA.

## UI consistency (so the themes don't explode)

- Use the existing tokens in `src/styles/variables.css` and `src/styles/semantic-tokens.css`
- Avoid hardcoded colors when a token exists
- Test light/dark/high-contrast (and forced-colors if you can)

## Files I ask you not to edit

The vendored engines and data: `public/wasm/`, `public/liblouis/`,
`public/libraries/`, `public/fonts/`, `vendor/`, and `LICENSE`. If one of them
looks like the problem, open an issue and I will look at the code that calls it.

## AI tools

[How I use AI tools](../docs/project/AI_USE.md) covers my own use and what I
ask of contributors who use them.

## License

By contributing, you agree your contributions are licensed under GPL-3.0-or-later (see `LICENSE`).
