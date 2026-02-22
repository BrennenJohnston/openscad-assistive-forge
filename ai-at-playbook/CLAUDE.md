# Project Rules for Claude Code

These rules apply to all AI-assisted work in this project. They match the rules
in `AGENTS.md`, formatted for Claude Code.

## Golden rules (blocking errors)

1. NEVER modify protected files (see Protected files section below).
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
- `public/wasm/` — OpenSCAD WASM runtime (official builds, binary)
- `public/libraries/` — vendored OpenSCAD libraries
- `public/fonts/*.ttf` — vendored font files
- `LICENSE`, `SECURITY.md` — legal / security policy
- `public/sw.js` — service worker (high care, controls offline/caching)
- `src/worker/openscad-worker.js` — WASM interface (high care)
- `src/js/parser.js` — OpenSCAD customizer parser (high care)
- `src/js/validation-constants.js` — security boundary constants (moderate care)

## Environment tool

Pixi is the optional environment tool. The `pixi.toml` defines all project
tasks with descriptions. When Pixi is installed:
- ALL commands via `pixi run`
- Never generate standalone scripts when a task exists
- Read task descriptions in `pixi.toml` before constructing commands
- Suggest adding tasks rather than writing scripts

When Pixi is **not** installed, fall back to the equivalent `npm run` commands
from `package.json`. The tasks are thin wrappers around npm scripts.

Exceptions: file operations, git commands, initial setup.

## Commit convention

- Prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`, `ci:`
- NEVER use `git commit -m`. Write message to `.git/COMMIT_MSG` and commit with
  `git commit -F .git/COMMIT_MSG`.
- Base branch: `develop`
- Branch naming: `feat/short-name`, `fix/short-name`
- PR descriptions MUST note when AI was used to generate code. Use label
  `ai-assisted` and describe which parts were AI-generated.
- Use commit trailers for AI disclosure: `Assisted-By: <tool>` for AIL-1 work,
  `Generated-By: <tool>` for AIL-2 work.

## Accessibility requirements

- Target: WCAG 2.2 Level AA
- Touch targets: 44x44px minimum
- Icon-only buttons: require `aria-label`
- Respect all system preferences: `prefers-color-scheme`, `prefers-reduced-motion`,
  `prefers-contrast`, `forced-colors`, `prefers-reduced-transparency`

## Security boundaries

- NEVER weaken security headers (COOP/COEP/CORP, CSP)
- NEVER add `unsafe-eval` or `unsafe-inline` to CSP
- NEVER lower audit severity level
- NEVER commit secrets or credentials
- NEVER modify WASM binary files — use the documented update procedure in `.cursor/rules/gold-standard.md`

## Quality gates

Before every PR:
- `npm run lint`
- `npm run format`
- `npm run test:run`
- `npm run test:e2e`
- `npm run check-bundle`

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
