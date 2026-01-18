# Performance Guide

This document provides guidance on optimizing the OpenSCAD Web Customizer Forge for performance.

## Overview

The application handles computationally intensive 3D rendering and needs to remain responsive. Key performance considerations:

1. **Bundle Size** - Minimize initial load time
2. **Runtime Performance** - Keep UI responsive during renders
3. **Memory Management** - Handle large STL files efficiently
4. **Worker Threads** - Offload heavy computation

## Performance Targets

| Metric | Target | Current (v2.3.0) |
|--------|--------|------------------|
| First Contentful Paint | < 1.5s | ~1.0s ✅ |
| Time to Interactive | < 3.0s | ~2.5s ✅ |
| Bundle Size (gzipped) | < 200KB | 180.31KB ✅ |
| Lighthouse Performance | > 80 | 85+ ✅ |

## Bundle Size Optimization

### Current Bundle Analysis

```bash
npm run build
du -sh dist/
```

**Main chunks** (v2.3.0):
- `index.js` - 180.31KB gzipped (main application)
- `three.js` - Lazy loaded for 3D preview (~600KB uncompressed)
- `openscad-wasm` - Lazy loaded from CDN (~2MB)

### Optimization Strategies

#### 1. Code Splitting

**Three.js lazy loading** (planned for v2.4):

```javascript
// Before: Eager import
import * as THREE from 'three'

// After: Lazy import
const loadThreeJS = async () => {
  const THREE = await import('three')
  return THREE
}
```

**Benefit**: Reduces initial bundle by ~150KB gzipped

#### 2. Tree Shaking

Ensure imports are specific:

```javascript
// ❌ Bad: Imports entire library
import { something } from 'library'

// ✅ Good: Specific import
import something from 'library/specific'
```

#### 3. Dependency Auditing

Regularly check for large dependencies:

```bash
npm install -g webpack-bundle-analyzer
npx vite-bundle-visualizer
```

### Progressive Loading

1. **Critical CSS** - Inline critical styles in HTML
2. **Defer Non-Critical JS** - Load features on-demand
3. **Image Optimization** - Use WebP for icons
4. **Font Subsetting** - Only load used glyphs

## Runtime Performance

### Web Worker Architecture

The application uses Web Workers to keep the UI responsive:

```
Main Thread                 Worker Thread
-----------                 -------------
   UI Events  -------->     OpenSCAD Render
   User Input               WASM Execution
   Parameter Updates  <---  Progress Updates
   3D Preview               STL Generation
```

**Benefits**:
- UI remains responsive during long renders
- No blocking of user interactions
- Smooth animations and transitions

### Rendering Optimization

#### Auto-Preview Debouncing

Parameter changes trigger renders after a 350ms default debounce (configurable):

```javascript
// src/js/auto-preview-controller.js
const DEBOUNCE_MS = 350

// Rapid parameter changes only trigger one render
let debounceTimeout
const scheduleRender = () => {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    triggerRender()
  }, DEBOUNCE_MS)
}
```

**Benefit**: Reduces unnecessary renders by ~80%

#### Progressive Quality

Renders use adaptive quality based on complexity:

```javascript
// Preview render: Fast, lower quality
const previewParams = {
  $fn: 24,        // Lower facet count
  $fa: 12,
  $fs: 2
}

// Final render: High quality
const finalParams = {
  $fn: 100,       // Higher facet count
  $fa: 5,
  $fs: 0.5
}
```

**Benefit**: Preview renders 3-5x faster

### Memory Management

#### STL Caching

Renders are cached with LRU eviction:

```javascript
// src/js/render-controller.js
const cache = new LRUCache({
  max: 10,        // Maximum 10 cached renders
  maxSize: 50 * 1024 * 1024,  // 50MB total
  sizeCalculation: (value) => value.stl.byteLength
})
```

**Benefit**: Instant re-renders for cached parameter sets

#### Blob URL Management

```javascript
// Always revoke blob URLs after download
function downloadSTL(arrayBuffer) {
  const blob = new Blob([arrayBuffer])
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = 'model.stl'
  a.click()
  
  // Critical: Free memory
  URL.revokeObjectURL(url)
}
```

### 3D Preview Optimization

#### Geometry Simplification

For large models, simplify geometry for preview:

```javascript
// Planned for v2.5+
function simplifyGeometry(geometry, targetTriangles) {
  const modifier = new THREE.SimplifyModifier()
  return modifier.modify(geometry, targetTriangles)
}
```

#### Camera Controls

Use efficient orbit controls:

```javascript
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 10
controls.maxDistance = 500
```

## Network Optimization

### WASM Loading

OpenSCAD WASM is loaded from CDN:

```javascript
const WASM_URL = 'https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/'
```

