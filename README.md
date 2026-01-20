<p align="center">
  <img src="OpenSCAD Assistive Web Forge Logo.png" alt="OpenSCAD Assistive Web Forge Logo" width="200">
</p>

# OpenSCAD Web Customizer Forge

> **Customize parametric 3D models directly in your browser.** Upload a Customizer-enabled `.scad`, adjust parameters through an accessibility-first UI, preview the result, and download printable outputs — no installation, no account, no server.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![OpenSCAD](https://img.shields.io/badge/OpenSCAD-WASM-orange.svg)](https://openscad.org/)
[![Accessibility](https://img.shields.io/badge/WCAG-2.2%20AA-green.svg)](https://www.w3.org/WAI/WCAG22/quickref/)
[![Version](https://img.shields.io/badge/version-3.1.0-brightgreen.svg)](CHANGELOG.md)
[![PWA](https://img.shields.io/badge/PWA-enabled-blue.svg)](https://web.dev/progressive-web-apps/)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020.svg)](https://openscad-web-customizer-forge.pages.dev/)

## Mission: one of the most accessible SCAD interfaces

OpenSCAD is a powerful parametric CAD tool — but its workflows can be hard to access if you’re not comfortable with code, don’t use a mouse, rely on assistive tech, or benefit from high-contrast / reduced-motion UIs.

**This project’s intent is to be a Customizer-first, accessibility-first OpenSCAD interface**:

- **Keyboard-first**: everything works without a mouse, including camera controls for 3D preview
- **Screen-reader friendly**: semantic HTML + ARIA with dedicated announcement regions
- **WCAG 2.2 AA compliant**, with **High Contrast mode** designed to meet **WCAG AAA contrast targets**
- **Forced colors support**: Works with Windows High Contrast and OS-enforced color schemes
- **Reduced motion support** via `prefers-reduced-motion`
- **Touch targets** sized for real-world use (44×44px minimum)
- **Voice input compatible**: All controls have speakable labels
- **Privacy-first**: runs client-side; your models don’t get uploaded to a server

If you find an accessibility barrier, please report it. Accessibility issues are treated as bugs.

## Try it

- **Live demo (Cloudflare Pages)**: `https://openscad-web-customizer-forge.pages.dev/`
- **Install as app**: Use your browser's built-in install option (Chrome address bar ⊕ icon, iOS Share menu, etc.)
- **Run locally**:

```bash
git clone https://github.com/BrennenJohnston/openscad-web-customizer-forge.git
cd openscad-web-customizer-forge
npm install
npm run dev
```

Then open `http://localhost:5173`.

## What it does

1. Upload a `.scad` (or `.zip` for multi-file projects)
2. The app detects OpenSCAD Customizer parameters and generates a UI
3. Preview the model and export outputs (STL/OBJ/OFF/AMF/3MF)

## Features

- **100% client-side** OpenSCAD (WASM in a Web Worker)
- **Auto-generated parameter UI** (groups, sliders, selects, toggles, text inputs)
- **3D preview** (Three.js)
- **Shareable configurations** (URL params)
- **Presets** (save/load/import/export parameter sets)
- **ZIP multi-file support** with a virtual filesystem (`include` / `use`)
- **Library bundles & library manager** (auto-detection + user controls)
- **Offline-first**: works without internet after first visit, with automatic background updates
- **Themes**: light/dark/auto + high-contrast mode

For release-by-release detail, see [CHANGELOG.md](CHANGELOG.md).

## Supported inputs

### Customizer-enabled `.scad`

Your `.scad` should include **OpenSCAD Customizer annotations**, for example:

```scad
/*[Dimensions]*/
width = 50;       // [10:100]
height = 30;      // [10:80]
shape = "round";  // [round, square, hexagon]

/*[Options]*/
hollow = "yes";        // [yes, no]
wall_thickness = 2;    // [1:0.5:5]

/*[Hidden]*/
$fn = 100;
```

More detail:
- [Parameter Schema Spec](docs/specs/PARAMETER_SCHEMA_SPEC.md) (JSON Schema format used by the toolchain)

### `.zip` multi-file projects

Upload `.zip` files containing multiple `.scad` files with `include` / `use`:

```
my-project.zip
├── main.scad
├── utils/
│   └── helpers.scad
└── modules/
    └── parts.scad
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Generate output (render) |
| `R` | Reset parameters to defaults |
| `D` | Download output (when available) |
| `F` | Toggle focus mode (maximize preview) |
| `Left/Right Arrow` | Resize split panels (±5%, when gutter focused) |
| `Shift + Left/Right` | Resize split panels (±10%, when gutter focused) |
| `Home` | Minimize parameter panel (when gutter focused) |
| `End` | Maximize parameter panel (when gutter focused) |

## CLI (developer toolchain)

This repo includes `openscad-forge`, a CLI for extracting parameters and scaffolding standalone customizers.

```bash
# install globally from GitHub
npm install -g git+https://github.com/BrennenJohnston/openscad-web-customizer-forge.git

# or from a local clone
npm install -g .

openscad-forge --help
```

Key commands:

- `openscad-forge extract <file>`: extract Customizer params into JSON Schema (or YAML)
- `openscad-forge scaffold`: generate a deployable web app from a schema + `.scad`
- `openscad-forge validate <webapp>`: check schema/UI expectations (template-aware)
- `openscad-forge sync <webapp>`: apply safe consistency fixes

Scaffold templates currently supported by the implementation:

- `vanilla`, `react`, `vue`, `svelte`, `angular`, `preact`

## Development

### Prerequisites

- Node.js **18+**

### Common commands

```bash
npm run dev
npm run build
npm run preview

npm run lint
npm run format

npm run test
npm run test:run
npm run test:coverage

npm run test:e2e
```

### Asset setup (optional)

If you need to (re)download OpenSCAD WASM assets or set up bundled libraries:

```bash
npm run setup-wasm
npm run setup-libraries
```

### Windows note (Playwright)

On Windows, use the provided wrapper for E2E tests to avoid terminal hangs:
- See [Troubleshooting](docs/TROUBLESHOOTING.md#playwright-terminal-hangs-windows)

## Deployment

Cloudflare Pages is the primary hosting target:

- [Cloudflare Pages Deployment Guide](docs/guides/CLOUDFLARE_PAGES_DEPLOYMENT.md)

## Documentation

Start here:

- [Docs index](docs/README.md)
- [Build plan / architecture](docs/BUILD_PLAN_NEW.md)
- [Choosing Forge vs Playground](docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md)
- [Testing instructions](TESTING_INSTRUCTIONS.md)
- [Test report](TEST_REPORT.md)

### Accessibility Guides

- **[Accessibility Guide](docs/guides/ACCESSIBILITY_GUIDE.md)** - Comprehensive guide for users with disabilities, including screen reader users, low vision users, keyboard-only navigation, and voice input users
- **[AAC Keyguard Workflow Guide](docs/guides/KEYGUARD_WORKFLOW_GUIDE.md)** - Step-by-step instructions for clinicians and caregivers customizing assistive communication devices

Examples live in `public/examples/`.

## Project status

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current release status and roadmap.

## Contributing

Contributions are welcome — especially those that improve accessibility, usability, and documentation.

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Security

Please report security issues responsibly:

- [SECURITY.md](SECURITY.md)

## Support

- Issue tracker: https://github.com/BrennenJohnston/openscad-web-customizer-forge/issues
- Discussions: https://github.com/BrennenJohnston/openscad-web-customizer-forge/discussions (if enabled)

## Changelog

Release notes and version history live in:

- [CHANGELOG.md](CHANGELOG.md)
- `docs/changelogs/`

## License

- Project: **GPL-3.0-or-later** (see [LICENSE](LICENSE))
- Author: [Brennen Johnston](https://github.com/BrennenJohnston) (see [AUTHORS](AUTHORS))
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependencies and notices

## Acknowledgments

Built on:

- [OpenSCAD](https://openscad.org/) (GPL-2.0+)
- [openscad-wasm-prebuilt](https://www.npmjs.com/package/openscad-wasm-prebuilt)
- [Three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/)
- [JSZip](https://stuk.github.io/jszip/)
