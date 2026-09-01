<p align="center">
  <img src="assets/brand/OpenSCAD Assistive Web Forge Logo_large.png" alt="OpenSCAD Assistive Web Forge Logo" width="200">
</p>

# OpenSCAD Assistive Forge

A browser based OpenSCAD "Customizer" that tries to be usable with keyboards, screen readers, high contrast, and small screens.

- **Live demo**: `https://openscad-assistive-forge.pages.dev/`
- **Docs index**: `docs/README.md`
- **Project status**: `PROJECT_STATUS.md`

## Why this exists

Because I work in the assistive technology field, I love parametric OpenSCAD models, but the usual workflow of installing several apps, copy and pasting settings, and trying to understand a new UI is a barrier for a lot of people, especially folks who rely on assistive tech like clinicians, caregivers, people living with a disability or anyone who just need "a few dimensions changed".

So this is my attempt at removing a few of those barriers and hopefully opening up opportunities to deliver more custom models to everyone.

## What it does

- **Runs OpenSCAD in your browser** (WebAssembly in a Web Worker)
- **Builds a parameter UI** from OpenSCAD Customizer annotations
- **Previews the model** (Three.js) and lets you orbit/pan/zoom
- **Exports** STL/OBJ/OFF/AMF, plus SVG/DXF for laser cutting
- **Supports multi-file projects** via `.zip` (for `include` / `use`)
- **Keeps everything local** (no accounts, no uploads, no backend)

## Built-in tools

The welcome screen ships with ready-to-use customizers -- no `.scad` file needed:

- **Braille Card Customizer** -- type plain text and get 3D-printable braille;
  translation (Grade 1 / Grade 2) runs entirely on-device via liblouis compiled
  to WebAssembly. Three variants: a card that prints leaning back at 75° with
  break-away supports, a small charm/pendant/zipper pull, and a two-part
  tactile sign with raised letters and braille (ADA-style defaults). See
  `docs/guides/BRAILLE_CARD_GUIDE.md`.
- **Charm Customizer** -- design wearable charms, pendants, and logo plates
  with engraved or raised icons, including C-clip charms that snap onto
  silicone bracelets. Import your own SVG or pick from the built-in library.

## Two interfaces

The first time you open the app it asks which interface you want, and you can
switch at any time from the button in the top right:

- **Assistive Forge** -- a guided, parameter-first interface built for screen
  readers, keyboard use, and people new to OpenSCAD. Light, dark, and high
  contrast themes.
- **Classic** -- the layout of the OpenSCAD desktop application: the same menus,
  toolbar, editor, Customizer, and console. For people who already know the
  desktop program or are following a tutorial written for it. Desktop widths
  only, and it keeps the desktop's light appearance.

Both open the same files and produce the same geometry. See
`docs/guides/CLASSIC_UI_GUIDE.md`.

## Accessibility notes (the short version)

I treat accessibility bugs as "real bugs". A few highlights:

- Keyboard-first interaction, visible focus, skip-link-ish navigation
- Screen reader friendly form markup + status announcements
- Light / dark / high-contrast modes (and Windows forced-colors support)
- Respects reduced motion

More detail lives in `docs/guides/ACCESSIBILITY_GUIDE.md`.

## Install as a desktop app (offline use)

You don't need to install anything to use this -- but you can. Visit the live
demo, click your browser's install icon (right side of the address bar in
Chrome or Edge), and you have a desktop app that lives in your Start menu /
Applications folder and works fully offline. No installer file, no admin
rights, no IT executable approval needed.

See `docs/guides/RUN_OFFLINE_GUIDE.md` for full instructions, including a
"before you travel" workshop checklist and a Chrome / Edge group-policy
snippet for IT-managed devices.

## For organizations and IT teams

If your IT or security team needs to evaluate the site before they will
allowlist it, hand them `docs/guides/IT_APPROVAL_GUIDE.md`. It covers the
CSP and other response headers verbatim, the (very short) data-handling
story, exact network requirements, supply-chain controls, accessibility
conformance, and a copy-paste approval checklist.

## Develop locally

```bash
git clone https://github.com/BrennenJohnston/openscad-assistive-forge.git
cd openscad-assistive-forge
npm install
npm run dev
```

Then open `http://localhost:5173`.

**Optional:** If you have [Pixi](https://pixi.sh/) installed, `pixi run dev`
(and all other tasks) work as drop-in replacements for `npm run`. See
`pixi.toml` for the full task list.

## Docs (where to start)

- `docs/README.md` (index)
- `docs/DEPLOYMENT.md`
- `docs/TESTING.md`
- `docs/TROUBLESHOOTING.md`
- `docs/specs/PARAMETER_SCHEMA_SPEC.md`

## Contributing

If you found a bug, confusing UI, or a missing accessibility affordance: please open an issue. PRs are welcome too -- small and focused is easiest for me to review.

`CONTRIBUTING.md` has the details.

## License

GPL-3.0-or-later. See `LICENSE`.

## Credits

This project stands on a lot of good work:

- OpenSCAD (`https://openscad.org/`)
- OpenSCAD WASM builds (`https://github.com/openscad/openscad-wasm`)
- OpenSCAD Playground (helpful reference UI) (`https://github.com/openscad/openscad-playground`)
- Three.js (`https://threejs.org/`)
- liblouis braille translator (`https://liblouis.io/`)
- Tony Fast (`https://github.com/tonyfast`) -- expert accessibility feedback

See `CREDITS.md` and `THIRD_PARTY_NOTICES.md` for the full list.

