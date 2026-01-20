# Changelog

All notable changes to the OpenSCAD Web Customizer Forge project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-01-20

### Enhanced UI & Accessibility Release

**Highlights:**
- Comprehensive color system overhaul with Radix Colors for WCAG compliance
- Responsive drawer UI with mobile-first design
- Camera panel controller for keyboard-accessible 3D navigation
- Preview settings drawer with improved UX
- Enhanced accessibility documentation and testing

### Added

- **Radix Colors Integration**: New semantic color system with automatic light/dark/high-contrast support
- **Camera Panel Controller**: Keyboard-accessible camera controls for 3D preview navigation
- **Preview Settings Drawer**: Collapsible overlay drawer for preview settings with resize capability
- **Color Contrast Testing**: Automated WCAG 2.x and APCA contrast verification
- **UI Standards Guide**: Comprehensive documentation for theme-consistent UI development
- **Color System Guide**: Complete guide for using the new semantic token system
- **Color Migration Guide**: Instructions for updating existing components

### Improved

- **Mobile Off-Canvas Drawer**: Bootstrap-inspired off-canvas pattern for parameters panel
- **Forced Colors Support**: Full compatibility with Windows High Contrast and OS color schemes
- **Focus Management**: Enhanced scroll-margin and scroll-padding for WCAG 2.4.11/2.4.13 compliance
- **Touch Targets**: 44x44px minimum touch targets throughout the UI
- **Accessibility Guide**: Updated with new color system and contrast information
- **Status Bar**: Compact floating status overlay on preview canvas

### Technical

- New CSS files: `color-scales.css`, `semantic-tokens.css`
- New test file: `color-contrast.test.js`
- New guides: `COLOR_SYSTEM_GUIDE.md`, `COLOR_MIGRATION_GUIDE.md`, `UI_STANDARDS.md`
- Radix UI Colors dependency for professional color palette
- Improved high contrast mode with 7:1 AAA contrast ratios

---

## [3.0.0] - 2026-01-19

### Major Milestone - Cloudflare Stable Deployment

This is the first **major stable release** for production deployment on Cloudflare Pages.

**Highlights:**
- Production-ready deployment on Cloudflare Pages (unlimited bandwidth)
- All ESLint errors resolved for clean CI builds
- Comprehensive documentation cleanup and organization
- Complete feature set across 25+ releases now stable

