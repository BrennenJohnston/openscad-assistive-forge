# Release Audit Checklist

Started: 2026-02-23
Last updated: 2026-02-23

## Status Key

- `[ ]` Unchecked
- `[x]` Reviewed, no changes needed
- `[E]` Reviewed and edited
- `[D]` Flagged for documentation review (higher-model)
- `[S]` Skipped (vendor/generated/third-party)

---

## Phase 1: Core Application

### Session 1 — Entry Points and State Management

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | index.html | 1 | 0 blocking, 0 warnings | Clean; 3 informational comments noting removed panels (intentional) |
| [x] | src/main.js | 1 | 0 blocking, 0 warnings | Assessment only (17K lines). Findings: (1) commented-out animation import line 191 (intentional, preserved per comment); (2) `_stopMemoryPolling` defined but never called line 4620 (prefixed `_`, intentional reservation); (3) `window._showRenderEstimate` debug export line 4873 (intentional); (4) `openGuidedTour` stub with TODO line 16236 (known future work). No edits made per plan protocol. |
| [x] | src/js/state.js | 1 | 0 blocking, 0 warnings | Clean. Verbose console.log on every draft save (lines 217, 252, 257, 272) — noted but not edited (no dev-only guard pattern established in codebase). |
| [x] | src/js/version.js | 1 | 0 blocking, 0 warnings | Clean. |
| [x] | src/js/feature-flags.js | 1 | 0 blocking, 0 warnings | Clean. Emoji in debugFlags() console output is acceptable (debug-only function). |
| [x] | src/js/storage-keys.js | 1 | 0 blocking, 0 warnings | Clean. |

### Session 2 — UI Generation and Mode Control

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/ui-generator.js | 2 | - | - |
| [ ] | src/js/ui-mode-controller.js | 2 | - | - |
| [ ] | src/js/mode-manager.js | 2 | - | - |
| [ ] | src/js/toolbar-menu-controller.js | 2 | - | - |
| [ ] | src/js/html-utils.js | 2 | - | - |
| [ ] | src/js/drawer-controller.js | 2 | - | - |
| [ ] | src/js/display-options-controller.js | 2 | - | - |
| [ ] | src/js/file-actions-controller.js | 2 | - | - |

### Session 3 — Editors and Text Handling

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/monaco-editor.js | 3 | - | - |
| [ ] | src/js/textarea-editor.js | 3 | - | - |
| [ ] | src/js/editor-state-manager.js | 3 | - | - |
| [ ] | src/js/edit-actions-controller.js | 3 | - | - |
| [ ] | src/js/console-panel.js | 3 | - | - |
| [ ] | src/js/error-log-panel.js | 3 | - | - |

### Session 4 — Rendering Pipeline

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/preview.js | 4 | - | - |
| [ ] | src/js/render-controller.js | 4 | - | - |
| [ ] | src/js/render-queue.js | 4 | - | - |
| [ ] | src/js/auto-preview-controller.js | 4 | - | - |
| [ ] | src/js/quality-tiers.js | 4 | - | - |
| [ ] | src/js/camera-panel-controller.js | 4 | - | - |
| [ ] | src/worker/openscad-worker.js | 4 | - | - |

### Session 5 — Storage, Projects, and Presets

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/storage-manager.js | 5 | - | - |
| [ ] | src/js/saved-projects-manager.js | 5 | - | - |
| [ ] | src/js/preset-manager.js | 5 | - | - |

### Session 6 — Parsing, Schema, and Manifest

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/parser.js | 6 | - | - |
| [ ] | src/js/schema-generator.js | 6 | - | - |
| [ ] | src/js/manifest-loader.js | 6 | - | - |
| [ ] | src/js/validation-schemas.js | 6 | - | - |
| [ ] | src/js/validation-constants.js | 6 | - | - |

### Session 7 — Accessibility and Input

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/announcer.js | 7 | - | - |
| [ ] | src/js/focus-trap.js | 7 | - | - |
| [ ] | src/js/keyboard-config.js | 7 | - | - |
| [ ] | src/js/searchable-combobox.js | 7 | - | - |
| [ ] | src/js/gamepad-controller.js | 7 | - | - |
| [ ] | src/js/modal-manager.js | 7 | - | - |
| [ ] | src/js/param-detail-controller.js | 7 | - | - |

