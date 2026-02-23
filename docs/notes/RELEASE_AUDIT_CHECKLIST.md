# Release Audit Checklist

Started: 2026-02-23
Last updated: 2026-02-23 (Session 13)

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
| [x] | index.html | 1 | 0 blocking, 0 warnings | Clean; 3 informational comments noting removed panels (intentional). Re-verified 2026-02-23 after commits 7e5974a/0f69323: workflow step breadcrumbs removed, terminology fixes ("Saved Designs"→"Saved Projects", "Reference Overlay"→"Reference Image"), keyboard shortcut label updated. All changes legitimate. |
| [x] | src/main.js | 1 | 0 blocking, 0 warnings | Assessment only (17K lines). Findings: (1) commented-out animation import line 191 (intentional); (2) `_stopMemoryPolling` defined but never called (prefixed `_`, intentional reservation); (3) `window._showRenderEstimate` debug export (intentional); (4) `openGuidedTour` stub with TODO (known future work). No edits per plan protocol. Re-verified 2026-02-23 after commits 7e5974a/0f69323: removed 3 unused workflow-progress imports, cleaned dead stepsEl code, added deferred WASM init for deep-link. All changes clean. |
| [x] | src/js/state.js | 1 | 0 blocking, 0 warnings | Clean. Verbose console.log on every draft save (lines 217, 252, 257, 272) — noted but not edited (no dev-only guard pattern established in codebase). |
| [x] | src/js/version.js | 1 | 0 blocking, 0 warnings | Clean. |
| [x] | src/js/feature-flags.js | 1 | 0 blocking, 0 warnings | Clean. Emoji in debugFlags() console output is acceptable (debug-only function). |
| [x] | src/js/storage-keys.js | 1 | 0 blocking, 0 warnings | Clean. |

### Session 2 — UI Generation and Mode Control

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/js/ui-generator.js | 2 | 0 blocking, 0 warnings | ~1800 lines. `renderFromSchema` and `renderFromSchemaSync` exported but never imported anywhere (JSDoc notes "not integrated into main workflow"). Dead exports — noted but not removed (API boundary rule). `createFileControl` uses emoji (📁, ✕) in button text — functional UI labels, acceptable. No other issues. |
| [E] | src/js/ui-mode-controller.js | 2 | 0 blocking, 0 warnings | Removed unused `panelResults` array in `applyMode()` — built but never read or returned. All other code clean. |
| [x] | src/js/mode-manager.js | 2 | 0 blocking, 0 warnings | Clean. Well-structured singleton with proper subscriber pattern. |
| [x] | src/js/toolbar-menu-controller.js | 2 | 0 blocking, 0 warnings | Clean. Good ARIA implementation with radio group and submenu support. |
| [x] | src/js/html-utils.js | 2 | 0 blocking, 0 warnings | Clean. 3 small utility functions, all actively used. |
| [x] | src/js/drawer-controller.js | 2 | 0 blocking, 0 warnings | Clean. Solid pointer event guard logic for accidental backdrop close prevention. |
| [x] | src/js/display-options-controller.js | 2 | 0 blocking, 0 warnings | Clean. Good Three.js overlay management with proper dispose(). |
| [x] | src/js/file-actions-controller.js | 2 | 0 blocking, 0 warnings | Clean. `file-save-all-btn` wired in constructor but not in `_wireButtons()` — intentional (no DOM element for it yet). |

### Session 3 — Editors and Text Handling

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [E] | src/js/monaco-editor.js | 3 | 0 blocking, 0 warnings | Removed ~12 narrating comments (section headers restating constant/method names). `verifyMonacoCSP()` exported but never imported — dead export noted, not removed (API boundary rule). |
| [E] | src/js/textarea-editor.js | 3 | 0 blocking, 0 warnings | Removed ~20 narrating comments in token categories, `_createDOM`, `_attachEventListeners`, `_handleKeyDown`, `_highlightCode`. |
| [E] | src/js/editor-state-manager.js | 3 | 0 blocking, 0 warnings | Removed dead `_modeSnapshots` state — written in `captureState()` but never read anywhere. |
| [x] | src/js/edit-actions-controller.js | 3 | 0 blocking, 0 warnings | Clean. `document.execCommand('copy')` fallback is deprecated but acceptable (same pattern in console-panel). |
| [E] | src/js/console-panel.js | 3 | 0 blocking, 0 warnings | Fixed duplicate description line in file header. |
| [x] | src/js/error-log-panel.js | 3 | 0 blocking, 0 warnings | Clean. Well-structured with good ARIA table implementation. |

### Session 4 — Rendering Pipeline

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/js/preview.js | 4 | 0 blocking, 0 warnings | ~2890 lines. Clean Three.js manager. Lazy-loads Three.js on demand. Good ARIA/keyboard camera controls. LOD warning system well-implemented. No dead code. |
| [x] | src/js/render-controller.js | 4 | 0 blocking, 0 warnings | Clean. Re-exports quality-tiers.js for convenience. Worker health monitoring, cancel watchdog, and proactive restart logic all correct. `_cancelWatchdogHandle` properly cleared in `terminate()`. |
| [x] | src/js/render-queue.js | 4 | 0 blocking, 0 warnings | Clean. Well-structured class with proper state machine. `exportQueue`/`importQueue` are exported API — preserved. |
| [x] | src/js/auto-preview-controller.js | 4 | 0 blocking, 0 warnings | Clean. Complex but well-organized debounce/cache/state logic. `is2DOnlyParameters` static method is correct guard against WASM corruption. |
| [x] | src/js/quality-tiers.js | 4 | 0 blocking, 0 warnings | Clean. Well-documented Manifold-optimized quality presets. All functions actively used. |
| [x] | src/js/camera-panel-controller.js | 4 | 0 blocking, 0 warnings | Clean. Good ARIA implementation for desktop panel + mobile drawer. Mutual exclusion between camera/actions drawers is correct. |
| [E] | src/worker/openscad-worker.js | 4 | 0 blocking, 0 warnings | Removed 5 dead items: (1) `_renderWithExport()` — defined but never called; (2) `_shouldRetryWithoutFlags` — assigned but never read; (3) `_helpError` — assigned but never read; (4) `_lastHeartbeatId` module-level var — assigned but never read; (5) `_mountedCount`/`_failedCount` in `mountLibraries` — assigned but never read. |

