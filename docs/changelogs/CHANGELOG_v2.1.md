# Changelog — v2.1.0: Enhanced CLI

**Release Date**: 2026-01-15  
**Status**: Complete ✅  
**Milestone**: Enhanced CLI toolchain with React templates, theme generation, and CI/CD automation

---

## 🎯 Overview

Version 2.1.0 extends the developer toolchain with powerful features for building, styling, and deploying OpenSCAD customizer web applications. This release introduces React template support, a flexible theme generator, and comprehensive CI/CD configuration generators for multiple platforms.

## ✨ New Features

### ⚛️ React Template Support

Generate React-based customizer applications with modern component architecture:

- **Template System**: New `--template react` option for scaffold command
- **React Components**: Pre-built components (App, Header, ParametersPanel, PreviewPanel, ParameterControl)
- **React Hooks**: useState, useEffect for state management
- **Vite + React**: Optimized build configuration with @vitejs/plugin-react
- **Type Safety**: Optional TypeScript support via devDependencies
- **URL Parameters**: Automatic hash-based parameter persistence
- **Worker Integration**: Web Worker support for OpenSCAD WASM
- **Modern JSX**: Clean, maintainable component structure

**Usage:**
```bash
openscad-forge scaffold \
  --schema params.json \
  --scad model.scad \
  --template react \
  --out my-app
```

**Generated Structure:**
```
my-app/
├── src/
│   ├── App.jsx                    # Main application component
│   ├── App.css                    # Application styles
│   ├── main.jsx                   # React entry point
│   ├── components/
│   │   ├── Header.jsx             # Header component
│   │   ├── ParametersPanel.jsx    # Parameters panel
│   │   ├── PreviewPanel.jsx       # 3D preview panel
│   │   └── ParameterControl.jsx   # Individual parameter controls
│   └── worker/
│       └── openscad-worker.js     # WASM worker
├── index.html
├── package.json                   # With React dependencies
└── vite.config.js                 # React plugin configured
```

### 🎨 Theme Generator

Create custom color themes with 5 built-in presets or fully custom colors:

- **Built-in Presets**: blue (default), purple, green, orange, slate, dark
- **Custom Colors**: Specify primary, secondary, and background colors
- **Auto-Generation**: Automatically generates hover and active states
- **CSS Variables**: Modern CSS custom properties for easy theming
- **Accessibility**: High contrast mode and reduced motion support
- **Dark Mode**: Pre-configured dark theme with proper color contrast
- **Professional Palettes**: Carefully selected colors with WCAG AA+ compliance

**Theme Command:**
```bash
# Use a preset
openscad-forge theme --preset purple --out theme.css

# Create custom theme
openscad-forge theme --custom \
  --primary "#9333ea" \
  --secondary "#64748b" \
  --background "#ffffff" \
  --out theme.css

# List available presets
openscad-forge theme --list
```

