# GitHub Copilot Instructions

These rules apply to all AI-assisted work in this project. They match the rules
in `AGENTS.md` and `CLAUDE.md`, formatted for GitHub Copilot.

## 1. Golden rules (blocking errors)

1. NEVER modify protected files (see section 2).
2. ALL interactive UI must have `:focus-visible` ring, keyboard operability, accessible name.
3. Use design tokens — never hardcode colors, spacing, font sizes, z-index.
4. ALL animations must respect `prefers-reduced-motion: reduce`.
5. Semantic HTML before ARIA (`button`, `details/summary`, `fieldset/legend`).
6. Search for existing implementations before writing new code or adding dependencies.
7. Keep PRs small. One feature or fix per PR.

## 2. Protected files (never modify)

- `[CONFIGURE: vendored binary paths, e.g., public/wasm/, public/libraries/]`
- `[CONFIGURE: vendored font paths, e.g., public/fonts/*.ttf]`
- `[CONFIGURE: other protected files]`

## 3. Environment tool enforcement

When `[CONFIGURE: environment tool, e.g., Pixi]` is installed and a `[CONFIGURE: config
file, e.g., pixi.toml]` exists in the project root:

1. ALL commands MUST be prefixed with `[CONFIGURE: prefix, e.g., pixi run]`
2. NEVER generate raw bash/zsh/PowerShell scripts for tasks that have a
   `[CONFIGURE: tool]` equivalent
3. Before running any command, CHECK the `[CONFIGURE: config file]` for an existing
   task that matches the intent
4. If no matching task exists, SUGGEST adding one to `[CONFIGURE: config file]` rather
   than creating a standalone script
5. The `[CONFIGURE: config file]` task descriptions are AUTHORITATIVE context for
   what each command does — read them before asking the user

### Exceptions

- One-off file operations (mkdir, cp, mv) that are not project tasks
- Git commands (git add, git commit, git push)
- Package manager commands that are part of environment setup (npm ci, pip install)
  UNLESS the `[CONFIGURE: tool]` has a setup task

## 4. Commit convention

- Conventional commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- `[CONFIGURE: authorship rule]`
- Base branch: `[CONFIGURE: e.g., develop]`
- Branch naming: `feat/short-name`, `fix/short-name`

## 5. Accessibility requirements

- Target: `[CONFIGURE: e.g., WCAG 2.2 Level AA]`
- Touch targets: 44x44px minimum
- Icon-only buttons: require `aria-label`
- Respect all system preferences: `prefers-color-scheme`, `prefers-reduced-motion`,
  `prefers-contrast`, `forced-colors`, `prefers-reduced-transparency`

## 6. Security boundaries

- NEVER weaken security headers (COOP/COEP/CORP, CSP)
- NEVER add `unsafe-eval` or `unsafe-inline` to CSP
- NEVER lower audit severity level
- NEVER commit secrets or credentials

## 7. Quality gates

Before every PR:
- `[CONFIGURE: lint command]`
- `[CONFIGURE: format command]`
- `[CONFIGURE: unit test command]`
- `[CONFIGURE: e2e test command]`
