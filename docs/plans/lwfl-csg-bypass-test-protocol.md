# LWFL Keyguard — CSG Bypass Test Protocol

This document describes how to test whether CSG color injection (Hypothesis H1)
is the root cause of the two geometry bugs in the LWFL keyguard preset.

## Prerequisites

- A local dev server running (`pixi run dev` or `npm run dev`)
- The LWFL keyguard preset loaded in the browser

## Bug Conditions to Reproduce

### Bug A — Home button tab persists when disabled

| Parameter              | Value |
|------------------------|-------|
| `expose_home_button`   | `"no"` |

**Expected (desktop):** Right edge is a straight line along the Y-axis.
**Actual (web):** A tab juts out where the home button cutout would be.

### Bug B — Ghost cutouts when upper message bar disabled

| Parameter                  | Value |
|----------------------------|-------|
| `expose_upper_message_bar` | `"no"` |

**Expected (desktop):** Solid surface above grid positions #1 and #12.
**Actual (web):** Partially rendered square cutouts / notched angles in both
corners.

## Test Steps

### Step 1 — Reproduce the bugs

1. Load the LWFL keyguard preset.
2. Set the bug-condition parameters above.
3. Confirm Bug A and/or Bug B are visible in the 3D preview.

### Step 2 — Enable CSG bypass

Open the browser console (F12) and run:

```js
__forgeDebug.toggleCsgBypass(true)
```

This disables CSG color injection and forces an STL-only preview. The model
will re-render automatically.

### Step 3 — Observe results

- **If Bug A and/or Bug B disappear:** H1 is confirmed — the CSG color
  injection algorithm is altering the CSG tree in a way that changes boolean
  operation results. Proceed to Phase 2 (per-statement subtractor wrapping).
- **If both bugs persist:** H1 is ruled out. Proceed to Phase 3 (investigate
  `-D` flag behavior / `_applyOverrides`).

### Step 4 — Export SCAD sources for desktop comparison

Download both the original and CSG-injected sources:

```js
// Original source (what desktop OpenSCAD would render)
__forgeDebug.exportScadSource({ download: true })

// CSG-injected source (what the web preview actually renders)
__forgeDebug.exportScadSource({ injected: true, download: true })
```

Open both `.scad` files in desktop OpenSCAD (2021 CGAL or Nightly Manifold)
and compare:

- Does the **original** source render correctly on desktop? (Expected: yes)
- Does the **CSG-injected** source reproduce the bugs on desktop?
  - If yes: confirms the tree restructuring is the root cause regardless of
    engine.
  - If no: the bug is an interaction between the restructured tree and the
    WASM Manifold engine specifically.

### Step 5 — Dump render arguments (optional)

To inspect the exact parameters and types being sent to the worker:

```js
__forgeDebug.dumpRenderArgs()
```

This logs:
- All parameter key-value pairs
- Their schema types (used by `buildDefineArgs` for `-D` formatting)
- The preview output format (`off` vs `stl`)
- Engine capability flags

### Step 6 — Restore normal operation

```js
__forgeDebug.toggleCsgBypass(false)
```

## Recording Results

Please record:

1. **Bug A with CSG bypass ON:** Resolved / Still present
2. **Bug B with CSG bypass ON:** Resolved / Still present
3. **Desktop render of CSG-injected source:** Bugs reproduced / Not reproduced
4. Any console errors or warnings observed during the test
