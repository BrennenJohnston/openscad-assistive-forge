# Third-Party Notices

This document lists the third-party software used by OpenSCAD Assistive Forge and the web applications it generates.

## OpenSCAD (GPL-2.0-or-later)

Generated web applications include OpenSCAD compiled to WebAssembly (WASM) for client-side STL generation.

**License**: GNU General Public License v2.0 or later
**Project**: https://openscad.org/
**Source Code**: https://github.com/openscad/openscad
**WASM Build**: OpenSCAD-2026.04.03+forge.3, built for Forge from OpenSCAD's source (includes Manifold support)
**Build Source**: OpenSCAD commit `98d891340e6007524e69f399162016f9b22584ff`, the commit behind the official 2026.04.03 snapshot, built by `scripts/build-openscad-wasm.sh` in this repository, with the libraries built from openscad-wasm commit `dc2ff913b4193b1ebfef863da3f7e84f8fbc1e11`
**Changes to OpenSCAD's build**: three: the compile definition `CGAL_ALWAYS_ROUND_TO_NEAREST`, WebAssembly's own exceptions (`-fwasm-exceptions`), and an 8 MiB stack; the patches and the reasons are on this repository's `engine-research` branch
**Vendored Location**: `public/wasm/openscad-official/`
**Official snapshots**: four official OpenSCAD WebAssembly snapshots (2026.10.18, 2026.04.03, 2026.01.03, 2025.03.25), downloaded unchanged from `https://files.openscad.org/snapshots/` at build time and served from this site only when a person chooses one; this OpenSCAD notice covers them

### Manifold Geometry Library

This build includes the Manifold geometry library for dramatically faster CSG operations:

**License**: Apache-2.0
**Project**: https://github.com/elalish/manifold
**Performance**: 5-30x faster boolean operations, 10-30x faster Minkowski operations

### GPL Compliance for Generated Web Apps

When you deploy a generated web application that includes OpenSCAD WASM:

1. **You must provide access to the OpenSCAD source code** — either by:
   - Linking to the official GitHub repository, or
   - Hosting the source code yourself, or
   - Offering to provide the source upon request

2. **You must include this notice** (or equivalent) in your deployed application's "About" or "Licenses" section

3. **The GPL applies to OpenSCAD and this tool**, which means:
   - Your `.scad` model files retain your license
   - The web application (including OpenSCAD WASM) is GPL-3.0-or-later
   - Your parameter configurations are not affected
   - Generated STL files (data output) are not GPL-licensed
   - The Manifold library (Apache-2.0) is compatible with GPL

### Obtaining OpenSCAD Source

The source code for OpenSCAD is available at:
- https://github.com/openscad/openscad
- https://github.com/openscad/openscad-wasm (WASM port)
- https://github.com/openscad/openscad-playground (playground build system)

To build OpenSCAD WASM from source, see:
- https://github.com/openscad/openscad-wasm

---

## OpenSCAD "chokusen" Icon Theme (GPL-2.0-or-later)

The Classic desktop-layout mode uses a subset of the icon theme shipped with
the OpenSCAD desktop application, so power users see the exact toolbar
iconography they know from desktop OpenSCAD.

