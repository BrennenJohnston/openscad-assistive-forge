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
| `"files.main"` | **Yes** (unless `files.bundle` is set) | The filename of your main `.scad` file |
| `"files.companions"` | No | A list of companion files, e.g., `["helper.txt", "parts.scad"]` |
| `"files.presets"` | No | Your preset JSON file, e.g., `"my_presets.json"` |
| `"files.bundle"` | No | Path to a `.zip` file — see [ZIP Bundle](#zip-bundle-single-zip-file) section |
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

## Sharing your exact settings, and getting them back

A plain link opens your design at its own defaults. Often what you want is
"open this, at these numbers" - and, coming the other way, "here is what I
changed, please make me this one".

Forge puts the values you changed at the end of the link, after the `#`:

```text
https://…/?manifest=…%2Fforge-manifest.json#v=1&params=%7B%22width%22%3A77%7D
```

Only the values that differ from the design's defaults travel, so the link
stays short. Three ways to make one:

1. **Copy the address bar.** It updates about a second after you change a
   value.
2. **Actions drawer > Copy Link.** Copies the current design plus your
   settings in one press.
3. **The Publish dialog**, ticking **Include my current settings in the link**
   before you fill in the base URL. The link it builds then carries both the
   manifest and your values.

**For the person receiving it**, opening the link loads the design and applies
the values. If a number is outside what the design allows, Forge pulls it to
the nearest allowed value and says so rather than silently using something you
did not ask for. A parameter the design does not have is dropped the same way.

**Sending changes back** works the same in reverse: open the link you were
sent, adjust, and use **Copy Link**. The reply carries your numbers, not a
description of them.

> **Privacy note**: browsers never send the part of a URL after the `#` to any
> server. Values in a settings link do not reach Forge's host or your file
> host. They are in the link itself, so treat the link the way you would treat
> the values.

### Handing over the whole project as one file

The Publish dialog also has **Download Project ZIP**: one archive holding your
project's files, the `forge-manifest.json` that describes them, and a small
`forge-provenance.json` recording where the design came from, which preset was
selected, and the values that differed from the defaults. Unzip it into your
repository and everything is already in the right place.

`forge-provenance.json` is new and nothing reads it back yet. It is there so a
file that comes home can say where it has been.

---

## If you are writing a program rather than a link

Everything on this page is meant for a person composing one link at a time. If
you are building a tool that generates them, there is a page written for you:
[FORGE_HANDOFF_CONTRACT.md](../specs/FORGE_HANDOFF_CONTRACT.md). It covers the
same lanes with the sizes, the naming, the error codes, and the parts of the
browser's security policy that will get in your way. Every Forge deployment also
serves a short machine-readable summary at `/forge-capabilities.txt`.

## Choosing which settings people meet first

Some designs have a lot of parameters. A keyguard model can have well over a
hundred, in more than thirty groups, and every one of them is there for a
reason -- but that is not a first screen anybody can use.

Your manifest can say which handful somebody should meet first:

```json
{
  "forgeManifest": "1.0",
  "files": { "main": "keyguard.scad" },
  "defaults": {
    "starterParameters": [
      "tablet_model",
      "grid_rows",
      "grid_columns",
      "cell_width_px",
      "cell_height_px",
      "rail_height_mm"
    ]
  }
}
```

Forge then shows those controls, opens the groups they live in, and puts
everything else behind one button labelled **Show all parameters**.

Things worth knowing before you use it:

- **Nothing is removed.** The button is a toggle, so the way back to the short
  screen is the same button. Everything is one press away, in the order your
  design wrote it.
- **Hidden means hidden for everybody.** A control somebody cannot see is not
  reachable by keyboard or screen reader either -- there are no controls
  lurking invisibly in the Tab order.
- **Searching brings everything back.** If somebody types in the parameter
  search, or jumps to a group that is behind the wall, Forge drops the wall and
  says so. A search that could not find a parameter your design has would be
  worse than no search.
- **A name that does not exist is not an error.** If your list names a
  parameter the design does not have, Forge says so in a notice above the
  controls and carries on with the rest. Renaming a parameter cannot break
  somebody's link.
- **Pick the ones the job needs, not the ones you find interesting.** The best
  test is your own instructions: if your written steps say "set this", it
  belongs in the list.

Use the names exactly as they appear in your `.scad` file.

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

## ZIP Bundle (Single ZIP File)

You can distribute your project as a single `.zip` file and still get the full manifest experience (name, author, presets, defaults, sharing banner).

### Option A: ZIP Bundle with a manifest (`files.bundle`)

Add `files.bundle` to your manifest instead of listing individual files:

```json
{
  "forgeManifest": "1.0",
  "name": "Ready to Print Designs",
  "author": "Your Name",
  "files": {
    "bundle": "ready_to_print_designs.zip"
  },
  "defaults": { "autoPreview": true }
}
```

When `files.bundle` is set:

- Forge downloads the single `.zip` and extracts it automatically
- The main `.scad` file is auto-detected from the archive (same heuristics as `?project=`)
- You can optionally specify `files.main` to override the auto-detection:

```json
"files": {
  "bundle": "ready_to_print_designs.zip",
  "main": "specific_file.scad"
}
```

The shareable link works the same way:

```
https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
```

### Option B: `?project=` URL (No Manifest Needed)

If you prefer a simpler approach without a manifest file, Forge can also load ZIP files from a URL:

```
https://openscad-assistive-forge.pages.dev/?project=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/my_project.zip
```

Bundle your `.scad`, companion files, and preset `.json` into a single ZIP. Forge will extract it, detect the main file, and auto-import presets -- but without manifest metadata (name, author, custom defaults).

### When to use which approach

| | Uncompressed manifest | ZIP bundle manifest | `?project=` |
|--|----------------------|---------------------|-------------|
| File count | 1 manifest + N files | 1 manifest + 1 ZIP | 1 ZIP only |
| Metadata (name, author) | Yes | Yes | No |
| Custom defaults | Yes | Yes | No |
| Updating | Edit individual files | Re-create the ZIP | Re-create the ZIP |
| Preset selection | `?preset=` + manifest defaults | `?preset=` + manifest defaults | Auto-imports all |
| Best for | Small projects (1-5 files) | Large projects / many files | Quick one-off share |

### Option C: no hosting at all (`?manifest=data:`)

A whole manifest can ride inside the link, with nothing hosted anywhere:

```text
https://…/?manifest=data:application/json;base64,eyJmb3JnZU1hbmlmZXN0IjoiMS4wIiw…
```

This is genuinely useful for a one-off: no repository, no account, nothing to
maintain. Two limits decide whether it fits.

- **Keep the whole link under about 8 KB.** Measured: 8 KB links load, 16 KB
  drew an HTTP 431 from a plain server, and Firefox hung rather than reporting
  the error. Hosts and CDNs set their own caps below that.
- **Relative file paths cannot work.** There is no directory for them to be
  relative to. Every file the manifest names has to be an absolute URL on the
  allowlist in **Hosting Requirements**, or a `data:` URL itself, and a
  `data:` file URL needs its name on the end so the suffix rules still pass -
  `data:text/plain;base64,…#design.scad`.

So this lane suits a small manifest pointing at files that are already hosted,
not a project packed whole into a link. `MANIFEST_STABILITY_CONTRACT.md` has
the full rules.

---

## Writing the manifest

**Forge can write it for you.** Load your project, open the Actions drawer, and
press **Publish**. The dialog shows a finished `forge-manifest.json` for
whatever is currently loaded, with a **Copy Manifest** button. Fill in
**Your GitHub raw base URL** further down the same dialog and it builds the
shareable link for you as well.

Forge checks its own output against the same rules the loader uses before it
shows you anything, so a manifest the dialog hands you is one Forge will
accept.

You can still write the file by hand -- it is short. Copy whichever example
below is closest to your project, change the file names, and you are done. If
you get a name wrong, Forge tells you which file it could not find rather than
failing silently.

(A command-line generator existed until 2026-08-04 and was removed with the
rest of the developer CLI. The Publish dialog is its replacement.)

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

### Example 4: Large Project as ZIP Bundle

```json
{
  "forgeManifest": "1.0",
  "name": "Ready to Print Designs Collection",
  "author": "Community",
  "description": "A large collection of ready-to-print assistive device designs",
  "files": {
    "bundle": "ready_to_print_designs.zip"
  },
  "defaults": {
    "autoPreview": true,
    "skipWelcome": true
  }
}
```

This is ideal for projects with many files — just upload a single `.zip` and let Forge detect the main file automatically.

---

## Manifest Specification Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `forgeManifest` | `string` | Schema version. Must be `"1.0"`. |
| `files.main` | `string` | Path to the main `.scad` file. **Required unless `files.bundle` is set.** |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable project name (shown in status bar). |
| `id` | `string` | Stable identifier (survives filename changes). |
| `author` | `string` | Author name or attribution. |
| `description` | `string` | Brief project description. |
| `homepage` | `string` | URL to the project's home page. |
| `files.bundle` | `string` | Path to a `.zip` bundle. When set, `files.main` becomes optional (auto-detected). |
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

**This table is not a suggestion, it is the policy.** Forge's Content Security
Policy names the hosts it is allowed to fetch from, and a URL pointing anywhere
else is refused inside the browser before any request is sent. Measured on the
built site: a `https://raw.githubusercontent.com/...` URL is fetched normally,
while `https://github.com/USER/REPO/releases/download/...` and an object-store
URL such as `https://BUCKET.r2.cloudflarestorage.com/...` are both blocked with
a `connect-src` violation. Whatever the manifest names, including an absolute
URL in `files.bundle`, has to be on the list above.

---

## Large File Hosting

Forge supports ZIP bundles up to **500 MB**. For bundles over 100 MB, you need to choose a hosting strategy that fits your file size and expected traffic.

### Git LFS (recommended for 100 MB – 2 GB bundles)

GitHub blocks files over 100 MB and warns above 50 MB. **Git LFS** stores large files outside the regular Git object store, allowing bundles up to 2 GB.

Forge automatically detects Git LFS pointer files and re-fetches the real content from `media.githubusercontent.com`. No manifest changes are needed — the same relative path works whether the file is in regular Git or LFS.

**Setup (one-time, per machine):**

```bash
git lfs install
git lfs track "*.zip" "*.stl" "*.3mf"
git add .gitattributes
git commit -m "chore: add Git LFS tracking"
```

Then add and commit your ZIP as normal — Git LFS handles the rest.

**GitHub Free LFS quotas:**

| Resource | GitHub Free | GitHub Team/Enterprise |
|----------|-------------|----------------------|
| Per-file size | 2 GB | 4–5 GB |
| Storage quota | 10 GiB | 250 GiB |
| Bandwidth quota | 10 GiB/month | 250 GiB/month |
| Extra data packs | $5/month for +50 GiB | same |

**Important:** Bandwidth is a hard cutoff. When the monthly quota is exhausted, LFS downloads stop entirely — users receive the ~130-byte pointer file. Downloads do not slow down; they stop. Forge will show an error rather than silently failing.

**Practical download limits per month (GitHub Free — 10 GiB bandwidth):**

| Bundle size | Free tier | With 1 data pack (+50 GiB) |
|-------------|-----------|---------------------------|
| 50 MB | ~200 loads/month | ~1,200 loads/month |
| 100 MB | ~100 loads/month | ~600 loads/month |
| 170 MB | ~59 loads/month | ~352 loads/month |
| 250 MB | ~40 loads/month | ~240 loads/month |
| 500 MB | ~20 loads/month | ~120 loads/month |
| 1 GB | ~10 loads/month | ~60 loads/month |
| 2 GB (max) | ~5 loads/month | ~30 loads/month |

**Recommendation:** Best for projects under ~200 MB with moderate traffic (fewer than 50 loads/month). For higher traffic, use GitHub Releases.

### GitHub Releases (a manifest cannot point at one)

Release assets are served from GitHub's CDN with no bandwidth quota, which
makes them attractive for a busy project. **Forge cannot load them.** Release
assets live on `github.com`, which is not on the allowlist above, so a manifest
naming `https://github.com/USER/REPO/releases/download/v1.0/my_project.zip` is
refused inside the browser and never reaches GitHub. Earlier versions of this
guide recommended exactly that URL. It did not work, and this section is the
correction.

**If you have a release asset and want people to open it in Forge**, put a copy
somewhere on the allowlist and point the manifest there:

- **GitHub Pages** in the same repository (a `docs/` folder or a `gh-pages`
  branch). The published URL is `https://USER.github.io/REPO/my_project.zip`,
  which is allowed. Check the size and bandwidth limits your Pages plan
  actually gives you before relying on it for a large file.
- **The repository itself**, via a relative path in the manifest, using Git LFS
  above 100 MB (see the section above). Forge follows LFS pointers.
- **GitLab Pages** (`*.gitlab.io`) or **Cloudflare Pages** (`*.pages.dev`) if
  you would rather not use GitHub.

The release itself stays a perfectly good way to publish a versioned download
for people who are not using Forge.

### External Object Storage (Forge cannot load these either)

Object stores are the usual answer for very large files, and for the same
reason as GitHub Releases, **Forge refuses them**: an
`https://BUCKET.r2.cloudflarestorage.com/...`, S3 or B2 URL is not on the
allowlist, so the fetch is blocked in the browser. Earlier versions of this
guide told you to use an absolute URL here. That was wrong.

The costs are kept below because they are worth knowing if you serve the file
to people outside Forge, or if you put a copy behind a `*.pages.dev` address,
which is on the allowlist:

| Provider | Storage cost | Egress (download) cost | Per-file limit |
|----------|-------------|----------------------|---------------|
| Cloudflare R2 | ~$0.015/GB/month | **Free** | 5 GB (Workers) |
| Backblaze B2 | ~$0.006/GB/month | Free via Cloudflare | 5 GB |
| AWS S3 | ~$0.023/GB/month | ~$0.09/GB | 5 TB |

If your project genuinely needs a host that is not on the list, that is a
change to Forge's security policy, not to your manifest. Open an issue and say
which host and why.

### Decision guide

```
Bundle under 100 MB?
  -> Commit directly, relative path in the manifest, no LFS needed

Bundle 100 MB - 2 GB?
  -> Git LFS in the same repository, still a relative path
     (Forge follows LFS pointers)

Too big or too busy for LFS?
  -> Publish a copy on GitHub Pages, GitLab Pages or Cloudflare Pages
     and name that URL

Need a host that is none of the above?
  -> Forge will refuse it. Open an issue rather than editing the manifest
```

Use a relative path for repo-hosted files, or an absolute `https://` URL that
is on the allowlist in **Hosting Requirements** above. An absolute URL anywhere
else is blocked in the browser and never reaches the network.
