# Forge Manifest Template

**A ready-to-copy starting point for sharing your OpenSCAD designs via a single link.**

Copy these files into your own GitHub repository and you can be sharing a parametric design in about 15 minutes — no programming experience required.

This branch includes templates for **both sharing approaches** — choose the one that fits your workflow.

---

## Which approach should I use?

| Scenario | Recommended approach |
|----------|---------------------|
| Small project (1–5 files) | **Uncompressed manifest** (`files.main` + `files.companions`) |
| Large project / many files | **ZIP bundle manifest** (`files.bundle`) |
| Already distributing a `.zip` | **ZIP bundle manifest** |
| Want to update individual files without rebuilding | **Uncompressed manifest** |
| Quick one-off share | `?project=<url>` (no manifest needed) |

---

## Approach A: Uncompressed manifest (individual files)

### What's here

| File | Purpose |
|------|---------|
| `forge-manifest.json` | Tells Forge which files to load and what defaults to use |
| `my_design.scad` | A parametric box — replace with your own design |
| `my_presets.json` | Five ready-made size presets — edit or add your own |

### Try it live right now

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest.json
```

### How to make it your own

#### Step 1 — Get the files into your own repository

**Option A: Download and upload (simplest)**

1. Click **Code > Download ZIP** on this branch
2. Create a new repository on GitHub ([github.com/new](https://github.com/new)) — set it to **Public**
3. Upload `forge-manifest.json`, `my_design.scad`, and `my_presets.json` to your new repo

**Option B: Fork this repository**

1. Click **Fork** at the top-right of this page
2. GitHub creates a copy at `github.com/YOUR_USERNAME/openscad-assistive-forge`

#### Step 2 — Replace `my_design.scad` with your design

Upload your `.scad` file. Then open `forge-manifest.json` and change `"main"` to match your filename:

```json
"files": {
  "main": "your_file.scad",
  "presets": "my_presets.json"
}
```

If your design uses companion files (like a `.txt` lookup table or a second `.scad`), add them:

```json
"files": {
  "main": "my_keyguard.scad",
  "companions": ["openings.txt", "helpers.scad"],
  "presets": "my_presets.json"
}
```

#### Step 3 — Edit your presets (optional)

Open `my_presets.json`. Each object in the `"presets"` array is one dropdown entry in Forge.
Parameter names must exactly match the variable names in your `.scad` file (case-sensitive).

```json
{
  "name": "My Custom Preset",
  "description": "Short sentence describing this configuration",
  "values": {
    "box_width": 80,
    "include_lid": "yes"
  }
}
```

#### Step 4 — Update `forge-manifest.json`

```json
{
  "forgeManifest": "1.0",
  "name": "Your Project Name",
  "author": "Your Name",
  "description": "What this design does in one sentence",
  "homepage": "https://github.com/YOUR_USERNAME/YOUR_REPO",
  "files": {
    "main": "your_design.scad",
    "presets": "my_presets.json"
  },
  "defaults": {
    "preset": "Name of a preset to load by default",
    "autoPreview": true,
    "skipWelcome": false
  }
}
```

#### Step 5 — Build your shareable link

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

Replace `YOUR_USERNAME` and `YOUR_REPO`. Test the link in a private/incognito window.

---

## Approach B: ZIP bundle manifest

Use this if you're already distributing a `.zip` file, or have many files and want to keep them in one archive.

### Template file: `forge-manifest-zip.json`

```json
{
  "forgeManifest": "1.0",
  "name": "My First Forge Project",
  "author": "Your Name Here",
  "description": "A parametric storage box — replace this description with your own",
  "homepage": "https://github.com/YOUR_USERNAME/YOUR_REPO",
  "files": {
    "bundle": "my_project.zip"
  },
  "defaults": {
    "preset": "Small Gift Box",
    "autoPreview": true,
    "skipWelcome": false
  }
}
```

When `files.bundle` is set, Forge downloads the `.zip` and extracts it automatically. The main `.scad` file is detected from the archive contents.

### How to use

1. Bundle your files into a `.zip` (e.g., `my_project.zip`) and upload it to your repository
2. Rename `forge-manifest-zip.json` to `forge-manifest.json` (or use it alongside the uncompressed version)
3. Set `"bundle"` to your `.zip` filename
4. Build your shareable link the same way:

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

#### Optional: specify the main file explicitly

Forge auto-detects the main `.scad` file from the zip, but you can override it:

```json
"files": {
  "bundle": "my_project.zip",
  "main": "specific_file.scad"
}
```

### Auto-generating the manifest with the CLI

If you have the developer CLI installed, you can generate the manifest automatically:

```bash
# From a folder (uncompressed manifest)
npx openscad-forge manifest ./my_project_folder -o forge-manifest.json --name "My Project" --author "Your Name"

