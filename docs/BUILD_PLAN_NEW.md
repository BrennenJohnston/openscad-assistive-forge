---
name: OpenSCAD Web Customizer Forge — Build Plan
version: 3.1.0
date: 2026-01-12
last_validated: 2026-01-20
validated_by: Project maintainer (v3.1.0 Enhanced UI & Accessibility Release)
status: released
next_milestone: v3.2 (Q2 2026)
license: GPL-3.0-or-later
---

# OpenSCAD Web Customizer Forge — Build Plan

## Document Navigation

| Section | Description |
|---------|-------------|
| [Executive Summary](#executive-summary) | What we're building and why |
| [Scope Change Summary](#scope-change-summary) | What changed from original plan |
| [v1: Web Application](#v1-openscad-web-customizer-web-application) | User-facing web app (primary focus) |
| [v2: Developer Toolchain](#v2-developer-toolchain-original-scope) | CLI tools (deferred) |
| [Technical Architecture](#technical-architecture) | How it works |
| [Implementation Plan](#implementation-plan) | Phased build approach |
| [Reference Implementations](#reference-implementations) | Validated open source projects |
| [Risk Assessment](#risk-assessment) | What could go wrong |
| [Success Metrics](#success-metrics) | How we measure success |

---

## Executive Summary

### Quickstart Checklist (Day 1 for a new contributor)

- Install Node 18+ and npm 9+.
- From repo root: `npm create vite@latest . -- --template vanilla` (keep docs/LICENSE), then `npm install`, then `npm install ajv three`, then `npm install --save-dev eslint prettier`.
- Create config files for eslint and prettier (see "Repo Bootstrap" section).
- Ensure layout matches the target tree (see "Repo Layout (Target)").
- Run `npm run dev`; verify the app shell loads.
- Upload `examples/universal-cuff/universal_cuff_utensil_holder.scad`; confirm parameters render.
- Trigger a render; see progress updates and a downloadable STL (or a clear timeout/error).

### What We're Building

**v1 Goal**: A **user-facing web application** where anyone can:

1. **Upload** an OpenSCAD (.scad) file directly in the browser
2. **See** automatically-extracted Customizer parameters in an accessible, beginner-friendly UI
3. **Adjust** parameters using intuitive controls (sliders, dropdowns, toggles)
4. **Generate** STL files using **client-side processing** (no server, no credits)
5. **Download** the resulting STL for 3D printing

**Think**: classic “web parametric customizer” UX, but:
- Runs entirely in your browser (client-side OpenSCAD WASM)
- Better accessibility (WCAG 2.1 AA compliant)
- Beginner-friendly parameter guidance
- No account required, no usage limits
- Open source (GPL-3.0-or-later)

### Definition of Done (v1 MVP)

The v1 MVP is considered **done** when a new contributor can:

1. Run `npm install` then `npm run dev`
2. Upload `examples/universal-cuff/universal_cuff_utensil_holder.scad`
3. See **grouped parameters** and adjust at least:
   - 1 range slider (e.g. `palm_loop_height`)
   - 1 enum select (e.g. `part`)
   - 1 yes/no toggle (e.g. `include_lower_tool_mount`)
4. Use the core workflow (standalone):
   - Adjust parameters
   - Click **Generate STL**
   - Download the output
5. During render/download, the app provides:
   - A downloadable STL file
   - A visible progress indicator during generation
   - A clear error message if generation fails or times out
6. Open the **Advanced** menu and confirm power-user tools work:
   - **View SCAD source** (read-only) for the uploaded model
   - For at least one numeric parameter, **unlock/override limits** and set a value outside the parsed UI min/max
   - Re-render successfully (or receive a clear, actionable error if OpenSCAD rejects the change)

Optional for v1 MVP: 3D preview (P1 feature)

### Why This Matters

| Problem | Our Solution |
|---------|--------------|
| Many legacy customizers are deprecated/limited | Open source alternative |
| Server-side rendering costs money | 100% client-side processing |
| OpenSCAD Customizer UI is intimidating | Accessible, guided UI |
| Can't customize without installing OpenSCAD | Web-based, no install |
| Saving and reusing settings is hard | Presets + export/import (no accounts) |

### Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Core Infrastructure | 1-2 weeks | WASM worker + file upload |
| Phase 2: Parameter UI | 1-2 weeks | Schema-driven form generation |
| Phase 3: Polish and Deploy | 1 week | Vercel deployment + accessibility |
| **Total v1** | **3-5 weeks** | Working web application |

---

## Scope Change Summary

### What Changed (v0.1.0 to v0.2.0)

| Aspect | Original v1 | New v1 | Rationale |
|--------|-------------|--------|-----------|
| **Primary User** | Developers | End users | Faster path to usable product |
| **Core Deliverable** | CLI tool | Web application | Direct user value |
| **Input Method** | Command-line file path | Browser file upload | No install required |
| **Output** | Generated project scaffold | STL file download | Immediate utility |
| **Parameter Source** | Pre-extracted schema | Runtime extraction | Single-step workflow |

### Original Scope Moved to v2

The original build plan focused on **developer tooling**:

```bash
# Original v1 vision (now v2)
forge extract model.scad --out params.schema.json
forge scaffold --schema params.schema.json --scad model.scad --out ./webapp
forge validate ./webapp --cases test-cases.yaml --ref docker-openscad
forge sync --apply-safe-fixes
```

This is still valuable but is now **v2 scope** because:

1. **End users can't wait** for developers to scaffold apps for each model
2. **Client-side WASM** enables runtime parameter extraction
3. **Browser-based UI** provides immediate value without tooling

### What Stays the Same

- OpenSCAD WASM for client-side STL generation
- Parameter Schema specification (JSON Schema + UI extensions)
- Accessibility-first UI design
- GPL-3.0-or-later licensing
- Vercel deployment target
- Example project (universal cuff)

---

## v1: OpenSCAD Web Customizer (Web Application)

### User Journey

```
User lands on page
       |
       v
+---------------------------+
|  Welcome Screen           |
|  - Drop .scad file here   |
|  - Or try an example      |
+---------------------------+
       |
       v (upload file)
+---------------------------+
|  Parameters extracted     |
|  automatically            |
+---------------------------+
       |
       v
+------------------------------------------+
|  Main Interface                          |
|  +----------------+ +------------------+ |
|  | PARAMETERS     | | 3D PREVIEW       | |
|  |                | |                  | |
|  | > Part to Print| |   [3D Model]     | |
|  |   [Dropdown]   | |                  | |
|  |                | |                  | |
|  | > Dimensions   | | [Download STL]   | |
|  |   Height ---o--| | [Advanced ▾]     | |
|  |   Width  --o---| |                  | |
|  +----------------+ +------------------+ |
+------------------------------------------+
       |
       v (click Download)
+---------------------------+
|  STL generated client-side|
|  File downloaded          |
+---------------------------+
```

### Core Features (v1 MVP)

#### 1. File Upload and Parsing

| Feature | Description | Priority |
|---------|-------------|----------|
| Drag-and-drop upload | Drop .scad file onto page | P0 |
| File picker fallback | Click to browse for file | P0 |
| Parameter extraction | Parse Customizer annotations at runtime | P0 |
| Error handling | Clear messages for unsupported files | P0 |
| Example models | Pre-loaded example (universal cuff) | P0 |
| Include resolution | Support include/use statements | P1 |

#### 2. Parameter UI

| Feature | Description | Priority |
|---------|-------------|----------|
| Grouped parameters | Collapsible sections matching groups | P0 |
| Range sliders | For [min:max] parameters | P0 |
| Step sliders | For [min:step:max] parameters | P0 |
| Dropdown selects | For enum parameters | P0 |
| Toggle switches | For [yes, no] boolean-likes | P0 |
| Number inputs | Direct value entry with validation | P0 |
| Help tooltips | From inline comments | P1 |
| Unit display | Show mm, degrees, etc. | P1 |
| Dependency visibility | Hide/show based on other params | P2 |
| Reset to defaults | One-click reset | P1 |

#### 3. STL Generation

| Feature | Description | Priority |
|---------|-------------|----------|
| OpenSCAD WASM | Client-side rendering via Web Worker | P0 |
| Progress indicator | Show generation progress/status | P0 |
| Cancel generation | Abort long-running renders | P1 |
| Timeout handling | 60s timeout with clear message | P0 |
| Download STL | Save to local filesystem | P0 |
| Download filename | Include model name + param hash | P1 |

#### 4. 3D Preview

| Feature | Description | Priority |
|---------|-------------|----------|
| Three.js viewer | Display generated STL | P1 |
| Orbit controls | Rotate, zoom, pan | P1 |
| Auto-rotate | Gentle rotation for first preview | P2 |
| Light/dark theme | Match system preference | P2 |

#### 5. Persistence (standalone)

| Feature | Description | Priority |
|---------|-------------|----------|
| Autosave drafts | Save the current parameter values automatically (per model) | P1 |
| Browser storage | Remember last-used parameters (per model) | P1 |
| Presets | Save/load named parameter sets (per model) | P1 |
| Export/import presets (file) | Download/upload a JSON file containing presets (no accounts) | P2 |
| Optional URL restore | Store state in URL hash for refresh/bookmark recovery (do not present as “sharing”) | P3 |

#### 6. Advanced Menu (Code + Limits)

This app is intended for standalone users. Many parametric models ship with conservative min/max ranges; advanced users sometimes need to go beyond those constraints.

The Advanced menu is a *power-user escape hatch* that keeps the main UI simple, while still allowing:
- Viewing the original OpenSCAD source
- Editing the OpenSCAD source directly (optional)
- Overriding UI-imposed constraints (range min/max/step) when necessary

| Feature | Description | Priority |
|---------|-------------|----------|
| View SCAD source | Read-only view of the uploaded `.scad` (or ZIP main file) | P1 |
| Edit SCAD source | Editable code panel that re-runs parameter extraction and render using the modified source | P2 |
| Override parameter limits | “Unlock limits” toggle per numeric parameter to allow values outside parsed min/max/step (with warnings) | P1 |
| Raw parameter JSON | View/copy the current parameter-value JSON used for rendering | P2 |
| Reset tools | Reset a single parameter, a group, or all parameters back to defaults | P1 |
| Diagnostics panel | Show last render log/errors and a “Copy diagnostics” button (for bug reports) | P2 |

**Implementation notes (accessibility-first)**:
- Start with an accessible `<textarea>` (monospace, resizable) for the code editor; ensure keyboard-only use works.
- If syntax highlighting becomes necessary later, evaluate a proven OSS editor like CodeMirror 6 and keep it optional.

### Accessibility Requirements (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All controls focusable, logical tab order |
| Screen reader support | ARIA labels, live regions for status updates |
| Color contrast | 4.5:1 minimum for text, 3:1 for UI elements |
| Focus indicators | Visible focus rings on all interactive elements |
| Reduced motion | Respect prefers-reduced-motion |
| Touch targets | Minimum 44x44px for mobile |
| Error identification | Clear, specific error messages |
| Form labels | All inputs have visible labels |

### Beginner-Friendly Guidance

| Element | Purpose |
|---------|---------|
| Welcome message | Explain what the tool does |
| Hover tooltips | Explain each parameter's effect |
| Error recovery | Suggest fixes for common issues |
| Units display | Always show measurement units |
| Range indicators | Show min/max/current values |
| Progress feedback | "Generating STL... 45%" |
| Success confirmation | Brief "Done!" indication |

### Responsive Layout

**Desktop (1024px+)**:
```
+--------------------------------------------------+
| Header                                            |
+----------------------+---------------------------+
| Parameters Panel     | Preview/Download Panel    |
| (scrollable)         | (fixed header, content)   |
|                      |                           |
| - Group 1            | [3D Preview]              |
|   □ param1           |                           |
|   □ param2           |                           |
| - Group 2            | [Generate STL]            |
|   □ param3           | [Download STL]            |
|                      | Stats: 1234 triangles     |
+----------------------+---------------------------+
```

**Tablet (768-1023px)**:
- Similar to desktop but narrower panels
- Preview may be smaller
- Consider collapsing groups by default

**Mobile (< 768px)**:
```
+---------------------------+
| Header                     |
+---------------------------+
| Preview/Status (collapsed) |
| [Expand Preview]           |
+---------------------------+
| Parameters (scrollable)    |
| - Group 1 ▼               |
|   □ param1                |
|   □ param2                |
| - Group 2 ▶               |
+---------------------------+
| [Generate STL]             |
| [Download STL]             |
+---------------------------+
```

**Responsive Breakpoints**:
```css
:root {
  --breakpoint-mobile: 480px;
  --breakpoint-tablet: 768px;
  --breakpoint-desktop: 1024px;
  --breakpoint-wide: 1440px;
}

/* Mobile-first approach */
.main-layout {
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .main-layout {
    flex-direction: row;
  }
  
  .param-panel {
    width: 40%;
    min-width: 320px;
    max-width: 480px;
  }
  
  .preview-panel {
    flex: 1;
  }
}
```

**Touch Optimization**:
- Minimum 44x44px touch targets (WCAG 2.1 Level AAA)
- Increased padding on mobile (16px vs 8px)
- Larger slider thumbs (32px on mobile vs 20px desktop)
- Sticky "Generate STL" button on mobile (always accessible)

#### Mobile UI resizing issues (mobile viewport + virtual keyboard)

**Problem statement**: Some mobile browsers (especially iOS Safari) change the *visual viewport* when the address bar collapses/expands and when the on-screen keyboard opens. This commonly causes:
- Sticky bottom action bars to be partially hidden behind the keyboard
- Panels to “jump” or become unscrollable
- Modals to render off-screen or trap scroll
- Layouts sized with `100vh` to be too tall/short as browser chrome changes

**Goal**: Make the UI stable and usable on mobile by adopting *proven, human-written* open source patterns rather than inventing new viewport logic.

**Use known working OSS patterns**:
- **Visual Viewport API** reference implementation/spec history: [WICG Visual Viewport](https://github.com/WICG/visual-viewport)
- **Dynamic/small/large viewport unit fallback** (for browsers missing `dvh/svh/lvh`): [large-small-dynamic-viewport-units-polyfill](https://github.com/joppuyo/large-small-dynamic-viewport-units-polyfill)
- **Classic CSS variable fallback** (minimal pattern; use only if needed): the “`--vh` from `window.innerHeight`” approach is widely used; if we need a repo-backed reference, prefer the polyfill above and avoid bespoke one-off snippets.

**Implementation plan (mobile viewport hardening)**:
- **Step 1: Reproduce + document the resizing bugs**
  - Add a short “Known mobile resizing issues” subsection in `PROJECT_STATUS.md` (symptoms + device/browser + steps).
  - Capture before/after screenshots for: iOS Safari (keyboard open), Android Chrome (address bar expand/collapse), rotation portrait↔landscape.
- **Step 2: Adopt a single source of truth for “app height”**
  - Use CSS viewport units (`100dvh` / `100svh`) when available.
  - Add a fallback strategy aligned with [large-small-dynamic-viewport-units-polyfill](https://github.com/joppuyo/large-small-dynamic-viewport-units-polyfill) for devices where `dvh/svh` support is incomplete.
- **Step 3: Handle keyboard + sticky action bar explicitly**
  - When `window.visualViewport` exists, listen for `resize`/`scroll` and compute the *visible* bottom inset (keyboard overlap) to keep `.actions` fully visible.
  - Keep the logic minimal and auditable: treat this as adapting a well-known pattern from [WICG Visual Viewport](https://github.com/WICG/visual-viewport) rather than inventing new heuristics.
- **Step 4: Fix modal sizing + scroll behavior**
  - Ensure modal containers never depend on `100vh` directly; use the same “app height” variable/units as the main layout.
  - Ensure modal body uses internal scrolling and does not allow the background to scroll (see focus trap/inert section below).
- **Step 5: Verify with automated + manual checks**
  - Add Playwright mobile emulation checks (see “Testing infrastructure” section below) to ensure the primary action is visible and clickable at small viewports.
  - Run manual smoke tests on real iOS Safari and Android Chrome because viewport/keyboard behavior is still inconsistent across devices.

---

## v2: Developer Toolchain (Original Scope)

### Overview

v2 adds **developer-facing CLI tools** for automated workflows:

```bash
# Extract parameters from OpenSCAD to JSON Schema
openscad-forge extract model.scad --out params.schema.json

# Generate a standalone web app from schema + scad
openscad-forge scaffold --schema params.schema.json --scad model.scad --out ./webapp

# Validate parity between implementations
openscad-forge validate ./webapp --cases test-cases.yaml --ref docker-openscad

# Apply safe auto-fixes for detected issues
openscad-forge sync ./webapp --apply-safe-fixes
```

### v2 Features (Deferred)

| Feature | Description | Value |
|---------|-------------|-------|
| CLI parameter extraction | Batch process multiple files | Automation |
| Standalone app scaffolding | Generate project from schema | Distribution |
| Validation harness | Compare schemas, UI, STL output | Quality |
| Golden fixtures | Regression testing with known-good outputs | CI/CD |
| Auto-sync | Apply safe fixes automatically | Maintenance |
| React template | Alternative to vanilla JS | Developer choice |
| Custom themes | Brand-specific styling | Customization |

### v2 Timeline (After v1 Complete)

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| v2.0 | 2-3 weeks | CLI extract + scaffold commands |
| v2.1 | 2-3 weeks | Validation harness |
| v2.2 | 1-2 weeks | Auto-sync + golden fixtures |
| **Total v2** | **5-8 weeks** | Complete developer toolchain |

### Recommended Additions (Audit Gaps)

These are known gaps identified during code audits. Each item includes context and implementation guidance for developers.

#### Gap 1: STL Parity Validation Not Implemented

**What's the problem?**
The `validate` command has `--ref` and `--tolerance` options that suggest it can compare STL outputs, but this feature isn't actually implemented. The options exist but don't do anything.

**Why it matters:**
Users might expect to validate that their customizer produces the same STL as desktop OpenSCAD, but will get no actual comparison.

**How to fix (choose one):**

*Option A: Implement the feature*
```bash
# 1. Open cli/commands/validate.js
# 2. Find where --ref and --tolerance are defined
# 3. Add actual STL comparison logic:

# Step-by-step implementation:
# a. If --ref is provided, run desktop OpenSCAD to generate reference STL
# b. Generate STL using WASM
# c. Parse both STL files (binary or ASCII)
# d. Compare triangle counts
# e. If --tolerance provided, compute mesh difference (vertex positions)
# f. Report pass/fail based on tolerance threshold
```

*Option B: Remove the misleading options*
```javascript
// In cli/commands/validate.js, remove or hide these options:
// .option('--ref <path>', 'Reference OpenSCAD binary for parity checking')
// .option('--tolerance <percent>', 'Tolerance for mesh comparison')

// Add a comment explaining this is planned for a future version
```

**Recommended**: Option B is simpler. Document that STL parity validation is planned for v2.5.

---

#### Gap 2: Validate Command Not Template-Aware

**What's the problem?**
The `validate` command checks for specific files like `index.html`, `vite.config.js`, etc. But React/Vue/Svelte scaffolds have different file structures (e.g., `App.jsx` instead of inline JS), causing false validation failures.

**Why it matters:**
A developer who scaffolds a React project and runs `validate` will see errors even though their project is correctly structured.

**How to fix:**

```javascript
// In cli/commands/validate.js

// 1. Add template detection at the start of validation
function detectTemplate(projectPath) {
  // Check package.json for framework dependencies
  const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json')));
  if (pkg.dependencies?.react) return 'react';
  if (pkg.dependencies?.vue) return 'vue';
  if (pkg.dependencies?.svelte) return 'svelte';
  return 'vanilla';
}

// 2. Define expected files per template
const TEMPLATE_FILES = {
  vanilla: ['index.html', 'src/main.js', 'vite.config.js'],
  react: ['index.html', 'src/App.jsx', 'src/main.jsx', 'vite.config.js'],
  vue: ['index.html', 'src/App.vue', 'src/main.js', 'vite.config.js'],
  svelte: ['index.html', 'src/App.svelte', 'src/main.js', 'vite.config.js'],
};

// 3. Use template-specific checks
const template = detectTemplate(projectPath);
const expectedFiles = TEMPLATE_FILES[template];
// ... validate against expectedFiles instead of hardcoded list
```

---

#### Gap 3: Golden Fixtures Format Mismatch

**What's the problem?**
Two commands create/use golden fixtures but they don't agree on the format:
- `validate --save-fixtures` saves fixtures one way
- `ci --provider validation` expects fixtures in a different format

**Why it matters:**
You can't generate fixtures with one command and use them with another, which defeats the purpose of golden fixtures.

**How to fix:**

```javascript
// 1. Define a shared fixture schema in a new file: cli/lib/fixture-schema.js

export const FIXTURE_SCHEMA = {
  version: '1.0',
  model: {
    name: 'string',       // e.g., "universal_cuff"
    path: 'string',       // e.g., "./model.scad"
  },
  parameters: {
    // key-value pairs of parameter names to values
  },
  expected: {
    triangleCount: 'number',
    boundingBox: {
      x: 'number',
      y: 'number',
      z: 'number',
    },
    // Optional: hash of STL content for exact match
    contentHash: 'string?',
  },
  metadata: {
    createdAt: 'ISO8601 string',
    openscadVersion: 'string',
  },
};

// 2. Update validate.js to use this schema when saving
// 3. Update ci.js validation runner to read this schema
```

---

#### Gap 4: Scaffold --theme Option Not Wired

**What's the problem?**
Running `openscad-forge scaffold --theme purple` accepts the option but doesn't actually include the purple theme CSS in the output.

**Why it matters:**
The option exists but does nothing, confusing users who expect themed output.

**How to fix:**

```javascript
// In cli/commands/scaffold.js

// 1. Import the theme generator
import { generateTheme } from './theme.js';

// 2. In the scaffold function, after creating the project:
if (options.theme && options.theme !== 'blue') {
  // Generate theme CSS
  const themeCSS = generateTheme(options.theme);
  
  // Write to src/css/custom-theme.css
  const themePath = path.join(outputDir, 'src/css/custom-theme.css');
  fs.writeFileSync(themePath, themeCSS);
  
  // Update index.html to include the theme
  // Add: <link rel="stylesheet" href="src/css/custom-theme.css">
}
```

---

#### Gap 5: YAML Format Not Implemented

**What's the problem?**
`openscad-forge extract --format yaml` is documented but running it shows "not yet implemented".

**Why it matters:**
Users might prefer YAML for readability, but the feature doesn't work.

**How to fix (choose one):**

*Option A: Implement YAML export*
```bash
# 1. Install a YAML library
npm install yaml

# 2. In cli/commands/extract.js, add YAML output:
import { stringify } from 'yaml';

if (options.format === 'yaml') {
  const yamlOutput = stringify(schema);
  if (options.out) {
    fs.writeFileSync(options.out, yamlOutput);
  } else {
    console.log(yamlOutput);
  }
}
```

*Option B: Remove the option*
```javascript
// In cli/commands/extract.js, change:
// .option('--format <type>', 'Output format (json|yaml)', 'json')
// To:
.option('--format <type>', 'Output format (json)', 'json')

// Add note in help text: "YAML format planned for future release"
```

---

#### Gap 6: Advanced Parameter Hints Not Preserved in Extract

**What's the problem?**
The parser detects `[color]` and `[file]` hints and sets `uiType`, but `extract` doesn't output these as `x-hint` in the schema.

**Why it matters:**
Color pickers and file uploads won't work in scaffolded apps because the hint information is lost.

**How to fix:**

```javascript
// In cli/commands/extract.js, when building the schema output:

// Before (loses hint info):
properties[param.name] = {
  type: param.type,
  default: param.default,
};

// After (preserves hints):
properties[param.name] = {
  type: param.type === 'color' ? 'string' : param.type,  // Keep JSON Schema valid
  default: param.default,
};

// Add x-hint for special types
if (param.uiType === 'color') {
  properties[param.name]['x-hint'] = 'color';
}
if (param.uiType === 'file') {
  properties[param.name]['x-hint'] = param.acceptedExtensions 
    ? `file:${param.acceptedExtensions.join(',')}` 
    : 'file';
}
```

---

#### Gap 7: Sync Auto-Fix Uses Wrong Package Name

**What's the problem?**
The sync command detects "outdated three.js" but tries to fix by installing `three.js` instead of the correct package name `three`.

**Why it matters:**
Auto-fix fails with "package not found" error.

**How to fix:**

```javascript
// In cli/commands/sync.js, find the dependency mapping and fix it:

// Before (wrong):
const DEPENDENCY_MAP = {
  'three.js': 'three.js',  // WRONG
};

// After (correct):
const DEPENDENCY_MAP = {
  'three.js': 'three',     // Correct npm package name
  'Three.js': 'three',     // Handle case variations
};

// When fixing, use the mapped name:
const packageName = DEPENDENCY_MAP[detectedName] || detectedName;
execSync(`npm install ${packageName}@latest`);
```

---

#### Gap 8: Scaffolded Apps Don't Boot Without Upload

**What's the problem?**
When you scaffold a vanilla app, it copies the web app code but the generated `index.html` has embedded `<script id="param-schema">` and `<script id="scad-source">` data that `main.js` never reads. The app still shows "Upload a file" even though the model is embedded.

**Why it matters:**
Scaffolded apps should work immediately without requiring users to re-upload the same model.

**How to fix:**

```javascript
// Option 1: Add auto-load logic to main.js for scaffolded apps

// In src/main.js, add at initialization:
function loadEmbeddedModel() {
  const schemaEl = document.getElementById('param-schema');
  const scadEl = document.getElementById('scad-source');
  
  if (schemaEl && scadEl && schemaEl.textContent.trim()) {
    try {
      const schema = JSON.parse(schemaEl.textContent);
      const scadContent = scadEl.textContent;
      
      // Initialize app with embedded data
      initializeWithModel(schema, scadContent);
      return true;
    } catch (e) {
      console.warn('Failed to load embedded model:', e);
    }
  }
  return false;
}

// Call on DOMContentLoaded
if (!loadEmbeddedModel()) {
  showUploadScreen();  // No embedded model, show upload UI
}
```

---

#### Gap 9: Validate JSON Output Missing `passed` Flag

**What's the problem?**
The CI validation runner expects `{ passed: true/false, results: [...] }` but `validate --format json` outputs a different structure without a `passed` boolean.

**Why it matters:**
CI pipelines using the validation runner will fail to parse results correctly.

**How to fix:**

```javascript
// In cli/commands/validate.js, update JSON output:

// Before:
const jsonOutput = {
  schema: schemaResults,
  files: fileResults,
  accessibility: a11yResults,
};

// After:
const jsonOutput = {
  passed: !hasErrors,  // Add top-level pass/fail
  summary: {
    total: totalChecks,
    passed: passedChecks,
    failed: failedChecks,
  },
  results: {
    schema: schemaResults,
    files: fileResults,
    accessibility: a11yResults,
  },
};
```

---

## Technical Architecture

### System Overview

```
+------------------------------------------------------------------+
|                    BROWSER EXECUTION CONTEXT                      |
+------------------------------------------------------------------+
|                                                                    |
|  MAIN THREAD                                                       |
|  +------------+  +------------+  +------------+  +------------+   |
|  | File       |  | Parameter  |  | 3D Preview |  | Download   |   |
|  | Upload     |  | UI Forms   |  | (Three.js) |  | Manager    |   |
|  +------------+  +------------+  +------------+  +------------+   |
|        |              |               |               |            |
|        +-------+------+-------+-------+---------------+            |
|                |                                                   |
|                v                                                   |
|        +----------------+                                          |
|        | State Manager  |                                          |
|        +----------------+                                          |
|                |  postMessage()                                    |
|                v                                                   |
|  +------------------------------------------------------------+   |
|  |                    WEB WORKER (isolated)                    |   |
|  |                                                              |   |
|  |  +--------------------------------------------------------+ |   |
|  |  |              OpenSCAD WASM Runtime                      | |   |
|  |  |  +----------------+ +---------------+ +---------------+ | |   |
|  |  |  | Parameter      | | Virtual FS    | | STL Export    | | |   |
|  |  |  | Parser         | | (Emscripten)  | | Engine        | | |   |
|  |  |  +----------------+ +---------------+ +---------------+ | |   |
|  |  +--------------------------------------------------------+ |   |
|  |                                                              |   |
|  |  Bundle: ~15-30MB (lazy loaded after page render)            |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **UI Framework** | Vanilla JS (no framework) | Minimal bundle, accessibility-first |
| **Styling** | CSS (custom properties) | No build step, easy theming |
| **3D Preview** | Three.js | Industry standard, STL loader built-in |
| **WASM Runtime** | OpenSCAD WASM | Official builds, well-documented |
| **Worker Isolation** | Web Workers | Prevents UI blocking |
| **State Management** | Vanilla (custom) | Simple state, no Redux needed |
| **Schema Validation** | Ajv | Battle-tested JSON Schema validator |
| **Deployment** | Vercel (static) | Free tier, global CDN |
| **Bundling** | Vite | Fast builds, native ES modules |

### Browser Requirements

| Browser | Minimum Version | Rationale |
|---------|----------------|-----------|
| Chrome | 67+ (2018) | Web Workers, WASM, ES6 modules |
| Firefox | 79+ (2020) | SharedArrayBuffer support |
| Safari | 15.2+ (2021) | Cross-origin isolation support |
| Edge | 79+ (2020) | Chromium-based |

**Required Browser Features**:
- WebAssembly with 512MB+ memory support
- Web Workers
- ES6 modules (import/export)
- File API (FileReader, Blob)
- SharedArrayBuffer (if required by WASM build)
- Cross-origin isolation (for SharedArrayBuffer)

### Progressive Enhancement and Fallbacks

**Feature Detection**:
```javascript
// Check for required features on page load
const hasRequiredFeatures = () => {
  const checks = {
    wasm: typeof WebAssembly !== 'undefined',
    worker: typeof Worker !== 'undefined',
    fileApi: typeof FileReader !== 'undefined',
    modules: 'noModule' in HTMLScriptElement.prototype,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
  
  const missing = Object.entries(checks)
    .filter(([_, supported]) => !supported)
    .map(([feature]) => feature);
  
  return { supported: missing.length === 0, missing };
};

// Check for optional features (used for progressive enhancement)
const hasOptionalFeatures = () => {
  const canvas = document.createElement('canvas');
  return {
    webgl: !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    localStorage: (() => { try { return !!window.localStorage; } catch { return false; } })(),
    dragAndDrop: 'draggable' in document.createElement('div'),
  };
};

// Show clear error if requirements not met
const features = hasRequiredFeatures();
if (!features.supported) {
  showUnsupportedBrowserMessage(features.missing);
}

// Adjust UI based on optional features
const optional = hasOptionalFeatures();
if (!optional.webgl) {
  // Hide 3D preview, show "Preview not available" message
}
```

**Graceful Degradation**:

| Feature | Fallback Strategy |
|---------|------------------|
| **SharedArrayBuffer unavailable** | Try WASM build without SAB (slower), show warning |
| **WebGL unavailable** | Skip 3D preview, show "Preview not available" message |
| **Web Worker fails** | Show error, suggest browser update |
| **File API unavailable** | Show unsupported browser message |
| **localStorage blocked** | URL params still work, just no draft saving |

**Progressive Features**:

| Feature | Baseline | Enhanced |
|---------|----------|----------|
| **3D Preview** | Download only | Three.js preview |
| **Drag-and-drop** | File picker button | + Drag-and-drop zone |
| **Auto-render** | Manual "Generate" button | + Auto-render on param change |
| **Keyboard shortcuts** | Mouse/touch only | + Keyboard shortcuts |
| **Persistence** | None | URL params + localStorage |

**Unsupported Browser Message**:
```html
<div class="unsupported-browser" role="alert">
  <h2>Browser Not Supported</h2>
  <p>This application requires a modern browser with WebAssembly support.</p>
  <p>Please use one of the following:</p>
  <ul>
    <li>Chrome 67 or newer</li>
    <li>Firefox 79 or newer</li>
    <li>Safari 15.2 or newer</li>
    <li>Edge 79 or newer</li>
  </ul>
  <p>Missing features: <strong id="missing-features"></strong></p>
</div>
```

### OpenSCAD WASM Integration

#### Source Options (Validated 2026-01-12)

| Source | Status | Recommendation |
|--------|--------|----------------|
| openscad/openscad-wasm | Official but experimental | **PRIMARY: Use official builds** |
| seasick/openscad-web-gui | GPL-3.0, production-tested | Reference for patterns only |
| openscad/openscad-playground | Active, official-ish | Reference for integration |
| Self-compiled from source | Maximum control | Fallback if official fails |

**Decision (2026-01-12)**: Start with official `openscad/openscad-wasm` builds. These are the most up-to-date and will be maintained by the OpenSCAD team. If blocking issues are found during Phase 1.2, pivot to self-compiled WASM with documented build process.

#### WASM Loading Strategy

```javascript
// Lazy load WASM after initial page render
async function initOpenSCAD() {
  // Show loading indicator
  updateStatus('Loading OpenSCAD engine...');
  
  // Load WASM module (15-30MB) from public/wasm/
  const OpenSCAD = await import('/wasm/openscad.js');
  
  // Initialize with memory limits
  const instance = await OpenSCAD.init({
    TOTAL_MEMORY: 512 * 1024 * 1024,  // 512MB
    ALLOW_MEMORY_GROWTH: true,
    locateFile: (path) => `/wasm/${path}`,
  });
  
  updateStatus('Ready');
  return instance;
}
```

#### Font and Library Support

OpenSCAD's `text()` function requires fonts. The WASM build needs fonts loaded into the virtual filesystem.

**Required Fonts** (minimum for v1):
- Liberation Sans (regular, bold, italic, bold-italic)
- Liberation Mono (for monospace text)

**Virtual FS Setup**:
```javascript
// In Web Worker, after WASM init
function setupVirtualFS(FS) {
  // Create font directory
  FS.mkdir('/fonts');
  
  // Load fonts from public/fonts/
  const fonts = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf',
    'LiberationSans-Italic.ttf',
    'LiberationSans-BoldItalic.ttf',
    'LiberationMono-Regular.ttf',
  ];
  
  for (const font of fonts) {
    const data = await fetch(`/fonts/${font}`).then(r => r.arrayBuffer());
    FS.writeFile(`/fonts/${font}`, new Uint8Array(data));
  }
  
  // Create working directory for .scad files
  FS.mkdir('/work');
}
```

**License Note**: Liberation fonts are SIL Open Font License, compatible with GPL.

#### Worker Communication Protocol

**Note**: The following message formats use TypeScript-style notation for clarity but will be implemented in vanilla JavaScript.

```javascript
// Main thread -> Worker
worker.postMessage({
  type: 'RENDER',
  payload: {
    scadContent: '...',      // .scad file content
    parameters: { ... },      // Parameter overrides
    outputFormat: 'binstl',   // Binary STL
    timeout: 60000,           // 60 second timeout
  }
});

// Worker -> Main thread (progress)
worker.postMessage({
  type: 'PROGRESS',
  payload: { percent: 45, message: 'Rendering geometry...' }
});

// Worker -> Main thread (complete)
worker.postMessage({
  type: 'COMPLETE',
  payload: {
    stl: ArrayBuffer,         // STL data
    stats: { triangles, volume, boundingBox }
  }
});

// Worker -> Main thread (error)
worker.postMessage({
  type: 'ERROR',
  payload: { code: 'TIMEOUT', message: 'Render exceeded 60 seconds' }
});
```

### Performance Optimization

| Optimization | Target | Implementation |
|--------------|--------|----------------|
| **Initial page load** | < 3s on 3G | Defer WASM loading until file uploaded |
| **WASM load time** | < 10s on cable | Show progress bar, lazy load |
| **Parameter change response** | < 100ms | Debounce render trigger (350ms default) |
| **STL generation** | < 30s for typical models | Use OpenSCAD performance flags |
| **Preview render** | < 2s | Three.js with hardware acceleration |
| **Bundle size** | < 200KB (pre-WASM) | Tree-shaking, code splitting |

### Auto-Preview System (v1.2 Feature)

The Auto-Preview system provides progressive enhancement for real-time visual feedback during parameter adjustments.

#### Architecture Overview

```
Parameter Change → Immediate UI Feedback → Debounce Timer (350ms default)
                        ↓                        ↓
              "Changes pending..."        Auto-Preview Render
                                               ↓
                                      Preview STL (adaptive tier)
                                               ↓
                                      3D Preview Update
                                               ↓
                                  "Preview ready (lower quality)"
                                               ↓
                               User clicks "Download STL"
                                               ↓
                                   Full Quality Render
                                               ↓
                                     Download File
```

#### Render Quality Tiers

| Tier | $fn Value | Use Case | Typical Time |
|------|-----------|----------|--------------|
| **Preview** | Adaptive tier caps $fn by complexity/hardware (typ. 8-48) | Auto-render on param change | 2-8s |
| **Full** | User $fn or full-quality presets | Final STL for download | 10-60s |

#### State Machine

```javascript
// Preview States
const PREVIEW_STATE = {
  IDLE: 'idle',              // No file loaded
  CURRENT: 'current',        // Preview matches parameters
  PENDING: 'pending',        // Parameter changed, render scheduled
  RENDERING: 'rendering',    // Preview render in progress
  STALE: 'stale',           // Preview exists but params changed (older STL)
};
```

#### Implementation Pattern

```javascript
class AutoPreviewController {
  constructor(renderController, previewManager, options = {}) {
    this.renderController = renderController;
    this.previewManager = previewManager;
    this.debounceMs = options.debounceMs ?? 350;
    this.previewQuality = options.previewQuality ?? null; // Adaptive tiers can override
    this.enabled = options.enabled ?? true;
    
    this.debounceTimer = null;
    this.previewCache = new Map();  // paramHash -> { stl, stats }
    this.currentParamHash = null;
    this.previewParamHash = null;
    this.state = 'idle';
  }

  // Called when any parameter changes
  onParameterChange(scadContent, parameters) {
    if (!this.enabled) return;
    
    const paramHash = this.hashParams(parameters);
    this.currentParamHash = paramHash;
    
    // Check cache first
    if (this.previewCache.has(paramHash)) {
      this.loadCachedPreview(paramHash);
      return;
    }
    
    // Update state to pending
    this.setState('pending');
    
    // Cancel existing debounce
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    
    // Schedule new preview render
    this.debounceTimer = setTimeout(() => {
      this.renderPreview(scadContent, parameters, paramHash);
    }, this.debounceMs);
  }

  // Render preview with reduced quality
  async renderPreview(scadContent, parameters, paramHash) {
    this.setState('rendering');
    
    // Apply preview quality settings
    const previewParams = { ...parameters };
    if (previewParams.$fn > this.previewFn) {
      previewParams.$fn = this.previewFn;
    }
    
    try {
      const result = await this.renderController.render(
        scadContent, 
        previewParams,
        { timeoutMs: 30000 }  // Shorter timeout for preview
      );
      
      // Cache the result
      this.previewCache.set(paramHash, result);
      this.previewParamHash = paramHash;
      
      // Load into 3D preview
      await this.previewManager.loadSTL(result.stl);
      
      this.setState('current');
    } catch (error) {
      console.error('Preview render failed:', error);
      this.setState('stale');
    }
  }

  // Full quality render for download
  async renderFull(scadContent, parameters) {
    return this.renderController.render(scadContent, parameters, {
      timeoutMs: 60000
    });
  }
}
```

#### UI Indicators

| State | Visual Indicator | Status Message |
|-------|-----------------|----------------|
| `idle` | Placeholder image | "Upload a model to begin" |
| `pending` | Yellow border pulse | "Changes detected - preview updating..." |
| `rendering` | Spinner overlay | "Generating preview..." |
| `current` | Green checkmark badge | "Preview ready" |
| `stale` | Yellow warning badge | "Preview outdated - parameters changed" |

#### Configuration Options

```javascript
// User preferences (stored in localStorage)
const autoPreviewSettings = {
  enabled: true,              // Toggle auto-preview on/off
  debounceMs: 350,            // Default delay before auto-render
  previewQualityMode: 'auto', // Adaptive tiers based on complexity/hardware
  maxCacheSize: 10,           // Max cached preview renders
};
```

#### Benefits of Progressive Enhancement

1. **Immediate feedback**: Users see "pending" state instantly
2. **Faster iteration**: Low-quality preview renders in 2-8s vs 30-60s
3. **Reduced wait time**: Cache hits skip render entirely
4. **Quality control**: Full resolution only when downloading
5. **User control**: Can disable auto-preview if preferred

**OpenSCAD Performance Flags** (pass to WASM):
```javascript
const performanceFlags = [
  '--enable=manifold',      // Faster CSG operations
  '--enable=fast-csg',      // Experimental speedup
  '--enable=lazy-union',    // Defer union operations
];
```

**Render Debouncing**:
- Debounce parameter changes by 350ms (adjustable)
- Show "Generating..." immediately when debounce triggers
- Cancel previous render when new one starts
- Use requestId to ignore stale results

### Parameter Extraction (Runtime)

#### Customizer Annotation Patterns

```javascript
const CUSTOMIZER_PATTERNS = {
  // Group headers: /*[Group Name]*/
  group: /\/\*\s*\[\s*([^\]]+)\s*\]\s*\*\//,
  
  // Parameter with range: name = default; // [min:max] or [min:step:max]
  // NOTE: OpenSCAD variable names may start with '$' (e.g. $fn).
  range: /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);\s*\/\/\s*\[\s*(-?\d+(?:\.\d+)?)\s*(?::\s*(-?\d+(?:\.\d+)?))?\s*:\s*(-?\d+(?:\.\d+)?)\s*\]/,
  
  // Parameter with enum: name = default; // [opt1, opt2, opt3]
  // Enum values may be strings or numbers (e.g. [0,2,4,6]).
  enum: /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);\s*\/\/\s*\[\s*([^\]]+)\s*\]/,
  
  // Parameter with comment: name = default; // Description
  comment: /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);\s*\/\/\s*([^[\n]+)/,
  
  // Bare parameter: name = default;
  bare: /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/,
};
```

**Implementation note for junior devs**: regex-only parsing gets fragile quickly (strings with commas, spaces, etc.).
For v1 MVP, implement a simple **line-based parser**:
- Split file into lines
- Track current group from `/*[Group]*/`
- For each assignment line matching `name = value;`:
  - Detect bracket hint `// [...]` (range or enum)
  - Handle quoted string defaults: `name = "value";` → extract `"value"` then strip quotes
  - For enum hints with strings: `// [opt1, opt2]` or `// ["opt 1", "opt 2"]` → split carefully on commas outside quotes
  - Otherwise treat as "bare parameter" with optional description
- Convert into the internal schema format (see `docs/specs/PARAMETER_SCHEMA_SPEC.md`)

**String Value Parsing**:
```javascript
// Extract default value, handling quotes
function parseDefaultValue(valueStr) {
  const trimmed = valueStr.trim();
  // Check if it's a quoted string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return { type: 'string', value: trimmed.slice(1, -1) };
  }
  // Check if it's a number
  const num = parseFloat(trimmed);
  if (!isNaN(num)) {
    return { type: Number.isInteger(num) ? 'integer' : 'number', value: num };
  }
  // Check for boolean
  if (trimmed === 'true' || trimmed === 'false') {
    return { type: 'boolean', value: trimmed === 'true' };
  }
  // Unquoted string (rare in Customizer, but possible)
  return { type: 'string', value: trimmed };
}
```

### Security Considerations

| Threat | Risk Level | Mitigation |
|--------|-----------|------------|
| **Malicious .scad files** | Medium | Web Worker isolation, timeout enforcement, memory limits |
| **Code injection via parameters** | Low | Parameters are passed as -D flags (OpenSCAD handles escaping) |
| **DoS via infinite loops** | High | 60-second timeout, Web Worker termination |
| **Memory exhaustion** | Medium | WASM memory limit (512MB), warn users of large models |
| **XSS via filenames** | Low | Sanitize filenames before display |
| **Dependency confusion** | Low | No npm package execution from uploaded files |

**Implementation Notes**:
- All OpenSCAD rendering happens in isolated Web Worker (cannot access DOM/localStorage)
- File parsing happens in main thread but with size limits (5MB default)
- No `eval()` or `Function()` constructor usage
- All user-provided strings are escaped before DOM insertion
- WASM sandbox provides additional isolation from system

### Parameter Schema Format

Building on the existing `docs/specs/PARAMETER_SCHEMA_SPEC.md`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Model Name",
  "type": "object",
  "x-forge-version": "1.0.0",
  "x-forge-groups": [
    { "id": "dimensions", "label": "Dimensions", "order": 0 },
    { "id": "options", "label": "Options", "order": 1 }
  ],
  "properties": {
    "width": {
      "type": "integer",
      "default": 50,
      "minimum": 10,
      "maximum": 100,
      "x-forge-group": "dimensions",
      "x-forge-order": 0,
      "x-forge-unit": "mm"
    },
    "include_mount": {
      "type": "string",
      "default": "yes",
      "enum": ["yes", "no"],
      "x-forge-group": "options",
      "x-forge-order": 0,
      "x-forge-render-as": "toggle"
    }
  }
}
```

---

## Implementation Plan

### 0. Repo Bootstrap (Do This First)

This repository is currently **docs-first**. Before implementing Phase 1, create the web app skeleton.

**Required tools**:
- Node.js 18+ LTS
- npm 9+

**Commands (from repo root)**:

```bash
# Create Vite vanilla app in the existing repo folder
# (If prompted about overwriting files, answer "no" for docs/README/LICENSE.)
npm create vite@latest . -- --template vanilla

# Install dependencies
npm install

# Add runtime dependencies
npm install ajv three

# Add development dependencies
npm install --save-dev eslint prettier

# Create basic ESLint config
echo '{"extends": ["eslint:recommended"], "env": {"browser": true, "es2020": true}, "parserOptions": {"ecmaVersion": 2020, "sourceType": "module"}}' > .eslintrc.json

# Create Prettier config
echo '{"semi": true, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5"}' > .prettierrc.json

# Initialize git (if not already a repo)
git init

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
.DS_Store
*.log
.env
.vscode/
.idea/
public/wasm/openscad.*
EOF
```

**Notes**:
- Keep documentation under `docs/` as-is.
- Vite will create/own `index.html` at repo root and the `src/` app code folder.
- `public/` is served at the site root (`/`) and copied to `dist/` unchanged; use it for files you fetch by URL (e.g., `/wasm/...`), not for code you import.
- WASM binaries (`public/wasm/openscad.*`) are gitignored and downloaded via `npm run setup-wasm`; keep only `LICENSE.GPL` and `SOURCE.txt` in `public/wasm/` committed for compliance.

### 1. Repo Layout (Target)

After bootstrap + Phase 1, the repo layout should look like:

```
openscad-web-customizer-forge/
├── index.html
├── src/
│   ├── main.js                 # Entry point; mounts UI
│   ├── styles/
│   │   ├── variables.css       # CSS custom properties (colors, spacing)
│   │   ├── reset.css           # Normalize/reset
│   │   ├── layout.css          # Grid, flexbox, responsive
│   │   ├── components.css      # UI components (buttons, inputs, etc.)
│   │   └── main.css            # Imports all CSS
│   ├── js/
│   │   ├── state.js             # Central store + pub/sub
│   │   ├── upload.js            # Drag/drop + file picker
│   │   ├── parser.js            # OpenSCAD Customizer → internal schema
│   │   ├── schema.js            # Schema normalization + Ajv validation
│   │   ├── ui-generator.js      # Renders form controls from schema
│   │   ├── render-controller.js # Debounce + cancel + worker orchestration
│   │   ├── preview.js           # Three.js preview (P1)
│   │   └── download.js          # Download filename + blob saving
│   └── worker/
│       └── openscad-worker.js   # Web Worker entry
├── public/
│   ├── wasm/                    # OpenSCAD WASM artifacts (downloaded)
│   ├── fonts/                   # Fonts needed for OpenSCAD text()
│   ├── examples/                # Example .scad files + thumbnails
│   └── libraries/               # Library bundles for include/use
├── docs/
├── examples/
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── package.json
├── vite.config.js
└── vercel.json
```

#### Path Guide (Junior-Friendly)

Rule of thumb: `public/` is for files you fetch by URL, `src/` is for code/assets bundled by Vite.

- `public/` is the static root. Vite copies it to `dist/` unchanged, so `/foo/bar.png` works the same in dev and prod.
- `public/wasm/` holds `openscad.js`, `openscad.wasm`, optional `openscad.data`, plus `LICENSE.GPL` and `SOURCE.txt`. Run `npm run setup-wasm` to populate it; commit only the license/source files and keep the large binaries gitignored. The worker loads these via `/wasm/...` (see `locateFile`).
- `public/fonts/` stores TTF files used by OpenSCAD `text()`. The worker fetches `/fonts/<filename>` and copies them into its virtual FS; if you add/remove a font, update both this folder and the font list in `openscad-worker.js`.
- `public/examples/` is the source for the Example Gallery. Each example lives in its own folder and is referenced by URL (`/examples/<slug>/...`) in the `examples` array.
- `public/libraries/` contains library bundles downloaded by `npm run setup-libraries`. Each library folder must include a `manifest.json` listing its `.scad` files; treat this folder as generated and update it via the script.
- `examples/` at repo root is a human-friendly source folder. It is not served by Vite; copy or sync changes into `public/examples/` so the UI can load them.

### CSS Architecture

**Design System (CSS Custom Properties)**:

```css
/* src/styles/variables.css */
:root {
  /* Colors - Light Mode */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666666;
  --color-accent: #0066cc;
  --color-accent-hover: #0052a3;
  --color-success: #28a745;
  --color-error: #dc3545;
  --color-warning: #ffc107;
  --color-border: #d1d1d1;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Typography */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-family-mono: "Consolas", "Monaco", monospace;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.5rem;
  
  /* Borders */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  
  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.15);
  
  /* Focus */
  --focus-ring: 0 0 0 3px rgba(0, 102, 204, 0.3);
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #1a1a1a;
    --color-bg-secondary: #2d2d2d;
    --color-text-primary: #f5f5f5;
    --color-text-secondary: #a0a0a0;
    --color-border: #404040;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Component Naming Convention**: BEM-inspired but simplified
```css
/* Block */
.param-control { }

/* Element */
.param-control__label { }
.param-control__input { }
.param-control__help { }

/* Modifier */
.param-control--disabled { }
.param-control--error { }
```

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 Project Setup

**Deliverables:**
- Create the repo layout above (move Vite-generated code into `src/js/` + `src/styles/`)
- Add `vercel.json` with COOP/COEP headers (see Deployment section)
- Add a simple UI shell: left panel (parameters), right panel (preview/download/status)
- Add a status area implemented as an ARIA live region (`aria-live="polite"`)

#### 1.2 OpenSCAD WASM Worker

**Deliverables:**
- Web Worker setup with message protocol
- WASM lazy loading with progress indicator
- Virtual filesystem setup (fonts, libraries)
- Parameter marshalling to -D flags
- STL export to ArrayBuffer
- Timeout enforcement (60s default)
- Error handling and recovery

**Worker message contracts (must match exactly):**

```javascript
// Main → Worker
// INIT is idempotent; RENDER requires INIT first.
// requestId allows cancelling/ignoring stale renders.
type InitMsg = { type: 'INIT', payload: { wasmBaseUrl: string } };
type RenderMsg = {
  type: 'RENDER',
  payload: {
    requestId: string,
    scadFilename: string,
    scadContent: string,
    parameters: Record<string, unknown>,
    timeoutMs: number,
    outputFormat: 'binstl'
  }
};
type CancelMsg = { type: 'CANCEL', payload: { requestId: string } };

// Worker → Main
type ReadyMsg = { type: 'READY' };
type ProgressMsg = { type: 'PROGRESS', payload: { requestId: string, percent: number, message: string } };
type CompleteMsg = {
  type: 'COMPLETE',
  payload: { requestId: string, stl: ArrayBuffer, stats?: { triangles?: number } }
};
type ErrorMsg = {
  type: 'ERROR',
  payload: { requestId: string, code: 'INIT_FAILED'|'RENDER_FAILED'|'TIMEOUT'|'CANCELLED', message: string, details?: string }
};
```

**Error Handling Strategy**:

| Error Type | User Message | Technical Action |
|------------|-------------|------------------|
| **WASM load failure** | "Failed to load OpenSCAD engine. Please refresh and try again." | Log to console, show retry button |
| **Timeout (60s)** | "This model is taking too long to generate. Try simplifying parameters or reducing detail." | Terminate worker, offer parameter suggestions |
| **Memory exhaustion** | "This model requires too much memory. Try reducing size or complexity." | Catch OOM, terminate worker, suggest limits |
| **Syntax error** | "OpenSCAD reported an error: [error message]. Check your .scad file syntax." | Parse OpenSCAD stderr, highlight line if possible |
| **File too large** | "File exceeds 5MB limit. Please use a smaller model." | Block upload, suggest optimization |
| **Invalid format** | "This doesn't appear to be a valid .scad file. Please check the file type." | Validate file extension and basic structure |
| **Include not found** | "This model uses include/use statements. Multi-file support coming in v1.1!" | Parse includes, show informational message |

**Acceptance Criteria:**
- Can render a simple .scad file with default parameters
- Can override parameters via -D flags
- Returns STL as ArrayBuffer
- Handles timeout gracefully (60s with clear message)
- Reports progress to main thread
- Recovers from errors without page reload
- All error messages are user-friendly (avoid technical jargon)

#### 1.3 File Upload

**Deliverables:**
- Drag-and-drop zone with hover state
- File input fallback (click to browse)
- File type validation (.scad only)
- File size limits (5MB default, configurable)
- Detect `include <...>` / `use <...>` statements and show a **clear v1 limitation warning** (no dependency upload in v1)
- Show file info (name, size) after upload
- "Clear file" button to start over

**Acceptance Criteria:**
- Drag-and-drop works in Chrome, Firefox, Safari, Edge
- File picker works on all platforms including mobile
- Files over 5MB show clear size limit message
- Invalid file types show format error
- Include statements show informational (not error) message

#### 1.4 Download Manager

**Deliverables:**
- STL download with smart filename generation
- Download button with loading states
- File size display before download
- Browser compatibility for download (via Blob API)

**Filename Generation Strategy**:
```javascript
// Format: modelname-hash-YYYYMMDD.stl
// Example: universal_cuff-a3f8b2-20260112.stl
function generateFilename(modelName, parameters) {
  const sanitized = modelName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const hash = shortHash(JSON.stringify(parameters)).substring(0, 6);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `${sanitized}-${hash}-${date}.stl`;
}
```

**Why this format**:
- Model name helps user identify the file
- Hash prevents overwriting different parameter sets
- Date provides temporal sorting
- Length is reasonable (< 50 chars typically)

**Download Implementation**:
```javascript
function downloadSTL(arrayBuffer, filename) {
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Acceptance Criteria:**
- Download button is disabled until STL is generated
- Filename includes model name + parameter hash + date
- File size is displayed before/during download
- Download works in Chrome, Firefox, Safari, Edge
- Blob URL is revoked after download to free memory

### Phase 2: Parameter UI (Week 2-3)

#### 2.1 Parameter Extraction

**Deliverables:**
- Customizer annotation parser
- Group detection
- Range parsing
- Enum parsing
- Yes/no toggle detection
- Comment extraction for help text
- Hidden group filtering

**Acceptance Criteria:**
- Extracts all ~50 parameters from universal cuff example (47 visible + 3 hidden)
- Correctly identifies types (integer, number, string)
- Preserves group ordering
- Handles edge cases (no annotations, malformed)

**Edge cases to support in v1**:
- `$`-prefixed names (e.g. `$fn`) must be parsed and can be marked hidden if in `/*[Hidden]*/`
- Numeric enums (e.g. `internal_grips = 0; // [0,2,4,6]`)
- "Yes/No" enums with either ordering (`[yes, no]` or `[no, yes]`) should render as a toggle by default
- Comments **after** a bracket hint should become `description` (e.g. `// [0:90] degrees`)
- String default values with quotes: `material = "PLA"; // [PLA, ABS, PETG]`
- Negative ranges: `offset = -10; // [-50:50]`
- Floating-point steps: `thickness = 2.5; // [0:0.1:10]`
- Multi-word enum values: `style = "Round Corners"; // [Round Corners, Sharp Edges]`

### Known Limitations and Gotchas

**v1 Limitations** (document clearly for users):

| Limitation | Impact | Workaround | Future |
|------------|--------|------------|--------|
| **No include/use support** | Can't use multi-file projects | Single-file models only | v1.1: ZIP upload |
| **No library imports** | Can't use MCAD, etc. | Inline required functions | v1.1: Bundle common libs |
| **No file operations** | Can't read external data | Hardcode data in .scad | v1.2: Virtual FS API |
| **Limited fonts** | text() limited to Liberation | Use provided fonts only | v1.1: More fonts |
| **60-second timeout** | Complex models may fail | Simplify or reduce $fn | Configurable in v1.1 |
| **512MB memory limit** | Very large models OOM | Reduce complexity | Warn user earlier |

**OpenSCAD Compatibility Notes**:
- WASM version may lag behind desktop OpenSCAD (document version in UI)
- Some experimental features may not be available
- Performance flags (manifold, fast-csg) may behave differently
- Floating-point precision may differ slightly from desktop

**Browser Quirks**:
- Safari: May need specific WASM build (check compatibility)
- Firefox: SharedArrayBuffer disabled in private mode
- Mobile browsers: May have lower memory limits (256MB)
- iOS Safari: File picker UX is different (system modal)

**Parameter Parsing Gotchas**:
```javascript
// VALID: Standard Customizer patterns
width = 50; // [10:100]
style = "round"; // [round, square, hex]

// VALID: OpenSCAD supports but harder to parse
width=50;//[10:100]  // No spaces
width = 50 ; // [ 10 : 100 ] // Lots of spaces

// INVALID: Will fall back to "bare parameter"
width = 50; /* [10:100] */  // Block comment instead of line comment
width = 50; // [10,100]  // Comma instead of colon

// TRICKY: String values with special characters
name = "test"; // [test, "test 2", test-3]  // Quotes optional but recommended
```

**Development Gotchas**:
- WASM files must be served with correct MIME type (`application/wasm`)
- SharedArrayBuffer requires secure context (HTTPS or localhost)
- Worker scripts must be same-origin
- Large WASM files may timeout on slow connections (show progress)
- Vite dev server has different behavior than production build (test both)

#### 2.2 UI Generation

**Deliverables:**
- Schema-driven form rendering
- Collapsible group sections
- Range slider component
- Number input component
- Select dropdown component
- Toggle switch component
- Help tooltip component
- Unit display
- Reset to defaults button

**Acceptance Criteria:**
- Renders all parameter types correctly
- Sliders respect min/max/step
- Number inputs validate on blur and show error for out-of-range values
- Number inputs allow direct typing and support increment/decrement via keyboard (arrow keys)
- Selects show all enum options
- Toggles work for yes/no enums
- All inputs are keyboard accessible
- Screen readers can navigate form
- Tab order follows visual layout (top-to-bottom, left-to-right within groups)

**UI Component Specifications**:

| Component | HTML Pattern | Accessibility | Styling |
|-----------|-------------|---------------|---------|
| **Range Slider** | `<input type="range">` + display value | Label, aria-valuemin/max/now | Custom track/thumb with CSS |
| **Number Input** | `<input type="number">` | Label, min/max/step attributes | Clear increment buttons |
| **Select Dropdown** | `<select>` with `<option>` | Label, first option is default | Custom arrow icon optional |
| **Toggle Switch** | `<input type="checkbox">` + custom style | Label, role="switch" for SR | Visible on/off states |
| **Group Section** | `<details><summary>` | Native keyboard, expanded state | Custom chevron icon |
| **Help Tooltip** | `<button>` + `aria-describedby` | Focusable, ESC to close | Positioned absolute |

**Example: Range Slider Implementation**:
```html
<div class="param-control">
  <label for="param-width">
    Width
    <span class="param-unit">mm</span>
  </label>
  <div class="slider-container">
    <input 
      type="range" 
      id="param-width" 
      min="10" 
      max="100" 
      step="1" 
      value="50"
      aria-valuemin="10"
      aria-valuemax="100"
      aria-valuenow="50"
      aria-valuetext="50 millimeters"
    />
    <output for="param-width" class="slider-value">50</output>
  </div>
  <button 
    class="param-help" 
    aria-label="Help for Width parameter"
    aria-describedby="help-width"
  >?</button>
  <div id="help-width" role="tooltip" hidden>
    Controls the width of the base. Recommended: 40-60mm.
  </div>
</div>
```

**A11y implementation checklist (minimum)**:
- Every input has a visible `<label>` and is programmatically associated via `for`/`id`
- Group sections use native `<details><summary>` for built-in keyboard support
- Status/progress updates go to a single live region (debounce to avoid spamming screen readers)
- Errors are announced via `aria-live="assertive"` region and shown visually near controls
- Focus management: after error, focus moves to first invalid control
- All colors meet WCAG AA contrast (4.5:1 for text, 3:1 for UI)
- Focus indicators are visible (2px outline minimum, not relying on browser default)

#### 2.3 State Management

**Deliverables:**
- Centralized state store with pub/sub pattern
- Parameter value tracking with dirty state
- URL serialization (hash params)
- State persistence (URL + optional localStorage)
- Undo/redo capability (P2)

**State Structure**:
```javascript
const state = {
  // File
  uploadedFile: { name: 'model.scad', content: '...', size: 12345 },
  
  // Schema
  schema: { /* extracted parameter schema */ },
  
  // Current values
  parameters: { width: 50, height: 100, /* ... */ },
  
  // Defaults (for reset)
  defaults: { width: 50, height: 100, /* ... */ },
  
  // Render state
  rendering: false,
  renderProgress: 0,
  lastRenderTime: null,
  
  // Output
  stl: ArrayBuffer | null,
  stlStats: { triangles: 1234, size: 56789 },
  
  // UI state
  expandedGroups: ['dimensions', 'options'],
  error: null,
};
```

**State Management Pattern**:
```javascript
// Simple pub/sub without external dependencies
class StateManager {
  constructor(initialState) {
    this.state = initialState;
    this.subscribers = [];
  }
  
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }
  
  setState(updates) {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };
    this.subscribers.forEach(cb => cb(this.state, prevState));
    this.syncToURL();
  }
  
  getState() {
    return this.state;
  }
  
  syncToURL() {
    // Debounced URL update with only non-default parameters
  }
}
```

**URL format (v1)**:
- Use URL hash (no server needed): `#v=1&params=<encoded>`
- `params` is `encodeURIComponent(JSON.stringify(values))`
- Only include non-default values to keep URLs short
- Practical maximum ~8KB (modern browsers support much more, but keep URLs shareable)
- URL params are validated against the schema; invalid enums are ignored and numeric values are clamped to min/max

**URL Serialization Example**:
```
// Before: All parameters
{ width: 50, height: 100, color: "red", enabled: true }

// After: Only non-default values
{ color: "red" }  // if width=50, height=100, enabled=true are defaults

// URL: https://example.com/#v=1&params=%7B%22color%22%3A%22red%22%7D
```

### Phase 3: Polish and Deploy (Week 4-5)

#### 3.1 3D Preview

**Deliverables:**
- Three.js integration
- STLLoader for generated output
- OrbitControls (rotate, zoom, pan)
- Default lighting setup
- Auto-fit camera to model
- Loading/generating state indicator

#### 3.2 Accessibility Audit

**Deliverables:**
- Keyboard navigation testing
- Screen reader testing (NVDA, VoiceOver)
- Color contrast verification
- Focus indicator styling
- ARIA labels and live regions
- Reduced motion support

**Testing Tools**:
- Lighthouse (Accessibility score 90+)
- axe DevTools
- NVDA (Windows)
- VoiceOver (macOS/iOS)
- Manual keyboard-only navigation
- Color contrast analyzer

#### 3.3 Testing Strategy

**Unit Tests** (Optional for v1):
- Parameter parser with edge cases
- Schema validator
- URL serialization/deserialization

**Integration Tests** (Manual for v1):
- File upload flow
- Parameter extraction from example models
- STL generation with various parameter combinations
- Error handling (timeout, invalid files, memory errors)
- Browser compatibility testing

**Test Cases** (Minimum for v1):
1. Upload universal cuff → verify all parameters extracted
2. Adjust 3 different parameter types → generate STL → verify download
3. Test with invalid .scad file → verify error message
4. Test with 5MB+ file → verify size limit warning
5. Test timeout with complex model → verify 60s timeout message
6. Keyboard-only navigation through entire flow
7. Screen reader announcement verification
8. Mobile device testing (iOS Safari, Android Chrome)

#### 3.4 Deployment

**Deliverables:**
- Vercel configuration
- COOP/COEP headers for SharedArrayBuffer
- Asset optimization
- CDN caching strategy
- Error monitoring setup

**COOP/COEP requirement**:
OpenSCAD WASM builds may require `SharedArrayBuffer`, which requires cross-origin isolation.
Add headers in `vercel.json`:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

**Vercel Configuration** (`vercel.json`):

The rewrites rule ensures URL hash-based state works when users refresh or share deep links. All routes serve `index.html`, which then reads the hash to restore state.

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Resource-Policy",
          "value": "cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Production Diagnostics (No Analytics by Default)

This program is designed for **standalone use** (upload → customize → render → download). We do **not** require or recommend analytics for the core product.

If you want diagnostics to help debug bugs, keep it **local-first**:
- Prefer **console logs** and a “Copy diagnostics” button (user-initiated)
- Do not collect or transmit file contents or model parameters by default

**Optional local metrics (no tracking)**:

| Metric | Purpose | Storage |
|--------|---------|---------|
| **File upload success/failure** | Detect common upload issues | In-memory (session) |
| **Average render time** | Performance baseline for the user’s device | In-memory (session) |
| **Render success/failure** | Detect timeouts/OOM frequency | In-memory (session) |
| **Error frequency by type** | Help categorize failures | In-memory (session) |

**Error Logging** (Local-First):
```javascript
// Log errors without PII
function logError(error) {
  // Only in production
  if (process.env.NODE_ENV !== 'production') return;
  
  // Sanitize error (remove file content, user data)
  const sanitized = {
    type: error.code || error.name,
    message: error.message,
    timestamp: Date.now(),
    browser: navigator.userAgent.split(' ')[0], // Just browser name
    // DO NOT LOG: file content, parameter values, user IP
  };
  
  // Default behavior: local console only.
  // If you later add an endpoint, require explicit opt-in and keep payloads minimal.
  console.error('Production Error:', sanitized);
}
```

**Performance Monitoring**:
```javascript
// Track key user timings
performance.mark('upload-start');
// ... upload happens ...
performance.mark('upload-end');
performance.measure('upload-duration', 'upload-start', 'upload-end');

// Log aggregate performance data (no PII)
const perfData = performance.getEntriesByType('measure');
```

**Health Check Endpoint** (optional, via Vercel serverless function):
```javascript
// api/health.js - Simple health check
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
```

**Privacy Considerations**:
- **Never log**: .scad file content, parameter values, IP addresses, user identifiers
- **Only log**: error types, performance metrics, browser names (not full UA)
- **Opt-in only**: If adding any tracking, make it opt-in with clear disclosure
- **GDPR compliance**: No personal data = no GDPR issues
- **Cookie-free**: Use localStorage or URL params only (no tracking cookies)

---

## Reference Implementations

### Validated Projects (2026-01-12)

#### 1. seasick/openscad-web-gui

**URL**: https://github.com/seasick/openscad-web-gui

**License**: GPL-3.0

**What We Can Learn**:
- Worker setup patterns
- Virtual FS initialization (fonts)
- Parameter marshalling to -D flags
- Performance flags (manifold, fast-csg, lazy-union)

**What We Should NOT Copy**:
- GPL code directly (reimplement patterns instead)
- Their specific UI

#### 2. openscad/openscad-playground

**URL**: https://github.com/openscad/openscad-playground

**What We Can Learn**:
- Message protocol for worker communication
- BrowserFS mounting patterns
- Exception handling from callMain

#### 3. Legacy Web Customizers (concept reference)

**What We Can Learn**:
- User flow (upload → customize → download)
- Parameter grouping and UI patterns
- Beginner-friendly guidance approach

**What's Different**:
- Many legacy tools use server-side rendering (we use client-side)
- Many legacy tools are proprietary (we're open source)

### Notes on Referencing Third-Party Products (Trademarks)

This project may discuss other tools as **inspiration**. To reduce legal/trademark risk:
- Prefer **generic descriptions** (“commercial parametric model maker”, “web customizer”) over naming specific products.
- If a name is included, use it **only for identification** (not branding), do not use logos, and include a clear “not affiliated / not endorsed” disclaimer.
- Because we do not need any specific commercial product names to implement this project, it is **best to leave brand names out of public-facing docs**.

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|------------|--------|------------|-------|
| **WASM bundle size (15-30MB)** | High | Medium | Lazy load after page render; show progress; HTTP cache; CDN | 1.2 |
| **Browser compatibility** | Medium | High | Target Chrome 67+, Firefox 79+, Safari 15.2+; show unsupported message | 1.1 |
| **Memory exhaustion** | Medium | Medium | 512MB WASM limit; detect OOM; clear error; suggest simplification | 1.2 |
| **Render timeout** | High | Medium | 60s timeout; terminate worker; suggest optimization; allow retry | 1.2 |
| **Parameter parsing edge cases** | High | Medium | Comprehensive test suite; graceful degradation; "bare parameter" fallback | 2.1 |
| **SharedArrayBuffer unavailable** | Low | High | Detect COOP/COEP; fallback to slower WASM build if possible; clear error | 1.2 |
| **Include/use dependencies** | Medium | Low | Detect statements; show v1 limitation message; document v1.1 ZIP support | 1.3 |
| **OpenSCAD version drift** | Low | Medium | Pin WASM version; document build date; test before updates | 1.2 |

### User Experience Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|------------|--------|------------|-------|
| **Long initial load** | High | High | Progress indicator; "Loading..." message; defer WASM load | 1.2 |
| **Complex models fail** | Medium | High | Timeout handling; memory limit detection; suggest simplification | 1.2 |
| **Confusing parameter names** | High | Medium | Extract comments as help text; group parameters; show units | 2.2 |
| **Mobile performance** | Medium | Medium | Test on real devices; show desktop-recommended message; ensure usable | 3.3 |
| **Cryptic OpenSCAD errors** | High | High | Parse common errors; translate to user-friendly messages; link to docs | 2.3 |
| **Lost work on refresh** | Medium | Medium | URL hash persistence; browser localStorage for drafts (P1) | 2.3 |
| **Accessibility barriers** | Low | High | WCAG 2.1 AA compliance; test with screen readers; keyboard navigation | 3.2 |

### Mitigation Priorities

**P0 (Must Have for v1)**:
- WASM lazy loading with progress
- Timeout handling with clear errors
- Parameter parsing fallback
- Keyboard accessibility
- Mobile usability (even if not optimized)

**P1 (Should Have for v1)**:
- Browser compatibility detection
- Error message translation
- URL persistence
- Memory limit warnings

**P2 (Nice to Have for v1.1)**:
- Include/use support
- localStorage persistence
- Advanced error parsing

---

## Success Metrics

### v1 Launch Criteria (MVP)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Core functionality | 100% | Can upload, customize, download STL |
| Example works | 100% | Universal cuff renders correctly |
| Parameter extraction | 95%+ | Correctly extracts most params |
| Accessibility | WCAG 2.1 AA | Lighthouse score 90+ |
| Performance | Under 10s | Time from param change to preview |
| Browser support | Chrome, Firefox, Safari, Edge | Manual testing |

---

## Licensing

### This Repository

**License**: GPL-3.0-or-later

**Why GPL**:
- Simplifies compliance with OpenSCAD WASM (GPL)
- Allows reuse of patterns from GPL reference implementations
- Ensures generated apps remain open source

### Generated Output

When users generate STL files, those STL files are:
- **Not GPL-licensed** (data output, not derived work)
- **Owned by the user** (their model, their parameters)

### Compliance Requirements

```
webapp/
├── LICENSE                    # GPL-3.0-or-later
├── THIRD_PARTY_NOTICES.md     # Attribution
├── SOURCE_OFFER.md            # How to obtain source
└── public/
    └── wasm/
        ├── openscad.wasm
        ├── LICENSE.GPL        # OpenSCAD license
        └── SOURCE.txt         # Version + build info
```

---

## Development Environment

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ LTS | Build tooling |
| npm | 9+ | Package management |
| Git | 2.30+ | Version control |

### Setup

```bash
# Clone repository
git clone https://github.com/YOUR_ORG/openscad-web-customizer-forge.git
cd openscad-web-customizer-forge

# Install dependencies
npm install

# Download OpenSCAD WASM (one-time setup)
npm run setup-wasm

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Vercel
vercel --prod
```

### Build Configuration

**package.json Scripts**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "setup-wasm": "node scripts/download-wasm.js",
    "lint": "eslint src/",
    "format": "prettier --write src/",
    "test": "echo 'Tests coming in Phase 3'",
    "check-a11y": "lighthouse http://localhost:5173 --only-categories=accessibility --quiet"
  }
}
```

**vite.config.js**:
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'ajv': ['ajv'],
        },
      },
    },
  },
  server: {
    port: 5173,
    headers: {
      // Required for SharedArrayBuffer in development
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['openscad-wasm'], // If we vendor WASM
  },
});
```

**scripts/download-wasm.js** (to be created):
```javascript
// Downloads OpenSCAD WASM artifacts to public/wasm/
// This script will:
// 0. Ensure public/wasm/ and public/fonts/ directories exist
// 1. Fetch latest release from https://github.com/openscad/openscad-wasm/releases
//    or use openscad-playground's CDN as fallback
// 2. Extract required files (openscad.js, openscad.wasm, openscad.data if needed)
// 3. Verify integrity with checksums (publish known-good checksums in repo)
// 4. Place in public/wasm/ directory (served at /wasm in the browser)
// 5. Create SOURCE.txt with version info and download date
// 6. Download Liberation fonts to public/fonts/ if not present
//
// Usage: node scripts/download-wasm.js [--version=<tag>]
// Default: latest release
//
// Note: WASM files are ~15-30MB and gitignored. Each developer runs this once.
```

### Development Workflow

**Daily Development**:
1. `npm run dev` - Start dev server
2. Edit files in `src/` - Hot reload automatically
3. Test in browser at http://localhost:5173
4. Check console for errors/warnings

**Before Committing**:
1. `npm run lint` - Check for code issues
2. `npm run format` - Format code consistently
3. Test in multiple browsers (Chrome, Firefox, Safari)
4. Check accessibility with Lighthouse

**Before Deploying**:
1. `npm run build` - Create production build
2. `npm run preview` - Test production build locally
3. `npm run check-a11y` - Verify accessibility score
4. Manual testing of all features
5. Check bundle size (dist/ folder should be < 500KB excluding WASM)

### Debugging Tips

**WASM Issues**:
- Check browser console for detailed WASM errors
- Verify COOP/COEP headers are set (check Network tab)
- Check if SharedArrayBuffer is available: `typeof SharedArrayBuffer !== 'undefined'`
- Use `openscad --version` output from WASM to verify version

**Worker Issues**:
- Use `console.log()` in worker (appears in browser console)
- Use browser DevTools' dedicated Worker inspector
- Add message logging to track communication
- Verify worker script is loaded (Network tab)

**Performance Profiling**:
- Use Chrome DevTools Performance tab
- Record during STL generation to find bottlenecks
- Check memory usage (Memory tab)
- Use Lighthouse for overall performance audit

---

## Open Questions

### Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| v1 scope | Web app (not CLI) | Faster user value |
| License | GPL-3.0-or-later | OpenSCAD WASM compatibility |
| UI framework | Vanilla JS | Minimal deps, accessibility |
| Deployment | Vercel | Free, static hosting |

### Resolved for v1

| Question | Decision | Rationale |
|----------|----------|-----------|
| Include file support | Warn only (v1), ZIP upload (v1.1) | Simplifies MVP, covers 80% of use cases |
| WASM source | Official openscad/openscad-wasm | Maintained by upstream, latest features |
| 3D preview | Optional (P1 feature) | Core value is STL generation, preview enhances UX |
| Mobile support | Warning message | Desktop-primary for v1, mobile tested but not optimized |

### Pending (Decide During Implementation)

| Question | Options | Decision Point | Recommended Default |
|----------|---------|----------------|---------------------|
| WASM memory strategy | (a) Fixed 512MB (b) Growth allowed | Phase 1.2 | (b) Growth allowed with 512MB initial |
| Error message i18n | (a) English only (b) Multi-language | Phase 2.2 | (a) English only for v1 |
| Analytics/telemetry | (a) None (b) Local-first diagnostics (c) Remote telemetry | Phase 3.4 | (a) None (standalone-first) |
| Preview LOD strategy | (a) Vertex limit (b) Decimation (c) None | Phase 3.1 | (a) Vertex limit with warning |

**Decision Process**: Use the recommended defaults unless technical constraints discovered during implementation suggest otherwise. Document any deviations in the changelog.

---

## Recommendations and Gap Analysis

### Identified Gaps

| Gap | Description | Recommendation |
|-----|-------------|----------------|
| **WASM source not finalized** | Need to decide on OpenSCAD WASM artifact source | Test openscad-playground's approach first |
| **Include/use support** | Many .scad files use includes | v1.1: Support ZIP upload with dependencies |
| **Font support** | OpenSCAD needs fonts for text() | Bundle Liberation Sans in public/fonts/ |
| **Library support** | MCAD and other libraries | v1.1: Allow library ZIP upload |
| **Error messages** | OpenSCAD errors are cryptic | Translate common errors to user-friendly messages |
| **Preview performance** | Large STLs may lag Three.js | Implement LOD or vertex limit warning |
| **Offline support** | Users may want offline use | v1.1: Service worker for PWA |

### Example Models Strategy

**v1 MVP Examples**:
1. **Universal Cuff** (included) - Demonstrates complex grouping, many parameters
2. **Simple Box** (create) - Minimal example for testing (3 params: width, height, depth)
3. **Parametric Cylinder** (create) - Demonstrates step values ($fn parameter)

**Example Model Requirements**:
- Must have Customizer annotations
- Must render in < 10 seconds on average hardware
- Must have helpful parameter descriptions
- Must demonstrate different UI control types
- Must be useful (not just a demo)
- Must have clear licensing (GPL-compatible, public domain like CC0, or permissive like MIT)

**Example Loading**:
```javascript
const examples = [
  {
    name: 'Universal Cuff',
    description: 'Assistive device holder',
    path: '/examples/universal-cuff/universal_cuff_utensil_holder.scad',
    thumbnail: '/examples/universal-cuff/thumbnail.png',
    author: 'Volksswitch',
    license: 'CC0-1.0',  // Public domain
  },
  // ... more examples
];
```

**Where these files live**:
- `path` and `thumbnail` are **URL paths**, not disk paths. They must start with `/examples/...` so the browser can fetch them.
- Put the files under `public/examples/...` so the URL works in both dev and prod (`public/` is copied to `dist/`).
- Example: `public/examples/universal-cuff/universal_cuff_utensil_holder.scad` maps to `/examples/universal-cuff/universal_cuff_utensil_holder.scad`.

**Adding a new example (junior-friendly)**:
1. Pick a `<slug>`: lowercase, hyphen-separated, no spaces (e.g., `parametric-cylinder`).
2. Create `public/examples/<slug>/`.
3. Add your model file(s): `<slug>.scad` plus any `modules/` or `utils/` subfolders your model includes.
4. Add a `thumbnail.png` next to the `.scad` file (use a placeholder if needed).
5. Add an entry to the `examples` array using URL paths like `/examples/<slug>/<slug>.scad` and `/examples/<slug>/thumbnail.png`.
6. Optional: copy the same folder into `examples/<slug>/` if you want a clean source folder to edit, then re-copy to `public/examples/` before testing.

**Common gotcha**: `include`/`use` paths are relative to the entry `.scad` file. Keep the same folder structure under `public/examples/<slug>/` that your model expects.

### Additional Recommendations

1. **Performance Budget**: Set hard limits on initial bundle size (<200KB before WASM)
2. **Feedback Loop**: Add "Report Issue" button linking to GitHub Issues with template (optional)
4. **Example Gallery**: Curate 5-10 high-quality example models beyond universal cuff (see strategy above)
6. **Mobile-First Testing**: Test on real devices early and often (minimum: iOS Safari, Android Chrome)
7. **Progressive Web App**: Consider PWA manifest for "Add to Home Screen" capability (v1.1)
8. **Offline Support**: Service worker for offline use after first load (v1.1)
9. **Diagnostics Export**: Add a “Copy diagnostics” button that includes non-PII render logs/errors (user-initiated)
10. **Documentation**: Inline help for first-time users ("First time? Click here for a tour")
11. **Keyboard Shortcuts**: Add shortcuts for power users (Ctrl+Enter to render, R to reset, etc.)
12. **Dark Mode**: Respect `prefers-color-scheme` media query (P1 feature)

---

## Recommended Additions (Code Audit v2.2 - 2026-01-14)

This section documents findings from a code audit against the build plan. **v2 CLI commands and templates exist**, but several v2.0–v2.2 deliverables are **only partially implemented** (notably YAML export, parity validation/STL comparison, template-aware validation, and some auto-fix behaviors).

### Glossary (Terms Used in This Section)

| Term | Definition |
|------|------------|
| **APG** | ARIA Authoring Practices Guide — W3C documentation with accessibility patterns for common UI components |
| **AT** | Assistive Technology — software/hardware that helps users with disabilities (e.g., screen readers, magnifiers) |
| **Golden Fixtures** | Pre-saved "known good" test outputs used for comparison; if new output differs, tests fail |
| **LOD** | Level of Detail — technique to reduce 3D model complexity for better performance |
| **LRU** | Least Recently Used — cache eviction strategy that removes oldest unused entries first |
| **ROI** | Return on Investment — here meaning "high value relative to effort required" |
| **SAB** | SharedArrayBuffer — browser API required for multi-threaded WASM; needs special HTTP headers |
| **SR** | Screen Reader — assistive technology that reads screen content aloud (e.g., NVDA, VoiceOver, JAWS) |

### Audit Verdict (v2.0–v2.2)

| Milestone | Status | Evidence | Notes / Gaps |
|----------|--------|----------|--------------|
| **v2.0 (extract + scaffold)** | Partial | `bin/openscad-forge.js`, `cli/commands/extract.js`, `cli/commands/scaffold.js` | `extract --format yaml` is advertised but exits with “not yet implemented”. |
| **v2.1 (validation harness + theme + CI helpers)** | Partial | `cli/commands/validate.js`, `cli/commands/theme.js`, `cli/commands/ci.js` | `validate --ref/--tolerance` flags are present but not used; validation is mostly static checks. |
| **v2.2 (auto-sync + golden fixtures + extra templates)** | Partial | `cli/commands/sync.js`, `cli/templates/{react,vue,svelte}/` | `validate` is not template-aware; “golden fixtures” compare parameter JSON only (no STL/geometry parity). `sync` has at least one auto-fix mapping bug (three.js → three). |

### Critical Issues (Should Fix Before Release)

> **Note**: Previous critical issues (debug logging in production, version string mismatches in main.js and sw.js) were all fixed in v2.3.0.

| Issue | Severity | Location | Description | Recommended Action |
|-------|----------|----------|-------------|-------------------|
| **Fonts not bundled for `text()`** | MEDIUM | `public/fonts/` | Liberation fonts needed for OpenSCAD `text()` function | Implement v2.4 Font Bundle task below |

#### v2.4 Task: Font Bundle Implementation

**Problem**: OpenSCAD's `text()` function requires fonts mounted in the virtual filesystem. Without fonts, models using `text()` will fail or render incorrectly.

**Recommended Implementation**:

1. **Add font download to `scripts/download-wasm.js`**:

```javascript
// Add to scripts/download-wasm.js

const LIBERATION_FONTS_URL = 'https://github.com/liberationfonts/liberation-fonts/releases/download/2.1.5/liberation-fonts-ttf-2.1.5.tar.gz';
const REQUIRED_FONTS = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationSans-Italic.ttf',
  'LiberationMono-Regular.ttf'
];

async function downloadFonts() {
  const fontsDir = path.join('public', 'fonts');
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }
  
  // Check if fonts already exist
  const existingFonts = REQUIRED_FONTS.filter(f => 
    fs.existsSync(path.join(fontsDir, f))
  );
  if (existingFonts.length === REQUIRED_FONTS.length) {
    console.log('✓ Fonts already downloaded');
    return;
  }
  
  console.log('Downloading Liberation fonts...');
  // Download, extract tar.gz, copy TTF files to public/fonts/
  // ... implementation details
  console.log('✓ Fonts downloaded to public/fonts/');
}
```

2. **Update `scripts/download-wasm.js` to call font download**:

```javascript
// At end of download-wasm.js
await downloadFonts();
```

3. **Mount fonts in worker (`src/worker/openscad-worker.js`)**:

```javascript
// In initializeOpenSCAD() after WASM init

async function mountFonts(FS) {
  const fontPath = '/usr/share/fonts/truetype/liberation';
  FS.createPath('/', 'usr/share/fonts/truetype/liberation', true, true);
  
  const fonts = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf', 
    'LiberationSans-Italic.ttf',
    'LiberationMono-Regular.ttf'
  ];
  
  for (const font of fonts) {
    try {
      const response = await fetch(`/fonts/${font}`);
      if (response.ok) {
        const data = new Uint8Array(await response.arrayBuffer());
        FS.writeFile(`${fontPath}/${font}`, data);
      }
    } catch (e) {
      console.warn(`Font ${font} not available:`, e.message);
    }
  }
}
```

4. **Add to `.gitignore`**:

```
public/fonts/*.ttf
```

5. **Update npm scripts in `package.json`**:

```json
{
  "scripts": {
    "setup": "npm run setup-wasm && npm run setup-libraries",
    "setup-wasm": "node scripts/download-wasm.js"
  }
}
```

**Acceptance Criteria**:
- [ ] `npm run setup-wasm` downloads fonts automatically
- [ ] Fonts are gitignored (not committed to repo)
- [ ] Worker mounts fonts on initialization
- [ ] Models using `text()` render correctly
- [ ] Graceful fallback if fonts unavailable (warning, not crash)

**License**: Liberation fonts are SIL Open Font License 1.1 (compatible with GPL).

### Incomplete P1/P2 Features

| Feature | Priority | Status | Build Plan Reference | Recommendation |
|---------|----------|--------|---------------------|----------------|
| **Help Tooltips** | P1 | ✅ Implemented (v2.5.0) | [Parameter UI table](#2-parameter-ui) — "Help tooltips" row | Click-to-toggle tooltips for parameters with descriptions |
| **Cancel Generation Button** | P1 | ✅ Implemented (v2.5.0) | [STL Generation table](#3-stl-generation) — "Cancel generation" row | Visible cancel button during rendering with elapsed time display |
| **Unit Display** | P1 | ✅ Implemented (v2.5.0) | [Parameter UI table](#2-parameter-ui) — "Unit display" row | Units extracted from descriptions/names, displayed next to sliders |
| **Dependency Visibility** | P2 | ✅ Implemented (v2.6.0) | [Parameter UI table](#2-parameter-ui) — "Dependency visibility" row | Hide/show parameters based on other param values using @depends(param==value) syntax |
| **Undo/Redo** | P2 | ✅ Implemented (v2.6.0) | [Nice-to-haves section](#33-undoredo-parameter-editing-history) | 50-level parameter history with Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts |
| **Preview LOD (Level of Detail)** | P2 | ✅ Implemented (v2.6.0) | [Open Questions table](#pending-decide-during-implementation) — "Preview LOD strategy" row | Warns users about large meshes (>100K vertices) with dismiss option |

### Implementation Guide: P1 Features

#### Feature: Help Tooltips (P1)

**Goal**: Add help tooltips for each parameter based on inline comments.

**Design**:
```
[Parameter Label] [?]
+------------------------+
| Slider or other input  |
+------------------------+

When user clicks [?]:
+----------------------------------+
| Tooltip popup                    |
|----------------------------------|
| The width of the main body.      |
| Larger values create wider       |
| models. Recommended: 30-80mm.    |
+----------------------------------+
```

**Implementation** (`src/js/ui-generator.js`):

```javascript
function createParameterControl(param, value) {
  const container = document.createElement('div')
  container.className = 'param-control'
  
  // Label with help icon
  const labelContainer = document.createElement('div')
  labelContainer.className = 'param-label-container'
  
  const label = document.createElement('label')
  label.textContent = formatParameterName(param.name)
  label.htmlFor = `param-${param.name}`
  
  // Help tooltip icon (if description exists)
  if (param.description) {
    const helpIcon = createHelpIcon(param)
    labelContainer.appendChild(label)
    labelContainer.appendChild(helpIcon)
  } else {
    labelContainer.appendChild(label)
  }
  
  container.appendChild(labelContainer)
  
  // Create input control
  const input = createInput(param, value)
  container.appendChild(input)
  
  return container
}

function createHelpIcon(param) {
  const button = document.createElement('button')
  button.className = 'param-help-button'
  button.type = 'button'
  button.setAttribute('aria-label', `Help for ${param.name}`)
  button.innerHTML = '?'
  
  // Create tooltip element
  const tooltip = document.createElement('div')
  tooltip.className = 'param-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.id = `tooltip-${param.name}`
  tooltip.textContent = param.description
  
  // Initially hidden
  tooltip.style.display = 'none'
  
  // Toggle tooltip on click
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const isVisible = tooltip.style.display === 'block'
    
    // Hide all other tooltips
    document.querySelectorAll('.param-tooltip').forEach(t => {
      t.style.display = 'none'
    })
    
    // Toggle this tooltip
    tooltip.style.display = isVisible ? 'none' : 'block'
    
    // Update ARIA
    button.setAttribute('aria-expanded', !isVisible)
  })
  
  // Close tooltip when clicking outside
  document.addEventListener('click', (e) => {
    if (!button.contains(e.target) && !tooltip.contains(e.target)) {
      tooltip.style.display = 'none'
      button.setAttribute('aria-expanded', 'false')
    }
  })
  
  // Keyboard support: Escape to close
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tooltip.style.display === 'block') {
      tooltip.style.display = 'none'
      button.setAttribute('aria-expanded', 'false')
      button.focus()
    }
  })
  
  const wrapper = document.createElement('div')
  wrapper.className = 'param-help-wrapper'
  wrapper.appendChild(button)
  wrapper.appendChild(tooltip)
  
  return wrapper
}
```

**CSS** (`src/styles/components.css`):

```css
/* Help tooltip styles */
.param-label-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.param-help-wrapper {
  position: relative;
  display: inline-block;
}

.param-help-button {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  border: none;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.param-help-button:hover {
  background: var(--color-primary-hover);
}

.param-help-button:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.param-help-button[aria-expanded="true"] {
  background: var(--color-primary-active);
}

.param-tooltip {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  padding: 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 300px;
  width: max-content;
  min-width: 200px;
  z-index: 1000;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

/* Arrow pointing to help button */
.param-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 10px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid var(--color-border);
}

.param-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 11px;
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--color-bg-elevated);
}

/* Mobile: full-width tooltips */
@media (max-width: 768px) {
  .param-tooltip {
    position: fixed;
    left: 16px;
    right: 16px;
    width: auto;
    max-width: none;
  }
  
  .param-tooltip::before,
  .param-tooltip::after {
    display: none;
  }
}

/* High contrast mode enhancements */
[data-high-contrast="true"] .param-help-button {
  border: 2px solid white;
}

[data-high-contrast="true"] .param-tooltip {
  border-width: 2px;
}
```

**Acceptance Criteria**:
- [ ] Help icon (?) appears next to parameters with descriptions
- [ ] Clicking icon shows tooltip with parameter description
- [ ] Clicking outside tooltip closes it
- [ ] Escape key closes tooltip
- [ ] Only one tooltip visible at a time
- [ ] Tooltip accessible via keyboard (Tab → Enter)
- [ ] Tooltip has proper ARIA attributes
- [ ] Tooltip readable in light/dark/high contrast modes
- [ ] Tooltip positions correctly on mobile (doesn't overflow screen)
- [ ] Lighthouse accessibility score remains 90+

---

#### Feature: Cancel Generation Button (P1)

**Goal**: Add visible "Cancel" button during rendering with immediate feedback.

**Current State**: `RenderController.cancel()` exists but no UI button.

**Design**:
```
+----------------------------------+
|  Generating STL...               |
|  Progress: 45% (23s elapsed)     |
|                                  |
|  [████████░░░░░░░░░░] 45%       |
|                                  |
|  [Cancel Generation]             |
+----------------------------------+
```

**Implementation** (`src/js/render-controller.js`):

```javascript
class RenderController {
  constructor() {
    this.currentRenderId = null
    this.cancelRequested = false
    this.renderStartTime = null
  }
  
  async render(scadContent, parameters, options = {}) {
    // Generate unique render ID
    this.currentRenderId = `render-${Date.now()}`
    this.cancelRequested = false
    this.renderStartTime = Date.now()
    
    // Show cancel button
    this.showCancelButton()
    
    try {
      const result = await this.sendWorkerMessage({
        type: 'render',
        id: this.currentRenderId,
        scadContent,
        parameters,
        options
      })
      
      // Check if cancelled during render
      if (this.cancelRequested) {
        throw new Error('Render cancelled by user')
      }
      
      return result
      
    } catch (err) {
      if (err.message.includes('cancelled')) {
        this.showNotification('Render cancelled', 'info')
      }
      throw err
      
    } finally {
      this.hideCancelButton()
      this.currentRenderId = null
    }
  }
  
  cancel() {
    if (!this.currentRenderId) {
      console.warn('No active render to cancel')
      return
    }
    
    this.cancelRequested = true
    
    // Send cancel message to worker
    this.worker.postMessage({
      type: 'cancel',
      renderId: this.currentRenderId
    })
    
    // Update UI immediately
    this.updateStatus('Cancelling...')
    this.hideCancelButton()
    
    console.log(`Cancelling render ${this.currentRenderId}`)
  }
  
  showCancelButton() {
    const cancelButton = document.getElementById('cancel-render-btn')
    if (cancelButton) {
      cancelButton.style.display = 'inline-flex'
      cancelButton.disabled = false
    }
  }
  
  hideCancelButton() {
    const cancelButton = document.getElementById('cancel-render-btn')
    if (cancelButton) {
      cancelButton.style.display = 'none'
    }
  }
}
```

**UI Update** (`index.html`):

```html
<!-- In actions section -->
<div class="actions">
  <button id="generate-btn" class="btn btn-primary">
    Generate STL
  </button>
  
  <button id="cancel-render-btn" class="btn btn-secondary" style="display: none;">
    <span class="icon">✕</span>
    Cancel
  </button>
  
  <button id="download-btn" class="btn btn-success" style="display: none;">
    <span class="icon">⬇</span>
    Download STL
  </button>
</div>

<!-- Status area -->
<div id="render-status" class="render-status">
  <div class="status-text">Ready</div>
  <div class="progress-bar-container" style="display: none;">
    <div class="progress-bar" id="render-progress-bar"></div>
  </div>
  <div class="elapsed-time" id="elapsed-time" style="display: none;">
    Elapsed: <span id="elapsed-time-value">0s</span>
  </div>
</div>
```

**Event Handler** (`src/main.js`):

```javascript
// Cancel button
const cancelBtn = document.getElementById('cancel-render-btn')
if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    renderController.cancel()
  })
}

// Update elapsed time during render
let elapsedTimer = null

function startElapsedTimer() {
  const elapsedEl = document.getElementById('elapsed-time')
  const valueEl = document.getElementById('elapsed-time-value')
  
  if (elapsedEl) elapsedEl.style.display = 'block'
  
  const startTime = Date.now()
  
  elapsedTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    if (valueEl) valueEl.textContent = `${elapsed}s`
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  
  const elapsedEl = document.getElementById('elapsed-time')
  if (elapsedEl) elapsedEl.style.display = 'none'
}

// Call in render lifecycle
async function handleGenerate() {
  startElapsedTimer()
  
  try {
    await renderController.render(scadContent, parameters)
  } finally {
    stopElapsedTimer()
  }
}
```

**CSS** (`src/styles/components.css`):

```css
.render-status {
  margin: 16px 0;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.status-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background: var(--color-bg);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
  width: 0%;
}

.elapsed-time {
  font-size: 13px;
  color: var(--color-text-secondary);
}

#cancel-render-btn {
  background: var(--color-danger);
  animation: pulse-danger 2s infinite;
}

#cancel-render-btn:hover {
  background: var(--color-danger-hover);
}

@keyframes pulse-danger {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

/* Reduced motion: disable pulse animation */
@media (prefers-reduced-motion: reduce) {
  #cancel-render-btn {
    animation: none;
  }
}
```

**Worker: Handle Cancel** (`src/worker/openscad-worker.js`):

```javascript
let currentRenderId = null

self.addEventListener('message', async (e) => {
  if (e.data.type === 'render') {
    currentRenderId = e.data.id
    
    try {
      // Render with periodic cancellation checks
      const result = await renderWithCancellation(e.data)
      
      self.postMessage({
        type: 'render-complete',
        id: e.data.id,
        result
      })
      
    } catch (err) {
      self.postMessage({
        type: 'render-error',
        id: e.data.id,
        error: err.message
      })
    } finally {
      currentRenderId = null
    }
  }
  
  if (e.data.type === 'cancel') {
    if (currentRenderId === e.data.renderId) {
      // Set flag for OpenSCAD to check
      self.Module.cancelRequested = true
      console.log(`Cancellation requested for ${e.data.renderId}`)
    }
  }
})

async function renderWithCancellation(data) {
  // Reset cancel flag
  self.Module.cancelRequested = false
  
  // Call OpenSCAD render
  // Note: OpenSCAD WASM may not support mid-render cancellation
  // In that case, we can only cancel queued renders, not active ones
  
  const result = self.Module.render(data.scadContent, data.parameters)
  
  // Check if cancelled
  if (self.Module.cancelRequested) {
    throw new Error('Render cancelled during processing')
  }
  
  return result
}
```

**Acceptance Criteria**:
- [ ] Cancel button appears during rendering
- [ ] Cancel button hidden when not rendering
- [ ] Clicking cancel stops render immediately (or within 1-2s)
- [ ] Cancelled render shows "Render cancelled" message
- [ ] Elapsed time shown during render
- [ ] Elapsed time hidden after render completes/cancels
- [ ] Cancel button accessible via keyboard
- [ ] Cancel button has proper ARIA labels
- [ ] Cancel button works in all themes (light/dark/high contrast)
- [ ] Multiple rapid clicks on cancel handled gracefully

---

#### Feature: Unit Display (P1)

**Goal**: Show units (mm, degrees, etc.) next to parameter inputs.

**Challenge**: OpenSCAD comments don't have standard unit notation.

**Approach**: Parse unit hints from comments or parameter names.

**Examples**:
```scad
width = 50;          // [10:100]  Width in mm
angle = 45;          // [0:90]    Rotation angle (degrees)
wall_thickness = 2;  // [1:5]     mm
```

**Heuristics**:
- If comment contains "mm", "millimeters" → unit: "mm"
- If comment contains "deg", "degrees" → unit: "°"
- If comment contains "cm", "centimeters" → unit: "cm"
- If name contains "angle", "rotation" → unit: "°"
- If name contains "thickness", "height", "width", "depth" → unit: "mm" (default)

**Implementation** (`src/js/parser.js`):

```javascript
function extractUnit(param) {
  const comment = param.comment || ''
  const name = param.name.toLowerCase()
  
  // Explicit units in comment
  const unitPatterns = [
    { regex: /\b(mm|millimeters?)\b/i, unit: 'mm' },
    { regex: /\b(cm|centimeters?)\b/i, unit: 'cm' },
    { regex: /\b(deg|degrees?|°)\b/i, unit: '°' },
    { regex: /\b(in|inches?)\b/i, unit: 'in' },
    { regex: /\b(%|percent)\b/i, unit: '%' },
  ]
  
  for (const { regex, unit } of unitPatterns) {
    if (regex.test(comment)) {
      return unit
    }
  }
  
  // Infer from parameter name
  if (/angle|rotation|twist/i.test(name)) {
    return '°'
  }
  
  if (/width|height|depth|thickness|diameter|radius|length|size/i.test(name)) {
    return 'mm'
  }
  
  // No unit detected
  return null
}

function parseParameters(scadContent) {
  // ... existing parsing logic ...
  
  for (const param of parameters) {
    if (param.type === 'number') {
      param.unit = extractUnit(param)
    }
  }
  
  return { groups, parameters }
}
```

**UI Update** (`src/js/ui-generator.js`):

```javascript
function createNumberInput(param, value) {
  const container = document.createElement('div')
  container.className = 'number-input-container'
  
  const input = document.createElement('input')
  input.type = 'number'
  input.name = param.name
  input.value = value
  input.min = param.min
  input.max = param.max
  input.step = param.step || 1
  input.setAttribute('aria-label', `${formatParameterName(param.name)}${param.unit ? ` in ${param.unit}` : ''}`)
  
  container.appendChild(input)
  
  // Add unit label if present
  if (param.unit) {
    const unitLabel = document.createElement('span')
    unitLabel.className = 'unit-label'
    unitLabel.textContent = param.unit
    unitLabel.setAttribute('aria-hidden', 'true') // Decorative, already in aria-label
    container.appendChild(unitLabel)
  }
  
  return container
}

function createRangeSlider(param, value) {
  const container = document.createElement('div')
  container.className = 'range-slider-container'
  
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.name = param.name
  slider.value = value
  slider.min = param.min
  slider.max = param.max
  slider.step = param.step || 1
  slider.setAttribute('aria-label', `${formatParameterName(param.name)}${param.unit ? ` in ${param.unit}` : ''}`)
  
  const valueDisplay = document.createElement('span')
  valueDisplay.className = 'range-value'
  valueDisplay.textContent = param.unit ? `${value} ${param.unit}` : value
  
  slider.addEventListener('input', () => {
    valueDisplay.textContent = param.unit ? `${slider.value} ${param.unit}` : slider.value
  })
  
  container.appendChild(slider)
  container.appendChild(valueDisplay)
  
  return container
}
```

**CSS** (`src/styles/components.css`):

```css
.number-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.number-input-container input[type="number"] {
  flex: 1;
}

.unit-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: 30px;
  text-align: left;
}

.range-value {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
  min-width: 60px;
  text-align: right;
}

/* High contrast mode */
[data-high-contrast="true"] .unit-label,
[data-high-contrast="true"] .range-value {
  font-weight: 600;
}
```

**Acceptance Criteria**:
- [ ] Units extracted from comments (mm, cm, °, %, in)
- [ ] Units inferred from parameter names (angle → °, width → mm)
- [ ] Units displayed next to number inputs
- [ ] Units displayed in slider value labels
- [ ] Units included in ARIA labels
- [ ] Units readable in light/dark/high contrast modes
- [ ] Works with all example models
- [ ] Parameters without units work correctly (no unit shown)

---

### Implementation Guide: P2 Features

#### Feature: Dependency Visibility (P2)

**Goal**: Show/hide parameters based on other parameter values.

**Use Case Example**:
```scad
/*[Options]*/
include_lid = "yes";  // [yes, no]

/*[Lid Settings]*/
lid_height = 10;      // [5:20]  Only show if include_lid=yes
lid_thickness = 2;    // [1:5]   Only show if include_lid=yes
```

**Specification Format**: Use special comment syntax to define dependencies.

```scad
// Option 1: Inline dependency notation
lid_height = 10;  // [5:20] @depends(include_lid==yes)

// Option 2: Separate annotation
// @show-if: include_lid==yes
lid_height = 10;  // [5:20]

// Option 3: JSON-like
lid_height = 10;  // [5:20] {"depends": {"include_lid": "yes"}}
```

**Recommended**: Option 1 (inline with `@depends`) for simplicity.

**Parser Implementation** (`src/js/parser.js`):

```javascript
function parseDependency(comment) {
  // Match: @depends(param_name==value) or @depends(param_name!=value)
  const dependsMatch = comment.match(/@depends\(([a-zA-Z_]\w*)\s*(==|!=)\s*(\w+)\)/i)
  
  if (dependsMatch) {
    return {
      parameter: dependsMatch[1],
      operator: dependsMatch[2],
      value: dependsMatch[3]
    }
  }
  
  return null
}

function parseParameters(scadContent) {
  // ... existing parsing ...
  
  for (const param of parameters) {
    const dependency = parseDependency(param.comment || '')
    if (dependency) {
      param.dependency = dependency
    }
  }
  
  return { groups, parameters }
}
```

**UI Implementation** (`src/js/ui-generator.js`):

```javascript
function createParameterControl(param, value) {
  const container = document.createElement('div')
  container.className = 'param-control'
  container.dataset.paramName = param.name
  
  // Store dependency info as data attribute
  if (param.dependency) {
    container.dataset.depends = param.dependency.parameter
    container.dataset.dependsOperator = param.dependency.operator
    container.dataset.dependsValue = param.dependency.value
    
    // Initially hide if dependency not met
    if (!checkDependency(param.dependency, getCurrentParameters())) {
      container.style.display = 'none'
      container.setAttribute('aria-hidden', 'true')
    }
  }
  
  // ... rest of control creation ...
  
  return container
}

function checkDependency(dependency, currentParams) {
  const actualValue = String(currentParams[dependency.parameter])
  const expectedValue = dependency.value
  
  if (dependency.operator === '==') {
    return actualValue === expectedValue
  } else if (dependency.operator === '!=') {
    return actualValue !== expectedValue
  }
  
  return true
}

function updateDependentParameters(changedParam, newValue) {
  // Find all parameters that depend on changedParam
  const allControls = document.querySelectorAll('.param-control[data-depends]')
  
  allControls.forEach(control => {
    const dependsOn = control.dataset.depends
    
    if (dependsOn === changedParam) {
      const operator = control.dataset.dependsOperator
      const expectedValue = control.dataset.dependsValue
      const actualValue = String(newValue)
      
      let shouldShow = false
      if (operator === '==') {
        shouldShow = actualValue === expectedValue
      } else if (operator === '!=') {
        shouldShow = actualValue !== expectedValue
      }
      
      if (shouldShow) {
        control.style.display = ''
        control.setAttribute('aria-hidden', 'false')
        
        // Announce to screen readers
        announceChange(`${control.dataset.paramName} is now visible`)
      } else {
        control.style.display = 'none'
        control.setAttribute('aria-hidden', 'true')
        
        announceChange(`${control.dataset.paramName} is now hidden`)
      }
    }
  })
}

function announceChange(message) {
  const liveRegion = document.getElementById('sr-live-region')
  if (liveRegion) {
    liveRegion.textContent = message
  }
}
```

**State Integration** (`src/js/state.js`):

```javascript
class AppState {
  updateParameter(name, value) {
    this.state.parameters[name] = value
    
    // Update dependent parameters visibility
    updateDependentParameters(name, value)
    
    // Notify listeners
    this.notifyListeners()
  }
}
```

**Advanced: Complex Dependencies**

For complex scenarios, support logical operators:

```scad
// AND condition
handle_position = 10;  // @depends(include_handle==yes && handle_style==custom)

// OR condition
detail_level = 3;  // @depends(quality==high || quality==ultra)

// Numeric comparisons
max_angle = 90;  // @depends(use_limits==yes && base_angle>45)
```

**Parser for Complex Dependencies**:

```javascript
function parseComplexDependency(comment) {
  // Match complex expressions
  const complexMatch = comment.match(/@depends\((.*?)\)/i)
  
  if (complexMatch) {
    const expr = complexMatch[1]
    
    // Parse into AST (Abstract Syntax Tree)
    // For v2.5+, use a simple expression parser
    // For now, support simple cases only
    
    return {
      type: 'complex',
      expression: expr
    }
  }
  
  return null
}

function evaluateComplexDependency(expression, params) {
  // Safe evaluation (no eval() - security risk!)
  // Build simple evaluator for: ==, !=, &&, ||, >, <, >=, <=
  
  // For v2.5+ feature
  return true
}
```

**CSS** (`src/styles/components.css`):

```css
/* Smooth transitions for show/hide */
.param-control {
  transition: opacity 0.3s ease, max-height 0.3s ease;
  overflow: hidden;
}

.param-control[aria-hidden="true"] {
  opacity: 0;
  max-height: 0;
  margin: 0;
  padding: 0;
}

/* Reduced motion: instant show/hide */
@media (prefers-reduced-motion: reduce) {
  .param-control {
    transition: none;
  }
}
```

**Acceptance Criteria**:
- [ ] Parser recognizes `@depends(param==value)` syntax
- [ ] Parser recognizes `@depends(param!=value)` syntax
- [ ] Dependent parameters hidden when condition not met
- [ ] Dependent parameters shown when condition met
- [ ] Smooth transitions for show/hide (respects prefers-reduced-motion)
- [ ] Screen reader announcements when parameters show/hide
- [ ] Keyboard navigation skips hidden parameters
- [ ] Hidden parameter values not included in render (or use defaults)
- [ ] Works with all parameter types (range, enum, boolean)
- [ ] Documentation added with examples

---

#### Feature: Undo/Redo (P2)

**Goal**: Allow users to undo/redo parameter changes.

**UI**:
```
+----------------------------------+
| Actions:                         |
| [↶ Undo] [↷ Redo]               |
+----------------------------------+

Keyboard shortcuts:
- Ctrl/Cmd+Z: Undo
- Ctrl/Cmd+Shift+Z: Redo
```

**Architecture**:

```javascript
class ParameterHistory {
  constructor() {
    this.history = []      // Array of states
    this.currentIndex = -1 // Current position in history
    this.maxSize = 50      // Maximum history size
  }
  
  push(state) {
    // Remove any "future" states if we're in the middle of history
    this.history = this.history.slice(0, this.currentIndex + 1)
    
    // Add new state
    this.history.push(this.cloneState(state))
    this.currentIndex++
    
    // Enforce max size
    if (this.history.length > this.maxSize) {
      this.history.shift()
      this.currentIndex--
    }
  }
  
  undo() {
    if (!this.canUndo()) return null
    
    this.currentIndex--
    return this.cloneState(this.history[this.currentIndex])
  }
  
  redo() {
    if (!this.canRedo()) return null
    
    this.currentIndex++
    return this.cloneState(this.history[this.currentIndex])
  }
  
  canUndo() {
    return this.currentIndex > 0
  }
  
  canRedo() {
    return this.currentIndex < this.history.length - 1
  }
  
  cloneState(state) {
    return JSON.parse(JSON.stringify(state))
  }
  
  clear() {
    this.history = []
    this.currentIndex = -1
  }
  
  getStats() {
    return {
      total: this.history.length,
      current: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    }
  }
}
```

**Integration with State Management** (`src/js/state.js`):

```javascript
class AppState {
  constructor() {
    this.state = { /* ... */ }
    this.listeners = []
    this.history = new ParameterHistory()
    this.isUndoRedo = false // Flag to prevent adding undo/redo to history
  }
  
  updateParameter(name, value) {
    // Don't record history during undo/redo operations
    if (!this.isUndoRedo) {
      // Save current state to history before changing
      this.history.push(this.state.parameters)
    }
    
    this.state.parameters[name] = value
    this.notifyListeners()
    this.updateUndoRedoButtons()
  }
  
  undo() {
    const previousState = this.history.undo()
    if (previousState) {
      this.isUndoRedo = true
      
      // Restore previous state
      this.state.parameters = previousState
      
      // Update UI
      this.restoreParametersToUI(previousState)
      this.notifyListeners()
      this.updateUndoRedoButtons()
      
      // Announce to screen readers
      const changedParam = this.findChangedParameter(previousState)
      this.announceChange(`Undid: ${changedParam.name} → ${changedParam.value}`)
      
      this.isUndoRedo = false
    }
  }
  
  redo() {
    const nextState = this.history.redo()
    if (nextState) {
      this.isUndoRedo = true
      
      this.state.parameters = nextState
      this.restoreParametersToUI(nextState)
      this.notifyListeners()
      this.updateUndoRedoButtons()
      
      const changedParam = this.findChangedParameter(nextState)
      this.announceChange(`Redid: ${changedParam.name} → ${changedParam.value}`)
      
      this.isUndoRedo = false
    }
  }
  
  restoreParametersToUI(parameters) {
    Object.entries(parameters).forEach(([name, value]) => {
      const input = document.querySelector(`[name="${name}"]`)
      if (input) {
        input.value = value
        
        // Update range slider display if applicable
        const valueDisplay = input.parentElement.querySelector('.range-value')
        if (valueDisplay) {
          valueDisplay.textContent = value
        }
      }
    })
  }
  
  findChangedParameter(newState) {
    // Compare with current state to find what changed
    for (const [name, value] of Object.entries(newState)) {
      if (this.state.parameters[name] !== value) {
        return { name, value }
      }
    }
    return { name: 'unknown', value: '' }
  }
  
  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn')
    const redoBtn = document.getElementById('redo-btn')
    const stats = this.history.getStats()
    
    if (undoBtn) {
      undoBtn.disabled = !stats.canUndo
      undoBtn.setAttribute('aria-label', 
        stats.canUndo ? 'Undo parameter change' : 'Nothing to undo'
      )
    }
    
    if (redoBtn) {
      redoBtn.disabled = !stats.canRedo
      redoBtn.setAttribute('aria-label',
        stats.canRedo ? 'Redo parameter change' : 'Nothing to redo'
      )
    }
  }
}
```

**UI Implementation** (`index.html`):

```html
<!-- Add to parameter panel header -->
<div class="param-panel-header">
  <h2>Parameters</h2>
  
  <div class="param-actions">
    <button id="undo-btn" class="btn-icon" disabled 
            aria-label="Undo parameter change" 
            title="Undo (Ctrl/Cmd+Z)">
      <span class="icon">↶</span>
    </button>
    
    <button id="redo-btn" class="btn-icon" disabled 
            aria-label="Redo parameter change" 
            title="Redo (Ctrl/Cmd+Shift+Z)">
      <span class="icon">↷</span>
    </button>
    
    <button id="reset-btn" class="btn-icon" 
            aria-label="Reset all parameters" 
            title="Reset (R)">
      <span class="icon">⟲</span>
    </button>
  </div>
</div>
```

**Event Handlers** (`src/main.js`):

```javascript
// Undo/Redo buttons
document.getElementById('undo-btn')?.addEventListener('click', () => {
  appState.undo()
})

document.getElementById('redo-btn')?.addEventListener('click', () => {
  appState.redo()
})

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Undo: Ctrl/Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    appState.undo()
  }
  
  // Redo: Ctrl/Cmd+Shift+Z
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
    e.preventDefault()
    appState.redo()
  }
})
```

**Disable During Rendering**:

```javascript
// Disable undo/redo during rendering to prevent state mismatches
function disableHistoryDuringRender() {
  const undoBtn = document.getElementById('undo-btn')
  const redoBtn = document.getElementById('redo-btn')
  
  undoBtn.disabled = true
  redoBtn.disabled = true
  
  undoBtn.title = 'Cannot undo during rendering'
  redoBtn.title = 'Cannot redo during rendering'
}

function enableHistoryAfterRender() {
  appState.updateUndoRedoButtons()
  
  const undoBtn = document.getElementById('undo-btn')
  const redoBtn = document.getElementById('redo-btn')
  
  undoBtn.title = 'Undo (Ctrl/Cmd+Z)'
  redoBtn.title = 'Redo (Ctrl/Cmd+Shift+Z)'
}

// Call in render lifecycle
renderController.on('render-start', disableHistoryDuringRender)
renderController.on('render-complete', enableHistoryAfterRender)
renderController.on('render-error', enableHistoryAfterRender)
```

**CSS** (`src/styles/components.css`):

```css
.param-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 16px;
}

.param-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
}

.btn-icon:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* High contrast mode */
[data-high-contrast="true"] .btn-icon {
  border-width: 2px;
}

[data-high-contrast="true"] .btn-icon:disabled {
  opacity: 0.3;
  border-style: dashed;
}
```

**Acceptance Criteria**:
- [ ] History tracks up to 50 parameter changes
- [ ] Undo button enabled when history available
- [ ] Redo button enabled when future states available
- [ ] Undo restores previous parameter values
- [ ] Redo restores next parameter values
- [ ] UI updates to reflect undo/redo changes
- [ ] Ctrl/Cmd+Z triggers undo
- [ ] Ctrl/Cmd+Shift+Z triggers redo
- [ ] Screen reader announces undo/redo actions
- [ ] Undo/redo disabled during rendering
- [ ] History cleared on new file upload
- [ ] History survives preset load (loads become undoable)
- [ ] Multiple rapid undo/redo handled correctly

---

#### Feature: Preview LOD (Level of Detail) (P2)

**Goal**: Warn users about large STL files and offer decimation/simplification.

**Problem**: Large, high-detail models (100K+ vertices) can cause:
- Slow Three.js rendering
- Browser freezing
- Poor mobile performance

**Solution**: Detect large meshes and offer simplification.

**Implementation** (`src/js/preview.js`):

```javascript
class PreviewManager {
  constructor() {
    this.vertexLimit = 50000  // Warn above 50K vertices
    this.autoSimplify = true
  }
  
  async loadSTL(stlData, metadata = {}) {
    const geometry = this.parseSTL(stlData)
    const vertexCount = geometry.attributes.position.count
    
    console.log(`STL loaded: ${vertexCount} vertices`)
    
    // Check if simplification needed
    if (vertexCount > this.vertexLimit) {
      this.showLODWarning(vertexCount)
      
      if (this.autoSimplify) {
        geometry = await this.simplifyGeometry(geometry)
      }
    }
    
    // Create mesh and add to scene
    this.displayGeometry(geometry)
  }
  
  showLODWarning(vertexCount) {
    const warningDiv = document.createElement('div')
    warningDiv.className = 'lod-warning'
    warningDiv.innerHTML = `
      <div class="warning-header">
        <span class="icon">⚠️</span>
        <strong>Large Model Detected</strong>
      </div>
      <p>
        This model has ${vertexCount.toLocaleString()} vertices.
        Preview may be slow on some devices.
      </p>
      <div class="warning-actions">
        <button id="simplify-preview-btn" class="btn btn-small">
          Simplify Preview
        </button>
        <button id="dismiss-lod-warning-btn" class="btn btn-small btn-secondary">
          Show Anyway
        </button>
      </div>
    `
    
    const container = document.getElementById('preview-container')
    container.appendChild(warningDiv)
    
    // Event handlers
    document.getElementById('simplify-preview-btn')?.addEventListener('click', () => {
      this.autoSimplify = true
      warningDiv.remove()
      this.reloadPreview()
    })
    
    document.getElementById('dismiss-lod-warning-btn')?.addEventListener('click', () => {
      this.autoSimplify = false
      warningDiv.remove()
    })
  }
  
  async simplifyGeometry(geometry) {
    console.log('Simplifying geometry...')
    
    // Option 1: Simple vertex decimation
    // Reduce to target vertex count (e.g., 50% reduction)
    const targetCount = Math.floor(geometry.attributes.position.count * 0.5)
    
    // Use SimplifyModifier from Three.js examples
    // Note: Requires importing THREE.SimplifyModifier
    
    // For MVP, just show warning without automatic simplification
    // Full implementation in v2.5+
    
    return geometry
  }
  
  displayGeometry(geometry) {
    // Clear existing mesh
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
    }
    
    // Create new mesh
    const material = new THREE.MeshPhongMaterial({
      color: 0x3b82f6,
      specular: 0x111111,
      shininess: 200
    })
    
    this.mesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.mesh)
    
    // Center and fit camera
    this.fitCameraToObject()
    
    // Monitor performance
    this.monitorFPS()
  }
  
  monitorFPS() {
    let lastTime = performance.now()
    let frames = 0
    let fps = 60
    
    const measureFPS = () => {
      frames++
      const now = performance.now()
      
      if (now >= lastTime + 1000) {
        fps = Math.round((frames * 1000) / (now - lastTime))
        frames = 0
        lastTime = now
        
        // Warn if FPS too low
        if (fps < 15) {
          this.showPerformanceWarning(fps)
        }
      }
      
      requestAnimationFrame(measureFPS)
    }
    
    requestAnimationFrame(measureFPS)
  }
  
  showPerformanceWarning(fps) {
    const warning = `
      ⚠️ 3D preview running slowly (${fps} FPS).
      Consider simplifying your model or disabling auto-preview.
    `
    console.warn(warning)
    this.showNotification(warning, 'warning')
  }
}
```

**Settings for Auto-Simplify** (`index.html`):

```html
<!-- In Advanced menu or Settings -->
<div class="setting">
  <label>
    <input type="checkbox" id="auto-simplify-preview" checked>
    Auto-simplify large models in preview
  </label>
  <p class="setting-description">
    Reduces vertex count for models with more than 50,000 vertices.
    Does not affect downloaded STL.
  </p>
</div>
```

**localStorage Persistence** (`src/main.js`):

```javascript
// Load setting
const autoSimplify = localStorage.getItem('auto-simplify-preview') !== 'false'
previewManager.autoSimplify = autoSimplify

// Save setting
document.getElementById('auto-simplify-preview')?.addEventListener('change', (e) => {
  localStorage.setItem('auto-simplify-preview', e.target.checked)
  previewManager.autoSimplify = e.target.checked
})
```

**CSS** (`src/styles/components.css`):

```css
.lod-warning {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-warning);
  border-radius: 8px;
  padding: 20px;
  max-width: 400px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.warning-header .icon {
  font-size: 24px;
}

.warning-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn-small {
  padding: 8px 16px;
  font-size: 14px;
}
```

**For v2.5+: Actual Mesh Simplification**

Use Three.js SimplifyModifier or integrate external library:

```bash
npm install three-simplify-modifier
```

```javascript
import { SimplifyModifier } from 'three-simplify-modifier'

async function simplifyGeometry(geometry) {
  const modifier = new SimplifyModifier()
  const targetVertexCount = Math.floor(geometry.attributes.position.count * 0.5)
  
  const simplified = modifier.modify(geometry, targetVertexCount)
  
  console.log(`Simplified: ${geometry.attributes.position.count} → ${simplified.attributes.position.count}`)
  
  return simplified
}
```

**Acceptance Criteria**:
- [ ] Vertex count detected on STL load
- [ ] Warning shown for models > 50K vertices
- [ ] User can choose to simplify or show anyway
- [ ] FPS monitored during preview
- [ ] Performance warning shown if FPS < 15
- [ ] Auto-simplify setting persisted to localStorage
- [ ] Downloaded STL always full quality (simplification only affects preview)
- [ ] Warning accessible (keyboard navigation, screen reader)
- [ ] Warning dismissible (X button or Escape key)

---

### GitHub Actions CI/CD Configuration

**Goal**: Automate testing, building, and deployment with GitHub Actions.

**Workflows to Create**:

1. **CI (Continuous Integration)**: Run tests on every push/PR
2. **CD (Continuous Deployment)**: Deploy to Vercel on main branch
3. **Release**: Create GitHub releases with changelogs

#### Workflow 1: CI (Testing)

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint
      
      - name: Check code formatting
        run: npm run format:check
  
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:coverage
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-unit
      
      - name: Check coverage thresholds
        run: |
          COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "::error::Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
  
  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
  
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Download fonts
        run: npm run setup-fonts
      
      - name: Build project
        run: npm run build
      
      - name: Check build size
        run: |
          SIZE=$(du -sh dist/ | cut -f1)
          echo "::notice::Build size: $SIZE"
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
          retention-days: 7
  
  accessibility:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps chromium
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: dist
          path: dist/
      
      - name: Run accessibility tests
        run: npm run test:a11y
      
      - name: Upload accessibility report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: a11y-report
          path: a11y-report/
          retention-days: 30
```

**Add NPM Scripts** (`package.json`):

```json
{
  "scripts": {
    "lint": "eslint src/ --ext .js",
    "format:check": "prettier --check 'src/**/*.{js,css,html}'",
    "format": "prettier --write 'src/**/*.{js,css,html}'",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:a11y": "playwright test tests/e2e/accessibility.spec.js"
  }
}
```

---

#### Workflow 2: Deploy to Vercel

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [ main ]
  workflow_dispatch:  # Allow manual triggers

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install Vercel CLI
        run: npm install -g vercel@latest
      
      - name: Pull Vercel environment information
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Build project artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy to Vercel
        id: deploy
        run: |
          URL=$(vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }})
          echo "url=$URL" >> $GITHUB_OUTPUT
          echo "::notice::Deployed to $URL"
      
      - name: Run smoke tests on production
        run: |
          curl -f ${{ steps.deploy.outputs.url }} || exit 1
          echo "✅ Production deployment accessible"
      
      - name: Comment on PR (if applicable)
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `✅ Deployed to Vercel: ${{ steps.deploy.outputs.url }}`
            })
```

**Required Secrets** (Add to GitHub repository settings):

- `VERCEL_TOKEN`: Generate at https://vercel.com/account/tokens
- `VERCEL_ORG_ID`: Find in `.vercel/project.json`
- `VERCEL_PROJECT_ID`: Find in `.vercel/project.json`

---

#### Workflow 3: Release Automation

**File**: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'  # Trigger on version tags (e.g., v1.0.0)

jobs:
  create-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write  # Required for creating releases
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Fetch all history for changelog
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build project
        run: npm run build
      
      - name: Create ZIP archive
        run: |
          cd dist
          zip -r ../openscad-web-customizer-${{ github.ref_name }}.zip .
          cd ..
      
      - name: Extract version from tag
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Get changelog for this version
        id: changelog
        run: |
          VERSION=${{ steps.version.outputs.version }}
          
          # Extract changelog section for this version
          CHANGELOG=$(awk "/^## \[$VERSION\]/{flag=1; next} /^## \[/{flag=0} flag" CHANGELOG.md)
          
          # If no changelog found, use generic message
          if [ -z "$CHANGELOG" ]; then
            CHANGELOG="See [CHANGELOG.md](CHANGELOG.md) for details."
          fi
          
          # Save to file (multiline output)
          echo "$CHANGELOG" > changelog-excerpt.md
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: changelog-excerpt.md
          files: |
            openscad-web-customizer-${{ github.ref_name }}.zip
            package.json
          draft: false
          prerelease: ${{ contains(github.ref_name, 'alpha') || contains(github.ref_name, 'beta') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Publish to npm (if CLI package)
        if: contains(github.ref_name, 'cli')
        run: |
          echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
          npm publish --access public
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

#### Workflow 4: Dependency Updates

**File**: `.github/workflows/dependency-updates.yml`

```yaml
name: Dependency Updates

on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Mondays at midnight
  workflow_dispatch:

jobs:
  update-dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Check for outdated dependencies
        run: npm outdated || true
      
      - name: Update dependencies
        run: |
          npm update
          npm audit fix || true
      
      - name: Run tests
        run: |
          npm ci
          npm run test
          npm run build
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          commit-message: 'chore: update dependencies'
          title: 'chore: update dependencies'
          body: |
            Automated dependency updates via GitHub Actions.
            
            Please review the changes and ensure all tests pass.
          branch: dependency-updates
          delete-branch: true
```

---

#### Workflow 5: Lighthouse CI

**File**: `.github/workflows/lighthouse.yml`

```yaml
name: Lighthouse CI

on:
  pull_request:
    branches: [ main ]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build project
        run: npm run build
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          urls: |
            http://localhost:5173
          configPath: './lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true
```

**Lighthouse Configuration** (`lighthouserc.json`):

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run preview",
      "startServerReadyPattern": "Local:.*http://localhost:5173",
      "url": ["http://localhost:5173/"],
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.8}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.8}],
        "categories:pwa": ["warn", {"minScore": 0.8}]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

---

#### Required Repository Settings

**Branch Protection Rules** (Settings → Branches → Add rule):

```yaml
Branch name pattern: main

Protection rules:
  ☑ Require a pull request before merging
    ☑ Require approvals: 1
    ☑ Dismiss stale pull request approvals when new commits are pushed
  ☑ Require status checks to pass before merging
    ☑ Require branches to be up to date before merging
    Required checks:
      - lint
      - test-unit
      - test-e2e
      - build
      - accessibility
  ☑ Require conversation resolution before merging
  ☑ Do not allow bypassing the above settings
```

---

#### Monitoring and Badges

Add status badges to `README.md`:

```markdown
[![CI](https://github.com/YOUR_ORG/openscad-web-customizer-forge/workflows/CI/badge.svg)](https://github.com/YOUR_ORG/openscad-web-customizer-forge/actions)
[![Deploy](https://github.com/YOUR_ORG/openscad-web-customizer-forge/workflows/Deploy%20to%20Vercel/badge.svg)](https://github.com/YOUR_ORG/openscad-web-customizer-forge/actions)
[![codecov](https://codecov.io/gh/YOUR_ORG/openscad-web-customizer-forge/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_ORG/openscad-web-customizer-forge)
[![Lighthouse Score](https://img.shields.io/badge/lighthouse-90%2B-brightgreen)](https://github.com/YOUR_ORG/openscad-web-customizer-forge/actions)
```

---

#### Troubleshooting GitHub Actions

**Common Issues**:

1. **Tests fail in CI but pass locally**
   - Solution: Ensure deterministic test execution (no reliance on timing)
   - Solution: Use consistent Node.js version (`nvm use 18`)

2. **Playwright tests timeout**
   - Solution: Increase timeout in `playwright.config.js`
   - Solution: Use `waitForLoadState('networkidle')` instead of arbitrary waits

3. **Build succeeds locally but fails in CI**
   - Solution: Check for missing environment variables
   - Solution: Ensure fonts are downloaded in CI (`npm run setup-fonts`)

4. **Vercel deployment fails**
   - Solution: Verify secrets are set correctly
   - Solution: Check Vercel project ID matches

5. **Coverage drops unexpectedly**
   - Solution: Check if new untested code was added
   - Solution: Review coverage report in artifacts

---

**Acceptance Criteria**:
- [ ] CI workflow runs on every push and PR
- [ ] Unit tests run and enforce 80% coverage
- [ ] E2E tests run in headless browsers
- [ ] Accessibility tests pass (90+ score)
- [ ] Build succeeds and artifacts uploaded
- [ ] Deploy workflow triggers on main branch pushes
- [ ] Smoke tests run on production deployment
- [ ] Release workflow creates GitHub releases on version tags
- [ ] Dependency update workflow runs weekly
- [ ] Lighthouse CI runs on PRs
- [ ] Branch protection rules enforced
- [ ] Status badges added to README

---

## Best Practices and Common Pitfalls

This section documents lessons learned during development and provides guidance for contributors.

### JavaScript Best Practices

#### 1. Avoid Memory Leaks in Event Listeners

**Problem**: Event listeners not removed when components are destroyed.

**Bad**:
```javascript
function createSlider(param) {
  const slider = document.createElement('input')
  slider.type = 'range'
  
  // Event listener never removed!
  slider.addEventListener('input', (e) => {
    updateParameter(param.name, e.target.value)
  })
  
  return slider
}
```

**Good**:
```javascript
function createSlider(param) {
  const slider = document.createElement('input')
  slider.type = 'range'
  
  // Store reference for cleanup
  const handler = (e) => {
    updateParameter(param.name, e.target.value)
  }
  
  slider.addEventListener('input', handler)
  
  // Add cleanup method
  slider.cleanup = () => {
    slider.removeEventListener('input', handler)
  }
  
  return slider
}

// Later, when removing:
function clearUI() {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    if (slider.cleanup) slider.cleanup()
    slider.remove()
  })
}
```

---

#### 2. Debounce Expensive Operations

**Problem**: Parameter changes trigger renders on every keystroke.

**Bad**:
```javascript
input.addEventListener('input', (e) => {
  // Triggers render 10 times while typing "100"!
  renderPreview()
})
```

**Good**:
```javascript
function debounce(fn, delay) {
  let timeoutId
  return function(...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

const debouncedRender = debounce(renderPreview, 350)

input.addEventListener('input', (e) => {
  updateParameter(name, e.target.value)  // Update immediately
  debouncedRender()  // Debounce the render
})
```

---

#### 3. Clone Objects, Don't Mutate

**Problem**: Mutating state objects causes hard-to-debug issues.

**Bad**:
```javascript
function updateParameter(name, value) {
  // Mutates the state object directly!
  this.state.parameters[name] = value
  this.notifyListeners()
}
```

**Good**:
```javascript
function updateParameter(name, value) {
  // Create new object (immutable update)
  this.state = {
    ...this.state,
    parameters: {
      ...this.state.parameters,
      [name]: value
    }
  }
  this.notifyListeners()
}
```

---

#### 4. Use async/await Consistently

**Problem**: Mixing promises and async/await leads to confusion.

**Bad**:
```javascript
function render() {
  return sendWorkerMessage({ type: 'render' })
    .then(result => {
      updatePreview(result)
    })
    .catch(err => {
      console.error(err)
    })
}
```

**Good**:
```javascript
async function render() {
  try {
    const result = await sendWorkerMessage({ type: 'render' })
    updatePreview(result)
  } catch (err) {
    console.error('Render failed:', err)
    this.showError(err.message)
  }
}
```

---

#### 5. Always Clean Up Intervals and Timeouts

**Problem**: Timers continue running after components are removed.

**Bad**:
```javascript
function startProgressBar() {
  setInterval(() => {
    updateProgress()
  }, 100)
}
```

**Good**:
```javascript
class ProgressBar {
  start() {
    this.intervalId = setInterval(() => {
      this.updateProgress()
    }, 100)
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

// Usage:
const progress = new ProgressBar()
progress.start()

// Later:
progress.stop()
```

---

### CSS Best Practices

#### 1. Use CSS Custom Properties for Theming

**Bad**:
```css
.button {
  background: #3b82f6;
  color: white;
}

[data-theme="dark"] .button {
  background: #60a5fa;
  color: black;
}
```

**Good**:
```css
:root {
  --color-primary: #3b82f6;
  --color-text-on-primary: white;
}

[data-theme="dark"] {
  --color-primary: #60a5fa;
  --color-text-on-primary: black;
}

.button {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}
```

---

#### 2. Mobile-First Responsive Design

**Bad** (Desktop-first):
```css
.container {
  display: grid;
  grid-template-columns: 300px 1fr;
}

@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
  }
}
```

**Good** (Mobile-first):
```css
.container {
  display: grid;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .container {
    grid-template-columns: 300px 1fr;
  }
}
```

---

#### 3. Respect prefers-reduced-motion

**Bad**:
```css
.button {
  transition: all 0.3s ease;
}
```

**Good**:
```css
.button {
  /* Only animate if user allows motion */
  transition: none;
}

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: all 0.3s ease;
  }
}
```

---

### Accessibility Best Practices

#### 1. Always Provide ARIA Labels

**Bad**:
```html
<button>
  <svg>...</svg>
</button>
```

**Good**:
```html
<button aria-label="Generate STL">
  <svg aria-hidden="true">...</svg>
  <span class="sr-only">Generate STL</span>
</button>
```

---

#### 2. Use Semantic HTML

**Bad**:
```html
<div class="button" onclick="doSomething()">
  Click me
</div>
```

**Good**:
```html
<button type="button" onclick="doSomething()">
  Click me
</button>
```

---

#### 3. Announce Dynamic Content Changes

**Bad**:
```javascript
function updateStatus(message) {
  document.getElementById('status').textContent = message
  // Screen readers don't announce this!
}
```

**Good**:
```javascript
function updateStatus(message) {
  const status = document.getElementById('status')
  status.textContent = message
  
  // Also update live region for screen readers
  const liveRegion = document.getElementById('sr-live-region')
  if (liveRegion) {
    liveRegion.textContent = message
  }
}
```

**HTML**:
```html
<!-- Live region for screen reader announcements -->
<div id="sr-live-region" aria-live="polite" aria-atomic="true" class="sr-only">
</div>

<style>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
```

---

### Web Worker Best Practices

#### 1. Always Handle Worker Errors

**Bad**:
```javascript
const worker = new Worker('worker.js')
worker.postMessage({ type: 'render' })
// No error handler!
```

**Good**:
```javascript
const worker = new Worker('worker.js')

worker.addEventListener('error', (e) => {
  console.error('Worker error:', e)
  this.showError('Rendering engine crashed. Please reload the page.')
})

worker.addEventListener('messageerror', (e) => {
  console.error('Worker message error:', e)
  this.showError('Communication error with rendering engine.')
})

worker.postMessage({ type: 'render' })
```

---

#### 2. Use Structured Cloning for Messages

**Bad** (slow, creates unnecessary copies):
```javascript
// Sending large ArrayBuffer
worker.postMessage({
  type: 'process',
  data: largeArrayBuffer
})
// Original largeArrayBuffer is copied (expensive!)
```

**Good** (fast, transfers ownership):
```javascript
// Transfer ArrayBuffer ownership to worker
worker.postMessage({
  type: 'process',
  data: largeArrayBuffer
}, [largeArrayBuffer])  // Transfer list

// Original largeArrayBuffer is now unusable in main thread (ownership transferred)
```

---

#### 3. Always Use Message IDs for Request/Response

**Bad**:
```javascript
worker.postMessage({ type: 'render', scad: '...' })

worker.onmessage = (e) => {
  // Which render is this for?
  handleResult(e.data)
}
```

**Good**:
```javascript
let nextId = 0
const pendingRequests = new Map()

function sendWorkerMessage(message) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pendingRequests.set(id, { resolve, reject })
    
    worker.postMessage({ ...message, id })
    
    // Timeout after 60s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Worker timeout'))
      }
    }, 60000)
  })
}

worker.onmessage = (e) => {
  const { id, result, error } = e.data
  
  if (pendingRequests.has(id)) {
    const { resolve, reject } = pendingRequests.get(id)
    pendingRequests.delete(id)
    
    if (error) {
      reject(new Error(error))
    } else {
      resolve(result)
    }
  }
}
```

---

### Performance Best Practices

#### 1. Lazy Load Heavy Dependencies

**Bad**:
```javascript
// Top of file - loaded immediately even if not used
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
```

**Good**:
```javascript
// Load only when needed
let THREE, OrbitControls

async function loadThreeJS() {
  if (!THREE) {
    const [threeModule, controlsModule] = await Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js')
    ])
    
    THREE = threeModule
    OrbitControls = controlsModule.OrbitControls
  }
  
  return { THREE, OrbitControls }
}
```

---

#### 2. Use IntersectionObserver for Viewport Detection

**Bad** (expensive scroll listening):
```javascript
window.addEventListener('scroll', () => {
  const element = document.getElementById('preview')
  const rect = element.getBoundingClientRect()
  
  if (rect.top < window.innerHeight) {
    loadPreview()
  }
})
```

**Good** (efficient, built-in):
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadPreview()
      observer.disconnect()  // Only load once
    }
  })
})

observer.observe(document.getElementById('preview'))
```

---

#### 3. Batch DOM Updates

**Bad**:
```javascript
function renderParameters(params) {
  params.forEach(param => {
    const control = createControl(param)
    container.appendChild(control)  // Reflow on every append!
  })
}
```

**Good**:
```javascript
function renderParameters(params) {
  const fragment = document.createDocumentFragment()
  
  params.forEach(param => {
    const control = createControl(param)
    fragment.appendChild(control)
  })
  
  container.appendChild(fragment)  // Single reflow
}
```

---

### Testing Best Practices

#### 1. Test Behavior, Not Implementation

**Bad**:
```javascript
test('state has parameters property', () => {
  const state = new AppState()
  expect(state.state.parameters).toBeDefined()
})
```

**Good**:
```javascript
test('can update parameter value', () => {
  const state = new AppState()
  state.updateParameter('width', 100)
  
  const currentState = state.getState()
  expect(currentState.parameters.width).toBe(100)
})
```

---

#### 2. Use Test Fixtures

**Bad**:
```javascript
test('parser extracts parameters', () => {
  const scad = `
    /*[Dimensions]*/
    width = 50; // [10:100]
    height = 30; // [10:80]
  `
  
  const result = parseParameters(scad)
  // ...
})
```

**Good**:
```javascript
// tests/fixtures/sample.scad
const SAMPLE_SCAD = `
/*[Dimensions]*/
width = 50; // [10:100]
height = 30; // [10:80]
`

// tests/unit/parser.test.js
import { SAMPLE_SCAD } from '../fixtures/sample.js'

test('parser extracts parameters', () => {
  const result = parseParameters(SAMPLE_SCAD)
  // ...
})
```

---

#### 3. Mock External Dependencies

**Bad**:
```javascript
test('loads STL file', async () => {
  // Makes real network request!
  const stl = await fetch('/model.stl')
  // ...
})
```

**Good**:
```javascript
import { vi } from 'vitest'

test('loads STL file', async () => {
  // Mock fetch
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(100)
  })
  
  const stl = await loadSTL('/model.stl')
  
  expect(fetch).toHaveBeenCalledWith('/model.stl')
  expect(stl).toBeInstanceOf(ArrayBuffer)
})
```

---

### Security Best Practices

#### 1. Never Use eval()

**Bad** (arbitrary code execution vulnerability):
```javascript
function processUserInput(input) {
  // NEVER DO THIS!
  const result = eval(input)
  return result
}
```

**Good**:
```javascript
function processUserInput(input) {
  // Parse safely
  try {
    const data = JSON.parse(input)
    return data
  } catch (err) {
    throw new Error('Invalid input')
  }
}
```

---

#### 2. Sanitize User Content

**Bad**:
```javascript
function displayComment(comment) {
  container.innerHTML = comment  // XSS vulnerability!
}
```

**Good**:
```javascript
function displayComment(comment) {
  container.textContent = comment  // Safe (no HTML parsing)
}

// Or use DOMPurify for rich content:
import DOMPurify from 'dompurify'

function displayRichComment(html) {
  const clean = DOMPurify.sanitize(html)
  container.innerHTML = clean
}
```

---

#### 3. Validate File Uploads

**Bad**:
```javascript
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  // No validation!
  readFile(file)
})
```

**Good**:
```javascript
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  
  // Validate file type
  const allowedTypes = ['.scad', 'application/zip']
  const ext = file.name.split('.').pop().toLowerCase()
  
  if (!allowedTypes.some(type => file.type === type || ext === type.slice(1))) {
    this.showError('Invalid file type. Please upload .scad or .zip files.')
    return
  }
  
  // Validate file size (20MB limit)
  const maxSize = 20 * 1024 * 1024
  if (file.size > maxSize) {
    this.showError(`File too large. Maximum size: ${maxSize / 1024 / 1024}MB`)
    return
  }
  
  readFile(file)
})
```

---

### Common Pitfalls

#### Pitfall 1: Forgetting to Cleanup on Upload

**Symptom**: Old parameters visible when uploading new file.

**Solution**:
```javascript
function handleFileUpload(file) {
  // 1. Clear old UI
  clearParameterUI()
  
  // 2. Clear old state
  appState.reset()
  
  // 3. Clear old render
  renderController.cancel()
  previewManager.clear()
  
  // 4. Load new file
  const content = await file.text()
  parseAndRenderUI(content)
}
```

---

#### Pitfall 2: Race Conditions in Async Operations

**Symptom**: Old renders complete after new ones start, showing wrong preview.

**Solution**: Use render IDs to ignore stale results:
```javascript
let currentRenderId = 0

async function render() {
  const renderId = ++currentRenderId
  
  const result = await worker.render(scad, params)
  
  // Check if this is still the latest render
  if (renderId !== currentRenderId) {
    console.log('Ignoring stale render', renderId)
    return  // User started a newer render
  }
  
  updatePreview(result)
}
```

---

#### Pitfall 3: Not Handling Mobile Viewport Changes

**Symptom**: UI breaks when keyboard opens on mobile.

**Solution**: Use Visual Viewport API or dynamic viewport units:
```javascript
// Listen for viewport changes
window.visualViewport?.addEventListener('resize', () => {
  updateLayout()
})

// CSS: Use dvh instead of vh
.container {
  height: 100dvh;  /* Dynamic viewport height */
}
```

---

#### Pitfall 4: localStorage Quota Exceeded

**Symptom**: Preset save fails silently.

**Solution**: Handle quota errors:
```javascript
function saveToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      this.showError('Storage quota exceeded. Please delete old presets.')
      
      // Offer to clear old data
      if (confirm('Clear old presets to make space?')) {
        this.clearOldPresets()
        // Retry
        localStorage.setItem(key, JSON.stringify(value))
      }
    } else {
      throw err
    }
  }
}
```

---

#### Pitfall 5: Three.js Memory Leaks

**Symptom**: Browser slows down after multiple renders.

**Solution**: Dispose geometries and materials:
```javascript
function clearPreview() {
  if (this.mesh) {
    // Dispose geometry
    this.mesh.geometry.dispose()
    
    // Dispose material(s)
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(mat => mat.dispose())
    } else {
      this.mesh.material.dispose()
    }
    
    // Remove from scene
    this.scene.remove(this.mesh)
    this.mesh = null
  }
  
  // Dispose textures if any
  this.scene.traverse(object => {
    if (object.material) {
      if (object.material.map) object.material.map.dispose()
      if (object.material.lightMap) object.material.lightMap.dispose()
      if (object.material.bumpMap) object.material.bumpMap.dispose()
      if (object.material.normalMap) object.material.normalMap.dispose()
      if (object.material.specularMap) object.material.specularMap.dispose()
      if (object.material.envMap) object.material.envMap.dispose()
    }
  })
}
```

---

### Debugging Tips

#### 1. Use Performance Profiling

```javascript
function expensiveOperation() {
  performance.mark('operation-start')
  
  // ... expensive code ...
  
  performance.mark('operation-end')
  performance.measure('operation', 'operation-start', 'operation-end')
  
  const measure = performance.getEntriesByName('operation')[0]
  console.log(`Operation took ${measure.duration.toFixed(2)}ms`)
}
```

---

#### 2. Add Debug Logging with Levels

```javascript
const DEBUG = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
}

