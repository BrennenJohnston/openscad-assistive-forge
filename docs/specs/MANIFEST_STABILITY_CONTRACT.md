# Manifest Feature Stability Contract

> **Audience**: Project authors who host designs for Forge via `forge-manifest.json`. This document specifies what Forge guarantees about the manifest feature's stability.

## Purpose

This contract defines the stability guarantees Forge makes to manifest authors. If you create a `forge-manifest.json` and share a link, these guarantees ensure your link continues to work.

---

## Supported URL Parameters

The following URL parameters are supported and will remain stable:

| Parameter | Since | Status | Semantics |
|-----------|-------|--------|-----------|
| `?manifest=<url>` | v1.0 | **Stable** | Load a project from a `forge-manifest.json` hosted at `<url>` |
| `?preset=<name>` | v1.0 | **Stable** | Override the manifest's default preset selection |
| `?skipWelcome=true` | v1.0 | **Stable** | Skip the welcome screen and load directly |
| `?example=<key>` | v1.0 | **Stable** | Load a built-in example by key name |
| `?load=<key>` | v1.0 | **Stable** | Alias for `?example=` (for website embedding convenience) |
| `?project=<url>` | v1.0 | **Stable** | Load a ZIP bundle from a URL |
| `?scad=<url>` | v1.0 | **Stable** | Alias for `?project=`. Both accept a `.scad` or a `.zip` |
| `?uiMode=<mode>` | v1.0 | **Stable** | Open in a named interface mode, the same values `defaults.uiMode` takes |

**"Stable" means**: These parameters will continue to work in all future versions. Their behavior will not change in backward-incompatible ways.

---

## The settings fragment: `#v=1&params=`

Everything after the `#` in a Forge link is the **settings fragment**. It
carries the parameter values the sender had on screen, so a link can say "open
this design, at these numbers".

```text
https://…/?manifest=https%3A%2F%2F…%2Fforge-manifest.json#v=1&params=%7B%22width%22%3A77%7D
```

| Key | Meaning |
|-----|---------|
| `v` | Fragment format version. Currently `1` |
| `params` | `encodeURIComponent(JSON.stringify(values))`, where `values` holds ONLY the parameters that differ from the loaded model's defaults |

**Guarantees:**

- **Stable since v1.0.** The `v=1` shape above will keep loading. A future
  format arrives as `v=2` beside it, never by changing what `v=1` means.
- **Validated, never trusted.** Incoming values are checked against the loaded
  model's own parameter schema: out-of-range numbers are clamped, values
  outside an enumeration are refused, and parameters the model does not have
  are dropped. When anything is adjusted, Forge says so on screen and to a
  screen reader.
- **Other fragment keys are left alone.** If your `#` carries keys that are not
  `v` or `params`, Forge preserves them when it writes its own.
- **Nothing is sent to a server.** Browsers never transmit the fragment, so
  parameter values in a link do not reach Forge's host or your file host.

**Size:** the fragment is the roomy half of a URL. Chromium has navigated
1 MB fragments in testing; the practical limit is the browser's total URL cap
(around 2 MB in Chromium), and other browsers are lower. Query parameters are
the tight half - see the data-URL section below.

**Writing one:** Forge writes it for you. The address bar updates about a
second after you change a value, the **Copy Link** action in the Actions
drawer copies the current design plus its settings, and the Publish dialog's
**Include my current settings in the link** checkbox appends the same fragment
to a manifest link.

---

## Manifest Schema Versioning

### Current Version: `"1.0"`

The `forgeManifest` field in your JSON declares which schema version you're using. Forge guarantees:

1. **Backward compatibility**: `"forgeManifest": "1.0"` manifests will continue to work in all future versions of Forge.
2. **Additive changes only**: New fields may be added to the schema, but existing fields will not be removed or have their semantics changed.
3. **New versions are opt-in**: If a `"2.0"` schema is introduced, it will be a separate opt-in. Your `"1.0"` manifests keep working unchanged.

### Schema Version `"1.0"` Fields

