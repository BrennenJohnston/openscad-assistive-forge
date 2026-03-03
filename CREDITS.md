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

## Special Thanks

- The OpenSCAD community for creating and maintaining an accessible parametric CAD tool
- Contributors to the Three.js project for exceptional 3D web rendering capabilities
- Alex Harri for sharing detailed technical research on character rendering techniques

---
