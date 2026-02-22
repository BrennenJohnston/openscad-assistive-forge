# Project Rules for Claude Code

These rules apply to all AI-assisted work in this project. They match the rules
in `AGENTS.md`, formatted for Claude Code.

## Golden rules (blocking errors)

1. NEVER modify protected files: `[CONFIGURE: paths, e.g., public/wasm/, public/libraries/, public/fonts/*.ttf]`
2. ALL interactive UI must have `:focus-visible` ring, keyboard operability, accessible name.
3. Use design tokens — never hardcode colors, spacing, font sizes, z-index.
4. ALL animations must respect `prefers-reduced-motion: reduce`.
5. Semantic HTML before ARIA (`button`, `details/summary`, `fieldset/legend`).
6. Search for existing implementations before writing new code or adding dependencies.
7. Keep PRs small. One feature or fix per PR.

## Protected files

Do NOT edit these files under any circumstances:
- `[CONFIGURE: vendored binary paths]`
- `[CONFIGURE: vendored font paths]`
- `[CONFIGURE: other protected files]`

## Environment tool

When `[CONFIGURE: tool, e.g., Pixi]` is available with `[CONFIGURE: config file, e.g., pixi.toml]`:
- ALL commands via `[CONFIGURE: prefix, e.g., pixi run]`
- Never generate standalone scripts when a task exists
- Read task descriptions in the config file before constructing commands
- Suggest adding tasks rather than writing scripts

Exceptions: file operations, git commands, initial setup.

## Commit convention

- Prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- `[CONFIGURE: authorship rule, e.g., "Write to .git/COMMIT_MSG, commit with git commit -F .git/COMMIT_MSG"]`
- Base branch: `[CONFIGURE: e.g., develop]`
- Branch naming: `feat/short-name`, `fix/short-name`

## Accessibility requirements

- Target: `[CONFIGURE: e.g., WCAG 2.2 Level AA]`
- Touch targets: 44x44px minimum
- Icon-only buttons: require `aria-label`
- Respect all system preferences: `prefers-color-scheme`, `prefers-reduced-motion`,
  `prefers-contrast`, `forced-colors`, `prefers-reduced-transparency`

## Security boundaries

- NEVER weaken security headers (COOP/COEP/CORP, CSP)
- NEVER add `unsafe-eval` or `unsafe-inline` to CSP
- NEVER lower audit severity level
- NEVER commit secrets or credentials
- `[CONFIGURE: additional security rules]`

## Quality gates

Before every PR:
- `[CONFIGURE: lint command]`
- `[CONFIGURE: format command]`
- `[CONFIGURE: unit test command]`
- `[CONFIGURE: e2e test command]`
- `[CONFIGURE: additional gates]`
