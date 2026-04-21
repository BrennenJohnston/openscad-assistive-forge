# Anatomy: src/js/preview.js

- Total lines: 4734
- Top-level declarations: 19
- Exports: 5
- Module-level mutable state (let/var): 0
- Section banners: 0

## Exports

- isThreeJsLoaded
- getThreeModule
- CORNFIELD_BACK_COLOR
- DESKTOP_SHININESS
- PreviewManager

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 53 | module-level | STORAGE_KEY_MEASUREMENTS |
| 54 | module-level | STORAGE_KEY_GRID |
| 55 | module-level | STORAGE_KEY_GRID_SIZE |
| 56 | module-level | STORAGE_KEY_CUSTOM_GRID_PRESETS |
| 57 | module-level | STORAGE_KEY_GRID_COLOR |
| 58 | module-level | STORAGE_KEY_GRID_OPACITY |
| 59 | module-level | STORAGE_KEY_AUTO_BED |
| 60 | module-level | STORAGE_KEY_CAMERA_COLLAPSED |
| 61 | module-level | STORAGE_KEY_CAMERA_POSITION |
| 62 | module-level | STORAGE_KEY_LOD_WARNING_DISMISSED |
| 67 | module-level | DEFAULT_GRID_CONFIG |
| 69 | exported function | isThreeJsLoaded |
| 77 | exported function | getThreeModule |
| 96 | module-level | LOD_CONFIG |
| 107 | module-level | CORNFIELD_FRONT_COLOR |
| 111 | exported const | CORNFIELD_BACK_COLOR |
| 117 | exported const | DESKTOP_SHININESS |
| 119 | module-level | PREVIEW_COLORS |
| 196 | exported class | PreviewManager |

## Event listeners attached at module scope

| Line | Event | Snippet |
|---:|---|---|
| 342 | click | `this.renderer.domElement.addEventListener('click', () => {` |
| 482 | resize | `window.addEventListener('resize', this._debouncedResize);` |
| 1100 | keydown | `document.addEventListener('keydown', this.keyboardHandler);` |
| 1269 | click | `toggleBtn.addEventListener('click', () => {` |
| 1272 | click | `moveBtn.addEventListener('click', () => {` |
| 1292 | click | `?.addEventListener('click', () => {` |
| 1299 | click | `?.addEventListener('click', () => {` |
| 1304 | click | `document.getElementById('cameraRotateUp')?.addEventListener('click', () => {` |
| 1311 | click | `?.addEventListener('click', () => {` |
| 1317 | click | `document.getElementById('cameraPanLeft')?.addEventListener('click', () => {` |
| 1322 | click | `document.getElementById('cameraPanRight')?.addEventListener('click', () => {` |
| 1327 | click | `document.getElementById('cameraPanUp')?.addEventListener('click', () => {` |
| 1332 | click | `document.getElementById('cameraPanDown')?.addEventListener('click', () => {` |
| 1339 | click | `document.getElementById('cameraZoomIn')?.addEventListener('click', () => {` |
| 1344 | click | `document.getElementById('cameraZoomOut')?.addEventListener('click', () => {` |
| 1352 | click | `?.addEventListener('click', () => {` |
| 1362 | click | `btn.addEventListener('click', () => {` |
| 1849 | click | `?.addEventListener('click', () => {` |
| 1855 | click | `?.addEventListener('click', () => {` |