**Required:**
- `forgeManifest`: Must be `"1.0"`
- `files.main`: Path to the main `.scad` file **— optional when `files.bundle` is set**

**Optional (all preserved):**
- `name`, `id`, `author`, `description`, `homepage`
- `files.bundle`: Path to a `.zip` bundle file (additive field, v1.0)
- `files.companions`, `files.presets`, `files.assets`
- `defaults.preset`, `defaults.autoPreview`, `defaults.skipWelcome`
- `defaults.uiMode`: the interface mode a project opens in, the same values `?uiMode=` takes
- `defaults.hiddenPanels`: an array of panel ids to keep out of the way in the simplified mode. Panels are hidden, never removed; the person opening your project can show any of them
- `defaults.starterParameters`: an array of parameter names to show first. The Customizer surfaces those controls and puts the rest behind one "Show all parameters" button. Like `hiddenPanels`, nothing is removed: everything is one button away, the button is a toggle, and a name your design does not have is reported rather than treated as an error

### `defaults.starterParameters` (additive field)

`defaults.starterParameters` was added as an additive optional field in schema
version `"1.0"`. A manifest without it renders exactly as it always did.

```json
{
  "forgeManifest": "1.0",
  "files": { "main": "keyguard.scad" },
  "defaults": {
    "starterParameters": ["tablet_model", "grid_rows", "grid_columns"]
  }
}
```

When present:

- the Customizer shows those controls, opens the groups they live in, and hides
  every other control and any group left with nothing in it
- one control appears above the parameters: **Show all parameters**. It is a
  toggle, so the way back to the shorter screen is the same button
- hidden means hidden for everybody. The wall is `display: none`, so a control
  a sighted person cannot see is not reachable by keyboard or screen reader
  either. Nothing is removed from the page and everything comes back
- searching the parameters, or jumping to a group, drops the wall on its own
  and says so. A search that cannot find a parameter the design has would be a
  lie
- a name the design does not have is reported in a notice above the parameters
  and in the console, and the rest of the list still works. It is never an
  error, because a manifest is somebody else's file and a stale name in it is
  not a reason to refuse the whole project
- the list belongs to the project it came with. Opening a different file does
  not inherit it

### `files.bundle` (additive field)

`files.bundle` was added as an additive optional field in schema version `"1.0"`. When present:

- Forge downloads the referenced `.zip` and extracts it using the same logic as `?project=<url>`
- `files.main` becomes optional; if omitted, the main `.scad` file is auto-detected from the archive
- If `files.main` is specified alongside `files.bundle`, it is used as an explicit override

Existing manifests without `files.bundle` are unaffected — this is a non-breaking additive change per the policy above.

---

## Supported Hosting Platforms

Forge's Content Security Policy (CSP) `connect-src` directive determines which external origins can serve manifest files. The following are currently permitted:

| Origin Pattern | Platform | Status |
|---------------|----------|--------|
| `https://raw.githubusercontent.com` | GitHub raw files | **Supported** |
| `https://media.githubusercontent.com` | GitHub Git LFS content | **Supported** |
| `https://*.github.io` | GitHub Pages | **Supported** |
| `https://*.gitlab.io` | GitLab Pages | **Supported** |
| `https://*.pages.dev` | Cloudflare Pages | **Supported** |
| `data:` | The manifest carried inside the link itself | **Supported**, see below |

An origin that is not on this list is refused inside the browser before any
request is sent. That includes `https://github.com` release asset URLs and
object stores such as S3 or Cloudflare R2, which are a different origin from
the Pages domains above.

### Hosting nothing at all: `?manifest=data:`

A whole manifest can travel inside the link, with no file hosted anywhere:

```text
?manifest=data:application/json;base64,<base64 of the manifest JSON>
```

**Guarantees and limits:**

- **Stable since v1.0.** `data:` is permitted by Forge's `connect-src`, and
  loads on Chromium and Firefox.