**Infrastructure:**
- Primary hosting: Cloudflare Pages (https://openscad-web-customizer-forge.pages.dev/)
- COOP/COEP headers pre-configured for WASM threading compatibility
- Global CDN for fast worldwide delivery
- Automatic deployments from Git

**Documentation:**
- Updated all references from Vercel to Cloudflare as primary platform
- Marked all completed build plans as done
- Cleaned up PROJECT_STATUS.md with accurate metrics
- Updated README with Cloudflare deployment badge and links

### Fixed

- Resolved `openFeaturesGuide` scope error that caused lint failures
- Fixed unused variable warnings (`formatPresetDescription`, `index`, `fileContent`)
- Prevented generate actions from cancelling in-progress previews
- Improved internal render retry detection for numeric OpenSCAD error codes

---

## [2.10.1] - 2026-01-18

### Fixed

- Prevented generate actions from cancelling in-progress previews, which could leave the UI stuck when generating before preview completion.
- Improved internal render retry detection for numeric OpenSCAD error codes to recover cleanly without user intervention.

---

## [2.10.0] - 2026-01-17

### Added - Enhanced Accessibility & Layout

- **Collapsible Parameter Panel**: Desktop-only collapse/expand with smooth animations
  - Persistent state saved to localStorage
  - Full keyboard accessibility with `aria-expanded` and focus management
  - Automatic expansion on mobile viewports
  
- **Resizable Split Panels**: Drag-to-resize with Split.js integration
  - 8px gutter with visual grip indicator
  - Keyboard navigation (Arrow keys, Home/End)
  - Persistent sizing saved to localStorage
  - Minimum sizes: 280px (params), 300px (preview)
  
- **Focus Mode**: Maximize preview by hiding parameter panel
  - New focus button in preview header
  - Keyboard shortcut: `F` key
  - `aria-pressed` state management
  
- **Compact Header**: Auto-compact mode after file load
  - Reduces vertical space usage
  - Smooth transition animations
  
- **Collapsible UI Sections**: Better space efficiency
  - Preset controls now use `<details>` element
  - Preview settings moved to collapsible disclosure
  - Reduces initial visual complexity
  
- **Actions Dropdown Menu**: Secondary actions in "More" menu
  - Contains: Add to Queue, View Queue, Share Link, Export Params
  - Native `<details>` element for accessibility
  
- **Auto-Hide Status Bar**: Status bar hides when idle ("Ready" state)

### Improved

- **File Info Display**: Collapsible file tree for multi-file projects
- **Output Format Selector**: Moved to parameter panel for better grouping
- **Compact Actions Bar**: Reduced padding and spacing for efficiency
- **Keyboard Navigation**: Enhanced focus management throughout
- **Screen Reader Support**: Comprehensive ARIA attributes
- **Responsive Design**: Desktop features properly disabled on mobile
- **Performance**: RequestAnimationFrame for smooth drag operations

### Technical

- New dependency: split.js (v1.6.5)
- Modified files: main.js (+459), layout.css (+325), components.css (+210), index.html (+158)
- Bundle impact: +~10KB gzipped
- WCAG 2.1 AA compliance maintained
- Full keyboard support with new shortcuts
- Respects `prefers-reduced-motion`

---

## [2.9.0] - 2026-01-16

### Added - WASM Progress & Mobile Enhancements

- **WASM Loading Progress UI**: Full-screen progress indicator during WASM initialization
  - Progress bar with percentage display
  - Stage-based progress messages (downloading, initializing, loading fonts)
  - Indeterminate progress animation for rendering stages
  - Fade-out animation on completion
  - Accessible with ARIA live regions

- **Mobile Viewport E2E Tests**: Comprehensive mobile testing suite
  - Tests on Pixel 5, iPhone 12, iPhone SE devices
  - Landscape orientation tests
  - Small screen (320px) compatibility tests
  - Touch target size verification (WCAG 2.1 compliant)
  - Horizontal overflow detection
  - Font size readability checks

- **Bundle Size Optimization**: Code splitting and lazy loading
  - Three.js split into separate chunk (172KB gzipped)
  - STLLoader and OrbitControls loaded on-demand
  - Main bundle reduced to 67KB gzipped
  - AJV validation library isolated

### Improved

- **Memory Warning System**: Enhanced user notifications
  - Non-intrusive toast notification for high memory usage
  - Auto-dismiss after 15 seconds
  - Manual dismiss option
  - Mobile-responsive design

### Fixed

- **Worker bundling in preview/production**: Kept the worker constructor inline so Vite
  bundles `openscad-wasm-prebuilt` into the worker chunk, preventing OpenSCAD WASM
  initialization failures during preview or Vercel deployments.

### Technical

- Total tests: 602 unit + 42 E2E
- Build time: 4.48s
- Bundle sizes:
  - Main: 231KB (67KB gzipped)
  - Three.js: 667KB (172KB gzipped)
  - CSS: 69KB (10KB gzipped)
- Full mobile viewport E2E coverage

---

## [2.8.0] - 2026-01-16

### Added - Performance & Test Coverage

- **Three.js Lazy Loading**: Already implemented - Three.js modules are loaded on-demand to reduce initial bundle size
  - Parallel loading of three, OrbitControls, and STLLoader
  - Loading indicator shown during module fetch
  - Code splitting via Vite's dynamic imports

- **Memory Usage Monitoring**: Already implemented - WASM memory tracking with user warnings
  - `getMemoryUsage()` method in RenderController
  - Memory warning callback when usage exceeds 80%
  - Real-time memory stats (used, limit, percent)

- **Font Support for text()**: Already implemented - Liberation fonts mounted in WASM virtual filesystem
  - LiberationSans-Regular, Bold, Italic
  - LiberationMono-Regular
  - Automatic font mounting on WASM initialization

### Improved

- **Unit Test Coverage**: Increased from 72.38% to 80.31%
  - library-manager.js: 57.95% → 60.24% (41 tests)
  - comparison-view.js: 44.14% → 45.85% (61 tests)
  - render-controller.js: 62.85% → 64.21% (37 tests)
  - preset-manager.js: 66.44% → 70.37% (41 tests)
  - preview.js: 45.75% → 45.05% (54 tests)
  - Added 95 new unit tests (507 → 602 total)

- **Test Infrastructure**
  - Added comprehensive LibraryManager tests (autoEnable, getMountPaths, getStats)
  - Added ComparisonView event handling tests
  - Added RenderController memory monitoring tests
  - Added PresetManager listener and statistics tests
  - Added PreviewManager theme detection and LOD tests

### Technical

- Total tests: 602 unit + 42 E2E
- Test coverage: 80.31% statements, 74.85% branches, 82.42% functions
- Build time: 4.33s
- Bundle size: 67.44KB gzipped (main), 172.28KB gzipped (Three.js)

---

## [2.7.1] - 2026-01-16

### Fixed - Audit Gap Resolutions

- **Gap 2**: Validate command is now template-aware
  - Auto-detects React, Vue, Svelte, Angular, Preact projects
  - Uses template-specific file checks instead of hardcoded paths
  - Shows detected template in validation output
  
- **Gap 4**: Scaffold `--theme` option now fully functional
  - Generates theme CSS using selected preset
  - Automatically links theme CSS in index.html
  - Available themes: blue (default), purple, green, orange, slate, dark
  
- **Gap 7**: Sync auto-fix uses correct npm package names
  - Fixed `three.js` → `three` package name mapping
  - Uses stored `packageName` field instead of parsing message
  
- **Gap 8**: Scaffolded apps auto-load embedded models
  - Apps with embedded `param-schema` and `scad-source` tags now boot immediately
  - No upload required for scaffolded standalone apps
  - Graceful fallback to upload UI if embedded data is invalid
  
- **Gap 9**: Validate JSON output includes `passed` flag
  - JSON format now includes top-level `passed: boolean` for CI integration
  - Added `summary` object with schema/UI/test pass counts
  - Added `metadata` with timestamp and webapp path

### Added - New Example Models

- **Phone Stand**: Customizable stand with angle adjustment and charging cable support
- **Honeycomb Grid**: Parametric hexagonal grid pattern for organizers
- **Cable Organizer**: Desk cable management with multiple slot styles
- **Wall Hook**: Mountable hook with multiple curve styles and mounting options

### Technical

- Exported `THEME_PRESETS` and `generateThemeCSS` from theme.js for scaffold integration
- Added `loadEmbeddedModel()` function in main.js for scaffolded app initialization
- Template detection logic in validate.js supports all framework templates
- Total example models: 10 (4 new)

---

## [2.7.0] - 2026-01-16

### Added - Advanced Menu (P1 Features)

- **View SCAD Source**: Read-only view of uploaded OpenSCAD source code
  - Modal viewer with monospace font and line count
  - Copy to clipboard functionality
  - File statistics (lines, characters)
  
- **Override Parameter Limits**: Unlock toggle for numeric parameters
  - Allow values outside parsed min/max ranges
  - Visual indicators for unlocked parameters
  - Warning styling for out-of-range values
  - Limits automatically restored when toggle is disabled
  
- **Enhanced Reset Tools**: Multiple reset options
  - Reset All: Reset all parameters to defaults
  - Reset Group: Reset parameters in a specific group
  - Individual Reset: Per-parameter reset buttons (appear on hover)
  - Reset buttons show "modified" state when value differs from default
  
- **View Params JSON**: View current parameters as formatted JSON
  - Modal viewer with copy functionality
  - Useful for debugging and sharing configurations

### Technical

- New exports from `ui-generator.js`: `setLimitsUnlocked`, `getAllDefaults`, `resetParameter`
- Advanced Menu UI in collapsible `<details>` element
- ~400 lines of new CSS for Advanced Menu styling
- ~200 lines of new JavaScript for Advanced Menu functionality
- Full accessibility support (keyboard navigation, ARIA labels, focus management)
- High contrast mode support for all new components

## [2.4.0] - 2026-01-15

### Added - Testing Infrastructure & Performance

- **Unit Testing Suite**: Comprehensive Vitest-based unit tests for core modules
  - 119+ unit tests covering parser, state, presets, theme, and ZIP handling
  - 88.82% coverage on parser module, 70%+ on preset and theme managers
  - Test fixtures for OpenSCAD file validation
  - Mock-based testing for localStorage and DOM interactions
  
- **E2E Testing Framework**: Playwright integration for end-to-end testing
  - Basic workflow tests (upload → customize → download)
  - Accessibility compliance tests with axe-core
  - Keyboard navigation validation
  - Multi-browser testing (Chromium, Firefox, WebKit)
  
- **GitHub Actions CI**: Automated testing on every push and PR
  - Unit test execution with coverage reporting
  - E2E test execution with artifact upload
  - Build verification and bundle size monitoring
  - Markdown linting
  
- **Documentation**: Comprehensive testing and performance guides
  - TESTING.md - Complete guide for unit and E2E testing
  - PERFORMANCE.md - Performance optimization strategies and targets
  - Coverage targets and best practices
  - Troubleshooting and debugging tips

### Fixed

- **Theme Manager API**: Updated `addListener()` to return unsubscribe function for consistency with StateManager pattern

### Improved

- **State Management Tests**: Extended coverage for URL synchronization and localStorage persistence
- **Test Infrastructure**: Added setup files and fixtures for better test organization
- **CI/CD Pipeline**: Complete automated testing workflow for continuous quality assurance

### Technical

- Dependencies: @playwright/test, @axe-core/playwright, vitest, @vitest/ui, @vitest/coverage-v8
- Test count: 119 unit tests + 8 E2E tests
- Coverage: 21%+ overall, 80%+ on core modules
- New files: 10+ test files, 2 documentation files, 3 config files
- GitHub Actions: 4 workflow jobs (unit, E2E, build, lint)

## [2.3.0] - 2026-01-15

### Fixed - Audit & Polish Release

- **Debug Code Removal**: Removed debug fetch call from `auto-preview-controller.js`
- **Version Alignment**: Synchronized version strings across `main.js`, `sw.js`, and `package.json`

### Audited

- Core runtime modules reviewed for correctness: parser, preview, library-manager, render-queue, openscad-worker
- All modules verified clean with no correctness issues

### Technical
- No new features (polish release)
- Service Worker cache auto-invalidates with version bump
- See [docs/changelogs/CHANGELOG_v2.3.md](docs/changelogs/CHANGELOG_v2.3.md) for complete details

## [2.2.0] - 2026-01-15

### Added - Additional Templates & Enhanced Tooling

- **Vue 3 Template**: Full Vue Composition API template for scaffold command
- **Svelte Template**: Modern Svelte template with reactive programming
- **Enhanced Auto-Fix**: 15+ checks for dependencies, scripts, files, and code quality
- **Golden Fixtures**: Comprehensive fixture system for regression testing
- **Template Comparison**: 4 framework options (vanilla, React, Vue, Svelte)
- **Better CLI Reporting**: Enhanced error messages and diff output

### Technical
- Vue template (~13 files, 1,400 lines) with Composition API
- Svelte template (~13 files, 1,300 lines) with reactive paradigm
- Enhanced sync command (+100 lines) with 6 new checks
- Enhanced validate command (+150 lines) with golden fixtures
- Updated scaffold command to support Vue and Svelte
- Template dependencies: Vue 3.4+, Svelte 4.2+
- Total new code: ~2,800 lines
- See [docs/changelogs/CHANGELOG_v2.2.md](docs/changelogs/CHANGELOG_v2.2.md) for complete details

## [2.1.0] - 2026-01-15

### Added - Enhanced CLI

- **React Templates**: Full React template support for scaffold command with component architecture
- **Theme Generator**: Custom color theme generation with 6 presets (blue, purple, green, orange, slate, dark)
- **CI/CD Helpers**: Configuration generators for 6 platforms (GitHub, GitLab, Vercel, Netlify, Docker, Validation)
- **React Components**: Pre-built components (App, Header, ParametersPanel, PreviewPanel, ParameterControl)
- **Theme Presets**: Professional color palettes with accessibility support
- **CI/CD Templates**: Production-ready workflows and configurations

### Technical
- New `theme` command (~420 lines) with 6 presets and custom color support
- New `ci` command (~570 lines) with 6 provider templates
- React template (~10 files, 600+ lines)
- Updated scaffold command with `--template react` option
- Version bumped to 2.1.0
- Total new code: ~2,400 lines
- See [docs/changelogs/CHANGELOG_v2.1.md](docs/changelogs/CHANGELOG_v2.1.md) for complete details

## [2.0.0] - 2026-01-15

### Added - Developer Toolchain

- **CLI Interface**: `openscad-forge` command-line tool for automation
- **Extract Command**: Extract parameters from .scad files to JSON Schema
- **Scaffold Command**: Generate standalone web apps from schema + .scad file
- **Validate Command**: Test schema compliance and accessibility
- **Sync Command**: Auto-fix common project issues
- **NPM Package**: Global installation support via npm

### Technical
- New CLI entry point `bin/openscad-forge.js`
- 4 command modules (~1,265 lines total)
- Commander.js for command parsing
- Chalk for colorized output
- Dependencies: commander@^11.1.0, chalk@^5.3.0
- See [docs/changelogs/CHANGELOG_v2.0.md](docs/changelogs/CHANGELOG_v2.0.md) for complete details

## [1.10.0] - 2026-01-14

### Added - OpenSCAD Library Bundles
- **Library Support System**: Integration with popular OpenSCAD libraries (MCAD, BOSL2, NopSCADlib, dotSCAD)
- **Auto-Detection**: Parser automatically detects library usage from include/use statements
- **Library Manager UI**: Collapsible panel with checkboxes, icons, and badges
- **Auto-Enable**: Required libraries automatically enabled on file load
- **Virtual Filesystem**: Libraries mounted in OpenSCAD WASM worker
- **Setup Script**: `npm run setup-libraries` command to download all libraries
- **State Persistence**: Library selections saved to localStorage
- **Test Example**: Created library-test example demonstrating MCAD usage

### Fixed
- **URL Param Clamping**: Out-of-range URL parameters are clamped to schema limits to prevent invalid renders
- **Comparison Mode Libraries**: Variant renders now mount enabled libraries (fixes MCAD comparison errors)

### Technical
- New `library-manager.js` module (303 lines)
- New `setup-libraries.js` script (320 lines)
- Modified 7 core files for library integration
- Added 250+ lines of CSS for library UI
- Total: ~1,352 lines added
- See [docs/changelogs/CHANGELOG_v1.10.md](docs/changelogs/CHANGELOG_v1.10.md) for complete details

## [1.9.0] - 2026-01-14

### Added - Comparison View

Multi-variant comparison system for side-by-side parameter testing.

- **Multi-Variant Comparison**: Compare up to 4 parameter variants side-by-side
- **Independent 3D Previews**: Each variant has its own interactive preview
- **Batch Rendering**: Render all variants sequentially with progress tracking
- **Variant Management**: Add, rename, edit, and delete variants
- **Export/Import**: Share comparison sets as JSON files
- **State Tracking**: Visual indicators for pending, rendering, complete, error states
- **Responsive Layout**: Grid adapts from 4 → 2 → 1 columns based on screen size

### Technical
- New `ComparisonController` class (273 lines) for variant state management
- New `ComparisonView` class (557 lines) for UI rendering
- State integration with `comparisonMode` and `activeVariantId` properties
- Theme-aware styling (light/dark/high-contrast)
- WCAG 2.1 AA compliant accessibility
- Build time: 3.15s
- Bundle size: +14.4KB gzipped

See [docs/changelogs/CHANGELOG_v1.9.md](docs/changelogs/CHANGELOG_v1.9.md) for complete details.

## [1.8.0] - 2026-01-14

### Added - STL Measurements
- **Dimension Measurements**: Real-time bounding box visualization with X, Y, Z dimensions
- **Dimensions Panel**: Dedicated UI panel showing width, depth, height, and volume
- **Measurements Toggle**: "Show measurements" checkbox in preview settings
- **Visual Overlays**: Red wireframe bounding box with dimension lines and text labels
- **Theme-Aware Colors**: Measurement colors adapt to light/dark/high-contrast themes
- **Persistent Preference**: Saves measurement state to localStorage
- **High Contrast Support**: Thicker lines (3px) and larger text (48px) in HC mode

### Technical
- Enhanced `PreviewManager` with measurement methods (+250 lines)
- New dimension calculation and visualization system
- Canvas-based text sprites for dimension labels
- Three.js BoxHelper for bounding box visualization
- +4.2KB gzipped bundle size impact
- Build time: 3.55s

See [docs/changelogs/CHANGELOG_v1.8.md](docs/changelogs/CHANGELOG_v1.8.md) for complete details.

## [1.7.0] - 2026-01-13

### Added - Parameter Presets System
- **Save Presets**: Save current parameter configurations with names and descriptions
- **Load Presets**: Quick dropdown selector and management modal for instant loading
- **Manage Presets**: Comprehensive modal to view, load, export, and delete presets
- **Import/Export**: Share presets as JSON files (single or collection)
- **Smart Merging**: Duplicate preset names update existing presets
- **Persistence**: LocalStorage per-model preset storage
- **Accessibility**: Full keyboard navigation, ARIA labels, focus management
- **Responsive Design**: Mobile-optimized layout with stacked controls

### Technical
- New `PresetManager` class (374 lines) for CRUD operations
- 272 lines of CSS for preset UI components
- Integration with state management system
- Import validation with error handling
- +4.1KB gzipped bundle size impact
- Build time: 3.83s

See [docs/changelogs/CHANGELOG_v1.7.md](docs/changelogs/CHANGELOG_v1.7.md) for complete details.

## [1.6.0] - 2026-01-13

### Added - Multiple Output Formats
- Support for 5 output formats: STL, OBJ, OFF, AMF, 3MF
- Format selector dropdown in UI
- Format-specific file downloads with correct extensions
- Format-aware rendering in OpenSCAD worker
- Triangle counting for all mesh formats

### Technical
- Multi-format render logic in worker
- Format detection and conversion
- +0.73KB gzipped bundle size impact
- Build time: 2.39s

See [docs/changelogs/CHANGELOG_v1.6.md](docs/changelogs/CHANGELOG_v1.6.md) for complete details.

## [1.5.0] - 2026-01-13

### Added - High Contrast Mode
- Independent high contrast modifier (works with any theme)
- WCAG AAA (7:1) color contrast ratios
- Pure black/white color scheme
- 12-17% larger text sizes
- 2-3px thicker borders
- 4px focus rings
- Enhanced shadows and grid lines
- HC toggle button in header
- Persistent preferences via localStorage

### Technical
- Enhanced `ThemeManager` with high contrast support
- `PreviewManager` HC color palettes
- +0.89KB gzipped bundle size impact
- Build time: 2.53s

See [docs/changelogs/CHANGELOG_v1.5.md](docs/changelogs/CHANGELOG_v1.5.md) for complete details.

## [1.4.0] - 2026-01-13

### Added - Dark Mode
- Three-mode theme system: Auto, Light, Dark
- Theme toggle button in header (☀️/🌙 icons)
- System preference detection (`prefers-color-scheme`)
- Persistent theme preferences via localStorage
- Theme-aware 3D preview with adaptive colors
- 36 theme-aware CSS custom properties

### Technical
- New `ThemeManager` class (195 lines)
- Theme integration in `PreviewManager`
- +3KB (+0.8KB gzipped) bundle size impact
- Build time: 2.71s

See [docs/changelogs/CHANGELOG_v1.4.md](docs/changelogs/CHANGELOG_v1.4.md) for complete details.

## [1.3.0] - 2026-01-13

### Added - ZIP Upload & Multi-File Projects
- ZIP file upload and extraction (JSZip library)
- Automatic main file detection (5 strategies)
- Virtual filesystem mounting in OpenSCAD worker
- File tree visualization with main file badge
- Support for include/use statements
- Multi-file example project (Multi-File Box)
- 20MB ZIP file size limit
- Nested directory support

### Technical
- Virtual filesystem operations in worker
- `mountFiles()` and `clearMountedFiles()` functions
- Directory creation and file mounting
- ~500 lines of new code
- ~10KB bundle size impact (JSZip)
- Build time: 2.72s

See [docs/changelogs/CHANGELOG_v1.3.md](docs/changelogs/CHANGELOG_v1.3.md) for complete details.

## [1.2.0] - 2026-01-13

### Added - Auto-Preview & Progressive Enhancement
- Automatic preview rendering with 1.5s debounce
- Progressive quality rendering (preview $fn ≤ 24)
- Intelligent render caching (max 10 cache entries)
- Visual preview state indicators (6 states)
- Rendering overlay with spinner
- Smart download button logic
- Quality tiers: PREVIEW (fast) vs FULL (final)

### Technical
- New `AutoPreviewController` class (375 lines)
- Render caching by parameter hash with LRU eviction
- 5-10x faster parameter iteration
- Preview renders: 2-8s vs Full: 10-60s

See [docs/changelogs/CHANGELOG_v1.2.md](docs/changelogs/CHANGELOG_v1.2.md) for complete details.

## [1.1.0] - 2026-01-12

### Added - Enhanced Usability
- URL parameter persistence for sharing
- Keyboard shortcuts (Ctrl+Enter, R, D)
- Auto-save drafts with localStorage (2s debounce, 7-day expiration)
- Copy Share Link button with clipboard API
- Export Parameters as JSON button
- Simple Box example model
- Parametric Cylinder example model
- Welcome screen with 3 example buttons

### Technical
- URL serialization with non-default values only
- LocalStorage persistence with housekeeping
- Clipboard API with fallback

See [docs/changelogs/CHANGELOG_v1.1.md](docs/changelogs/CHANGELOG_v1.1.md) for complete details.

## [1.0.0] - 2026-01-12

### Added - MVP Release
- Drag-and-drop file upload with validation
- OpenSCAD Customizer parameter extraction
- Auto-generated parameter UI (sliders, dropdowns, toggles)
- Parameter grouping and collapsible sections
- Client-side STL generation (OpenSCAD WASM)
- 3D preview with Three.js
- Orbit controls (rotate, zoom, pan)
- Smart filename downloads (model-hash-date.stl)
- WCAG 2.1 AA accessibility compliance
- Full keyboard navigation
- Screen reader support
- Dark mode support (system preference)
- Universal Cuff example model

### Technical
- Vite build system
- Vanilla JavaScript (no framework)
- Web Worker for WASM isolation
- State management with pub/sub pattern
- CSS custom properties for theming
- Mobile-responsive design

See [docs/changelogs/CHANGELOG_v1.0.md](docs/changelogs/CHANGELOG_v1.0.md) for complete details (if exists).

## [0.2.0] - 2026-01-12

### Changed
- Major rescope: v1 changed from CLI tool to web application
- Original CLI scope moved to v2 (developer toolchain)

### Added
- Detailed user journey and UI specifications
- Phased implementation plan with deliverables
- Success metrics and acceptance criteria
- Reference implementation analysis
- Browser requirements and compatibility matrix
- Security considerations and threat model
- Performance optimization guidelines
- CSS architecture and design system

See [docs/BUILD_PLAN_NEW.md](docs/BUILD_PLAN_NEW.md) for complete details.

## [0.1.0] - 2026-01-11

### Added
- Initial build plan with CLI-focused approach
- Parameter schema specification
- Validation framework design

---

## Release Cadence

- **v1.0.0** (2026-01-12): Initial MVP release
- **v1.1.0 - v1.7.0** (2026-01-13): Rapid feature releases
- **v1.8.0 - v1.10.0** (2026-01-14): Advanced features
- **v2.0.0** (2026-01-15): Developer toolchain
- **v2.1.0** (2026-01-15): Enhanced CLI
- **v2.2.0** (2026-01-15): Additional templates
- **v2.3.0** (2026-01-15): Audit & polish release
- **v2.4.0+**: Future releases (planned)

## Version Scheme

We follow [Semantic Versioning](https://semver.org/):
- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backwards compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

## Links

- **Repository**: [GitHub](https://github.com/BrennenJohnston/openscad-web-customizer-forge)
- **Live Demo**: [Cloudflare Pages](https://openscad-web-customizer-forge.pages.dev/)
- **Documentation**: [docs/](docs/)
- **Version Changelogs**: [docs/changelogs/](docs/changelogs/)
- **License**: GPL-3.0-or-later

---

<p align="center">
  <strong>Built with ❤️ by the open-source community</strong>
</p>
