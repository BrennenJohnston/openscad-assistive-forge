# Site facts

How this app approaches safety and privacy, for anyone curious — a
parent, a clinician, a teacher, or the person who looks after a
network. These are verifiable facts about what the site does and does
not do, with pointers to the files that prove them. It prescribes
nothing; what to do with the facts is your call.

The short version: OpenSCAD Assistive Forge is a static, open-source
web page (GPL-3.0-or-later) that runs entirely in your browser through
WebAssembly. There is no backend, no account, no telemetry, no
analytics, no third-party scripts, and no application cookies. It
enforces a strict Content Security Policy, installs as a Progressive
Web App, and works offline after the first visit.

**Live site**: `https://openscad-assistive-forge.pages.dev/`
**Source**: `https://github.com/BrennenJohnston/openscad-assistive-forge`
**License**: GPL-3.0-or-later (see `LICENSE`).

---

## What the application is

A browser-based "customizer" for parametric 3D models written in
[OpenSCAD](https://openscad.org/). I built it to lower the barrier to
producing assistive-technology hardware — keyguards, switch mounts,
grips, adaptive utensils — without installing a desktop CAD toolchain.

The application:

- Runs the official **OpenSCAD WebAssembly build** in a Web Worker
  inside your browser.
- Builds a parameter form from OpenSCAD Customizer annotations.
- Renders previews with **Three.js**.
- Exports STL / OBJ / OFF / AMF for slicing.
- Stores nothing on a server. All file input and output is local.

## Data handling

| Question | Answer |
|----------|--------|
| What user data does the server collect? | None. There is no server-side application code — only static files served by Cloudflare Pages. |
| Where are user files stored? | In the browser's memory (per tab), and — for preferences and saved work only — in the browser's own storage on your device. |
| Are cookies set? | The application sets none. Cloudflare's edge may set its own infrastructure cookies (for example `__cf_bm` for bot detection) at the CDN layer; these are not application cookies and contain no user identity. |
| Third-party scripts? | None. No analytics, no advertising, no error-reporting SDKs, no CDN fonts, no chat widgets. |
| Accounts or authentication? | None. |
| A database? | None. Nothing persists off your device. |
| Are uploads sent anywhere? | No. An uploaded `.scad` or `.zip` is read through the File API and never leaves the device. |
| Telemetry, crash reporting, usage analytics? | None. |
| Encryption in transit? | HTTPS only (Cloudflare-managed certificate); the CSP upgrades any stray `http:` request. |

In effect, the security boundary is your browser tab: there is no
network round-trip for user data because there is nowhere for that
data to go.

## The Content Security Policy

Every response carries this CSP, configured in
[`public/_headers`](../public/_headers) — the single line as shipped:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: https://raw.githubusercontent.com https://media.githubusercontent.com https://*.github.io https://*.gitlab.io https://*.pages.dev; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
```

Each directive, in plain language:

| Directive | What it does | Why it is set this way |
|-----------|--------------|------------------------|
| `default-src 'self'` | Default deny; same-origin only. | Everything else is an explicit relaxation. |
| `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'` | Same-origin scripts only. `unsafe-eval` is required by [AJV](https://ajv.js.org/), which compiles JSON Schema validators at runtime; `wasm-unsafe-eval` compiles the OpenSCAD module. | No remote scripts, no `unsafe-inline`. |
| `style-src 'self'` | Same-origin stylesheets only. | **No `unsafe-inline`** — CodeMirror's injected `<style>` element is blocked and its rules are re-homed into a constructable stylesheet. Expect exactly one `style-src-elem` console violation, from that blocked element. |
| `img-src 'self' data: blob:` | Same-origin images plus `data:`/`blob:`. | `blob:` serves in-browser STL/PNG previews; `data:` serves inline icon fallbacks. |
| `font-src 'self'` | Same-origin fonts only. | Every font, including the OpenSCAD `text()` fonts, is served by the site itself. |
| `connect-src 'self' data: …` | Fetch targets. | `'self'` for the app; the GitHub / GitLab / Pages hosts are contacted only when you open a `?manifest=` or `?project=` deep link pointing at one. There is no telemetry endpoint. |
| `worker-src` / `child-src 'self' blob:` | Workers and child contexts. | The OpenSCAD engine runs in a same-origin Web Worker. |
| `frame-ancestors 'none'` | No other site can frame this one. | Clickjacking protection. |
| `form-action 'self'` | Forms submit same-origin only. | The app submits no forms anywhere; belt and braces. |
| `base-uri 'self'` | `<base>` cannot be repointed. | Base-tag injection defense. |
| `object-src 'none'` | No `<object>`/`<embed>`/`<applet>`. | Removes a legacy surface entirely. |
| `upgrade-insecure-requests` | `http:` requests upgrade to `https:`. | Defense in depth. |

Also set in the same file: `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp` (cross-origin
isolation, required for the `SharedArrayBuffer` the engine uses),
`Cross-Origin-Resource-Policy: cross-origin`, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy:
strict-origin-when-cross-origin`.

## What the site connects to

The complete list of outbound connections, enforced at the browser by
the CSP's `connect-src`:

**Always**: `https://openscad-assistive-forge.pages.dev` — the app
shell, the engine, libraries, fonts, examples, the service worker.

**Only when you open an external deep link** (`?manifest=` /
`?project=` URLs someone shares with you): `raw.githubusercontent.com`,
`media.githubusercontent.com`, `*.github.io`, `*.gitlab.io`,
`*.pages.dev`. If a network blocks all of these, the app still works —
deep-link sharing is the only thing that does not.

There are no other outbound connections.

## Supply chain

- JavaScript dependencies are pinned by `package-lock.json` (`npm ci`
  in CI).
- CI fails the build on high or critical `npm audit` findings (see
  [`.github/workflows/test.yml`](../.github/workflows/test.yml)).
- A **CycloneDX SBOM** is generated on every CI run and uploaded as a
  build artifact — downloadable from any successful run on the
  repository's Actions tab. No stale copy is kept in the repository.
- The OpenSCAD WASM engine is committed under
  [`public/wasm/openscad-official/`](../public/wasm/openscad-official/)
  with SHA-256 pins in `INTEGRITY.json`, so the binary served matches a
  specific, reviewable upstream build.
- Nothing is signed as a download because nothing is downloaded — the
  project is a website; integrity rests on TLS to the CDN plus the CSP.

## Accessibility

The app targets **WCAG 2.2 Level AA** and publishes its conformance
work: [VPAT 2.5 (WCAG 2.2)](vpat/VPAT-2.5-WCAG.md) and the
[Accessibility Conformance Statement](ACCESSIBILITY_CONFORMANCE.md),
with per-criterion decisions and evidence under `docs/vpat/`.

## Installing on managed devices (reference)

Where devices are centrally managed, the app can be allowlisted like
any website, and browsers that support `WebAppInstallForceList` (Chrome
and Edge) can push the PWA install through policy. The JSON shape, as
plain reference material:

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

References: [Chrome Enterprise — WebAppInstallForceList](https://chromeenterprise.google/policies/#WebAppInstallForceList),
[Microsoft Learn — WebAppInstallForceList](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies#webappinstallforcelist).
User-facing install steps live in the
[Run Offline Guide](guides/RUN_OFFLINE_GUIDE.md).

## Pointers

- Vulnerability disclosure: [`SECURITY.md`](../SECURITY.md)
- Self-hosting: [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)
- Security walkthrough for deployers: [`docs/SECURITY_ADMIN_GUIDE.md`](SECURITY_ADMIN_GUIDE.md)
