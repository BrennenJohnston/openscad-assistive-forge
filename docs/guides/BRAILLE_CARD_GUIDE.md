# Braille Card Customizer Guide

Type text, get 3D-printable braille. Translation to Unicode braille runs entirely on your device (no server involved), and every model is designed to read directly off the printer — no post-processing.

The Braille Card Customizer is a family of three tools that share the same translation panel:

- **Braille Card** (`?example=braille-wedge-card`) — a leaning card with break-away supports; the original tool, best for business cards, labels, and multi-line text.
- **Braille Charm** (`?example=braille-charm`) — a small pendant, keychain charm, or zipper pull carrying one or two braille cells.
- **Braille Sign** (`?example=braille-sign`) — a two-part tactile sign: raised uppercase letters on one plate, the same text in braille on a second plate, with ADA-703-style defaults.

## What the card makes

A flat card that prints leaning back at 75 degrees, the angle CHI 2024 research found fastest and most comfortable to read (near-vertical printing moves layer seams off the finger-contact surface). A row of break-away support fins stands behind the card so the whole thing prints support-free as one fused STL. After printing, snap the fins off and the card is ready.

Good uses:

- Braille business cards and contact cards
- Tactile labels, name tags, and signage inserts
- Short messages, gift tags, flash cards

## Opening the customizer

- Welcome screen: **Braille Card Customizer** card → pick a tool from the Tool dropdown (Braille Sign is preselected; Braille Card and Braille Charm are the other options) → Open
- Direct links: `?example=braille-wedge-card`, `?example=braille-charm`, `?example=braille-sign`

## Using the translation panel

The **Braille translation** panel sits above the regular parameter controls:

1. **Text to translate** — type or paste plain text. Each new line starts a new braille line; long lines wrap automatically at word boundaries. (On the sign, the raised letters and the braille wrap independently — see Braille Sign below.)
2. **Language and grade** — English UEB Grade 1 (uncontracted) is the default for cards and charms and the right choice for names, emails, and short contact details. Grade 2 (contracted) saves space but assumes fluent braille readers; it is the default for signs (matching ADA guidance). US (EBAE) tables are also available.
3. **Preserve capital letters** — **on by default**, so the braille matches your text exactly. Every capital adds an indicator cell (1 extra cell per capital); turn it off to convert text to lowercase and save space (standard practice for space-limited labels and business cards). A warning appears when capitals were dropped.
4. **Card size** — **Auto-size to fit text** is the default: the card grows to fit the braille plus margin. The other options are fixed presets that set the width/height parameters directly: Default card 200 × 100 mm, Business card 89 × 51, Postcard 152 × 102, Greeting card 178 × 127 (5 × 7 in), A5 210 × 148, A4 297 × 210, US Letter 279 × 216. Picking a preset turns auto-sizing off; editing the width/height parameters directly flips the selector to Custom. Sizes larger than ~250 mm warn about common print-bed limits.
5. **Layout options** — margin presets (Narrow 6 mm default, Standard 12.7 mm, Wide 25.4 mm, or custom), auto-wrap on/off, overflow splitting on/off, and max rows per card (default 8, matching the default 200 × 100 card).
6. **Braille preview** — the translated braille with per-line cell counts against the computed line capacity, and the print-language source text under each braille line so you can verify the translation line by line.
7. **Errors and warnings** — problems are split into two tiers, each marked with a text prefix and an icon (never color alone). **Errors** mean content will not fit or was cut (line overflow, too many rows, an undividable over-long word); **warnings** are informational (capitals dropped, untranslatable characters, oversized for common print beds).
8. **Multi-card notice and pager** — when text overflows one card, a prominent notice reports "Your text spans N cards" and the pager switches between them; each card renders and exports as its own STL (suggested names like `braille-card-1-of-2.stl`).
9. **Render all cards in one file** — a toggle in the multi-card notice. When on, every wrapped line is written to the model at once and the SCAD lays the cards out front-to-back on the bed, separated by the `card_gap_mm` parameter (default 5 mm), so the whole set prints in one job (suggested name `braille-cards-all.stl`). Large sets can exceed your print bed — the console reports the total depth.

The raw `Line_1`–`Line_20` parameters stay visible in the parameter panel below, so you can still paste pre-translated Unicode braille manually (the original wedge-card workflow).

## What to put on a card (BANA guidance)

The Braille Authority of North America's business-card guidance boils down to one question: **"Can someone identify me and contact me with just this information?"**

Typical US/Canada card stock fits about **4 lines of 13–14 cells** — far less than the print side of a card. Expect to cut most of it. A typical four-line layout:

1. Name
2. Organization or company
3. Phone
4. E-mail

If the name will not fit: remove the capital indicators first (turn off Preserve capital letters), then drop a middle initial, then use a first initial — or continue the name onto a second line starting in cell 1. If the organization name is too long, it can be omitted (especially when the e-mail or web address contains it) or abbreviated ("lib" for "library", "amer" for "American").

## Card size and capacity

