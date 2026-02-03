# Known Issues

**Version**: 4.2.0  
**Last Updated**: 2026-02-02

This document tracks known issues, limitations, and workarounds for OpenSCAD Assistive Forge.

---

## Current Issues

### High Priority

#### KI-001: Complex Models May Cause Memory Issues

**Status**: Acknowledged (by design)  
**Affected**: All browsers  
**Severity**: Medium

**Description**: Models with very high polygon counts (>200,000 triangles) may cause the browser to run out of memory, especially on devices with limited RAM.

**Workaround**:
1. Reduce `$fn` parameter values (e.g., from 128 to 32)
2. Use the "Reduce Quality" button when memory warnings appear
3. Export your work before attempting very complex renders
4. Use a desktop browser with more available memory

**Root Cause**: WebAssembly memory constraints in browser environments.

---

#### KI-002: Monaco Editor AT Limitations

**Status**: Documented  
**Affected**: Expert Mode with screen readers  
**Severity**: Medium

**Description**: The Monaco code editor has some limitations with certain assistive technology configurations, particularly with JAWS in some browser combinations.

**Workaround**:
1. Enable "Use accessible text editor" in Settings
2. The textarea fallback provides full AT compatibility
3. All editing features remain available

**Root Cause**: Monaco editor's complex DOM structure can interfere with some AT navigation patterns.

---

### Medium Priority

#### KI-003: Firefox WebGL Context Differences

**Status**: Monitoring  
**Affected**: Firefox  
**Severity**: Low

**Description**: Firefox may occasionally report different WebGL capabilities than Chrome/Edge, potentially affecting preview rendering quality.

**Workaround**: If preview looks incorrect, try refreshing the page or switching to Chrome/Edge.

**Root Cause**: Browser-specific WebGL implementations.

---

#### KI-004: Safari SharedArrayBuffer Performance

**Status**: Documented  
**Affected**: Safari 15.2-16.x  
**Severity**: Low

**Description**: Safari versions 15.2-16.x may show slower rendering performance compared to Chrome due to SharedArrayBuffer implementation differences.

**Workaround**: None required - functionality is correct, just slower.

**Root Cause**: Safari's SharedArrayBuffer implementation has different performance characteristics.

---

#### KI-005: Mobile Touch Gesture Conflicts

**Status**: Acknowledged  
**Affected**: Mobile browsers  
**Severity**: Low

**Description**: On mobile devices, pinch-to-zoom and rotate gestures may occasionally conflict with browser-level gestures.

**Workaround**: 
1. Use the on-screen rotation controls
2. Double-tap to reset the view
3. Use landscape orientation for more control space

**Root Cause**: Browser gesture handling varies by platform.

---

### Low Priority

#### KI-006: Parameter Groups Without Parameters

**Status**: Cosmetic  
**Affected**: All browsers  
**Severity**: Low

**Description**: If an OpenSCAD file defines a parameter group comment but no customizer parameters follow it, an empty group header may appear.

**Workaround**: Edit the OpenSCAD file to remove empty group comments.

**Root Cause**: Parser handles groups and parameters independently.

---

#### KI-007: Very Long Parameter Names

**Status**: Cosmetic  
**Affected**: All browsers  
**Severity**: Low

**Description**: Parameter names exceeding 50 characters may be truncated in the UI.

**Workaround**: Use the tooltip (hover) to see the full name, or use shorter parameter names.

**Root Cause**: UI layout constraints.

---

## Resolved Issues

### v4.1.0 → v4.2.0

| Issue | Description | Resolution |
|-------|-------------|------------|
| Vector parameters not supported | `[x,y,z]` style parameters were shown as text | Vector UI component added |
| No code editing capability | Users couldn't modify OpenSCAD code | Expert Mode implemented |
| Memory crashes without warning | App would crash on complex models | Graceful degradation UI added |

---

## Reporting New Issues

### Before Reporting

1. Check this document for known issues
2. Search [existing GitHub issues](https://github.com/openscad/openscad-assistive-forge/issues)
3. Try the issue in a Tier 1 browser (Chrome or Edge)
4. Clear browser cache and try again

### How to Report

Create a [new GitHub issue](https://github.com/openscad/openscad-assistive-forge/issues/new) with:

1. **Browser**: Name, version, operating system
2. **Steps to reproduce**: Numbered list of actions
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Error messages**: From browser console (F12 → Console tab)
6. **OpenSCAD file**: If applicable, attach a minimal example

### Issue Template

```markdown
## Description
[Brief description of the issue]

## Environment
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]
- Screen reader: [if applicable]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

## Expected Behavior
[What should happen]

## Actual Behavior
[What happens instead]

## Console Errors
```
[Paste any errors from browser console]
```

## Additional Context
[Any other relevant information]
```

---

## Issue Status Definitions

| Status | Meaning |
|--------|---------|
| **Acknowledged** | Issue confirmed, solution planned |
| **Documented** | Known limitation with workaround |
| **Monitoring** | Under observation, may resolve |
| **Investigating** | Actively being researched |
| **In Progress** | Fix being developed |
| **Resolved** | Fixed in specified version |
| **Won't Fix** | Cannot be fixed or by design |

---

## Contact

For urgent issues affecting accessibility or security, please follow the contact procedures in [SECURITY.md](./SECURITY.md).