### Session 5 — Storage, Projects, and Presets

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/js/storage-manager.js | 5 | 0 blocking, 0 warnings | Clean. ~1193 lines. `clearCachedData()` and `clearAppCachesOnly()` share near-identical SW+CacheStorage clearing logic — consolidation opportunity noted but not edited (API boundary rule). |
| [x] | src/js/saved-projects-manager.js | 5 | 0 blocking, 0 warnings | Clean. ~2040 lines. Complex IndexedDB+localStorage dual-write pattern is well-justified. Verbose console.log on every operation is consistent with diagnostic design (same pattern as state.js). No dead code. |
| [x] | src/js/preset-manager.js | 5 | 0 blocking, 0 warnings | Clean. ~1719 lines. `importOpenSCADNativePresets` embeds `'Imported from OpenSCAD preset file'` in preset metadata — user-facing text, acceptable. No dead code. |

### Session 6 — Parsing, Schema, and Manifest

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [E] | src/js/parser.js | 6 | 0 blocking, 0 warnings | Removed empty `else if (!line.startsWith('//'))` block (lines 659-662) — placeholder with comment but no code. All parsing logic correct; desktop parity comments well-documented. |
| [x] | src/js/schema-generator.js | 6 | 0 blocking, 0 warnings | Clean. Bidirectional JSON Schema conversion. Minor redundancy in `fromJsonSchema()` (two branches both set `uiType = 'input'`) — harmless switch fallthrough pattern. |
| [x] | src/js/manifest-loader.js | 6 | 0 blocking, 0 warnings | Clean. Well-structured with `ManifestError` class, timeout handling, CORS-aware error messages, and bundle/uncompressed dual-path loading. |
| [x] | src/js/validation-schemas.js | 6 | 0 blocking, 0 warnings | Clean. Three `@reserved` exports (`createParameterValidator`, `validateParameterValue`, `clampParameterValues`) — explicitly flagged as planned-but-not-yet-integrated; preserved per API boundary rule. |
| [x] | src/js/validation-constants.js | 6 | 0 blocking, 0 warnings | Clean. Simple constants file. |

### Session 7 — Accessibility and Input

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/js/announcer.js | 7 | 0 blocking, 0 warnings | Clean. Dual live-region pattern (polite/assertive) with per-level timer management. Well-structured. |
| [x] | src/js/focus-trap.js | 7 | 0 blocking, 0 warnings | Clean. Two trap patterns (element-level and document-level) both actively used. `trapFocusHandler` backward-compat export is used. |
| [E] | src/js/keyboard-config.js | 7 | 0 blocking, 0 warnings | Removed dead `_originalContent` variable in `showConflictWarning()` — assigned but never read (timeout restores hardcoded prompt string instead). All other code clean. |
| [x] | src/js/searchable-combobox.js | 7 | 0 blocking, 0 warnings | Clean. Well-implemented WAI-ARIA combobox using @github/combobox-nav. Fixed-position dropdown with scroll/resize repositioning. Proper destroy() cleanup. |
| [x] | src/js/gamepad-controller.js | 7 | 0 blocking, 0 warnings | Clean. Full W3C Standard Gamepad API implementation. `GamepadState` is internal; `GamepadController` exported. All methods used. |
| [x] | src/js/modal-manager.js | 7 | 0 blocking, 0 warnings | Clean. Proper focus trap + trigger restoration pattern. `createModal` returns promise-based API. Escape handled at modal level (correct — focus trap does not need onEscape here). |
| [x] | src/js/param-detail-controller.js | 7 | 0 blocking, 0 warnings | Clean. Compact 4-level detail controller with localStorage persistence and screen reader announcement. |

