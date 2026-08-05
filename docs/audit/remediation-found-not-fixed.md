# Found But Not Fixed — Remediation Side-Findings

Running log of problems discovered during the 2026-08 remediation work
(branch `remediation/track-1`) that were **out of scope for the phase that
found them**. Each item stays here until a phase fixes it or the owner
decides to drop it. Per project rules, none of these were fixed silently.

## Open

### F-1: Preview status bar shows "0 triangles" for OFF-format previews

- **Found during:** B1 (smoke suite), 2026-08-04
- **Where:** `src/worker/openscad-worker.js:1827-1845`
- **What:** The worker only counts triangles when the render output is a
  *string*. OFF (and binary STL) outputs delivered as
  ArrayBuffer/Uint8Array skip counting entirely, so `stats.triangles = 0`
  flows to `#previewStatusStats` and users see "N KB | 0 triangles" on
  most previews (the render-colors OFF path is the default).
- **Fix shape:** parse the OFF header counts / derive binstl count from
  `(byteLength - 84) / 50` in the worker. Small standalone patch.

### F-2: Four e2e tests fail on clean `develop` (masked by CI skips)

- **Found during:** A2 verification (baseline stash run), 2026-08-04
- **What:** These fail identically with and without the A2 changes, and
  are invisible in CI because they carry `test.skip(isCI, ...)`:
  - `tests/e2e/lwfl-parity-reproduction.spec.js:247` — baseline
    diagnostic capture across four render modes
  - `tests/e2e/parity-regression.spec.js` S-007 — viewport should clear
    when `generate = Customizer Settings`
  - `parity-regression.spec.js` S-008 — console panel interactions must
    not trigger renders
  - `parity-regression.spec.js` S-013 — `surface()` with a DAT text
    heightmap companion should render geometry
- **Why it matters:** S-007/S-008 are stakeholder-reported desktop-parity
  behaviors (blank display, no spontaneous geometry). S-013 is companion
  file support.
- **Fix shape:** diagnose each; candidates for the B32 skip-debt drawdown.
- **Addendum (A9 baseline run, 2026-08-04):** also pre-existing on clean
  tree: `responsive-audit.spec.js:249` "SVG editor fullscreen — opens,
  fills viewport, closeable" fails at all 8 audited viewports (chromium,
  local run; CI-skipped like the rest).
- **Addendum (B13 baseline run, 2026-08-04):** also pre-existing on clean
  tree: `accessibility.spec.js:2348` "UI mode toggle switches to Advanced
  mode and shows all panels" and `:2381` "all disclosure sections are
  keyboard-operable" (chromium, local; CI-skipped).

### F-3: `npm run build` dirties a tracked file

- **Found during:** A2 (stray diff in working tree), 2026-08-04
- **Where:** `public/libraries/manifest.json` (tracked) is rewritten by
  the `setup-libraries.js` prebuild step (clonedAt/commit metadata churn).
- **What:** every build leaves the working tree dirty, inviting accidental
  commits of generated metadata.
- **Fix shape:** revisit during B6 (library pinning) — either stop
  tracking the generated manifest or make the script idempotent when
  nothing changed.

### F-4: Deprecated shims awaiting removal (with their legacy tests)

- **Found during:** A2 and A9 (deliberate deferrals), 2026-08-04
- **Where:**
  - `AutoPreviewController.injectCsgColors`, `stripColorCalls`,
    `isParserError` (marked `@deprecated`), their direct unit tests, and
    the `countUniqueOFFColors` helper (no production callers left).
  - `resolve2DExportIntent` in render-intent.js — deprecated wrapper over
    `propose2DExportAdjustments` kept only for the legacy test files
    (`resolve-2d-export.test.js`, `svg-export-workflow.test.js`,
    `parity-harness.test.js`, `parity-probes.test.js`, ~50 call sites).
- **Fix shape:** migrate/trim the legacy tests to the new APIs, then delete
  the shims in one cleanup phase.

## Resolved

*(move items here with the commit hash that fixed them)*
