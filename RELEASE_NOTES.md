# Release Notes

## v4.3.0 (2026-03-20)

Architecture cleanup, security enforcement, and accessibility improvements. The main.js monolith has been decomposed, CSP is now enforced, all `alert()` calls replaced with accessible dialogs, and the toolbar uses a proper WAI-ARIA menubar.

### Highlights

- **main.js decomposition**: ~6,300 lines extracted into 5 focused modules (overlay/grid, saved projects, companion files, HFM/Alt View, file handler)
- **CSP enforced**: Content-Security-Policy active with `unsafe-inline` removed from `style-src`. CodeMirror 6 replaces dead Monaco code for CSP compatibility.
- **Accessible error dialogs**: All 56 `alert()` calls replaced with `showFriendlyError` — modal dialogs for critical errors, toast notifications for informational messages
- **WAI-ARIA menubar**: Toolbar menus migrated to `role="menubar"` with full arrow-key navigation
- **Welcome role-path cards**: 5 accessibility role-path cards re-enabled with updated content
- **Expert Mode mobile layout**: Responsive layout for viewports below 768px
- **CI stabilization**: Firefox and WebKit jobs pass reliably without `continue-on-error`
- **SVG sanitizer hardened**: Blocks `<foreignObject>`, external `<use>`, `data:` URIs, `<iframe>`/`<embed>`/`<object>`
- **Performance**: Three.js tree-shaking via granular imports, JSZip dynamic import, ~1,600 dead CSS rules removed

### Upgrade Notes

This is a backward-compatible upgrade with no breaking changes:

1. Clear browser cache for best experience
2. All existing saved projects remain compatible
3. Expert Mode now uses CodeMirror 6 (Monaco Editor was dead code and has been removed)

See [CHANGELOG.md](CHANGELOG.md) for the full list of changes.

---

## v4.2.0 (2026-03-16)

A big update focused on accessibility, security, and reliability. This brings the app up to WCAG 2.2 AA / Section 508 conformance.

### New Features

#### Expert Mode

Edit OpenSCAD code directly in the browser with full syntax highlighting and real-time preview.

- **Monaco Editor**: VS Code-style editing experience with OpenSCAD syntax support
- **Accessible Text Editor**: Native textarea fallback with full AT compatibility
- **Mode Switching**: Switch between Standard Mode (parameter UI) and Expert Mode (code editor) without losing state
- **State Preservation**: Cursor position, scroll, and selection preserved across mode switches
- **Keyboard Shortcut**: Press `Ctrl+E` to toggle Expert Mode

#### Vector Parameters

Full support for vector-type parameters commonly used in OpenSCAD designs.

- **Visual Editor**: Individual controls for each vector element (X, Y, Z, W)
- **Smart Parsing**: Literal vectors parsed for visual editing; expressions preserved in raw mode
- **Keyboard Navigation**: Tab between elements, arrow keys adjust values
- **Screen Reader Support**: Element position announced ("X coordinate, 1 of 3")

#### Memory Management

Intelligent memory monitoring with graceful degradation prevents crashes on complex models.

- **Real-time Monitoring**: Memory usage tracked and displayed
- **Warning System**: Progressive warnings at 400MB, 800MB, 1200MB thresholds
- **Automatic Degradation**: Auto-preview disabled at critical levels
- **Recovery Mode**: Safe restart with reduced resource usage
- **User Actions**: Reduce quality, disable auto-preview, export work, reload safely

### Security Enhancements

- **Content Security Policy**: Content Security Policy headers with comprehensive directives covering script-src, style-src, connect-src, frame-ancestors, and object-src (enforced in v4.3.0)
- **CSP Reporting**: Violation monitoring with privacy-preserving logging
- **Supply Chain Security**: SBOM generation, npm audit in CI, lockfile integrity checks
- **Security Documentation**: Administrator guide for deployment hardening

### Accessibility Improvements

- **WCAG 2.2 AA Target**: Tested with axe-core, manual audits, and AT validation
- **VPAT Document**: Section 508 conformance documentation with 59 criteria addressed
- **Screen Reader Testing**: Verified with NVDA, JAWS, and VoiceOver
- **Keyboard Navigation**: All features accessible without mouse
- **High Contrast Support**: Compatible with system high contrast modes

### Performance & Reliability

- **Bundle Budgets**: Enforced size limits in CI (231.8KB/500KB core bundle)
- **Visual Regression Tests**: Automated screenshot comparison
- **Cross-Browser CI**: Chrome, Edge, Firefox, and Safari testing
- **Performance Baselines**: Documented SLOs for cold start and render times

### Documentation

- **Getting Started Guide**: New user onboarding tutorial
- **Standard Mode Guide**: Complete parameter customization reference
- **Expert Mode Guide**: Code editing and OpenSCAD syntax reference
- **Troubleshooting Guide**: Common issues and solutions
- **Security Admin Guide**: Deployment and compliance reference
- **Browser Support Statement**: Officially supported browsers and versions
- **Known Issues**: Tracked limitations with workarounds

### Technical Details

- **Unit Tests**: 2093 tests passing (100%)
- **E2E Tests**: Cross-browser automation suite
- **Lighthouse Accessibility**: 96% score
- **Security Vulnerabilities**: 0 high/critical

---

## Upgrade Notes

### From v4.1.x

This is a backward-compatible upgrade with no breaking changes:

1. Clear browser cache for best experience
2. New features available immediately
3. Existing saved projects compatible

### Feature Flags

New features are controlled by feature flags:

| Flag | Default | Description |
|------|---------|-------------|
| `expert_mode` | enabled | Expert Mode code editing |
| `monaco_editor` | enabled | Monaco vs textarea default |
| `memory_monitoring` | enabled | Memory usage tracking |
| `vector_parameters` | enabled | Vector/array parameter inputs |
| `csp_reporting` | enabled | CSP violation logging to console |

---

## Known Issues

See [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) for current limitations and workarounds.

---

## Contributors

Thank you to everyone who contributed to this release through code, testing, documentation, and feedback.

---

## Previous Releases

### v4.1.0 - Stability Release

- Render queue management
- Improved error handling
- Preset system enhancements

### v4.0.0 - Initial Public Release

- Web-based OpenSCAD customizer
- Parameter extraction and UI generation
- 3D preview with Three.js
- STL export functionality
