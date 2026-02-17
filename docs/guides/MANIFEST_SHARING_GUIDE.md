# Forge Project Manifest: One-Link Sharing Guide

> **Audience**: Anyone who wants to share a customizable OpenSCAD design via a single link. No programming experience required.

## What This Does

Create a single link that opens your OpenSCAD design in the Assistive Forge customizer, ready for anyone to use. When someone clicks your link, the design loads in their browser with all the right files and settings -- no downloads, no file management, no installation.

## What You'll Need

- A free [GitHub](https://github.com) account
- Your `.scad` file(s)
- Any companion files your design needs (`.txt`, `.json`, `.svg`, etc.)
- About 15 minutes for first-time setup

---

## Step 1: Create a Free GitHub Account

If you already have a GitHub account, skip to Step 2.

1. Go to [github.com/signup](https://github.com/signup)
2. Enter your email address, create a password, and choose a username
3. Follow the verification steps
4. You now have a free GitHub account

---

## Step 2: Create a New Repository

A "repository" is a folder on GitHub that holds your project files.

1. Click the **+** icon in the top-right corner of GitHub
2. Choose **New repository**
3. Name it something descriptive (e.g., `my-keyguard-design` or `cable-organizer`)
4. Select **Public** (required for sharing)
5. Check **Add a README file** (optional but recommended)
6. Click **Create repository**

---

## Step 3: Upload Your Project Files

1. Open your new repository on GitHub
2. Click **Add file** > **Upload files**
3. Drag and drop your files onto the page:
   - Your main `.scad` file (e.g., `my-project.scad`)
   - Any companion files (e.g., `openings_and_additions.txt`)
   - Your preset `.json` file (optional but recommended)
4. Click **Commit changes**

Your files are now publicly hosted on GitHub.

---

## Step 4: Create the Manifest File

The manifest file tells Forge which files to load and how to set things up.

1. In your repository, click **Add file** > **Create new file**
2. Name the file exactly: `forge-manifest.json`
3. Paste this template and fill in your details:

```json
{
  "forgeManifest": "1.0",
  "name": "Your Project Name",
  "author": "Your Name",
  "description": "A brief description of what this design does",
  "files": {
    "main": "your_design.scad"
  }
}
```

### Field-by-Field Explanation

| Field | Required? | What to put |
|-------|-----------|-------------|
| `"forgeManifest"` | Yes | Always `"1.0"` (don't change this) |
| `"name"` | No | A human-readable name shown in the status bar |
| `"author"` | No | Your name or organization |
| `"description"` | No | A brief description of your design |
| `"files.main"` | **Yes** | The filename of your main `.scad` file |
| `"files.companions"` | No | A list of companion files, e.g., `["helper.txt", "parts.scad"]` |
| `"files.presets"` | No | Your preset JSON file, e.g., `"my_presets.json"` |
| `"defaults.preset"` | No | Name of a preset to auto-select on load |
| `"defaults.autoPreview"` | No | `true` to start a 3D preview automatically |
| `"defaults.skipWelcome"` | No | `true` to skip the welcome screen |

4. Click **Commit new file**

---

## Step 5: Get Your Shareable Link

Your shareable link follows this formula:

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

Replace:
- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO` with your repository name

**Copy-paste template:**

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/________/________/main/forge-manifest.json
```

---

## Step 6: Test Your Link

1. Open a new browser tab (or use incognito/private browsing)
2. Paste your link into the address bar
3. Verify that:
   - The design loads without errors
   - Parameters appear in the sidebar
   - If you included presets, they appear in the preset dropdown
   - If you set `autoPreview: true`, the 3D preview starts automatically
4. Try changing a parameter and clicking Preview to confirm everything works

---

## Step 7: Share Your Link

Once your link works, you can share it anywhere:

- **On your website**: Add it as a regular hyperlink
- **In an email**: Paste the link directly
- **As a QR code**: Use any QR code generator to create a scannable code
- **On social media**: Post the link with a description
- **Embedded on a webpage**: `<a href="YOUR_LINK">Open in Forge Customizer</a>`

---

## Updating Your Project Later

When you have a new version of your design:

1. Go to your repository on GitHub
2. Upload the new files (they'll replace the old ones if the names match)
3. If the filename changed, update `forge-manifest.json` to point to the new filename
4. The shareable link stays the same -- it always loads the latest version

> **Tip**: If you keep the same filenames, you don't need to change the manifest at all. Just upload the new files and the link automatically serves the latest version.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Couldn't fetch" error | Your files must be on a server that supports CORS. GitHub works. WordPress, Squarespace, and most CMS platforms do **not**. Host your files on GitHub even if your website is elsewhere. |
| "Server returned 404" error | Check that the file URL is correct and the repository is set to **Public**. |
| "Invalid manifest" error | Validate your JSON at [jsonlint.com](https://jsonlint.com). Common mistakes: missing commas, trailing commas, or mismatched quotes. |
| Preset not found | The preset name in `defaults.preset` must exactly match a preset name in your JSON file (case-sensitive). |
| Companion file not loading | Make sure the filename in `files.companions` exactly matches the uploaded filename (case-sensitive). |
| Design loads but parameters don't appear | Your `.scad` file may not have annotated parameters. Parameters need comments like `width = 10; // [5:1:50]` to be detected. |

### Privacy Note

When someone clicks your manifest link, their browser fetches your project files directly from GitHub's servers. This means GitHub can see their IP address and the files they request. GitHub's [privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies. This is standard for any website that loads resources from GitHub.

---

## Alternative: ZIP Bundle (No Manifest Needed)

If you prefer a simpler approach, Forge can also load ZIP files from a URL:

```
https://openscad-assistive-forge.pages.dev/?project=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/my_project.zip
```

Bundle your `.scad`, companion files, and preset `.json` into a single ZIP. Forge will extract it, detect the main file, and auto-import presets.

| | Manifest | ZIP Bundle |
|--|----------|------------|
| File count | 1 manifest + N files (parallel downloads) | 1 ZIP file |
| Updating | Edit individual files | Re-create the ZIP |
| Preset selection | `?preset=` URL param + manifest defaults | Auto-imports all presets |
| Hosting | Files can be in different locations | Single file |

---

## Examples

### Example 1: Simple Box Customizer (single file, no companions)

```json
{
  "forgeManifest": "1.0",
  "name": "Simple Box Customizer",
  "author": "Community",
  "description": "A parametric box with adjustable dimensions and wall thickness",
  "files": {
    "main": "simple_box.scad"
  },
  "defaults": {
    "autoPreview": true
  }
}
```

### Example 2: Tablet Keyguard Designer (multi-file with companion and presets)

```json
{
  "forgeManifest": "1.0",
  "name": "Tablet Keyguard Designer",
  "author": "Community",
  "description": "Customizable 3D-printable keyguard for AAC tablets",
  "files": {
    "main": "my-keyguard.scad",
    "companions": ["openings_and_additions.txt"],
    "presets": "my-presets.json"
  },
  "defaults": {
    "preset": "iPad 10.9 - TouchChat 45",
    "autoPreview": true,
    "skipWelcome": true
  }
}
```

### Example 3: Cable Organizer with Multiple Presets

```json
{
  "forgeManifest": "1.0",
  "name": "Cable Organizer",
  "author": "Community",
  "description": "Desk cable management clips with various sizes",
  "files": {
    "main": "cable_organizer.scad",
    "presets": "cable_organizer_presets.json"
  },
  "defaults": {
    "preset": "Standard USB-C (3-pack)",
    "autoPreview": true
  }
}
```

---

## Manifest Specification Reference

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
| `files.presets` | `string` or `string[]` | Preset JSON file(s) -- auto-imported on load. |
| `files.assets` | `string[]` | Additional assets (SVG, etc.). |
| `defaults.preset` | `string` | Preset name to auto-select after loading. |
| `defaults.autoPreview` | `boolean` | If `true`, trigger preview immediately after loading. |
| `defaults.skipWelcome` | `boolean` | If `true`, skip the welcome screen. |

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

### Hosting Requirements

Forge runs with `Cross-Origin-Embedder-Policy: require-corp`, which means external files must be served with CORS headers. These hosts work out of the box:

| Host | CORS? | Free? | Notes |
|------|-------|-------|-------|
| GitHub raw (`raw.githubusercontent.com`) | Yes | Yes | Recommended for most authors |
| GitHub Pages (`*.github.io`) | Yes | Yes | Good for larger projects |
| GitLab Pages (`*.gitlab.io`) | Yes | Yes | Alternative to GitHub |
| Cloudflare Pages (`*.pages.dev`) | Yes | Yes | Another alternative |

**WordPress, Squarespace, and most CMS platforms do NOT include CORS headers.** Host your project files on GitHub even if your website is elsewhere.