### Session 8 — Utilities, Features, and Remaining Modules

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/js/zip-handler.js | 8 | - | - |
| [ ] | src/js/download.js | 8 | - | - |
| [ ] | src/js/error-translator.js | 8 | - | - |
| [ ] | src/js/color-utils.js | 8 | - | - |
| [ ] | src/js/unit-sync.js | 8 | - | - |
| [ ] | src/js/comparison-controller.js | 8 | - | - |
| [ ] | src/js/comparison-view.js | 8 | - | - |
| [ ] | src/js/image-measurement.js | 8 | - | - |
| [ ] | src/js/shared-image-store.js | 8 | - | - |
| [ ] | src/js/tutorial-sandbox.js | 8 | - | - |
| [ ] | src/js/workflow-progress.js | 8 | - | - |
| [ ] | src/js/preview-settings-drawer.js | 8 | - | - |
| [ ] | src/js/design-panel-controller.js | 8 | - | - |
| [ ] | src/js/animation-controller.js | 8 | - | - |
| [ ] | src/js/theme-manager.js | 8 | - | - |
| [ ] | src/js/dependency-checker.js | 8 | - | - |
| [ ] | src/js/library-manager.js | 8 | - | - |
| [ ] | src/js/sw-manager.js | 8 | - | - |
| [ ] | src/js/memory-monitor.js | 8 | - | - |
| [ ] | src/js/csp-reporter.js | 8 | - | - |
| [ ] | src/js/_hfm.js | 8 | - | - |
| [ ] | src/js/_seq.js | 8 | - | - |

---

## Phase 2: Stylesheets

### Session 9 — All CSS

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | src/styles/main.css | 9 | - | - |
| [ ] | src/styles/reset.css | 9 | - | - |
| [ ] | src/styles/variables.css | 9 | - | - |
| [ ] | src/styles/semantic-tokens.css | 9 | - | - |
| [ ] | src/styles/color-scales.css | 9 | - | - |
| [ ] | src/styles/components.css | 9 | - | ~11K lines; flag for consolidation review |
| [ ] | src/styles/layout.css | 9 | - | - |
| [ ] | src/styles/toolbar-menu.css | 9 | - | - |
| [ ] | src/styles/variant.css | 9 | - | - |

---

## Phase 3: Tests

### Session 10 — Unit Tests (Part 1)

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | tests/setup.js | 10 | - | - |
| [ ] | tests/unit/benchmark-helpers.js | 10 | - | - |
| [ ] | tests/unit/state.test.js | 10 | - | - |
| [ ] | tests/unit/ui-generator.test.js | 10 | - | - |
| [ ] | tests/unit/editor-state-manager.test.js | 10 | - | - |
| [ ] | tests/unit/preview.test.js | 10 | - | - |
| [ ] | tests/unit/render-controller.test.js | 10 | - | - |
| [ ] | tests/unit/render-queue.test.js | 10 | - | - |
| [ ] | tests/unit/quality-tiers.test.js | 10 | - | - |
| [ ] | tests/unit/camera-panel-controller.test.js | 10 | - | - |
| [ ] | tests/unit/auto-preview-controller.test.js | 10 | - | - |

### Session 11 — Unit Tests (Part 2)

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | tests/unit/storage-manager.test.js | 11 | - | - |
| [ ] | tests/unit/saved-projects-manager.test.js | 11 | - | - |
| [ ] | tests/unit/saved-projects-load.test.js | 11 | - | - |
| [ ] | tests/unit/preset-manager.test.js | 11 | - | - |
| [ ] | tests/unit/parser.test.js | 11 | - | - |
| [ ] | tests/unit/manifest-loader.test.js | 11 | - | - |
| [ ] | tests/unit/schema-generator.test.js | 11 | - | - |
| [ ] | tests/unit/validation-schemas.test.js | 11 | - | - |
| [ ] | tests/unit/comparison-controller.test.js | 11 | - | - |
| [ ] | tests/unit/comparison-view.test.js | 11 | - | - |
| [ ] | tests/unit/feature-flags.test.js | 11 | - | - |
| [ ] | tests/unit/download.test.js | 11 | - | - |
| [ ] | tests/unit/error-translator.test.js | 11 | - | - |
| [ ] | tests/unit/mode-manager.test.js | 11 | - | - |
| [ ] | tests/unit/modal-manager.test.js | 11 | - | - |
| [ ] | tests/unit/library-manager.test.js | 11 | - | - |
| [ ] | tests/unit/memory-monitor.test.js | 11 | - | - |
| [ ] | tests/unit/searchable-combobox.test.js | 11 | - | - |
| [ ] | tests/unit/theme-manager.test.js | 11 | - | - |
| [ ] | tests/unit/workflow-progress.test.js | 11 | - | - |
| [ ] | tests/unit/zip-handler.test.js | 11 | - | - |
| [ ] | tests/unit/color-contrast.test.js | 11 | - | - |
| [ ] | tests/unit/cli-manifest.test.js | 11 | - | - |