**Generated CSS Variables:**
- `--color-primary`, `--color-primary-hover`, `--color-primary-active`
- `--color-secondary`, `--color-secondary-hover`
- `--color-background`, `--color-background-alt`
- `--color-surface`, `--color-surface-hover`
- `--color-text`, `--color-text-secondary`
- `--color-border`
- `--color-error`, `--color-warning`, `--color-success`, `--color-info`
- Shadow variables (`--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- Transition variables (`--transition-fast`, `--transition-base`, `--transition-slow`)

**Theme Presets:**
- **Blue** — Professional blue theme (default)
- **Purple** — Creative purple theme for artistic projects
- **Green** — Fresh green theme for nature-focused projects
- **Orange** — Energetic orange theme for dynamic projects
- **Slate** — Minimal monochrome theme for professional look
- **Dark** — Dark mode for low-light environments

### 🔧 CI/CD Integration Helpers

Generate production-ready CI/CD configurations for 6 popular platforms:

#### GitHub Actions
- Automated testing on push/PR
- Dependency caching with npm ci
- Linting and build validation
- Automatic Vercel deployment on main branch
- Build artifact uploads with 30-day retention

**Generated:**
- `.github/workflows/ci.yml`

#### GitLab CI/CD
- Multi-stage pipeline (build, test, deploy)
- Node.js 18 Docker image
- Artifact management
- Manual production deployment
- Coverage reporting

**Generated:**
- `.gitlab-ci.yml`

#### Vercel
- Framework-optimized configuration
- Security headers (CORS, CSP)
- WASM-specific headers (COOP, COEP)
- Clean URLs and SPA routing
- Build optimization

**Generated:**
- `vercel.json`

#### Netlify
- Build configuration
- Custom headers for WASM
- Security headers
- SPA routing redirects
- Node.js version pinning

**Generated:**
- `netlify.toml`

#### Docker
- Multi-stage build (builder + nginx)
- Optimized production image (Alpine Linux)
- Nginx with gzip compression
- Security headers
- Asset caching
- Docker Compose orchestration

**Generated:**
- `Dockerfile`
- `nginx.conf`
- `docker-compose.yml`
- `.dockerignore`

#### Golden Fixtures (Validation)
- Automated STL comparison tests
- Test fixture definitions
- Tolerance configuration
- Test runner script
- CI integration ready

**Generated:**
- `tests/golden-fixtures.json`
- `tests/run-golden-tests.js`

**CI Command:**
```bash
# Generate GitHub Actions
openscad-forge ci --provider github

# Generate Docker setup
openscad-forge ci --provider docker

# Generate validation tests
openscad-forge ci --provider validation

# List all providers
openscad-forge ci --list
```

## 📦 Technical Details

### New Files
- `cli/commands/theme.js` — Theme generator (400+ lines)
- `cli/commands/ci.js` — CI/CD generator (350+ lines)
- `cli/templates/react/` — React template directory
  - `index.html.template` — React HTML template
  - `src/App.jsx` — Main React component (220 lines)
  - `src/main.jsx` — React entry point
  - `src/App.css` — Component styles
  - `vite.config.js.template` — React Vite config
  - `src/components/` — React components (4 files, 300+ lines)
  - `src/worker/openscad-worker.js` — Worker implementation

### Updated Files
- `bin/openscad-forge.js` — Added theme and ci command imports
- `cli/commands/scaffold.js` — React template integration
- `package.json` — Version bump to 2.1.0
- `README.md` — Added v2.1 documentation

### Dependencies
No new dependencies required. Uses existing:
- `chalk` — Colorized terminal output
- `commander` — Command-line parsing

### Code Statistics
- **New Code**: ~1,200 lines
- **React Template**: 8 files, 600+ lines
- **Theme Generator**: 400+ lines
- **CI Generator**: 350+ lines
- **Documentation**: Updated README, new changelog

## 🎯 Use Cases

### 1. React-Based Customizers
Generate modern React applications with component-based architecture:

```bash
openscad-forge extract model.scad --out schema.json
openscad-forge scaffold --schema schema.json --scad model.scad --template react
cd webapp && npm install && npm run dev
```

### 2. Custom Branded Themes
Create themes matching your brand colors:

```bash
openscad-forge theme --custom \
  --primary "#0066cc" \
  --secondary "#666666" \
  --background "#f5f5f5" \
  --out custom-theme.css
```

### 3. Automated Deployment
Set up CI/CD for automatic testing and deployment:

```bash
# Initialize GitHub Actions
openscad-forge ci --provider github

# Add Docker containerization
openscad-forge ci --provider docker

# Set up validation tests
openscad-forge ci --provider validation
```

### 4. Complete Project Setup
End-to-end project generation with theming and CI/CD:

```bash
# Extract and scaffold
openscad-forge extract model.scad --out schema.json
openscad-forge scaffold --schema schema.json --scad model.scad --template react --out app

# Add custom theme
openscad-forge theme --preset purple --out app/src/styles/theme.css

# Configure CI/CD
openscad-forge ci --provider github --out app
openscad-forge ci --provider docker --out app

# Build and deploy
cd app
npm install
npm run build
```

## 🔧 Command Reference

### Theme Command
```bash
openscad-forge theme [options]
```

**Options:**
- `-o, --out <path>` — Output CSS file path
- `--preset <name>` — Theme preset (blue|purple|green|orange|slate|dark)
- `--custom` — Generate custom theme
- `--primary <color>` — Primary color (hex)
- `--secondary <color>` — Secondary color (hex)
- `--background <color>` — Background color (hex)
- `--list` — List available presets
- `--force` — Overwrite existing file

### CI Command
```bash
openscad-forge ci [options]
```

**Options:**
- `--provider <name>` — CI/CD provider (github|gitlab|vercel|netlify|docker|validation)
- `-o, --out <path>` — Output directory (default: current directory)
- `--list` — List available providers

### Updated Scaffold Command
```bash
openscad-forge scaffold [options]
```

**New Option:**
- `--template <name>` — Template to use (vanilla|react) [default: vanilla]

## ✅ Testing

All features have been implemented and validated:

### React Template
- ✅ Template files created and structured
- ✅ React components with proper hooks
- ✅ Vite configuration with React plugin
- ✅ TypeScript types included
- ✅ Worker integration functional
- ✅ URL parameter persistence working

### Theme Generator
- ✅ All 6 presets validated
- ✅ Custom color generation tested
- ✅ CSS variable structure verified
- ✅ Accessibility features included
- ✅ Dark mode theme working

### CI/CD Generators
- ✅ GitHub Actions workflow validated
- ✅ GitLab CI pipeline tested
- ✅ Vercel config verified
- ✅ Netlify config tested
- ✅ Docker setup functional
- ✅ Golden fixtures structure validated

## 🎓 Examples

### Example 1: React App with Custom Theme
```bash
# Create React-based customizer
openscad-forge scaffold \
  --schema params.json \
  --scad model.scad \
  --template react \
  --out my-customizer

# Generate custom theme
openscad-forge theme --preset green --out my-customizer/src/styles/theme.css

# Import in App.jsx
echo "import './styles/theme.css';" >> my-customizer/src/App.jsx
```

### Example 2: Docker Deployment
```bash
# Generate app
openscad-forge scaffold --schema schema.json --scad model.scad --out app

# Add Docker config
openscad-forge ci --provider docker --out app

# Build and run
cd app
docker-compose up -d
```

### Example 3: GitHub Actions CI/CD
```bash
# Setup project
openscad-forge scaffold --schema schema.json --scad model.scad --out app

# Add GitHub Actions
openscad-forge ci --provider github --out app

# Commit and push (triggers workflow)
cd app
git init
git add .
git commit -m "Initial commit"
git push origin main
```

## 🚀 Deployment

### Vercel
1. Generate Vercel config: `openscad-forge ci --provider vercel`
2. Install Vercel CLI: `npm i -g vercel`
3. Deploy: `vercel --prod`

### Netlify
1. Generate Netlify config: `openscad-forge ci --provider netlify`
2. Install Netlify CLI: `npm i -g netlify-cli`
3. Deploy: `netlify deploy --prod`

### Docker
1. Generate Docker config: `openscad-forge ci --provider docker`
2. Build: `docker build -t my-customizer .`
3. Run: `docker-compose up -d`

### GitHub Pages
1. Generate GitHub Actions: `openscad-forge ci --provider github`
2. Enable GitHub Pages in repository settings
3. Push to main branch (automatic deployment)

## 📝 Migration Notes

### From v2.0 to v2.1

No breaking changes. All v2.0 commands continue to work.

**New Features:**
- React template now available alongside vanilla JS
- Theme generator for custom styling
- CI/CD generators for automation

**Recommendations:**
- Use `--template react` for new projects if you prefer React
- Generate a custom theme with `theme` command for branding
- Add CI/CD with `ci` command for automated testing

## 🔮 Future Enhancements

Ideas for future versions:

- **v2.2**: Vue and Svelte templates
- **v2.2**: Theme preview in browser
- **v2.2**: Visual theme editor
- **v3.0**: Automated theme contrast checking
- **v3.0**: Component library extraction
- **v3.0**: Multi-theme support in single app

## 📚 Documentation

- [Build Plan](../BUILD_PLAN_NEW.md) — Development roadmap
- [README](../../README.md) — Updated with v2.1 features
- [Completion Summary](V2.1_COMPLETION_SUMMARY.md) — Implementation details

## 🏆 Credits

**License**: GPL-3.0-or-later

---

**Version**: 2.1.0  
**Released**: 2026-01-15  
**Status**: Complete ✅
