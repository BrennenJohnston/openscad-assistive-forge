# Golden rules for AI agents

If you point an AI coding agent at this repository, these are the rules I
hold my own sessions to. They exist because each one was learned the hard
way here. `.cursor/rules/` carries the same rules in Cursor's format;
CLAUDE.md points here.

## 1. Golden rules (blocking)

- NEVER modify protected files: `public/wasm/`, `public/liblouis/`,
  `public/libraries/`, `public/fonts/`, `LICENSE`, any `INTEGRITY.json`,
  anything under a `vendor/` path. Debug the calling code instead.
- ALL interactive UI MUST have a `:focus-visible` ring, keyboard
  operability, and an accessible name.
- Use design tokens (CSS custom properties) for ALL colors, spacing, font
  sizes and z-index. Never hardcode them.
- ALL animation MUST respect `prefers-reduced-motion: reduce`.
- Semantic HTML before ARIA (`button`, `details/summary`,
  `fieldset/legend`, real headings). ARIA is a repair tool.
- Search for an existing implementation before writing a new function or
  adding a dependency. New dependencies need my sign-off.
- Keep PRs small. One feature or fix per PR.
- NEVER delegate source reading, analysis, or judgement to subagents or
  smaller models. The primary model performs all comprehension-critical
  reasoning itself.
- Never remove or weaken an existing accessibility feature. An
  accessibility failure is a product failure even when the code "works".

## 2. Protected files

Do NOT edit:

- `public/wasm/openscad-official/` — the vendored OpenSCAD engine, pinned
  by `INTEGRITY.json`. Replacing it is an owner-signed operation.
- `public/liblouis/` and the liblouis tables it is built from — braille
  output is accessibility-critical; no table moves without a translation
  parity check and my signature.
- `public/libraries/`, `public/fonts/` — vendored third-party assets.
- Security headers in `public/_headers` — never weaken CSP/COOP/COEP,
  never add `unsafe-eval` or `unsafe-inline`.

## 3. Commands

npm is the environment tool. All tasks run through `npm run`; the task
list lives in `package.json` and the script reference in
`scripts/README.md` — read those before constructing commands. Never
generate standalone shell scripts for tasks that already exist.

## 4. Commit convention

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Base branch: `develop`. Branch naming: `feat/short-name`,
  `fix/short-name`.
- Never `git add -A`; stage the files you mean.
- Never rewrite merged history.

## 5. Accessibility requirements

- Target: WCAG 2.2 Level AA (the VPAT under `docs/vpat/` is the record).
- Touch targets: 44×44 px minimum. Never shrink an existing target.
- Icon-only buttons require `aria-label`; decorative graphics are hidden
  from assistive tech.
- Respect `prefers-color-scheme`, `prefers-reduced-motion`,
  `prefers-contrast`, `forced-colors`.
- Accessibility-critical text (alt text, ARIA labels, error messages,
  live-region announcements) is flagged for my review, never silently
  finalized.
- A probe or score is not a verdict: Lighthouse can read 100 while real
  screen-reader failures remain. `docs/notes/SCREEN_READER_LESSONS.md`
  carries the rules announcements follow here.

## 6. Security boundaries

- NEVER weaken security headers (CSP, COOP/COEP/CORP).
- NEVER add `unsafe-eval` or `unsafe-inline` to the CSP.
- NEVER commit secrets or credentials.
- No silent error-swallowing: no empty catch, no log-and-continue on a
  failure path.

## 7. Quality gates (before every PR)

```bash
npm run lint
npm run format:check
npm run test:run       # the unit board - check the file count
npm run test:e2e       # Playwright; Windows runs one worker by design
npm run check-bundle   # both budget numbers
```

A task is not complete until its named verification has actually run and
passed, with real output. Never describe a check as passed without
running it.