### Session 8 — Utilities, Features, and Remaining Modules

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/js/zip-handler.js | 8 | 0 blocking, 0 warnings | Clean. ~628 lines. Security path-traversal check, image base64 extraction, nested tree builder, preset companion map heuristics all active. Emoji in createFileTree are functional UI labels. |
| [x] | src/js/download.js | 8 | 0 blocking, 0 warnings | Clean. downloadSTL is a named legacy-compat wrapper for downloadFile. All functions actively used. |
| [x] | src/js/error-translator.js | 8 | 0 blocking, 0 warnings | Clean. Pattern-matching error translator with COGA-aligned user messages. Emoji in createFriendlyErrorDisplay is a UI label with aria-hidden. |
| [x] | src/js/color-utils.js | 8 | 0 blocking, 0 warnings | Clean. Three small utility functions, all actively used. |
| [x] | src/js/unit-sync.js | 8 | 0 blocking, 0 warnings | Clean. Compact event-bus for mm/px unit sync between Image Measurement and Reference Overlay. |
| [x] | src/js/comparison-controller.js | 8 | 0 blocking, 0 warnings | Clean. Well-structured class with proper subscriber pattern. |
| [x] | src/js/comparison-view.js | 8 | 0 blocking, 0 warnings | Clean. alert() calls in handleRenderAll/handleRenderVariant are intentional fallbacks (no modal infrastructure wired in comparison view). |
| [x] | src/js/image-measurement.js | 8 | 0 blocking, 0 warnings | Clean. ~1046 lines. Complex canvas measurement tool with keyboard/pointer/zoom/ruler/calibrate modes and accessibility. handleMouseLeave is intentionally empty (keeps last coordinate visible). |
| [x] | src/js/shared-image-store.js | 8 | 0 blocking, 0 warnings | Clean. Empty catch block is intentional (subscriber errors must not propagate). |
| [E] | src/js/tutorial-sandbox.js | 8 | 0 blocking, 0 warnings | Removed dead import alias POLITENESS as _POLITENESS -- imported but never used anywhere in the file. |
| [x] | src/js/workflow-progress.js | 8 | 0 blocking, 0 warnings | Clean. Tiny 3-function module for #workflowProgress container visibility. |
| [x] | src/js/preview-settings-drawer.js | 8 | 0 blocking, 0 warnings | Clean. Responsive drawer with localStorage persistence and on-screen keyboard detection. |
| [x] | src/js/design-panel-controller.js | 8 | 0 blocking, 0 warnings | Clean. Design-menu equivalent (Flush Caches, AST, Validity, Geometry Info). Singleton with reset for testing. |
| [x] | src/js/animation-controller.js | 8 | 0 blocking, 0 warnings | Clean. \ animation controller with FPS/steps preferences, proper interval management, and dispose(). |
| [x] | src/js/theme-manager.js | 8 | 0 blocking, 0 warnings | Clean. removeListener is a convenience method alongside the unsubscribe-function pattern. MutationObserver for external data-theme mutations is well-justified. |
| [x] | src/js/dependency-checker.js | 8 | 0 blocking, 0 warnings | Clean. Regex-based dependency scanner for include/use/import statements. All functions actively used. |
| [x] | src/js/library-manager.js | 8 | 0 blocking, 0 warnings | Clean. NopSCADlib and dotSCAD in LIBRARY_DEFINITIONS are defined but not yet deployed to public/libraries/ -- future expansion, not dead code. |
| [x] | src/js/sw-manager.js | 8 | 0 blocking, 0 warnings | Clean. Inline CSS in showUpdateToast is intentional (self-contained toast, no external stylesheet dependency). |
| [x] | src/js/memory-monitor.js | 8 | 0 blocking, 0 warnings | Clean. Feature-flag gated. WASM-only heap measurement (correctly avoids performance.memory false positives). |
| [x] | src/js/csp-reporter.js | 8 | 0 blocking, 0 warnings | Clean. Feature-flag gated. Emoji in console.group is debug-only console output, acceptable. |
| [x] | src/js/_hfm.js | 8 | 0 blocking, 0 warnings | Clean. ~628 lines. ASCII art renderer using 6D shape vectors (Harri technique). Well-documented algorithm with attribution note. All internal functions used. |
| [x] | src/js/_seq.js | 8 | 0 blocking, 0 warnings | Clean. Konami code sequence detector. Compact and correct. |

---

## Phase 2: Stylesheets

### Session 9 — All CSS

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | src/styles/main.css | 9 | 0 blocking, 0 warnings | Clean. 7-line import barrel. |
| [x] | src/styles/reset.css | 9 | 0 blocking, 0 warnings | Clean. Standard modern reset with WCAG [hidden] support and .sr-only. |
| [x] | src/styles/variables.css | 9 | 0 blocking, 0 warnings | Clean. Comprehensive design token file: spacing, typography, z-index, breakpoints, density media queries, high-contrast, forced-colors, prefers-contrast. Two DEPRECATED aliases (--radius-sm, --radius-md) preserved for backward compat. |
| [x] | src/styles/semantic-tokens.css | 9 | 0 blocking, 0 warnings | Clean. Four theme contexts each defining the full semantic token set. Intentional repetition -- CSS cascade requires it. Well-documented WCAG contrast rationale in comments. |
| [x] | src/styles/color-scales.css | 9 | 0 blocking, 0 warnings | Clean. 19-line Radix Colors import barrel with MIT license note. |
| [E] | src/styles/components.css | 9 | 0 blocking, 0 warnings | ~12,868 lines. Fixed 5 undefined token refs: --color-surface-hover, --color-focus-ring (x2), --color-primary, --color-primary-hover, --color-text-on-primary. All were silent fallback-to-empty bugs in .param-group-hide-btn and .tutorial-reopen-drawer-btn. |
| [E] | src/styles/layout.css | 9 | 0 blocking, 0 warnings | ~4,194 lines. Fixed 2 undefined token refs: --color-border-strong -> --color-text-primary (auto-rotate-toggle hover, x2). Removed duplicate section header comment for Preview Status Bar. |
| [x] | src/styles/toolbar-menu.css | 9 | 0 blocking, 0 warnings | Clean. 370 lines. Token-only styling for toolbar menu bar, modal, items, radio groups, theme variants, reduced-motion, and mobile. |
| [x] | src/styles/variant.css | 9 | 0 blocking, 0 warnings | Clean. 968 lines. Green phosphor (dark) and amber phosphor (light) terminal variant. Cursor theming, form control overrides, emoji text replacements, scrollbar styling, and HC mode all correct. |

---

## Phase 3: Tests

