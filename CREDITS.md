# Credits & Acknowledgments

This file acknowledges inspirations, techniques, and references that contributed to this project beyond direct code dependencies.

For third-party software licenses and compliance information, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Core Technologies

- **OpenSCAD** - The parametric 3D CAD modeler that powers this tool
  - https://openscad.org/
  - License: GPL-2.0-or-later

- **Three.js** - 3D rendering library for web
  - https://threejs.org/
  - License: MIT

---

## Rendering & Visual Techniques

### Shape-Vector Character Rendering

The shape-vector approach to character-based rendering used in this project was inspired by research and educational articles by **Alex Harri**.

- **Reference**: Alex Harri, character-based rendering technique article
- **URL**: https://alexharri.com/blog/ascii-rendering
- **Usage**: Educational reference for technique concepts
- **Note**: Implementation is clean-room; no code was copied

The article's exploration of 6-dimensional shape vectors, per-cell contrast enhancement, and treating characters as shapes rather than pixels informed the rendering approach.

### ASCII City Walk (hidden game)

The walkable ASCII city inside the Alt View mode draws on several inspirations. No code was taken from any of them; the game is built on this project's own ASCII pipeline, three.js, and OpenStreetMap data.

- **OpenStreetMap contributors** — the map data the cities are built from (ODbL 1.0; see THIRD_PARTY_NOTICES.md)
- **Touch Mapper** by Samuli Kärkkäinen — the idea of turning an address into a tactile-style top-down map informed the game's aerial view (https://touch-mapper.org, AGPL-3.0; concept reference only)
- **Grow Now! Games** — "A Walkable ASCII Cyberpunk City in One HTML File" video, the street-level ASCII-city aesthetic that sparked the feature (https://www.grownowgames.com/; closed source, aesthetic inspiration only)

---

## Fonts

### Iosevka Term

The mono UI variant uses Iosevka Term as its primary display font, self-hosted as a WOFF2 web font.

- **Author**: Belleve Invis
- **URL**: https://github.com/be5invis/Iosevka
- **Version**: v34.2.1
- **License**: SIL Open Font License 1.1 (OFL-1.1)
- **Usage**: Self-hosted in `public/fonts/iosevka-term-regular.woff2`; applied only in the mono UI variant

---

## Design Inspirations

### Retrosmart X11 Cursors

Cursor icons are adapted from the **Retrosmart X11 Cursors** project by mdomlop.

- **Reference**: Retrosmart X11 cursor theme
- **URL**: https://github.com/mdomlop/retrosmart-x11-cursors
- **License**: GPL-3.0
- **Usage**: Cursor pixel designs adapted with color modifications

---

## Charm Customizer Program — Concept, Proof-of-Concept, and UX Design

The image-to-OpenSCAD import feature and the charm builder tools were
inspired by a proof-of-concept built by **Nasif Zaman**
([@Znasif](https://github.com/Znasif)).

- **Reference**: https://github.com/Znasif/openscad-assistive-forge
- **Commits**: Jan 29-31, 2026 (4 commits on fork)
- **Contribution**: Demonstrated PNG-to-SCAD geometry pipeline, designed
  the logo-plate example concept, validated the client-side image
  processing approach, established the upload + invert + depth UX pattern
- **Image Prep proof-of-concept**: Nasif's fork also included a
  Flask-based image processing pipeline (median filter, thresholding,
  edge detection) that converted raster images into SVG outlines for
  OpenSCAD `import()`. The Forge's client-side image pipeline using
  imagetracerjs serves the same purpose without a server dependency.
- **Named program**: Three example tools are grouped under the
  **"Charm Customizer"** program:
  - **Charm Customizer** (`public/examples/nasif-charm-maker/`) —
    flat pendant/charm with SVG designs
  - **Bracelet Clip Charm** (`public/examples/q-charm/`) — C-clip bracelet charm
    with parametric fit, dual-layer SVG, and text support
  - **Logo Plate** (`public/examples/logo-plate/`) — parametric plate
    with engraved SVG logo

  The program name appears in each tool's manifest (`"program":
  "charm-customizer"`), the File > Examples submenu, and the welcome
  screen card. Each SCAD file's header comment credits Nasif by name.

### HuskyADAPT Team & Adaptive Solutions Mini-Hackathon

The Charm Customizer tools grew out of the **Adaptive Solutions
Mini-Hackathon**, a collaboration between UW CREATE, King County Library
System (KCLS), and the **HuskyADAPT** student team at the University of
Washington.

- **Event**: Adaptive Solutions Mini-Hackathon
- **URL**: https://create.uw.edu/adaptive-solutions-mini-hackathon/
- **Organizers**: UW CREATE, King County Library System
- **Team**: HuskyADAPT (University of Washington)
- **Context**: The hackathon paired community members who use assistive
  technology with engineering students to co-design practical solutions.

### Duy Do & UW WOOF3D

**Duy Do**, working as part of the **UW WOOF3D** club at the University
of Washington, created AAC charms with Boardmaker symbols designed to
clip onto silicone bracelets. His original project files directly
informed the Bracelet Clip Charm tool's design direction (and, through
it, the Braille Charm's `bracelet_clip` shape).

- **Creator**: Duy Do
- **Club**: UW WOOF3D (University of Washington)
- **URL**: https://www.thingiverse.com/thing:7153594
- **Project**: AAC Charms With Boardmaker Symbols For Silicone Bracelets

---

## Special Thanks

- The OpenSCAD community for creating and maintaining an accessible parametric CAD tool
- Contributors to the Three.js project for exceptional 3D web rendering capabilities
- Alex Harri for sharing detailed technical research on character rendering techniques

---
