# Anatomy: src/main.js

- Total lines: 12653
- Top-level declarations: 28
- Exports: 0
- Module-level mutable state (let/var): 7
- Section banners: 0

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 284 | renderController | `let renderController = null;` |
| 285 | previewManager | `let previewManager = null;` |
| 286 | autoPreviewController | `let autoPreviewController = null;` |
| 287 | comparisonController | `let comparisonController = null;` |
| 288 | comparisonView | `let comparisonView = null;` |
| 289 | renderQueue | `let renderQueue = null;` |
| 292 | currentSavedProjectId | `let currentSavedProjectId = null;` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 140 | module-level | STORAGE_KEY_AUTO_PREVIEW_ENABLED |
| 141 | module-level | STORAGE_KEY_PREVIEW_QUALITY |
| 142 | module-level | STORAGE_KEY_RECOVERY_SOURCE |
| 143 | module-level | STORAGE_KEY_RECOVERY_TIMESTAMP |
| 144 | module-level | STORAGE_KEY_STATUS_BAR |
| 146 | module-level | STORAGE_KEY_MODEL_COLOR |
| 147 | module-level | STORAGE_KEY_MODEL_COLOR_ENABLED |
| 148 | module-level | STORAGE_KEY_MODEL_OPACITY |
| 149 | module-level | STORAGE_KEY_BRIGHTNESS |
| 150 | module-level | STORAGE_KEY_CONTRAST |
| 151 | module-level | STORAGE_KEY_MODEL_APPEARANCE_ENABLED |
| 154 | module-level | STORAGE_KEY_PARAM_PANEL_COLLAPSED |
| 155 | module-level | STORAGE_KEY_LAYOUT_SIZES |
| 224 | function | resolve2DExportParameters |
| 249 | function | checkBrowserSupport |
| 265 | function | showUnsupportedBrowser |
| 284 | module-level | renderController |
| 285 | module-level | previewManager |
| 286 | module-level | autoPreviewController |
| 287 | module-level | comparisonController |
| 288 | module-level | comparisonView |
| 289 | module-level | renderQueue |
| 292 | module-level | currentSavedProjectId |
| 304 | function | initApp |
| 12012 | function | renderLibraryUI |
| 12122 | function | getEnabledLibrariesForRender |
| 12129 | module-level | DESKTOP_REFERENCE_GEOMETRY |
| 12161 | function | findMatchingReference |

## Event listeners attached at module scope

| Line | Event | Snippet |
|---:|---|---|
| 479 | click | `?.addEventListener('click', () => {` |
| 484 | click | `document.getElementById('memoryBannerSave')?.addEventListener('click', () => {` |
| 491 | click | `?.addEventListener('click', () => {` |
| 510 | click | `?.addEventListener('click', () => {` |
| 522 | click | `?.addEventListener('click', () => {` |
| 533 | click | `?.addEventListener('click', () => {` |
| 697 | message | `navigator.serviceWorker.addEventListener('message', onCacheCleared);` |
| 782 | click | `modal.addEventListener('click', (e) => {` |
| 791 | keydown | `modal.addEventListener('keydown', (e) => {` |
| 803 | click | `updateBannerRefreshBtn.addEventListener('click', requestUpdate);` |
| 806 | click | `updateBannerDismissBtn.addEventListener('click', hideUpdateBanner);` |
| 811 | click | `clearCacheBtn.addEventListener('click', requestCacheClear);` |
| 824 | updatefound | `registration.addEventListener('updatefound', () => {` |
| 828 | statechange | `newWorker.addEventListener('statechange', () => {` |
| 839 | controllerchange | `navigator.serviceWorker.addEventListener('controllerchange', () => {` |
| 850 | message | `navigator.serviceWorker.addEventListener('message', (event) => {` |
| 895 | appinstalled | `window.addEventListener('appinstalled', () => {` |
| 910 | beforeunload | `window.addEventListener('beforeunload', () => {` |
| 1144 | change | `preserveCheckbox.addEventListener('change', () => {` |
| 1163 | click | `exportBtn.addEventListener('click', async () => {` |
| 1180 | click | `cancelBtn.addEventListener('click', () => {` |
| 1185 | click | `confirmBtn.addEventListener('click', async () => {` |
| 1249 | keydown | `modal.addEventListener('keydown', (e) => {` |
| 1359 | click | `clearStorageBtn.addEventListener('click', showSmartCacheClearDialog);` |
| 1365 | click | `exportAllProjectsBtn.addEventListener('click', handleExportBackup);` |
| 1372 | click | `importProjectsBtn.addEventListener('click', () => {` |
| 1376 | change | `importBackupInput.addEventListener('change', async (e) => {` |
| 1396 | click | `importFolderBtn.addEventListener('click', async () => {` |
| 1451 | change | `importFolderInput.addEventListener('change', async (e) => {` |
| 1671 | click | `firstVisitContinue.addEventListener('click', () =>` |
| ... | ... | 166 more |