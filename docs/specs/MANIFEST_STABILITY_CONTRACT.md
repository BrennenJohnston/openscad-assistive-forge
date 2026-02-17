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

**"Stable" means**: These parameters will continue to work in all future versions. Their behavior will not change in backward-incompatible ways.

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
- `files.main`: Path to the main `.scad` file

**Optional (all preserved):**
- `name`, `id`, `author`, `description`, `homepage`
- `files.companions`, `files.presets`, `files.assets`
- `defaults.preset`, `defaults.autoPreview`, `defaults.skipWelcome`

---

## Supported Hosting Platforms

Forge's Content Security Policy (CSP) `connect-src` directive determines which external origins can serve manifest files. The following are currently permitted:

| Origin Pattern | Platform | Status |
|---------------|----------|--------|
| `https://raw.githubusercontent.com` | GitHub raw files | **Supported** |
| `https://*.github.io` | GitHub Pages | **Supported** |
| `https://*.gitlab.io` | GitLab Pages | **Supported** |
| `https://*.pages.dev` | Cloudflare Pages | **Supported** |

### CORS / COEP Requirements

Forge runs with `Cross-Origin-Embedder-Policy: require-corp`. This means files fetched from external origins must either:

1. Be served with `Cross-Origin-Resource-Policy: cross-origin` header, **or**
2. Be served from a CORS-enabled origin that Forge's CSP permits

All platforms listed above meet these requirements. If you host files on a platform not listed above, verify that it serves appropriate CORS and CORP headers.

### Adding New Platforms

If a widely-used hosting platform needs to be added to the CSP `connect-src`, this can be requested via a GitHub issue. Adding a new origin is **not** a breaking change.

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
