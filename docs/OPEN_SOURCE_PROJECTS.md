# Open Source Projects Used

All open source projects referenced, implemented, or used as tooling in OpenSCAD Assistive Forge.

---

## Runtime Dependencies

These projects are shipped with the application.

### OpenSCAD

- **Repo**: https://github.com/openscad/openscad
- **License**: GPL-2.0-or-later
- **Usage**: Core CAD engine compiled to WebAssembly for client-side STL generation

### openscad-wasm

- **Repo**: https://github.com/openscad/openscad-wasm
- **License**: GPL-2.0-or-later
- **Usage**: WebAssembly port of OpenSCAD

### openscad-playground

- **Repo**: https://github.com/openscad/openscad-playground
- **License**: GPL-2.0-or-later
- **Usage**: Build system used to produce the official WASM build

### Manifold

- **Repo**: https://github.com/elalish/manifold
- **License**: Apache-2.0
- **Usage**: Geometry library bundled inside the OpenSCAD WASM build; provides 5–30x faster boolean/CSG operations

### Three.js

- **Repo**: https://github.com/mrdoob/three.js
- **License**: MIT
- **Usage**: 3D preview rendering in the browser

### @radix-ui/colors

- **Repo**: https://github.com/radix-ui/colors
- **License**: MIT
- **Usage**: Accessible color palette system; all UI colors are derived from Radix Colors to meet WCAG contrast requirements

### AJV

- **Repo**: https://github.com/ajv-validator/ajv
- **License**: MIT
- **Usage**: JSON Schema validation for parameter definitions

### JSZip

- **Repo**: https://github.com/Stuk/jszip
- **License**: MIT
- **Usage**: ZIP file creation and extraction for project export/import

### Split.js

- **Repo**: https://github.com/nathancahill/split
- **License**: MIT
- **Usage**: Resizable panel layout (parameters / preview split)

### YAML

- **Repo**: https://github.com/eemeli/yaml
- **License**: ISC
- **Usage**: YAML parsing for configuration files

### Chalk

- **Repo**: https://github.com/chalk/chalk
- **License**: MIT
- **Usage**: Terminal color output in CLI scripts

### Commander

- **Repo**: https://github.com/tj/commander.js
- **License**: MIT
- **Usage**: CLI argument parsing for the `openscad-forge` bin

---

## Dev / Toolchain Dependencies

These projects are used during development and testing only.

### Vite

- **Repo**: https://github.com/vitejs/vite
- **License**: MIT
- **Usage**: Build tool and dev server

### Vitest

- **Repo**: https://github.com/vitest-dev/vitest
- **License**: MIT
- **Usage**: Unit test runner

### Playwright

- **Repo**: https://github.com/microsoft/playwright
- **License**: Apache-2.0
- **Usage**: End-to-end browser testing

### @axe-core/playwright

- **Repo**: https://github.com/dequelabs/axe-core
- **License**: MPL-2.0
- **Usage**: Automated accessibility auditing integrated into the Playwright test suite

### Lighthouse

- **Repo**: https://github.com/GoogleChrome/lighthouse
- **License**: Apache-2.0
- **Usage**: Accessibility and performance auditing via the `check-a11y` npm script

### ESLint

- **Repo**: https://github.com/eslint/eslint
- **License**: MIT
- **Usage**: JavaScript linting

### Prettier

- **Repo**: https://github.com/prettier/prettier
- **License**: MIT
- **Usage**: Code formatting

### colorjs.io

- **Repo**: https://github.com/color-js/color.js
- **License**: MIT
- **Usage**: Color math for automated WCAG contrast ratio tests

### happy-dom

- **Repo**: https://github.com/capricorn86/happy-dom
- **License**: MIT
- **Usage**: Lightweight DOM environment for unit tests

### jsdom

- **Repo**: https://github.com/jsdom/jsdom
- **License**: MIT
- **Usage**: Full DOM environment for unit tests

### vnu-jar (W3C Validator)

- **Repo**: https://github.com/validator/validator
- **License**: MIT
- **Usage**: W3C HTML and CSS validation via the `validate:html` npm script

### png-to-ico

- **Repo**: https://github.com/nicktindall/png-to-ico
- **License**: MIT
- **Usage**: Converts PNG assets to `.ico` format for favicon generation

---

## Referenced / Inspirational Projects

These projects were studied for architecture or design patterns. No code was copied.

### openscad-web-gui

- **Repo**: https://github.com/seasick/openscad-web-gui
- **License**: GPL-3.0
- **Usage**: Referenced for web-based OpenSCAD architecture patterns only

### Retrosmart X11 Cursors

- **Repo**: https://github.com/mdomlop/retrosmart-x11-cursors
- **License**: GPL-3.0
- **Usage**: Cursor pixel designs adapted with color modifications

---

## Specifications Referenced

### JSON Schema

- **Spec**: https://json-schema.org/
- **Usage**: Draft 2020-12 specification used for parameter validation schema design (implemented via AJV)