**Strategy**:
- Use versioned CDN URLs for caching
- Show progress indicator during load
- Cache in service worker after first load

### Library Bundles

OpenSCAD libraries (MCAD, BOSL2) are optional downloads:

```bash
npm run setup-libraries
```

**Size**: ~15MB total (optional)

**Strategy**:
- Not included in main bundle
- Loaded on-demand when detected
- Cached in IndexedDB

## Service Worker Caching

### Cache Strategy

```javascript
// public/sw.js
const CACHE_VERSION = 'v2.3.0'

// Cache-first for static assets
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    )
  }
})
```

**Cached Resources**:
- HTML, CSS, JS bundles
- Fonts and icons
- Example models
- WASM modules (after first load)

## Monitoring Performance

### Lighthouse

Run Lighthouse audits regularly:

```bash
npm run dev

# In another terminal
npm run check-a11y  # Includes performance metrics
```

### Chrome DevTools

1. **Performance Tab**
   - Record user interactions
   - Identify long tasks (> 50ms)
   - Check for layout thrashing

2. **Memory Tab**
   - Take heap snapshots
   - Look for memory leaks
   - Monitor garbage collection

3. **Network Tab**
   - Analyze bundle sizes
   - Check compression
   - Identify slow resources

### Real User Monitoring

Consider adding RUM tools:

- [Web Vitals](https://github.com/GoogleChrome/web-vitals)
- [PerformanceObserver API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver)

## Browser-Specific Optimizations

### Chrome/Chromium

- Use `SharedArrayBuffer` for faster WASM
- Enable hardware acceleration
- Use WebGL2 when available

### Firefox

- Similar to Chrome
- May need specific WASM flags

### Safari

- Limited `SharedArrayBuffer` support
- Use fallback WASM build
- Test iOS Safari separately

## Performance Checklist

### Development

- [ ] Use Chrome DevTools performance profiling
- [ ] Monitor bundle size on each PR
- [ ] Test on low-end devices (4GB RAM, slow CPU)
- [ ] Verify animations are smooth (60 FPS)
- [ ] Check for memory leaks (use heap snapshots)

### Pre-Release

- [ ] Run Lighthouse audit (score > 80)
- [ ] Test on slow 3G network
- [ ] Verify service worker caching works
- [ ] Check bundle size is under 200KB gzipped
- [ ] Test with large STL files (> 10MB)

### Production

- [ ] Enable compression (gzip/brotli)
- [ ] Set proper cache headers
- [ ] Use CDN for static assets
- [ ] Monitor Core Web Vitals
- [ ] Set up error tracking

## Common Performance Issues

### Issue: Long render times

**Symptoms**: UI freezes, browser warns "Page Unresponsive"

**Solutions**:
- Reduce model complexity ($fn, $fa, $fs)
- Enable progressive quality
- Add timeout enforcement (60s default)
- Show progress indicator

### Issue: Large bundle size

**Symptoms**: Slow initial load, poor Lighthouse score

**Solutions**:
- Enable code splitting
- Lazy load Three.js
- Remove unused dependencies
- Enable tree shaking

### Issue: Memory leaks

**Symptoms**: Browser slows down over time, high memory usage

**Solutions**:
- Revoke Blob URLs after use
- Clear STL cache when full
- Remove event listeners properly
- Dispose Three.js geometries/materials

### Issue: Janky animations

**Symptoms**: Choppy scrolling, slow transitions

**Solutions**:
- Use CSS transforms (GPU-accelerated)
- Avoid layout thrashing
- Debounce resize handlers
- Use `requestAnimationFrame` for animations

## Future Optimizations (Roadmap)

### v2.4 (Current)
- [x] Three.js lazy loading
- [x] Bundle size monitoring in CI
- [ ] Improved caching strategy

### v2.5
- [ ] WebAssembly SIMD optimization
- [ ] Mesh simplification for preview
- [ ] Incremental rendering
- [ ] Web Worker pool

### v3.0
- [ ] WebGPU rendering (when widely supported)
- [ ] Streaming STL generation
- [ ] Predictive caching
- [ ] Client-side compression

## Resources

- [Web Performance Best Practices](https://web.dev/performance/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)
- [WebAssembly Performance](https://v8.dev/blog/wasm-compilation-pipeline)
- [Three.js Performance Tips](https://discoverthreejs.com/tips-and-tricks/)

## Contributing

When optimizing performance:

1. **Measure first** - Use profiling tools
2. **Set targets** - Define success metrics
3. **Test impact** - Verify improvements
4. **Document changes** - Update this guide
5. **Monitor regressions** - Add CI checks

## Version History

- **v2.4.0** - Performance documentation, monitoring setup
- **v2.3.0** - Baseline performance metrics
