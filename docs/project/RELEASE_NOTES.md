# Release Notes

## v5.1.1 (2026-09-23)

Shared project links open for the person who receives them. A first visit
previews the project instead of saying "Preview failed"; a link that fails
says why on the Main Page, with Try again; a direct link to an archive
follows Git LFS, waits for the welcome dialog, and reports an archive it
cannot open; the preset a link applies is named in the preset list. The
example branch an author copies is true again: its presets load, its
README walks through sharing your own design, and its keyguard example
opens an 8.9 MB bundle with no Git LFS limit. The memory warning banner no
longer takes keyboard focus while it is hidden.

## v5.1.0 (2026-09-21)

A photograph of a printed communication symbol converts into a charm now.
A camera picture is worked at the size the charm can print, smoothed and
floored, with two switches to turn each step off; Crop first opens the crop
view on the photograph before anything is converted; a trace over a
thousand shapes is refused before it is prepared, and Cancel lands inside
every stage; the editor reopens where it was left with Apply ready at once;
the offset thickens a drawn line on both sides and steps by 0.05 mm; Reset
puts the layers back and says so. The illustrated version is
[docs/updates/WHATS_NEW_v5.md](../updates/WHATS_NEW_v5.md), under "Version
5.1".

## v5.0.0 (2026-09-19)

Since 4.5.0 the app gained three switchable interfaces (Simplified, Standard,
and a Classic layout that reproduces desktop OpenSCAD in the browser), a
drawing lane that opens and saves SVG and DXF, one-link project sharing with
provenance records, a braille editor, and an accessibility pass made by
listening to a screen reader. The last work before release went over the
picture-to-charm editor, walked with my own logo five times. The illustrated
version is [docs/updates/WHATS_NEW_v5.md](../updates/WHATS_NEW_v5.md).

### Highlights

- **The picture-to-charm job**: a conversion runs in a dialog with its stages
  named and a Cancel at each; the wall behind a picture is left out by
  itself; every shape starts on layer 1, and three layers are always offered,
  each with its own height; shapes can be chosen together, and one switch
  sets them all; the drawing combines by itself after each change, and the
  Charm view renders a draft on request; every shape is measured against half
  a millimeter at the width the charm prints, with one press to set the
  too-thin ones to Off; **Crop** takes an edge off a picture and traces it
  again. Every word is American English, and every slider row meets the 44 px
  touch floor.
- **Layered designs on every charm shape**: the Bracelet Clip Charm, the
  Flat Pendant and the Logo Plate all build a drawing as up to three
  layers, each with its own height, raised or engraved. A plain drawing's
  own background starts Off, and the Flat Pendant's bail loop is a loop
  again.
- **A drawing by link**: `?drawing=<url>` on any link that opens a design
  fetches an SVG, DXF, PNG or JPG, converts it without a press, and opens
  the drawing editor on it, so a tool that makes drawings can send one
  straight to a person.
- **Three interfaces**: **Simplified** (parameters, preview, one Generate
  button), **Standard** (adds the console, libraries, companion files,
  reference images and measurement), and **Classic** (the desktop OpenSCAD
  layout). Switch any time without losing work.
- **A drawing lane**: open a drawing, clean it up, and save it back as SVG or
  DXF, with no 3D design involved. Symbols keep their pictures. Opt-in folder
  write-back saves your edits where a desktop program is watching.
- **One-link sharing**: the Publish dialog writes a `forge-manifest.json`,
  bundles the project as one ZIP, and composes a link that opens Forge
  pre-loaded, with your settings if you choose. Every export carries a
  `forge-provenance.json` record of where the design came from.
- **A contract for pipelines**: `docs/specs/FORGE_HANDOFF_CONTRACT.md` and
  `/forge-capabilities.txt` give tool builders one stable page to build
  against.
- **Braille**: a Unicode braille editor on the Card and Sign, auto-sizing
  cards, several charms in one print, and downloads named after their
  content.
- **Screen reader fixes found by listening**: descriptions deliver their
  first sentence instead of an 80-word paragraph, the auto-preview announces
  its completion instead of its progress, and the drawing editor reads
  correctly.
- **Site facts in one page**: `docs/deploying/SITE_FACTS.md` states the Content
  Security Policy, data handling, connections and supply-chain controls, each
  claim citing the file that proves it.
- **Security**: three high-severity transitive advisories patched.

### The picture-to-charm editor

- **A conversion you start, watch and can stop**: tracing runs on a worker
  thread with a progress bar and a Cancel that stops it. One sentence says
  what the picture appears to be and roughly what it will cost before
  anything starts. A small, simple picture starts by itself, through the same
  bar and Cancel.
- **Faster, and no freeze**: one step did nineteen seconds of work on the
  main thread where 637 milliseconds were needed. A conversion went from
  about nineteen seconds to about one and a half, an eight megapixel
  photograph from 5,413 ms to 1,207 ms, and combining a complicated drawing
  moved off the main thread with its own bar and Cancel.
- **A second tracing engine**: Potrace, compiled to WebAssembly from a pinned
  tarball and committed with its recipe and checksums, is the default for
  Line art and Solid shape. Magnified, the old engine returned a stroke made
  of straight segments and a round dot as a ten-sided polygon; Potrace
  returns a curve and a circle, which is what a finger runs along. It is
  faster, and it costs more mesh: 54 % more facets on one measured icon.
- **An editor that shows the drawing**: the drawing fills the editor as one
  picture, the side panel no longer covers it, and a Drawing / Charm switch
  shows the charm it will become. While you edit, previews are drawn at draft
  quality and return to full on close.
- **A shapes panel you can read**: one row per shape with its name, an On /
  Cut out / Off switch, and More. The row says when it has run out of room
  instead of cutting the name short. Hover marks a row, a press chooses it,
  and two fingers pinch and pan while one finger scrolls the page.
- **One vocabulary**: the panel, the rows, the color key and the screen
  reader use the same words.
- **Credit lines left out**: a downloaded icon usually carries its
  attribution in the picture, and converting it produced the icon plus fifty
  letters of caption. The caption is recognized and left out, with an Undo
  beside the sentence that says so. The attribution you owe the designer is
  unchanged.

### Upgrade Notes

The version number marks the scale of the change, not a compatibility break:

1. Clear the browser cache, or accept the update prompt.
2. Existing saved projects and presets remain compatible.
3. For contributors: the Pixi environment layer is gone. npm is the one
   toolchain (`npm ci`, `npm run dev`).
4. The About dialog carries a build stamp beside the version, and the same
   string appears in `/forge-capabilities.txt`. Quote it in a bug report so
   two builds of one version can be told apart.

See [CHANGELOG.md](../../CHANGELOG.md) for the full list of changes.

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

See [CHANGELOG.md](../../CHANGELOG.md) for the full list of changes.

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

See [CHANGELOG.md](../../CHANGELOG.md) for the full list of changes.

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

See [CHANGELOG.md](../../CHANGELOG.md) for the full list of changes.

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

See [KNOWN_ISSUES.md](../accessibility/KNOWN_ISSUES.md) for current limitations and workarounds.

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