**License**: GNU General Public License v2.0 or later (OpenSCAD repository license)
**Project**: https://openscad.org/
**Source Code**: https://github.com/openscad/openscad (`resources/icons/chokusen/` and `resources/icons/chokusen-dark/`)
**Pinned Commit**: `fa8ff8916a9090d9bc64e9d3ad2725ba1aa74dce`
**Retrieved**: 2026-08-06 (original 26); 2026-08-07 (indent, unindent, export-dxf, zoom-in, zoom-out, measure-distance, measure-angle); 2026-08-07 (vcr-control-start, vcr-control-step-back, vcr-control-play, vcr-control-pause, vcr-control-step-forward, vcr-control-end — the Animate panel's playback buttons)
**Vendored Location**: `public/vendor/openscad-icons/` (39 SVGs per theme)
**Redistribution**: under this repository's GPL-3.0-or-later umbrella (GPL-2.0-or-later permits this)

The pinned commit is content-identical to the tag this project transcribes
its UI structure from, `openscad-2026.01.01-TEST2` (`f2bfab1e`): the git tree
hashes of both icon directories match exactly at the two commits
(`chokusen/svg` = `83494843fe36b6fdbdaeefceea9224fae66531a5`,
`chokusen-dark/svg` = `d6b0c5043a8f589953155a6a6822c5e557246120`), so the
icons and the transcribed structure describe the same release.

The OpenSCAD logo, application icon, and name are **not** included — see the
"Trademarks / No Affiliation" section below. Only functional toolbar glyphs
are vendored.

---

## Three.js (MIT)

Generated web applications use Three.js for 3D preview rendering.

**License**: MIT License
**Project**: https://threejs.org/
**Source Code**: https://github.com/mrdoob/three.js

```
MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## liblouis (LGPL-2.1-or-later)

The braille tools translate text to Unicode braille entirely on the visitor's
device with liblouis, compiled to WebAssembly and run in a module worker. I
compile it from its release tarball rather than shipping a published build, so
the exact bytes in the app can be traced back to one tarball and one checksum.

**License**: GNU Lesser General Public License v2.1 or later, for the library and for every translation table shipped (each table's own header names its authors). The liblouis command line tools are GPL-3.0-or-later and are not shipped.
**Project**: https://liblouis.io/
**Source Code**: https://github.com/liblouis/liblouis
**Release**: 3.39.0
**Source Tarball**: https://github.com/liblouis/liblouis/releases/download/v3.39.0/liblouis-3.39.0.tar.gz
**sha256**: `629fa8cb0dfd9ad457c5bf47a42f0953b673e62c8ad6b1d03ddc4e2bd20008f1`
**Vendored Location**: `public/wasm/liblouis/` (the binary, with the upstream `COPYING.LESSER` as `COPYING.LESSER.liblouis` and the build's `README.txt` beside it), `vendor/liblouis/liblouis.mjs` (the loader), and `public/liblouis/` (the Unified English Braille tables with every table they include, a `tables.json` catalog and a `NOTICE.txt`)
**Build Recipe**: `scripts/build-liblouis-wasm.sh`, run by the "Build liblouis wasm" workflow, which also builds a native `lou_translate` from the same tarball and checks the wasm against it, cell for cell
**Usage**: `src/js/liblouis-engine.js`, called from `src/worker/liblouis-worker.js`

Compiled unmodified, configured with `--enable-ucs4 --disable-shared
--without-yaml`. Earlier versions of the app copied a 2017 build of liblouis and
the liblouis-js JavaScript bindings (GPL-3.0) from npm; neither ships any more.

### Obtaining liblouis Source

The tarball named above is the complete corresponding source for the liblouis
part of this build. Every release is also published at
https://github.com/liblouis/liblouis/releases, and I will supply a copy on
request.

---

## clipper2-js (BSL-1.0)

SVG path offset calculations use clipper2-js for polygon offsetting (Minkowski sum).

**License**: Boost Software License 1.0  
**Project**: https://github.com/niceDev0908/clipper2-js  
**Usage**: Used by `src/js/svg-offset.js` for inward/outward path offset in the SVG preparation workspace

---

## imagetracerjs (Unlicense)

The picture tracer's other engine. It is the one Forge used before Potrace
arrived, and it still runs two of the four ways to read a picture: Light and
dark, which keeps the picture's own colours where Potrace draws in one, and
Colours, which traces each quantised colour as its own mask.

**License**: The Unlicense (public domain dedication)  
**Version**: 1.2.6  
**Author**: Andras Jankovics  
**Project**: https://github.com/jankovicsandras/imagetracerjs  
**Usage**: `src/js/image-import.js` and `src/js/colour-separation.js`, bundled from npm

---

## Potrace (GPL-2.0-or-later)

The picture tracer can use Potrace to turn an ink mask into curves. I compile it
from source rather than shipping a published binary, so the exact bytes in the
app can be traced back to one tarball and one checksum.

**License**: GNU General Public License v2.0 or later
**Project**: https://potrace.sourceforge.net/
**Copyright**: (C) 2001-2019 Peter Selinger
**Source Tarball**: https://potrace.sourceforge.net/download/1.16/potrace-1.16.tar.gz
**sha256**: `be8248a17dedd6ccbaab2fcc45835bb0502d062e40fbded3bc56028ce5eb7acc`
**Vendored Location**: `public/wasm/potrace/` (the binary, with the upstream `COPYING` and the build's `README.txt` beside it) and `vendor/potrace/potrace.mjs` (the loader)
**Build Recipe**: `scripts/build-potrace-wasm.sh`, run by the "Build Potrace wasm" workflow
**Usage**: `src/js/potrace-trace.js`, called from the picture tracing worker

Compiled unmodified from `src/potracelib.c`, `src/curve.c`, `src/trace.c` and
`src/decompose.c`. Two files are added to the upstream tree during the build: a
two-line `config.h` holding the `VERSION` and `HAVE_INTTYPES_H` that
`./configure` would otherwise supply, and `scripts/potrace-glue.c`, which is
this project's own code and carries this project's GPL-3.0-or-later licence.

Potrace's README grants it under "either version 2 of the License, or (at your
option) any later version", and that "or later" is what makes it compatible
with this project's GPL-3.0-or-later. The npm package `esm-potrace-wasm` is
deliberately not used: as published it declares GPL-2.0-only, which is not.

### Obtaining Potrace Source

The tarball named above is the complete corresponding source for the Potrace
part of this build. It is also mirrored at https://potrace.sourceforge.net/,
and I will supply a copy on request.

---

## OpenStreetMap Data (ODbL 1.0)

The hidden ASCII City Walk game renders walkable city scenes from bundled
extracts of OpenStreetMap data (building footprints, building heights, and
roads).

**License**: Open Database License (ODbL) 1.0 — data, not software
**Attribution**: Map data © OpenStreetMap contributors
**Copyright page**: https://www.openstreetmap.org/copyright
**ODbL text**: https://opendatacommons.org/licenses/odbl/1-0/
**Vendored Location**: `public/examples/ascii-city/*.json` (trimmed extracts
generated by `scripts/bake-city-extract.mjs` from the public Overpass API;
each file carries its own attribution/license stamp, and
`public/examples/ascii-city/README.md` documents regeneration)

The extracts are a derivative database of OpenStreetMap redistributed under
the ODbL. The game shows the attribution in its own UI wherever the data is
displayed. The rendered game view is a produced work; the underlying data
remains © OpenStreetMap contributors.

---

## JSON Schema (Various)

This tool uses JSON Schema (draft 2020-12) for parameter validation.

**Specification**: https://json-schema.org/
**License**: The JSON Schema specification is available under various open licenses

---

## Reference Projects

This tool was inspired by patterns from:

### openscad-web-gui (Reference Only)
- **License**: GPL-3.0
- **Source**: https://github.com/seasick/openscad-web-gui
- **Note**: Referenced for architecture patterns; code is not directly included

---

## Test Fixtures

### Universal Cuff Utensil Holder (CC0-1.0)
- **File**: `tests/fixtures/universal-cuff/universal_cuff_utensil_holder.scad`
- **Author**: Volksswitch (https://www.volksswitch.org)
- **License**: CC0 1.0 Universal (public domain dedication, stated in the file's own header)
- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: Included verbatim as a test fixture. Real assistive-technology
  source of realistic size (1,017 lines), used by the production-parity and
  editor specs — a 28-line sample cannot reproduce editor layout defects.

### Keyguard (CC0-1.0)
- **File**: `tests/fixtures/keyguard-v75/keyguard_v75.scad`, with a trimmed
  copy for fast parser tests in `tests/fixtures/keyguard-minimal/`
- **Author**: Volksswitch (https://www.volksswitch.org)
- **License**: CC0 1.0 Universal (public domain dedication, stated in the file's own header)
- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: Included as a test fixture. A real keyguard design with many
  parameters, presets and a companion file, used by the parser, preset, ZIP
  and parity tests.

---

## Your Model Files

The `.scad` files you process with this tool retain their original license. This tool does not change the licensing of your parametric models.

If your model is licensed under a permissive license (MIT, Apache-2.0, CC0, etc.), the generated web app can be distributed freely (subject to OpenSCAD GPL compliance).

If your model is licensed under GPL or a similar copyleft license, the generated web app may have additional distribution requirements beyond OpenSCAD's.

---

## Trademarks / No Affiliation

Any third-party product names, company names, or logos mentioned in this repository (including in historical references) are the property of their respective owners.

- Such mentions are for **identification/informational purposes only**.
- This project is **not affiliated with, sponsored by, or endorsed by** any third parties unless explicitly stated.
- Do **not** use third-party logos or branding in this project without permission.

---

## Rendering Techniques & References

### Shape-Vector Character Rendering

Certain rendering techniques in this project were inspired by research and educational articles on advanced character-based rendering approaches.

**Reference**: Alex Harri, character-based rendering technique article  
**URL**: https://alexharri.com/blog/ascii-rendering  
**Usage**: Educational reference for technique concepts  
**Note**: Implementation is original/clean-room; no code was copied

### ASCII City Walk — street content references

The hidden ASCII City Walk game's street furniture (trees, parked cars, and
the later street-life props) follows placement conventions demonstrated by two
open-source procedural-city projects, and takes its overall look from a third
project that is not open source. All three were references only: our
implementation is original, and no code from any of them is included.

**ludthor/ascii-city**  
**License**: MIT  
**Source**: https://github.com/ludthor/ascii-city  
**Usage**: Reference for first-person ASCII city content — park trees, parked
cars, and the rules that decide where street props belong

**PixelCity (Shamus Young)**  
**License**: GPL-3.0  
**Source**: https://github.com/skarkkai/pixelcity  
**Usage**: Reference for the procedural night-city content playbook — the
catalog of small lifelike details a generated downtown needs, and the density
and spacing conventions behind them. Also, from its texture generator, two
ideas this project reimplemented: the set of window-bay kinds a facade can be
glazed with (filled pane, vertical slot, side-by-side pair, blinds, stripes,
wide light, four-pane cross, narrow punched, horizontal band), and the
lit-window algorithm — lighting windows in consecutive RUNS whose length and
density are re-rolled every few floors, rather than rolling each window
independently, so night windows read as offices working late instead of as
noise. Described, then written from scratch in JavaScript against a canvas;
no code was copied, and both projects are GPL-3

**"A Walkable ASCII Cyberpunk City in One HTML File" (Grow Now! Games)**  
**License**: none — closed source, credited by courtesy  
**Source**: https://www.youtube.com/watch?v=3YtygAx_C6A  
**Also**: https://youtu.be/UCKEDWowc0o (later update video)  
**Usage**: The concept that prompted this work. Its published videos and
screenshots were studied for feel — the fine glyph grid, the green tree band
at street level, the small coloured accents along the curb. No source code was
available, none was sought, and no code or asset from it is included.
Everything here is a clean-room reimplementation of ideas explained publicly
in those videos

### Three.js Examples Modules (MIT)

This project uses modules from the Three.js examples collection (e.g., controls and loaders).

**License**: MIT (covered by the Three.js license above)  
**Source**: https://github.com/mrdoob/three.js/tree/dev/examples

---

## Cursors (GPL-3.0-or-later)

The Alt View's cursors, `public/icons/cursor-mono.svg`,
`cursor-mono-pointer.svg`, `cursor-mono-amber.svg`,
`cursor-mono-amber-pointer.svg`, `cursor-dos.svg` and
`cursor-dos-pointer.svg`, are adapted from the Retrosmart X11 Cursors by
mdomlop (https://github.com/mdomlop/retrosmart-x11-cursors), GPL-3.0.

- **Changes**: redrawn as SVG rectangles, the colors changed to each look's
  own (green #00ff00, amber #ffb000, the DOS yellow #ffff55) with the black
  outline kept.

## Switch Sounds (CC0-1.0)

Three short sounds play when the Alt View switches on, changes its look or
switches off: `public/sounds/crt-on.wav`, `crt-look.wav` and `crt-off.wav`.
Each is cut and mixed from recordings on Freesound, every one released under
Creative Commons 0 by its author:

- "CRT TV Hum" by X3SB: https://freesound.org/s/818513/
- "monitor computer CRT on, off" by kyles: https://freesound.org/s/454090/
- "rotary switch on and off" by ProdMultimediasHQI: https://freesound.org/s/512502/
- "CRT computer monitor startup" by corkob: https://freesound.org/s/415594/
- "Apple iMac G3 Screen Turn Off" by loganzsound: https://freesound.org/s/873733/
- "CRT monitor power on with 15.6kHz Hf Noise" by dav0r: https://freesound.org/s/382312/

**License**: CC0 1.0 Universal (public domain dedication)  
**Dedication**: https://creativecommons.org/publicdomain/zero/1.0/  
**Note**: Trimmed, joined with short crossfades, one part filtered and
pitched, and resampled to 32 kHz mono. CC0 asks for no credit; these are
given with thanks.

---

## Key Sounds (GPL-2.0-or-later, CC0-1.0)

While the Alt View is on, every button press sounds a key of the button's
size. Two sets of recordings, under `public/sounds/keys/`:

### bucklespring (GPL-2.0-or-later)

The green and amber looks use the keys of an IBM Model M keyboard as sampled,
key by key, by Ico Doornekamp for bucklespring, a program that plays that
keyboard's sound while you type: https://github.com/zevv/bucklespring. The
files `p1a` to `p7a` (`-down` the press, `-up` the release) are the keys K, L,
C, S, D, B, Tab, Left Alt, Left Ctrl, Caps Lock, Backspace, Enter, Right Shift
and Space, each cut to 160 ms with a short fade and resampled to 32 kHz mono;
each press levelled to the others of its size, each release set a little
under its press, and any silence before a press trimmed.

- **Author**: Ico Doornekamp
- **Source**: https://github.com/zevv/bucklespring (the `wav/` files)
- **License**: GNU General Public License version 2 or later, as the Debian
  package records it. The files are distributed here under version 3 of the
  license, this project's own (see `LICENSE`), as the "or later" term allows.

### Retro Terminal keys (CC0-1.0)

The blue DOS look uses two recordings by G.M_Isaac on Freesound, each
released under Creative Commons 0: "Retro Keyboard Keystroke"
(https://freesound.org/s/860241/, the small key, `d1.wav`) and "Retro Enter
Key" (https://freesound.org/s/860239/, the wide key, `d2.wav`), their leading
silence cut and the pair resampled to 32 kHz mono, the wide key's top end
softened.

- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: CC0 asks for no credit; it is given with thanks.

---

## Dial Clicks (CC-BY-3.0, CC-BY-4.0)

While the Alt View is on, a slider clicks once per step as it is dragged,
like a dial. Each look has one click, cut from a recording on Freesound and
rendered at seven speeds into the files under `public/sounds/dials/`
(`p1.wav` to `p7.wav` and `d1.wav` to `d7.wav`, 1 the lowest tone):

### Clicky Knob Turning (CC-BY-3.0)

The green and amber looks use one click of "Clicky Knob Turning.wav" by
shewbox: https://freesound.org/s/30827/

- **Author**: shewbox
- **License**: Creative Commons Attribution 3.0 Unported,
  https://creativecommons.org/licenses/by/3.0/
- **Changes**: one click of the recording cut out (120 ms, with short fades),
  played at seven speeds from 0.6 to 1.6, resampled to 32 kHz mono, levelled.

### 4-position-rotating-switch (CC-BY-4.0)

The blue DOS look uses one click of "4-position-rotating-switch.flac" by
copyc4t: https://freesound.org/s/275958/

- **Author**: copyc4t
- **License**: Creative Commons Attribution 4.0 International,
  https://creativecommons.org/licenses/by/4.0/
- **Changes**: one click of the recording cut out (75 ms, with short fades),
  played at seven speeds from 0.6 to 1.6, resampled to 32 kHz mono, levelled,
  its DC offset removed and its top end softened.

---

## View Ticks (CC-BY-3.0, CC-BY-4.0, CC0-1.0)

While the Alt View is on, turning, tilting, zooming or panning the 3D view by
hand ticks quietly, one sound for each, under `public/sounds/camera/`. Each is
one event cut from a recording on Freesound, resampled to 32 kHz mono and
levelled:

### High speed linear module (CC-BY-4.0)

The pan's three parts, `pan.wav` (the motor's run-up), `pan-run.wav` (its
run, a loop) and `pan-stop.wav` (its wind-down), are cut from "High speed
linear module steppermotor servo sound" by Artninja:
https://freesound.org/s/705184/

- **Author**: Artninja
- **License**: Creative Commons Attribution 4.0 International,
  https://creativecommons.org/licenses/by/4.0/
- **Changes**: three stretches of one move cut out (the first 120 ms with
  short fades; 700 ms of the steady run, its end crossfaded into its start
  so it loops; 420 ms from the run through the deceleration to silence),
  the top end softened, resampled to 32 kHz mono, levelled.

### declicking aperture (CC-BY-3.0)

The zoom's tick, `zoom.wav`, is "declicking aperture.wav" by caseymoura:
https://freesound.org/s/445483/

- **Author**: caseymoura
- **License**: Creative Commons Attribution 3.0 Unported,
  https://creativecommons.org/licenses/by/3.0/
- **Changes**: the click cut out (18 ms, with short fades), resampled to
  32 kHz mono, levelled; its upper part made to die away sooner and its top
  end softened.

### Ratchet and turnstile (CC0-1.0)

The tilt's tick, `tilt.wav`, is cut from "Single_Ratchet-05.wav" by CallFlan
(https://freesound.org/s/495238/), and the turn's, `turn.wav`, from the
turnstile in "Subway, card swipe, double beep and turnstile.wav" by
SpliceSound (https://freesound.org/s/369875/), each released under Creative
Commons 0. Each tick's upper part dies away sooner and its top end is
softened.

- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: CC0 asks for no credit; it is given with thanks.

---

## Drawer Sounds (CC0-1.0, CC-BY-4.0)

While the Alt View is on, a drawer opening is heard as its latch letting go,
its glide out on its rollers and the thump of its stop, and a drawer
shutting as its latch gripped open, the glide, the muffled thump of the
closed stop and the latch released, under `public/sounds/drawers/`. Each
part is cut from a recording on Freesound at its own speed and pitch,
levelled, at 48 kHz mono.

### Latch, glide and stops (CC0-1.0)

- The latch letting go (`latch-open.wav`): from "briefcase latch open close
  click.wav" by rsellick, https://freesound.org/s/545521/
- The glides and the stops (`slide-open.wav`, `slide-close.wav`,
  `stop-open.wav`, `stop-close.wav`): from "Drawyer Sounds (SE499) (High
  Quality)" by MPooman, https://freesound.org/s/673103/; each glide's level
  evened out and then shaped to the drawer's speed on screen, the closed
  stop muffled by a low-pass filter

Each is released under Creative Commons 0.

- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: CC0 asks for no credit; it is given with thanks.

### Door-Handle-Open-01 and Door-Handle-Close-01 (CC-BY-4.0)

The latch gripped open, `grip-close.wav`, is cut from "Door-Handle-Open-01.wav"
(https://freesound.org/s/151577/), and the latch released,
`latch-close.wav`, from "Door-Handle-Close-01.wav"
(https://freesound.org/s/151576/), both by DWOBoyle.

- **Author**: DWOBoyle
- **License**: Creative Commons Attribution 4.0 International,
  https://creativecommons.org/licenses/by/4.0/
- **Changes**: each cut (285 and 300 ms, with short fades), resampled to
  48 kHz, levelled.

---

## Switch, Selector and Latch Sounds (CC-BY-3.0, CC0-1.0)

While the Alt View is on, a checkbox or a switch flips a lever up for on
and down for off, a radio button snaps as it is chosen, a list clicks as it
opens and as a choice is made, and a menu or a dialog latches open and shut,
under `public/sounds/switches/`. Each is one event cut from a recording on
Freesound and levelled, the lever's at 48 kHz mono, the others resampled to
32 kHz mono:

### SMALL SIZE TOGGLE SWITCH (CC-BY-3.0)

The radio button's snap, `snap-on.wav`, is one click of "SMALL SIZE
TOGGLE SWITCH.wav" by StevenBrown: https://freesound.org/s/128437/

- **Author**: StevenBrown
- **License**: Creative Commons Attribution 3.0 Unported,
  https://creativecommons.org/licenses/by/3.0/
- **Changes**: the click cut out (42 ms, with short fades), resampled to
  32 kHz mono, levelled, its top end softened.

### Radio switch and latches (CC0-1.0)

The selector's clicks, `select-open.wav` and `select-choose.wav`, are two
clicks of "Old radio switch.wav" by eneibol
(https://freesound.org/s/369964/), and the latches, `latch-open.wav` and
`latch-close.wav`, are cut from "Latch_03.wav" and "Latch_01.wav" by Q.K.
(https://freesound.org/s/56245/, https://freesound.org/s/56243/), each
released under Creative Commons 0.

- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: CC0 asks for no credit; it is given with thanks.

### Heavy metal light switch (CC0-1.0)

The lever, `lever-on-1.wav` and `lever-on-2.wav` (flipped up) and
`lever-off-1.wav` and `lever-off-2.wav` (flipped down), are four flips of
"Heavy metal light switch, flipping.wav" by SpliceSound
(https://freesound.org/s/188194/), released under Creative Commons 0, each
cut out, its ring shortened and its top end softened.

- **Dedication**: https://creativecommons.org/publicdomain/zero/1.0/
- **Note**: CC0 asks for no credit; it is given with thanks.

---

## Scroll Ticks (CC-BY-4.0)

While the Alt View is on, a list scrolled by hand ticks a line at a time,
as paper turns through a typewriter, under `public/sounds/scroll/`.

### typewriter_manual_platen_01 (CC-BY-4.0)

The ticks, `platen-1.wav` to `platen-4.wav`, are four clicks of a manual
typewriter's platen turning, from "typewriter_manual_platen_01.wav" by
magedu: https://freesound.org/s/277300/

- **Author**: magedu
- **License**: Creative Commons Attribution 4.0 International,
  https://creativecommons.org/licenses/by/4.0/
- **Changes**: four clicks cut out (55 ms each, with short fades), their
  upper part made to die away sooner and their top end softened, levelled,
  at 48 kHz mono; the end of a list, `platen-end.wav`, is the first click
  played 700 cents lower through a low-pass filter.

---

## Crack Sound (CC0-1.0)

A short sound the Alt View's key makes, `public/sounds/moments/crack.wav`,
from "loud crack" by cairhien: https://freesound.org/s/865450/

**License**: CC0 1.0 Universal (public domain dedication)  
**Dedication**: https://creativecommons.org/publicdomain/zero/1.0/  
**Note**: One crack cut out, made mono and levelled, resampled to 11,025 Hz
and quantized to 8 bits for a retro sound, then resampled to 32 kHz mono.
CC0 asks for no credit; it is given with thanks.

---

## Iosevka Term (OFL-1.1)

The mono UI variant self-hosts the Iosevka Term Regular WOFF2 font.

**License**: SIL Open Font License 1.1  
**Author**: Belleve Invis  
**Project**: https://github.com/be5invis/Iosevka  
**Version**: v34.2.1  
**Vendored Location**: `public/fonts/iosevka-term-regular.woff2`

### SIL Open Font License 1.1

```
Copyright 2015-2024 The Iosevka Project Authors (https://github.com/be5invis/Iosevka)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

---

## Questions?

For licensing questions about:
- **This tool** → See [LICENSE](LICENSE) (GPL-3.0-or-later)
- **OpenSCAD** → See https://openscad.org/about.html
- **Your models** → Consult your own licensing terms
