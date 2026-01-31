# Architecture

This document describes how the major pieces of the codebase fit together. If you're new to the project, start here to build a mental model.

## High-level overview

OpenSCAD Assistive Forge is a browser-only application. There's no backend. Everything runs client-side:

- OpenSCAD WASM runs in a Web Worker so the UI stays responsive
- Three.js renders the 3D preview
- localStorage stores presets, projects, and preferences
- Service worker caches assets for offline use

The main flow: user uploads a `.scad` file, the parser extracts Customizer annotations, the UI generator builds controls, the user tweaks parameters, the worker renders OpenSCAD, and Three.js displays the result.

```mermaid
flowchart LR
    User[User] --> Upload[Upload .scad]
    Upload --> Parse[Parse annotations]
    Parse --> BuildUI[Generate form controls]
    BuildUI --> Change[User changes parameter]
    Change --> Worker[Worker renders]
    Worker --> Display[Three.js shows result]
    Display --> Export[Export STL/OBJ/etc]
```

This keeps everything local. No files leave your browser.

## Module map

```mermaid
mindmap
  root((openscad-assistive-forge))
    src
      main.js
      js
        Core
          parser.js
          state.js
          render-controller.js
          render-queue.js
        UI Layer
          ui-generator.js
          preview.js
          modal-manager.js
          drawer-controller.js
        Features
          preset-manager.js
          comparison-controller.js
          saved-projects-manager.js
          zip-handler.js
          library-manager.js
          tutorial-sandbox.js
        Utilities
          storage-manager.js
          theme-manager.js
          validation-schemas.js
          sw-manager.js
          color-utils.js
          html-utils.js
      styles
      worker
        openscad-worker.js
    public
      wasm
      icons
      examples
    cli
      commands
    scripts
    docs
    tests
```

## Component flow

```mermaid
flowchart TB
    subgraph Browser[Browser Environment]
        HTML[index.html]
        Main[main.js]
        UI[UI Modules]
        Worker[Web Worker]
        Preview[Three.js Preview]
    end
    
    subgraph Modules[Core Modules]
        Parser[parser.js]
        UIGen[ui-generator.js]
        State[state.js]
        RenderCtrl[render-controller.js]
        AutoPreview[auto-preview-controller.js]
    end
    
    subgraph WorkerThread[Worker Thread]
        OpenSCAD[OpenSCAD WASM]
        VFS[Virtual Filesystem]
        Libraries[Library Bundles]
    end
    
    HTML --> Main
    Main --> Parser
    Parser --> UIGen
    UIGen --> State
    State --> AutoPreview
    AutoPreview --> RenderCtrl
    RenderCtrl --> Worker
    Worker --> Preview
```

## Render pipeline

When a user changes a parameter:

```mermaid
sequenceDiagram
    participant User
    participant UI as UI Controls
    participant State as state.js
    participant Auto as auto-preview-controller
    participant Render as render-controller
    participant Worker as openscad-worker
    participant Preview as preview.js
    
    User->>UI: Change parameter
    UI->>State: Update state
    State->>Auto: Notify change
    Auto->>Auto: Debounce 350ms
    Auto->>Render: Request render
    Render->>Worker: Send SCAD + params
    Worker->>Worker: Run OpenSCAD WASM
    Worker-->>Render: Return STL bytes
    Render-->>Preview: Load STL
    Preview-->>User: Display 3D model
```

The debounce (350ms by default) prevents a render storm when dragging sliders.

## File upload and parsing

When you upload a `.scad` file (or load from saved projects), here's what happens:

```mermaid
sequenceDiagram
    participant User
    participant FileInput as File Input
    participant Parser as parser.js
    participant Schema as validation-schemas.js
    participant UIGen as ui-generator.js
    participant Worker as openscad-worker.js
    
    User->>FileInput: Select .scad file
    FileInput->>Parser: Read file content
    Parser->>Parser: Extract Customizer annotations
    Note over Parser: Finds //! @param lines<br/>Parses types, ranges, defaults
    Parser->>Schema: Build JSON schema
    Schema-->>UIGen: Parameter definitions
    UIGen->>UIGen: Generate form controls
    Note over UIGen: Text inputs, sliders,<br/>checkboxes, dropdowns
    UIGen-->>User: Display parameter form
    
    User->>UIGen: Click "Generate Preview"
    UIGen->>Worker: Send SCAD + params
    Worker-->>UIGen: Return STL
    UIGen-->>User: Show 3D preview
```

The parser looks for lines like `//! @param width {number} [10:100:30]` and turns them into form controls. If the file has syntax errors, the parser catches them before sending to the worker.

## Error handling

When OpenSCAD hits an error (syntax error, division by zero, module not found), the worker catches it and sends it back to the UI:

```mermaid
flowchart TB
    Worker[openscad-worker.js] -->|WASM error| Catch[Error handler]
    Catch --> Translate[error-translator.js]
    Translate -->|Plain language| Modal[modal-manager.js]
    Modal -->|Display error dialog| User[User sees error]
    
    Note1[Example:<br/>WASM: 'module foo not found'<br/>UI: 'Cannot find module foo.<br/>Check spelling or upload library.']
    
    Translate -.-> Note1
```

