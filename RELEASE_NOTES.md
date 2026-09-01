# Release Notes

## v5.0.0 (2026-09-01)

The release where the workshop got big enough for everyone I built it for.
Since 4.5.0 the app grew three switchable interfaces - Simplified, Standard,
and a Classic layout that rebuilds desktop OpenSCAD in the browser - plus a
drawing lane that round-trips SVG and DXF, a Stencil Maker, one-link project
sharing with provenance records, braille editing refinements, and a long
accessibility pass driven by listening to a screen reader rather than
measuring one. The illustrated version of this story is
[docs/updates/WHATS_NEW_v5.md](docs/updates/WHATS_NEW_v5.md).

### Highlights

- **Three interfaces**: **Simplified** (the default - parameters, preview, one
  Generate button), **Standard** (adds the console, libraries, companion
  files, reference images and measurement), and **Classic** (the desktop
  OpenSCAD layout: menu bar, icon toolbar, axis viewport). Switch any time
  without losing work
- **A drawing lane**: open a drawing, clean it up, and save it back - as SVG
  or DXF - even with no 3D design involved; symbols keep their pictures, and
  opt-in folder write-back can land your edits where a desktop program is
  watching
- **Stencil Maker**: a shape or drawing becomes printable stencil plates with
  bridges, corner registration marks, and parameterized dimensions
- **One-link sharing**: the Publish dialog writes a `forge-manifest.json`,
  bundles the whole project as one ZIP, and composes a link that opens Forge
  pre-loaded - optionally with your current settings; every export carries a
  `forge-provenance.json` record of where the design came from
- **A contract for pipelines**: `docs/specs/FORGE_HANDOFF_CONTRACT.md` and
  `/forge-capabilities.txt` give tool builders one stable page to build
  against
- **Braille refinements**: a Unicode braille editor on the Card and Sign,
  auto-sizing cards, multi-charm printing, and downloads named after what
  they are
- **Heard, not just measured**: screen-reader fixes found by listening -
  descriptions that deliver their first sentence instead of an 80-word
  paragraph, an auto-preview that announces its completion instead of its
  progress, a drawing editor that reads correctly
- **Site facts in one page**: `docs/SITE_FACTS.md` states the Content
  Security Policy, data handling, connections, and supply-chain controls,
  every claim citing the file that proves it
- **Security**: three high-severity transitive advisories patched

### Upgrade Notes

The version number marks the scale of the change, not a compatibility break:

1. Clear browser cache (or accept the update prompt) for best experience
2. All existing saved projects and presets remain compatible
3. For contributors: the Pixi environment layer is gone - npm is the one
   toolchain (`npm ci`, `npm run dev`)

See [CHANGELOG.md](CHANGELOG.md) for the full list of changes.

---

## v4.5.0 (2026-07-12)

The Braille Card Customizer joins the welcome screen: type plain text and get 3D-printable braille, with translation running entirely on-device. This release also overhauls the SVG import pipeline, reworks the Alt View engine, restores the 3D preview on browsers without WebGL 2, and fixes non-watertight STL exports from the charm generators.

### Highlights

- **Braille Card Customizer**: A new tool family with three variants — **Braille Card** (prints leaning back at 75° with break-away supports), **Braille Charm** (pendants, keychain charms, and bracelet clips carrying 1–2 braille cells), and **Braille Sign** (two-part tactile sign with raised letters and Grade 2 braille, ADA section-703-style defaults)
- **On-device braille translation**: liblouis compiled to WebAssembly runs in a Web Worker — English UEB/US Grade 1 and Grade 2 tables, BANA-style word wrapping, multi-card overflow splitting, and a live preview with per-line cell counts; text never leaves the browser
- **Bracelet clip charm shape**: The Braille Charm defaults to a C-clip bracelet charm (q_charm lineage) that prints standing vertically so braille dots come out crisp with no support fin
- **SVG pipeline overhaul**: Transform baking, Unicode-safe encoding, role color-coding in the editor, compound-path mode, lossless pass-through for simple SVGs, and inherited style/fill resolution
- **Alt View rework**: Glyph atlas rendering, on-demand conversion (near-zero idle cost), a new Afterglow slider, and a simpler controller
- **WebGL 1 fallback restored**: The 3D preview works again in browsers without WebGL 2 (three.js pinned to ^0.162.0); an accessible notice appears if WebGL is entirely unavailable
- **Watertight charm STLs**: The Braille Charm and Charm Customizer border geometry is carved from one extrusion, so every shape/orientation/attachment combination exports a watertight single-body STL
- **Accessibility**: `aria-keyshortcuts` on shortcut-bearing controls, severity-tiered braille preview announcements, accessible names for emoji-swapped buttons, and a screen-reader announcement when Alt View unlocks

### Upgrade Notes

This is a backward-compatible upgrade with no breaking changes:

1. Clear browser cache (or accept the update prompt) for best experience
2. All existing saved projects and presets remain compatible
3. The braille tools are available from the welcome screen or via `?example=braille-wedge-card`, `?example=braille-charm`, and `?example=braille-sign`

See [CHANGELOG.md](CHANGELOG.md) for the full list of changes.

---

## v4.4.0 (2026-04-06)

SVG path offset, hardened companion file resolution, project-native presets, developer diagnostics, and an updated OpenSCAD WASM binary. This release also resolves the KI-012 parameter-dropout bug and hardens innerHTML patterns against XSS.

### Highlights

- **SVG path offset**: Inward/outward offset of SVG paths via clipper2-js integration in the preparation workspace
- **Companion file hardening**: Hierarchy fallback, brand filtering, and sibling disambiguation for robust multi-file project loading
- **Project-native presets**: Sidecar JSON presets separated from user-saved presets with numeric-aware sorting
- **KI-012 resolved**: Parameter dropout on re-render fixed via worker restart improvements
- **Developer diagnostics**: Console-only toggles for CSG bypass, desktop quality, geometry comparison (`window.__forgeDebug`)
- **WASM update**: OpenSCAD 2026.04.03 binary with `callMain --help` first-init fix
- **Security**: innerHTML XSS vectors in dialogs and file selection escaped; blocking `confirm()` replaced with accessible dialog

### Upgrade Notes

This is a backward-compatible upgrade with no breaking changes:

1. Clear browser cache for best experience
2. All existing saved projects and presets remain compatible
3. New features (`project_presets`, `svg_path_offset`) are behind feature flags — disabled by default

See [CHANGELOG.md](CHANGELOG.md) for the full list of changes.

---

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