### Session 10 — Unit Tests (Part 1)

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | tests/setup.js | 10 | 0 blocking, 0 warnings | Clean. Two section comments add orientation value in a test setup file — acceptable. |
| [x] | tests/unit/benchmark-helpers.js | 10 | 0 blocking, 0 warnings | Clean. Two exported helpers with appropriate JSDoc. |
| [x] | tests/unit/state.test.js | 10 | 0 blocking, 0 warnings | Clean. Comprehensive coverage of StateManager (pub/sub, localStorage, URL sync, undo/redo) and ParameterHistory. |
| [x] | tests/unit/ui-generator.test.js | 10 | 0 blocking, 0 warnings | Clean. Good buildParams helper. Covers sliders, toggles, selects, color, file, groups, accessibility, limits, defaults, reset, dependencies, units. |
| [x] | tests/unit/editor-state-manager.test.js | 10 | 0 blocking, 0 warnings | Clean. Covers source/params/dirty/errors/subscribe/compareParameters/injectParameterValue/position conversion/reset/singleton/captureState. |
| [x] | tests/unit/preview.test.js | 10 | 0 blocking, 0 warnings | Clean. Thorough coverage: constructor, measurement prefs, color override, toggle, theme, LOD warning/stats, clear/dispose, overlay config, custom grid presets. |
| [x] | tests/unit/render-controller.test.js | 10 | 0 blocking, 0 warnings | Clean. Covers all message types (READY/PROGRESS/COMPLETE/ERROR/MEMORY_USAGE), quality settings, cancel, terminate, capability detection, estimateRenderTime. |
| [x] | tests/unit/render-queue.test.js | 10 | 0 blocking, 0 warnings | Clean. Covers job lifecycle (add/remove/cancel/update/rename), rendering, queue processing, subscriptions, getters, clear operations, export/import. |
| [x] | tests/unit/quality-tiers.test.js | 10 | 0 blocking, 0 warnings | Clean. Covers all exports: COMPLEXITY_TIER, QUALITY_TIERS, analyzeComplexity, detectHardware, getQualityPreset, getAdaptiveQualityConfig, getTierPresets, formatPresetDescription. |
| [x] | tests/unit/camera-panel-controller.test.js | 10 | 0 blocking, 0 warnings | Clean. Good setupDom helper. Covers desktop panel toggle, mobile drawer, resize, announcements, view buttons. |
| [x] | tests/unit/auto-preview-controller.test.js | 10 | 0 blocking, 0 warnings | Clean. Covers constructor, param hashing, color resolution, enable/disable, parameter change handling, cache management, SCAD content, project files, preview quality, libraries, state management, cancel pending, getCurrentFullSTL. |

### Session 11 — Unit Tests (Part 2)

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | tests/unit/storage-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers first-visit tracking, storage estimation, byte formatting, localStorage usage, cache clearing, network detection, storage prefs, deferred download logic, and edge cases (quota exceeded, disabled localStorage). |
| [x] | tests/unit/saved-projects-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Comprehensive coverage of CRUD, folder operations (v2), project-folder moves, size/count limits, ZIP project support, and getSavedProjectsSummary. |
| [x] | tests/unit/saved-projects-load.test.js | 11 | 0 blocking, 0 warnings | Clean. Focused regression test for the extension guard bug fix (saved manifest projects with no .scad/.zip extension). Well-documented with both fixed and buggy guard mirrors. |
| [x] | tests/unit/preset-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers initialization, save/load/update/delete, coercePresetValues, extractScadVersion, compareVersions, OpenSCAD-native import/export, multi-preset JSON, and localStorage persistence. |
| [x] | tests/unit/parser.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers range params, step ranges, enum params, boolean params, string params, group headers, vector params, file params, color params, edge cases, and golden corpus vector tests. |
| [x] | tests/unit/manifest-loader.test.js | 11 | 0 blocking, 0 warnings | Clean. Good makeMockResponse helper. Covers ManifestError, validateManifest, resolveFileUrl, loadManifest (success, 404, CORS, timeout, invalid JSON, bundle path). |
| [x] | tests/unit/schema-generator.test.js | 11 | 0 blocking, 0 warnings | Clean. (Confirmed in Session 10 test run.) |
| [x] | tests/unit/validation-schemas.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers all 7 validators: validateFileUpload, validateUrlParamValue, validateUrlParams, validateDraftState, validatePreset, validatePresetsCollection, validateLibraryMap. Boundary conditions well-tested. |
| [x] | tests/unit/comparison-controller.test.js | 11 | 0 blocking, 0 warnings | Clean. Compact. Covers addVariant/maxCapacity, updateVariantParameters, renderVariant, error state, renderAllVariants, removeVariant, clearVariants, subscribe/notify, exportComparison. |
| [x] | tests/unit/comparison-view.test.js | 11 | 0 blocking, 0 warnings | Clean. Good PreviewManager mock. Covers constructor, render, renderAll, export, remove, clear, theme/highContrast, subscribe. |
| [x] | tests/unit/feature-flags.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers FLAGS structure, isEnabled, URL overrides (true/1/false/0), setUserPreference, clearUserPreference, getAllFlagStates, getConfigurableFlags, cyrb53 hash, hashToBucket, getUserId. |
| [x] | tests/unit/download.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers OUTPUT_FORMATS (all 7 formats including 2D), generateFilename (sanitization, hash consistency), downloadFile (all formats, URL lifecycle), downloadSTL (backward compat), formatFileSize, and integration tests. |
| [x] | tests/unit/error-translator.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers all 8 error pattern categories, default fallback, null/undefined/empty/non-string input, and createFriendlyErrorDisplay ARIA structure. |
| [x] | tests/unit/mode-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers constructor, isExpertModeAvailable, switchMode (callbacks, announcements, skipAnnouncement, subscribers, persistence), toggleMode, setPreferredEditor (invalid type guard), resolveEditorType, subscribe (error isolation), getModeState, singleton. |
| [x] | tests/unit/modal-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Compact with makeVisible helper. Covers open/close with focus management, focus trap (Tab/Shift+Tab), close handlers (button/overlay/Escape), and initStaticModals. |
| [x] | tests/unit/library-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers detectLibraries (include/use/NopSCADlib/unknown/dedup), enable/disable/toggle, getAll/getEnabled, persistence, LIBRARY_DEFINITIONS structure. |
| [x] | tests/unit/memory-monitor.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers constructor defaults/custom thresholds, state transitions (normal/warning/critical/emergency), polling start/stop, history recording, subscriber notification, getMemoryMonitor singleton, MemoryState/MemoryRecovery constants. |
| [x] | tests/unit/searchable-combobox.test.js | 11 | 0 blocking, 0 warnings | Clean. Good helper functions (getInput/getList/getOptions). Covers structure, filtering, empty state, selection (click/keyboard), destroy cleanup, and options update. |
| [x] | tests/unit/theme-manager.test.js | 11 | 0 blocking, 0 warnings | Clean. Covers initialization, saved theme loading, invalid theme fallback, setTheme (light/dark/auto), toggleHighContrast, subscribe/unsubscribe, initThemeToggle DOM wiring, and MutationObserver for external data-theme changes. |
| [x] | tests/unit/workflow-progress.test.js | 11 | 0 blocking, 0 warnings | Clean. Compact. Covers initWorkflowProgress (hidden default, visible=true), showWorkflowProgress, hideWorkflowProgress, and missing-element no-op guard. |
| [x] | tests/unit/zip-handler.test.js | 11 | 0 blocking, 2 warnings | Clean. 2 bloat-scan warnings are emoji in test assertions (lines 360-361) — testing for emoji in rendered file tree output, not AI bloat. Covers validateZipFile, extractZipFiles, scanIncludes, resolveIncludePath, getZipStats, createFileTree, resolveProjectFile, buildPresetCompanionMap, applyCompanionAliases, and path-traversal security. |
| [x] | tests/unit/color-contrast.test.js | 11 | 0 blocking, 0 warnings | Clean. JSDoc on helper functions is appropriate (WCAG standard names). Covers light/dark/high-contrast mode color pairs against WCAG 2.2 AA/AAA thresholds using Color.js and Radix UI color scales. |
| [x] | tests/unit/cli-manifest.test.js | 11 | 0 blocking, 0 warnings | Clean. Mirrors CLI pure logic for unit testing without filesystem. Covers detectMainFilePure (single/multi-file, main.scad heuristic, root-only, content scan), looksLikePresetFilePure (name hints, content parse), and buildManifestPure (uncompressed/zip modes, warnings). |

