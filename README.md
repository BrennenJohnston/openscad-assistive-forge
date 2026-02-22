# Forge Manifest Template

**A ready-to-copy starting point for sharing your OpenSCAD designs via a single link.**

Copy these files into your own GitHub repository and you can be sharing a parametric design in about 15 minutes — no programming experience required.

---

## What's here (3 files + this README)

| File | Purpose |
|------|---------|
| `forge-manifest.json` | Tells Forge which files to load and what defaults to use |
| `my_design.scad` | A parametric box — replace with your own design |
| `my_presets.json` | Five ready-made size presets — edit or add your own |

### Try it live right now

Paste this link into your browser to see the template in action:

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest.json
```

---

## How to make it your own

### Step 1 — Get the files into your own repository

**Option A: Download and upload (simplest)**

1. Click **Code > Download ZIP** on this branch
2. Create a new repository on GitHub ([github.com/new](https://github.com/new)) — set it to **Public**
3. Upload the three project files (`forge-manifest.json`, `my_design.scad`, `my_presets.json`) to your new repo

**Option B: Fork this repository**

1. Click **Fork** at the top-right of this page
2. GitHub creates a copy at `github.com/YOUR_USERNAME/openscad-assistive-forge`

---

### Step 2 — Replace `my_design.scad` with your design

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

---

### Step 3 — Edit your presets (optional)

Open `my_presets.json`. Each object in the `"presets"` array is one dropdown entry in Forge. Parameter names must exactly match the variable names in your `.scad` file (case-sensitive).

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

---

### Step 4 — Update `forge-manifest.json`

Fill in your own details:

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

---

### Step 5 — Build your shareable link

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

Replace `YOUR_USERNAME` and `YOUR_REPO`. Test the link in a private/incognito window.

---

### Step 6 — Share!

Paste the link anywhere: email, forum, social media, or embed it on a webpage:

```html
<a href="YOUR_LINK">Open in Forge Customizer</a>
```

The link always loads the latest version of your files — you never need to update the link itself.

---

## Manifest field reference

| Field | Required | Notes |
|-------|----------|-------|
| `forgeManifest` | Yes | Always `"1.0"` |
| `files.main` | Yes | Your main `.scad` filename |
| `name` | No | Shown in the Forge status bar |
| `author` | No | Your name or organisation |
| `description` | No | One-line description |
| `homepage` | No | Link back to your repo or page |
| `files.companions` | No | Array of extra files to load |
| `files.presets` | No | Preset JSON filename |
| `defaults.preset` | No | Preset to auto-select |
| `defaults.autoPreview` | No | Start 3D preview on load (default `false`) |
| `defaults.skipWelcome` | No | Skip the welcome screen (default `false`) |

Full specification: [Manifest Sharing Guide](https://github.com/BrennenJohnston/openscad-assistive-forge/blob/main/docs/guides/MANIFEST_SHARING_GUIDE.md)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Couldn't fetch" error | Your repository must be **Public**. Private repos cannot be accessed. |
| "Server returned 404" | Check that filenames in the manifest exactly match uploaded files (case-sensitive). |
| "Invalid manifest" | Validate your JSON at [jsonlint.com](https://jsonlint.com). Common: missing comma, trailing comma, mismatched quotes. |
| Parameters don't appear | Your `.scad` file needs Customizer annotations: `width = 50; // [10:100]` |
| Preset not found | The name in `defaults.preset` must exactly match a `"name"` in your presets file. |

---

## License

These template files are released under **CC0 1.0 (Public Domain)**. Copy, modify, and distribute them for any purpose without attribution.

[OpenSCAD Assistive Forge](https://github.com/BrennenJohnston/openscad-assistive-forge) — made with care for the assistive technology community.
