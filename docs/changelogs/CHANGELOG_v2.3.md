# Changelog - v2.3.0

## v2.3.0 (2026-01-15) — Audit & Polish Release

### Overview

Version 2.3.0 is a quality-focused release that performs a comprehensive audit of the codebase, removes debug code, and aligns version strings across all files. This release contains no new features but ensures production readiness and codebase hygiene.

### Fixed

#### Debug Code Removal
- **Removed debug fetch call** from `src/js/auto-preview-controller.js`
  - Eliminated fetch to `http://127.0.0.1:7245/ingest/...` in production code
  - Removed `#region agent log` block entirely
  - Prevents console errors and improves security in production

#### Version String Alignment
- **Updated `src/main.js`**: Version banner now shows `v2.3.0 (Audit & Polish)`
- **Updated `public/sw.js`**: `CACHE_VERSION` updated to `v2.3.0`
- **Updated `package.json`**: Version bumped from `2.2.0` to `2.3.0`

### Audited

The following core runtime modules were reviewed for correctness:

| Module | Status | Notes |
|--------|--------|-------|
| `src/js/auto-preview-controller.js` | ✅ Clean | Debug code removed, debouncing logic correct |
| `src/js/parser.js` | ✅ Verified | Parameter extraction working correctly |
| `src/js/preview.js` | ✅ Verified | Three.js integration clean, proper disposal |
| `src/js/library-manager.js` | ✅ Verified | localStorage handling with environment checks |
| `src/js/render-queue.js` | ✅ Verified | Job state management correct |
| `src/worker/openscad-worker.js` | ✅ Verified | Timeout handling and library mounting correct |
| `src/main.js` | ✅ Verified | App initialization and event handling correct |

### Technical Details

- **Bundle Impact**: No size change (code removal offsets version string changes)
- **Cache Invalidation**: Service Worker cache will auto-refresh due to version bump
- **Backward Compatibility**: 100% - no breaking changes
- **New Dependencies**: None

### Migration

No migration required. Users will automatically receive the updated Service Worker on next visit.

### Documentation Updates

- Updated `docs/BUILD_PLAN_NEW.md`:
  - Marked critical issues as fixed
  - Added v2.3.0 milestone entry
  - Updated "Next" roadmap to v2.4 (Angular/Preact templates)
- Updated main `CHANGELOG.md` with v2.3.0 entry
- Updated `README.md` with current release information
- Updated `PROJECT_STATUS.md` with v2.3.0 status

### Build Information

```
Version: 2.3.0
Release Date: 2026-01-15
Release Type: Polish/Audit
Files Changed: 7
Lines Added: ~50
Lines Removed: ~10
```

### What's Next (v2.4)

- Angular template support for scaffold command
- Preact template support for scaffold command
- Enhanced testing infrastructure
- Performance optimizations

---

**Full Changelog**: v2.2.0...v2.3.0  
**Repository**: [GitHub](https://github.com/YOUR_ORG/openscad-web-customizer-forge)

---

*OpenSCAD Forge v2.3.0*