The error translator converts technical WASM errors into plain English. For example, "Parser error in line 5" becomes "Line 5 has a syntax error. Check for missing semicolons or brackets."

## Library system

OpenSCAD libraries (MCAD, BOSL2, etc) are loaded into the worker's virtual filesystem:

```mermaid
sequenceDiagram
    participant User
    participant UI as library-manager.js
    participant Worker as openscad-worker.js
    participant VFS as Virtual Filesystem
    
    User->>UI: Enable MCAD library
    UI->>Worker: Load library bundle
    Worker->>VFS: Mount files to /libraries/MCAD/
    VFS-->>Worker: Files available
    Worker-->>UI: Library ready
    
    User->>UI: Click "Generate"
    UI->>Worker: Render with SCAD code
    Note over Worker: Code can now use:<br/>use <MCAD/bearing.scad>
    Worker->>VFS: Read /libraries/MCAD/bearing.scad
    VFS-->>Worker: File content
    Worker->>Worker: Execute OpenSCAD
    Worker-->>UI: Return STL
```

Libraries are fetched once and cached in memory for the session. If you reload the page, they need to be enabled again (unless you saved the project with library settings).

## Theme switching

Light, dark, and high contrast modes work through CSS custom properties:

```mermaid
flowchart LR
    User[User clicks HC button] --> Theme[theme-manager.js]
    Theme --> LocalStorage[Save preference]
    Theme --> CSS[Update data-theme attribute]
    CSS --> Root[document.documentElement]
    Root --> Vars[CSS custom properties update]
    Vars --> UI[All components re-render colors]
    
    Note[Colors defined once in<br/>src/styles/theme.css<br/>Components reference<br/>var(--color-text)]
```

The theme manager sets `data-theme="high-contrast"` on the root element, and all colors update instantly. This works even if JavaScript is disabled after initial load.

## Storage structure

Everything in localStorage uses namespaced keys to avoid conflicts:

```mermaid
graph TB
    LocalStorage[localStorage]
    
    LocalStorage --> Prefs[forge_preferences]
    LocalStorage --> Projects[forge_project_*]
    LocalStorage --> Presets[forge_preset_*]
    
    Prefs --> Theme[theme: 'dark']
    Prefs --> AutoPreview[autoPreview: true]
    Prefs --> CameraPos[cameraPosition: ...]
    
    Projects --> Proj1[forge_project_abc123]
    Projects --> Proj2[forge_project_def456]
    
    Proj1 --> Meta[name, created, modified]
    Proj1 --> SCAD[scadContent]
    Proj1 --> Params[currentParameters]
    Proj1 --> Files[additionalFiles]
    
    Presets --> Pre1[forge_preset_xyz789]
    Pre1 --> PreMeta[name, fileHash]
    Pre1 --> PreParams[parameters]
```

Projects include everything needed to restore your work: the SCAD file, current parameter values, any included files, and library settings. Presets are just parameter values tied to a specific file (matched by hash).

## Saved projects

Users can save projects to localStorage and export them as ZIP files:

```mermaid
sequenceDiagram
    participant User
    participant UI as UI layer
    participant SPM as saved-projects-manager.js
    participant Storage as storage-manager.js
    participant ZIP as zip-handler.js

    User->>UI: Click "Save project"
    UI->>SPM: saveCurrentProject(metadata + scad + params)
    SPM->>Storage: write(key, projectJson)
    Storage-->>SPM: ok
    SPM-->>UI: update list + announce success

    User->>UI: Click "Export project"
    UI->>SPM: exportProject(id)
    SPM->>Storage: read(key)
    Storage-->>SPM: projectJson
    SPM->>ZIP: buildZip(projectJson)
    ZIP-->>UI: download .zip
```

## ZIP file handling

Multi-file projects need all their dependencies. ZIP upload handles this:

```mermaid
sequenceDiagram
    participant User
    participant ZipHandler as zip-handler.js
    participant Worker as openscad-worker.js
    participant VFS as Virtual Filesystem
    
    User->>ZipHandler: Upload .zip file
    ZipHandler->>ZipHandler: Extract files with JSZip
    Note over ZipHandler: Finds main .scad file<br/>(first one alphabetically)
    ZipHandler->>Worker: Send file list
    
    loop For each file in ZIP
        ZipHandler->>Worker: Mount file to VFS
        Worker->>VFS: Write to /project/filename
    end
    
    Worker-->>ZipHandler: All files mounted
    ZipHandler->>User: Load main .scad
    
    User->>User: Edit parameters and render
    
    User->>ZipHandler: Export project as ZIP
    ZipHandler->>Worker: Get all project files
    Worker->>VFS: Read /project/*
    VFS-->>ZipHandler: File contents
    ZipHandler->>ZipHandler: Build ZIP with JSZip
    ZipHandler-->>User: Download .zip
```

