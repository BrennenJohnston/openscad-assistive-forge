# Braille Card Customizer Guide

Type text, get a 3D-printable braille card. Translation to Unicode braille runs entirely on your device (no server involved), and the card is designed to read directly off the printer — no post-processing.

## What it makes

A flat card that prints leaning back at 75 degrees, the angle CHI 2024 research found fastest and most comfortable to read (near-vertical printing moves layer seams off the finger-contact surface). A row of break-away support fins stands behind the card so the whole thing prints support-free as one fused STL. After printing, snap the fins off and the card is ready.

Good uses:

- Braille business cards and contact cards
- Tactile labels, name tags, and signage inserts
- Short messages, gift tags, flash cards

## Opening the customizer

- Welcome screen: **Braille Card Customizer** card → Open Braille Card Customizer
- Direct link: `?example=braille-wedge-card`

## Using the translation panel

The **Braille translation** panel sits above the regular parameter controls:

1. **Text to translate** — type or paste plain text. Each new line starts a new braille line; long lines wrap automatically at word boundaries.
2. **Language and grade** — English UEB Grade 1 (uncontracted) is the default and the right choice for names, emails, and short contact details. Grade 2 (contracted) saves space but assumes fluent braille readers; use it only when space is limited. US (EBAE) tables are also available.
3. **Preserve capital letters** — off by default. Every capital adds an indicator cell (1 extra cell per capital). Leaving this off converts text to lowercase, which is standard practice for space-limited applications like labels and business cards.
4. **Layout options** — margin presets (Narrow 6 mm default, Standard 12.7 mm, Wide 25.4 mm, or custom), auto-wrap on/off, overflow splitting on/off, and max rows per card (default 5).
5. **Braille preview** — the translated braille with per-line cell counts against the computed line capacity.
6. **Card pager** — when text overflows one card, it splits into "Card 1 of N". Switch cards with the Previous/Next buttons; each card renders and exports as its own STL (suggested names like `braille-card-1-of-2.stl`).

The raw `Line_1`–`Line_20` parameters stay visible in the parameter panel below, so you can still paste pre-translated Unicode braille manually (the original wedge-card workflow).

Warnings appear for: characters that cannot be translated, capitals present while preserve-caps is off, a single word longer than one line (the tool divides emails/URLs after `@ . - / :` per BANA guidance), and overflow beyond the available rows.

## What to put on a card (BANA guidance)

The Braille Authority of North America's business-card guidance boils down to one question: **"Can someone identify me and contact me with just this information?"**

Typical US/Canada card stock fits about **4 lines of 13–14 cells** — far less than the print side of a card. Expect to cut most of it. A typical four-line layout:

1. Name
2. Organization or company
3. Phone
4. E-mail

If the name will not fit: remove the capital indicators first, then drop a middle initial, then use a first initial — or continue the name onto a second line starting in cell 1. If the organization name is too long, it can be omitted (especially when the e-mail or web address contains it) or abbreviated ("lib" for "library", "amer" for "American").

This tool defaults to uncontracted UEB and lowercase output to match that guidance.

## Card size and capacity

By default the card **auto-sizes**: it grows to fit your braille plus the margin, and the panel wraps text to fit the manual width/height targets (85 × 55 mm out of the box). Turn `auto_size_card` Off in the Card Size group to drive exact dimensions with the sliders instead — the panel recomputes wrap capacity from whatever you set.

The dot geometry defaults are ADA-friendly (rounded dots, total height ≤ 0.9 mm) and BANA-standard spacing (2.5 mm dot pitch, 7 mm cell pitch, 10 mm line pitch). They are adjustable under the Expert Mode groups.

## Print settings

From the upstream wedge-card project's testing:

- **Print as modeled.** The card leans back and the fins stand behind it on the bed. No slicer supports; a slicer brim is optional (a brim is already modeled under each fin).
- **0.1 mm layer height** gives noticeably smoother, more readable dots. PLA and PETG both work.
- **Slow the outer wall** (≤ 30–40 mm/s) and keep acceleration modest; input shaping helps.
- **Bridge contact tuning:** `bridge_contact_mm` (default 0.3) controls how firmly the break-away bridges grip the card. 0.3–0.4 mm connects reliably and snaps off clean. Increase it if fins detach mid-print; decrease if they are hard to remove.
- **After printing:** flex or snip the fins off the back and deburr the small nubs left by the bridges.
- Do **not** cut lightening holes in the fins — the extra motion/vibration hurts a thin leaning part more than the saved filament helps.

For preview speed in the browser, `render_quality` defaults to Medium; switch to High before the final export if you want maximum dome smoothness.

## Privacy

Translation runs in a Web Worker on your device using liblouis compiled to WebAssembly. The text you type never leaves your browser.

## Licensing and attribution

- Braille translation is powered by [liblouis](https://liblouis.io/), the open-source braille translator (LGPL-2.1-or-later; its JavaScript bindings are GPL-3.0; individual translation tables carry their own headers). The engine and tables are copied from the `liblouis` npm packages at build time by `scripts/setup-liblouis.js`, which also writes a `NOTICE.txt` alongside the deployed assets.
- The card geometry is adapted from the [Braille Wedge Card STL Generator](https://github.com/BrennenJohnston/braille-wedge-card-openscad) (PolyForm Noncommercial 1.0.0, © 2024–2025 Brennen Johnston). The adapted SCAD keeps its license header.
- Key references: [BANA size and spacing](https://brailleauthority.org/size-and-spacing-braille-characters), the CHI 2024 study on [3D-printed braille orientation](https://doi.org/10.1145/3613904.3642719), and the 2010 ADA Standards.
