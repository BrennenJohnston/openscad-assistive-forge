---
name: OpenSCAD Web Customizer Forge — Build Plan
version: 0.2.0
date: 2026-01-12
last_validated: 2026-01-12
validated_by: Project maintainer (major rescope review)
status: rescoped_draft
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
- From repo root: `npm create vite@latest . -- --template vanilla` (keep docs/LICENSE), then `npm install`, then `npm install ajv three`.
- Ensure layout matches the target tree (see “Repo Layout (Target)”).
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
4. Click **Generate STL** and receive:
   - A downloadable STL file
   - A visible progress indicator during generation
   - A clear error message if generation fails or times out

Optional for v1 MVP: 3D preview (P1 feature)

### Why This Matters

| Problem | Our Solution |
|---------|--------------|
| Many legacy customizers are deprecated/limited | Open source alternative |
| Server-side rendering costs money | 100% client-side processing |
| OpenSCAD Customizer UI is intimidating | Accessible, guided UI |
| Can't customize without installing OpenSCAD | Web-based, no install |
| Sharing customized models is hard | URL-based parameter sharing |

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
|  |   Height ---o--| | [Share Link]     | |
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

#### 5. Sharing and Persistence

| Feature | Description | Priority |
|---------|-------------|----------|
| URL parameters | Encode current values in URL hash | P1 |
| Copy share link | One-click copy shareable URL | P1 |
| Browser storage | Remember last-used parameters | P2 |
| Presets | Save/load named parameter sets | P2 |

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

### OpenSCAD WASM Integration

#### Source Options (Validated 2026-01-12)

| Source | Status | Recommendation |
|--------|--------|----------------|
| openscad/openscad-wasm | Official but experimental | Monitor |
| seasick/openscad-web-gui | GPL-3.0, production-tested | Reference (not vendor) |
| openscad/openscad-playground | Active, official-ish | Reference |
| Self-compiled from source | Maximum control | Fallback |

#### WASM Loading Strategy

```javascript
// Lazy load WASM after initial page render
async function initOpenSCAD() {
  // Show loading indicator
  updateStatus('Loading OpenSCAD engine...');
  
  // Load WASM module (15-30MB)
  const OpenSCAD = await import('./openscad-wasm/openscad.js');
  
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

#### Worker Communication Protocol

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
  - Otherwise treat as “bare parameter” with optional description
- Convert into the internal schema format (see `docs/specs/PARAMETER_SCHEMA_SPEC.md`)

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

# Add runtime deps
npm install ajv three
```

**Notes**:
- Keep documentation under `docs/` as-is.
- Vite will create/own `index.html` at repo root and the `src/` app code folder.

### 1. Repo Layout (Target)

After bootstrap + Phase 1, the repo layout should look like:

```
openscad-web-customizer-forge/
├── index.html
├── src/
│   ├── main.js                 # Entry point; mounts UI
│   ├── styles/
│   │   ├── variables.css
│   │   └── main.css
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
│   └── examples/                # Example .scad files for demo mode
├── docs/
├── examples/
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── package.json
├── vite.config.js
└── vercel.json
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

**Acceptance Criteria:**
- Can render a simple .scad file with default parameters
- Can override parameters via -D flags
- Returns STL as ArrayBuffer
- Handles timeout gracefully
- Reports progress to main thread

#### 1.3 File Upload

**Deliverables:**
- Drag-and-drop zone
- File input fallback
- File type validation (.scad only)
- File size limits (5MB default)
- Detect `include <...>` / `use <...>` statements and show a **clear v1 limitation warning** (no dependency upload in v1)

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
- Extracts all 50+ parameters from universal cuff example
- Correctly identifies types (integer, number, string)
- Preserves group ordering
- Handles edge cases (no annotations, malformed)

**Edge cases to support in v1**:
- `$`-prefixed names (e.g. `$fn`) must be parsed and can be marked hidden if in `/*[Hidden]*/`
- Numeric enums (e.g. `internal_grips = 0; // [0,2,4,6]`)
- “Yes/No” enums with either ordering (`[yes, no]` or `[no, yes]`) should render as a toggle by default
- Comments **after** a bracket hint should become `description` (e.g. `// [0:90] degrees`)

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
- Selects show all enum options
- Toggles work for yes/no enums
- All inputs are keyboard accessible
- Screen readers can navigate form

