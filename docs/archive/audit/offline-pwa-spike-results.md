# C7 Offline PWA Spike — Results and Decision

**Date:** 2026-08-04 (Track 5, remediation plan C7.1)
**Question:** Can the app run from dumb static hosting (no COOP/COEP
headers) and work offline after a first visit — without a terminal or
build step on the user's machine (Loreto's IT-locked-machine request)?

## Method

1. `npm run build` at commit `fed3d3d`.
2. Served `dist/` from a minimal Node static server that sends **no**
   `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
   headers (only correct MIME types), simulating SharePoint-style or
   plain-intranet static hosting.
3. Playwright (Chromium) probe 1 — cold visit on that server: check
   `crossOriginIsolated`, `SharedArrayBuffer` availability, WASM engine
   init (`body[data-wasm-ready]`), and a real preview render of
   `sample.scad`.
4. Probe 2 — warm visit (boot + one render), then
   `context.setOffline(true)` and a full page reload, repeating the
   boot + render checks with the network cut.

## Results

| Check | Cold, headerless | Offline reload after 1 warm visit |
| --- | --- | --- |
| `crossOriginIsolated` | `false` | `false` |
| `SharedArrayBuffer` available | no | no |
| WASM engine initializes | **yes** | **yes** |
| Preview renders geometry | **yes** | **yes** |
| Console errors | none | none |

The OpenSCAD WASM build falls back to single-threaded execution when
`SharedArrayBuffer` is unavailable; nothing else in the app depends on
cross-origin isolation. The existing `public/sw.js` (cache-first for
JS/CSS/WASM/fonts/libraries/examples, versioned via
`__SW_CACHE_VERSION__`, old caches purged on activate) already provides
the offline cache — every asset touched during the warm visit was
served from cache while offline.

## Decision: GO — with nothing to build

- **`coi-serviceworker` is NOT needed and was NOT vendored.** The
  planned COOP/COEP-via-service-worker hack solves a problem this app
  does not have.
- **C7.2's deliverables already exist**: versioned precache/runtime
  service worker (`public/sw.js`), PWA install metadata
  (`public/manifest.json` + icons, `display: standalone`), kill-switch
  semantics via the injected cache version.
- `file://` remains explicitly out of scope (module CORS), as planned.

## Deployment note for IT-locked machines

Host the contents of `dist/` on any static web server (intranet share
served over HTTP is fine; no headers, no server-side code needed). Users
open the URL once while connected — the service worker caches the app,
engine, fonts, and libraries — and the app keeps working offline
afterwards, including full geometry rendering. Caveat: without
COOP/COEP headers the engine runs single-threaded; renders are slower
than on hosting that sends those headers (the production `_headers`
config still sends them, so the primary deployment is unaffected).

## Reproduction

The probe scripts were temporary (`tests/e2e/__tmp-pwa-spike.spec.js` +
a scratch static server); re-create from this document if the check
needs to be repeated after WASM engine upgrades — worth doing whenever
`scripts/download-wasm.js` pins a new build, since a future engine could
hard-require threads.