let logLevel = DEBUG.INFO

function log(level, message, ...args) {
  if (level <= logLevel) {
    const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG']
    console.log(`[${levelNames[level]}]`, message, ...args)
  }
}

// Usage:
log(DEBUG.INFO, 'Rendering started')
log(DEBUG.DEBUG, 'Parameters:', parameters)
log(DEBUG.ERROR, 'Render failed:', error)
```

---

#### 3. Use Chrome DevTools Effectively

**Memory Leaks**:
```
1. Open DevTools → Memory tab
2. Take heap snapshot
3. Perform action (e.g., upload 5 files)
4. Take another snapshot
5. Compare snapshots to find leaked objects
```

**Performance Issues**:
```
1. Open DevTools → Performance tab
2. Click Record
3. Perform action
4. Stop recording
5. Look for long tasks (> 50ms)
```

**Web Worker Debugging**:
```
1. Open DevTools → Sources tab
2. Look for "Worker" threads in left sidebar
3. Set breakpoints in worker code
4. Inspect worker messages in Network tab (WS filter)
```

---

### Recommended Reading

For deeper understanding, refer to:

1. **JavaScript**:
   - [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) (free online)
   - [JavaScript.info](https://javascript.info/)

2. **Accessibility**:
   - [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
   - [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

3. **Performance**:
   - [Web.dev Performance](https://web.dev/performance/)
   - [High Performance Browser Networking](https://hpbn.co/)

4. **Testing**:
   - [Testing Library Docs](https://testing-library.com/)
   - [Playwright Best Practices](https://playwright.dev/docs/best-practices)

5. **Three.js**:
   - [Three.js Journey](https://threejs-journey.com/)
   - [Three.js Manual](https://threejs.org/manual/)

---

### CLI Toolchain Gaps (Existing + New)

> **Note**: Detailed step-by-step implementation guidance for each gap is available in the [Recommended Additions (Audit Gaps)](#recommended-additions-audit-gaps) section under v2 Developer Toolchain.

| Gap | Description | Quick Fix | Detailed Guide |
|-----|-------------|-----------|----------------|
| **STL parity validation** | `validate --ref` and `--tolerance` options exist but actual STL output comparison not implemented | Remove options or add "not implemented" warning | [Gap 1](#gap-1-stl-parity-validation-not-implemented) |
| **Template validation** | `validate` command may fail on React/Vue/Svelte scaffolds due to different file structure | Add `detectTemplate()` function to check package.json | [Gap 2](#gap-2-validate-command-not-template-aware) |
| **Golden fixtures alignment** | `validate --save-fixtures` and `ci --provider validation` may produce incompatible fixture formats | Create shared `cli/lib/fixture-schema.js` | [Gap 3](#gap-3-golden-fixtures-format-mismatch) |
| **Theme injection** | `scaffold --theme` accepts option but doesn't inject generated theme CSS | Call `generateTheme()` and write to output | [Gap 4](#gap-4-scaffold---theme-option-not-wired) |
| **YAML format** | `extract --format yaml` advertised but not implemented | `npm install yaml` and add stringify call | [Gap 5](#gap-5-yaml-format-not-implemented) |
| **x-hint preservation** | Parser extracts `uiType` but extract command doesn't emit `x-hint` for color/file types | Add `x-hint` property to schema output | [Gap 6](#gap-6-advanced-parameter-hints-not-preserved-in-extract) |
| **Sync three.js detection** | `three.js` message maps incorrectly (should be `three` package name) | Fix `DEPENDENCY_MAP` in sync.js | [Gap 7](#gap-7-sync-auto-fix-uses-wrong-package-name) |
| **Scaffolded apps don't auto-load** | Scaffolded vanilla apps have embedded schema/SCAD but still show "Upload" screen | Add auto-load logic to read embedded data | [Gap 8](#gap-8-scaffolded-apps-dont-boot-without-upload) |
| **CI validation runner mismatch** | `ci --provider validation` generates a runner that checks `validation.passed`, but `validate --format json` does not emit a `passed` boolean | Add `passed` boolean to JSON output | [Gap 9](#gap-9-validate-json-output-missing-passed-flag) |

#### Priority Order for Fixing Gaps

If you're a junior developer and want to contribute, here's the recommended order to tackle these gaps (easiest first):

1. **Sync three.js detection** (Gap 7, 5 min) - Just fix a string mapping. Great first contribution!
2. **YAML format** (Gap 5, 30 min) - Either implement with `yaml` package or remove the option
3. **x-hint preservation** (Gap 6, 30 min) - Add a few lines to schema output
4. **Theme injection** (Gap 4, 1 hr) - Wire existing theme generator into scaffold
5. **CI validation runner mismatch** (Gap 9, 1 hr) - Add `passed` boolean to JSON output
6. **Template validation** (Gap 2, 2 hr) - Add template detection logic
7. **Scaffolded app auto-load** (Gap 8, 2 hr) - Add embedded schema/SCAD detection
8. **Golden fixtures alignment** (Gap 3, 3 hr) - Design and implement shared schema
9. **STL parity validation** (Gap 1, complex) - Requires understanding of mesh comparison algorithms

### Code Quality Issues

| Issue | Location | Description | Recommendation |
|-------|----------|-------------|----------------|
| **Console.log statements** | Multiple files | Debug console.log statements throughout codebase | Add ESLint rule or clean up for production |
| **Hardcoded timeout values** | `render-controller.js` | 60s timeout hardcoded; build plan mentions configurable | Add configuration option |
| **Inconsistent error messages** | `openscad-worker.js` | Some errors show raw OpenSCAD output | Implement error message translation per build plan |
| **Memory limit warning** | Worker | 512MB limit mentioned but no proactive warning to users | Add memory usage monitoring and warning |

#### How to Fix Code Quality Issues (Junior Developer Guide)

**Console.log Cleanup**
```bash
# 1. Add ESLint rule to catch console statements
# In .eslintrc.json, add:
{
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}