- **Keep the whole URL under about 8 KB.** This is the tight half of a URL:
  8 KB URLs load, and 16 KB drew an HTTP 431 from a plain Node server in
  testing, with Firefox hanging rather than reporting an error. Hosts and CDNs
  set their own caps below whatever the browser allows.
- **Relative paths cannot resolve** against a `data:` base. Files a `data:`
  manifest names must be absolute URLs on the allowlist, or `data:` URLs
  themselves.
- **File-name suffixes still apply.** `files.main` must end in `.scad`, so a
  `data:` file URL needs a fragment suffix to carry its name, for example
  `data:text/plain;base64,…#design.scad`.

Because of the 8 KB ceiling, this lane suits a small manifest pointing at
hosted files, not a project inlined whole. **A dedicated inline-content field
is the planned successor** for carrying file contents in a manifest; it would
live in the fragment, where the room is, rather than in the query.

---

### CORS / COEP Requirements

Forge runs with `Cross-Origin-Embedder-Policy: require-corp`. This means files fetched from external origins must either:

1. Be served with `Cross-Origin-Resource-Policy: cross-origin` header, **or**
2. Be served from a CORS-enabled origin that Forge's CSP permits

All platforms listed above meet these requirements. If you host files on a platform not listed above, verify that it serves appropriate CORS and CORP headers.

### Adding New Platforms

If a widely-used hosting platform needs to be added to the CSP `connect-src`, this can be requested via a GitHub issue. Adding a new origin is **not** a breaking change.

---

## Files Forge writes

### `forge-provenance.json` (PROPOSED, not yet a guarantee)

The Publish dialog's **Download Project ZIP** puts a small record beside the
project so a file that comes back can say where it came from:

```json
{
  "forgeProvenance": "1.0",
  "generatedAt": "2026-08-24T22:16:15.999Z",
  "appVersion": "4.5.0",
  "project": "multi-file-box",
  "manifest": null,
  "preset": null,
  "parameters": {}
}
```

`manifest` is the URL the project was loaded from when it came from a manifest
link, `preset` the selected preset if any, and `parameters` only the values
that differ from the design's defaults - the same set the settings fragment
carries.

**This shape is a proposal, not yet part of the stability contract.** Nothing
in Forge reads it back today, and the field names may change before it is
promised. Do not build a tool that depends on it yet.

---

## Breaking Change Policy

### What Constitutes a Breaking Change

- Removing a supported URL parameter
- Changing the semantics of an existing manifest field
- Removing a hosting platform from the CSP `connect-src`
- Changing file path resolution behavior
- Removing support for a `forgeManifest` schema version

### Breaking Change Notification

If a breaking change is ever necessary:

1. **Announcement**: Posted in GitHub Discussions at least **6 months** before the change takes effect
2. **CHANGELOG entry**: Documented in `CHANGELOG.md` with the `BREAKING` label
3. **Deprecation warnings**: The application will log console warnings for deprecated features during the transition period
4. **Migration guide**: A step-by-step guide for updating affected manifests

### Non-Breaking Changes (No Notification Required)

- Adding new optional manifest fields
- Adding new URL parameters
- Adding new hosting platforms to CSP
- Performance improvements to manifest loading
- Improved error messages
- Bug fixes that make previously-broken manifests work correctly

---

## Versioning and Release Cadence

Forge follows semantic versioning for the manifest feature:

- **Patch** (e.g., 1.0.1): Bug fixes, improved error messages
- **Minor** (e.g., 1.1.0): New features, new optional fields
- **Major** (e.g., 2.0.0): Breaking changes (subject to 6-month deprecation policy)

---

## Caching Behavior

- Forge **does not cache** manifest-fetched files in the service worker or persistent storage
- Each manifest load fetches the latest version from the author's repository
- GitHub's CDN typically caches raw files for approximately 5 minutes
- Authors can force immediate updates by using a commit to the `main` branch

---

## Support

For questions about the manifest feature:

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and community support
- **MANIFEST_SHARING_GUIDE.md**: Step-by-step setup instructions

For security vulnerabilities, see `SECURITY.md`.
