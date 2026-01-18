# Changelog: v2.5.0 — UX Enhancements

**Release Date**: 2026-01-16  
**Focus**: User Experience Improvements  
**Status**: Released ✅

## Overview

v2.5.0 introduces several user experience enhancements including help tooltips, unit display for numeric parameters, and Liberation font support for OpenSCAD's text() function.

## New Features

### 1. Help Tooltips for Parameters ✅

Parameters with descriptions now display a help button (?) that shows tooltips on click.

**Features**:
- Click-to-toggle tooltips (not hover-based, better for mobile)
- Global Escape key dismisses any open tooltip
- Click-outside-to-close functionality
- Accessible with proper ARIA attributes
- Mobile-responsive positioning

**Implementation**:
- `src/js/ui-generator.js`: `createHelpTooltip()` function
- `src/styles/components.css`: `.help-tooltip-*` styles

### 2. Unit Display for Numeric Parameters ✅

Numeric parameters now display units (mm, °, %, etc.) based on parameter descriptions or names.

**Features**:
- Automatic unit detection from parameter descriptions
- Intelligent inference from parameter names (e.g., `_width` → mm, `angle` → °)
- Units displayed in slider output and ARIA labels
- Supports: mm, cm, in, °, %

**Implementation**:
- `src/js/parser.js`: `extractUnit()` function
- `src/js/ui-generator.js`: Unit display in sliders and number inputs

### 3. Liberation Font Bundle ✅

OpenSCAD's `text()` function now works with bundled Liberation fonts.

**Features**:
- Auto-download during `npm run setup-wasm`
- Fonts mounted to WASM filesystem at startup
- Includes: Sans (Regular/Bold/Italic), Mono (Regular)

**Implementation**:
- `scripts/download-wasm.js`: Font download and extraction from tar.gz
- `src/worker/openscad-worker.js`: Font mounting to WASM FS

## Technical Changes

### Parser Enhancements
- Extract descriptions from preceding line comments
- Unit extraction for numeric parameters
- Better support for OpenSCAD Customizer annotations

### UI Generator Enhancements
- Help tooltip creation and management
- Unit display in slider output elements
- Improved ARIA labels with units

### Font Infrastructure
- ESM-compatible download script
- Tar.gz extraction using native Node.js modules
- Gitignore configuration for downloaded fonts

## Files Changed

### Core Changes
- `src/main.js`: Version bump
- `package.json`: Version bump
- `public/sw.js`: Cache version bump

### New/Modified Features
- `src/js/parser.js`: Unit extraction, description parsing
- `src/js/ui-generator.js`: Help tooltips, unit display
- `src/styles/components.css`: Tooltip and unit styles

### Infrastructure
- `scripts/download-wasm.js`: Font download/extraction
- `src/worker/openscad-worker.js`: Font mounting
- `.gitignore`: Exclude downloaded font files

## Migration Notes

### From v2.4.0 to v2.5.0

1. Run `npm run setup-wasm` to download Liberation fonts
2. No breaking changes to existing functionality
3. Parameters with descriptions now show help tooltips automatically
4. Numeric parameters with dimension/angle names now show units

## Testing

- Help tooltips tested on desktop and mobile
- Unit extraction tested with Universal Cuff example (47 parameters)
- Font mounting verified in console logs
- Accessibility tested with ARIA labels

## Known Limitations

- Help tooltips require JavaScript (progressive enhancement)
- Unit inference based on naming conventions, not all cases covered
- Font files add ~500KB to initial download

## Contributors

- Testing: Browser-based verification

---

**Full Changelog**: Compare v2.4.0...v2.5.0