# From a .zip file (bundle manifest)
npx openscad-forge manifest ./my_project.zip -o forge-manifest.json --name "My Project" --author "Your Name"

# Force bundle-style manifest from a folder
npx openscad-forge manifest ./my_project_folder --zip -o forge-manifest.json
```

---

## Example: Volksswitch.org Keyguard Designer

This branch includes a real-world ZIP bundle example from [Volksswitch.org](https://volksswitch.org/index.php/volks-devices/customizable-3d-printable-keyguard-for-grid-based-free-form-and-hybrid-aac-apps-on-tablets/) — a customizable, 3D-printable keyguard designer for AAC apps on tablets.

| File | Purpose |
|------|---------|
| `forge-manifest-volksswitch.json` | Manifest pointing to the keyguard designer ZIP bundle |
| `ready_to_print_designs.zip` | Full keyguard designer package (v75) with case/app presets |

### Try it live

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest-volksswitch.json
```

This is a good example of the ZIP bundle approach for a large, multi-file project with companion data files.

---

## Manifest field reference

### Common fields

| Field | Required | Notes |
|-------|----------|-------|
| `forgeManifest` | Yes | Always `"1.0"` |
| `name` | No | Shown in the Forge status bar |
| `author` | No | Your name or organisation |
| `description` | No | One-line description |
| `homepage` | No | Link back to your repo or page |
| `defaults.preset` | No | Preset to auto-select |
| `defaults.autoPreview` | No | Start 3D preview on load (default `false`) |
| `defaults.skipWelcome` | No | Skip the welcome screen (default `false`) |

### Uncompressed approach fields

| Field | Required | Notes |
|-------|----------|-------|
| `files.main` | **Yes** (unless `files.bundle` is set) | Your main `.scad` filename |
| `files.companions` | No | Array of extra files to load |
| `files.presets` | No | Preset JSON filename |

### ZIP bundle approach fields

| Field | Required | Notes |
|-------|----------|-------|
| `files.bundle` | **Yes** (for this approach) | Path to your `.zip` file |
| `files.main` | No | Override the auto-detected main file inside the zip |

Full specification: [Manifest Sharing Guide](https://github.com/BrennenJohnston/openscad-assistive-forge/blob/main/docs/guides/MANIFEST_SHARING_GUIDE.md)

---

## Share!

Paste the link anywhere: email, forum, social media, or embed it on a webpage:

```html
<a href="YOUR_LINK">Open in Forge Customizer</a>
```

The link always loads the latest version of your files — you never need to update the link itself.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Couldn't fetch" error | Your repository must be **Public**. Private repos cannot be accessed. |
| "Server returned 404" | Check that filenames in the manifest exactly match uploaded files (case-sensitive). |
| "Invalid manifest" | Validate your JSON at [jsonlint.com](https://jsonlint.com). Common: missing comma, trailing comma, mismatched quotes. |
| Parameters don't appear | Your `.scad` file needs Customizer annotations: `width = 50; // [10:100]` |
| Preset not found | The name in `defaults.preset` must exactly match a `"name"` in your presets file. |
| ZIP bundle not loading | Make sure the `.zip` filename in `"bundle"` exactly matches the uploaded file (case-sensitive). |

---

## License

These template files are released under **CC0 1.0 (Public Domain)**. Copy, modify, and distribute them for any purpose without attribution.

[OpenSCAD Assistive Forge](https://github.com/BrennenJohnston/openscad-assistive-forge) — made with care for the assistive technology community.
