# Documentation Inventory and Decisions

Inventory created: 2026-01-27

This is the decision log for the documentation style audit. Each file gets a status: keep, rewrite, move, merge, or archive.

## Root-level Files (keep as-is, legal/standard)

| File | Decision | Notes |
|------|----------|-------|
| README.md | Keep, verify claims | Good tone, verify links and features |
| CHANGELOG.md | Keep | Standard file |
| CONTRIBUTING.md | Keep | Standard file |
| PROJECT_STATUS.md | Keep | Already has single-dev voice |
| THIRD_PARTY_NOTICES.md | Keep | Legal file |
| CREDITS.md | Keep | Attribution |
| CODE_OF_CONDUCT.md | Keep | Standard legal |
| SECURITY.md | Keep | Standard legal |

## docs/ Root Files

| File | Decision | Notes |
|------|----------|-------|
| docs/README.md | Rewrite | Remove emoji markers, make it a real index |
| docs/DEV_QUICK_START.md | Rewrite | Heavy emoji, over-structured |
| docs/TESTING.md | Keep | Already good style |
| docs/DEPLOYMENT.md | Keep | Clean and minimal |
| docs/PERFORMANCE.md | Rewrite | Too formal, checkbox lists, AI patterns |
| docs/TROUBLESHOOTING.md | Rewrite | Emoji markers, checkbox formatting |
| docs/QUICK_REFERENCE.md | Keep | Short, useful |
| docs/DEVELOPMENT_WORKFLOW.md | Verify | Check tone |
| docs/RELEASING.md | Verify | Check tone |
| docs/MOBILE_LIMITATIONS.md | Verify | Check tone |
| docs/CAMERA_CONTROLS_ACCESSIBILITY.md | Move to specs/ | Technical spec, not a guide |

## docs/guides/

| File | Decision | Notes |
|------|----------|-------|
| ACCESSIBILITY_GUIDE.md | Rewrite | Soften tone, keep structure |
| UI_STANDARDS.md | Move to specs/ | This is a design spec |
| COLOR_SYSTEM_GUIDE.md | Verify | Check for AI patterns |
| KEYGUARD_WORKFLOW_GUIDE.md | Rewrite | Emoji markers, overly formal |
| SECURITY_TESTING.md | Rewrite | Emoji markers, checkbox formatting |
| CHOOSING_FORGE_VS_PLAYGROUND.md | Verify | |
| WELCOME_SCREEN.md | Verify | |

## docs/research/ (keep all, add status lines)

| File | Status |
|------|--------|
| CLOUDFLARE_VALIDATION.md | Keep, still relevant |
| COMPARABLE_PROJECTS.md | Keep, background info |
| SAVED_PROJECTS_REFERENCE.md | Keep, design notes |
| TUTORIAL_DESIGN_RESEARCH.md | Keep, UX research |
| WASM_THREADING_ANALYSIS.md | Keep, performance notes |

## docs/specs/

| File | Status |
|------|--------|
| PARAMETER_SCHEMA_SPEC.md | Keep, formal spec is appropriate here |

## docs/notes/ (keep all, working docs)

All notes in dated folders stay. They're dev logs.

## docs/archive/

| File | Status |
|------|--------|
| README.md | Keep, already explains the folder |

## Subfolder READMEs

| File | Decision | Notes |
|------|----------|-------|
| scripts/README.md | Rewrite | Heavy emoji, feature lists |
| public/libraries/README.md | Light rewrite | Slightly formal |
| public/icons/README.md | Keep | Reference tables fit |
| public/fonts/README.md | Keep | Already minimal |

## .github/ (keep all, templates)

All files in `.github/` stay as-is. Templates and config.

---

## Consolidation Rules

1. `docs/` is the single home for developer documentation
2. `docs/specs/` gets technical specs (move CAMERA_CONTROLS_ACCESSIBILITY.md, UI_STANDARDS.md there)
3. Subfolder READMEs only stay if they're truly local to that folder
4. `docs/README.md` becomes the canonical "start here" index

## Priority Order for Rewrites

1. docs/README.md (set the story first)
2. Root README.md (verify claims)
3. scripts/README.md (high-touch, emoji heavy)
4. docs/DEV_QUICK_START.md (new devs see this)
5. docs/TROUBLESHOOTING.md
6. docs/PERFORMANCE.md
7. docs/guides/SECURITY_TESTING.md
8. docs/guides/KEYGUARD_WORKFLOW_GUIDE.md
9. public/libraries/README.md
10. Create docs/ARCHITECTURE.md (diagrams)
