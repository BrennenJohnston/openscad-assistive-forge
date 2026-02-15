# Project Sharing References (URL import, manifests, and client-side “templates”)

This document is a **debugging reference** for implementing “open this preconfigured project from a link” while keeping Forge **static-hosted** and **100% client-side for rendering**.

If you’re looking for hosting + COOP/COEP notes, also see `docs/research/COMPARABLE_PROJECTS.md`, `docs/DEPLOYMENT.md`, and `docs/SECURITY_ADMIN_GUIDE.md`.

## Patterns we care about

- **Remote load via URL parameter**: `?url=<…>` / `?project=<…>` loads external content directly into the tool.
- **Manifest-driven bundles**: a small JSON file lists project files + defaults, letting authors update templates without modifying the app repo.
- **Single-request bundles**: a `.zip` (or similar) avoids N parallel requests and simplifies hosting/debugging.
- **URL-encoded state sharing**: share *settings* or *documents* without a backend (best for small payloads).
- **CORS/COEP reality**: cross-origin isolation and CSP can break “load remote stuff” unless hosts are chosen intentionally.

## Reference projects (open-source)

### OpenSCAD Playground (official)

- **Repo**: `https://github.com/openscad/openscad-playground`
- **Why it matters**: closest peer (OpenSCAD-in-browser), real-world COOP/COEP posture, editor + preview loop.
- **What to look for**:
  - How it configures headers for cross-origin isolation
  - How it loads example projects / assets in a way compatible with its worker/WASM setup

### openscad-web-gui (community)

- **Repo**: `https://github.com/seasick/openscad-web-gui`
- **Why it matters**: an OpenSCAD WASM UI that emphasizes *getting models from URLs*.
- **Notable**: the project documents URL import flows and includes **adapters for model sites** (e.g., Printables/Thingiverse). This is relevant if Forge ever wants “paste a Printables link → load the right files” instead of requiring template authors to re-host assets.

### Swagger Editor (`?url=` import + CORS handling)

- **Repo**: `https://github.com/swagger-api/swagger-editor`
- **Why it matters**: mature example of `?url=<spec-url>` loading external content, plus pragmatic CORS strategies.
- **What to look for**:
  - URL parameter parsing and “load remote doc” UX
  - How the project communicates CORS problems to users (and what fallback paths exist)

### Mermaid Live Editor (URL-encoded documents)

- **Repo**: `https://github.com/mermaid-js/mermaid-live-editor`
- **Why it matters**: demonstrates a clean pattern for **shareable links** without accounts/backends using URL encoding + compression.
- **What to look for**:
  - Encode/decode approach (hash-based share links)
  - Guardrails around payload size and corruption handling

### Excalidraw (shareable links + local-first posture)

- **Repo**: `https://github.com/excalidraw/excalidraw`
- **Why it matters**: local-first UX, strong “share without accounts” story, plus lots of practical edge-case handling.
- **What to look for**:
  - How it treats “shared state” vs “persisted documents”
  - UX patterns for “copy link”, “export”, and “import” without confusing non-technical users

### JupyterLite (client-side WASM app + filesystem model)

- **Repo**: `https://github.com/jupyterlite/jupyterlite`
- **Why it matters**: large, production-quality example of a **static-hosted**, **WASM-heavy** app that still supports a “workspace” mental model and content loading.
- **What to look for**:
  - How it models and persists files client-side (browser storage)
  - How “open content from somewhere” is integrated without requiring a backend

### CascadeStudio / Replicad (URL-serialized CAD workspaces)

- **CascadeStudio repo**: `https://github.com/zalo/CascadeStudio`
- **Replicad repo**: `https://github.com/sgenoud/replicad`
- **Why it matters**: both are CAD-in-browser tools that prove the viability of “shareable parametric workspaces” and can inform UX around link-sharing, editor + preview loops, and performance guardrails.

## Notes for Forge maintainers

- **ZIP-first is often the simplest “template”**: one URL, one download, and you can include SCAD + companions + presets + metadata.
- **Manifest-first is nicer for authors**: updating a single file (or a few files) in a repo is easier than rebuilding ZIPs, but it increases “N-request” failure modes.
- **No-backend link generation has a hard limit**: if you want a link that loads *code/files* (not just parameter values), those files must be hosted somewhere with permissive CORS (or you must introduce a proxy/backend).

