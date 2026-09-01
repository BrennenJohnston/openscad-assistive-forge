# Forge hand-off contract

**Owner review pending.** This page is a draft in the project owner's voice.
Every claim on it is backed by something in this repository, but the wording,
the page's name, and the decision to publish it at all are theirs.

**Audience: people building a tool that hands work to Forge, or takes work back
from it.** You should not need to talk to anybody to implement anything here.
If you find a claim on this page you cannot verify from this repository, that is
a bug in the page.

Companion pages: `MANIFEST_STABILITY_CONTRACT.md` (what a link parameter
promises and for how long) and `../guides/MANIFEST_SHARING_GUIDE.md` (the same
material for a person rather than a program).

**Nothing on this page is speculative.** Every lane below is shipped, has a test
in this repository, and was measured. Where something does not work, this page
says so plainly rather than leaving it out.

---

## 1. What Forge is, in one paragraph

Forge is a browser page. It renders OpenSCAD in WebAssembly on the visitor's own
machine. There is no account, no server-side project storage, and no API: the
whole interface between your tool and Forge is **a URL going in** and **a file
coming out**. That is a smaller surface than you probably expected, and it is
the reason the two ends can be built independently.

---

## 2. Lanes in: how to open something in Forge

Compose an ordinary link. Every parameter below is marked **Stable** in
`MANIFEST_STABILITY_CONTRACT.md`, which means it keeps working.

| Parameter | What it opens |
| --- | --- |
| `?manifest=<url>` | A project described by a `forge-manifest.json` at `<url>` |
| `?project=<url>` | A `.zip` bundle, or a single `.scad`, at `<url>` |
| `?scad=<url>` | The same as `?project=`. Both accept either kind of file |
| `?example=<key>` | A design that ships with Forge, by key |
| `?load=<key>` | The same as `?example=` |
| `?preset=<name>` | Selects a named preset after the project loads |
| `?uiMode=<mode>` | Opens in a named interface mode |
| `?skipWelcome=true` | Goes straight to the project, no welcome screen |

Percent-encode the URL you put in the query. A manifest link looks like this:

```text
https://<forge-host>/?manifest=https%3A%2F%2Fraw.githubusercontent.com%2Fyou%2Frepo%2Fmain%2Fforge-manifest.json
```

### 2.1 Where the file may be hosted

Fetches are governed by the deployed Content-Security-Policy (`public/_headers`).
`connect-src` allows, today:

```text
'self'  data:  https://raw.githubusercontent.com  https://media.githubusercontent.com
https://*.github.io  https://*.gitlab.io  https://*.pages.dev
```

So: GitHub raw URLs work, GitHub Pages hosting works, GitLab Pages works,
Cloudflare Pages works, and a `data:` URL works. **Anything else is refused by
the browser before the request leaves the page** - including GitHub Release
asset URLs and object storage such as S3-compatible endpoints. That is measured,
not assumed: routing those URLs to a local handler shows they never reach the
network layer.

If you need a host added, open an issue saying which host and why. Do not expect
the list to change on its own.

### 2.2 The settings fragment

Everything after `#` carries the parameter values the sender had on screen:

```text
#v=1&params=%7B%22width%22%3A77%2C%22depth%22%3A40%7D
```

`params` is a percent-encoded JSON object of parameter names to values. Only
values that differ from the design's own defaults need to be in it.

Two things worth knowing:

- **The fragment never reaches a server.** Browsers do not send it. A settings
  link therefore leaks nothing to the host serving Forge.
- **It is the roomy lane.** Chromium navigates fragments from 64 KB to about
  1 MB (a 2 MB total URL is refused - the documented Chromium cap). Firefox
  holds 64 KB comfortably; its true ceiling was not established, because the
  test automation failed before the browser did. Treat 64 KB as the safe number
  for both.

A value outside what the design allows is not an error. Forge clamps it, keeps
the design's own value for anything it cannot use, and tells the person what it
changed in a notice above the controls.

### 2.3 The zero-hosting lane: `data:` manifests

You can put the manifest itself in the link and host nothing:

```text
?manifest=data:application/json;base64,<base64 of the manifest JSON>
```

This works today on Chromium and Firefox, and the deployed CSP permits it
(`connect-src` includes `data:`).

**The budget is small and it is the query string that binds.** Measured: an 8 KB
URL loads; a 16 KB URL was refused with HTTP 431 by the dev server, and Firefox
hung rather than reporting. A CDN in front of Forge will have its own cap.
**Keep a `data:` manifest well under 8 KB.**

The files a `data:` manifest names must still be fetchable from an allowed host:
relative paths cannot resolve against a `data:` base, so name absolute URLs.

Inline file *content* is possible but awkward: the loader decides a file's kind
by its suffix, so an inline `.scad` needs a fragment suffix
(`data:text/plain;base64,…#f.scad`) to be recognised. If you find yourself doing
this, say so in an issue - a proper inline-content field is the obvious
successor and nobody has needed it yet.

### 2.4 Choosing what the person sees first

A manifest can declare `defaults.starterParameters`: a list of parameter names.
Forge shows those controls first and puts everything else behind one **Show all
parameters** button. Useful when your design has more than a screenful.
Documented in `MANIFEST_STABILITY_CONTRACT.md`.

---

## 3. Lanes out: what comes back, and what it is called