# 2. Run ESLint to find all instances
npx eslint src/ --quiet

# 3. Replace console.log with either:
#    - Remove entirely (if debug-only)
#    - Replace with console.warn/error (if important)
#    - Use a debug flag: if (DEBUG) console.log(...)
```

**Configurable Timeout**
```javascript
// In src/js/render-controller.js

// Before (hardcoded):
const RENDER_TIMEOUT = 60000;

// After (configurable):
const DEFAULT_TIMEOUT = 60000;

class RenderController {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }
  
  // Use this.timeout instead of RENDER_TIMEOUT
}

// Allow users to configure via state or UI settings
```

**Error Message Translation**
```javascript
// In src/worker/openscad-worker.js, create an error mapper:

const ERROR_TRANSLATIONS = {
  'Parser error': 'There\'s a syntax error in your OpenSCAD file. Check for missing semicolons or brackets.',
  'Rendering cancelled': 'The render was stopped because it was taking too long. Try reducing complexity.',
  'out of memory': 'This model is too complex for browser rendering. Try lowering $fn or simplifying the design.',
  // Add more patterns as you encounter them
};

function translateError(rawError) {
  for (const [pattern, friendly] of Object.entries(ERROR_TRANSLATIONS)) {
    if (rawError.includes(pattern)) {
      return friendly;
    }
  }
  return `OpenSCAD error: ${rawError}`;  // Fallback
}
```

**Memory Monitoring**
```javascript
// In src/worker/openscad-worker.js

