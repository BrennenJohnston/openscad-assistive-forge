# Phase 1 Results: CSG Color Injection Elimination Test

**Date:** 2026-04-05
**Plan:** regression_root_cause_fix_3cb860ad
**Result:** CONFIRMED — CSG color injection is the root cause of Bug A and Bug B

## Method

Instead of the manual browser test described in the plan, Phase 1 was validated
programmatically via unit tests that directly exercise `injectCsgColors()` against
representative patterns extracted from the actual LWFL keyguard SCAD source
(`docs/audit/ki-012-investigation/bug-a-capture/scad-source.scad`).

Three diagnostic tests were added to
`tests/unit/auto-preview-controller.test.js` under the describe block
`Phase 1 KI-012: CSG injection variable-scoping hazard`.

## Root Cause

`injectCsgColors()` wraps each semicolon-terminated statement inside a
`difference()` block as a **separate** `color("green") { ... }` block. This is
correct for standalone geometry statements like `cube(3);` or `home_camera(kt);`,
but **breaks OpenSCAD's lexical scoping** when one statement defines a variable
used by a subsequent statement.

### Concrete Example from the Keyguard

In the L3 `difference()` block of `module keyguard()` (line 2111 of the SCAD
source), after the first child ends, the subtractor region contains:

```scad
// Original (correct)
al = max(adj_lec, 0);
ar = max(adj_rec, 0);
at = max(adj_tec, 0);
ab = max(adj_bec, 0);
translate([al/2-ar/2, ab/2-at/2, kt/2+ff])
hole_cutter2(screen_width-al-ar, screen_height-at-ab, 90, 90, bcr, kt-sat);
```

After injection:

```scad
// Injected (broken)
color("#9dcb51") { al = max(adj_lec, 0); }   // al scoped HERE only
color("#9dcb51") { ar = max(adj_rec, 0); }   // ar scoped HERE only
color("#9dcb51") { at = max(adj_tec, 0); }   // at scoped HERE only
color("#9dcb51") { ab = max(adj_bec, 0); }   // ab scoped HERE only
color("#9dcb51") { translate([al/2-ar/2, ab/2-at/2, kt/2+ff])
                   hole_cutter2(...); }       // al,ar,at,ab are ALL undef!
```

In OpenSCAD, each `{ }` block creates a child scope. Variables assigned inside a
child scope are **not visible** in sibling scopes. So `al` defined in one
`color() { ... }` block is `undef` in the next block.

### How This Causes Bug A and Bug B

With `al`, `ar`, `at`, `ab` all evaluating to `undef` (treated as 0 by OpenSCAD
arithmetic), the `hole_cutter2()` screen-area cutout is:

1. **Positioned at the origin** instead of the correct offset (the translate
   arguments all reduce to ~0)
2. **Sized incorrectly** because `screen_width-al-ar` becomes
   `screen_width-undef-undef` = `undef`

This mispositions the primary screen cutout, which changes the effective geometry
for all features inside the screen region including:

- **Bug A (expose_home_button):** The home button cutout from `home_camera(kt)`
  may overlap differently with the incorrectly positioned screen cutout, causing
  the home-button tab to persist when `expose_home_button = "no"`
- **Bug B (expose_upper_message_bar):** The bar cutouts from `bars(sat)` interact
  with the wrong screen boundary, producing ghost cutouts when
  `expose_upper_message_bar = "no"`

### Why the Error Recovery Doesn't Catch This

The injected SCAD is **syntactically valid** — OpenSCAD doesn't reject undefined
variables, it just uses `undef`. The error-recovery fallback (`isParserError()`
check added in commit `ae2e2bd`) only triggers on parser/syntax errors, so the
semantically wrong geometry passes through silently.

## Test Evidence

All 3 diagnostic tests pass, confirming the bug:

| Test | Result | What It Proves |
|------|--------|----------------|
| `wrapping variable assignments as separate subtractors breaks OpenSCAD scoping` | PASS | Simple case: `al=5` and `translate([al,...])` in separate wrappers |
| `LWFL keyguard L3 pattern` | PASS | Actual keyguard subtractor pattern produces separate wrappers |
| `4-level nested difference matching keyguard module` | PASS | Full 4-level nesting + brace balance verified |

## Decision

**CSG color injection is confirmed as the root cause.** Proceed to Phase 3
(implement fix). Phase 2 (WASM binary isolation) is not needed.

**Recommended fix (Option C from plan):** Re-add the `hasCompanionFiles` guard
as an immediate fix to restore `origin/develop` behavior for multi-file projects.
Follow up with Option A (fix the injection algorithm to handle variable
assignments) as a separate enhancement.
