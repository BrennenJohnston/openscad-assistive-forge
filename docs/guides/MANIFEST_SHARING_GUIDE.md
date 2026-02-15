# Forge Project Manifest: One-Link Sharing Guide

> **Audience**: Project authors who want to share customizable OpenSCAD designs via a single URL.

## Overview

A **Forge Project Manifest** (`forge-manifest.json`) describes a complete OpenSCAD project bundle — main `.scad` file, companion files, presets, and assets — that Forge can load from a single URL. This lets authors host their design packages on GitHub and share a one-click link that opens Forge with everything pre-loaded.

**End result for users**: One click opens the design in their browser, ready to customize. Zero downloads, zero file management.

---

## Quick Start (5-minute setup)

### 1. Create a GitHub repository

Create a public repository on [github.com](https://github.com) (e.g., `keyguard-designer`).

### 2. Upload your project files

Upload these files to the repository root (or any folder):

- Your main `.scad` file (e.g., `keyguard_v75.scad`)
- Any companion files referenced by `include`/`use` statements (e.g., `openings_and_additions.txt`)
- An OpenSCAD preset `.json` file (optional but recommended)

### 3. Create `forge-manifest.json`

Add a `forge-manifest.json` file to the same directory as your `.scad` file:

```json
{
  "forgeManifest": "1.0",
  "name": "My OpenSCAD Project",
  "author": "Your Name",
  "description": "A brief description of your project",
  "homepage": "https://yoursite.example.com",
  "files": {
    "main": "my_design.scad",
    "companions": ["helper_file.txt"],
    "presets": "my_design.json"
  },
  "defaults": {
    "preset": "My Favorite Config",
    "autoPreview": true
  }
}
```

### 4. Get your shareable link

Your manifest URL on GitHub raw is:

```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

Your shareable Forge link is:

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

Put this link on your website. That's it!

---

## Manifest Specification

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `forgeManifest` | `string` | Schema version. Must be `"1.0"`. |
| `files.main` | `string` | Path to the main `.scad` file (relative to manifest). |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable project name (shown in status bar). |
| `id` | `string` | Stable identifier (survives filename changes). |
| `author` | `string` | Author name or attribution. |
| `description` | `string` | Brief project description. |
| `homepage` | `string` | URL to the project's home page. |
| `files.companions` | `string[]` | Companion files (`.txt`, `.scad`, etc.) loaded into the VFS. |
| `files.presets` | `string` or `string[]` | Preset JSON file(s) — auto-imported on load. |
| `files.assets` | `string[]` | Additional assets (SVG, etc.). |
| `defaults.preset` | `string` | Preset name to auto-select after loading. |
| `defaults.autoPreview` | `boolean` | If `true`, trigger preview immediately after loading. |
| `defaults.skipWelcome` | `boolean` | If `true`, skip the welcome screen (also controllable via URL). |

### File Path Resolution

All paths in `files` are resolved **relative to the manifest URL**. For example, if your manifest is at:

```
https://raw.githubusercontent.com/myuser/myrepo/main/designs/forge-manifest.json
```

Then `"main": "keyguard.scad"` resolves to:

```
https://raw.githubusercontent.com/myuser/myrepo/main/designs/keyguard.scad
```

Absolute URLs (starting with `https://`) are also allowed if files are hosted elsewhere.

### URL Parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `?manifest=<url>` | `?manifest=https://raw.githubusercontent.com/...` | Load project from manifest |
| `?preset=<name>` | `?preset=iPad+10.9+TouchChat` | Override the default preset |
| `?skipWelcome=true` | `?skipWelcome=true` | Skip the welcome screen |

These can be combined:

```
?manifest=<url>&preset=My+Config&skipWelcome=true
```

---

## Volkswitch Keyguard Example

This is a real-world reference for the Volksswitch.org keyguard designer project.

### Directory Structure (on GitHub)

```
volkswitch/keyguard-designer/
├── forge-manifest.json
├── keyguard_v75.scad
├── openings_and_additions.txt
└── keyguard_v75.json          (OpenSCAD native presets)
```

### forge-manifest.json

```json
{
  "forgeManifest": "1.0",
  "id": "volkswitch-keyguard-designer",
  "name": "Volkswitch Keyguard Designer v75",
  "author": "Ken @ Volksswitch.org",
  "description": "Customizable 3D-printable keyguard for AAC tablets",
  "homepage": "https://volksswitch.org",
  "files": {
    "main": "keyguard_v75.scad",
    "companions": ["openings_and_additions.txt"],
    "presets": "keyguard_v75.json"
  },
  "defaults": {
    "preset": "iPad 10.9 - TouchChat 45",
    "autoPreview": true,
    "skipWelcome": true
  }
}
```

### Shareable Link

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/volkswitch/keyguard-designer/main/forge-manifest.json
```

### Updating the Design

When Ken releases `keyguard_v76.scad`:

1. Upload the new `.scad` file to the GitHub repo
2. Update `forge-manifest.json` to point to the new filename
3. The shareable link stays the same (always points to `main` branch)

Users who click the link always get the latest version.

---

## Alternative: ZIP Bundle (simpler, no manifest needed)

If you prefer not to create a manifest, Forge already supports loading ZIP files from a URL:

```
https://openscad-assistive-forge.pages.dev/?project=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/keyguard_bundle.zip
```

Bundle your `.scad`, companion files, and preset `.json` into a single ZIP. Forge will extract it, detect the main file, and auto-import presets.

**Trade-offs**:

| | Manifest | ZIP Bundle |
|--|----------|------------|
| File count | 1 manifest + N files (parallel downloads) | 1 ZIP file |
| Updating | Edit individual files | Re-create the ZIP |
| Preset selection | `?preset=` URL param + manifest defaults | Auto-imports all presets |
| Hosting | Files can be in different locations | Single file |

---

## Hosting Requirements

### CORS Headers

Forge runs with `Cross-Origin-Embedder-Policy: require-corp`, which means external files must be served with CORS headers. These hosts work out of the box:

| Host | CORS? | Free? | Notes |
|------|-------|-------|-------|
| GitHub raw (`raw.githubusercontent.com`) | Yes | Yes | Recommended for most authors |
| GitHub Pages (`*.github.io`) | Yes | Yes | Good for larger projects |
| GitLab Pages (`*.gitlab.io`) | Yes | Yes | Alternative to GitHub |
| Cloudflare Pages (`*.pages.dev`) | Yes | Yes | Another alternative |

**WordPress, Squarespace, and most CMS platforms do NOT include CORS headers.** Host your project files on GitHub even if your website is elsewhere.

### Troubleshooting

- **"Couldn't fetch" error**: The file server doesn't support CORS. Move files to GitHub.
- **"Server returned 404"**: Check that the file URL is correct and the repository is public.
- **"Invalid manifest"**: Validate your JSON at [jsonlint.com](https://jsonlint.com).
- **Preset not found**: Ensure the preset name in `defaults.preset` exactly matches a preset name in your JSON file (case-insensitive).