// Check memory usage before rendering
function checkMemoryUsage() {
  if (performance.memory) {
    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    const percent = (used / limit) * 100;
    
    if (percent > 80) {
      postMessage({
        type: 'warning',
        message: `Memory usage is high (${percent.toFixed(0)}%). Complex models may fail.`,
      });
    }
  }
}

// Call before each render
```

### Missing Documentation

| Item | Description | Recommendation |
|------|-------------|----------------|
| **Font setup instructions** | No documentation for setting up Liberation fonts | See "Font Setup Instructions" in Critical Issues section above, then add to README |
| **Library setup verification** | `npm run setup-libraries` exists but no verification step | Add health check for library availability |
| **SharedArrayBuffer fallback** | Build plan mentions fallback strategy for browsers without SharedArrayBuffer (SAB) | Document current behavior and limitations |
| **Mobile browser limitations** | iOS Safari has different memory limits | Document mobile-specific constraints |

#### How to Add Missing Documentation (Junior Developer Guide)

**Library Setup Verification**

Add a verification step after running `npm run setup-libraries`:

```javascript
// In scripts/setup-libraries.js, add at the end:

async function verifyLibraries() {
  const libraries = ['MCAD', 'BOSL2', 'NopSCADlib', 'dotSCAD'];
  const errors = [];
  
  for (const lib of libraries) {
    const manifestPath = path.join('public/libraries', lib, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      errors.push(`${lib}: manifest.json not found`);
      continue;
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    console.log(`✓ ${lib}: ${manifest.files?.length || 0} files`);
  }
  
  if (errors.length > 0) {
    console.error('\n⚠️ Library setup incomplete:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  
  console.log('\n✅ All libraries verified successfully');
}

// Call after setup
await verifyLibraries();
```

**SharedArrayBuffer Documentation**

Add this section to README.md:

```markdown
## Browser Requirements

### SharedArrayBuffer Support

This app uses SharedArrayBuffer for optimal WASM performance. If your browser 
doesn't support it (or blocks it due to security headers), the app will:

1. **Try to use a non-SAB WASM build** (slower but functional)
2. **Show a warning banner** if performance will be degraded
3. **Still work** but renders may take 2-3x longer

**Why SharedArrayBuffer might be blocked:**
- Serving over HTTP instead of HTTPS
- Missing COOP/COEP headers (handled automatically on Vercel)
- Older browser version
- Privacy-focused browser extensions

**To enable locally:** Use `npm run dev` which sets proper headers.
```

**Mobile Limitations Documentation**

```markdown
## Mobile Browser Notes

### iOS Safari
- **Memory limit**: ~250MB vs ~512MB on desktop
- **Large models**: May crash on complex geometry ($fn > 50)
- **Recommendation**: Use preview quality, avoid full renders on mobile

### Android Chrome  
- **Memory limit**: Varies by device (typically 256-512MB)
- **Keyboard**: May obscure action buttons; we handle this automatically
- **Touch targets**: All buttons are minimum 44x44px for accessibility
```

### Enhancement Opportunities

| Enhancement | Benefit | Effort | Getting Started |
|-------------|---------|--------|-----------------|
| **Progress bar for WASM loading** | Better UX during initial 15-30MB download | Low | See implementation below |
| **Render time estimates** | Show estimated render time based on model complexity | Medium | Count `$fn` and geometry ops |
| **Parameter search/filter** | Filter parameters by name for models with many params | Low | Add input field + filter function |
| **Batch export from comparison** | Download all variants as ZIP | Medium | Use JSZip, already a dependency |
| **Preset export/import (file)** | Move presets between machines without accounts | Low | Add “Export presets” / “Import presets” JSON buttons |
| **Model complexity warning** | Warn before rendering models with high $fn values | Low | Parse SCAD for `$fn` values |
| **Syntax highlighting** | Show SCAD source with syntax highlighting | Medium | Use Prism.js or highlight.js |
| **Error line highlighting** | Point to specific line in SCAD when OpenSCAD reports error | High | Parse OpenSCAD error output |

#### Implementation Examples for Enhancement Opportunities

**Progress Bar for WASM Loading (Low Effort)**

```javascript
// In src/main.js, wrap WASM initialization:

async function initializeWASM() {
  const progressBar = document.getElementById('wasm-progress');
  const progressText = document.getElementById('wasm-progress-text');
  
  // Show progress UI
  progressBar.style.display = 'block';
  
  // Fetch WASM with progress tracking
  const response = await fetch('/wasm/openscad.wasm');
  const contentLength = response.headers.get('Content-Length');
  const total = parseInt(contentLength, 10);
  
  let loaded = 0;
  const reader = response.body.getReader();
  const chunks = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    loaded += value.length;
    
    const percent = Math.round((loaded / total) * 100);
    progressBar.value = percent;
    progressText.textContent = `Loading OpenSCAD... ${percent}%`;
  }
  
  // Combine chunks and initialize
  const wasmBytes = new Uint8Array(loaded);
  // ... continue with WASM initialization
  
  progressBar.style.display = 'none';
}
```

**Parameter Search/Filter (Low Effort)**

```javascript
// Add search input to parameters panel
const searchInput = document.createElement('input');
searchInput.type = 'search';
searchInput.placeholder = 'Search parameters...';
searchInput.setAttribute('aria-label', 'Search parameters');

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const paramItems = document.querySelectorAll('.param-item');
  
  paramItems.forEach(item => {
    const name = item.querySelector('label').textContent.toLowerCase();
    const description = item.querySelector('.param-description')?.textContent.toLowerCase() || '';
    
    const matches = name.includes(query) || description.includes(query);
    item.style.display = matches ? '' : 'none';
  });
  
  // Announce results to screen readers
  const visible = document.querySelectorAll('.param-item:not([style*="display: none"])').length;
  announceToScreenReader(`Showing ${visible} parameters`);
});
```

**Model Complexity Warning (Low Effort)**

```javascript
// In src/js/parser.js, add complexity analysis:

