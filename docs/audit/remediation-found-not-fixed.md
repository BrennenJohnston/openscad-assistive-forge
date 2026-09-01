# Found But Not Fixed — Remediation Side-Findings

Running log of problems discovered during the 2026-08 remediation work
(branch `remediation/track-1`) that were **out of scope for the phase that
found them**. Each item stays here until a phase fixes it or the owner
decides to drop it. Per project rules, none of these were fixed silently.

## Open

### F-2 (remainder): two e2e defers, documented reasons

All other F-2 entries are resolved — see the per-test table under Resolved.
Still deliberately deferred:

- `tests/e2e/preset-workflow.spec.js:816` "user-saved presets in
  localStorage survive project reload" — exercises the dark
  `project_presets` feature (`feature-flags.js`, default false, rollout 0).
  Lands when that flag's Classic preset work is finished; testing a dark
  feature's persistence now would pin unfinished behavior.
- `tests/e2e/lwfl-parity-reproduction.spec.js:247` — diagnostic harness, not
  a regression gate; self-skips unless the gitignored
  `.volkswitch/` keyguard bundle is present. Left as-is by design.

## Resolved

### F-1: Preview status bar showed "0 triangles" for OFF-format previews
**Fixed in `fd18e25`** (Round 2, B2). `src/worker/mesh-stats.js`
`parseOffTriangleCount()` parses the OFF/COFF header from string,
ArrayBuffer, or Uint8Array payloads (duck-typed; first 1KB decoded); the
worker recovers the count for buffer-delivered OFF and wasm-smoke now
REQUIRES a non-zero triangle count in the stats bar.

### F-5: Preset import "Replace" mode called a method that does not exist
**Fixed in `fd18e25`** (Round 2, B1). `presetManager.getPresetsForModel()`
now used at the Replace-mode call site; a new preset-workflow e2e drives the
manage-presets modal → Replace radio → filechooser and asserts no TypeError
plus the imported design appearing in `#presetSelect`.

### F-3: `npm run build` dirtied a tracked file
**Fixed in `fd18e25`** (Round 2, B3). `scripts/setup-libraries.js`
`manifestsEquivalent()` skips rewriting `public/libraries/manifest.json`
when only the `generated`/`downloaded` timestamps differ. Verified: two
consecutive builds leave `git status` clean.

### F-4: Deprecated shims deleted (with their legacy tests migrated)
**Fixed in the Round 2 B4 commit.** Deleted: `countUniqueOFFColors`,
`stripColorCalls`, `injectCsgColors`, `isParserError`
(auto-preview-controller.js), `resolve2DExportIntent` (render-intent.js),
and the `injected` mode of the `__forgeDebug.exportScadSource()` console
helper (its only remaining callers). The four legacy 2D-export test files
keep exercising the proposal engine through a local
`propose2DExportAdjustments(...).resolvedParameters` helper; the three
auto-preview describe blocks that tested the deleted statics were removed.
KEPT deliberately: `csg-color-injection.spec.js` (verifies the current
post-KI-012 pipeline; its only shim reference was a comment),
`stripCommentsAndStrings`, `scadUsesColor` (live callers).
**Addendum resolved with it:** the dead `createFileTree` export in
`zip-handler.js` (zero production callers — the root cause of the
zip-workflow specs waiting on a `.file-tree` UI nothing renders) was also
deleted with its orphaned unit describe. `buildNestedTree` /
`countFilesRecursive` stay (live consumers).

### F-2: e2e failures on clean develop — per-test dispositions
All were **stale tests**, not app bugs; fixed across `fd18e25` (Round 2 B5)
and the Round 2 B6 commit. No CI-skip flags were added or removed.

| Test | Root cause | Disposition |
|---|---|---|
| expert-mode.spec.js :31/:94/:151 | `.param-control` waited `visible` while groups render as collapsed `<details>`; editor assertions targeted the textarea fallback instead of CodeMirror | fix-test (`state:'attached'`, `.cm-content` with textarea branch) — 3/3 green |
| accessibility.spec.js :2316/:2348/:2381 | same collapsed-groups wait; Basic/Advanced naming from the two-mode era; save-project modal overlay blocked the toggle click | fix-test (attached waits, Simplified/Standard naming, modal dismissal, `body[data-ui-mode]` assert) — 4/4 green |
| zip-workflow.spec.js :206/:235 (and, by the same root cause, the whole suite) | waits on `.file-tree`/`.project-files` that only the dead `createFileTree` ever produced; Companion Files section is registry-hidden in Simplified | fix-test (retarget `#projectFilesList .project-file-item`/`.main-file`/summary badge; switch to Standard first) — 5 passed / 4 honest skips |
| responsive-audit.spec.js :249 (8 viewports) | collapsed-groups wait before the SVG flow | fix-test (attached wait) — now honestly skips via its gallery-absent guard instead of failing |
| parity-regression S-007 | `selectOption({label: regex})` is invalid Playwright API (test always threw); control also sits in a collapsed group | fix-test — passes; blank-display behavior verified correct |
| parity-regression S-008 | console summary is registry-hidden in Simplified; baseline taken before interactions | fix-test (switch to Standard, baseline after) — passes; no spontaneous renders |
| parity-regression S-013 | test multi-set `#fileInput`, which is single-file since the unified upload (C1.2) | fix-test (companions zipped in-test, the real user flow) — passes; DAT companion renders |
| basic-workflow.spec.js full-workflow (found during W3) | collapsed-groups wait + gating on the headless-unreliable `download` event | fix-test (open first group; gate on render completion, download event asserted when it fires) |

Whole parity-regression suite: 13 passed / 1 honest skip, locally.

### sw.js cache version was never injected
**Fixed in `caff786`** (Round 2, H1). `generateBundle` could never see the
public-dir-copied `sw.js`; injection moved to `closeBundle` via
`scripts/inject-sw-version.js`, which throws (failing the build) if the file
or token is missing or survives. `dist/sw.js` verified to carry the real
version; the frozen `CACHE_NAME` that blocked activate-time purges is gone.

### Startup `--help` capability probe flooded the console
**Fixed in `caff786`** (Round 2, H2). Emscripten freezes print/printErr at
module creation, so the old reassignment never worked; a worker-scope
`capabilityProbeActive` flag mutes console mirroring during the probe while
`openscadConsoleOutput` still feeds the capability parser. wasm-smoke's boot
test now asserts a zero-`[OpenSCAD ERR]` console as a permanent gate.

### Dead memory-banner quality lookups
**Fixed in `8adf0ef`** (Round 2, Q2). The reduce-quality action targeted
`#qualityPreset`/`#previewQualityMode`, which do not exist; it now drives
the real `#exportQualitySelect`/`#previewQualitySelect`.
