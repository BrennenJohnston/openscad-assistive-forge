# Adding a tile

**Owner review pending.** Every sentence in this guide is a draft for the
project owner to read and change. Nothing here is settled wording, and the
section on tactile values in particular is theirs to sign.

A **tile** is one design the app offers on its welcome screen: a `.scad` file, a
`manifest.json` that describes it, and whatever pictures or presets travel with
it. This guide walks the whole way from a fork to a pull request. It assumes you
can run a command in a terminal and nothing else.

You do not need to understand the app's code to add a tile. That is the point of
this page.

## The short version

```bash
git clone https://github.com/BrennenJohnston/openscad-assistive-forge
cd openscad-assistive-forge
npm install
cp -r public/examples/_template public/examples/my-tile
# edit public/examples/my-tile/
node scripts/validate-example.mjs public/examples/my-tile
npm run dev
```

Then open a pull request.

The rest of this page is what each of those steps means.

## 1. Get the app running

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. If something goes wrong here, it is almost always
`npm install`, and `docs/TROUBLESHOOTING.md` has the usual suspects.

## 2. Copy the template

```bash
cp -r public/examples/_template public/examples/my-tile
```

`_template` starts with an underscore, and that is how the app knows it is
starter material rather than something to offer anyone. Your folder should not
start with an underscore.

Inside you get:

| File | What it is |
| --- | --- |
| `template_tile.scad` | The design. Heavily commented, on purpose. Rename it. |
| `manifest.json` | Who wrote it, what it is called, which files travel with it. |
| `presets/starter.json` | A saved set of values, so someone can start from a good one. |

Rename `template_tile.scad` to something that says what your design is, and
change `main` in `manifest.json` to match.

## 3. Write the design

Two things make a `.scad` file into a tile someone can actually use.

**Groups.** A line like `/* [Size] */` starts a section of controls. Everything
under it appears together, in the order you wrote it. Without any groups the app
shows one long undivided list, which is unusable on a design of any size.

**A comment above every parameter.** Two different things become two different
parts of the control, and it is worth knowing which is which:

```openscad
// Width of the label (mm)
label_width = 70; // [30:1:150]
```

- The **variable name** becomes the control's label, with the underscores turned
  into spaces: `label_width` reads as "label width". So name your variables in
  plain words. `w` is a bad label; `label_width` is a good one.
- The **comment above** becomes the description shown under that label, and the
  text behind the control's help button. Write it for the person using the app,
  not for the person reading the code.
- If the description ends in a unit like `(mm)`, the app picks the unit up and
  shows it beside the value.

Leave the comment out and the control still appears, labelled with the bare
variable name and explained by nothing.

The bit in square brackets after the value decides what kind of control it is:

| You write | They get |
| --- | --- |
| `// [10:100]` | A slider from 10 to 100 |
| `// [1:0.5:5]` | A slider that steps by 0.5 |
| `// [yes, no]` | A checkbox |
| `// [engraved, raised]` | A menu |
| `// [file:svg,png,jpg]` | A file picker |

A two-way `yes`/`no` becomes a checkbox; any other list becomes a menu.

A file picker for a design can also fit it properly. OpenSCAD cannot
measure an imported picture, so `resize([w, 0], auto = true)` alone lets a
tall design overflow whatever it is drawn on. Declare a companion
parameter named exactly `<your_file_param>_aspect` (for `design_file`,
that is `design_file_aspect`) with a default of 1, and the app fills it
with the chosen picture's width divided by height; the control itself is
hidden. Use it to anchor the resize to whichever axis the design hits
first:

```openscad
resize(design_file_aspect >= fit_w / fit_h ? [fit_w, 0] : [0, fit_h],
       auto = true)
    import(design_file, center = true);
```

`nasif_charm_maker.scad` shows the full pattern, including clipping raised
designs at the charm edge for people who open the file in desktop OpenSCAD
with the aspect left at 1.

Everything after `/* [Hidden] */` is yours: computed values, modules, the actual
geometry. The app does not show any of it as a control.

`echo()` prints to the console, including in headless runs. Use it to report the
finished size, or anything else somebody would want to know before they print.

## 4. Fill in the manifest