function analyzeComplexity(scadContent) {
  const warnings = [];
  
  // Check for high $fn values
  const fnMatch = scadContent.match(/\$fn\s*=\s*(\d+)/g);
  if (fnMatch) {
    const fnValues = fnMatch.map(m => parseInt(m.match(/\d+/)[0]));
    const maxFn = Math.max(...fnValues);
    if (maxFn > 100) {
      warnings.push({
        level: 'warning',
        message: `High detail ($fn=${maxFn}) may cause slow renders. Consider $fn < 64 for preview.`,
      });
    }
  }
  
  // Check for recursive modules
  if (scadContent.includes('children()') && scadContent.match(/module\s+\w+.*children/)) {
    warnings.push({
      level: 'info', 
      message: 'This model uses recursive modules, which may increase render time.',
    });
  }
  
  return warnings;
}
```

### Accessibility Gaps

| Issue | WCAG Criterion | Description | Recommendation |
|-------|----------------|-------------|----------------|
| **Missing landmark regions** | 1.3.1 | Some sections lack proper `role` or `aria-label` | Audit and add missing ARIA landmarks |
| **Focus trap in modals** | 2.4.3 | Focus may escape modal dialogs in some browsers | Implement proper focus trap |
| **Reduced motion** | 2.3.3 | CSS has `prefers-reduced-motion` but Three.js animations not affected | Disable 3D auto-rotate when reduced motion preferred |
| **Tooltip keyboard access** | 2.1.1 | Help tooltips not implemented; when added, ensure keyboard accessible | Plan for keyboard-accessible tooltips |
| **Avoid `role="application"`** | 4.1.2 | `role="application"` can reduce screen reader usability by overriding browse mode semantics | Remove `role="application"` unless a documented Assistive Technology (AT) tested need exists; prefer semantic landmarks (`<header>`, `<main>`, `<nav>`) and `role="region"` only where needed |
| **Dialog background interaction** | 2.1.2 / 2.4.3 | Background content may remain tabbable/clickable behind modals, confusing screen reader (SR) and keyboard users | Use `inert` on the background when a dialog is open; polyfill as needed via [WICG inert](https://github.com/WICG/inert) |
| **Robust focus trap implementation** | 2.4.3 | Homegrown focus trapping is easy to get wrong (nested dialogs, restore focus, tab loops) | Use a proven OSS focus trap: [focus-trap](https://github.com/focus-trap/focus-trap) (vanilla JS) and follow [WAI-ARIA Authoring Practices Guide (APG)](https://github.com/w3c/aria-practices) dialog pattern guidance |
| **Contenteditable accessibility** | 4.1.2 | Inline rename/edit UIs implemented via `contenteditable` can be difficult for screen reader users and error-prone for keyboard navigation | Prefer `<input>`/`<textarea>` patterns (APG “textbox”) or ensure `contenteditable` has correct roles/labels and Enter/Escape semantics; reference patterns from [w3c/aria-practices](https://github.com/w3c/aria-practices) |
| **Avoid UI overload (complex CAD models)** | (Usability) | Parametric CAD models can expose dozens of controls; dense action bars make the tool harder to use | Use progressive disclosure: keep the main workflow minimal (Upload → Parameters → Render → Download), and move power-user features into an **Advanced** menu |
| **Text scaling + zoom resilience** | 1.4.4 / 1.4.10 | Users may use 200% zoom / large text; fixed heights can cause clipping and horizontal scroll | Ensure layouts work at 200% zoom: avoid fixed heights, use `rem` sizing, allow wrapping, test reflow |
| **Error identification and association** | 3.3.1 / 3.3.3 | Errors should be announced and associated to fields (not only in a global banner) | When validation errors exist, set `aria-invalid`, connect inline help/error via `aria-describedby`/`aria-errormessage`, and focus the first invalid field |

### Security Considerations

| Item | Status | Recommendation |
|------|--------|----------------|
| **File size validation** | ✅ Implemented | 5MB limit for SCAD, 20MB for ZIP |
| **WASM isolation** | ✅ Implemented | Web Worker sandbox |
| **XSS protection** | ⚠️ Partial | `escapeHtml()` used in some places; audit all user input display |
| **CSP headers** | ❌ Missing | Add Content-Security-Policy headers to vercel.json |
| **Subresource integrity** | ❌ Missing | Add SRI hashes for CDN-loaded resources (if any) |

### Testing Gaps

> **Target**: v2.4 release. See [Testing Infrastructure Implementation](#1-testing-infrastructure-automated-tests-currently-manual-only) section below for detailed step-by-step instructions.

| Area | Current State | v2.4 Target |
|------|---------------|-------------|
| **Unit tests** | None | Vitest for parser/state/presets (80%+ coverage) |
| **E2E tests** | Manual only | Playwright for upload → render → download flow |
| **Accessibility** | Manual only | Playwright + axe-core scans (zero violations) |
| **Visual regression** | None | Playwright screenshot assertions |
| **Performance** | None | Lighthouse CI for bundle size monitoring |
| **Cross-browser** | Manual only | Playwright multi-browser (Chromium, Firefox, WebKit) |

---

## Remaining Work (Next Iteration) — detailed build instructions with OSS references

This section expands the current “gaps” tables into an actionable implementation plan, with links to **known working open source code** so a junior developer can follow proven patterns.

### 1) Testing infrastructure (automated tests; currently manual only)

#### 1.1 Unit testing (logic-level)

**Recommended stack (OSS)**:
- Test runner: [Vitest](https://github.com/vitest-dev/vitest) (fits Vite projects)
- DOM helpers (when needed): [dom-testing-library](https://github.com/testing-library/dom-testing-library)

**Quick start (junior-friendly)**:
```bash
# Install Vitest and testing utilities
npm install -D vitest @testing-library/dom jsdom

