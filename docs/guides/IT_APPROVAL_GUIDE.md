# IT Approval Guide

A reference document for IT, security, and procurement teams evaluating **OpenSCAD Assistive Forge** for allowlisting, enterprise deployment, or general use on managed devices.

---

> **TL;DR for IT directors**
>
> OpenSCAD Assistive Forge is a static, open-source web application (GPL-3.0-or-later) that runs entirely in the user's browser via WebAssembly. There is no backend, no user accounts, no telemetry, no analytics, no third-party trackers, and no cookies. The site enforces a strict Content Security Policy with no `unsafe-inline` styles. Hosting is on Cloudflare Pages. The app is installable as a Progressive Web App and works fully offline after the first visit. Accessibility targets WCAG 2.2 AA (VPAT 2.5 published). Recommended action: allowlist `https://openscad-assistive-forge.pages.dev/` and, optionally, force-install the PWA via Chrome / Edge group policy for clinician or workshop user groups.

---

## What this application is

OpenSCAD Assistive Forge is a browser-based "customizer" for parametric 3D models written in [OpenSCAD](https://openscad.org/). It is intended to lower the barrier to producing assistive-technology hardware (keyguards, switch mounts, grips, adaptive utensils, and similar) for clinicians, caregivers, makerspaces, and end-users who do not want to install a desktop CAD toolchain.

The application:

- Runs the official **OpenSCAD WebAssembly build** in a Web Worker inside the user's browser.
- Builds a parameter form from OpenSCAD Customizer annotations in the model.
- Renders previews with **Three.js**.
- Lets the user export STL / OBJ / OFF / AMF / 3MF for downstream slicing.
- Stores nothing on a server. All file I/O is local.

**Live site**: `https://openscad-assistive-forge.pages.dev/`
**Source repository**: `https://github.com/BrennenJohnston/openscad-assistive-forge`
**License**: GPL-3.0-or-later (auditable, redistributable; see `LICENSE`).

---

## Security posture

### Content Security Policy

The site sets the following CSP on every response, configured in [`public/_headers`](../../public/_headers).

The header value as shipped (single line, copied verbatim from `public/_headers`):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: https://raw.githubusercontent.com https://media.githubusercontent.com https://*.github.io https://*.gitlab.io https://*.pages.dev; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
```

The same policy, broken across lines for readability (semantically identical):

```
default-src 'self';
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' data: https://raw.githubusercontent.com https://media.githubusercontent.com https://*.github.io https://*.gitlab.io https://*.pages.dev;
worker-src 'self' blob:;
child-src 'self' blob:;
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests
```

Each directive, in plain language:

| Directive | What it does | Why it is set this way |
|-----------|--------------|------------------------|
| `default-src 'self'` | Default deny for every resource type, allow only same-origin. | Defense in depth; everything else is an explicit relaxation. |
| `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'` | Allows scripts from same origin only. `unsafe-eval` is required by [AJV](https://ajv.js.org/) which compiles JSON Schema validators at runtime via `new Function()`. `wasm-unsafe-eval` is required to compile the OpenSCAD WebAssembly module. | No remote scripts. No `unsafe-inline`. Scope of `unsafe-eval` is narrow and well-understood. |
| `style-src 'self'` | Stylesheets from same origin only. | **No `unsafe-inline`** -- CodeMirror 6 uses constructable stylesheets, so we do not need it. This is a stricter style-src than most web apps ship with. |
| `img-src 'self' data: blob:` | Images same-origin plus `data:` and `blob:` URIs. | `blob:` is needed for in-browser STL/PNG previews; `data:` is needed for inline icon fallbacks. |
| `font-src 'self'` | Fonts same-origin only. | All fonts (including the OpenSCAD `text()` fonts) are served from the site itself. |
| `connect-src 'self' data: https://raw.githubusercontent.com https://media.githubusercontent.com https://*.github.io https://*.gitlab.io https://*.pages.dev` | XHR / fetch / WebSocket targets. | `'self'` for the app shell; the GitHub / GitLab / Pages hosts are only contacted when a user explicitly opens a `?manifest=` or `?project=` deep-link pointing at one of those hosts. There is no telemetry endpoint. |
| `worker-src 'self' blob:` and `child-src 'self' blob:` | Web Workers and child contexts. | OpenSCAD WASM runs in a Web Worker; the worker is loaded from same-origin. |
| `frame-ancestors 'none'` | The site cannot be framed by any other site. | Clickjacking protection. |
| `form-action 'self'` | Forms can only submit to same-origin. | The app does not submit forms anywhere; this is belt-and-braces. |
| `base-uri 'self'` | `<base>` cannot be hijacked to point at a different origin. | Defense against base-tag injection. |
| `object-src 'none'` | No `<object>` / `<embed>` / `<applet>` content. | Removes a legacy attack surface entirely. |
| `upgrade-insecure-requests` | Any accidentally `http:`-scheme request is upgraded to `https:`. | Defense in depth; the site is HTTPS-only at the CDN. |

### Other response headers

Also set in [`public/_headers`](../../public/_headers):

- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` -- enables cross-origin isolation, required for `SharedArrayBuffer` (used by OpenSCAD WASM) and as a side-effect prevents Spectre-style cross-origin reads.
- `Cross-Origin-Resource-Policy: cross-origin`
- `X-Content-Type-Options: nosniff` -- prevents MIME sniffing.
- `X-Frame-Options: SAMEORIGIN` -- legacy clickjacking defense alongside `frame-ancestors`.
- `Referrer-Policy: strict-origin-when-cross-origin` -- minimizes referrer leakage.

### Further security documentation

- [`SECURITY.md`](../../SECURITY.md) -- vulnerability disclosure policy and supported versions.
- [`docs/SECURITY_ADMIN_GUIDE.md`](../SECURITY_ADMIN_GUIDE.md) -- detailed admin / deployer-facing security walkthrough (CSP rationale, dependency policy, incident response).

---

## Data handling

| Question | Answer |
|----------|--------|
| What user data does the server collect? | None. There is no server-side application code -- only static files served by Cloudflare Pages. |
| Where are user files stored? | In the user's browser memory (per-tab), and -- for user preferences only -- in `localStorage` on the user's own device. |
| Are cookies set? | No. The application sets no cookies. Cloudflare's edge may set its own infrastructure cookies (e.g. `__cf_bm` for bot detection) at the CDN layer; these are not application cookies and contain no user identity. |
| Does the app use third-party scripts? | No. There are no analytics, no advertising scripts, no error-reporting SDKs, no fonts loaded from CDNs, no chat widgets. |
| Is there user authentication? | No. There are no user accounts. |
| Is there a database? | No. There is no backend database; nothing is persisted off the user's device. |
| Are uploads sent anywhere? | No. When a user uploads an OpenSCAD `.scad` or `.zip` file, it is read into the browser via the File API and never transmitted off the device. |
| Is there telemetry, crash reporting, or usage analytics? | No. |
| Is data encrypted in transit? | Yes. The site is served over HTTPS only (Cloudflare-managed certificate); HTTP requests are upgraded by the CSP. |

In effect: **the security boundary is the user's browser tab**. There is no network round-trip to worry about for user data because there is no place for that data to go.

---

## Network requirements

For an IT team deciding what to allowlist on a managed network, the application's outbound connections are exhaustively listed below. The `connect-src` directive in the CSP enforces this list at the browser level.

### Required (always)

| Origin | Purpose | Notes |
|--------|---------|-------|
| `https://openscad-assistive-forge.pages.dev` | The app shell, WASM, libraries, fonts, examples, service worker. | Hosted on Cloudflare Pages; standard TLS on port 443. |

### Optional (only when a user opens an external deep-link)

The app supports URL parameters of the form `?manifest=https://...` or `?project=https://...` so a clinician or instructor can email a link that pre-loads a specific model. When -- and only when -- a user opens such a link, the browser fetches the target file from one of these allowed hosts:

| Origin | Purpose |
|--------|---------|
| `https://raw.githubusercontent.com` | GitHub raw file fetch (e.g. a `.scad` file in a public GitHub repo). |
| `https://media.githubusercontent.com` | GitHub LFS / large-media file fetch. |
| `https://*.github.io` | GitHub Pages hosted manifests. |
| `https://*.gitlab.io` | GitLab Pages hosted manifests. |
| `https://*.pages.dev` | Cloudflare Pages hosted manifests (including this app's own deploy previews). |

If your network blocks all of these, the core application still works -- the user just cannot use deep-link sharing.

There are no other outbound connections. No analytics endpoint, no error-tracking endpoint, no font CDN, no script CDN.

---

## Supply-chain security

### Dependency policy

- All JavaScript dependencies are pinned via `package-lock.json` (verified by `npm ci` in CI).
- CI runs `npm audit --audit-level=high` and **fails the build on high or critical vulnerabilities**. See [`.github/workflows/test.yml`](../../.github/workflows/test.yml) (search for `npm audit`).
- A **CycloneDX SBOM** (`sbom-generated.json`) is produced on every CI run via `@cyclonedx/cyclonedx-npm` and uploaded as a build artifact. Your team can download it from any successful CI run on the GitHub Actions tab.

### WebAssembly artifact integrity

The OpenSCAD WASM artifacts are committed to the repository under [`public/wasm/openscad-official/`](../../public/wasm/openscad-official/) with a manifest at [`public/wasm/openscad-official/INTEGRITY.json`](../../public/wasm/openscad-official/INTEGRITY.json). The manifest pins the upstream OpenSCAD release used and the SHA of each artifact, so the binary served to users matches a specific, reviewable upstream build.

### Build and deploy

- Source repository: GitHub (public, GPL-3.0-or-later).
- CI: GitHub Actions ([`.github/workflows/`](../../.github/workflows/)). Runs lint, unit tests, end-to-end tests (Playwright), markdown lint, accessibility checks (axe), and the audit + SBOM job above.
- Production hosting: Cloudflare Pages (built from `main`).
- No artifact is signed (the project is a website, not a downloadable binary). The integrity story for end-users rests on TLS to the Cloudflare CDN plus the in-browser CSP.

---

## Accessibility

OpenSCAD Assistive Forge targets **WCAG 2.2 Level AA** and ships a published Voluntary Product Accessibility Template:

- [VPAT 2.5 (WCAG 2.2)](../vpat/VPAT-2.5-WCAG.md)
- [Accessibility Conformance Statement](../ACCESSIBILITY_CONFORMANCE.md)

The VPAT is updated alongside the codebase; per-criterion status is tracked in `docs/vpat/conformance-decisions.md` with evidence files in `docs/vpat/evidence/`.

If you need a signed VPAT or a conformance letter on letterhead, contact the maintainers via the repository (issue or `SECURITY.md` contact).

---

## Approval request checklist

A copy-paste checklist your security reviewer can run through:

- [ ] **Static site, no server-side code** -- confirmed: hosted on Cloudflare Pages, no backend application logic.
- [ ] **No data collection or telemetry** -- confirmed: no analytics, no error reporting, no usage metrics endpoints.
- [ ] **Enforcing CSP, no `unsafe-inline` styles** -- confirmed: see [`public/_headers`](../../public/_headers).
- [ ] **Open source under a recognized license** -- confirmed: GPL-3.0-or-later, source on GitHub.
- [ ] **SBOM available** -- confirmed: CycloneDX `sbom-generated.json` on every CI run.
- [ ] **Dependency vulnerability gate in CI** -- confirmed: `npm audit --audit-level=high` blocks builds.
- [ ] **No third-party trackers, ads, or analytics** -- confirmed.
- [ ] **No cookies, no authentication, no user accounts** -- confirmed.
- [ ] **Accessibility compliant** -- confirmed: WCAG 2.2 AA target, [VPAT 2.5](../vpat/VPAT-2.5-WCAG.md) published.
- [ ] **User data stays on the user's device** -- confirmed: file uploads, parameter values, and exports never leave the browser.
- [ ] **HTTPS only with strict transport policy at CDN** -- confirmed.
- [ ] **Vulnerability disclosure policy published** -- confirmed: [`SECURITY.md`](../../SECURITY.md).

---

## Enterprise deployment options

There are two reasonable ways to make this app available to your users on managed devices.

### Option A: Allowlist the URL only

Lowest-overhead option. Add `https://openscad-assistive-forge.pages.dev/` (and optionally the deep-link hosts in the [Network requirements](#network-requirements) table) to your web filter / proxy allowlist. Users open the URL in Chrome or Edge and -- if they want -- click the install icon themselves to get a desktop-app experience. See [Run Offline Guide](RUN_OFFLINE_GUIDE.md) for the user-facing instructions.

### Option B: Force-install the PWA via group policy

Pushes the app to a target user group's Start menu without user action. The app appears just like any other corporate-managed application.

#### Chrome (`WebAppInstallForceList`)

```json
[
  {
    "url": "https://openscad-assistive-forge.pages.dev/",
    "default_launch_container": "window",
    "create_desktop_shortcut": true,
    "fallback_app_name": "OpenSCAD Assistive Forge"
  }
]
```

Reference: [Chrome Enterprise -- WebAppInstallForceList policy](https://chromeenterprise.google/policies/#WebAppInstallForceList).

#### Microsoft Edge

Edge supports the same `WebAppInstallForceList` policy with the identical JSON shape. Configure under **Microsoft Edge -- Configure list of force-installed Web Apps**.

Reference: [Microsoft Learn -- WebAppInstallForceList](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies#webappinstallforcelist).

#### Microsoft Intune

Push the same Edge or Chrome policy via the **Settings catalog** (search for `WebAppInstallForceList`) or as an **Administrative template**. Use the JSON above as the policy value.

The same enterprise deployment instructions, with screenshots-friendly user-facing wording, also live in the end-user [Run Offline Guide](RUN_OFFLINE_GUIDE.md#for-it-managed-devices-force-install-via-group-policy).

---

## Roadmap note

If a signed desktop installer (Electron, Tauri, or similar) becomes available in the future, **the same security model documented here continues to apply** -- the same CSP, the same dependencies, the same data-handling story, the same SBOM. A signed installer would change *how* the application is delivered, not *what* it does or *what* data it touches. This document remains valid in that scenario; only the delivery / deployment section would gain an additional option.

For now, the project's recommendation is the PWA install path described above: it requires zero new code, zero new infrastructure, and -- crucially -- requires no IT executable approval, because it is just a website your browser remembers.

---

## Contact and resources

- **Source repository**: `https://github.com/BrennenJohnston/openscad-assistive-forge`
- **Live site**: `https://openscad-assistive-forge.pages.dev/`
- **Vulnerability disclosure**: [`SECURITY.md`](../../SECURITY.md)
- **Security admin walkthrough**: [`docs/SECURITY_ADMIN_GUIDE.md`](../SECURITY_ADMIN_GUIDE.md)
- **Deployment guide (self-host)**: [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md)
- **VPAT (WCAG 2.2)**: [`docs/vpat/VPAT-2.5-WCAG.md`](../vpat/VPAT-2.5-WCAG.md)
- **Accessibility conformance**: [`docs/ACCESSIBILITY_CONFORMANCE.md`](../ACCESSIBILITY_CONFORMANCE.md)
- **SBOM**: produced as the `sbom` artifact on every successful run of [`.github/workflows/test.yml`](../../.github/workflows/test.yml) (visible in the GitHub Actions tab of the repository).
- **End-user install instructions**: [Run Offline Guide](RUN_OFFLINE_GUIDE.md).
