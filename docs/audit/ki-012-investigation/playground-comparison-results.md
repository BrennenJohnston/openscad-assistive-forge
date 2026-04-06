# KI-012 WASM Playground Comparison Results

> **Protocol:** [playground-comparison-protocol.md](playground-comparison-protocol.md)
> **Date executed:** ___________
> **Executed by:** ___________

---

## Environment

### Playground Versions

| Playground | URL | OpenSCAD Version String | Backend | Notes |
|------------|-----|------------------------|---------|-------|
| ochafik OpenSCAD2 | ochafik.com/openscad2 | _________________ | Manifold / CGAL / unknown | |
| Official Playground | openscad.org/playground | _________________ | Manifold / CGAL / unknown | |

### Playground Capabilities

| Feature | ochafik | Official |
|---------|---------|----------|
| Multi-file upload | YES / NO | YES / NO |
| Directory structure support | YES / NO | YES / NO |
| Customizer panel | YES / NO | YES / NO |
| Console output | YES / NO | YES / NO |
| Backend selection | YES / NO | YES / NO |

### Strategy Used

- [ ] **Strategy A** — Full reproduction with file upload
- [ ] **Strategy B** — Simplified reproduction with inlined companion data
- [ ] **Strategy C** — Minimal reproduction

---

## WASM Capture Reference Data

Triangle counts from our app's WASM renders (from Phase 2 `metadata.json`):

| Bundle | expose_home_button | expose_upper_message_bar | WASM Triangles | WASM Size (bytes) |
|--------|--------------------|--------------------------|----------------|-------------------|
| Baseline | `"yes"` | `"yes"` | 56,780 | 2,839,084 |
| Bug A | `"no"` | `"yes"` | 56,158 | 2,807,984 |
| Bug B | `"yes"` | `"no"` | 56,548 | 2,827,484 |

---

## Test 1: ochafik OpenSCAD2 Playground

### 1a. Baseline (both params default)

| Metric | Value |
|--------|-------|
| Render time | _________ |
| Console warnings | _________ |
| Compiled successfully | YES / NO |

**Visual inspection:**

- [ ] Keyguard renders with no artifacts
- [ ] Right edge is smooth (no home button tab artifact)
- [ ] Upper corners near #1 and #12 are solid (no ghost cutouts)

**Screenshot:** _(attach or describe)_

---

### 1b. Bug A (expose_home_button = "no")

| Metric | Value |
|--------|-------|
| Render time | _________ |
| Console warnings | _________ |
| Compiled successfully | YES / NO |

**Bug A symptom check:**

- Does a tab jut out on the right edge where the home button cutout would be?
  - [ ] **YES** — Bug A reproduces on playground (same as our app)
  - [ ] **NO** — Right edge is a straight line (correct geometry)
  - [ ] **PARTIAL** — Describe: _________

**Screenshot:** _(attach or describe)_

**Comparison with our app:**

| Aspect | Our App (WASM) | Playground |
|--------|----------------|------------|
| Bug A visible | **YES** | _________ |
| Triangle count | 56,158 | _________ (if available) |
| Console warnings | none | _________ |

---

### 1c. Bug B (expose_upper_message_bar = "no")

| Metric | Value |
|--------|-------|
| Render time | _________ |
| Console warnings | _________ |
| Compiled successfully | YES / NO |

**Bug B symptom check:**

- Are there partial square cutouts / notched angles near grid positions #1 and #12?
  - [ ] **YES** — Bug B reproduces on playground (same as our app)
  - [ ] **NO** — Surface is solid above those positions (correct geometry)
  - [ ] **PARTIAL** — Describe: _________

**Screenshot:** _(attach or describe)_

**Comparison with our app:**

| Aspect | Our App (WASM) | Playground |
|--------|----------------|------------|
| Bug B visible | **YES** | _________ |
| Triangle count | 56,548 | _________ (if available) |
| Console warnings | none | _________ |

---

## Test 2: Official OpenSCAD Playground (if tested)

### 2a. Baseline

| Metric | Value |
|--------|-------|
| Render time | _________ |
| Compiled successfully | YES / NO |

**Visual inspection:** Same as baseline? _________

---

### 2b. Bug A (expose_home_button = "no")

**Bug A symptom:** YES / NO / PARTIAL: _________

---

### 2c. Bug B (expose_upper_message_bar = "no")

**Bug B symptom:** YES / NO / PARTIAL: _________

---

## Test 3: Customizer Approach (if tested)

If the playground has a Customizer panel and the unmodified SCAD source was
used with parameters set via the UI:

### 3a. Bug A via Customizer

**Bug A symptom:** YES / NO / PARTIAL: _________

**Matches appended-variable approach?** YES / NO

### 3b. Bug B via Customizer

**Bug B symptom:** YES / NO / PARTIAL: _________

**Matches appended-variable approach?** YES / NO

---

## Summary

### Bug A (home button tab)

| Environment | Bug present? | Notes |
|-------------|-------------|-------|
| Our app (WASM) | **YES** | 56,158 triangles |
| ochafik playground | _________ | _________ |
| Official playground | _________ | _________ |
| Desktop Apr 2026 + Manifold | _(from Phase 3)_ | |
| Desktop Jan 2026 + Manifold | _(from Phase 3)_ | |

### Bug B (ghost cutouts)

| Environment | Bug present? | Notes |
|-------------|-------------|-------|
| Our app (WASM) | **YES** | 56,548 triangles |
| ochafik playground | _________ | _________ |
| Official playground | _________ | _________ |
| Desktop Apr 2026 + Manifold | _(from Phase 3)_ | |
| Desktop Jan 2026 + Manifold | _(from Phase 3)_ | |

---

## Conclusion

_Fill in after executing all tests._

**Root cause determination based on playground comparison:**

- [ ] **WASM engine issue confirmed** — Playground reproduces the same bugs
      with the same inputs, independent of our app
- [ ] **Our app is doing something different** — Playground renders correctly,
      so our callMain invocation, file mounting, or WASM build differs
- [ ] **Version-specific** — Playground uses a different WASM build and shows
      different behavior; Phase 5 version bisect needed
- [ ] **Inconclusive** — Describe: _________

**Combined with Phase 3 (Desktop CLI) conclusion:**

- [ ] **Definitive: WASM Manifold engine bug** — Desktop renders correctly,
      playground reproduces the bug → the WASM Manifold engine computes
      differently from native
- [ ] **Definitive: Manifold engine bug (all platforms)** — Both desktop and
      playground show the bug → Manifold itself has the issue
- [ ] **Definitive: Our app issue** — Both desktop and playground are correct
      → our app's invocation is wrong
- [ ] **Further investigation needed** — Describe: _________

**Notes / observations:**

_________

---

## Version Discrepancy Notes

If the playground's WASM build version differs from our app's:

| | Our App | Playground |
|---|---------|------------|
| OpenSCAD version | unknown (Apr 2026 build) | _________ |
| Manifold support | YES | _________ |
| Lazy union support | YES | _________ |
| Binary STL support | YES | _________ |

**Impact on conclusions:** If the versions differ significantly, the playground
result tells us about that specific build, not necessarily our build. Phase 5
(Version Bisect) would then be critical.