# Add to package.json scripts:
#   "test": "vitest",
#   "test:run": "vitest run"

# Create your first test file
mkdir -p src/js/__tests__
# Create src/js/__tests__/parser.test.js with basic tests

# Run tests
npm test
```

**What to test first (high value relative to effort)**:
- **Parameter parsing**: `src/js/parser.js` edge cases (hidden groups, `$fn`, comments, ranges)
- **Schema/validation**: clamp numeric values, ignore invalid enums, default handling
- **URL/share serialization**: encode/decode stability, backwards compatibility, size limits
- **Preset manager**: save/load/export/import behavior, invalid JSON handling
- **Render queue state machine** (`src/js/render-queue.js`): queued → rendering → complete/error/cancelled transitions

**Repo-backed patterns to follow**:
- Use the standard Testing Library approach of testing behavior/output rather than internal implementation: [dom-testing-library](https://github.com/testing-library/dom-testing-library)

#### 1.2 E2E testing (user flows)

**Recommended stack (OSS)**:
- E2E runner + browsers: [Playwright](https://github.com/microsoft/playwright)

**Quick start (junior-friendly)**:
```bash
# Install Playwright
npm init playwright@latest
# This creates: playwright.config.ts, tests/ folder, package.json updates

# Or manual installation:
npm install -D @playwright/test
npx playwright install  # Downloads browser binaries

# Run tests
npx playwright test

# Run with UI mode (great for debugging)
npx playwright test --ui

# Run specific test file
npx playwright test tests/upload.spec.ts
```

**Minimum critical-path E2E tests**:
- Upload `.scad` → parameters render → generate → download link becomes enabled
- Example loader buttons work and render expected parameter groups
- Error path: invalid file shows readable error message and focus lands on error region
- Mobile viewport smoke: primary action remains visible and tappable at small widths

**Cross-browser within OSS tooling**:
- Run Playwright in **Chromium + Firefox + WebKit** locally/CI when feasible (reduces reliance on paid services for baseline coverage).

#### 1.3 Automated accessibility checks (VoiceOver/NVDA support starts here)

**Recommended stack (OSS)**:
- axe engine: [axe-core](https://github.com/dequelabs/axe-core)
- Playwright integration: [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm)
- Interaction patterns reference: [WAI-ARIA Authoring Practices](https://github.com/w3c/aria-practices)

**Quick start (junior-friendly)**:
```bash
# Install axe-core Playwright integration
npm install -D @axe-core/playwright

# In your Playwright test file:
# import { test, expect } from '@playwright/test';
# import AxeBuilder from '@axe-core/playwright';
#
# test('page has no accessibility violations', async ({ page }) => {
#   await page.goto('/');
#   const results = await new AxeBuilder({ page }).analyze();
#   expect(results.violations).toEqual([]);
# });
```

**What to automate** (keep it stable; avoid noisy rules at first):
- Scan after each critical flow step (post-upload, post-render, modal open)
- Restrict to WCAG A/AA tags initially (axe supports tag filtering)
- Attach the full JSON results to test artifacts for debugging

**What remains manual (still required)**:
- VoiceOver rotor navigation sanity check (iOS Safari)
- NVDA browse vs focus mode behavior (Windows)
- Usability review: “can a first-time user complete upload → adjust → (optional Advanced) → render → download?”

#### 1.4 Visual regression (UI breakage detection)

**Preferred baseline (OSS)**:
- Use Playwright’s screenshot assertions for key screens (welcome, main interface, modal open, mobile layout).

**If a dedicated tool becomes necessary**:
- Evaluate OSS visual regression tools such as [lost-pixel](https://github.com/lost-pixel/lost-pixel). (Avoid vendor lock-in unless there’s a strong reason.)

#### 1.5 Performance regression checks

**Recommended stack (OSS)**:
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) for performance/accessibility budgets in CI

**Focus areas**:
- Mobile performance budgets (JS bundle size, main-thread blocking)
- Time to interactive for first load (WASM download is large; track user impact)

### 2) Polish items

#### 2.1 More examples (curation + a11y-friendly onboarding)

**Goals**:
- Provide examples with “Beginner / Intermediate / Advanced” labeling
- Provide short, plain-language descriptions of what each example demonstrates
- Keep the initial choice set small to reduce overwhelm (avoid clutter in the default workflow)

**UX note**:
- Use progressive disclosure: show a small curated list by default, and put the full gallery behind an “All examples” panel if needed.

#### 2.2 Custom themes (including low-vision friendly defaults)

**Goals**:
- Keep theming via CSS custom properties
- Ensure high contrast remains WCAG AA/AAA
- Ensure focus indicators are visible in every theme

**Reference repos (OSS)**:
- Theme/variable-driven design tokens: [open-props](https://github.com/argyleink/open-props)
- Accessible color systems: [Radix Colors](https://github.com/radix-ui/colors)

#### 2.3 Mobile optimization (includes the resizing plan above)

**What “done” looks like**:
- No clipped UI at keyboard open (primary action visible)
- Modals remain usable at small sizes (scroll within modal, focus trapped)
- Orientation changes do not break layout

**Reference repos (OSS)**:
- Visual viewport patterns: [WICG Visual Viewport](https://github.com/WICG/visual-viewport)
- Viewport unit polyfill fallback: [large-small-dynamic-viewport-units-polyfill](https://github.com/joppuyo/large-small-dynamic-viewport-units-polyfill)

### 3) Nice-to-haves (detailed build instructions)

#### 3.1 Render queue (batch rendering)

If implementing or hardening a render queue, avoid a bespoke scheduling engine where possible.

**Reference repo (OSS)**:
- Promise queue with concurrency control (browser-compatible ESM): [p-queue](https://github.com/sindresorhus/p-queue)

**Build steps**:
- Define the job model (id, name, params snapshot, output format, state, timestamps)
- Enforce a strict concurrency of 1 for OpenSCAD worker jobs (avoid memory spikes)
- Add pause/resume/cancel semantics
- Ensure queue UI is accessible (list semantics, status announcements via `aria-live`)
- Add persistence (optional): serialize queue state to localStorage; include import/export JSON

#### 3.2 i18n (internationalization)

**Preferred approach**: start with error messages + core UI labels to avoid a giant, disruptive refactor.

**Reference repo (OSS)**:
- General-purpose i18n: [i18next](https://github.com/i18next/i18next)

**Build steps**:
- Inventory all user-facing strings (start with errors/status/tooltips)
- Create `locales/en/translation.json` as the source of truth
- Add a tiny translation helper (`t(key, vars)`) and replace hardcoded strings gradually
- Add a language selector only after the core strings are externalized (avoid UI clutter early)
- Add tests to ensure missing keys fail loudly in development

#### 3.3 Undo/redo (parameter editing history)

**Why it matters**: helps users (especially those prone to mistakes or overwhelm) confidently explore parameter changes without fear.

**Reference repos (OSS)**:
- Lightweight, framework-agnostic history stack: [UndoRedo.js](https://github.com/iMrDJAi/UndoRedo.js/)
- Widely cited “past/present/future” pattern explanation (if implementing internally): Redux “Undo History” docs (source is open): [reduxjs/redux](https://github.com/reduxjs/redux)

**Build steps**:
- Decide history granularity: per-field change vs “commit on blur” vs “commit on Generate”
- Cap history length (e.g., 50) to avoid memory growth
- Add keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo
- Announce undo/redo actions in the existing status live region (“Undid: width → 50”)
- Ensure undo/redo is disabled while rendering to avoid state/render mismatches

### Validation Checklist for Release

Before any release, verify these items are addressed:

- [ ] Remove debug fetch call from `auto-preview-controller.js`
- [ ] Update version strings in `main.js` and `sw.js`
- [ ] Verify fonts are bundled or limitation documented
- [ ] Run `npm run lint` with no errors
- [ ] Build succeeds (`npm run build`)
- [ ] Manual test: Upload → Customize → Generate → Download
- [ ] Manual test: All example models render correctly
- [ ] Lighthouse accessibility score ≥ 90
- [ ] Test in Chrome, Firefox, Safari, Edge

---

## Post-Launch Roadmap (Beyond v2)

> **Status as of v2.4.0**: All planned milestones through v2.4 are **COMPLETE**. The tool is production-ready for its core use case: upload → customize → download.

### v1.x Milestones (COMPLETED ✅)

| Version | Release | Key Features |
|---------|---------|--------------|
| v1.0 | Core MVP | Upload, customize, generate STL, 3D preview |
| v1.1 | Enhanced Usability | ZIP upload, keyboard shortcuts, dark mode, PWA |
| v1.2 | Advanced Features | Multi-format export, presets, measurements, comparison view, library bundles, render queue |

### v2.x Milestones (COMPLETED ✅)

| Version | Release | Key Features |
|---------|---------|--------------|
| v2.0 | Developer Toolchain | CLI tools (extract, scaffold, validate, sync) |
| v2.1 | Enhanced CLI | React templates, theme generator, CI/CD helpers |
| v2.2 | Additional Templates | Vue & Svelte templates, enhanced auto-fix, golden fixtures |
| v2.3 | Audit & Polish | Debug code removal, version alignment, production hardening |
| v2.4 | Testing Infrastructure | 239 unit tests, 42 E2E tests, CI/CD pipeline, mobile docs |
| v2.5 | UX Enhancements | Help tooltips, cancel button, unit display, Liberation fonts |

### v2.5.0 (2026-01-16) — UX Enhancements Release ✅

**Focus**: User experience improvements and P1 feature completion.

**Features Implemented**:
- ✅ **Help Tooltips**: Click-to-toggle tooltips for parameters with descriptions
- ✅ **Cancel Generation Button**: Visible cancel button during rendering
- ✅ **Unit Display**: Automatic unit detection and display (mm, °, %, etc.)
- ✅ **Liberation Font Bundle**: Fonts for OpenSCAD text() function

**Files Changed**:
- `src/js/parser.js`: Unit extraction, description parsing
- `src/js/ui-generator.js`: Help tooltips, unit display
- `src/styles/components.css`: Tooltip and unit styles
- `scripts/download-wasm.js`: Font download and extraction
- `src/worker/openscad-worker.js`: Font mounting to WASM FS

---

### v2.6 - Performance Optimization (PLANNED)

This release focuses on performance optimization—the most impactful improvements for the core use case.

> **Scope Decision**: Angular and Preact templates were evaluated but deprioritized. The existing 4 templates (vanilla, react, vue, svelte) cover 99%+ of real-world use cases. Adding more frameworks increases maintenance burden without proportional user value. The core use case is "customize models and download STL", not "build enterprise Angular apps".

#### What This Release Includes

**1. Performance Optimization**
- **What it is**: Bundle size and runtime performance improvements
- **Why it matters**: Faster loads, better mobile experience
- **What you'll optimize**:
  - Code splitting for Three.js (load only when 3D preview is used)
  - WASM lazy loading improvements (progress indicator during 15-30MB download)
  - Memory usage monitoring in worker (warn before hitting limits)
  - Render time estimation based on model complexity

**2. Font Support**
- **What it is**: Liberation fonts for OpenSCAD `text()` function
- **Why it matters**: Models using `text()` will render correctly
- **What you'll implement**:
  - Font setup automation script
  - Worker-based font mounting
  - Graceful fallback if fonts unavailable

**3. Additional Testing**
- **What it is**: Increase test coverage and add mobile tests
- **Why it matters**: Higher confidence in code quality
- **What you'll add**:
  - Mobile viewport E2E tests
  - Cross-browser E2E tests
  - Increase unit test coverage to 80%

#### Success Criteria for v2.5
- [ ] Lighthouse performance score > 80 on mobile
- [ ] WASM loading shows progress indicator
- [ ] Bundle size for vanilla template reduced by at least 10%
- [ ] Font support for `text()` function
- [ ] Unit test coverage > 80%

### v2.4 - Testing Infrastructure (COMPLETED ✅)

This release established comprehensive testing infrastructure for the project.

#### What Was Implemented

**1. Enhanced Testing Infrastructure** ✅
- **Vitest unit tests**: 239 tests across 14 modules
- **Playwright E2E tests**: 42 tests covering 5 workflows
- **Automated accessibility scans**: axe-core integration
- **GitHub Actions CI/CD**: Automated testing on every push

**2. Documentation** ✅
- **Mobile limitations**: Comprehensive `MOBILE_LIMITATIONS.md`
- **Testing guide**: `TESTING.md` with best practices
- **Performance guide**: `PERFORMANCE.md` with optimization strategies

#### Success Criteria for v2.4 (ACHIEVED)
- [x] Unit test coverage for core modules (parser: 88.82%, download: 100%)
- [x] Playwright E2E tests pass for upload → customize → download flow
- [x] GitHub Actions CI/CD pipeline configured
- [x] Mobile browser limitations documented
- [x] 239 unit tests passing, 42 E2E tests

#### Detailed Implementation Plan for v2.4

##### 2.4.1: Unit Testing Infrastructure (Week 1)

**Goal**: Set up Vitest and write comprehensive unit tests for core modules.

**Dependencies to Install**:
```bash
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8
npm install --save-dev jsdom happy-dom  # For DOM testing
```

**Configuration** (`vitest.config.js`):
```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/js/**/*.js'],
      exclude: ['src/worker/**', 'src/main.js'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
})
```

**Test File Organization**:
```
tests/
├── unit/
│   ├── parser.test.js           # Parameter extraction tests
│   ├── state.test.js            # State management tests
│   ├── preset-manager.test.js   # Preset functionality tests
│   ├── theme-manager.test.js    # Theme system tests
│   ├── zip-handler.test.js      # ZIP processing tests
│   └── ui-generator.test.js     # UI generation tests
├── integration/
│   ├── file-upload.test.js      # Upload → parse → UI flow
│   ├── render-flow.test.js      # Render orchestration
│   └── preset-workflow.test.js  # Save/load/export workflow
├── e2e/
│   └── (Playwright tests, see below)
└── fixtures/
    ├── sample.scad              # Test OpenSCAD files
    ├── multi-file.zip           # Test ZIP archives
    └── schemas/                 # Expected schemas
```

**Example Unit Test** (`tests/unit/parser.test.js`):
```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { parseParameters } from '../../src/js/parser.js'

describe('Parameter Parser', () => {
  describe('Range Parameters', () => {
    it('should parse simple range [min:max]', () => {
      const scad = `
        /*[Dimensions]*/
        width = 50; // [10:100]
      `
      const result = parseParameters(scad)
      
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].name).toBe('Dimensions')
      expect(result.groups[0].parameters).toHaveLength(1)
      
      const param = result.groups[0].parameters[0]
      expect(param.name).toBe('width')
      expect(param.default).toBe(50)
      expect(param.min).toBe(10)
      expect(param.max).toBe(100)
      expect(param.type).toBe('number')
    })
    
    it('should parse step range [min:step:max]', () => {
      const scad = `height = 2; // [1:0.5:5]`
      const result = parseParameters(scad)
      const param = result.groups[0].parameters[0]
      
      expect(param.min).toBe(1)
      expect(param.step).toBe(0.5)
      expect(param.max).toBe(5)
    })
  })
  
  describe('Enum Parameters', () => {
    it('should parse string enums', () => {
      const scad = `shape = "round"; // [round, square, hexagon]`
      const result = parseParameters(scad)
      const param = result.groups[0].parameters[0]
      
      expect(param.type).toBe('enum')
      expect(param.options).toEqual(['round', 'square', 'hexagon'])
      expect(param.default).toBe('round')
    })
  })
  
  describe('Boolean Parameters', () => {
    it('should detect yes/no as boolean', () => {
      const scad = `hollow = "yes"; // [yes, no]`
      const result = parseParameters(scad)
      const param = result.groups[0].parameters[0]
      
      expect(param.type).toBe('boolean')
      expect(param.default).toBe('yes')
    })
  })
  
  describe('Hidden Parameters', () => {
    it('should exclude parameters in [Hidden] group', () => {
      const scad = `
        width = 50;
        /*[Hidden]*/
        $fn = 100;
      `
      const result = parseParameters(scad)
      
      const visibleParams = result.groups
        .filter(g => g.name !== 'Hidden')
        .flatMap(g => g.parameters)
      
      expect(visibleParams).toHaveLength(1)
      expect(visibleParams[0].name).toBe('width')
    })
  })
})
```

**Example State Management Tests** (`tests/unit/state.test.js`):
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AppState } from '../../src/js/state.js'

describe('State Management', () => {
  let state
  
  beforeEach(() => {
    state = new AppState()
  })
  
  it('should initialize with default state', () => {
    const currentState = state.getState()
    expect(currentState.file).toBeNull()
    expect(currentState.parameters).toEqual({})
    expect(currentState.stlData).toBeNull()
  })
  
  it('should update state and notify listeners', () => {
    const listener = vi.fn()
    state.subscribe(listener)
    
    state.updateState({ file: { name: 'test.scad' } })
    
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ file: { name: 'test.scad' } })
    )
  })
  
  it('should allow multiple listeners', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    
    state.subscribe(listener1)
    state.subscribe(listener2)
    state.updateState({ parameters: { width: 100 } })
    
    expect(listener1).toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()
  })
  
  it('should unsubscribe listeners', () => {
    const listener = vi.fn()
    const unsubscribe = state.subscribe(listener)
    
    unsubscribe()
    state.updateState({ file: { name: 'test.scad' } })
    
    expect(listener).not.toHaveBeenCalled()
  })
})
```

**NPM Scripts to Add** (`package.json`):
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch"
  }
}
```

**Acceptance Criteria**:
- [ ] Vitest configured and running
- [ ] Parser tests: 20+ test cases covering all annotation types
- [ ] State tests: 15+ test cases for pub/sub pattern
- [ ] Preset manager tests: 25+ test cases for CRUD + import/export
- [ ] Theme manager tests: 15+ test cases for theme switching
- [ ] ZIP handler tests: 10+ test cases for extraction and validation
- [ ] Overall code coverage > 80% for core modules
- [ ] All tests pass in CI (GitHub Actions)

---

##### 2.4.2: E2E Testing with Playwright (Week 2)

**Goal**: Set up Playwright and test critical user workflows end-to-end.

**Dependencies to Install**:
```bash
npm install --save-dev @playwright/test
npx playwright install  # Installs browser binaries
```

**Configuration** (`playwright.config.js`):
```javascript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Example E2E Test** (`tests/e2e/upload-customize-download.spec.js`):
```javascript
import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Upload → Customize → Download Flow', () => {
  test('should complete full workflow with simple box', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('/')
    
    // 2. Verify welcome screen
    await expect(page.locator('h1')).toContainText('OpenSCAD Web Customizer')
    
    // 3. Upload file
    const fileInput = page.locator('input[type="file"]')
    const filePath = path.join(__dirname, '../fixtures/simple_box.scad')
    await fileInput.setInputFiles(filePath)
    
    // 4. Wait for parameter UI to render
    await expect(page.locator('.param-group')).toBeVisible({ timeout: 5000 })
    
    // 5. Verify parameters are visible
    const widthSlider = page.locator('input[name="width"]')
    await expect(widthSlider).toBeVisible()
    
    // 6. Adjust parameter
    await widthSlider.fill('75')
    await widthSlider.blur()
    
    // 7. Wait for auto-preview (debounced)
    await page.waitForTimeout(2000)
    
    // 8. Verify preview updated
    await expect(page.locator('.preview-status')).toContainText('Current')
    
    // 9. Download STL
    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Download STL")').click()
    const download = await downloadPromise
    
    // 10. Verify download
    expect(download.suggestedFilename()).toMatch(/\.stl$/)
    
    // 11. Verify STL is not empty
    const filePath = await download.path()
    const fs = require('fs')
    const stats = fs.statSync(filePath)
    expect(stats.size).toBeGreaterThan(100) // At least 100 bytes
  })
  
  test('should handle ZIP upload with multi-file project', async ({ page }) => {
    await page.goto('/')
    
    const fileInput = page.locator('input[type="file"]')
    const zipPath = path.join(__dirname, '../fixtures/multi-file-box.zip')
    await fileInput.setInputFiles(zipPath)
    
    // Verify file tree appears
    await expect(page.locator('.file-tree')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.main-file-badge')).toBeVisible()
    
    // Verify parameters extracted from main file
    await expect(page.locator('.param-group')).toBeVisible()
  })
  
  test('should maintain accessibility during workflow', async ({ page }) => {
    await page.goto('/')
    
    // Check initial page accessibility
    const accessibilityScan = await page.accessibility.snapshot()
    expect(accessibilityScan).toBeTruthy()
    
    // Upload file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('../fixtures/simple_box.scad')
    
    // Wait for UI to render
    await expect(page.locator('.param-group')).toBeVisible()
    
    // Test keyboard navigation
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluateHandle(() => document.activeElement)
    expect(focusedElement).toBeTruthy()
    
    // Verify ARIA labels
    const slider = page.locator('input[type="range"]').first()
    await expect(slider).toHaveAttribute('aria-label')
    
    // Check for color contrast violations (using axe-core)
    // Note: Requires @axe-core/playwright package
    // const violations = await checkA11y(page)
    // expect(violations).toHaveLength(0)
  })
})
```

**Accessibility Testing** (`tests/e2e/accessibility.spec.js`):
```javascript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility Compliance', () => {
  test('should have no accessibility violations on welcome screen', async ({ page }) => {
    await page.goto('/')
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    
    expect(results.violations).toEqual([])
  })
  
  test('should have no violations on parameter UI', async ({ page }) => {
    await page.goto('/')
    
    // Upload file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('../fixtures/simple_box.scad')
    await page.waitForSelector('.param-group')
    
    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    
    expect(results.violations).toEqual([])
  })
  
  test('should support keyboard-only navigation', async ({ page }) => {
    await page.goto('/')
    
    // Tab through interactive elements
    const tabStops = []
    let maxTabs = 20
    
    while (maxTabs-- > 0) {
      await page.keyboard.press('Tab')
      const activeElement = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        role: document.activeElement?.getAttribute('role'),
        label: document.activeElement?.getAttribute('aria-label')
      }))
      
      if (activeElement.tag === 'BODY') break // Wrapped around
      tabStops.push(activeElement)
    }
    
    // Verify we can reach all interactive elements
    expect(tabStops.length).toBeGreaterThan(5)
    
    // Verify focus indicators are visible
    const firstFocusable = page.locator('button, a, input, select').first()
    await firstFocusable.focus()
    
    const outline = await firstFocusable.evaluate(el => 
      window.getComputedStyle(el).outline
    )
    expect(outline).not.toBe('none')
  })
})
```

**NPM Scripts**:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:report": "playwright show-report"
  }
}
```

**Acceptance Criteria**:
- [ ] Playwright configured for Chrome, Firefox, Safari
- [ ] E2E test for upload → customize → download flow
- [ ] E2E test for ZIP upload workflow
- [ ] E2E test for preset save/load workflow
- [ ] E2E test for keyboard navigation
- [ ] E2E test for theme switching
- [ ] Accessibility scans pass for all major pages
- [ ] Mobile viewport tests pass
- [ ] All tests pass in CI

---

##### 2.4.3: Performance Optimization (Week 3)

**Goal**: Reduce bundle size and improve runtime performance.

**Optimization 1: Code Splitting for Three.js**

Three.js is a large dependency (~600KB) that's only needed for 3D preview. Lazy load it.

**Before** (`src/js/preview.js`):
```javascript
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
```

**After** (`src/js/preview.js`):
```javascript
let THREE, OrbitControls

async function loadThreeJS() {
  if (THREE) return { THREE, OrbitControls }
  
  const threeModule = await import('three')
  const controlsModule = await import('three/examples/jsm/controls/OrbitControls.js')
  
  THREE = threeModule
  OrbitControls = controlsModule.OrbitControls
  
  return { THREE, OrbitControls }
}

class PreviewManager {
  async initialize() {
    // Show loading indicator
    this.showLoadingIndicator('Loading 3D preview...')
    
    try {
      const { THREE, OrbitControls } = await loadThreeJS()
      this.THREE = THREE
      this.OrbitControls = OrbitControls
      
      // Initialize scene, camera, renderer
      this.initializeScene()
    } catch (err) {
      console.error('Failed to load Three.js:', err)
      this.showError('3D preview unavailable')
    } finally {
      this.hideLoadingIndicator()
    }
  }
}
```

**Expected Impact**: Bundle size reduced by ~100KB gzipped.

---

**Optimization 2: WASM Progress Indicator**

WASM files are 15-30MB. Show download progress to user.

**Implementation** (`src/worker/openscad-worker.js`):
```javascript
let wasmLoadProgress = 0

// Intercept WASM fetch to track progress
self.Module = {
  locateFile: (path, scriptDirectory) => {
    if (path.endsWith('.wasm')) {
      return scriptDirectory + path
    }
    return scriptDirectory + path
  },
  
  instantiateWasm: async (imports, receiveInstance) => {
    const wasmUrl = self.Module.locateFile('openscad.wasm', '')
    
    // Fetch with progress tracking
    const response = await fetch(wasmUrl)
    const contentLength = response.headers.get('Content-Length')
    const total = parseInt(contentLength, 10)
    
    let loaded = 0
    const reader = response.body.getReader()
    const chunks = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      chunks.push(value)
      loaded += value.length
      
      // Report progress to main thread
      const progress = Math.round((loaded / total) * 100)
      if (progress !== wasmLoadProgress) {
        wasmLoadProgress = progress
        self.postMessage({
          type: 'wasm-load-progress',
          progress,
          loaded,
          total
        })
      }
    }
    
    // Concatenate chunks
    const wasmBytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      wasmBytes.set(chunk, offset)
      offset += chunk.length
    }
    
    // Compile and instantiate
    const wasmModule = await WebAssembly.compile(wasmBytes)
    const instance = await WebAssembly.instantiate(wasmModule, imports)
    receiveInstance(instance, wasmModule)
    
    return instance.exports
  }
}
```

**UI Update** (`src/main.js`):
```javascript
// Listen for WASM load progress
worker.addEventListener('message', (e) => {
  if (e.data.type === 'wasm-load-progress') {
    updateWASMProgress(e.data.progress, e.data.loaded, e.data.total)
  }
})

function updateWASMProgress(progress, loaded, total) {
  const progressBar = document.getElementById('wasm-progress')
  const progressText = document.getElementById('wasm-progress-text')
  
  progressBar.style.width = `${progress}%`
  progressText.textContent = `Loading OpenSCAD engine... ${progress}% (${formatBytes(loaded)} / ${formatBytes(total)})`
}

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
```

---

**Optimization 3: Memory Usage Monitoring**

Warn users before hitting the 512MB WASM memory limit.

**Implementation** (`src/js/render-controller.js`):
```javascript
class RenderController {
  async checkMemoryUsage() {
    const memoryInfo = await this.sendWorkerMessage({
      type: 'get-memory-usage'
    })
    
    const usedMB = memoryInfo.used / 1024 / 1024
    const limitMB = 512
    const percentUsed = (usedMB / limitMB) * 100
    
    if (percentUsed > 80) {
      this.showMemoryWarning(usedMB, limitMB)
    }
    
    return memoryInfo
  }
  
  showMemoryWarning(usedMB, limitMB) {
    const warning = `
      ⚠️ Memory usage is high (${usedMB.toFixed(0)} MB / ${limitMB} MB).
      Consider simplifying your model or reducing $fn value.
    `
    console.warn(warning)
    this.showNotification(warning, 'warning')
  }
}
```

**Worker Implementation** (`src/worker/openscad-worker.js`):
```javascript
self.addEventListener('message', async (e) => {
  if (e.data.type === 'get-memory-usage') {
    const memoryInfo = {
      used: self.Module.HEAP8.length,
      limit: 512 * 1024 * 1024
    }
    self.postMessage({
      type: 'memory-usage',
      id: e.data.id,
      memoryInfo
    })
  }
})
```

---

**Optimization 4: Render Time Estimation**

Estimate render time based on model complexity.

**Implementation** (`src/js/render-controller.js`):
```javascript
function estimateRenderTime(scadContent, parameters) {
  // Simple heuristics (can be improved with ML model later)
  let complexityScore = 0
  
  // Count expensive operations
  complexityScore += (scadContent.match(/for\s*\(/g) || []).length * 10
  complexityScore += (scadContent.match(/intersection\s*\(/g) || []).length * 20
  complexityScore += (scadContent.match(/difference\s*\(/g) || []).length * 15
  complexityScore += (scadContent.match(/hull\s*\(/g) || []).length * 30
  complexityScore += (scadContent.match(/minkowski\s*\(/g) || []).length * 50
  
  // Check $fn value
  const fn = parameters.$fn || 32
  complexityScore += fn * 0.5
  
  // Estimate time (in seconds)
  // These constants should be calibrated based on real measurements
  const baseTime = 2
  const estimatedSeconds = baseTime + (complexityScore * 0.1)
  
  return {
    seconds: Math.round(estimatedSeconds),
    complexity: complexityScore,
    confidence: complexityScore > 100 ? 'low' : 'medium'
  }
}

// Usage
async function render() {
  const estimate = estimateRenderTime(this.scadContent, this.parameters)
  
  this.showNotification(
    `Estimated render time: ${estimate.seconds}s (${estimate.confidence} confidence)`,
    'info'
  )
  
  // Proceed with render
  const result = await this.sendWorkerMessage({
    type: 'render',
    scadContent: this.scadContent,
    parameters: this.parameters
  })
}
```

---

**Vite Configuration Updates** (`vite.config.js`):
```javascript
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js in separate chunk
          'three': ['three'],
          'three-controls': ['three/examples/jsm/controls/OrbitControls.js'],
          
          // Heavy libraries
          'jszip': ['jszip'],
          'ajv': ['ajv']
        }
      }
    },
    
    // Enable compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug']
      }
    },
    
    // Report bundle size
    reportCompressedSize: true
  },
  
  // Enable build analysis
  plugins: [
    // visualizer({ open: true }) // Uncomment to see bundle visualization
  ]
})
```

**Acceptance Criteria**:
- [ ] Three.js lazy loaded (bundle reduced by ~100KB)
- [ ] WASM download shows progress indicator
- [ ] Memory usage warning at 80% threshold
- [ ] Render time estimation implemented
- [ ] Bundle size reduced by at least 10%
- [ ] Lighthouse performance score > 80 on mobile
- [ ] Code splitting verified with bundle analyzer

---

##### 2.4.4: Font Support for text() Function (Week 4)

**Goal**: Enable OpenSCAD `text()` function by bundling Liberation fonts.

**Background**: OpenSCAD's `text()` function requires system fonts. In WASM, we need to mount font files to the virtual filesystem.

**Implementation Strategy**:

1. **Download fonts** during build (not committed to repo)
2. **Mount fonts** to WASM virtual filesystem on worker initialization
3. **Provide fallback** if fonts unavailable

**Script** (`scripts/setup-fonts.js`):
```javascript
#!/usr/bin/env node
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = path.join(__dirname, '../public/fonts')

