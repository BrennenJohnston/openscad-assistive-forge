# OpenSCAD Web Customizer Forge

> **Customize parametric 3D models directly in your browser.** Upload any OpenSCAD Customizer-enabled `.scad` file, adjust parameters through an accessible UI, and download STL files—all without installing software or creating an account.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![OpenSCAD](https://img.shields.io/badge/OpenSCAD-WASM-orange.svg)](https://openscad.org/)
[![Accessibility](https://img.shields.io/badge/WCAG-2.1%20AA-green.svg)](https://www.w3.org/WAI/WCAG21/quickref/)
[![Version](https://img.shields.io/badge/version-2.10.1-brightgreen.svg)](CHANGELOG.md)
[![PWA](https://img.shields.io/badge/PWA-enabled-blue.svg)](https://web.dev/progressive-web-apps/)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020.svg)](https://openscad-web-customizer-forge.pages.dev/)

## 🎯 What This Does

**Think**: classic "web parametric customizer" UX, but:
- ✅ **100% client-side** — Runs entirely in your browser (no server costs)
- ✅ **No installation** — Just upload and customize
- ✅ **No account needed** — Start using immediately
- ✅ **Accessible** — WCAG 2.1 AA compliant, fully keyboard navigable
- ✅ **Dark mode** 🌗 — Comfortable viewing in any lighting
- ✅ **High contrast** ♿ — WCAG AAA (7:1) for low vision users
- ✅ **PWA enabled** 📲 — Install as app, works offline
- ✅ **Open source** — GPL-3.0-or-later

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOW IT WORKS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. UPLOAD         2. CUSTOMIZE           3. DOWNLOAD                       │
│                                                                              │
│   📁 Drop your      🎛️  Adjust sliders,    📥 Get your STL                   │
│   .scad file        dropdowns, toggles     ready for 3D printing             │
│                     for each parameter                                       │
│                                                                              │
│   Parameters are    Real-time 3D preview   Share via URL                     │
│   auto-detected     shows your changes     with customizations               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Try It Now

**[🔗 Live Demo](https://openscad-web-customizer-forge.pages.dev/)** — Hosted on Cloudflare Pages

Or run locally:

```bash
git clone https://github.com/YOUR_ORG/openscad-web-customizer-forge.git
cd openscad-web-customizer-forge
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## ✨ Features

### Current Release: v2.10.0 — Enhanced Accessibility & Layout ♿

A major accessibility and usability release with advanced layout features:

|| Feature | Description |
||---------|-------------|
|| 🎛️ **Collapsible Panels** | Desktop parameter panel collapse/expand with smooth animations |
|| ↔️ **Resizable Layout** | Drag-to-resize split panels with keyboard support |
|| 🎯 **Focus Mode** | Maximize preview area with keyboard shortcut (F) |
|| ♿ **Enhanced A11y** | Comprehensive ARIA attributes and focus management |
|| 📱 **Responsive Design** | Desktop features auto-disable on mobile viewports |
|| ⌨️ **Keyboard Navigation** | Full keyboard control with arrow keys and shortcuts |

### Previous Release: v2.9.0 — WASM Progress & Mobile Enhancements 📱

|| Feature | Description |
||---------|-------------|
|| ⏳ **WASM Progress UI** | Full-screen progress indicator during WASM initialization |
|| 📱 **Mobile Testing** | Comprehensive E2E tests for mobile viewports |
|| 📦 **Bundle Optimization** | Code splitting and lazy loading (67KB main bundle) |
|| 💾 **Memory Warnings** | Enhanced user notifications for high memory usage |

### Previous Release: v2.3.0 — Audit & Polish 🔧

|| Feature | Description |
||---------|-------------|
|| 🔍 **Codebase Audit** | Comprehensive review of all core runtime modules |
|| 🧹 **Debug Code Removal** | Removed debug fetch calls from production code |
|| 🔢 **Version Alignment** | Synchronized version strings across all files |

### Previous Release: v2.2.0 — Additional Templates & Enhanced Tooling 🚀

Adds Vue and Svelte templates, plus enhanced CLI capabilities:

|| Feature | Description |
||---------|-------------|
|| 🎭 **Vue 3 Template** | Generate Vue Composition API customizers with `--template vue` |
|| ⚡ **Svelte Template** | Generate Svelte customizers with `--template svelte` |
|| 🔧 **Enhanced Auto-Fix** | 15+ checks for dependencies, scripts, and code quality |
|| 🧪 **Golden Fixtures** | Regression testing with parameter comparison |
|| 🏗️ **4 Templates** | Choose from vanilla, React, Vue, or Svelte |
|| 📊 **Better Reporting** | Enhanced diff output and error messages |

### Previous Release: v2.1.0 — Enhanced CLI 🚀

|| Feature | Description |
||---------|-------------|
|| ⚛️ **React Templates** | Generate React-based customizers with `--template react` |
|| 🎨 **Theme Generator** | Create custom color themes (5 presets + custom colors) |
|| 🔧 **CI/CD Helpers** | Pre-configured workflows for GitHub, GitLab, Vercel, Netlify, Docker |

### Previous Release: v1.10.0 — Library Bundles 📚

|| Feature | Description |
||---------|-------------|
|| 📚 **Library Bundles** | MCAD, BOSL2, NopSCADlib, dotSCAD |
|| 🔍 **Auto-Detection** | include/use statements auto-enable required libs |
|| 🧰 **Library Manager UI** | Toggle libraries with badges and help |
|| 🔗 **URL Param Clamping** | Out-of-range URL params are clamped to schema limits |
|| ✅ **Stability** | Prevents invalid URL params from triggering CGAL failures |

### Previous Release: v1.9.0 — Progressive Web App 📲

|| Feature | Description |
||---------|-------------|
|| 📲 **Installable** | Add to home screen on mobile and desktop |
|| 🔌 **Offline Support** | Full functionality without internet |
|| ⚡ **Instant Loading** | Cached assets for faster startup |
|| 🔄 **Auto-Updates** | Seamless version updates with notifications |
|| 📱 **Native Experience** | Full-screen mode, app icon, splash screen |
|| 💾 **Smart Caching** | WASM engine cached for offline rendering |

### Previous Release: v1.8.0 — STL Measurements 📏

|| Feature | Description |
||---------|-------------|
|| 📏 **Dimension Display** | Shows width, depth, height, and volume |
|| 📦 **Bounding Box** | Visual wireframe showing model extents |
|| 🏷️ **Dimension Labels** | Floating text labels on 3D preview |

### Complete Feature Set

#### v1.0 — Core Web Application ✅

|| Feature | Status |
||---------|--------|
|| 📁 Drag-and-drop file upload | ✅ Complete |
|| 🎛️ Auto-generated parameter UI | ✅ Complete |
|| ⚙️ Client-side STL generation (WASM) | ✅ Complete |
|| 👁️ 3D preview (Three.js) | ✅ Complete |
|| 📥 Smart filename downloads | ✅ Complete |
|| ♿ WCAG 2.1 AA accessibility | ✅ Complete |

#### v1.1 — Enhanced Usability ✅

|| Feature | Status |
||---------|--------|
|| 🔗 Shareable URL parameters | ✅ Complete |
|| 💾 Browser localStorage persistence | ✅ Complete |
|| ⌨️ Keyboard shortcuts (Ctrl+Enter, R, D) | ✅ Complete |
|| 📋 Copy Share Link button | ✅ Complete |
|| 💾 Export parameters as JSON | ✅ Complete |
|| 📚 3 example models | ✅ Complete |

#### v1.2 — Auto-Preview System ✅

|| Feature | Status |
||---------|--------|
|| 🔄 Auto-preview on parameter change | ✅ Complete |
|| ⚡ Progressive quality rendering | ✅ Complete |
|| 💾 Intelligent render caching | ✅ Complete |
|| 🎯 Visual state indicators | ✅ Complete |
|| 🎨 Smart download button logic | ✅ Complete |

#### v1.3 — Multi-File Projects ✅

|| Feature | Status |
||---------|--------|
|| 📦 ZIP upload support | ✅ Complete |
|| 📂 Virtual filesystem for include/use | ✅ Complete |
|| 🔍 Automatic main file detection | ✅ Complete |
|| 🌳 File tree visualization | ✅ Complete |

#### v1.4 — Dark Mode ✅

|| Feature | Status |
||---------|--------|
|| 🌗 Dark mode with theme toggle | ✅ Complete |
|| 🎨 Three-mode system (Auto/Light/Dark) | ✅ Complete |
|| 💾 Persistent theme preferences | ✅ Complete |
|| 🎨 Theme-aware 3D preview | ✅ Complete |

#### v1.5 — High Contrast Mode ✅

|| Feature | Status |
||---------|--------|
|| ♿ High contrast mode (WCAG AAA 7:1) | ✅ Complete |
|| 📐 Enhanced typography (12-17% larger) | ✅ Complete |
|| 🔲 Thicker borders and focus rings | ✅ Complete |
|| 🎨 Works with any theme | ✅ Complete |

#### v1.6 — Multiple Output Formats ✅

|| Feature | Status |
||---------|--------|
|| 📐 Multiple formats (STL, OBJ, OFF, AMF, 3MF) | ✅ Complete |
|| 🎛️ Format selector UI | ✅ Complete |
|| 📥 Format-specific downloads | ✅ Complete |

#### v1.7 — Parameter Presets ✅

|| Feature | Status |
||---------|--------|
|| 💾 Save/load parameter configurations | ✅ Complete |
|| 📋 Management modal | ✅ Complete |
|| 📤 Import/Export as JSON | ✅ Complete |
|| 💿 LocalStorage persistence | ✅ Complete |

#### v1.8 — STL Measurements ✅

|| Feature | Status |
||---------|--------|
|| 📏 Real-time dimension display | ✅ Complete |
|| 📦 Bounding box visualization | ✅ Complete |
|| 🏷️ Dimension labels on 3D model | ✅ Complete |
|| 🎨 Theme-aware measurement colors | ✅ Complete |
|| 💾 Persistent measurement toggle | ✅ Complete |

#### v1.9 — Progressive Web App ✅

|| Feature | Status |
||---------|--------|
|| 📲 Install as native app | ✅ Complete |
|| 🔌 Full offline support | ✅ Complete |
|| ⚡ Service worker caching | ✅ Complete |
|| 🔄 Auto-update notifications | ✅ Complete |
|| 🌍 iOS/Android/Desktop support | ✅ Complete |
|| 💾 PWA manifest & icons | ✅ Complete |

#### v2.0 — Developer Toolchain ✅

|| Feature | Status |
||---------|--------|
|| 🛠️ CLI parameter extraction | ✅ Complete |
|| 📦 Standalone app scaffolding | ✅ Complete |
|| ✅ Validation harness | ✅ Complete |
|| 🔄 Auto-sync & fixes | ✅ Complete |

#### v2.1 — Enhanced CLI ✅

|| Feature | Status |
||---------|--------|
|| ⚛️ React template support | ✅ Complete |
|| 🎨 Custom theme generator | ✅ Complete |
|| 🔄 CI/CD integration helpers | ✅ Complete |
|| 📦 GitHub Actions workflows | ✅ Complete |
|| 🐳 Docker containerization | ✅ Complete |
|| 🧪 Golden fixture testing | ✅ Complete |

### Coming Soon

#### v2.4 (Planned) — Performance & Testing
- Enhanced testing infrastructure (unit tests, E2E tests)
- Performance optimization (bundle size, WASM loading)
- Font bundling for `text()` function support
- Documentation improvements

### Embedding & Integration

This tool is designed to be **embedded** in existing platforms, not to become a social platform itself.

| Use Case | How To |
|----------|--------|
| 🔗 **Embed in your website** | Use iframe or scaffold a dedicated app |
| 📦 **Create dedicated customizers** | `openscad-forge scaffold` for standalone apps |
| 🌐 **Share configurations** | URL parameters already encode settings |

See [BUILD_PLAN_NEW.md](docs/BUILD_PLAN_NEW.md#future-direction-embeddable-tool) for embedding details.

## 📋 Supported File Formats

### Single .scad Files

Your `.scad` file should include **OpenSCAD Customizer annotations**:

```scad
/*[Dimensions]*/
width = 50;       // [10:100]
height = 30;      // [10:80]
shape = "round";  // [round, square, hexagon]

/*[Options]*/
hollow = "yes";   // [yes, no]
wall_thickness = 2; // [1:0.5:5]

/*[Hidden]*/
$fn = 100;
```

**Supported annotation types:**

|| Annotation | Example | UI Control |
||------------|---------|------------|
|| `/*[Group Name]*/` | `/*[Dimensions]*/` | Collapsible section |
|| `// [min:max]` | `// [10:100]` | Range slider |
|| `// [min:step:max]` | `// [1:0.5:5]` | Step slider |
|| `// [opt1, opt2]` | `// [round, square]` | Dropdown |
|| `// [yes, no]` | `// [yes, no]` | Toggle switch |
|| `// Comment` | `// Wall thickness` | Help tooltip |
|| `/*[Hidden]*/` | Internal params | Not shown in UI |

### ZIP Files (Multi-File Projects)

Upload `.zip` files containing multiple `.scad` files with `include` and `use` statements:

```
my-project.zip
├── main.scad          # Main file with Customizer parameters
├── utils/
│   └── helpers.scad   # Helper functions
└── modules/
    └── parts.scad     # Reusable modules
```

## 🛠️ CLI Tools (v2.0+)

### Installation

Install globally via npm:

```bash
npm install -g openscad-web-customizer-forge
```

Or use directly with npx:

```bash
npx openscad-web-customizer-forge --help
```

### Commands

#### Extract Parameters

Extract Customizer parameters from a `.scad` file to JSON Schema:

```bash
openscad-forge extract model.scad --out params.schema.json --pretty
```

**Options:**
- `-o, --out <path>` — Output file path (default: `params.schema.json`)
- `-f, --format <format>` — Output format: `json` or `yaml` (default: `json`)
- `--pretty` — Pretty-print JSON output

#### Scaffold Web App

Generate a standalone web app from a schema and `.scad` file:

```bash
openscad-forge scaffold \
  --schema params.schema.json \
  --scad model.scad \
  --out ./my-customizer \
  --title "My Customizer"
```

**Options:**
- `-s, --schema <path>` — Parameter schema JSON file (required)
- `--scad <path>` — OpenSCAD source file (required)
- `-o, --out <path>` — Output directory (default: `./webapp`)
- `--template <name>` — Template: `vanilla` or `react` (default: `vanilla`)
- `--title <title>` — App title (uses schema title if not specified)
- `--theme <theme>` — Theme preset: `default`, `dark`, or `custom`

#### Validate Project

Validate a web app for schema compliance and accessibility:

```bash
openscad-forge validate ./my-customizer --cases tests.json
```

**Options:**
- `--cases <path>` — Test cases JSON file
- `--ref <ref>` — Reference implementation: `docker-openscad` or `wasm` (default: `wasm`)
- `--tolerance <n>` — STL comparison tolerance (default: `0.001`)
- `--format <format>` — Output format: `text`, `json`, or `junit` (default: `text`)

#### Sync & Auto-Fix

Detect and apply safe fixes to a web app:

```bash
openscad-forge sync ./my-customizer --apply-safe-fixes
```

**Options:**
- `--dry-run` — Show what would be fixed without applying
- `--apply-safe-fixes` — Apply only safe, auto-fixable changes
- `--force` — Apply all fixes (may be breaking)

#### Generate Custom Themes

Create custom color themes for your web app:

```bash
# Use a preset theme
openscad-forge theme --preset purple --out theme.css

# Create a custom theme
openscad-forge theme --custom --primary "#9333ea" --out theme.css

# List available presets
openscad-forge theme --list
```

**Options:**
- `-o, --out <path>` — Output CSS file path
- `--preset <name>` — Use a theme preset: `blue`, `purple`, `green`, `orange`, `slate`, `dark`
- `--custom` — Generate custom theme from colors
- `--primary <color>` — Primary color (hex)
- `--secondary <color>` — Secondary color (hex)
- `--background <color>` — Background color (hex)
- `--list` — List available theme presets
- `--force` — Overwrite existing file

#### Generate CI/CD Configurations

Create CI/CD configuration files for various platforms:

```bash
# Generate GitHub Actions workflow
openscad-forge ci --provider github

# Generate Docker configuration
openscad-forge ci --provider docker

# List available providers
openscad-forge ci --list
```

**Options:**
- `--provider <name>` — CI/CD provider: `cloudflare`, `github`, `gitlab`, `vercel`, `netlify`, `docker`, `validation`
- `-o, --out <path>` — Output directory (default: current directory)
- `--list` — List available providers

**Available Providers:**
- `cloudflare` — Cloudflare Pages deployment (recommended, unlimited bandwidth)
- `github` — GitHub Actions workflow with testing and deployment
- `gitlab` — GitLab CI/CD pipeline
- `vercel` — Vercel deployment configuration (legacy)
- `netlify` — Netlify deployment configuration
- `docker` — Docker containerization (Dockerfile, nginx.conf, docker-compose.yml)
- `validation` — Golden fixtures and automated testing

### Example Workflow

```bash
# 1. Extract parameters from your OpenSCAD model
openscad-forge extract box.scad --out box-schema.json --pretty

# 2. Generate a standalone web app (React version)
openscad-forge scaffold \
  --schema box-schema.json \
  --scad box.scad \
  --out box-customizer \
  --template react \
  --title "Box Customizer"

# 3. Generate a custom theme
openscad-forge theme --preset purple --out box-customizer/src/styles/theme.css

# 4. Add CI/CD configuration
openscad-forge ci --provider github --out box-customizer

# 5. Build and deploy
cd box-customizer
npm install
npm run build

# 6. Validate the app
openscad-forge validate ./box-customizer

# 7. Fix any issues
openscad-forge sync ./box-customizer --apply-safe-fixes
```

## ⌨️ Keyboard Shortcuts

|| Shortcut | Action |
||----------|--------|
|| `Ctrl/Cmd + Enter` | Generate STL |
|| `R` | Reset parameters to defaults |
|| `D` | Download STL (when available) |
|| `F` | Toggle focus mode (maximize preview) |
|| `Left/Right Arrow` | Resize split panels (±5%, when gutter focused) |
|| `Shift + Left/Right` | Resize split panels (±10%, when gutter focused) |
|| `Home` | Minimize parameter panel (when gutter focused) |
|| `End` | Maximize parameter panel (when gutter focused) |

## 🚀 Deployment

### Recommended: Cloudflare Pages

Cloudflare Pages is the **primary hosting platform** for OpenSCAD Web Customizer Forge. It provides:

- ✅ **Unlimited bandwidth** (ideal for WASM apps with ~15-30 MB downloads)
- ✅ **Global CDN** for fast delivery worldwide
- ✅ **Custom headers support** via `_headers` file (required for WASM)
- ✅ **Automatic deployments** from Git
- ✅ **Free tier** with 500 build minutes/month

**Quick Deploy**:

```bash
# Method 1: Wrangler CLI
npm install -g wrangler
wrangler login
npm run build
wrangler pages deploy dist --project-name=your-project-name

# Method 2: Git Integration (Recommended)
# Connect your GitHub repo in Cloudflare Dashboard
# Automatic deployments on every push
```

**Configuration**: Pre-configured with COOP/COEP headers in `public/_headers` and SPA routing in `public/_redirects`.

📖 **[Complete Deployment Guide →](docs/guides/CLOUDFLARE_PAGES_DEPLOYMENT.md)**

### Alternative Platforms

| Platform | Bandwidth (Free) | Headers Support | Status |
|----------|------------------|-----------------|--------|
| **Cloudflare Pages** | **Unlimited** | ✅ `_headers` file | **Primary** |
| Vercel | 100 GB/month | ✅ `vercel.json` | Legacy fallback |
| Netlify | 100 GB/month | ✅ `netlify.toml` | Compatible |
| GitHub Pages | Unlimited | ❌ No custom headers | Not recommended* |

*GitHub Pages doesn't support custom HTTP headers, which limits future WASM threading capabilities.

**Technical Note**: The current build (`openscad-wasm-prebuilt@1.2.0`) is non-threaded and technically works without COOP/COEP headers. However, headers are configured for future-proofing and best practices. See [WASM Threading Analysis](docs/research/WASM_THREADING_ANALYSIS.md) for details.

### Additional Resources

- 🔍 [WASM Threading Analysis](docs/research/WASM_THREADING_ANALYSIS.md) — Technical analysis of SharedArrayBuffer requirements
- 🔬 [Comparable Projects Research](docs/research/COMPARABLE_PROJECTS.md) — How similar projects handle hosting
- ✅ [Cloudflare Configuration Validation](docs/research/CLOUDFLARE_VALIDATION.md) — Verified setup documentation
- 🔄 [Vercel Legacy Configuration](docs/guides/VERCEL_LEGACY_CONFIG.md) — Rollback option

## 📖 Documentation

### Deployment & Hosting

- [Cloudflare Pages Deployment](docs/guides/CLOUDFLARE_PAGES_DEPLOYMENT.md) — **Primary hosting guide** (recommended)
- [Vercel Deployment](docs/guides/DEPLOYMENT_GUIDE.md) — Alternative hosting (legacy)
- [Vercel Legacy Configuration](docs/guides/VERCEL_LEGACY_CONFIG.md) — Rollback instructions

### Technical Research

- [WASM Threading Analysis](docs/research/WASM_THREADING_ANALYSIS.md) — SharedArrayBuffer requirements analysis
- [Comparable Projects Research](docs/research/COMPARABLE_PROJECTS.md) — Industry patterns and validation
- [Cloudflare Configuration Validation](docs/research/CLOUDFLARE_VALIDATION.md) — Production-ready verification

### Development & Architecture

- [Build Plan](docs/BUILD_PLAN_NEW.md) — Development roadmap and architecture
- [Choosing Forge vs Playground](docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md) — Which tool to use and why
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and solutions
- [Parameter Schema Spec](docs/specs/PARAMETER_SCHEMA_SPEC.md) — JSON Schema format
- [Test Report](TEST_REPORT.md) — Comprehensive testing results
- [Examples](examples/) — Sample OpenSCAD projects
- [Changelogs](docs/changelogs/) — Version-specific release notes
- [Guides](docs/guides/) — Testing and deployment guides

## 🏗️ Architecture

```
Browser
├── Main Thread
│   ├── File Upload Handler
│   ├── Parameter UI (auto-generated)
│   ├── 3D Preview (Three.js)
│   ├── State Manager (pub/sub)
│   ├── Theme Manager
│   ├── Preset Manager
│   └── Download Manager
│
└── Web Worker (isolated)
    └── OpenSCAD WASM Runtime
        ├── Parameter Parser
        ├── Virtual Filesystem
        └── STL Export Engine
```

**Key architectural decisions:**
- **Client-side only** — No backend server required
- **Web Worker isolation** — WASM runs in worker to keep UI responsive
- **Lazy loading** — WASM bundle loads on demand
- **Vanilla JS** — No framework dependencies, accessibility-first
- **NPM package** — Uses `openscad-wasm-prebuilt` for easy setup

## 🧪 Testing

The application has been comprehensively tested:

- ✅ **47 parameters** extracted from universal cuff example
- ✅ **10 parameter groups** correctly identified
- ✅ **STL generation** working (13-44s render time)
- ✅ **3D preview** with orbit controls
- ✅ **Full keyboard navigation**
- ✅ **WCAG 2.1 AA** accessibility compliance
- ✅ **Cross-browser** tested (Chrome, Firefox, Safari, Edge)

### Running Tests

```bash
# Unit tests
npm run test              # Watch mode
npm run test:run          # Run once
npm run test:coverage     # With coverage

# E2E tests (with anti-hang protection)
npm run test:e2e          # Headless mode (recommended)
npm run test:e2e:headed   # Headed mode
npm run test:e2e:report   # View report

# All tests
npm run test:all
```

**Note for Windows users**: E2E tests use a failsafe wrapper to prevent terminal hangs. If your terminal freezes, press `Ctrl+C` to abort. See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#playwright-terminal-hangs-windows) for details.

See [TEST_REPORT.md](TEST_REPORT.md) for detailed results.

## 📊 Project Status

**Current Version**: v2.10.0

|| Phase | Description | Status |
||-------|-------------|--------|
|| 0 | Repo bootstrap | ✅ Complete |
|| 1.1 | UI shell + layout | ✅ Complete |
|| 1.2 | WASM worker | ✅ Complete |
|| 1.3 | File upload | ✅ Complete |
|| 1.4 | Download manager | ✅ Complete |
|| 2.1 | Parameter parser | ✅ Complete |
|| 2.2 | UI generator | ✅ Complete |
|| 2.3 | State management | ✅ Complete |
|| 3.1 | 3D Preview | ✅ Complete |
|| 3.2 | Accessibility | ✅ Complete |
|| 3.4 | Deployment | ✅ Complete |
|| **v1.1** | **URL params, localStorage, shortcuts, examples** | ✅ Complete |
|| **v1.2** | **Auto-preview, progressive quality, caching** | ✅ Complete |
|| **v1.3** | **ZIP upload, multi-file projects, virtual FS** | ✅ Complete |
|| **v1.4** | **Dark mode with theme toggle** | ✅ Complete |
|| **v1.5** | **High contrast mode (WCAG AAA)** | ✅ Complete |
|| **v1.6** | **Multiple output formats** | ✅ Complete |
|| **v1.7** | **Parameter presets system** | ✅ Complete |
|| **v1.8** | **STL measurements & dimensions** | ✅ Complete |
|| **v1.9** | **PWA support & offline mode** | ✅ Complete |
|| **v1.10** | **Library bundles & URL safety** | ✅ Complete |
|| **v2.0** | **Developer toolchain (CLI tools)** | ✅ Complete |
|| **v2.1** | **Enhanced CLI (React, themes, CI/CD)** | ✅ Complete |
|| **v2.2** | **Vue, Svelte templates, enhanced tooling** | ✅ Complete |
|| **v2.3** | **Audit & polish release** | ✅ Complete |
|| **v2.4-v2.9** | **Testing, performance, mobile enhancements** | ✅ Complete |
|| **v2.10** | **Enhanced accessibility & layout** | ✅ Complete |

## ⚖️ Licensing

|| Component | License |
||-----------|---------|
|| This project | GPL-3.0-or-later |
|| OpenSCAD WASM | GPL-2.0+ |
|| Your `.scad` files | Your license |
|| Generated STL files | Your ownership |

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 🙏 Acknowledgments

**Built on:**
- [OpenSCAD](https://openscad.org/) — The parametric CAD engine (GPL-2.0+)
- [openscad-wasm-prebuilt](https://www.npmjs.com/package/openscad-wasm-prebuilt) — Pre-built WASM binaries
- [Three.js](https://threejs.org/) — 3D preview rendering
- [Vite](https://vitejs.dev/) — Build tooling
- [JSZip](https://stuk.github.io/jszip/) — ZIP file handling

**Reference implementations:**
- [seasick/openscad-web-gui](https://github.com/seasick/openscad-web-gui) — WASM integration patterns (GPL-3.0)
- [openscad/openscad-playground](https://github.com/openscad/openscad-playground) — Official web playground

**Choosing a tool:**
- If you’re deciding between this project and OpenSCAD Playground, see [Choosing Forge vs Playground](docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md).

## 🤝 Contributing

Contributions welcome! Please read the [Build Plan](docs/BUILD_PLAN_NEW.md) first to understand our architecture.

**Good first issues:**
- Add more example OpenSCAD models
- Improve error messages for common OpenSCAD errors
- Documentation improvements
- Internationalization (i18n)

### Development Setup

```bash
# Clone and install
git clone https://github.com/YOUR_ORG/openscad-web-customizer-forge.git
cd openscad-web-customizer-forge
npm install

# Start dev server (web app)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Link CLI tools for local development
npm link

# Test CLI commands
openscad-forge --help
openscad-forge extract examples/simple-box/simple_box.scad
```

## 🎉 What's New in v2.10.0

### Enhanced Accessibility & Layout

v2.10.0 brings major improvements to accessibility and user interface flexibility.

**Layout Enhancements:**
- 🎛️ **Collapsible Parameter Panel** — Desktop-only collapse/expand with smooth animations and persistent state
- ↔️ **Resizable Split Panels** — Drag-to-resize with keyboard support (Arrow keys, Home/End)
- 🎯 **Focus Mode** — Maximize preview area with `F` key or button click
- 📐 **Compact Header** — Auto-compact mode after file load to maximize content space

**Accessibility Improvements:**
- ♿ **Enhanced ARIA** — Comprehensive `aria-expanded`, `aria-pressed`, `aria-controls` attributes
- ⌨️ **Keyboard Navigation** — Full keyboard control for all new features
- 🎯 **Focus Management** — Intelligent focus handling when collapsing panels
- 📱 **Responsive Design** — Desktop features properly disabled on mobile (<768px)
- 🎨 **Reduced Motion** — Respects `prefers-reduced-motion` preference

**UI Refinements:**
- 📦 **Collapsible Sections** — Preset controls and preview settings now use `<details>` elements
- 🎬 **Actions Dropdown** — Secondary actions moved to "More" menu
- 📊 **Auto-Hide Status** — Status bar hides when idle
- 📁 **Compact File Info** — File tree in collapsible disclosure

**Technical Details:**
- New dependency: `split.js` (v1.6.5) for resizable panels
- Modified files: `main.js` (+459 lines), `layout.css` (+325 lines), `components.css` (+210 lines)
- Bundle impact: +~10KB gzipped
- WCAG 2.1 AA compliance maintained
- Full keyboard support with new shortcuts

See [docs/changelogs/CHANGELOG_v2.10.md](docs/changelogs/CHANGELOG_v2.10.md) for complete details.

---

<p align="center">
  <strong>No installation. No account. Just customize.</strong>
</p>

<p align="center">
  Made with ❤️ by the open-source community
</p>