### Session 12 — E2E and Visual Tests

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | playwright.config.js | 12 | - | - |
| [ ] | vitest.config.js | 12 | - | - |
| [ ] | tests/e2e/accessibility.spec.js | 12 | - | - |
| [ ] | tests/e2e/basic-workflow.spec.js | 12 | - | - |
| [ ] | tests/e2e/examples.spec.js | 12 | - | - |
| [ ] | tests/e2e/features-guide.spec.js | 12 | - | - |
| [ ] | tests/e2e/keyguard-compilation-smoke.spec.js | 12 | - | - |
| [ ] | tests/e2e/keyguard-parser-smoke.spec.js | 12 | - | - |
| [ ] | tests/e2e/keyguard-workflow.spec.js | 12 | - | - |
| [ ] | tests/e2e/manifest-loading.spec.js | 12 | - | - |
| [ ] | tests/e2e/mobile-drawer.spec.js | 12 | - | - |
| [ ] | tests/e2e/mobile-viewport.spec.js | 12 | - | - |
| [ ] | tests/e2e/preset-workflow.spec.js | 12 | - | - |
| [ ] | tests/e2e/project-files.spec.js | 12 | - | - |
| [ ] | tests/e2e/saved-projects.spec.js | 12 | - | - |
| [ ] | tests/e2e/stakeholder-acceptance.spec.js | 12 | - | - |
| [ ] | tests/e2e/stakeholder-bugfix-verification.spec.js | 12 | - | - |
| [ ] | tests/e2e/stakeholder-zip-acceptance.spec.js | 12 | - | - |
| [ ] | tests/e2e/terminology.spec.js | 12 | - | - |
| [ ] | tests/e2e/theme-switching.spec.js | 12 | - | - |
| [ ] | tests/e2e/tutorials.spec.js | 12 | - | - |
| [ ] | tests/e2e/zip-workflow.spec.js | 12 | - | - |
| [ ] | tests/visual/core-ui.visual.spec.js | 12 | - | - |
| [ ] | tests/fixtures/forge-preset.json | 12 | - | - |
| [ ] | tests/fixtures/incompatible-preset.json | 12 | - | - |
| [ ] | tests/fixtures/sample.scad | 12 | - | - |
| [ ] | tests/fixtures/sample-advanced.scad | 12 | - | - |
| [ ] | tests/fixtures/simple-2d.scad | 12 | - | - |
| [ ] | tests/fixtures/test-multipreset.json | 12 | - | - |
| [ ] | tests/fixtures/test-presets.json | 12 | - | - |
| [ ] | tests/fixtures/test-scad-with-includes.scad | 12 | - | - |
| [ ] | tests/fixtures/test-scad-with-version.scad | 12 | - | - |
| [ ] | tests/fixtures/keyguard-minimal/keyguard_minimal.scad | 12 | - | - |
| [ ] | tests/fixtures/keyguard-minimal/openings_and_additions.txt | 12 | - | - |

---

## Phase 4: CLI and Scripts

