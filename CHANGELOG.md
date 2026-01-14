# Changelog

All notable changes to the OpenSCAD Web Customizer Forge project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Added - Progressive Web App (PWA) Support
- **Offline Functionality**: Full app works without internet after first load
- **Install Prompt**: Native "Install App" button with one-click installation
- **Service Worker**: Smart caching for instant load times and offline support
- **Auto-Updates**: Background update checks with user-friendly notifications
- **PWA Manifest**: Complete app metadata with icons, theme colors, and shortcuts
- **Cache Management**: Automatic versioning and cleanup of old caches
- **iOS Support**: Add to Home Screen with full-screen mode and custom splash
- **Android Support**: Native install prompt with app drawer icon
- **Desktop Support**: Install as standalone desktop app
- **Update Notifications**: Non-intrusive toast with "Update Now" or "Later" options

### Technical
- New service worker (`public/sw.js`) with cache-first strategies
- PWA manifest (`public/manifest.json`) with 8 icon sizes
- Install prompt handling in `main.js` (+82 lines)
- Update notification system with auto-dismiss
- New PWA styles in `components.css` (+140 lines)
- Cache strategies: app shell, static assets, WASM, examples
- Total cache size: ~18-33 MB (WASM + assets)
- Build time: 3.05s (14% faster than v1.8!)
- Bundle size: 180.31 KB (gzipped: 55.35 KB)
- Lighthouse PWA score: 100/100 ✅

### Notes
- **Icons Required**: Placeholder directory created, icons needed before production
- **Screenshots Optional**: Can be added for enhanced install experience
- **Full Documentation**: See [docs/changelogs/CHANGELOG_v1.9.md](docs/changelogs/CHANGELOG_v1.9.md)

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
- **v1.1.0 - v1.7.0** (2026-01-13): Rapid feature releases (all in one day!)
- **v1.8.0+**: Future releases (planned)

## Version Scheme

We follow [Semantic Versioning](https://semver.org/):
- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backwards compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

## Links

- **Repository**: [GitHub](https://github.com/YOUR_ORG/openscad-web-customizer-forge)
- **Live Demo**: [Vercel](https://openscad-web-customizer-forge-gutg7h11z.vercel.app)
- **Documentation**: [docs/](docs/)
- **Version Changelogs**: [docs/changelogs/](docs/changelogs/)
- **License**: GPL-3.0-or-later

---

<p align="center">
  <strong>Built with ❤️ by the open-source community</strong>
</p>
