# Performance

Notes on keeping the app fast.

## Bundle size

Current bundle (v4.0.0):
- `index.js` ~180KB gzipped
- Three.js lazy-loaded (~600KB uncompressed)
- OpenSCAD WASM lazy-loaded from CDN (~2MB)

Lighthouse performance score: 85+

To analyze the bundle:

```bash
npm run build
du -sh dist/
npx vite-bundle-visualizer
```

Keep Three.js lazy-loaded. Import only what you need from large libraries.

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

## Browser differences

Chrome/Chromium: use `SharedArrayBuffer` for faster WASM threading.

Safari: limited `SharedArrayBuffer` support, uses fallback WASM build. Test iOS Safari separately.

## Profiling

Chrome DevTools Performance tab is the main tool. Record a render, look for long tasks (>50ms).

Memory tab helps find leaks. Take heap snapshots before and after repeated renders.

## Common issues

Long render times: reduce model complexity ($fn, $fa, $fs), or live with it (that's the nature of OpenSCAD in the browser).

Janky animations: use CSS transforms (GPU-accelerated), debounce resize handlers, avoid layout thrashing.

Memory growth: make sure Blob URLs are revoked. Dispose Three.js geometries and materials when done with them.