### Session 12 — E2E and Visual Tests

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | playwright.config.js | 12 | 0 blocking, 0 warnings | Clean. Windows worker=1 guard, CI/local reporter split, sensible timeouts. |
| [x] | vitest.config.js | 12 | 0 blocking, 0 warnings | Clean. Coverage thresholds, exclusions, and jsdom environment all correct. Comment on threshold rationale is appropriate. |
| [E] | tests/e2e/accessibility.spec.js | 12 | 0 blocking, 0 warnings | Removed 1 narrating comment. Comprehensive WCAG 2.1/2.2 coverage: axe-core scans, focus management, tutorial a11y, color tokens, contrast media, theme persistence, drawer a11y, UI uniformity regression suite. |
| [x] | tests/e2e/basic-workflow.spec.js | 12 | 0 blocking, 0 warnings | Clean. Full workflow test is test.skip() (intentional - flaky in headless). New project template test is a good non-WASM smoke test. |
| [x] | tests/e2e/examples.spec.js | 12 | 0 blocking, 0 warnings | Clean. Deep-link tests (?example=, ?load=), file-serve checks, welcome screen example buttons. All WASM-dependent tests properly CI-skipped. |
| [x] | tests/e2e/features-guide.spec.js | 12 | 0 blocking, 0 warnings | Clean. Modal open/close, Escape key, tab ARIA attributes, welcome screen Learn More button. |
| [x] | tests/e2e/keyguard-compilation-smoke.spec.js | 12 | 0 blocking, 0 warnings | Clean. Minimal keyguard compile with companion file, yes/no toggle rendering, full ZIP smoke test (skipped when .volkswitch fixture absent). |
| [x] | tests/e2e/keyguard-parser-smoke.spec.js | 12 | 0 blocking, 0 warnings | Clean. All tests skip when .volkswitch fixture absent. Validates 50+ params, 20+ groups, 90+ tablet options, [Hidden] group suppression. |
| [x] | tests/e2e/keyguard-workflow.spec.js | 12 | 0 blocking, 0 warnings | Clean. SVG/DXF format guidance, companion file handling, multi-preset JSON import, reference image overlay. Two tests use test.skip() at top level (intentional). |
| [x] | tests/e2e/manifest-loading.spec.js | 12 | 0 blocking, 0 warnings | Clean. Excellent mock server pattern using page.route(). Covers valid/minimal/full manifests, error handling (404/invalid JSON/missing fields), URL param interactions, companion files, sequential loads, mobile viewport, accessibility. |
| [x] | tests/e2e/mobile-drawer.spec.js | 12 | 0 blocking, 0 warnings | Clean. loadSampleFile helper uses console event listener for WASM-ready (avoids race condition). Covers open/close, ESC, focus trap, accidental-drag guard, actions drawer z-order, desktop gutter, keyboard shortcuts popover, touch targets. |
| [x] | tests/e2e/mobile-viewport.spec.js | 12 | 0 blocking, 0 warnings | Clean. Parameterized over 3 device profiles using stripWorkerOptions (Firefox isMobile compat). Covers overflow, touch targets, font sizes, landscape, small screen, toolbar breakpoints. |
| [x] | tests/e2e/preset-workflow.spec.js | 12 | 0 blocking, 0 warnings | Clean. Save/load/delete presets, searchable combobox flag, OpenSCAD native import/export, multi-preset JSON. All WASM-dependent tests properly CI-skipped. |
| [x] | tests/e2e/project-files.spec.js | 12 | 0 blocking, 0 warnings | Clean. ZIP fixture creation helper, companion file add/remove, file tree display, deep-link example loading. |
| [x] | tests/e2e/saved-projects.spec.js | 12 | 0 blocking, 0 warnings | Clean. Entire describe block is test.describe.skip() with documented reason (modal timing in headless). Appropriate. |
| [x] | tests/e2e/stakeholder-acceptance.spec.js | 12 | 0 blocking, 0 warnings | Clean. Stakeholder acceptance test suite with screenshots. Uses hardcoded localhost URL (consistent with other smoke tests). |
| [x] | tests/e2e/stakeholder-bugfix-verification.spec.js | 12 | 0 blocking, 0 warnings | Clean. Verifies Bugs 1/3/4/5 fixes. createMissingCompanionZip helper is well-documented. |
| [x] | tests/e2e/stakeholder-zip-acceptance.spec.js | 12 | 0 blocking, 0 warnings | Clean. All tests skip when .volkswitch fixture absent. attachDiagnostics helper captures console/network/timing. |
| [x] | tests/e2e/terminology.spec.js | 12 | 0 blocking, 0 warnings | Clean. Verifies "Saved Projects" and "Companion Files" terminology consistency. |
| [x] | tests/e2e/theme-switching.spec.js | 12 | 0 blocking, 0 warnings | Clean. Theme toggle, persistence, high-contrast, color tokens. |
| [x] | tests/e2e/tutorials.spec.js | 12 | 0 blocking, 0 warnings | Clean. 6 tutorials x 2 viewports via window.startTutorial() API. Spotlight targeting, panel positioning, completion criteria. |
| [x] | tests/e2e/zip-workflow.spec.js | 12 | 0 blocking, 0 warnings | Clean. ZIP upload, file tree display, companion file management. uploadZipProject helper waits for WASM-ready before upload. |
| [x] | tests/visual/core-ui.visual.spec.js | 12 | 0 blocking, 0 warnings | Clean. Screenshot comparison tests for welcome screen, main layout, header controls, dark/light themes. Appropriate maxDiffPixels/threshold tolerances. |
| [x] | tests/fixtures/forge-preset.json | 12 | 0 blocking, 0 warnings | Clean. Valid single-preset fixture. |
| [x] | tests/fixtures/incompatible-preset.json | 12 | - | Clean. |
| [x] | tests/fixtures/sample.scad | 12 | 0 blocking, 0 warnings | Clean. Parametric box with Dimensions/Options groups, [Hidden] section, yes/no toggle param. |
| [x] | tests/fixtures/sample-advanced.scad | 12 | - | Clean. |
| [x] | tests/fixtures/simple-2d.scad | 12 | 0 blocking, 0 warnings | Clean. |
| [x] | tests/fixtures/test-multipreset.json | 12 | 0 blocking, 0 warnings | Clean. |
| [x] | tests/fixtures/test-presets.json | 12 | 0 blocking, 0 warnings | Clean. |
| [x] | tests/fixtures/test-scad-with-includes.scad | 12 | 0 blocking, 0 warnings | Clean. |
| [x] | tests/fixtures/test-scad-with-version.scad | 12 | 0 blocking, 0 warnings | Clean. |
| [x] | tests/fixtures/keyguard-minimal/keyguard_minimal.scad | 12 | 0 blocking, 0 warnings | Clean. Minimal keyguard with yes/no params and openings_and_additions.txt include. |
| [x] | tests/fixtures/keyguard-minimal/openings_and_additions.txt | 12 | 0 blocking, 0 warnings | Clean. |