This lets you work with complex projects that use `include` or `use` statements without thinking about file paths. Everything stays in the virtual filesystem until you export.

## Validation flow

Parameters are validated against JSON schemas built from Customizer annotations:

```mermaid
flowchart TB
    Input[SCAD + parameters] --> Parse[parser.js extracts param defs]
    Parse --> Schema[validation-schemas.js builds JSON schema]
    Schema --> UI[ui-generator.js builds controls]
    UI --> State[state.js holds values]
    State --> Validate[validation-constants + schema validate]
    Validate -->|ok| Render[render-controller.js]
    Validate -->|error| UIErr[modal-manager.js / inline errors]
```

## Service worker and caching

```mermaid
flowchart TB
    Browser[Browser load] --> SWReg[sw-manager.js registers SW]
    SWReg --> SW[service worker]
    SW --> Cache[Cache Storage]
    Browser --> App[main.js app]
    App --> Wasm[public/wasm/...]
    App --> Assets[icons/fonts/examples]
    SW -->|cache hit| Browser
    SW -->|cache miss| Net[network]
    Net --> Cache
```

After first load, static assets and WASM are cached for offline use.

## Tutorial sandbox

The tutorial system loads example SCAD files and guides users through parameter changes:

```mermaid
sequenceDiagram
    participant User
    participant Tutorial as tutorial-sandbox.js
    participant UI as ui-generator.js
    participant State as state.js
    participant Render as render-controller.js
    participant Worker as openscad-worker.js
    participant Preview as preview.js

    User->>Tutorial: Pick tutorial / step
    Tutorial->>UI: Load tutorial SCAD + param defaults
    UI->>State: Initialize controls + state
    State->>Render: Request render (initial)
    Render->>Worker: Run OpenSCAD (SCAD + params)
    Worker-->>Render: STL result
    Render-->>Preview: Display model
    User->>UI: Change parameter
    UI->>State: Update
    State->>Render: Request render (repeat)
```

## Comparison mode

Side-by-side rendering with shared controls:

```mermaid
flowchart LR
    UI[comparison-view.js / comparison-controller.js] --> State[state.js]
    State --> RenderA[render-controller (A)]
    State --> RenderB[render-controller (B)]
    RenderA --> Worker[openscad-worker.js]
    RenderB --> Worker
    RenderA --> PreviewA[preview.js (left)]
    RenderB --> PreviewB[preview.js (right)]
    UI -->|toggle / swap / sync| State
```

## CLI tool

The CLI (`openscad-forge`) is for developers who want to extract parameters or scaffold standalone customizers:

```mermaid
flowchart TB
    CLI[openscad-forge CLI]
    
    CLI --> extract[extract command]
    CLI --> scaffold[scaffold command]
    CLI --> validate[validate command]
    CLI --> sync[sync command]
    CLI --> theme[theme command]
    CLI --> ci[ci command]
    CLI --> test[test command]
    
    extract --> |reads| SCAD[.scad files]
    extract --> |outputs| Schema[JSON Schema]
    
    scaffold --> |uses| Templates[Framework Templates]
    scaffold --> |generates| WebApp[Standalone Web App]
    
    Templates --> React[React]
    Templates --> Vue[Vue]
    Templates --> Svelte[Svelte]
    Templates --> Angular[Angular]
    Templates --> Preact[Preact]
```

## Key modules

**Entry point:**
- `src/main.js` - app initialization, event wiring, UI orchestration

**Core logic:**
- `src/js/parser.js` - extracts Customizer annotations from SCAD
- `src/js/state.js` - holds current parameter values
- `src/js/render-controller.js` - queues and dispatches renders
- `src/js/render-queue.js` - manages render queue and caching
- `src/js/auto-preview-controller.js` - debounces parameter changes

**UI layer:**
- `src/js/ui-generator.js` - builds form controls from parsed params
- `src/js/preview.js` - Three.js 3D preview
- `src/js/modal-manager.js` - modal dialogs
- `src/js/drawer-controller.js` - drawer/panel behavior

**Features:**
- `src/js/preset-manager.js` - save/load parameter presets
- `src/js/saved-projects-manager.js` - save/load full projects
- `src/js/comparison-controller.js` - side-by-side mode
- `src/js/zip-handler.js` - ZIP extraction and creation
- `src/js/library-manager.js` - OpenSCAD library bundles
- `src/js/tutorial-sandbox.js` - guided tutorials

**Utilities:**
- `src/js/storage-manager.js` - localStorage wrapper
- `src/js/theme-manager.js` - light/dark/high-contrast themes
- `src/js/validation-schemas.js` - JSON schema generation
- `src/js/sw-manager.js` - service worker registration
- `src/js/color-utils.js` - color parsing/validation
- `src/js/html-utils.js` - HTML escaping, security utilities

**Worker:**
- `src/worker/openscad-worker.js` - runs OpenSCAD WASM in isolation