**A11y implementation checklist (minimum)**:
- Every input has a visible `<label>` and is programmatically associated via `for`/`id`
- Group sections use native `<details><summary>` OR proper ARIA for disclosure widgets
- Status/progress updates go to a live region (avoid spamming; debounce updates)
- Errors are announced via a live region and also shown visually near the controls

#### 2.3 State Management

**Deliverables:**
- Centralized state store
- Parameter value tracking
- Dirty state detection
- URL serialization (hash params)

**URL format (v1)**:
- Use URL hash (so no server needed): `#v=1&params=<encoded>`
- `params` is `encodeURIComponent(JSON.stringify(values))`
- Only include non-default values to keep URLs short

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

#### 3.3 Deployment

**Deliverables:**
- Vercel configuration
- COOP/COEP headers for SharedArrayBuffer
- Asset optimization
- CDN caching strategy

**COOP/COEP requirement**:
OpenSCAD WASM builds may require `SharedArrayBuffer`, which requires cross-origin isolation.
Add headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

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

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WASM bundle size (15-30MB) | High | Medium | Lazy load; show progress; cache |
| Browser compatibility | Medium | High | Target evergreen browsers only |
| Memory exhaustion | Medium | Medium | Set limits; show warning |
| Render timeout | High | Medium | 60s timeout; clear messaging |
| Parameter parsing edge cases | High | Medium | Graceful degradation |

### User Experience Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Long initial load | High | High | Progress indicator |
| Complex models fail | Medium | High | Pre-flight check; warn user |
| Confusing parameter names | High | Medium | Help text; grouping |
| Mobile performance | Medium | Medium | Test; warn about limits |

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

# Deploy to Vercel
vercel --prod
```

---

## Open Questions

### Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| v1 scope | Web app (not CLI) | Faster user value |
| License | GPL-3.0-or-later | OpenSCAD WASM compatibility |
| UI framework | Vanilla JS | Minimal deps, accessibility |
| Deployment | Vercel | Free, static hosting |

### Pending (Need Answer Before Phase 2)

| Question | Options | Recommendation |
|----------|---------|----------------|
| Include file support | (a) Warn only (b) ZIP upload | (a) for v1 |
| WASM source | (a) Self-compile (b) Use existing | Research needed |
| 3D preview | (a) Required (b) Optional | (b) Optional |
| Mobile support | (a) Full (b) Warning | (b) Warning |

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

### Additional Recommendations

1. **Performance Budget**: Set hard limits on initial bundle size (<200KB before WASM)
2. **Analytics**: Add privacy-respecting analytics to understand usage patterns
3. **Feedback Loop**: Add "Report Issue" button for user feedback
4. **Example Gallery**: Curate 5-10 high-quality example models beyond universal cuff
5. **Social Sharing**: Add OpenGraph meta tags for link previews
6. **Mobile-First Testing**: Test on real devices early and often

---

## Changelog

### v0.2.0 (2026-01-12) — Major Rescope

- **Changed**: v1 is now a user-facing web application, not a CLI tool
- **Changed**: Original CLI scope moved to v2
- **Added**: Detailed user journey and UI specifications
- **Added**: Phased implementation plan with deliverables
- **Added**: Success metrics for launch
- **Added**: Reference implementation analysis
- **Added**: Gap analysis and recommendations
- **Updated**: Architecture diagrams for web-first approach
- **Updated**: Risk assessment for new scope

### v0.1.0 (2026-01-11) — Initial Draft

- Initial build plan with CLI-focused approach
- Parameter schema specification
- Validation framework design