### Session 13 — CLI Tooling

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | bin/openscad-forge.js | 13 | - | - |
| [ ] | cli/commands/ci.js | 13 | - | - |
| [ ] | cli/commands/extract.js | 13 | - | - |
| [ ] | cli/commands/manifest.js | 13 | - | - |
| [ ] | cli/commands/scaffold.js | 13 | - | - |
| [ ] | cli/commands/sync.js | 13 | - | - |
| [ ] | cli/commands/test.js | 13 | - | - |
| [ ] | cli/commands/theme.js | 13 | - | - |
| [ ] | cli/commands/validate.js | 13 | - | - |
| [ ] | cli/templates/angular/index.html.template | 13 | - | - |
| [ ] | cli/templates/angular/src/app/app.component.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/app.config.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/components/header.component.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/components/parameter-control.component.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/components/parameters-panel.component.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/components/preview-panel.component.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/app/services/openscad.service.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/main.ts | 13 | - | - |
| [ ] | cli/templates/angular/src/worker/openscad-worker.js | 13 | - | - |
| [ ] | cli/templates/angular/tsconfig.json.template | 13 | - | - |
| [ ] | cli/templates/angular/vite.config.js.template | 13 | - | - |
| [ ] | cli/templates/preact/index.html.template | 13 | - | - |
| [ ] | cli/templates/preact/src/App.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/components/Header.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/components/ParameterControl.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/components/ParametersPanel.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/components/PreviewPanel.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/main.jsx | 13 | - | - |
| [ ] | cli/templates/preact/src/worker/openscad-worker.js | 13 | - | - |
| [ ] | cli/templates/preact/vite.config.js.template | 13 | - | - |
| [ ] | cli/templates/react/index.html.template | 13 | - | - |
| [ ] | cli/templates/react/src/App.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/components/Header.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/components/ParameterControl.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/components/ParametersPanel.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/components/PreviewPanel.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/main.jsx | 13 | - | - |
| [ ] | cli/templates/react/src/worker/openscad-worker.js | 13 | - | - |
| [ ] | cli/templates/react/vite.config.js.template | 13 | - | - |
| [ ] | cli/templates/svelte/index.html.template | 13 | - | - |
| [ ] | cli/templates/svelte/src/App.svelte | 13 | - | - |
| [ ] | cli/templates/svelte/src/lib/Header.svelte | 13 | - | - |
| [ ] | cli/templates/svelte/src/lib/ParameterControl.svelte | 13 | - | - |
| [ ] | cli/templates/svelte/src/lib/ParametersPanel.svelte | 13 | - | - |
| [ ] | cli/templates/svelte/src/lib/PreviewPanel.svelte | 13 | - | - |
| [ ] | cli/templates/svelte/src/main.js | 13 | - | - |
| [ ] | cli/templates/svelte/src/worker/openscad-worker.js | 13 | - | - |
| [ ] | cli/templates/svelte/vite.config.js.template | 13 | - | - |
| [ ] | cli/templates/vue/index.html.template | 13 | - | - |
| [ ] | cli/templates/vue/src/App.vue | 13 | - | - |
| [ ] | cli/templates/vue/src/components/Header.vue | 13 | - | - |
| [ ] | cli/templates/vue/src/components/ParameterControl.vue | 13 | - | - |
| [ ] | cli/templates/vue/src/components/ParametersPanel.vue | 13 | - | - |
| [ ] | cli/templates/vue/src/components/PreviewPanel.vue | 13 | - | - |
| [ ] | cli/templates/vue/src/main.js | 13 | - | - |
| [ ] | cli/templates/vue/src/worker/openscad-worker.js | 13 | - | - |
| [ ] | cli/templates/vue/vite.config.js.template | 13 | - | - |

### Session 14 — Build Scripts and Config

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | scripts/bloat-scanner.js | 14 | - | - |
| [ ] | scripts/check-bundle-budget.js | 14 | - | - |
| [ ] | scripts/download-wasm.js | 14 | - | - |
| [ ] | scripts/generate-icons.js | 14 | - | - |
| [ ] | scripts/import-check.js | 14 | - | - |
| [ ] | scripts/run-e2e-safe.js | 14 | - | - |
| [ ] | scripts/setup-libraries.js | 14 | - | - |
| [ ] | scripts/check_features_guide.py | 14 | - | - |
| [ ] | scripts/find_features_panels.py | 14 | - | - |
| [ ] | scripts/fix_presets_panel.py | 14 | - | - |
| [ ] | scripts/insert_grid_html.py | 14 | - | - |
| [ ] | scripts/phase8_analyze.py | 14 | - | - |
| [ ] | scripts/phase8_transform.py | 14 | - | - |
| [ ] | scripts/phase9_analyze.py | 14 | - | - |
| [ ] | scripts/phase9_transform.py | 14 | - | - |
| [ ] | scripts/update_features_guide.py | 14 | - | - |
| [ ] | scripts/verify_changes.py | 14 | - | - |
| [ ] | scripts/README.md | 14 | - | - |
| [ ] | vite.config.js | 14 | - | - |
| [ ] | eslint.config.js | 14 | - | - |
| [ ] | pixi.toml | 14 | - | - |
| [ ] | wrangler.toml | 14 | - | - |
| [ ] | lighthouserc.json | 14 | - | - |
| [ ] | lighthouse-accessibility.json | 14 | - | - |
| [ ] | .prettierrc.json | 14 | - | - |
| [ ] | .markdownlint.json | 14 | - | - |
| [ ] | .markdownlint-cli2.jsonc | 14 | - | - |
| [ ] | package.json | 14 | - | - |