The card **auto-sizes to fit the text plus margin by default** (`auto_size_card` On, 1 mm thick), so short labels come out as small cards instead of a mostly empty 200 × 100 mm face. Pick a fixed preset (like Business card) for classic card stock — that turns auto-sizing off and the manual 200 × 100 mm capacity math (26 cells per line, 8 rows with the default margin) governs when text overflows.

The dot geometry defaults are ADA-friendly (rounded dots, total height ≤ 0.9 mm) and BANA-standard spacing (2.5 mm dot pitch, 7 mm cell pitch, 10 mm line pitch). They are adjustable under the Expert Mode groups.

Note that the A4 and US Letter presets are larger than most consumer print beds (~220–256 mm); the panel warns but does not block — check your printer's build area.

## Braille Charm

A charm face fits **one or two braille cells** — usually one letter (a capital indicator shares the face, so "A" with Preserve capitals on uses both cells) or one short Grade 2 contraction.

**Each character becomes its own charm.** Type a word like "Brennen" and the panel makes seven charms, one per letter, each translated individually (whitespace is skipped). A notice reports the count, and the **Generate all charms** toggle — on by default — renders every charm in one model, laid out side by side and separated by the `charm_gap_mm` parameter (default 5 mm). Turn the toggle off to page through the charms with Previous/Next buttons ("Charm 2 of 7 — r") and render/download each one separately. Up to 12 charms fit in one file (`Charm_1`–`Charm_12` in the parameter panel); longer words can still be paged through one at a time. The raw `braille_chars` parameter stays visible, so advanced users can paste multi-cell Unicode braille for a single charm as before.

Charm downloads get **friendly file names**: `Braille Charm B.stl` for a single charm (the character as you typed it) and `Braille Charms Brennen.stl` when generating all charms in one file.

Every shape exports **already oriented for printing** — no rotating in the slicer.

- **Bracelet clip (the default shape)** (`charm_shape = bracelet_clip`): a C-shaped clip for silicone bracelets, adapted from the Charm Customizer's Bracelet Clip Charm. It always prints **standing vertically** — the C profile lies on the bed (a "C" seen from above) and the braille sits on the vertical outer wall, so the dots print crisply with **no support fin at all**. Because a worn clip hangs sideways on the band, the braille is **rotated 90°** on the face (flip `clip_braille_rotation` to −90 for the opposite clip-on direction) and stays centered unless you nudge it with the left/right and up/down offsets. Channel length, clip height, profile depth, wall thickness, gap width/offset, and the full q-charm rounding set (outer/inner corners, edge radius, and a rounded top rim — the bottom rim stays flat for bed adhesion) are adjustable under the Bracelet Clip group; `print_orientation`, border, and attachment are ignored for this shape. **Large Charm** and **Small Charm** presets matching the original Bracelet Clip Charm sizes load with the example — pick them from the preset dropdown.
- **Pendant shapes**: circle, square, rounded rectangle, hexagon, oval; adjustable width/height/thickness and corner radius plus an optional raised border.
- **Attachment**: keychain hole (default), bail loop, or none (pendant shapes only — the bracelet clip is its own attachment).
- **Print orientation** (pendant shapes): **Angled** (default) — the charm leans back at 75° with a central break-away support fin, snap-off bridges, and a built-in brim, for the crispest dots (same research-backed technique as the card, but slimmer). The fin uses at least 3 bridges and automatically adds about one more per 10 mm of height for taller charms. The leaning bottom edge is trimmed flat against the bed (`bed_contact_mm`, default 2 mm) so the first layer is a wide contact strip rather than a knife edge. Flat mode (dots up) is still available. A bail loop prints poorly in Angled mode; use the keychain hole.
- The panel warns when any single charm's character translates to more than 2 cells, and when a word needs more than the 12 charm slots one file can hold.

## Braille Sign

A two-part sign following the **2010 ADA Standards (section 703)** recommendations:

- **Letter plate** (top): raised uppercase characters (Liberation Sans, sans-serif), 16 mm character height (703.2.5 minimum is 5/8 in ≈ 15.9 mm), raised 0.8 mm (703.2.1: 1/32 in), 135% line spacing (703.2.8). Prints flat, letters up. Lowercase input is converted to uppercase by default (`force_uppercase`).
- **Braille plate** (bottom): the same text in braille. Grade 2 (contracted) is the default table, per ADA 703.3. Prints **Angled** by default — leaning back at 75° with break-away support fins for the best dot quality, like the wedge card — or Flat. The letter plate always prints flat.
- **Split raised border**: the letter plate carries the top + side border segments and the braille plate the bottom + sides, so the mounted pair forms one continuous tactile frame.
- `sign_part` renders **Both** plates side by side on the bed (default), or each plate alone.
- Up to **6 rows** of each script, wrapped **independently**: long lines wrap onto new rows of raised letters automatically, and the braille reflows into its own rows to fill the sign width. Because 16 mm raised letters hold far fewer characters per row than 7 mm braille cells, the braille usually packs into fewer, fuller rows. Line breaks you type are kept as hard breaks in both scripts.
- Independent wrapping is permitted by **ADA 703.3.2**, which places braille as one block below the entire text without requiring its line breaks to mirror the print rows. The preview lists the braille rows (with the words each row contains underneath) plus a summary of how many rows each plate uses.
- **Auto-fit** (`auto_fit`, on by default): the sign grows to fit its content — plates get taller as rows are added, and wider if a single word needs more room than the set width. Turn it off to pin the exact size (overflowing content then triggers console warnings instead).