There are two different files in this project with "manifest" in the name, and
they do different jobs:

- **`manifest.json` beside your `.scad`** describes a tile that ships with the
  app. That is the one this guide is about.
- **`forge-manifest.json`** is the file the app writes when somebody publishes a
  project of their own. Different shape, different purpose, documented
  separately in `docs/guides/MANIFEST_SHARING_GUIDE.md`.

A tile's manifest needs these:

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | What the tile is called on screen |
| `description` | yes | A sentence or two in plain language |
| `version` | yes | Your own version, e.g. `1.0.0` |
| `author` | yes | You, or your project |
| `license` | yes | How anyone else may use it - see below |
| `main` | yes | The `.scad` file |
| `files` | yes | Every file that travels with the tile, `main` included |
| `tags` | no | Words someone might search for |
| `tactile` | no | Parameters people read with their fingers - see below |
| `program` | no | Which family of tiles this belongs to |
| `svgLibrary` | no | Pictures you offer for a `[file:...]` parameter |
| `inspired_by` | no | Whose work you started from, if it was somebody's |

**About `license`.** A tile with no license is a tile nobody else can legally
reuse, which is the opposite of why it is here. `CC0-1.0` puts it in the public
domain. `GPL-3.0-or-later` matches the app. Either is welcome; pick one and say
so.

**About `inspired_by`.** If your design started from somebody else's, name them.
The tiles already in this repository do.

## 5. Files your design reads

If your `.scad` reads a file - a picture to engrave, a `.dxf` outline, a
`.scad` you `include` - then **that file must be listed in `files`**.

This is worth a paragraph because it has already gone wrong here. One of the
app's own examples shipped with a picture it imported, the picture sitting in
the folder the whole time, the manifest naming it, and the app still could not
find it, because a second list had drifted out of step. The first preview
errored while the status line said "Preview ready". Nobody noticed for months.

The validator now checks this for you. It reads your `.scad`, finds everything
it reads from disk, and tells you if `files` does not name it.

### Layered designs (prototype)

STRINGS/PROSE: owner review pending (DP-R1 text pack).

Most designs are one shape cut or raised once. A **layered** design is built
in passes: the app looks at which shapes sit inside which, writes one file per
pass, and your model builds them one on top of the other. Three nested squares
come out as a stepped pyramid rather than a single flat square.

Your `.scad` opts in simply by declaring the parameters. If a file parameter
is called `design_file`, the app looks for `design_layer_1`, `design_layer_2`
and `design_layer_3` beside it, each with an `_aspect` companion:

```openscad
design_layer_1 = "";        // [file:svg]
design_layer_1_aspect = 1;  // [0.05:0.01:20]
design_layer_1_depth = 0.8; // [0.4:0.1:3.0]
design_layer_1_style = "raised"; // [raised, engraved]
```

There is no flag anywhere else. Your parameters ARE the opt-in, so nothing can
drift out of step with them. Declare them all empty: a layered design should be
something a person turns on, not something they discover.

Four things about the files the app writes, each of which will bite you:

- **Every pass is written on the same canvas**, `100mm` wide, sized from the
  first pass. Scale by ONE factor and never call `resize()` on a pass. OpenSCAD's
  `resize()` fits the shape's own bounding box, so fitting each pass separately
  scales the smallest one up to the size of the largest and your stack prints
  as identical slabs.
- **Import with `center = false`.** The passes already share one coordinate
  system; `center = true` re-centres each on its own bounding box and pulls
  the stack apart.
- **Anchor each pass where the last one finished**, and overlap by `0.01`.
  Raised passes travel up, engraved passes travel down. Nothing may exactly
  touch.
- **Join `total_top_z`.** If your model measures anything down from the top,
  a stack that raised the model without telling it will cut in the wrong place.

Cost, measured on this machine with OpenSCAD 2026.01.03: three passes of simple
artwork render in 0.34 s against 0.31 s for one. Three passes of an 831-subpath
drawing take 10.2 s against 3.5 s - close to linear in the number of passes, so
a detailed drawing built in three passes is a ten-second render, not a
one-second one.

Add each example pass file to `files`, the same as any other file your design
reads.

## 6. Tactile designs

