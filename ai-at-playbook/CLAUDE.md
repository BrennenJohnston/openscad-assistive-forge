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
8. NEVER delegate comprehension-critical tasks (reading, analyzing, summarizing
   source documents) to subagents or lower-tier models. The model that reasons
   over source material must be the primary model in the session.
9. Give AI one function or component at a time. Never give AI a whole feature,
   module, or architectural decision.

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
- ALL shell commands MUST run inside the environment tool. Never default to
  bash, zsh, or PowerShell directly.

Exceptions: file operations, git commands, initial setup.

## Commit convention

- Prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- `[CONFIGURE: authorship rule, e.g., "Write to .git/COMMIT_MSG, commit with git commit -F .git/COMMIT_MSG"]`
- Base branch: `[CONFIGURE: e.g., develop]`
- Branch naming: `feat/short-name`, `fix/short-name`
- PR descriptions MUST note when AI was used to generate code. Use label
  `[CONFIGURE: AI disclosure label]` and describe which parts were AI-generated.
- Use commit trailers for AI disclosure: `Assisted-By: <tool>` for AIL-1 work,
  `Generated-By: <tool>` for AIL-2 work.

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

## Test-first for AI-generated code

When AI generates implementation code, tests MUST already exist OR be written by
a human first. Tests are the spec. AI-generated tests of AI-generated code are
not a sufficient quality gate.

## Gold standard pattern

Before AI replicates a pattern, a human-crafted gold standard must exist and be
reviewed. AI replicates; humans design.

## Complexity removal as progress

Measure progress by code removed, not just code added. PRs that delete
unnecessary abstractions or simplify interfaces are valuable.
