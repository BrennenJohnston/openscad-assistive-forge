# AGENTS.md — Golden Rules for AI Coding Tools

This file is readable by any AI coding tool (Cursor, GitHub Copilot, Claude Code,
Windsurf, etc.). Copy it to your project root and fill in the `[CONFIGURE: ...]`
placeholders.

Tool-specific versions of these same rules:
- Cursor: `.cursor/rules/golden-rules.mdc`
- GitHub Copilot: `.github/copilot-instructions.md`
- Claude Code: `CLAUDE.md`

---

## 1. Golden rules (blocking errors)

1. NEVER modify protected files (see section 2 below). Breakage is catastrophic.
2. ALL interactive UI elements MUST have a visible `:focus-visible` ring, keyboard
   operability, and an accessible name.
3. Use design tokens for ALL colors, spacing, font sizes, and z-index values.
   Never hardcode visual values.
4. ALL animations MUST respect `prefers-reduced-motion: reduce`.
5. Prefer semantic HTML (`button`, `details/summary`, `fieldset/legend`) before ARIA.
6. Search for existing libraries and project modules before adding dependencies or
   writing new utility code.
7. Keep PRs small. One feature or fix per PR.

## 2. Protected files (never modify)

These files MUST NOT be edited by AI agents:

- `[CONFIGURE: paths to vendored binaries, e.g., public/wasm/, public/libraries/]`
- `[CONFIGURE: paths to vendored fonts, e.g., public/fonts/*.ttf]`
- `[CONFIGURE: paths to other protected files, e.g., LICENSE, SECURITY.md]`

## 3. Environment tool preference

When `[CONFIGURE: environment tool, e.g., Pixi]` is installed and a
`[CONFIGURE: config file, e.g., pixi.toml]` exists:

1. ALL commands MUST use `[CONFIGURE: prefix, e.g., pixi run]`
2. NEVER generate standalone shell scripts for tasks that have an equivalent
3. Check the config file for existing tasks before constructing commands
4. If no matching task exists, suggest adding one rather than creating a script

Exceptions: one-off file operations (mkdir, cp, mv), git commands, initial setup.

## 4. Commit convention

- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- `[CONFIGURE: commit authorship rule, e.g., "NEVER use git commit -m. Write message to .git/COMMIT_MSG and commit with git commit -F .git/COMMIT_MSG."]`
- Work from the `[CONFIGURE: default branch, e.g., develop]` branch
- Feature branches: `feat/short-name`, `fix/short-name`, etc.

## 5. Accessibility requirements

- WCAG target: `[CONFIGURE: e.g., WCAG 2.2 Level AA]`
- Minimum touch target: 44x44px (use `--size-touch-target` or equivalent token)
- Icon-only buttons require `aria-label`
- All five system preference media queries must be respected:
  `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`,
  `forced-colors`, `prefers-reduced-transparency`

## 6. Security boundaries

- NEVER remove or weaken security headers (COOP/COEP/CORP, CSP)
- NEVER add `unsafe-eval` or `unsafe-inline` to CSP
- NEVER lower dependency audit severity level
- NEVER commit secrets, credentials, or API keys
- `[CONFIGURE: additional security rules]`

## 7. Quality gates

Run before every PR:

- Lint: `[CONFIGURE: lint command]`
- Format: `[CONFIGURE: format command]`
- Unit tests: `[CONFIGURE: unit test command]`
- E2E tests: `[CONFIGURE: e2e test command]`
- `[CONFIGURE: additional quality gates]`