Forge hands files to the person, not to your tool. There is no callback, no
postMessage, and no shared storage (see section 5). What you can rely on is that
the file the person sends you is recognisable.

| What | Named | Notes |
| --- | --- | --- |
| A generated model | `<design>-<hash>.stl` and the other export formats | Chosen at export time |
| An edited drawing | `<source>-edited.svg` | From the drawing editor: `bird.svg` in, `bird-edited.svg` out |
| An edited drawing, as DXF | `<source>-edited.dxf` | The same editor, converted through Forge's own OpenSCAD engine |
| A whole project | a `.zip` the person downloads | Contains the project files, the manifest, and the provenance record below |

### 3.1 The provenance record

A downloaded project carries `forge-provenance.json`:

```json
{
  "forgeProvenance": "1.0",
  "generatedAt": "2026-08-25T00:00:00.000Z",
  "appVersion": "4.5.0",
  "project": "My Project",
  "manifest": "https://…/forge-manifest.json",
  "preset": "Large",
  "parameters": { "width": 77 }
}
```

If your tool receives one of these, `manifest` tells you where the design came
from and `parameters` tells you exactly what the person set. That is enough to
reproduce their result without asking them anything.

### 3.2 Drawings in and out

Forge accepts `.svg` and `.dxf` as drawings, and `.png`, `.jpg`, `.bmp` and
`.gif` as pictures it will trace into a drawing. A drawing that comes in can be
tidied up (subpaths excluded, ink separated from a coloured background) and sent
back out as SVG or DXF. The DXF conversion runs through Forge's own OpenSCAD
engine, and the editor states the finished size in millimetres, out loud,
because a DXF is a file somebody is going to cut.

### 3.3 The shared-folder lane (Chromium-family only, and currently off)

Forge can watch a folder on the person's own machine and re-render when another
program writes to it, using the File System Access API. That means Chrome and
Edge; Firefox and Safari do not have it, and Forge says so rather than pretending.

Writing back **exists but ships switched off** pending a test only a person can
do (does the other tool's watcher stay quiet when Forge writes?). Do not build
against this lane yet. When it lights, the rule is already fixed: Forge writes
exports and companion files, and never the main design - it is not the editor of
record for that file in this loop.

---

## 4. Sizes, limits and timeouts

Measured from `src/js/manifest-loader.js`, not from memory:

| Limit | Value |
| --- | --- |
| Fetch timeout, per file | 30 seconds |
| Maximum single file | 50 MB |
| Maximum files in a manifest | 50 |
| Query-string budget (whole URL) | keep under 8 KB |
| Fragment budget | 64 KB is safe on both engines |

---

## 5. Four things that will not work, and why

These follow from the security headers Forge is deployed with
(`public/_headers`). They are not policy decisions anyone can waive for you;
they are what the browser does.

1. **You cannot put Forge in an iframe.** The CSP sets
   `frame-ancestors 'none'`. Embedding is refused by the browser.
2. **You cannot message Forge through `window.opener`.** The page sets
   `Cross-Origin-Opener-Policy: same-origin`, which severs the reference
   between a document and its opener. A window you open will not be able to
   talk back to you, and you will not be able to talk to it.
3. **You cannot fetch from an arbitrary host.** See 2.1. The allowlist is the
   allowlist.
4. **There is no server-side state.** No accounts, no project storage, no API to
   poll. Whatever the person does happens on their machine.

What this leaves is genuinely enough for a two-tool workflow: your tool composes
a link, the person does the work, and a named file comes back. Both of those are
things a person can do without either tool trusting the other.

---

## 6. Errors your link can cause

When a manifest link fails, Forge shows the person a plain sentence and logs a
coded error. The codes, enumerated from `src/js/manifest-loader.js`:

| Code | What it means for the link you composed |
| --- | --- |
| `INVALID_URL` | The URL was not usable, or was not `https:` |
| `INVALID_PATH` | A path inside the manifest tried to escape its folder |
| `CORS_ERROR` | The host served the file without the headers a browser needs |
| `HTTP_ERROR` | The host answered, but not with the file (404 and friends) |
| `NETWORK_ERROR` | The request never completed |
| `TIMEOUT` | 30 seconds passed |
| `PARSE_ERROR` | The manifest was not valid JSON |
| `VALIDATION_ERROR` | The manifest was JSON, but not a manifest |
| `FILE_TOO_LARGE` | One file was over 50 MB |
| `PROJECT_TOO_LARGE` | The whole project was over the total cap |
| `LFS_POINTER` | The URL served a Git LFS pointer instead of the file |
| `BUNDLE_EXTRACT_ERROR` | The `.zip` could not be opened |

`CORS_ERROR` and `HTTP_ERROR` are the two you will actually hit. Both usually
mean the file is not where the link says it is, or the host is not one of the
allowed ones.

---

## 7. What this page promises

The same promise as `MANIFEST_STABILITY_CONTRACT.md`, and for the same reason:

- **Additive only.** New fields and new parameters may appear. Existing ones
  keep their meaning.
- **Nothing is removed without six months of notice**, and the notice appears in
  the CHANGELOG.
- **If a lane is described here, a test in this repository exercises it.** If
  you find one that does not, that is a bug worth an issue.

A machine-readable summary of this page lives at `/forge-capabilities.txt` on
any Forge deployment.
