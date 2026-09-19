# Performance

Notes on keeping the app fast.

## Bundle size

Measured 2026-08-16 with `npm run build && npm run check-bundle`, all figures
gzipped:

| Chunk | Size | Budget |
|---|---|---|
| Core app (`index-*.js`) | 475 KB | 500 KB |
| Main CSS | 58 KB | 150 KB |
| Three.js chunk | 122 KB | -- |
| `index.html` | 58 KB | -- |
| ajv | 37 KB | -- |
| jszip | 29 KB | -- |
| **All assets together** | **844 KB** | 1 MB |

**The core app is at 95% of its budget.** Adding a dependency is a real
decision, not a formality -- `npm run check-bundle` fails the required Unit
Tests job when a budget is exceeded.

`index.html` is large because the entire UI markup lives in it.

The OpenSCAD WASM binary is separate from all of this: about 10 MB, vendored in
`public/wasm/openscad-official/`, fetched on first render and then cached by the
service worker.

To look at what is in the bundle:

```bash
npm run build
npm run check-bundle
npx vite-bundle-visualizer
```

Keep Three.js in its own chunk. Import only what you need from large libraries.

## Worker architecture

OpenSCAD WASM runs in a Web Worker so the UI stays responsive during renders. The flow is:

```
Main Thread                Worker Thread
-----------                -------------
UI events  ---------->     OpenSCAD render
User input                 WASM execution
Parameter updates  <-----  Progress updates
3D preview                 STL generation
```

Long renders (complex models) can still take time, but the UI won't freeze.

## Auto-preview debouncing

Parameter changes trigger renders after a 350ms debounce by default. This prevents a render storm when dragging sliders:

```javascript
// src/js/auto-preview-controller.js
const DEBOUNCE_MS = 350
```

## Quality tiers

Preview renders use lower quality settings for speed:

```javascript
// preview
{ $fn: 24, $fa: 12, $fs: 2 }

// final render
{ $fn: 100, $fa: 5, $fs: 0.5 }
```

Preview is 3-5x faster.

## Caching

Renders are cached with LRU eviction (max 10 cached renders, 50MB total). If you change a parameter and then change it back, the second render is instant.

Blob URLs are revoked after download to free memory.

## Service worker

Static assets are cached in the service worker for offline use:
- HTML, CSS, JS bundles
- Fonts and icons
- Example models
- WASM modules (after first load)

## Memory monitoring

The memory monitoring system tracks WASM heap usage and implements graceful degradation to prevent browser crashes on complex models.

### Three-tier threshold system

| Level | Threshold | UI Indicator | Automatic Action |
|-------|-----------|-------------|-----------------|
| **Warning** | 400 MB | Yellow memory badge | None (informational) |
| **Critical** | 800 MB | Red memory badge + warning banner | Auto-preview disabled |
| **Emergency** | 1200 MB | Red pulsing badge + emergency banner | Render queue cleared, recovery mode offered |

### MemoryState state machine

```
NORMAL → WARNING → CRITICAL → EMERGENCY
  ↑         ↑         ↑
  └─────────┴─────────┘  (recovery when heap drops below threshold)
```

States transition upward as memory grows and downward when usage drops below the current threshold. Each transition fires a callback (`onWarning`, `onCritical`, `onEmergency`, `onRecovery`) and dispatches a `memory-state-change` custom event on `document`.

### How it works

1. `MemoryMonitor` polls WASM heap size every 10 seconds as a background check.
2. The worker also reports memory usage after each render via message passing.
3. `evaluateState()` compares heap MB against thresholds and triggers state transitions.
4. UI indicators (badge color, banner text) update via the `memory-state-change` event.

### Recovery mode

When entering emergency state, the user is offered actions:
- **Reduce quality**: lower `$fn`/`$fa`/`$fs` to decrease geometry complexity
- **Disable auto-preview**: stop automatic re-renders on parameter change
- **Export work**: save current STL before reloading
- **Reload safely**: reload with reduced resource usage

### Testing thresholds

To trigger memory warnings during development:
1. Load `public/examples/benchmark_minkowski.scad` with high `$fn` values
2. Watch the memory badge transition through warning → critical → emergency
3. Verify auto-preview disables at the critical level
4. Verify recovery mode activates at emergency

### Configuration

Thresholds are set in `src/js/memory-monitor.js` and can be adjusted via constructor options:

```javascript
new MemoryMonitor({
  warningMB: 400,
  criticalMB: 800,
  emergencyMB: 1200,
})
```

The memory monitoring feature is controlled by the `memory_monitoring` feature flag (enabled by default).

## Browser differences

The WASM build is the **official OpenSCAD 2026.04.03 web build with Manifold**,
vendored in `public/wasm/openscad-official/`. It replaced the
`openscad-wasm-prebuilt@1.2.0` npm package, which had no Manifold and was slow
on complex models; `public/wasm/README.txt` records the swap and why.

It is single-threaded and does not use `SharedArrayBuffer` for threading.
COOP/COEP headers are still served for cross-origin isolation, which costs
nothing and keeps the door open if a threaded build ever lands.

> The threading analysis in `docs/research/WASM_THREADING_ANALYSIS.md` was
> carried out against the **old** package. Its conclusion is believed to hold
> for the current binary but has not been re-tested against it.

Safari: generally slower WASM execution than Chrome. Test iOS Safari separately for memory constraints.

## Profiling

Chrome DevTools Performance tab is the main tool. Record a render, look for long tasks (>50ms).

Memory tab helps find leaks. Take heap snapshots before and after repeated renders.

## Common issues

Long render times: reduce model complexity ($fn, $fa, $fs), or live with it (that's the nature of OpenSCAD in the browser).

Janky animations: use CSS transforms (GPU-accelerated), debounce resize handlers, avoid layout thrashing.

Memory growth: make sure Blob URLs are revoked. Dispose Three.js geometries and materials when done with them.