---

## Phase 4: CLI and Scripts

### Session 13 — CLI Tooling

| Status | File | Session | Bloat Findings | Notes |
|--------|------|---------|----------------|-------|
| [x] | bin/openscad-forge.js | 13 | 0 blocking, 0 warnings | Clean. Registers extract/scaffold/validate/sync/theme/ci/manifest commands. `cli/commands/test.js` exists but is not registered here — dead command file, noted but not removed (API boundary rule). |
| [E] | cli/commands/ci.js | 13 | 0 blocking, 0 warnings | Removed 3 narrating comments in ciCommand handler. CI_TEMPLATES data structure is clean. |
| [E] | cli/commands/extract.js | 13 | 0 blocking, 0 warnings | Removed 5 narrating comments in extractCommand handler. |
| [x] | cli/commands/manifest.js | 13 | 0 blocking, 0 warnings | Clean. Well-structured with value-adding section dividers (not narrating). File-scanning helpers, main-file detection heuristics, and buildManifest logic all correct. |
| [E] | cli/commands/scaffold.js | 13 | 0 blocking, 0 warnings | Removed ~14 narrating comments in scaffoldCommand handler. Also removed dead `themeLink` variable (inlined the string directly). |
| [E] | cli/commands/sync.js | 13 | 0 blocking, 0 warnings | Removed 8 narrating comments in syncCommand handler. detectIssues and applyFix logic are clean. |
| [x] | cli/commands/test.js | 13 | 0 blocking, 0 warnings | Clean. Not registered in bin/openscad-forge.js — dead command. `generateCoverageReport` is used when `options.report` is set. Noted but not removed per API boundary rule. |
| [E] | cli/commands/theme.js | 13 | 0 blocking, 0 warnings | Removed 4 narrating comments in shadeColor and createCustomTheme. THEME_PRESETS and generateThemeCSS are clean. |
| [E] | cli/commands/validate.js | 13 | 0 blocking, 0 warnings | Removed 4 narrating comments in validateCommand handler. validateSchema, validateUI, detectTemplate, getTemplateFiles, loadGoldenFixtures, runTestCases, formatResults all clean. |
| [x] | cli/templates/angular/index.html.template | 13 | 0 blocking, 0 warnings | Clean. Standard HTML shell with embedded schema/scad script tags. |
| [x] | cli/templates/angular/src/app/app.component.ts | 13 | 0 blocking, 0 warnings | Clean. Angular component with proper OnInit/OnDestroy lifecycle. |
| [x] | cli/templates/angular/src/app/app.config.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/app/components/header.component.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/app/components/parameter-control.component.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/app/components/parameters-panel.component.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/app/components/preview-panel.component.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/app/services/openscad.service.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/main.ts | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/src/worker/openscad-worker.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/tsconfig.json.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/angular/vite.config.js.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/index.html.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/App.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/components/Header.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/components/ParameterControl.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/components/ParametersPanel.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/components/PreviewPanel.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/main.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/src/worker/openscad-worker.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/preact/vite.config.js.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/index.html.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/App.jsx | 13 | 0 blocking, 0 warnings | Clean. Well-structured React app with worker-based rendering, URL hash param sync, and STL download. |
| [x] | cli/templates/react/src/components/Header.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/components/ParameterControl.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/components/ParametersPanel.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/components/PreviewPanel.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/main.jsx | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/src/worker/openscad-worker.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/react/vite.config.js.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/index.html.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/App.svelte | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/lib/Header.svelte | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/lib/ParameterControl.svelte | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/lib/ParametersPanel.svelte | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/lib/PreviewPanel.svelte | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/main.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/src/worker/openscad-worker.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/svelte/vite.config.js.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/index.html.template | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/App.vue | 13 | 0 blocking, 0 warnings | Clean. Vue 3 Composition API app with same patterns as React template. |
| [x] | cli/templates/vue/src/components/Header.vue | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/components/ParameterControl.vue | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/components/ParametersPanel.vue | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/components/PreviewPanel.vue | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/main.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/src/worker/openscad-worker.js | 13 | 0 blocking, 0 warnings | Clean. |
| [x] | cli/templates/vue/vite.config.js.template | 13 | 0 blocking, 0 warnings | Clean. |

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

