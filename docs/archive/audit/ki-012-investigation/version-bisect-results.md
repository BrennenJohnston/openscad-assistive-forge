# KI-012 WASM Build Version Bisect Results

> **Protocol:** [version-bisect-protocol.md](version-bisect-protocol.md)
> **Date executed:** ___________
> **Executed by:** ___________

---

## Environment

| Item | Value |
|------|-------|
| OS | _________________ |
| Browser | Chrome / Edge _________________ |
| Dev server | `pixi run dev` / `npm run dev` |
| Project | Full stakeholder project (LWFL preset) |

---

## Control: Current Build (2026.04.03)

Verify that the current build reproduces both bugs before starting the bisect.

| Metric | Value |
|--------|-------|
| Console build string | `[Worker] WASM build: OpenSCAD-2026.04.03` |
| Bug A present | YES / NO |
| Bug B present | YES / NO |
| Render time (Bug A) | _________ ms |
| Render time (Bug B) | _________ ms |
| Console warnings | _________ |

If the current build does **not** reproduce bugs, the test setup is invalid —
stop and debug before proceeding.

---

## Bisect Round 1: Bookends

### Build: 2026.01.03 (January — matches desktop reference date)

| Metric | Value |
|--------|-------|
| Archive | `OpenSCAD-2026.01.03-WebAssembly-web.zip` |
| Console build string | _________________ |
| WASM loaded OK | YES / NO |

**Bug A (expose_home_button = "no"):**

- Right edge artifact present?
  - [ ] **YES** — Bug A reproduces on Jan 2026 build
  - [ ] **NO** — Right edge is clean (correct geometry)
  - [ ] **PARTIAL** — Describe: _________
  - [ ] **BUILD FAILED** — Could not load/render

- Render time: _________ ms
- Console warnings: _________

**Bug B (expose_upper_message_bar = "no"):**

- Ghost cutouts near #1 and #12?
  - [ ] **YES** — Bug B reproduces on Jan 2026 build
  - [ ] **NO** — Surface is solid (correct geometry)
  - [ ] **PARTIAL** — Describe: _________
  - [ ] **BUILD FAILED** — Could not load/render

- Render time: _________ ms
- Console warnings: _________

---

### Build: 2026.03.28 (March — just before our build)

| Metric | Value |
|--------|-------|
| Archive | `OpenSCAD-2026.03.28-WebAssembly-web.zip` |
| Console build string | _________________ |
| WASM loaded OK | YES / NO |

**Bug A:**

- Right edge artifact present?
  - [ ] **YES**
  - [ ] **NO**
  - [ ] **PARTIAL** — Describe: _________
  - [ ] **BUILD FAILED**

- Render time: _________ ms

**Bug B:**

- Ghost cutouts near #1 and #12?
  - [ ] **YES**
  - [ ] **NO**
  - [ ] **PARTIAL** — Describe: _________
  - [ ] **BUILD FAILED**

- Render time: _________ ms

---

### Round 1 Assessment

| Build | Bug A | Bug B |
|-------|-------|-------|
| 2026.04.03 (control) | _______ | _______ |
| 2026.01.03 | _______ | _______ |
| 2026.03.28 | _______ | _______ |

**Round 1 conclusion:**

- [ ] Both bookends clean → regression is in Apr 01–03 (skip to Round 3)
- [ ] Jan clean, Mar buggy → bisect February (proceed to Round 2)
- [ ] Both buggy → test pre-upgrade build (proceed to Round 1b)
- [ ] Other: _________

---

## Bisect Round 1b: Pre-Upgrade Build (if needed)

Only run this if both Jan and Mar 2026 builds show the bugs.

### Build: 2025.03.25 (previous build before our upgrade)

| Metric | Value |
|--------|-------|
| Archive | `OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip` |
| Console build string | _________________ |
| WASM loaded OK | YES / NO |

**Bug A:**

- Right edge artifact present?
  - [ ] **YES** — Bug existed in previous build too
  - [ ] **NO** — Previous build was clean
  - [ ] **BUILD FAILED** — Incompatible with current app

**Bug B:**

- Ghost cutouts?
  - [ ] **YES**
  - [ ] **NO**
  - [ ] **BUILD FAILED**

**Round 1b conclusion:**

