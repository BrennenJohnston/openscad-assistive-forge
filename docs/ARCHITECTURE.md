# Architecture

This document describes how the major pieces of the codebase fit together. If you're new to the project, start here to build a mental model.

## High-level overview

OpenSCAD Assistive Forge is a browser-only application. There's no backend. Everything runs client-side:

- OpenSCAD WASM runs in a Web Worker so the UI stays responsive
- Three.js renders the 3D preview
- localStorage stores presets, projects, and preferences
- Service worker caches assets for offline use

The main flow: user uploads a `.scad` file, the parser extracts Customizer annotations, the UI generator builds controls, the user tweaks parameters, the worker renders OpenSCAD, and Three.js displays the result.

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
