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
8. NEVER delegate comprehension-critical tasks (reading, analyzing, summarizing
   source documents) to subagents or lower-tier models. The model that reasons
   over source material must be the primary model in the session.
9. Give AI one function or component at a time. Never give AI a whole feature,
   module, or architectural decision. Each AI task must have clearly defined
   inputs, outputs, and boundaries.

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

ALL shell commands issued by AI agents MUST run inside the project's
environment tool. Never default to bash, zsh, or PowerShell directly. Use the
environment tool's task runner for all build, test, lint, and serve operations.
If a task does not exist in the config file, propose adding it rather than
running a raw command.

Exceptions: one-off file operations (mkdir, cp, mv), git commands, initial setup.

## 4. Commit convention

- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- `[CONFIGURE: commit authorship rule, e.g., "NEVER use git commit -m. Write message to .git/COMMIT_MSG and commit with git commit -F .git/COMMIT_MSG."]`
- Work from the `[CONFIGURE: default branch, e.g., develop]` branch
- Feature branches: `feat/short-name`, `fix/short-name`, etc.
- PR descriptions MUST note when AI was used to generate code. Use the label
  `[CONFIGURE: AI disclosure label, e.g., ai-assisted]` and briefly describe
  which parts were AI-generated.
- Use commit trailers for AI disclosure: `Assisted-By: <tool>` for AIL-1 work,
  `Generated-By: <tool>` for AIL-2 work. Place the trailer on the last line of
  the commit message body.

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

### Test-first for AI-generated code

When AI generates implementation code, tests for that code MUST already exist OR
be written by a human first. Tests serve as the specification. AI-generated code
that passes existing tests is acceptable; AI-generated tests of AI-generated
code are not a sufficient quality gate.

### Gold standard pattern

Before AI replicates a component pattern, a human-crafted "gold standard"
implementation must exist. AI's role is pattern replication, not architectural
design. The gold standard must be reviewed and approved before AI extends it.

### Complexity removal as progress

Measure progress by code removed, not just code added. PRs that delete
unnecessary abstractions, reduce dependencies, or simplify interfaces are
valuable. If a file can be deleted without breaking tests, it should be.