### Session 1 Re-verification — 2026-02-23

- Session 1 was completed before code changes; re-verified `index.html` and `src/main.js` after commits 7e5974a and 0f69323
- Changes were all legitimate feature/fix work: workflow breadcrumbs removed, terminology fixes, deferred WASM init for deep-link
- Bloat scan: 0 blocking, 0 warnings
- No additional edits needed; Session 1 findings remain valid

### Session 2 — 2026-02-23

- Files reviewed: 8
- Files edited: 1 (`src/js/ui-mode-controller.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: One dead code removal — unused `panelResults` debug array in `applyMode()`. `ui-generator.js` has two dead exports (`renderFromSchema`, `renderFromSchemaSync`) noted but preserved per API boundary rule. All other files clean.

### Session 3 — 2026-02-23

- Files reviewed: 6
- Files edited: 4 (`monaco-editor.js`, `textarea-editor.js`, `editor-state-manager.js`, `console-panel.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: Removed ~32 narrating comments across monaco-editor.js and textarea-editor.js (section headers that restated what the code already said). Removed dead `_modeSnapshots` state from editor-state-manager.js (written but never read). Fixed duplicate description line in console-panel.js header. `verifyMonacoCSP()` in monaco-editor.js is a dead export (never imported) — noted but preserved per API boundary rule.

### Session 4 — 2026-02-23

- Files reviewed: 7
- Files edited: 1 (`src/worker/openscad-worker.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: Rendering pipeline files are clean and well-structured. Removed 5 dead items from openscad-worker.js: the `_renderWithExport()` fallback function (defined but never called from the message handler — all renders go through `renderWithCallMain`), `_shouldRetryWithoutFlags` variable (assigned but never read), `_helpError` variable in `checkCapabilities` (assigned but never read), `_lastHeartbeatId` module-level variable (assigned but never read), and `_mountedCount`/`_failedCount` counters in `mountLibraries` (assigned but never read — only `failedSample` was used for logging). All other files (preview.js, render-controller.js, render-queue.js, auto-preview-controller.js, quality-tiers.js, camera-panel-controller.js) are clean with no issues.

### Session 5 — 2026-02-23

- Files reviewed: 3
- Files edited: 0
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: All three storage/persistence modules are clean. `storage-manager.js` has a minor consolidation opportunity (`clearCachedData` and `clearAppCachesOnly` share near-identical SW+CacheStorage logic) — noted for Session 21 but not edited per API boundary rule. `saved-projects-manager.js` is a well-structured ~2K-line IndexedDB+localStorage dual-write module with no dead code. `preset-manager.js` has thorough OpenSCAD-native and Forge format import/export with correct type coercion logic; no dead code. This session was the first after the PAUSE-2 human review break.

### Session 6 — 2026-02-23

- Files reviewed: 5
- Files edited: 1 (`src/js/parser.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: Parsing, schema, and manifest modules are clean. Removed one empty `else if` placeholder block from `parser.js` (lines 659-662 — had a comment but no code). Three `@reserved` exports in `validation-schemas.js` are intentional API reservations, preserved per API boundary rule. `manifest-loader.js` is well-structured with proper error classification and CORS-aware messaging. `schema-generator.js` has a minor harmless redundancy in `fromJsonSchema()` (two branches both assign `uiType = 'input'`). `validation-constants.js` is a clean constants file.

### Session 7 — 2026-02-23

- Files reviewed: 7
- Files edited: 1 (`src/js/keyboard-config.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: Accessibility and input modules are clean and well-implemented. Removed one dead `_originalContent` variable from `keyboard-config.js`'s `showConflictWarning()` — it was assigned but never read (the timeout callback hardcodes the "Press a key..." prompt string instead of restoring from the variable). `announcer.js` has a solid dual live-region design with per-politeness-level debounce timers. `focus-trap.js` provides both element-level and document-level trap patterns, both actively used. `searchable-combobox.js` is a well-implemented WAI-ARIA combobox delegating keyboard navigation to @github/combobox-nav. `gamepad-controller.js` is a complete W3C Standard Gamepad API implementation. `modal-manager.js` correctly handles focus trap + trigger restoration. `param-detail-controller.js` is a compact, clean controller. This session was the first after the PAUSE-3 human review break.

### Session 8 — 2026-02-23

- Files reviewed: 22
- Files edited: 1 (`src/js/tutorial-sandbox.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: Utilities, features, and remaining modules are clean. Removed one dead import alias (`POLITENESS as _POLITENESS`) from `tutorial-sandbox.js` -- imported from announcer.js but never referenced in the file. All other files are clean: zip-handler.js has solid security (path-traversal guard) and heuristic preset companion mapping; error-translator.js implements COGA-aligned user-friendly error messages; _hfm.js is a well-documented ASCII art renderer using 6D shape vectors; _seq.js is a Konami code detector. Notable non-issues: empty catch in shared-image-store.js (intentional subscriber isolation), alert() in comparison-view.js (intentional fallback), handleMouseLeave empty body in image-measurement.js (intentional coordinate preservation), inline CSS in sw-manager.js showUpdateToast (intentional self-contained toast). This session completes Phase 1 (Core Application). Next: PAUSE-4 human review break before Session 9 (CSS).

### Session 9 — 2026-02-23

- Files reviewed: 9
- Files edited: 2 (`src/styles/components.css`, `src/styles/layout.css`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: All CSS stylesheets are well-structured with comprehensive accessibility coverage (forced-colors, prefers-contrast, prefers-reduced-motion, high-contrast mode). Found and fixed 7 undefined CSS custom property references that were silently falling back to empty/none: `--color-surface-hover` (should be `--color-hover-bg`), `--color-focus-ring` (should be `--color-focus`, 2 uses), `--color-border-strong` (should be `--color-text-primary`, 2 uses), `--color-primary`/`--color-primary-hover` (should be `--color-accent`/`--color-accent-hover`), and `--color-text-on-primary` (should be `--color-on-accent`). Also removed one duplicate section header comment in layout.css (two consecutive block comment headers for the Preview Status Bar). The `variant.css` retro terminal theme (green phosphor / amber phosphor) is well-implemented with proper forced-colors and cursor overrides. This session completes Phase 2 (Stylesheets). Next: PAUSE-5 human review break before Session 10 (Unit Tests Part 1).

### Session 10 — 2026-02-23

- Files reviewed: 11
- Files edited: 0
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: All unit test files for Phase 1 modules are clean and well-structured. No dead code, no AI bloat patterns, no stale imports. Tests provide thorough coverage of their respective modules: StateManager/ParameterHistory (state.test.js), full UI generator surface including slider spinbox parity (ui-generator.test.js), editor state including captureState/restoreState (editor-state-manager.test.js), PreviewManager including overlay config and custom grid presets (preview.test.js), RenderController including capability detection and estimateRenderTime (render-controller.test.js), RenderQueue including export/import (render-queue.test.js), quality tier analysis and adaptive config (quality-tiers.test.js), camera panel desktop+mobile (camera-panel-controller.test.js), and AutoPreviewController including compound cache keys and color resolution (auto-preview-controller.test.js). This session completes Phase 3 Part 1. Next: PAUSE-6 human review break before Session 11 (Unit Tests Part 2).

### Session 11 — 2026-02-23

- Files reviewed: 23
- Files edited: 0
- Bloat scan: 0 blocking, 2 warnings (before and after — warnings are emoji in zip-handler.test.js assertions testing rendered output, not AI bloat)
- Tests pass: yes (1370/1370)
- Summary: All unit test files for Phase 2-8 modules are clean. No dead code, no AI bloat patterns, no stale imports. Notable highlights: saved-projects-load.test.js is a well-documented regression test for the extension guard bug fix; cli-manifest.test.js mirrors CLI pure logic for isolated unit testing; color-contrast.test.js provides automated WCAG 2.2 AA/AAA verification using Color.js and Radix UI color scales; parser.test.js uses a golden corpus for vector parsing regression; feature-flags.test.js covers the cyrb53/hashToBucket rollout bucketing internals. The 2 bloat-scan warnings in zip-handler.test.js are emoji in test assertions that verify emoji presence in rendered file tree output — behavioral testing, not AI bloat. This session completes Phase 3 (Tests Part 2). Next: PAUSE-6 human review break before Session 12 (E2E and Visual Tests).

### Session 13 — 2026-02-23

- Files reviewed: 58 (9 CLI commands + bin entry point + 48 template files)
- Files edited: 6 (`cli/commands/ci.js`, `cli/commands/extract.js`, `cli/commands/scaffold.js`, `cli/commands/sync.js`, `cli/commands/theme.js`, `cli/commands/validate.js`)
- Bloat scan: 0 blocking, 0 warnings (before and after)
- Tests pass: yes (1370/1370)
- Summary: CLI command files had narrating comments throughout their handler functions — removed ~38 total across 6 files. `bin/openscad-forge.js` is clean. `cli/commands/manifest.js` is the best-written CLI file (well-structured with value-adding section dividers). `cli/commands/test.js` is a dead command — it exists but is never registered in the CLI entry point; noted but not removed per API boundary rule. All 48 template files (angular/preact/react/svelte/vue) are clean starter code with no bloat. This session completes Phase 4 Part 1. Next: Session 14 (Build Scripts and Config) after PAUSE-8 human review break.

### Session 12 — 2026-02-23

- Files reviewed: 36 (34 in original checklist + 2 unlisted fixture files discovered: keyguard-minimal/default.svg, already-listed sample-advanced.scad confirmed)
- Files edited: 1 (`tests/e2e/accessibility.spec.js`)
- Bloat scan: 0 blocking, 1 warning (before) → 0 blocking, 0 warnings (after)
- Tests pass: yes (1370/1370)
- Summary: E2E and visual test suite is clean and well-structured. Removed 1 narrating comment from accessibility.spec.js ("// Import the module dynamically" before a dynamic import call). Config files (playwright.config.js, vitest.config.js) are clean with appropriate CI/Windows guards. Notable patterns: manifest-loading.spec.js uses an excellent page.route() mock server pattern for testing GitHub-hosted manifests without real network calls; mobile-drawer.spec.js uses a console event listener for WASM-ready detection (avoids race condition); mobile-viewport.spec.js uses stripWorkerOptions() for Firefox isMobile compatibility; tutorials.spec.js tests 6 tutorials x 2 viewports via window.startTutorial() API. saved-projects.spec.js is intentionally fully skipped (test.describe.skip) due to modal timing in headless — documented and appropriate. Stakeholder smoke tests (keyguard-parser-smoke, keyguard-compilation-smoke, stakeholder-zip-acceptance) all correctly skip when .volkswitch private fixtures are absent. This session completes Phase 3 (E2E/Visual Tests). Next: PAUSE-7 human review break before Session 13 (CLI Tooling).