**Owner sign-off required. This section is a draft.**

If any part of your design is meant to be read by touch - braille dots, a raised
edge, a tactile label - then the numbers that decide its shape are not yours to
pick by feel, and they are not the maintainer's either.

The rules this project works to:

- Every dimension that affects readability by touch, grip, or how hard something
  is to press is a **parameter with a documented safe minimum and maximum**,
  never a number typed straight into the geometry.
- The minimum and maximum come **from the standard that governs the design** -
  the braille specification this project ships, the signage standard an
  installation has to meet, whatever applies to what you are making. Not
  invented, not copied from another tile, and never widened to make a render
  succeed.
- An **`assert()` enforces them**, so a value outside the range fails the build
  instead of quietly printing something nobody can read.

Name those parameters in the manifest:

```json
"tactile": ["dot_height", "dot_diameter"]
```

and the validator will check that each one has a documented range and something
asserting it. It checks that the range is written down and enforced. It cannot
check whether the numbers are right - only the standard can do that, and only
the maintainer signs them off.

Why this matters more than anything else on this page: **nothing in the build
catches a wrong tactile number.** Dots too tall read as mush and dots too short
read as nothing, and both of them export, print, and look perfectly fine in the
preview. Only a finger finds out, and by then it is a printed object in
somebody's hand.

`_template` carries a worked example of the whole pattern, with placeholder
numbers marked as placeholders.

## 7. Check it

```bash
node scripts/validate-example.mjs public/examples/my-tile
```

You get one plain sentence per problem, and an exit code a script can use:

```text
public/examples/my-tile
  ERROR  manifest.json has no "license". A tile without one is a tile nobody
         else can legally reuse, which is the opposite of why it is here.
  ERROR  my_tile.scad reads logo.svg (logo_file on line 24), which is in this
         folder but not listed in manifest.json under "files".

FAILED - 2 error(s) across 1 folder(s).
```

Lines marked `note` are worth a look but do not fail anything.

The validator never renders. To check that your design actually builds, load it
in the app (`npm run dev`, then drag the `.scad` onto the upload area), and run
the render gate:

```bash
npx playwright test tests/e2e/wasm-smoke.spec.js --project=chromium
```

If your design has `assert()` lines, this is where a bad default shows up: the
preview fails and the message you wrote appears in the OpenSCAD Messages panel.

## 8. Put it on the welcome screen

A folder under `public/examples/` is not offered to anyone until it is listed in
`src/js/tile-registry.js`. That file is the single place the app looks to learn
what tiles exist and which files each one needs. Add an entry beside the others:

```js
'my-tile': {
  path: '/examples/my-tile/my_tile.scad',
  name: 'my_tile.scad',
  description: 'My Tile',
  manifest: '/examples/my-tile/manifest.json',
  additionalFiles: ['/examples/my-tile/logo.svg'],
},
```

The registry and your manifest have to agree about which files the tile needs -
a unit test fails if they drift, which is the same defect from section 5 caught
from the other side.

If you would rather not touch the app's code at all, say so in the pull request
and leave this step out. Somebody will add the entry.

## 9. Open the pull request

The pull request template has a section for tiles. In short:

- The validator passes.
- The design renders in the app.
- `license` and, if you started from somebody's work, `inspired_by` are filled
  in.
- Any tactile ranges are named in the manifest, documented in the `.scad`, and
  flagged in the pull request for the maintainer to sign off.
- Any text a person will read - the tile's name, its description, the labels on
  the controls - is flagged for the maintainer to review. Wording that reaches a
  screen reader is never finalized without them.

## What happens after it is merged

A merged tile is part of the app and is maintained with it, the same as the
examples already here. If something about it needs judgement - especially a
tactile value - the maintainer will come back to you rather than change it
quietly.

There is no separate gallery of community tiles, and no plan for one right now.
Everything the app offers lives in this repository, where the same tests run
over all of it.

## If you get stuck

- `CONTRIBUTING.md` - the general contribution notes
- `docs/guides/GETTING_STARTED.md` - using the app itself
- `docs/OPENSCAD_LANGUAGE_REFERENCE.md` - the language
- `public/examples/_template/template_tile.scad` - the template, commented line
  by line