- [ ] Pre-upgrade also buggy → **Long-standing WASM Manifold limitation**
- [ ] Pre-upgrade clean → **Regression between Mar 2025 and Jan 2026** (test Dec 2025 builds)
- [ ] Build incompatible → **Inconclusive** (old build may not support current API)

---

## Bisect Round 2: Narrowing (if needed)

### Build: 2026.02.01 (February)

| Metric | Value |
|--------|-------|
| Archive | `OpenSCAD-2026.02.01-WebAssembly-web.zip` |
| Console build string | _________________ |

**Bug A:** YES / NO / PARTIAL / BUILD FAILED: _________

**Bug B:** YES / NO / PARTIAL / BUILD FAILED: _________

---

### Build: _________________ (additional bisect point)

| Metric | Value |
|--------|-------|
| Archive | _________________ |
| Console build string | _________________ |

**Bug A:** YES / NO / PARTIAL / BUILD FAILED: _________

**Bug B:** YES / NO / PARTIAL / BUILD FAILED: _________

---

### Build: _________________ (additional bisect point)

| Metric | Value |
|--------|-------|
| Archive | _________________ |
| Console build string | _________________ |

**Bug A:** YES / NO / PARTIAL / BUILD FAILED: _________

**Bug B:** YES / NO / PARTIAL / BUILD FAILED: _________

---

## Bisect Round 3: Final Narrowing (if needed)

### Build: _________________

**Bug A:** YES / NO / PARTIAL: _________
**Bug B:** YES / NO / PARTIAL: _________

### Build: _________________

**Bug A:** YES / NO / PARTIAL: _________
**Bug B:** YES / NO / PARTIAL: _________

---

## Version Matrix Summary

| Build Date | Archive | Bug A | Bug B | Render Time | Notes |
|------------|---------|-------|-------|-------------|-------|
| 2025.03.25 | wasm24456-WebAssembly-web | _____ | _____ | _____ | Previous build |
| 2026.01.03 | WebAssembly-web | _____ | _____ | _____ | Matches desktop ref |
| 2026.01.16 | WebAssembly-web | _____ | _____ | _____ | Size jump (+44KB) |
| 2026.02.01 | WebAssembly-web | _____ | _____ | _____ | |
| 2026.03.01 | WebAssembly-web | _____ | _____ | _____ | |
| 2026.03.28 | WebAssembly-web | _____ | _____ | _____ | Pre-April |
| **2026.04.03** | **WebAssembly-web** | **YES** | **YES** | **~12.8s** | **Current (control)** |

### Regression Window

If a regression was identified, record the narrowed window:

| Boundary | Build Date | Bug A | Bug B |
|----------|-----------|-------|-------|
| Last clean build | _________________ | NO | NO |
| First buggy build | _________________ | YES | YES |
| Date range | _________ to _________ | | |

---

## Conclusion

**Root cause determination based on version bisect:**

- [ ] **Long-standing WASM limitation** — All tested WASM builds (including
      2025.03.25) show the bugs. The WASM Manifold engine has always computed
      this geometry differently from desktop native.

- [ ] **WASM Manifold regression** — Builds before _________ are clean; builds
      after _________ show bugs. The regression window is _________ to
      _________. Upstream commit investigation recommended.

- [ ] **April 2026 build-specific** — Only the 2026.04.03 build shows bugs;
      adjacent builds are clean. Possible corrupted build or transient CI issue.

- [ ] **Inconclusive** — Describe: _________

**Combined with Phase 3 & 4 conclusions:**

| Phase | Result | Interpretation |
|-------|--------|---------------|
| Phase 3 (Desktop CLI) | _________ | _________ |
| Phase 4 (Playground) | _________ | _________ |
| Phase 5 (Version Bisect) | _________ | _________ |

**Overall root cause:**

_Fill in after integrating all phase results._

---

## Notes / Observations

_Record any unexpected behavior, timing anomalies, console warnings, or other
observations during testing._

---

## Build Restored

After completing all tests:

```powershell
.\swap-wasm-build.ps1 -Restore
```

- [ ] Original build (2026.04.03) restored
- [ ] Dev server restarted and verified
- [ ] Bug A and Bug B confirmed still present (post-restore sanity check)
