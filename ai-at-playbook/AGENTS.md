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

- `public/wasm/` — OpenSCAD WASM runtime (official builds, binary)
- `public/libraries/` — vendored OpenSCAD libraries
- `public/fonts/*.ttf` — vendored font files
- `LICENSE`, `SECURITY.md` — legal / security policy
- `public/sw.js` — service worker (high care, controls offline/caching)
- `src/worker/openscad-worker.js` — WASM interface (high care)
- `src/js/parser.js` — OpenSCAD customizer parser (high care)
- `src/js/validation-constants.js` — security boundary constants (moderate care)

## 3. Environment tool preference

Pixi is the optional environment tool. The `pixi.toml` defines all project
tasks with descriptions. When Pixi is installed:

1. ALL commands MUST use `pixi run`
2. NEVER generate standalone shell scripts for tasks that have an equivalent
3. Check `pixi.toml` for existing tasks before constructing commands
4. If no matching task exists, suggest adding one rather than creating a script

When Pixi is **not** installed, fall back to the equivalent `npm run` commands
from `package.json`. The `pixi.toml` tasks are thin wrappers around npm scripts,
so the behavior is identical.

Exceptions: one-off file operations (mkdir, cp, mv), git commands, initial setup.

## 4. Commit convention

- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`, `ci:`
- NEVER use `git commit -m`. Write message to `.git/COMMIT_MSG` and commit with
  `git commit -F .git/COMMIT_MSG`.
- Work from the `develop` branch
- Feature branches: `feat/short-name`, `fix/short-name`, etc.
- PR descriptions MUST note when AI was used to generate code. Use the label
  `ai-assisted` and briefly describe which parts were AI-generated.
- Use commit trailers for AI disclosure: `Assisted-By: <tool>` for AIL-1 work,
  `Generated-By: <tool>` for AIL-2 work. Place the trailer on the last line of
  the commit message body.

## 5. Accessibility requirements

- WCAG target: WCAG 2.2 Level AA
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
- NEVER modify WASM binary files — use the documented update procedure in `.cursor/rules/gold-standard.md`

## 7. Quality gates

Run before every PR:

- Lint: `npm run lint`
- Format: `npm run format`
- Unit tests: `npm run test:run`
- E2E tests: `npm run test:e2e`
- Bundle budget: `npm run check-bundle`

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