const FONTS = [
  {
    name: 'LiberationSans-Regular.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/main/liberation-fonts-ttf-2.1.5/LiberationSans-Regular.ttf'
  },
  {
    name: 'LiberationSans-Bold.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/main/liberation-fonts-ttf-2.1.5/LiberationSans-Bold.ttf'
  },
  {
    name: 'LiberationMono-Regular.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/main/liberation-fonts-ttf-2.1.5/LiberationMono-Regular.ttf'
  }
]

async function downloadFont(font) {
  const outputPath = path.join(FONTS_DIR, font.name)
  
  // Skip if already exists
  if (fs.existsSync(outputPath)) {
    console.log(`✓ ${font.name} already exists`)
    return
  }
  
  console.log(`Downloading ${font.name}...`)
  
  return new Promise((resolve, reject) => {
    https.get(font.url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${font.name}: ${response.statusCode}`))
        return
      }
      
      const file = fs.createWriteStream(outputPath)
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        console.log(`✓ Downloaded ${font.name}`)
        resolve()
      })
    }).on('error', reject)
  })
}

async function setupFonts() {
  // Create fonts directory
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true })
  }
  
  // Download all fonts
  for (const font of FONTS) {
    try {
      await downloadFont(font)
    } catch (err) {
      console.error(`✗ Failed to download ${font.name}:`, err.message)
    }
  }
  
  console.log('\n✓ Font setup complete!')
}

setupFonts().catch(console.error)
```

**Worker: Mount Fonts** (`src/worker/openscad-worker.js`):
```javascript
async function mountFonts() {
  const fontFiles = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf',
    'LiberationMono-Regular.ttf'
  ]
  
  // Create fonts directory in virtual FS
  try {
    self.Module.FS.mkdir('/fonts')
  } catch (err) {
    // Directory might already exist
  }
  
  // Fetch and mount each font
  for (const fontFile of fontFiles) {
    try {
      const response = await fetch(`/fonts/${fontFile}`)
      if (!response.ok) {
        console.warn(`Font not found: ${fontFile}`)
        continue
      }
      
      const fontData = await response.arrayBuffer()
      self.Module.FS.writeFile(`/fonts/${fontFile}`, new Uint8Array(fontData))
      console.log(`✓ Mounted font: ${fontFile}`)
    } catch (err) {
      console.warn(`Failed to mount font ${fontFile}:`, err)
    }
  }
}

// Call during worker initialization
self.addEventListener('message', async (e) => {
  if (e.data.type === 'initialize') {
    // Initialize OpenSCAD WASM
    await initializeOpenSCAD()
    
    // Mount fonts
    await mountFonts()
    
    self.postMessage({ type: 'initialized' })
  }
})
```

**.gitignore Update**:
```
# Fonts (downloaded during build)
public/fonts/*.ttf
```

**NPM Scripts** (`package.json`):
```json
{
  "scripts": {
    "setup-fonts": "node scripts/setup-fonts.js",
    "prebuild": "npm run setup-fonts",
    "dev": "npm run setup-fonts && vite"
  }
}
```

**Documentation** (`docs/TEXT_FUNCTION_SUPPORT.md`):
```markdown
# OpenSCAD text() Function Support

This application supports OpenSCAD's `text()` function for creating 3D text.

## Fonts

We bundle Liberation fonts (GPL/SIL OFL licensed):
- Liberation Sans (Regular, Bold)
- Liberation Mono (Regular)

## Usage in OpenSCAD

\```scad
linear_extrude(height = 5)
  text("Hello World", font = "Liberation Sans", size = 20);
\```

## Font Setup

Fonts are automatically downloaded during build:

\```bash
npm run setup-fonts
\```

This downloads ~500KB of font files to `public/fonts/`.

## Limitations

- Only bundled fonts are available
- Custom fonts not supported in browser WASM
- Font rendering may differ slightly from desktop OpenSCAD

## Troubleshooting

If `text()` produces errors:

1. Verify fonts are downloaded: `ls public/fonts/`
2. Check browser console for font mount messages
3. Try specifying font explicitly: `font = "Liberation Sans"`
```

**Acceptance Criteria**:
- [x] `npm run setup-fonts` downloads fonts automatically
- [x] Fonts are gitignored (not committed to repo)
- [x] Worker mounts fonts on initialization
- [ ] Models using `text()` render correctly
- [ ] Graceful fallback if fonts unavailable (warning, not crash)
- [ ] Documentation added to repo

---

##### 2.4.5: Mobile Browser Limitations Documentation (Week 4)

**Goal**: Document known mobile browser limitations and workarounds.

**New File** (`docs/MOBILE_LIMITATIONS.md`):
```markdown
# Mobile Browser Limitations

This document describes known limitations when using the OpenSCAD Web Customizer on mobile devices.

## Memory Constraints

**Issue**: Mobile browsers have stricter memory limits than desktop browsers.

**Impact**:
- Complex models may fail with "out of memory" errors
- Limit is typically 256-512MB vs 1-2GB on desktop

**Workarounds**:
1. Reduce `$fn` value (e.g., 32 instead of 100)
2. Simplify model geometry
3. Use preview quality for iteration, full quality only for final export
4. Clear browser cache if memory errors persist

## Viewport Resizing

**Issue**: Virtual keyboard and browser chrome (address bar) change the viewport height.

**Status**: ✅ **SOLVED** in v1.4

**Implementation**:
- Uses CSS `dvh` (dynamic viewport height) units
- Fallback for older browsers via Visual Viewport API
- Sticky action bar remains accessible when keyboard open

## Slower Rendering

**Issue**: Mobile CPUs are less powerful than desktop CPUs.

**Impact**:
- STL generation takes 2-3x longer on mobile
- Preview quality renders: 5-15s (vs 2-8s desktop)
- Full quality renders: 30-120s (vs 10-60s desktop)

**Mitigations**:
- Auto-preview uses aggressive $fn capping on mobile
- Render time estimates account for mobile performance
- Progress indicators keep user informed

## Touch Target Sizes

**Requirement**: WCAG 2.1 Level AAA requires 44x44px minimum.

**Status**: ✅ Implemented

**Details**:
- All buttons, sliders, and interactive elements meet 44x44px
- Increased padding on mobile breakpoint
- Larger slider thumbs (32px vs 20px desktop)

## File Upload on iOS

**Issue**: iOS Safari has quirks with file input.

**Status**: ✅ **WORKS** with caveats

**Caveats**:
- File picker shows "Choose File" instead of "Upload"
- Drag-and-drop not supported on iOS (falls back to picker)
- ZIP files supported but may show warning on older iOS

## SharedArrayBuffer Support

**Issue**: Some older mobile browsers don't support SharedArrayBuffer.

**Status**: ✅ **FALLBACK AVAILABLE**

**Requirements**:
- Chrome/Edge Android 92+ (March 2021)
- Safari iOS 15.2+ (December 2021)
- Firefox Android 79+ (August 2020)

**Fallback**: If SharedArrayBuffer unavailable, WASM still works but slightly slower.

## 3D Preview on Low-End Devices

**Issue**: WebGL may struggle with large STL files on budget devices.

**Mitigation**:
- Vertex limit warning (future: auto-decimation)
- Option to disable auto-preview on mobile
- Fallback to wireframe mode if FPS < 15

## Browser Recommendations

|| Browser | Status | Notes |
||---------|--------|-------|
|| Chrome Android 92+ | ✅ Recommended | Best performance |
|| Safari iOS 15.2+ | ✅ Supported | Install as PWA for best experience |
|| Firefox Android 79+ | ✅ Supported | Good performance |
|| Samsung Internet 15+ | ⚠️ Mostly works | Some quirks with file picker |
|| Opera Mobile 64+ | ✅ Supported | Based on Chrome engine |

## PWA Install Benefits on Mobile

Installing as a Progressive Web App (PWA) provides:

- ✅ Full-screen mode (no browser chrome)
- ✅ Faster startup (cached assets)
- ✅ Offline functionality
- ✅ Better memory management
- ✅ Native feel

**To Install**:
- iOS Safari: Share → Add to Home Screen
- Android Chrome: Menu → Install App

## Testing Checklist for Mobile

When testing on mobile devices:

- [ ] Upload .scad file via file picker
- [ ] Upload .zip file via file picker
- [ ] Adjust parameters (sliders, dropdowns, toggles)
- [ ] Verify auto-preview works (may be slower)
- [ ] Download STL
- [ ] Rotate/zoom 3D preview (touch gestures)
- [ ] Toggle theme (Light/Dark)
- [ ] Toggle high contrast mode
- [ ] Save/load presets
- [ ] Export parameters as JSON
- [ ] Verify keyboard appears/disappears without breaking layout
- [ ] Test in portrait and landscape orientations
- [ ] Install as PWA and test offline

## Known Issues (Mobile-Specific)

1. **iOS Safari 15.0-15.1**: SharedArrayBuffer not supported
   - **Fix**: Update to iOS 15.2+
   
2. **Android Chrome < 92**: SharedArrayBuffer requires flags
   - **Fix**: Update browser or enable chrome://flags/#enable-sharedarraybuffer
   
3. **Some Android devices**: Virtual keyboard covers action buttons
   - **Status**: Mitigated with Visual Viewport API
   - **Fallback**: Scroll down to access buttons

4. **iPad Safari**: Sometimes treats as desktop, causing layout issues
   - **Status**: Media queries adjusted to handle iPad correctly
```

**Acceptance Criteria**:
- [x] Mobile limitations documented
- [x] Workarounds provided
- [x] Browser compatibility matrix included
- [x] Testing checklist provided
- [ ] Linked from main README

### Future Direction: Embeddable Tool

> **Design Philosophy**: This is a **tool**, not a social platform. It is designed to be embedded within existing communities (Printables, Thingiverse, personal blogs, maker sites) rather than becoming its own platform.

**What This Tool Is:**
- A standalone customizer that works anywhere (no server required)
- Embeddable in existing websites via iframe or scaffolded apps
- A developer toolkit for creating dedicated customizers

**What This Tool Is NOT:**
- A model hosting service
- A social platform with accounts, galleries, or remixes
- A replacement for existing 3D printing communities

**Embedding Use Cases:**

| Use Case | Implementation |
|----------|----------------|
| **Personal blog/portfolio** | Use `openscad-forge scaffold` to create a dedicated customizer page |
| **Maker marketplace integration** | Embed the tool via iframe with URL parameters for the model |
| **Documentation sites** | Include live customizer demos alongside OpenSCAD tutorials |
| **Educational platforms** | Embed for interactive 3D printing curriculum |

**Embedding via iframe:**

```html
<!-- Embed in any website -->
<iframe 
  src="https://your-deployment.vercel.app/#model=encoded-scad"
  width="100%" 
  height="600"
  style="border: none;"
  allow="cross-origin-isolated"
></iframe>
```

**Embedding via Scaffolded App:**

```bash
# Create a dedicated customizer for a specific model
openscad-forge extract my-model.scad --out schema.json
openscad-forge scaffold --schema schema.json --scad my-model.scad --out my-customizer/

# Deploy to any static host (Vercel, Netlify, GitHub Pages, etc.)
cd my-customizer && npm run build
```

**Future v2.5+ Enhancements (potential):**
- Improved iframe message passing for parent page communication
- Query parameter API for pre-filling parameters
- Lightweight embed mode (hide upload UI when model is pre-loaded)
- postMessage events for render completion notifications

---

## Contributing

### Code Style

**JavaScript**:
- Use modern ES6+ syntax
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Add JSDoc comments for public functions

```javascript
/**
 * Extracts Customizer parameters from OpenSCAD source code
 * @param {string} scadContent - The .scad file content
 * @returns {Object} Parameter schema in internal format
 * @throws {Error} If parsing fails critically
 */
function extractParameters(scadContent) {
  // Implementation
}
```

**CSS**:
- Use CSS custom properties for theming
- Mobile-first responsive design
- BEM-inspired naming for components
- Group related properties (box model, typography, visual)
- Comment complex selectors

**HTML**:
- Semantic HTML5 elements
- ARIA labels where needed
- Progressive enhancement (works without JS for basic content)

### Git Workflow

**Branch Naming**:
- `feature/parameter-extraction` - New features
- `fix/slider-range-bug` - Bug fixes
- `docs/api-documentation` - Documentation
- `refactor/state-management` - Code refactoring

**Commit Messages**:
```
type(scope): short description

Longer explanation if needed.

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Pull Request Process**:
1. Create feature branch from `main`
2. Implement feature with tests
3. Update documentation
4. Ensure accessibility (run Lighthouse)
5. Create PR with description
6. Address review comments
7. Squash and merge when approved

### Testing Checklist (Before PR)

- [ ] Tested in Chrome, Firefox, Safari
- [ ] Tested on mobile (iOS Safari, Android Chrome)
- [ ] Keyboard navigation works
- [ ] Screen reader tested (NVDA or VoiceOver)
- [ ] Lighthouse accessibility score 90+
- [ ] No console errors or warnings
- [ ] Works with example models
- [ ] Error states handled gracefully
- [ ] Code formatted with Prettier
- [ ] No linter errors

---

## Build Plan Summary & Current Status

### Overview

This build plan has evolved significantly since its inception in January 2026. What started as a CLI-focused developer toolchain has become a comprehensive ecosystem featuring:

1. **Production-ready web application** (v1.0 - v1.12)
2. **Complete developer toolchain** (v2.0 - v2.2)
3. **Production hardening** (v2.3)
4. **Future roadmap** (v2.4+)

### What's Been Accomplished (v0.1.0 → v2.3.0)

#### Core Application (v1.0-v1.12) ✅ **COMPLETE**

**Foundation (v1.0)**:
- ✅ Browser-based OpenSCAD WASM integration
- ✅ Real-time parameter extraction from .scad files
- ✅ Auto-generated, accessible UI (WCAG 2.1 AA)
- ✅ Client-side STL generation
- ✅ Three.js 3D preview with orbit controls
- ✅ Smart file downloads with format selection

**Enhanced Usability (v1.1)**:
- ✅ URL parameter sharing for configurations
- ✅ Auto-save to localStorage with 7-day expiration
- ✅ Keyboard shortcuts (Ctrl+Enter, R, D)
- ✅ Example models (Simple Box, Parametric Cylinder, Universal Cuff)
- ✅ JSON export for parameter configurations

**Advanced Features (v1.2-v1.7)**:
- ✅ Auto-preview system with progressive quality
- ✅ Render caching (LRU, 10 entries)
- ✅ ZIP upload for multi-file projects
- ✅ Virtual filesystem for include/use statements
- ✅ Dark mode with theme toggle
- ✅ High contrast mode (WCAG AAA 7:1)
- ✅ Multiple output formats (STL, OBJ, OFF, AMF, 3MF)
- ✅ Parameter presets with save/load/import/export

**Professional Features (v1.8-v1.12)**:
- ✅ STL measurements (dimensions, volume, bounding box)
- ✅ Comparison view (side-by-side rendering)
- ✅ OpenSCAD library bundles (MCAD, BOSL2, NopSCADlib, dotSCAD)
- ✅ Advanced parameter types (color picker, vector inputs)
- ✅ Render queue for batch processing
- ✅ PWA support with offline functionality

**Stats**:
- **55+ features** implemented
- **~5,500 lines** of production code
- **180.31KB** gzipped bundle size
- **3.05s** build time
- **WCAG 2.1 AA** (AAA for high contrast mode)
- **Cross-browser** tested (Chrome, Firefox, Safari, Edge)

---

#### Developer Toolchain (v2.0-v2.2) ✅ **COMPLETE**

**CLI Tools (v2.0)**:
- ✅ `extract` — Extract parameters from .scad to JSON Schema
- ✅ `scaffold` — Generate standalone web apps
- ✅ `validate` — Verify schema compliance and structure
- ✅ `sync` — Auto-fix common issues

**Enhanced Tooling (v2.1)**:
- ✅ React template support
- ✅ Theme generator (6 presets + custom colors)
- ✅ CI/CD helpers (GitHub Actions, GitLab CI, Docker, Vercel, Netlify)
- ✅ Golden fixtures for regression testing

**Additional Templates (v2.2)**:
- ✅ Vue 3 template (Composition API)
- ✅ Svelte template
- ✅ Enhanced auto-fix (15+ checks)
- ✅ Better reporting and diff output

**Total**: **4 framework templates** (Vanilla, React, Vue, Svelte)

---

#### Production Hardening (v2.3) ✅ **COMPLETE**

- ✅ Comprehensive codebase audit
- ✅ Debug code removal
- ✅ Version string alignment
- ✅ Production-ready verification

---

### What's Documented (But Not Yet Implemented)

This build plan now includes **comprehensive implementation guides** for:

#### v2.4 Features (Planned - Fully Specified) 📋

**1. Testing Infrastructure**:
- 📋 Vitest unit tests (parser, state, presets, theme manager)
- 📋 Playwright E2E tests (upload → customize → download)
- 📋 Automated accessibility scans (axe-core)
- 📋 GitHub Actions CI workflow
- **Target**: 80%+ code coverage

**2. Performance Optimization**:
- 📋 Three.js lazy loading (save ~100KB)
- 📋 WASM download progress indicator
- 📋 Memory usage monitoring with warnings
- 📋 Render time estimation
- 📋 Code splitting and tree shaking
- **Target**: 10% bundle size reduction, Lighthouse > 80 mobile

**3. Documentation & Onboarding**:
- 📋 Font setup automation for `text()` function
- 📋 Mobile browser limitations guide
- 📋 SharedArrayBuffer fallback documentation
- 📋 First-time user tour/guide

#### P1/P2 Features (Fully Specified) 📋

**P1 (High Priority)** — ✅ ALL COMPLETE in v2.5.0:
- ✅ **Help Tooltips**: Question mark icons with parameter guidance
- ✅ **Cancel Generation Button**: Visible UI to stop long renders
- ✅ **Unit Display**: Show mm, degrees, etc. next to inputs

**P2 (Medium Priority)**:
- 📋 **Dependency Visibility**: Hide/show parameters based on other values
- 📋 **Undo/Redo**: 50-level parameter history with Ctrl+Z/Shift+Z
- 📋 **Preview LOD**: Warn about large meshes, offer simplification

**Status**: All 6 features have complete implementation guides with:
- ✅ Architecture diagrams
- ✅ Step-by-step code examples
- ✅ CSS styling
- ✅ Accessibility considerations
- ✅ Acceptance criteria

#### GitHub Actions CI/CD (Fully Specified) 📋

**5 Production-Ready Workflows**:
- 📋 **CI**: Linting, unit tests, E2E tests, builds, accessibility scans
- 📋 **CD**: Vercel deployment with smoke tests
- 📋 **Release**: Automated GitHub releases with changelogs
- 📋 **Dependencies**: Weekly automated dependency updates
- 📋 **Lighthouse CI**: Performance/accessibility scoring on PRs

**Status**: Complete workflow YAML files ready to copy-paste.

---

### What This Build Plan Provides

#### For New Contributors

**Quick Start**:
- ✅ Day 1 checklist (25 items)
- ✅ Repo bootstrap instructions
- ✅ Path guide for finding files
- ✅ Development workflow

**Learning Resources**:
- ✅ 15+ code examples (good vs bad)
- ✅ 40+ best practices
- ✅ 25+ common pitfalls with solutions
- ✅ Architecture diagrams
- ✅ Testing strategies
- ✅ Debugging tips

#### For Feature Implementation

**P1/P2 Features**: Each has:
- ✅ Design mockups (ASCII art)
- ✅ Complete code implementations
- ✅ CSS styling
- ✅ Accessibility patterns
- ✅ Event handlers
- ✅ Worker integration (where applicable)
- ✅ 8-15 acceptance criteria per feature

**Example Depth**: Help Tooltips feature includes:
- 242 lines of implementation code
- 70 lines of CSS
- 15 lines of HTML
- Keyboard navigation logic
- Screen reader announcements
- Mobile-responsive positioning
- Theme-aware styling

#### For Quality Assurance

**Testing Infrastructure**:
- ✅ Vitest configuration with coverage thresholds
- ✅ 20+ example unit tests
- ✅ 5+ example E2E tests
- ✅ Accessibility test examples
- ✅ CI/CD workflow integration

**GitHub Actions**:
- ✅ 5 complete workflow files
- ✅ Branch protection rules
- ✅ Required status checks
- ✅ Monitoring and badges
- ✅ Troubleshooting guide

#### For Production Deployment

**Comprehensive Guides**:
- ✅ Vercel configuration
- ✅ COOP/COEP headers setup
- ✅ Environment variables
- ✅ Smoke testing
- ✅ Rollback procedures

**Performance**:
- ✅ Bundle optimization strategies
- ✅ Lazy loading patterns
- ✅ Memory leak prevention
- ✅ Three.js disposal patterns

---

### Document Statistics

**Size**: 8,560+ lines (430KB)

**Sections**:
- 12 major sections
- 97 subsections
- 340+ headings

**Code Examples**:
- 150+ code snippets
- 45+ "bad vs good" comparisons
- 15+ configuration files
- 8+ complete workflows

**Checklists**:
- 200+ acceptance criteria items
- 50+ testing checklist items
- 25+ pre-release validation items
- 15+ troubleshooting solutions

---

### How to Use This Build Plan

#### As a Roadmap

1. **Current State**: Refer to [Changelog](#changelog) for what's been built
2. **Next Steps**: See [v2.4 Implementation Plan](#detailed-implementation-plan-for-v24)
3. **Long Term**: Review [Post-Launch Roadmap](#post-launch-roadmap-beyond-v2)

#### As an Implementation Guide

1. **Find Feature**: Use [Document Navigation](#document-navigation) table
2. **Read Specification**: Architecture, design, requirements
3. **Copy Code**: Complete implementations provided
4. **Run Tests**: Acceptance criteria included
5. **Verify**: Checklist confirmation

#### As a Reference

1. **Best Practices**: See [Best Practices](#best-practices-and-common-pitfalls)
2. **Common Issues**: See [Common Pitfalls](#common-pitfalls)
3. **Debugging**: See [Debugging Tips](#debugging-tips)
4. **Accessibility**: See [Accessibility Best Practices](#accessibility-best-practices)
5. **Performance**: See [Performance Best Practices](#performance-best-practices)

---

### Versioning and Maintenance

**Current Version**: v2.3.0 (Build Plan Document)

**Last Updated**: 2026-01-15

**Next Review**: After v2.4 release (estimated Q2 2026)

**Maintenance**:
- Version number updated with each major release
- Changelog maintained reverse-chronologically
- New features add implementation guides when planned
- Completed features move to changelog section
- Lessons learned added to best practices

---

### Contributing to This Document

**What to Add**:
- ✅ New feature specifications with implementation guides
- ✅ Best practices discovered during development
- ✅ Common pitfalls and solutions
- ✅ Architecture improvements
- ✅ Testing strategies

**What NOT to Add**:
- ❌ Generated code dumps without explanation
- ❌ Temporary implementation notes (use code comments)
- ❌ Debugging logs (use issue tracker)
- ❌ Personal opinions without rationale

**Format**:
- Use heading hierarchy consistently
- Include acceptance criteria for features
- Provide "bad vs good" examples
- Add rationale for decisions
- Link to external references where appropriate

---

### Success Criteria for v2.4 (Next Milestone)

When v2.4 is complete, this build plan should be updated to reflect:

- [ ] Vitest unit tests with 80%+ coverage
- [ ] Playwright E2E tests passing in CI
- [ ] Lighthouse mobile score > 80
- [ ] Bundle size reduced by 10%
- [ ] WASM loading progress indicator
- [x] Mobile limitations documented
- [x] Font support implemented (Liberation fonts bundled in v2.5.0)
- [x] All P1 features implemented (Help Tooltips, Cancel Button, Unit Display) — v2.5.0

**Estimated Timeline**: 4 weeks (1 week per subsection of v2.4)

---

## Changelog

### v1.12.0 (2026-01-14) — Render Queue (Batch Rendering)

- **MILESTONE**: v1.2 Advanced Features COMPLETE 🎉
- **Added**: Comprehensive render queue system for batch processing
  - Queue management (add, remove, cancel, clear)
  - Sequential job processing (up to 20 jobs)
  - Per-job state tracking (queued, rendering, complete, error, cancelled)
  - Job editing (rename, edit parameters)
  - Download completed renders with correct format
  - Export/import queue as JSON
- **Added**: RenderQueue class (446 lines)
  - CRUD operations for queue jobs
  - Sequential processing engine
  - Event subscription system
  - Statistics and metrics calculation
- **Added**: Queue modal UI
  - Job list with visual state indicators
  - Queue controls (Process, Stop, Clear, Export, Import)
  - Real-time statistics display
  - Per-job actions (Download, Edit, Cancel, Remove)
  - Editable job names (contenteditable)
- **Added**: Queue badge in actions bar
  - Shows current job count
  - Updates in real-time
- **Enhanced**: Integration with existing features
  - RenderController for rendering
  - Download manager for multi-format downloads
  - Multi-file project support (ZIP)
  - Library bundle support
  - Theme system (light/dark/high-contrast)
- **Technical**: +1,146 lines across 4 files
  - render-queue.js: 446 lines (new)
  - main.js: +350 lines (integration)
  - index.html: +80 lines (modal UI)
  - components.css: +270 lines (styling)
- **Build time**: 2.89s ✅
- **Bundle size impact**: +2.5KB gzipped (64.57KB total, +4.0%)
- **Accessibility**: WCAG 2.1 AA compliant
  - Full keyboard navigation
  - Screen reader support with ARIA
  - Focus management
  - High contrast mode support
- **Browser compatibility**: Chrome 67+, Firefox 79+, Safari 15.2+, Edge 79+
- **Known limitations**:
  - Queue not persistent (cleared on refresh)
  - Sequential processing only (no parallelization)
  - 20 job maximum to prevent memory issues
  - Export excludes binary data (parameters only)
- **v1.2 Milestone Complete**: All 7 features delivered
  - ✅ v1.6.0: Multiple Output Formats
  - ✅ v1.7.0: Parameter Presets
  - ✅ v1.8.0: STL Measurements
  - ✅ v1.9.0: Comparison View
  - ✅ v1.10.0: OpenSCAD Library Bundles
  - ✅ v1.11.0: Advanced Parameter Types
  - ✅ v1.12.0: Render Queue
- **v2.0 Milestone Complete**: Developer Toolchain released
  - ✅ v2.0.0: CLI Tools (extract, scaffold, validate, sync)
- **v2.1 Milestone Complete**: Enhanced CLI released
  - ✅ v2.1.0: React templates, theme generator, CI/CD helpers
- **v2.2 Milestone Complete**: Additional Templates & Enhanced Tooling released
  - ✅ v2.2.0: Vue and Svelte templates, enhanced auto-fix, golden fixtures
- **v2.3 Milestone Complete**: Audit & Polish release
  - ✅ v2.3.0: Debug code removal, version string alignment, codebase audit
- **v2.5 Milestone Complete**: UX Enhancements release
  - ✅ v2.5.0: Help tooltips, cancel button, unit display, font support
- **Next**: v2.6 - Performance optimization, additional testing

### v2.5.0 (2026-01-16) — UX Enhancements Release

**Features**:
- ✅ Help Tooltips for parameters with descriptions
- ✅ Cancel Generation Button visible during rendering
- ✅ Unit Display for numeric parameters (mm, °, %, etc.)
- ✅ Liberation Font bundle for OpenSCAD text() function

### v2.4.0 (2026-01-16) — Testing Infrastructure Release

- **MILESTONE**: Comprehensive testing infrastructure COMPLETE 🎉
- **Added**: Unit testing suite with Vitest
  - 239 tests across 14 modules
  - 88.82% coverage on parser module
  - 100% coverage on download module
  - Test fixtures for OpenSCAD file validation
  - Mock-based testing for localStorage and DOM
- **Added**: E2E testing framework with Playwright
  - 42 tests covering 5 workflows
  - Basic workflow (upload → customize → download)
  - Accessibility compliance with axe-core
  - Keyboard navigation validation
  - ZIP upload workflow
  - Preset save/load workflow
  - Theme switching workflow
- **Added**: GitHub Actions CI/CD pipeline
  - Unit test execution with coverage reporting
  - E2E test execution with artifact upload
  - Build verification and bundle size monitoring
  - Markdown linting
- **Added**: Documentation
  - TESTING.md - Complete testing guide
  - PERFORMANCE.md - Performance optimization strategies
  - MOBILE_LIMITATIONS.md - Mobile browser limitations
  - TROUBLESHOOTING.md - Common issues and solutions
- **Fixed**: Theme Manager API updated for consistency
- **Technical**: +3,500 lines of test code
- **Dependencies**: @playwright/test, @axe-core/playwright, vitest, @vitest/ui, @vitest/coverage-v8
- **Test count**: 239 unit tests + 42 E2E tests
- **Coverage**: 58.6% overall, 80%+ on core modules

### v2.3.0 (2026-01-15) — Audit & Polish Release

- **MILESTONE**: Codebase audit and production hardening COMPLETE 🎉
- **Fixed**: Removed debug fetch call from `auto-preview-controller.js`
  - Debug logging to localhost endpoint removed from production code
  - Improves security and eliminates console errors in production
- **Fixed**: Version string alignment across all files
  - `src/main.js` updated from v1.9.0 to v2.3.0
  - `public/sw.js` CACHE_VERSION updated from v1.9.0 to v2.3.0
  - `package.json` version bumped to 2.3.0
- **Audited**: Core runtime modules reviewed for correctness
  - `src/js/auto-preview-controller.js` - cleaned and verified
  - `src/js/parser.js` - verified correct
  - `src/js/preview.js` - verified correct
  - `src/js/library-manager.js` - verified correct
  - `src/js/render-queue.js` - verified correct
  - `src/worker/openscad-worker.js` - verified correct
- **Technical**: 
  - No new features added (polish release)
  - Service Worker cache will auto-invalidate due to version bump
  - All existing functionality preserved

### v2.2.0 (2026-01-15) — Additional Templates & Enhanced Tooling

- **MILESTONE**: Additional framework templates and enhanced CLI tooling COMPLETE 🎉
- **Added**: Vue 3 template support for scaffold command
  - Full Vue 3 Composition API architecture
  - Script setup syntax for cleaner code
  - Reactive state management with ref and watch
  - Component structure (App, Header, Parameters, Preview, Control)
  - Theme system integration
  - Three.js preview integration
  - Web Worker support
  - URL parameter persistence
  - Vite + Vue plugin configuration
  - Accessibility features
  - Mobile-responsive design
- **Added**: Svelte template support for scaffold command
  - Modern Svelte 4 template
  - Reactive declarations and stores
  - Scoped component styles
  - lib folder component structure
  - Three.js preview integration
  - Web Worker support
  - URL parameter persistence
  - Vite + Svelte plugin configuration
  - Minimal boilerplate
  - Performance optimizations
- **Enhanced**: Scaffold command with 4 template options
  - Now supports: vanilla, react, vue, svelte
  - Automatic framework-specific dependencies
  - Template-specific vite.config.js generation
  - Framework detection and validation
  - Better error messages with template suggestions
- **Enhanced**: Sync command with improved auto-fix capabilities
  - Outdated Vite version detection and fix
  - Missing jszip dependency detection and fix
  - Missing preview script detection and fix
  - Console.log detection (warning only)
  - Missing worker file detection
  - Dark theme support detection
  - Missing README detection
  - Code quality issue detection
  - Enhanced reporting with categories
  - Better suggestions for manual fixes
  - Total 15+ auto-fix checks
- **Enhanced**: Validate command with golden fixtures system
  - Save test cases as golden fixtures
  - Load and compare against fixtures
  - Parameter value comparison
  - Diff reporting for mismatches
  - Detailed failure output with color-coded differences
  - JSON fixture storage in test/fixtures/
  - --save-fixtures CLI option
  - Enhanced validation reporting
- **Documentation**: 
  - Created CHANGELOG_v2.2.md
  - Created V2.2_COMPLETION_SUMMARY.md
  - Updated main CHANGELOG.md
  - Updated README.md with v2.2.0 features
- **Version**: Bumped to 2.2.0
- **Technical**: ~2,800 lines of new code
  - Vue template: 13 files, ~1,400 lines
  - Svelte template: 13 files, ~1,300 lines
  - Enhanced sync: ~100 lines
  - Enhanced validate: ~150 lines
  - CLI updates: ~50 lines
  - Documentation: ~800 lines
- **Template Comparison**:
  - Vanilla: Good baseline, ~62KB gzipped
  - React: Component architecture, ~68KB gzipped
  - Vue: Excellent DX, ~65KB gzipped
  - Svelte: Fastest builds, ~60KB gzipped (smallest!)
- **Bundle Size Impact**: All templates <70KB gzipped ✅
- **Build Time**: All templates <4s ✅
- **Accessibility**: All templates WCAG 2.1 AA compliant ✅
- **Browser Compatibility**: All templates support Chrome 67+, Firefox 79+, Safari 15.2+, Edge 79+

### v2.1.0 (2026-01-15) — Enhanced CLI

- **MILESTONE**: Enhanced CLI with React templates, theme generation, and CI/CD automation
- **Added**: React template support for scaffold command
  - Full React 18 component architecture
  - Pre-built components (App, Header, ParametersPanel, PreviewPanel, ParameterControl)
  - React hooks for state management (useState, useEffect)
  - Vite + React plugin configuration
  - TypeScript types included
  - URL parameter persistence via hash
  - Web Worker integration for WASM
  - Modern JSX syntax
- **Added**: Theme generator command (`openscad-forge theme`)
  - 6 built-in presets (blue, purple, green, orange, slate, dark)
  - Custom theme generation from hex colors
  - Automatic shade generation (hover/active states)
  - CSS custom properties (25+ variables)
  - Accessibility support (high contrast, reduced motion)
  - Color validation
  - Theme preview in CLI output
- **Added**: CI/CD generator command (`openscad-forge ci`)
  - GitHub Actions workflow (testing, deployment, artifacts)
  - GitLab CI/CD pipeline (multi-stage)
  - Vercel deployment configuration
  - Netlify deployment configuration
  - Docker containerization (Dockerfile, nginx, docker-compose)
  - Golden fixtures validation system
  - Provider-specific instructions and next steps
- **Updated**: Scaffold command
  - `--template` option (vanilla|react)
  - React-specific dependency injection
  - Template variable substitution
- **Documentation**:
  - Updated README with v2.1 features
  - Created CHANGELOG_v2.1.md
  - Created V2.1_COMPLETION_SUMMARY.md
- **Version**: Bumped to 2.1.0
- **Technical**: ~2,400 lines of new code
  - Theme command: 420 lines
  - CI command: 570 lines
  - React template: 10 files, 600+ lines
  - Documentation: 3 files, 800+ lines
- **Use Cases**:
  - Modern React-based customizers
  - Custom branded themes
  - Automated CI/CD pipelines
  - Docker deployments
- **Templates**:
  - Vanilla JS (default)
  - React (new)
- **Themes**:
  - Blue (professional, default)
  - Purple (creative)
  - Green (nature-focused)
  - Orange (energetic)
  - Slate (monochrome)
  - Dark (low-light)
- **CI/CD Providers**:
  - GitHub Actions
  - GitLab CI/CD
  - Vercel
  - Netlify
  - Docker
  - Validation (golden fixtures)

### v2.0.0 (2026-01-15) — Developer Toolchain

- **MILESTONE**: Developer toolchain complete with CLI tools for automation
- **Added**: Command-line interface (`openscad-forge`)
  - NPM bin configuration for global installation
  - Commander.js integration for command parsing
  - Chalk for colorized terminal output
  - Main entry point: `bin/openscad-forge.js`
- **Added**: Extract command (`openscad-forge extract`)
  - Extract parameters from .scad files to JSON Schema
  - Support for all parameter types (number, string, boolean, enum)
  - Group metadata preservation (`x-groups`)
  - Parameter ordering (`x-order`)
  - Custom hints (`x-hint` for color, file, etc.)
  - Pretty-print JSON formatting
  - Detailed extraction summary with parameter counts
- **Added**: Scaffold command (`openscad-forge scaffold`)
  - Generate standalone web apps from schema + .scad file
  - Vanilla JS template support (React planned for v2.1)
  - Automatic directory structure creation
  - Source code copying (all modules)
  - Public assets copying (WASM, libraries)
  - Schema and SCAD embedding in HTML
  - package.json generation with dependencies
  - README.md with parameter tables
  - vite.config.js and .gitignore
  - Custom app title support
- **Added**: Validate command (`openscad-forge validate`)
  - Schema structure validation
  - Parameter property validation
  - Required file checking
  - Accessibility feature detection (focus-visible, reduced-motion)
  - Test case loading (JSON/YAML)
  - Multiple output formats (text, JSON, JUnit XML)
  - Exit code support for CI/CD
- **Added**: Sync command (`openscad-forge sync`)
  - Comprehensive issue detection
  - Outdated dependency detection (Three.js, Ajv)
  - Missing script detection
  - Accessibility issue detection (lang, viewport)
  - Missing file detection (vite.config.js, .gitignore)
  - Safe auto-fix mode (`--apply-safe-fixes`)
  - Force mode (`--force`)
  - Dry-run mode (`--dry-run`)
  - Detailed fix reporting with success/failure counts
- **Dependencies**: Added commander@^11.1.0, chalk@^5.3.0
- **Technical**: ~1,265 lines of new code
  - CLI entry point: 75 lines
  - Extract command: 213 lines
  - Scaffold command: 350 lines
  - Validate command: 302 lines
  - Sync command: 325 lines
- **Documentation**: 
  - Updated README with CLI usage examples
  - Created CHANGELOG_v2.0.md
  - Created V2.0_COMPLETION_SUMMARY.md
- **Version**: Bumped to 2.0.0
- **Use Cases**: 
  - Batch parameter extraction for CI/CD
  - Automated web app generation
  - Project validation in pipelines
  - Maintenance automation
- **Performance**:
  - Extract: ~50ms for 47 parameters
  - Scaffold: ~500ms including file copying
  - Validate: ~100ms for basic checks
  - Sync: ~150ms for detection + fixes

### v1.11.1 (2026-01-14) — UI Improvements for Button Visibility

- **ENHANCEMENT**: Sticky action buttons at bottom of preview panel
- **Fixed**: Action buttons no longer scroll off-screen
- **Added**: Dynamic viewport height support for mobile browsers
  - `100svh` (small viewport height) support
  - `100dvh` (dynamic viewport height) support
  - Proper handling of mobile browser chrome (address bar)
- **Added**: Safe area inset support for notched devices
  - Header respects `safe-area-inset-top`
  - Actions bar respects `safe-area-inset-bottom`
  - Modal dialogs respect all safe area insets
  - PWA notifications positioned with safe area
- **Added**: Scrollable preview content wrapper
  - New `.preview-content` div wraps scrollable elements
  - Actions bar positioned outside scrollable area
  - Sticky positioning with shadow for visual separation
- **Added**: Mobile-specific action button styling
  - Compact padding on mobile (< 768px)
  - Flex-wrap for button row layout
  - Full-width primary action button on mobile
  - Smaller font size on compact viewports
- **Enhanced**: Dark mode scrollbar contrast
  - WebKit scrollbar styling for dark themes
  - Firefox scrollbar colors for dark mode
  - Consistent styling across all scrollable areas
- **Enhanced**: Preview panel flexbox layout
  - Proper `min-height: 0` for flex child scrolling
  - `flex-shrink: 0` on actions for stable positioning
  - z-index layering for sticky elements
- **Technical**: +207 lines in layout.css, +65 lines in components.css
- **Tested**: Chrome, Firefox, Safari, Edge
- **Tested**: Mobile viewports (iOS Safari, Android Chrome)

### v1.11.0 (2026-01-14) — Advanced Parameter Types

- **MILESTONE**: Advanced parameter types complete (v1.2 Advanced Features)
- **Added**: Color picker parameter type
  - HTML5 color input with visual preview swatch
  - Hex code text field (RRGGBB format)
  - Real-time color preview
  - Automatic RGB array conversion for OpenSCAD
- **Added**: File upload parameter type
  - File selection button with native file picker
  - File info display (name, size)
  - Clear file button
  - Extension filtering support
  - Base64 data URL encoding
- **Added**: Parser detection for advanced types
  - `[color]` hint → Color picker control
  - `[file]` or `[file:ext1,ext2]` → File upload control
  - Backward compatible with existing parameters
- **Added**: Colored Box example
  - Demonstrates color parameter usage
  - 2 color parameters (box_color, accent_color)
  - RGB conversion to OpenSCAD format
  - Optional lid and feet customization
- **Enhanced**: Parameter-to-OpenSCAD conversion
  - `hexToRgb()` function for color conversion
  - File object handling (name, data, size)
  - Null/undefined value handling
  - Array value support
- **Enhanced**: UI components
  - Color picker with preview, native input, hex field
  - File upload with button, info, clear
  - Theme-aware styling (light/dark/high-contrast)
  - Responsive mobile layout
  - Full keyboard accessibility
- **Technical**: +605 lines across 6 files
  - parser.js: +30 lines (type detection)
  - ui-generator.js: +230 lines (color/file components)
  - openscad-worker.js: +60 lines (conversion logic)
  - components.css: +280 lines (styling)
  - index.html: +1 line (example button)
  - main.js: +4 lines (example config)
- **Technical**: +1 new example file
  - colored_box.scad: 108 lines
- **Build time**: 2.67s ✅
- **Bundle size impact**: +30 bytes (+0.03KB gzipped)
- **Accessibility**: WCAG 2.1 AA compliant
  - Full keyboard navigation
  - Screen reader support with ARIA labels
  - Focus indicators and touch targets
  - High contrast mode enhanced styling
- **Browser compatibility**: Chrome 20+, Firefox 29+, Safari 12.1+, Edge 14+
- **Known limitations**:
  - File parameters pass filename only (no virtual FS mount in v1.11)
  - Color preview only (not exported to STL)
  - 5MB file size limit
  - RGB colors only (no alpha/transparency)
- **Next**: v1.12.0 - Render Queue (final v1.2 feature)

### v1.10.0 (2026-01-14) — OpenSCAD Library Bundles

- **MILESTONE**: OpenSCAD library bundle support complete (v1.2 Advanced Features)
- **Added**: Comprehensive library management system
  - 4 pre-configured libraries (MCAD, BOSL2, NopSCADlib, dotSCAD)
  - Auto-detection of library usage in .scad files
  - Auto-enable detected libraries
  - Manual enable/disable via checkbox UI
  - Persistent preferences via localStorage
- **Added**: LibraryManager class (326 lines)
  - Centralized library state management
  - Enable/disable/toggle methods
  - Auto-detection of `include <Library/>` and `use <Library/>` statements
  - Event subscription system for UI updates
  - getMountPaths() for worker integration
  - Statistics and housekeeping methods
- **Added**: Library UI components
  - Collapsible library control panel in parameters section
  - Library checkboxes with icons (⚙️, 🔷, 🖨️, 🎨)
  - Library descriptions and metadata
  - Badge showing enabled library count (0-4)
  - "Required" badges on auto-detected libraries
  - Help dialog explaining library usage
  - Full keyboard accessibility (Tab, Enter, Space)
- **Added**: Virtual filesystem integration
  - Worker mounts libraries from public/libraries/
  - Manifest-based file loading (44-50 files per library)
  - Efficient caching (libraries stay mounted)
  - Multiple library support (all can be enabled simultaneously)
  - Progress reporting during library mounting
- **Added**: Library Test example
  - Demonstrates MCAD library usage (roundedBox function)
  - 6 customizable parameters (dimensions, style)
  - Available via "📚 Library Test (MCAD)" button on welcome screen
  - Auto-enables MCAD library when loaded
- **Added**: Setup script (scripts/setup-libraries.js)
  - Automated library download from GitHub
  - Git-based installation
  - Manifest generation with metadata
  - Status reporting and summary
  - Run with: `npm run setup-libraries`
- **Enhanced**: Render pipeline
  - AutoPreviewController passes library list to renders
  - RenderController accepts `libraries` option
  - Worker receives and mounts libraries before rendering
  - Libraries available to OpenSCAD during execution
- **Technical**: +386 lines across 5 files
  - library-manager.js: 326 lines (new)
  - main.js: +15 lines (library UI rendering, example loading)
  - index.html: +1 line (Library Test button)
  - library_test.scad: 44 lines (new example)
  - Worker: existing library mounting (already implemented)
- **Bundle size impact**: +0KB (library-manager.js reused existing patterns)
- **Performance**: Library mounting 1-2s (MCAD), cached thereafter
- **Memory overhead**: +10-30MB (depending on enabled libraries)
- **Accessibility**: WCAG 2.1 AA compliant
  - Full keyboard navigation
  - Screen reader support with ARIA labels
  - Focus indicators and touch targets
  - High contrast mode with enhanced styling
- **Browser compatibility**: Chrome 120+, Firefox 121+, Safari 17+, Edge 120+
- **Documentation**: 
  - Library Testing Guide (10 comprehensive test scenarios)
  - V1.10 Completion Summary
  - CHANGELOG_v1.10.md
- **Libraries supported**:
  - MCAD: Mechanical components (gears, screws, bearings, boxes) - LGPL-2.1
  - BOSL2: Advanced geometry, attachments, rounding - BSD-2-Clause
  - NopSCADlib: 3D printer parts library - GPL-3.0
  - dotSCAD: Artistic patterns and designs - LGPL-3.0
- **User experience**:
  - Auto-detection makes feature discoverable
  - One-click enable/disable
  - Clear visual feedback (badges, borders)
  - Help dialog for guidance
  - Persistent preferences across sessions

### v1.9.0 (2026-01-14) — Comparison View

- **MILESTONE**: Comparison view feature complete (v1.2 Advanced Features)
- **Added**: Multi-variant comparison system
  - Compare up to 4 parameter variants side-by-side
  - Independent 3D previews for each variant
  - Batch rendering capability for all variants
  - Real-time state tracking (pending, rendering, complete, error)
- **Added**: Variant management UI
  - Add variants from current parameters
  - Rename variants inline with editable names
  - Edit variants by switching back to normal mode
  - Delete variants with confirmation prompt
  - Export/import comparison sets as JSON
- **Added**: Per-variant controls
  - Individual render buttons (🔄)
  - Download STL buttons with variant-specific filenames (⬇️)
  - Edit parameter buttons (✏️)
  - Delete variant buttons (🗑️)
  - Visual state indicators (color-coded badges)
- **Added**: Comparison mode interface
  - "Add to Comparison" button in main interface
  - Global comparison controls (Add, Render All, Export, Exit)
  - Split-screen grid layout (4 → 2 → 1 responsive)
  - Empty state placeholder
  - Mode switching (normal ↔ comparison)
- **Added**: ComparisonController class (273 lines)
  - Variant CRUD operations
  - Sequential rendering strategy
  - Event subscription system
  - Import/export functionality
  - Statistics tracking (total, pending, rendering, complete, error)
- **Added**: ComparisonView class (557 lines)
  - Multi-panel 3D preview grid
  - Variant card components
  - Theme-aware rendering (light/dark/high-contrast)
  - Responsive layout with breakpoints
  - Event-driven UI updates
- **Enhanced**: State management
  - New state properties: `comparisonMode`, `activeVariantId`
  - Mode tracking for UI coordination
- **Enhanced**: Theme integration
  - Comparison view respects theme changes
  - High contrast mode support for all comparison UI
  - Reduced motion preferences honored
- **Technical**: +1,210 lines across 5 files
  - comparison-controller.js: 273 lines
  - comparison-view.js: 557 lines
  - components.css: +250 lines
  - main.js: +130 lines
  - state.js: +2 properties
- **Build time**: 3.15s ✅
- **Bundle size impact**: +14.4KB gzipped (172.53KB → 186.93KB, +7.7%)
- **Accessibility**: WCAG 2.1 AA compliant
  - Full keyboard navigation
  - Screen reader support with ARIA labels
  - Focus management and indicators
  - High contrast mode with enhanced borders
- **Browser compatibility**: Chrome 120+, Firefox 121+, Safari 17+, Edge 120+
- **Performance**: Sequential rendering prevents system overload
- **User experience**: 
  - Smooth mode transitions
  - Clear visual feedback for all states
  - Intuitive variant management
  - Batch operations for efficiency

### v1.8.0 (2026-01-14) — STL Measurements

- **MILESTONE**: STL measurements feature complete (v1.2 Advanced Features)
- **Added**: Real-time dimension measurements and bounding box visualization
  - Bounding box wireframe overlay on 3D model
  - Dimension lines with text labels (X, Y, Z axes)
  - Dimensions panel showing width, depth, height, volume
  - Triangle count display
- **Added**: Measurements toggle control
  - "Show measurements" checkbox in preview settings
  - Persistent preference via localStorage
  - Real-time updates when model changes
- **Added**: Theme-aware measurement colors
  - Light mode: Red lines on light background
  - Dark mode: Red lines on dark background
  - High contrast: Thicker lines (3px) and larger text (48px)
- **Enhanced**: PreviewManager with measurement capabilities
  - `calculateDimensions()` method for bounding box computation
  - `toggleMeasurements()` for show/hide control
  - `showMeasurements()` creates Three.js helpers and sprites
  - `hideMeasurements()` cleans up measurement overlays
  - Canvas-based text sprites for dimension labels
- **Enhanced**: Dimensions display panel
  - Semantic HTML (dl/dt/dd) for accessibility
  - Grid layout (2 columns on desktop, 1 on mobile)
  - Monospace font for numeric values
  - Shows/hides based on toggle state
- **Technical**: +350 lines of code (preview.js: +250, main.js: +50, CSS: +50)
- **Build time**: 3.55s ✅
- **Bundle size impact**: +4.2KB gzipped (176.63KB → 180.83KB)
- **Accessibility**: WCAG 2.1 AA compliant (AAA in high contrast mode)
- **Browser compatibility**: Chrome 120+, Firefox 121+, Safari 17+, Edge 120+

### v1.7.0 (2026-01-13) — Parameter Presets System

- **MILESTONE**: Parameter presets feature complete (v1.2 Advanced Features)
- **Added**: Comprehensive preset management system
  - Save current parameters as named presets
  - Load presets instantly from dropdown or modal
  - Manage presets (view, load, delete, export)
  - Presets scoped per model (.scad file)
- **Added**: Import/Export functionality
  - Export individual presets as JSON
  - Export all presets for a model as collection
  - Import single or collection JSON files
  - Smart merging (duplicate names update existing)
- **Added**: Preset UI controls
  - Save Preset button (💾) in parameters panel
  - Manage button (📋) for preset management
  - Quick-load dropdown with preset list
  - Full keyboard accessibility (Tab, Enter, Escape)
- **Added**: Save Preset modal
  - Name field (required, autofocused)
  - Description field (optional, multiline)
  - Form validation and error handling
- **Added**: Manage Presets modal
  - Scrollable list of all saved presets
  - Per-preset actions (Load, Export, Delete)
  - Bulk actions (Import, Export All)
  - Empty state message
  - Responsive mobile layout
- **Added**: LocalStorage persistence
  - All presets saved to `openscad-customizer-presets` key
  - Organized by model name
  - Graceful degradation if storage unavailable
  - Quota exceeded warning
- **Enhanced**: State management integration
  - Preset dropdown updates on file change
  - Loading preset updates parameter state
  - State subscription for UI sync
- **Enhanced**: Accessibility (WCAG 2.1 AA)
  - ARIA labels and roles on all modals
  - Focus management (auto-focus, focus trap)
  - Escape key and backdrop click to close
  - Screen reader status announcements
  - 44px minimum touch targets
- **Enhanced**: Responsive design
  - Desktop: side-by-side layout
  - Mobile: stacked layout with full-width controls
  - Modal scrollable with max-height constraints
- **Technical**: New `PresetManager` class (374 lines)
  - CRUD operations (save, load, delete, rename)
  - Import/Export with validation
  - Event subscription system
  - Storage statistics and housekeeping
- **Technical**: +272 lines CSS for preset UI
- **Build time**: 3.83s ✅
- **Bundle size impact**: +4.1KB gzipped (172.53KB → 176.63KB)
- **Accessibility**: WCAG 2.1 AA compliant
- **Browser compatibility**: Chrome 120+, Firefox 121+, Safari 17+, Edge 120+

### v1.6.0 (2026-01-13) — Multiple Output Formats

- **MILESTONE**: Multi-format export support complete
- **Added**: Support for 5 output formats
  - STL (Standard Tessellation Language) - default
  - OBJ (Wavefront Object) - widely supported
  - OFF (Object File Format) - geometry format
  - AMF (Additive Manufacturing File) - advanced features
  - 3MF (3D Manufacturing Format) - modern standard
- **Added**: Format selector dropdown in UI
  - Located above action buttons
  - Shows format description on selection
  - Updates button text dynamically
- **Added**: Format-specific rendering in worker
  - Multi-format render logic
  - Fallback export method for unsupported formats
  - Triangle counting for all mesh formats
  - Format detection and conversion
- **Added**: Format-aware download system
  - Correct file extensions (.stl, .obj, .off, .amf, .3mf)
  - Format-specific MIME types
  - Smart filename generation
- **Enhanced**: RenderController with format support
  - `outputFormat` option in render calls
  - Backwards compatible (STL default)
  - Format passed through to worker
- **Enhanced**: Download manager
  - `OUTPUT_FORMATS` definitions
  - `downloadFile()` for any format
  - Legacy `downloadSTL()` maintained
- **Technical**: +200 lines across 6 files
- **Build time**: 2.39s ✅
- **Bundle size impact**: +0.73KB gzipped
- **Formats tested**: STL (verified), others pending WASM support verification

### v1.5.0 (2026-01-13) — High Contrast Mode

- **MILESTONE**: High contrast accessibility mode complete
- **Added**: Independent high contrast modifier system
  - Works with any theme (Light, Dark, Auto)
  - Creates 4 visual modes: Normal/HC × Light/Dark
  - WCAG AAA (7:1) color contrast ratios
  - Pure black/white for maximum contrast
- **Added**: Enhanced typography in high contrast mode
  - 12-17% larger text across all sizes
  - Improved readability for low vision users
  - Maintains proportional scaling
- **Added**: Stronger visual elements
  - 2-3px borders (vs 1px normal)
  - 4px focus rings (vs 3px normal)
  - Thicker grid lines in 3D preview
  - Enhanced shadows for depth
- **Added**: HC toggle button in header
  - "HC" label with contrast icon
  - Visual indicator when active
  - Keyboard accessible (Tab + Enter/Space)
  - ARIA labels for screen readers
- **Added**: Persistent high contrast preferences
  - Saved to localStorage (`openscad-customizer-high-contrast`)
  - Independent from theme preference
  - Survives browser sessions
- **Enhanced**: ThemeManager with high contrast support
  - `toggleHighContrast()` method
  - `applyHighContrast(enabled)` method
  - `getState()` returns theme + contrast state
  - Listener notifications include HC state
- **Enhanced**: PreviewManager with HC color palettes
  - New schemes: `light-hc`, `dark-hc`
  - Automatic color updates on toggle
  - Thicker grid lines in HC mode
- **Technical**: +120 lines CSS, +60 lines JS
- **Build time**: 2.53s ✅ (faster than v1.4.0!)
- **Bundle size impact**: +0.89KB gzipped
- **Accessibility**: WCAG 2.1 AAA compliant

### v1.4.0 (2026-01-13) — Dark Mode Implementation

- **MILESTONE**: Dark mode system complete with user-controlled theme switching
- **Added**: Comprehensive three-mode theme system (Auto, Light, Dark)
  - Auto mode follows system preference (`prefers-color-scheme`)
  - Manual Light/Dark modes override system setting
  - Smooth cycling: Auto → Light → Dark → Auto
- **Added**: Theme toggle button in header
  - Sun icon (☀️) in dark mode, moon icon (🌙) in light mode
  - Accessible via keyboard (Tab + Enter/Space)
  - ARIA labels for screen readers
  - Smooth icon transitions
- **Added**: Persistent theme preferences
  - Saved to localStorage (`openscad-customizer-theme`)
  - Survives browser sessions
  - Graceful degradation if localStorage unavailable
- **Added**: Three.js preview theme integration
  - Scene background adapts to theme
  - Grid colors optimized for visibility
  - Model colors enhanced for contrast
  - Smooth transitions between themes
- **Enhanced**: Color system with 36 theme-aware variables
  - 18 colors for light mode
  - 18 colors for dark mode
  - All via CSS custom properties
  - Automatic cascade via `data-theme` attribute
- **Technical**: New `ThemeManager` class (195 lines)
  - Theme detection and application
  - localStorage persistence
  - Event listener system
  - System preference monitoring
- **Technical**: Enhanced `PreviewManager` with theme support
  - `updateTheme()` method for dynamic recoloring
  - Theme-aware color palettes
  - Grid helper regeneration on theme change
- **Build time**: 2.71s ✅
- **Bundle size impact**: +3KB (+0.8KB gzipped)
- **Documentation**: Comprehensive testing guide and changelog

### v1.3.0 (2026-01-13) — ZIP Upload & Multi-File Projects

- **MILESTONE**: ZIP upload support for multi-file OpenSCAD projects COMPLETE
- **Added**: ZIP file upload and extraction (JSZip library)
  - Automatic main file detection (5 strategies)
  - Virtual filesystem mounting in OpenSCAD worker
  - File tree visualization with main file badge
  - Support for include/use statements with relative paths
  - Validation (20MB ZIP limit, format checking)
- **Added**: Multi-file example project (Multi-File Box)
  - Demonstrates include/use statements
  - Modular code organization
  - Helper functions and reusable modules
- **Modified**: Worker to support virtual filesystem operations
  - mountFiles() and clearMountedFiles() functions
  - Directory creation and file mounting
  - Support for nested directory structures
- **Modified**: Render controller to pass project files
  - files and mainFile options added
  - Automatic file mounting before render
- **Modified**: Auto-preview controller for multi-file support
  - setProjectFiles() method
  - Pass files to render operations
- **Modified**: Main UI to handle ZIP uploads
  - ZIP file detection and validation
  - Async file extraction
  - File tree display in UI
  - State management for project files
- **Technical**: ~500 lines of new code
- **Dependencies**: Added JSZip for ZIP extraction
- **Build time**: 2.72 seconds ✅
- **Bundle size impact**: ~10KB (JSZip tree-shaken)

### v1.2.0 (2026-01-13) — Auto-Preview & Progressive Enhancement

- **MILESTONE**: Auto-preview system for real-time visual feedback COMPLETE
- **Added**: Progressive Enhancement rendering strategy
  - Immediate "pending changes" indicator when parameters change
  - Auto-render with debounce (350ms default) at adaptive preview quality (tiered $fn caps)
  - Cached preview renders to avoid redundant computation (max 10 cache entries)
  - Full-quality render only on "Download STL" click
  - Smart button logic: "Download STL" when ready, "Generate STL" when params changed
- **Added**: Preview quality control (reduced $fn for faster iteration: 2-8s vs 10-60s)
- **Added**: Visual preview state indicators (idle, pending, rendering, current, stale, error)
- **Added**: Rendering overlay with spinner during preview generation
- **Improved**: UX flow - 5-10x faster parameter iteration
- **Technical**: New `AutoPreviewController` class (375 lines) for render orchestration
- **Technical**: Render caching by parameter hash with LRU eviction
- **Technical**: Quality tiers (PREVIEW: tiered $fn caps, 30s timeout | FULL: full-quality presets, 60s timeout)
- **Tested**: Simple Box example renders successfully (0.73s, 296 triangles, 888 vertices)
- **Tested**: State management working correctly (idle → current transitions)

### v1.1.0 (2026-01-12) — Enhanced Usability Release

- **MILESTONE**: v1.1 complete with all enhanced usability features
- **Added**: Optional URL state persistence (primarily for refresh/bookmark recovery)
- **Added**: Keyboard shortcuts (Ctrl+Enter to render, R to reset, D to download)
- **Added**: Auto-save drafts with localStorage (2s debounce, 7-day expiration)
- **Added**: Export Parameters as JSON button
- **Added**: Simple Box example (13 params, beginner-friendly, fast render)
- **Added**: Parametric Cylinder example (12 params, shape variations)
- **Improved**: Welcome screen now shows 3 example buttons with labels
- **Improved**: Example loading unified handler for all models
- **Tested**: All features working in Chrome dev environment
- **Documentation**: Created CHANGELOG_v1.1.md with full details

### v1.0.0 (2026-01-12) — MVP Release

- **MILESTONE**: v1 MVP complete and deployed to Vercel
- **Verified**: All Phase 1-3 features implemented and tested
- **Tested**: Universal cuff example renders correctly (47 parameters, 10 groups)
- **Verified**: STL generation produces valid output (tested in secondary CAD system)
- **Verified**: 3D preview working with Three.js
- **Verified**: WCAG 2.1 AA accessibility compliance
- **Cleaned**: Removed unused placeholder files and empty directories

### v0.2.0 (2026-01-12) — Major Rescope and Validation

- **Changed**: v1 is now a user-facing web application, not a CLI tool
- **Changed**: Original CLI scope moved to v2
- **Added**: Detailed user journey and UI specifications
- **Added**: Phased implementation plan with deliverables
- **Added**: Success metrics for launch
- **Added**: Reference implementation analysis
- **Added**: Gap analysis and recommendations
- **Added**: Security considerations and threat model
- **Added**: Browser requirements and compatibility matrix
- **Added**: Error handling strategy with user-friendly messages
- **Added**: Performance optimization guidelines
- **Added**: CSS architecture and design system
- **Added**: Build configuration and development workflow
- **Added**: Known limitations and gotchas
- **Added**: Progressive enhancement strategy with WebGL detection
- **Added**: Testing strategy and acceptance criteria
- **Added**: Example models strategy
- **Added**: Contributing guidelines
- **Added**: String value parsing guidance for parameter extraction
- **Added**: Acceptance criteria for Download Manager (Phase 1.4)
- **Added**: Number input acceptance criteria (Phase 2.2)
- **Updated**: Architecture diagrams for web-first approach
- **Updated**: Risk assessment with specific mitigations and phases
- **Updated**: Technology stack with browser requirements
- **Updated**: Implementation plan with detailed acceptance criteria
- **Updated**: Quickstart checklist to include dev dependencies
- **Updated**: URL format guidance (removed outdated IE11 reference)
- **Updated**: Vercel configuration with rewrites explanation
- **Updated**: Open questions with recommended defaults
- **Updated**: Parameter count to exact number (~50)
- **Resolved**: Open questions (WASM source, 3D preview, mobile support, include support)

### v0.1.0 (2026-01-11) — Initial Draft

- Initial build plan with CLI-focused approach
- Parameter schema specification
- Validation framework design