### Making a sign, step by step

1. Open the sign tool (welcome screen → Braille Card Customizer → Open — **Braille Sign** is the preselected tool — or `?example=braille-sign`).
2. Type the sign text into **Text to translate** — one line per message line (for example `Conference Room` then `101`). Long lines wrap onto new rows by themselves.
3. Check the **Braille preview**: each braille row shows the words it contains underneath, the row summary reports how many rows each plate uses, and any fit problems appear as errors or warnings.
4. Adjust parameters if needed (character height, sign width, border, print orientation) — with auto-fit on, the sign resizes to whatever you enter.
5. Render and export. `sign_part` defaults to **Both**, so one STL holds the letter plate and the braille plate side by side; print it as modeled, no slicer supports.
6. After printing, snap the support fins off the back of the braille plate (Angled mode). Mount the plates with the letters above the braille so the split border joins into one frame, keeping the braille at least 9.5 mm (3/8 in) below the raised text.

> **ADA disclaimer:** the defaults follow the published 703 figures, but this tool does **not** guarantee compliance. Real signage has requirements the generator does not model — mounting height and location, visual contrast, glare, character width ratios, and the braille position at least 9.5 mm (3/8 in) below the raised text zone (mount the braille plate accordingly). Verify against the standard before installing.

## Print settings

From the upstream wedge-card project's testing:

- **Print as modeled.** The card leans back and the fins stand behind it on the bed. No slicer supports; a slicer brim is optional (a brim is already modeled under each fin).
- **0.1 mm layer height** gives noticeably smoother, more readable dots. PLA and PETG both work.
- **Slow the outer wall** (≤ 30–40 mm/s) and keep acceleration modest; input shaping helps.
- **Bridge contact tuning:** `bridge_contact_mm` (default 0.3) controls how firmly the break-away bridges grip the card. 0.3–0.4 mm connects reliably and snaps off clean. Increase it if fins detach mid-print; decrease if they are hard to remove.
- **After printing:** flex or snip the fins off the back and deburr the small nubs left by the bridges.
- Do **not** cut lightening holes in the fins — the extra motion/vibration hurts a thin leaning part more than the saved filament helps.

For preview speed in the browser, `render_quality` defaults to Medium; switch to High before the final export if you want maximum dome smoothness.

## Keyboard and screen reader notes

- Every panel control is a native input with a visible label; the whole panel is a labeled region ("Braille translation").
- The braille preview is a polite live region: it re-reads after you stop typing, without interrupting.
- Fit **errors** use an alert region (announced immediately); informational **warnings** and the multi-card notice use status regions (announced politely).
- The card pager is two ordinary buttons plus a live status ("Card 1 of 2"); disabled states mark the ends.
- All states render correctly in high-contrast and Windows forced-colors modes; severity is never conveyed by color alone.

## Privacy

Translation runs in a Web Worker on your device using liblouis compiled to WebAssembly. The text you type never leaves your browser.

## Licensing and attribution

- Braille translation is powered by [liblouis](https://liblouis.io/), the open-source braille translator (LGPL-2.1-or-later; its JavaScript bindings are GPL-3.0; individual translation tables carry their own headers). The engine and tables are copied from the `liblouis` npm packages at build time by `scripts/setup-liblouis.js`, which also writes a `NOTICE.txt` alongside the deployed assets.
- All three examples are adapted from Brennen Johnston's standalone desktop
  generators (© 2024–2026). Each was originally published under PolyForm
  Noncommercial 1.0.0 and **relicensed by the copyright holder to
  GPL-3.0-or-later** for the OpenSCAD Assistive Forge (2026); each SCAD header
  records the relicense. Upstream repos:
  [braille-wedge-card-openscad](https://github.com/BrennenJohnston/braille-wedge-card-openscad),
  [braille-sign-openscad](https://github.com/BrennenJohnston/braille-sign-openscad),
  [braille-charm-openscad](https://github.com/BrennenJohnston/braille-charm-openscad).
- The **Braille Charm** (GPL-3.0-or-later) combines the charm base from Nasif's Charm Maker (concept by Nasif Zaman, CC0) with the wedge card's braille dot system; its bracelet clip shape is adapted from the Charm Customizer's Bracelet Clip Charm (CC0), whose design direction came from Duy Do's AAC bracelet charms (UW WOOF3D).
- The **Braille Sign** (GPL-3.0-or-later) uses the wedge card's braille dot system and renders raised characters with the Liberation Sans font (SIL OFL).
- Key references: [BANA size and spacing](https://brailleauthority.org/size-and-spacing-braille-characters), the CHI 2024 study on [3D-printed braille orientation](https://doi.org/10.1145/3613904.3642719), and the [2010 ADA Standards](https://archive.ada.gov/) section 703.
