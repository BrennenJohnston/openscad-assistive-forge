# Anatomy: src/js/ui-generator.js

- Total lines: 2732
- Top-level declarations: 52
- Exports: 23
- Module-level mutable state (let/var): 7
- Section banners: 1

## Section banners

| Line | Banner |
|---:|---|
| 954 | /** * Classify whether a parameter group belongs to the Simple tier. * * Classification heuristic (works for ANY .scad f |

## Exports

- setGalleryOptions
- clearGalleryOptions
- getSvgPrepMetadata
- setSvgPrepMetadata
- clearSvgPrepMetadata
- getGalleryParamNames
- setFileUploadListener
- appendUserSvgToGallery
- setLimitsUnlocked
- areLimitsUnlocked
- getDefaultValue
- getAllDefaults
- clearParameterSearch
- locateParameterKey
- focusParameter
- setParameterValue
- resetParameter
- updateDependentParameters
- initParameterSearch
- isSimpleGroup
- populateGroupJumpSelect
- getModifiedParameterCount
- renderParameterUI

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 104 | galleryOptionsMap | `let galleryOptionsMap = {};` |
| 110 | fileUploadListener | `let fileUploadListener = null;` |
| 114 | svgPrepMetadataByFile | `let svgPrepMetadataByFile = {};` |
| 274 | currentParameterValues | `let currentParameterValues = {};` |
| 280 | originalParameterLimits | `let originalParameterLimits = {};` |
| 283 | limitsUnlocked | `let limitsUnlocked = false;` |
| 286 | parameterMetadata | `let parameterMetadata = {};` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 20 | function | formatParamName |
| 34 | function | createLabelContainer |
| 88 | function | maybePrepareForOpenScad |
| 104 | module-level | galleryOptionsMap |
| 107 | module-level | galleryListboxRefs |
| 110 | module-level | fileUploadListener |
| 114 | module-level | svgPrepMetadataByFile |
| 122 | exported function | setGalleryOptions |
| 129 | exported function | clearGalleryOptions |
| 143 | exported function | getSvgPrepMetadata |
| 153 | exported function | setSvgPrepMetadata |
| 164 | exported function | clearSvgPrepMetadata |
| 172 | exported function | getGalleryParamNames |
| 180 | exported function | setFileUploadListener |
| 191 | exported function | appendUserSvgToGallery |
| 274 | module-level | currentParameterValues |
| 277 | module-level | defaultParameterValues |
| 280 | module-level | originalParameterLimits |
| 283 | module-level | limitsUnlocked |
| 286 | module-level | parameterMetadata |
| 292 | exported function | setLimitsUnlocked |
| 350 | exported function | areLimitsUnlocked |
| 359 | exported function | getDefaultValue |
| 367 | exported function | getAllDefaults |
| 374 | exported function | clearParameterSearch |
| 389 | function | findParamControl |
| 423 | exported function | locateParameterKey |
| 439 | exported function | focusParameter |
| 491 | exported function | setParameterValue |
| 528 | exported function | resetParameter |
| 576 | function | checkDependency |
| 596 | exported function | updateDependentParameters |
| 669 | function | applyDependency |
| 695 | function | createHelpTooltip |
| 820 | exported function | initParameterSearch |
| 891 | function | filterParameters |
| 968 | exported function | isSimpleGroup |
| 987 | exported function | populateGroupJumpSelect |
| 1007 | exported function | getModifiedParameterCount |
| 1025 | function | createSliderControl |
| 1242 | function | createParameterResetButton |
| 1268 | function | updateResetButtonState |
| 1287 | function | createNumberInput |
| 1403 | function | createSelectControl |
| 1457 | function | createToggleControl |
| 1514 | function | createTextInput |
| 1567 | function | createColorControl |
| 1664 | function | createSvgGallery |
| 1798 | function | createFileControl |
| 2264 | function | createVectorControl |
| 2472 | function | createRawControl |
| 2534 | exported function | renderParameterUI |

## Event listeners attached at module scope

| Line | Event | Snippet |
|---:|---|---|
| 245 | click | `option.addEventListener('click', () => {` |
| 746 | click | `button.addEventListener('click', (e) => {` |
| 759 | focus | `button.addEventListener('focus', () => {` |
| 764 | blur | `button.addEventListener('blur', () => {` |
| 774 | keydown | `button.addEventListener('keydown', (e) => {` |
| 788 | click | `document.addEventListener('click', (e) => {` |
| 800 | keydown | `document.addEventListener('keydown', (e) => {` |
| 829 | input | `searchInput.addEventListener('input', (e) => {` |
| 841 | click | `clearBtn.addEventListener('click', () => {` |
| 851 | change | `jumpSelect.addEventListener('change', (e) => {` |
| 878 | click | `showAllBtn.addEventListener('click', () => {` |
| 1133 | input | `input.addEventListener('input', (e) => {` |
| 1141 | input | `spinbox.addEventListener('input', (e) => {` |
| 1147 | change | `spinbox.addEventListener('change', (e) => {` |
| 1159 | keydown | `spinbox.addEventListener('keydown', (e) => {` |
| 1254 | click | `resetBtn.addEventListener('click', (e) => {` |
| 1334 | change | `input.addEventListener('change', (e) => {` |
| 1433 | change | `select.addEventListener('change', (e) => {` |
| 1487 | change | `input.addEventListener('change', (e) => {` |
| 1542 | change | `input.addEventListener('change', (e) => {` |
| 1624 | input | `colorInput.addEventListener('input', (e) => {` |
| 1633 | input | `hexInput.addEventListener('input', (e) => {` |
| 1750 | click | `option.addEventListener('click', () => selectOption(index));` |
| 1756 | keydown | `listbox.addEventListener('keydown', (e) => {` |
| 1885 | click | `editBtn.addEventListener('click', () => {` |
| 2080 | click | `fileButton.addEventListener('click', () => {` |
| 2085 | change | `fileInput.addEventListener('change', (e) => {` |
| 2198 | click | `clearButton.addEventListener('click', () => {` |
| 2366 | input | `input.addEventListener('input', () => {` |
| 2380 | keydown | `input.addEventListener('keydown', (e) => {` |
| ... | ... | 2 more |