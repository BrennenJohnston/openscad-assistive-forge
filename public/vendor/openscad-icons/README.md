# OpenSCAD "chokusen" Icon Theme (vendored subset)

Toolbar icon SVGs from the OpenSCAD desktop application, used by this
project's Classic desktop-layout mode.

- **Source repository**: https://github.com/openscad/openscad
- **Paths**: `resources/icons/chokusen/svg/` and `resources/icons/chokusen-dark/svg/`
- **Pinned commit**: `fa8ff8916a9090d9bc64e9d3ad2725ba1aa74dce`
- **License**: GPL-2.0-or-later (the OpenSCAD repository license); redistributed
  here under this repository's GPL-3.0-or-later umbrella, which
  GPL-2.0-or-later permits. See the repository `LICENSE` file and
  `THIRD_PARTY_NOTICES.md`.
- **Attribution**: the OpenSCAD developers — see
  https://github.com/openscad/openscad/blob/master/AUTHORS
- **Trademark note**: the OpenSCAD logo, application icon, and name are NOT
  vendored. Only functional toolbar glyphs are included; this project is not
  affiliated with or endorsed by the OpenSCAD project.

## Vendored files

39 SVGs per theme. The `chokusen-vcr-control-*` six (start, step-back, play,
pause, step-forward, end) were added 2026-08-07 for the Animate panel's
playback buttons, from the same pinned commit as the rest.

The manifest also holds `chokusen-animate-disabled/-pause/-play.svg`, which
belong to the Animate dock's menu action upstream. They are deliberately NOT
vendored: this project puts no icons on menu items, so nothing would
reference them.

## Updating

1. Change the pinned commit above.
2. Re-download the same file list for both themes from
   `https://raw.githubusercontent.com/openscad/openscad/<commit>/resources/icons/<theme>/svg/<name>.svg`.
3. Keep `src/styles/classic-icons.css` in sync with the file list.

## Pin verification

The pinned commit above is **content-identical** to `f2bfab1e`
(tag `openscad-2026.01.01-TEST2`), the revision this project transcribes its
menu and toolbar structure from. Verified 2026-08-07 by comparing the git
tree hashes of both icon directories at the two commits:

| Directory | Tree hash at both commits |
|---|---|
| `resources/icons/chokusen/svg` | `83494843fe36b6fdbdaeefceea9224fae66531a5` |
| `resources/icons/chokusen-dark/svg` | `d6b0c5043a8f589953155a6a6822c5e557246120` |

Tree hashes are content-addressed over the whole directory, so matching
hashes prove every file is byte-identical. No re-pinning is required; the
icons and the transcribed structure describe the same release.

Icon **names** come from `resources/icons-chokusen.qrc` in the same commit —
never guessed. That manifest is also identical between the two commits.

## Vendored files (33 per theme)

add, axes, crosshairs, export-dxf, export-stl, indent, measure-angle,
measure-distance, new, open, orthogonal, parameter, perspective, preview,
redo, remove, render, reset-view, save, scalemarkers, show-edges, surface,
undo, unindent, view-back, view-bottom, view-front, view-left, view-right,
view-top, zoom-all, zoom-in, zoom-out (all prefixed `chokusen-`, in both the
`chokusen/` and `chokusen-dark/` directories).

The `vcr-control-*` and `animate-*` glyphs exist at the same commit but are
NOT vendored yet: nothing references them until the Animate panel is built,
and an unreferenced asset is audit surface for no benefit. Add them with that
panel, using the procedure above.