---

## Phase 5: Public Assets and Data

### Session 15 — Public Directory

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | public/manifest.json | 15 | - | - |
| [ ] | public/sw.js | 15 | - | - |
| [ ] | public/data/tablets.json | 15 | - | - |
| [ ] | public/_headers | 15 | - | - |
| [ ] | public/_redirects | 15 | - | - |
| [ ] | public/browserconfig.xml | 15 | - | - |
| [ ] | public/libraries/README.md | 15 | - | - |
| [ ] | public/examples/benchmarks/manifest.json | 15 | - | - |
| [ ] | public/examples/benchmarks/benchmark_booleans.scad | 15 | - | - |
| [ ] | public/examples/benchmarks/benchmark_hull.scad | 15 | - | - |
| [ ] | public/examples/benchmarks/benchmark_minkowski.scad | 15 | - | - |
| [ ] | public/examples/benchmarks/benchmark_simple.scad | 15 | - | - |
| [ ] | public/examples/cable-organizer/cable_organizer.scad | 15 | - | - |
| [ ] | public/examples/colored-box/colored_box.scad | 15 | - | - |
| [ ] | public/examples/honeycomb-grid/honeycomb_grid.scad | 15 | - | - |
| [ ] | public/examples/keyguard-demo/keyguard_demo.scad | 15 | - | - |
| [ ] | public/examples/keyguard-demo/openings_and_additions.txt | 15 | - | - |
| [ ] | public/examples/library-test/library_test.scad | 15 | - | - |
| [ ] | public/examples/multi-file-box/main.scad | 15 | - | - |
| [ ] | public/examples/multi-file-box/modules/lid.scad | 15 | - | - |
| [ ] | public/examples/multi-file-box/utils/helpers.scad | 15 | - | - |
| [ ] | public/examples/parametric-cylinder/parametric_cylinder.scad | 15 | - | - |
| [ ] | public/examples/phone-stand/phone_stand.scad | 15 | - | - |
| [ ] | public/examples/simple-box/simple_box.scad | 15 | - | - |
| [ ] | public/examples/wall-hook/wall_hook.scad | 15 | - | - |
| [ ] | public/icons/README.md | 15 | - | - |
| [S] | public/icons/*.png | 15 | - | Static image assets |
| [S] | public/icons/*.svg | 15 | - | Static image assets |
| [S] | favicon/ | 15 | - | Static image assets |

---

## Phase 6: Documentation (READ-ONLY — Flag [D] only, no edits)

### Session 16 — Root-Level Docs

| Status | File | Session | Notes |
|--------|------|---------|-------|
| [ ] | README.md | 16 | - |
| [ ] | CHANGELOG.md | 16 | - |
| [ ] | RELEASE_NOTES.md | 16 | - |
| [ ] | PROJECT_STATUS.md | 16 | - |
| [ ] | CONTRIBUTING.md | 16 | - |
| [ ] | CODE_OF_CONDUCT.md | 16 | - |
| [ ] | SECURITY.md | 16 | - |
| [ ] | MAINTAINERS.md | 16 | - |
| [ ] | CREDITS.md | 16 | - |
| [ ] | THIRD_PARTY_NOTICES.md | 16 | - |
| [ ] | AUTHORS | 16 | - |
| [ ] | LICENSE | 16 | - |
| [ ] | audit-phases-18-32-report.md | 16 | - |

### Session 17 — Developer and User Guides

| Status | File | Session | Notes |
|--------|------|---------|-------|
| [ ] | docs/README.md | 17 | - |
| [ ] | docs/DEV_QUICK_START.md | 17 | - |
| [ ] | docs/DEVELOPMENT_WORKFLOW.md | 17 | - |
| [ ] | docs/TESTING.md | 17 | - |
| [ ] | docs/guides/ACCESSIBILITY_GUIDE.md | 17 | - |
| [ ] | docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md | 17 | - |
| [ ] | docs/guides/COLOR_SYSTEM_GUIDE.md | 17 | - |
| [ ] | docs/guides/EXPERT_MODE_GUIDE.md | 17 | - |
| [ ] | docs/guides/GETTING_STARTED.md | 17 | - |
| [ ] | docs/guides/GOLDEN_SVG_PROCEDURE.md | 17 | - |
| [ ] | docs/guides/KEYGUARD_WORKFLOW_GUIDE.md | 17 | - |
| [ ] | docs/guides/MANIFEST_SHARING_GUIDE.md | 17 | - |
| [ ] | docs/guides/SECURITY_TESTING.md | 17 | - |
| [ ] | docs/guides/STANDARD_MODE_GUIDE.md | 17 | - |
| [ ] | docs/guides/TROUBLESHOOTING_USER_GUIDE.md | 17 | - |
| [ ] | docs/guides/WELCOME_SCREEN.md | 17 | - |

### Session 18 — Technical Specs and Architecture

| Status | File | Session | Notes |
|--------|------|---------|-------|
| [ ] | docs/ARCHITECTURE.md | 18 | - |
| [ ] | docs/specs/CAMERA_CONTROLS_ACCESSIBILITY.md | 18 | - |
| [ ] | docs/specs/MANIFEST_STABILITY_CONTRACT.md | 18 | - |
| [ ] | docs/specs/PARAMETER_SCHEMA_SPEC.md | 18 | - |
| [ ] | docs/specs/UI_STANDARDS.md | 18 | - |
| [ ] | docs/PERFORMANCE.md | 18 | - |
| [ ] | docs/DEPLOYMENT.md | 18 | - |
| [ ] | docs/RELEASING.md | 18 | - |
| [ ] | docs/ROLLBACK_RUNBOOK.md | 18 | - |
| [ ] | docs/SECURITY_ADMIN_GUIDE.md | 18 | - |

### Session 19 — Research, VPAT, Notes, and Archive

| Status | File | Session | Notes |
|--------|------|---------|-------|
| [ ] | docs/research/CLOUDFLARE_VALIDATION.md | 19 | - |
| [ ] | docs/research/COMPARABLE_PROJECTS.md | 19 | - |
| [ ] | docs/research/PROJECT_SHARING_REFERENCES.md | 19 | - |
| [ ] | docs/research/SAVED_PROJECTS_REFERENCE.md | 19 | - |
| [ ] | docs/research/TUTORIAL_DESIGN_RESEARCH.md | 19 | - |
| [ ] | docs/research/WASM_THREADING_ANALYSIS.md | 19 | - |
| [ ] | docs/vpat/VPAT-2.5-WCAG.md | 19 | - |
| [ ] | docs/vpat/conformance-decisions.md | 19 | - |
| [ ] | docs/vpat/evidence/m0/validation-summary-2026-02-02.md | 19 | - |
| [ ] | docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md | 19 | - |
| [ ] | docs/vpat/evidence/m1/validation-summary-2026-02-02.md | 19 | - |
| [ ] | docs/vpat/evidence/m2/validation-summary-2026-02-02.md | 19 | - |
| [ ] | docs/vpat/evidence/m3/validation-summary-2026-02-02.md | 19 | - |
| [ ] | docs/vpat/evidence/m5/validation-summary-2026-02-02.md | 19 | - |
| [ ] | docs/notes/README.md | 19 | - |
| [ ] | docs/notes/2026-01-25/README.md | 19 | - |
| [ ] | docs/notes/2026-01-25/SUMMARY.md | 19 | - |
| [ ] | docs/notes/2026-01-26/CODE_AUDIT_FINDINGS.md | 19 | - |
| [ ] | docs/notes/2026-01-27/AUDIT_IMPLEMENTATION_SUMMARY.md | 19 | - |
| [ ] | docs/notes/2026-01-27/DOC_INVENTORY.md | 19 | - |
| [ ] | docs/planning/BUILD_PLAN_V2.md | 19 | - |
| [ ] | docs/planning/decision-log.md | 19 | - |
| [ ] | docs/archive/README.md | 19 | - |
| [ ] | docs/ACCESSIBILITY_CONFORMANCE.md | 19 | - |
| [ ] | docs/BROWSER_SUPPORT.md | 19 | - |
| [ ] | docs/KNOWN_ISSUES.md | 19 | - |
| [ ] | docs/MOBILE_LIMITATIONS.md | 19 | - |
| [ ] | docs/OPEN_SOURCE_GUIDES.md | 19 | - |
| [ ] | docs/OPEN_SOURCE_PROJECTS.md | 19 | - |
| [ ] | docs/OPENSCAD_LANGUAGE_REFERENCE.md | 19 | - |
| [ ] | docs/QUICK_REFERENCE.md | 19 | - |
| [ ] | docs/RESPONSIVE_UI.md | 19 | - |
| [ ] | docs/TROUBLESHOOTING.md | 19 | - |
| [ ] | docs/design-d1-preset-companion-files.md | 19 | - |
| [ ] | docs/source-code-foundation-assessment.md | 19 | - |
| [ ] | docs/testing-guide-stakeholder-bugs.md | 19 | - |

---

## Phase 7: GitHub and CI Config

### Session 20 — GitHub Configuration

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [ ] | .github/workflows/test.yml | 20 | - | - |
| [ ] | .github/workflows/lighthouse.yml | 20 | - | - |
| [ ] | .github/ISSUE_TEMPLATE/accessibility_issue.md | 20 | - | - |
| [ ] | .github/ISSUE_TEMPLATE/bug_report.md | 20 | - | - |
| [ ] | .github/ISSUE_TEMPLATE/config.yml | 20 | - | - |
| [ ] | .github/ISSUE_TEMPLATE/feature_request.md | 20 | - | - |
| [ ] | .github/ISSUE_TEMPLATE/maintainer-welcome.md | 20 | - | - |
| [ ] | .github/pull_request_template.md | 20 | - | - |
| [ ] | .github/FUNDING.yml | 20 | - | - |
| [ ] | .github/CODEOWNERS | 20 | - | - |
| [ ] | .github/BRANCH_PROTECTION.md | 20 | - | - |
| [ ] | .cursor/rules/env-tool.mdc | 20 | - | - |
| [ ] | .cursor/rules/git-commit-authorship.mdc | 20 | - | - |
| [ ] | .cursor/rules/gold-standard.md | 20 | - | - |
| [ ] | openscad-assistive-forge.code-workspace | 20 | - | - |
| [ ] | .gitattributes | 20 | - | - |
| [ ] | .gitignore | 20 | - | - |

---

## Skipped Files (Vendor/Generated/Third-Party)

| Status | Path | Reason |
|--------|------|--------|
| [S] | node_modules/ | Third-party dependencies |
| [S] | .git/ | Git internals |
| [S] | .vite/ | Build cache |
| [S] | .pixi/ | Pixi environment |
| [S] | coverage/ | Generated coverage output |
| [S] | playwright-report/ | Generated test reports |
| [S] | test-results/ | Generated test artifacts |
| [S] | dist/ | Build output (regenerated) |
| [S] | public/libraries/BOSL2/ | Third-party OpenSCAD library |
| [S] | public/libraries/MCAD/ | Third-party OpenSCAD library |
| [S] | public/wasm/ | Pre-built WASM binaries |
| [S] | public/fonts/ | Static font assets |
| [S] | pixi.lock | Generated lockfile |
| [S] | package-lock.json | Generated lockfile |
| [S] | ai-at-playbook/ | Standalone playbook, not part of app release |
| [S] | .lighthouseci/ | Generated CI artifacts |
| [S] | .vercel/ | Deployment config (auto-managed) |
| [S] | .volkswitch/ | Stakeholder research files (not app code) |
| [S] | docs/planning/parser-golden-corpus.json | Generated test corpus |
| [S] | docs/vpat/evidence/**/.gitkeep | Empty placeholder files |
| [S] | tests/visual/core-ui.visual.spec.js-snapshots/ | Generated visual snapshots |

---

## Session Log

<!-- Sessions append their summaries here -->

### Pre-Work — 2026-02-23

- Checklist created with all reviewable files enumerated
- Total files to review: ~280 (across 20 sessions)
- Skipped files documented above
- Ready for Session 1
