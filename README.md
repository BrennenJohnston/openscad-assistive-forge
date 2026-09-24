# Forge Manifest Template

Keep your OpenSCAD project in your own GitHub repository, and share it with one link that opens it in OpenSCAD Assistive Forge, ready to customize.

## 1. What this is

I built OpenSCAD Assistive Forge so that a person can customize an OpenSCAD design in a web browser, with nothing to install. This branch is the template for sharing your own design that way.

You keep your project in your own public GitHub repository and edit it whenever you like. Nobody at Forge touches it: the link only reads the files you publish, so you need no account with me and no permission on my repository. One link on your own website opens your project in Forge, with the presets and companion files you chose. When you change a file and push it, the link shows the change within about five minutes, which is how long GitHub keeps a copy of your files cached.

## 2. Try it live

These four links open the examples stored on this branch:

- **The box**, a small parametric storage box with five presets:
  <https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest.json>
- **The keyguard designer** from [Volksswitch.org](https://volksswitch.org/index.php/volks-devices/customizable-3d-printable-keyguard-for-grid-based-free-form-and-hybrid-aac-apps-on-tablets/), the lean bundle: its text and SVG files, 8.9 MB.
  <https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest-volksswitch.json>
- **The keyguard designer with its overlay pictures**, 65.7 MB, stored with Git LFS (part 8 says what that costs):
  <https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest-volksswitch-full.json>
- **The braille card and cylinder generator**:
  <https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest-braille.json>

Someone opening Forge for the first time sees the welcome dialog first ("Choose your interface", then "Download & Continue"), and then the project.

## 3. Share your own design, step by step

1. **Create a public repository.** On GitHub, go to <https://github.com/new>, give the repository a name, set it to **Public**, and create it.
2. **Upload your files.** Upload your `.scad` file, any companion files your design reads, and your presets file (part 5). A companion file is any file your `.scad` file includes or reads beside it: the keyguard designer, for example, reads `openings_and_additions.txt`. If you have many files, you can put them all in one ZIP file and upload that instead; the keyguard and braille examples do.
3. **Write `forge-manifest.json`.** This small file tells Forge which files to load and how to start. Here is the box example's, with its description shortened:

   ```json
   {
     "forgeManifest": "1.0",
     "name": "My First Forge Project",
     "author": "Your Name Here",
     "description": "A parametric storage box",
     "homepage": "https://github.com/YOUR_USERNAME/YOUR_REPO",
     "files": {
       "main": "my_design.scad",
       "presets": "my_presets.json"
     },
     "defaults": {
       "preset": "Small Gift Box",
       "autoPreview": true,
       "skipWelcome": false
     }
   }
   ```

   The fields you can use:

   | Field | What it does |
   |---|---|
   | `files.main` | Your main `.scad` file. Required unless you use `files.bundle`. |
   | `files.companions` | A list of other files your design reads, for example `["openings_and_additions.txt"]`. |
   | `files.presets` | Your presets file (part 5). |
   | `files.bundle` | One ZIP file holding your whole project, in place of listing the files one by one. Forge finds the main `.scad` file inside it; name it with `files.main` if the archive holds more than one. `forge-manifest-zip.json` on this branch is a template for this. |
   | `defaults.preset` | The preset Forge selects when your project opens. |
   | `defaults.autoPreview` | `true` draws the 3D preview as soon as your project opens. |
   | `defaults.starterParameters` | A short list of parameter names to show first. Everything else waits behind a **Show all parameters** button, so a design with a hundred controls can open on the dozen that matter. |
   | `name`, `author` | Shown on the shared-project banner above the controls. |
   | `description`, `homepage` | For people who read your manifest. |

   Two fields you may see in the specification do nothing yet, so you can leave them out: `id`, which Forge accepts but does not use, and `defaults.skipWelcome`. A manifest link always opens straight into your project, and a first-time visitor sees the welcome dialog either way. The box example still carries `"skipWelcome": false`, which does no harm.

4. **Build your link.** Put the address of your manifest after `?manifest=`:

   ```text
   https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/forge-manifest.json
   ```

   Replace `YOUR_USERNAME` and `YOUR_REPO`, and `main` if your branch has another name.
5. **Test it in a private window.** A private window (Ctrl+Shift+N in Chrome and Edge) behaves like a first-time visitor. Open your link there: you should see the welcome dialog, then your project and its preview.
6. **Put it on your website.** Any page can link to it:

   ```html
   <a href="YOUR_LINK">Open my design in OpenSCAD Assistive Forge</a>
   ```

For a quick one-off share without a manifest, a link can also point straight at one `.scad` or `.zip` file: `https://openscad-assistive-forge.pages.dev/?project=` followed by the file's raw address. With no manifest, it has no default preset or starting settings.

## 4. One client, one configuration

When different people need different starting points, send each one their own link:

- **A named preset.** Add `&preset=` and the preset's name to the end of the link, with `+` in place of each space. The box, opened on its Desktop Tray preset:
  <https://openscad-assistive-forge.pages.dev/?manifest=https://raw.githubusercontent.com/BrennenJohnston/openscad-assistive-forge/example-manifest/forge-manifest.json&preset=Desktop+Tray>
- **Exact settings.** Open your project in Forge, set the controls the way you want, and press **Copy Link** in the Actions drawer. The copied link ends with the values you changed, after a `#`. For a box 70 mm wide, it ends with `#v=1&params=%7B%22box_width%22%3A70%7D`. Only the values that differ from the design's defaults travel, and a browser never sends the part after the `#` to any server.

## 5. Your presets file

Forge reads presets in OpenSCAD's own format, the one desktop OpenSCAD's Customizer saves. Here is the start of this branch's `my_presets.json`, with its first preset:

```json
{
  "parameterSets": {
    "Small Gift Box": {
      "box_width": "60",
      "box_depth": "40",
      "box_height": "35",
      "wall_thickness": "2",
      "include_lid": "yes",
      "lid_fit_gap": "0.3",
      "rounded_corners": "yes",
      "corner_radius": "4",
      "add_feet": "yes",
      "foot_height": "2"
    }
  },
  "fileFormatVersion": "1"
}
```

Every value is written as text, the way OpenSCAD writes it, and Forge reads each one as the right kind of value for its parameter. The names must match the parameter names in your `.scad` file exactly.

The box's five presets: **Small Gift Box**, a compact box for small gifts or trinkets; **Desktop Tray**, a wide, shallow tray for organizing a desk; **Tall Storage Box**, a tall box for pens, brushes or remotes; **Snap-Lid Keepsake Box**, with a tight-fitting lid for small keepsakes; and **No-Frills Utility Box**, with sharp corners and no feet, which prints fast and stacks well.

You do not have to write this file by hand. Save presets in desktop OpenSCAD's Customizer and upload the `.json` file it writes beside your design. Or save them in Forge and export them with **Import / Export** in the Presets section: exporting all of a design's presets writes OpenSCAD's format.

When you update your design, keep your main `.scad` file's name. Forge keeps each person's saved presets under that name, so an updated design still finds them.

## 6. Writing the manifest

Forge can write the manifest for you. Load your project, open the Actions drawer, and press **Publish**. The dialog shows a finished `forge-manifest.json` for whatever is loaded, with a **Copy Manifest** button. Fill in your GitHub raw base address further down the same dialog, and it builds your link as well. Forge checks the manifest it writes against the same rules its loader uses.

## 7. Where your files can live

Your files have to be on one of these hosts:

| Host | Notes |
|---|---|
| GitHub raw (`raw.githubusercontent.com`) | Your repository's files. Right for most projects. |
| Git LFS media (`media.githubusercontent.com`) | Where GitHub serves files stored with Git LFS. Forge follows the small pointer file to it by itself. |
| GitHub Pages (`*.github.io`) | Your own Pages site. Right for busy or very large projects (part 8). |
| GitLab Pages (`*.gitlab.io`) | The same idea on GitLab. |
| Cloudflare Pages (`*.pages.dev`) | The same idea on Cloudflare. |

A manifest that names any other host is refused inside the browser, before any request is sent. That includes a GitHub Releases download and a WordPress or Squarespace site. If you need somewhere other than your repository, put a copy of your files on your own GitHub Pages site and point your link at the manifest there.

## 8. Sizes and traffic

- **Under 100 MB per file:** commit it to your repository as a plain file. It needs no Git LFS, and GitHub puts no monthly quota on it.
- **Over 100 MB:** GitHub refuses the file in plain git, so it needs Git LFS, and every open of your link costs the file's size against your LFS bandwidth. A Free account includes 10 GiB a month. At 65.7 MB, the full keyguard bundle allows about 150 opens a month. When the month's bandwidth runs out and there is no payment method on the account, GitHub serves the small pointer file instead of the archive until the next month, and Forge then shows the link's failure notice with "server returned 403".
- **A lean bundle:** the keyguard designer without its overlay pictures is 8.9 MB, small enough to live in plain git. That is what the main keyguard link opens.
- **A busy or very large project:** put it on your own GitHub Pages site. It allows a 1 GB site and a soft limit of 100 GB of traffic a month, with no LFS quota.
- **Classrooms and clinics:** since May 2025, GitHub limits how often one internet address can download raw files without signing in. When many people behind one address open a link, some may see "server returned 429". Waiting a little and pressing **Try again** usually works, and a GitHub Pages copy avoids it.

If you do need Git LFS, set it up once on your computer, then tell it which files to store:

```bash
git lfs install
git lfs track "*.zip"
git add .gitattributes
```

`git lfs track` writes the pattern into `.gitattributes`; commit that file with your archive. Anyone who clones or forks your repository needs Git LFS installed too, or they see small pointer files where your archives should be. Your link is not affected either way.

## 9. What a person opening your link sees

From Forge 5.1.1:

- On a first visit, the welcome dialog: it says what the app does and asks which interface to use. It comes back on every visit until the person ticks "Remember my choice on this device". "Download & Continue" loads the OpenSCAD engine.
- A "Shared Project" dialog that offers to save a copy of your project in their browser ("Save My Copy" or "Skip for Now"), then your project, with its preview.
- If the link fails, for example a wrong address, GitHub's download limit, or an LFS month that has run out, a notice at the top of "Open or start a project" gives the reason and offers **Try again**.
- A `?project=` link to a ZIP file stored with Git LFS opens the archive itself, not the small pointer file.

Their browser downloads your files straight from GitHub, or from your Pages site, as it would for any web page.

## 10. Troubleshooting

| What you see | What to do |
|---|---|
| "Couldn't reach the file server" | Your repository must be **Public**, and your files must be on a host from part 7. |
| "server returned 404" | A file name or path in the manifest, or in your link, does not match your repository. File names are case-sensitive. |
| "Invalid manifest" | Check your JSON at <https://jsonlint.com>. The usual culprits are a missing comma, a trailing comma, or a mismatched quote. |
| The parameters do not appear | Your `.scad` file needs Customizer annotations, for example `width = 50; // [10:100]`. |
| The preset list says "design default values" and your preset was not selected | `defaults.preset` must match a preset's name in your presets file, and the file must be in OpenSCAD's format (part 5). |
| A companion file is missing | The name in `files.companions` must match the uploaded file exactly. |
| Your ZIP file is about 130 bytes in your own copy | That is a Git LFS pointer: install Git LFS and run `git lfs pull`. The people opening your link never see it, because Forge follows the pointer. |
| "server returned 403" on an LFS-stored file | Your month's LFS bandwidth has run out. Make the file smaller than 100 MB so it can live in plain git, or move it to your GitHub Pages site. |
| "server returned 429" | Too many downloads from one internet address. Wait a little and press **Try again**, or use a GitHub Pages copy. |
| "exceeds the 500MB size limit" | Forge opens bundles up to 500 MB. Make a lean bundle without pictures, as the keyguard example does. |

The full reference is the [Manifest Sharing Guide](https://github.com/BrennenJohnston/openscad-assistive-forge/blob/main/docs/guides/MANIFEST_SHARING_GUIDE.md).

## 11. License

The template files on this branch (the manifests, `my_design.scad`, `my_presets.json` and this README) are released under CC0 1.0, as the `LICENSE` file says: copy, change and share them for any purpose, without asking.

The keyguard designer in `ready_to_print_designs.zip` and `ready_to_print_designs-lean.zip` is Volksswitch.org's work. Its author dedicated it to the public domain under CC0 1.0, in the header of `keyguard_v75.scad`.

[OpenSCAD Assistive Forge](https://github.com/BrennenJohnston/openscad-assistive-forge), made for the assistive technology community.
