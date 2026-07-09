# Anatomy: src/worker/openscad-worker.js

- Total lines: 2827
- Top-level declarations: 41
- Exports: 0
- Module-level mutable state (let/var): 12
- Section banners: 1

## Section banners

| Line | Banner |
|---:|---|
| 1789 | /** * Post-process DXF output from OpenSCAD WASM to fix known compatibility issues. * * The OpenSCAD WASM binary (based  |

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 36 | openscadInstance | `let openscadInstance = null;` |
| 37 | openscadModule | `let openscadModule = null;` |
| 38 | initialized | `let initialized = false;` |
| 39 | currentRenderTimeout | `let currentRenderTimeout = null;` |
| 42 | assetBaseUrl | `let assetBaseUrl = ''; // Base URL for fetching assets (fonts, libraries, etc.)` |
| 43 | wasmAssetLogShown | `let wasmAssetLogShown = false;` |
| 44 | openscadConsoleOutput | `let openscadConsoleOutput = ''; // Accumulated console output from OpenSCAD` |
| 45 | openscadCapabilities | `let openscadCapabilities = null;` |
| 46 | _callMainInvoked | `let _callMainInvoked = false;` |
| 83 | wasmInitStartTime | `let wasmInitStartTime = 0;` |
| 84 | wasmInitDurationMs | `let wasmInitDurationMs = 0;` |
| 2099 | heapBeforeRenderMB | `let heapBeforeRenderMB = 0;` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 36 | module-level | openscadInstance |
| 37 | module-level | openscadModule |
| 38 | module-level | initialized |
| 39 | module-level | currentRenderTimeout |
| 40 | module-level | mountedFiles |
| 41 | module-level | mountedLibraries |
| 42 | module-level | assetBaseUrl |
| 43 | module-level | wasmAssetLogShown |
| 44 | module-level | openscadConsoleOutput |
| 45 | module-level | openscadCapabilities |
| 46 | module-level | _callMainInvoked |
| 48 | function | isAbsoluteUrl |
| 52 | function | normalizeBaseUrl |
| 57 | function | _resolveWasmAsset |
| 83 | module-level | wasmInitStartTime |
| 84 | module-level | wasmInitDurationMs |
| 90 | function | ensureOpenSCADModule |
| 103 | module-level | ERROR_TRANSLATIONS |
| 234 | function | translateError |
| 286 | function | initWASM |
| 518 | function | mountFonts |
| 640 | function | checkCapabilities |
| 753 | module-level | WORK_DIR |
| 769 | function | mountFiles |
| 910 | function | generateMissingFileWarnings |
| 935 | function | clearMountedFiles |
| 994 | function | mountLibraries |
| 1136 | function | clearLibraries |
| 1155 | function | parametersToScad |
| 1180 | function | _applyOverrides |
| 1233 | function | renderWithCallMain |
| 1614 | function | validate2DOutput |
| 1634 | function | validateSVGOutput |
| 1706 | function | validateDXFOutput |
| 1814 | function | postProcessDXF |
| 2096 | module-level | MEMORY_WARNING_THRESHOLD_MB |
| 2099 | module-level | heapBeforeRenderMB |
| 2107 | function | checkMemoryBeforeRender |
| 2160 | function | render |
| 2661 | function | cancelRender |
| 2682 | function | getMemoryUsage |

## Event listeners attached at module scope

(none — addEventListener calls are inside functions only)