# Braille Card Designer Guide

Type text, get 3D-printable braille. Translation to Unicode braille runs entirely on your device (no server involved), and every model is designed to read directly off the printer — no post-processing.

The Braille Card Designer is a family of three tools that share the same translation panel:

- **Braille Card** (`?example=braille-wedge-card`) — a leaning card with break-away supports; the original tool, best for business cards, labels, and multi-line text.
- **Braille Charm** (`?example=braille-charm`) — a small pendant, keychain charm, or zipper pull carrying one or two braille cells.
- **Braille Sign** (`?example=braille-sign`) — a two-part tactile sign: raised uppercase letters on one plate, the same text in braille on a second plate, built to the figures of ADA 703.

## What the card makes

A flat card that prints leaning back at 75 degrees. In CHI 2024 research, braille printed at 75 degrees or vertical was read faster than flat braille and rated more comfortable, and near-vertical printing also moves layer seams off the finger-contact surface. A row of break-away support fins stands behind the card so the whole thing prints support-free as one fused STL. After printing, snap the fins off and the card is ready.

Good uses:

- Braille business cards and contact cards
- Tactile labels, name tags, and signage inserts
- Short messages, gift tags, flash cards

## Opening the customizer

- Welcome screen: **Braille Card Designer** card → pick a tool from the Tool dropdown (Braille Sign is preselected; Braille Card and Braille Charm are the other options) → Open
- Direct links: `?example=braille-wedge-card`, `?example=braille-charm`, `?example=braille-sign`

## Using the translation panel

The **Braille translation** panel sits above the regular parameter controls:

1. **Text to translate** — type or paste plain text. Each line you type is translated whole by liblouis and then divided into rows at its blank cells, so rules that span words (a capital passage, a divided address) come out the way Unified English Braille (UEB) writes them. Each new line starts a new braille line. (On the sign, the raised letters and the braille wrap independently; see Braille Sign below.)
2. **Language and grade** — English (UEB) Grade 2, contracted, or English (UEB) Grade 1, uncontracted. The card and the sign start on Grade 2: the Braille Authority of North America (BANA) uses contracted braille in its business card examples, and ADA 703.3 requires it on signs. The charm starts on Grade 1, since each charm holds a single character. English Braille American Edition (EBAE), the code the United States used before UEB, is not offered: BANA no longer accepts it for signage. If you need EBAE, paste it into the braille editor.
3. **Preserve capital letters** — **on by default on cards and charms**, so the braille matches your text exactly. Every capital adds an indicator cell; turn it off to convert text to lowercase and save space (standard practice for space-limited labels and business cards), and a warning says the capitals were dropped. **A sign has its own choice instead, Braille capitals.** ADA 703.3.1 gives sign braille a capital only before the first word of a sentence, names, single letters, initials and acronyms, and nothing else, whatever the print shows. The default, **ADA sign rule**, writes the braille in lowercase except a capital letter standing alone, such as the B in 3B. Software cannot tell a name or an acronym from an ordinary word, so for those choose **Exactly as typed** and type capitals only on those words; every capital you type is then written with UEB's capital signs. The raised letters are uppercase either way.
4. **Card size** — **Auto-size to fit text** is the default: the card grows to fit the braille plus margin. The other options are fixed presets that set the width/height parameters directly: Default card 200 × 100 mm, Business card 89 × 51, Postcard 152 × 102, Greeting card 178 × 127 (5 × 7 in), A5 210 × 148, A4 297 × 210, US Letter 279 × 216. Picking a preset turns auto-sizing off; editing the width/height parameters directly flips the selector to Custom. Sizes larger than ~250 mm warn about common print-bed limits.
5. **Layout options** — margin presets (Narrow 6 mm default, Standard 12.7 mm, Wide 25.4 mm, or custom), auto-wrap on/off, overflow splitting on/off, and max rows per card (default 8, matching the default 200 × 100 card). When the card height cannot fit the requested max rows, the panel keeps your requested value, uses what fits, and explains the limit in a warning (it also announces the change to screen readers) — editing the raw `grid_rows` parameter directly updates Max rows per card the same way, so the two never fight silently.
6. **Braille editor (Unicode)** — a collapsible editor holding one line of Unicode braille per card row (per braille row on a sign, per charm on a charm). Press **Translate to braille** to fill it from your text, then change any cell. You can also paste braille, type it with six-key entry, or paste braille ASCII and press **Convert braille ASCII**; press **Translate to text** to read the braille back in English. **Whenever the editor has content the model uses it exactly as written** (no liblouis pass); clear it to go back to translating the text above. See "Editing braille by hand" below.
7. **Braille preview** — the translated braille with per-line cell counts against the computed line capacity, and the print-language source text under each braille line so you can verify the translation line by line.
8. **Errors and warnings** — problems are split into two tiers, each marked with a text prefix and an icon (never color alone). **Errors** mean content will not fit or was cut (line overflow, too many rows, an undividable over-long word, non-braille characters in the braille editor); **warnings** are informational (capitals dropped, characters with no braille left out, an address or a long number divided across rows, rows clamped by the card height, oversized for common print beds).
9. **Multi-card notice and pager** — when text overflows one card, a prominent notice reports "Your text spans N cards" and the pager switches between them; each card renders and exports as its own STL (named like `Braille Card 1 of 2 hello.stl`).
10. **Render all cards in one file** — a toggle in the multi-card notice. When on, every wrapped line is written to the model at once and the SCAD lays the cards out front-to-back on the bed, separated by the `card_gap_mm` parameter (default 5 mm), so the whole set prints in one job (named like `Braille Cards hello.stl`). Large sets can exceed your print bed — the console reports the total depth.

The raw `Line_1`–`Line_20` parameters stay visible in the parameter panel below, so you can still paste pre-translated Unicode braille manually (the original wedge-card workflow).

## Editing braille by hand

The **Braille editor (Unicode)** in all three tools holds braille characters (U+2800 to U+28FF, plus spaces, which become blank cells), one line per row (on a charm, one line per charm). You can also convert braille ASCII into it and type cells with six keys (both below). It has two states:

- **Pristine** — the editor mirrors a translation (after Translate to braille), so editing the English text clears it; nothing you typed is lost.
- **Hand-edited** — once you type or paste into the editor, it becomes the authority: the model embosses those cells exactly as written, the text box above is ignored for braille (a warning says so), and only the Translate to braille button may overwrite it. Every fill and clear is announced through the editor's status line.

Editor lines are validated against the line capacity, and overflow chunks onto additional cards exactly like translated text (the pager and Render-all-cards toggle work as usual). Non-braille characters produce a per-line error naming the offending character, and block the write entirely so the model keeps its previous, valid braille rather than embossing garbage cells.

**On a sign**, the editor drives the **braille plate only** — the raised letters keep wrapping from the text box. ADA 703 treats the two as separate plates, and correcting a contraction by hand should not silently rewrite the printed word above it. Braille beyond the sign's six rows is dropped with an error rather than truncated silently.

**On a charm**, each line of the editor that holds cells is one charm, used exactly as written; a line longer than a charm's two cells is named in an error. **Translate to braille** writes one line per character, and **Translate to text** puts the characters back into the characters box. While the editor has content, the notice says how many charms it makes ("The braille editor makes 3 charms, one per line.").

### Braille ASCII

Paste braille ASCII (from a BRF file, or braille typed as keyboard characters) into the editor and press **Convert braille ASCII**, which sits after the editor beside **Translate to text**. Letters may be in either case. The map is the North American Braille ASCII Code. If a character is not part of it, nothing is converted, the editor keeps what you pasted, and the error box names the character.

### Six-key entry

Check **Six-key entry**, which sits before the editor and is off by default, then type in the editor the way you would on a Perkins brailler: hold the keys of a cell together and let go. F, D and S are dots 1, 2 and 3; J, K and L are dots 4, 5 and 6. These are the physical home-row keys, so they are in the same places on any keyboard layout. A cell is made when its keys are let go, and Space alone makes a blank cell. Every other key, and any key with Ctrl, Alt or Meta, works as usual, so Tab still leaves the editor. A screen reader is told each cell's dots as it is made (for example "dots 1 2 5"), every cell, at once. Some keyboards cannot register several keys held at once.

### Divided addresses and long numbers

When an e-mail address, a web address or a long number does not fit on one row, it is divided, and each of its rows but the last ends with the line continuation sign (dot 5, `⠐`), as the UEB rules and BANA's card guidance ask. An address divides after `@ . - / : _`; a number divides after a period or a comma, never between digits. A word too long to hold the sign on every row is divided without it, BANA's last resort. Words joined by a slash, dates, and hyphenated words gain no sign. A note under the preview says when a word was divided. You will see this on cards; a sign's braille follows its raised letters, which are always wider, so the sign never needs to divide it.

### Phone numbers and UEB number signs

Under UEB, a period or comma inside a number keeps numeric mode active, but a **hyphen or parenthesis ends it** — so `206-543-4779` correctly needs three number signs (15 cells) and may wrap to a second row. That is correct liblouis output, not a bug. Type the BANA form `206.543.4779` instead and it fits 13 cells with a single number sign. To remove or adjust cells by hand, use the braille editor.

## Friendly download names

Exports from all three tools are named after their content instead of the hashed default (which is still the fallback when there is nothing to name):

- **Card**: `Braille Card hello.stl` (single card), `Braille Card 2 of 3 hello.stl` (paging), `Braille Cards hello.stl` (render-all). The word is the first word of your text; when braille pasted into the braille editor is the only input, it is **back-translated** on your device to recover a name.
- **Charm**: `Braille Charm B.stl` / `Braille Charms Brennen.stl` (as before).
- **Sign**: `Braille Sign Exit.stl`.

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

The card keeps its dots inside the ADA sign ranges, as the sign does: rounded dots about 0.68 mm high on a 1.6 mm base, 2.5 mm between dots in a cell, 7.0 mm between cells and 10.1 mm between lines by default. Each dot setting's slider, under the Expert Mode groups, covers only its range, and a value outside it stops the model with a message naming the rule. That is sign spacing, not the spacing of braille embossed on paper; [Braille sign standards](BRAILLE_STANDARDS.md#braille-cards-and-charms) compares the two.

Note that the A4 and US Letter presets are larger than most consumer print beds (~220–256 mm); the panel warns but does not block — check your printer's build area.

## Braille Charm

A charm face fits **one or two braille cells** — usually one letter (a capital indicator shares the face, so "A" with Preserve capitals on uses both cells) or one short Grade 2 contraction. The charm starts on uncontracted braille (Grade 1): in contracted braille (Grade 2) most letters standing alone take an extra cell, the grade 1 indicator, so most capital letters need three cells and no longer fit. Its dots keep to the same ADA ranges as the card's and the sign's, rounded only. To set a charm's cells by hand, open the **Braille editor (Unicode)**: one line per charm (see "Editing braille by hand").

**Each character becomes its own charm.** Type a word like "Brennen" and the panel makes seven charms, one per letter, each translated individually (whitespace is skipped). A notice reports the count, and the **Generate all charms** toggle — on by default — renders every charm in one model, laid out side by side and separated by the `charm_gap_mm` parameter (default 5 mm). Turn the toggle off to page through the charms with Previous/Next buttons ("Charm 2 of 7: r") and render/download each one separately; at the first and the last charm the button stays where it is and is marked unavailable. Up to 12 charms fit in one file (`Charm_1`–`Charm_12` in the parameter panel); longer words can still be paged through one at a time. The raw `braille_chars` parameter stays visible, so advanced users can paste multi-cell Unicode braille for a single charm as before.

Charm downloads get **friendly file names**: `Braille Charm B.stl` for a single charm (the character as you typed it) and `Braille Charms Brennen.stl` when generating all charms in one file.

Every shape exports **already oriented for printing** — no rotating in the slicer.

- **Bracelet clip (the default shape)** (`charm_shape = bracelet_clip`): a C-shaped clip for silicone bracelets, adapted from the Charm Designer's Bracelet Clip Charm. It always prints **standing vertically** — the C profile lies on the bed (a "C" seen from above) and the braille sits on the vertical outer wall, so the dots print crisply with **no support fin at all**. Because a worn clip hangs sideways on the band, the braille is **rotated 90°** on the face (flip `clip_braille_rotation` to −90 for the opposite clip-on direction) and stays centered unless you nudge it with the left/right and up/down offsets. Channel length, clip height, profile depth, wall thickness, gap width/offset, and the full q-charm rounding set (outer/inner corners, edge radius, and a rounded top rim — the bottom rim stays flat for bed adhesion) are adjustable under the Bracelet Clip group; `print_orientation`, border, and attachment are ignored for this shape. **Large Charm** and **Small Charm** presets matching the original Bracelet Clip Charm sizes load with the example — pick them from the preset dropdown.
- **Pendant shapes**: circle, square, rounded rectangle, hexagon, oval; adjustable width/height/thickness and corner radius plus an optional raised border.
- **Attachment**: keychain hole (default), bail loop, or none (pendant shapes only — the bracelet clip is its own attachment).
- **Print orientation** (pendant shapes): **Angled** (default) — the charm leans back at 75° with a central break-away support fin, snap-off bridges, and a built-in brim, for the crispest dots (same research-backed technique as the card, but slimmer). The fin uses at least 3 bridges and automatically adds about one more per 10 mm of height for taller charms. The leaning bottom edge is trimmed flat against the bed (`bed_contact_mm`, default 2 mm) so the first layer is a wide contact strip rather than a knife edge. Flat mode (dots up) is still available. A bail loop prints poorly in Angled mode; use the keychain hole.
- The panel warns when any single charm's character translates to more than 2 cells, and when a word needs more than the 12 charm slots one file can hold.

## Braille Sign

A two-part sign built to the figures of **section 703 of the 2010 ADA Standards**. [Braille sign standards](BRAILLE_STANDARDS.md) lists each figure, the rule behind it, the sign's measured value, and how the tool keeps to it.

- **Letter plate** (top): raised uppercase letters (Liberation Sans, sans-serif), 16 mm tall measured on the capital I, as ADA 703.2.5 measures them; raised 0.8 mm (703.2.1); spaced so that every pair of capitals and every pair of digits is 3.2 mm to four stroke widths apart (703.2.7); 135 % line spacing (703.2.8). Prints flat, letters up. Lowercase input is converted to uppercase by default (`force_uppercase`).
- **Braille plate** (bottom): the same text in contracted (Grade 2) braille, as ADA 703.3 requires, with capital signs only where ADA 703.3.1 allows them (see Braille capitals above), in rounded dots only (the flat-topped Cone shape is for cards and charms). Prints **Angled** by default (leaning back at 75° with break-away support fins for the best dot quality, like the wedge card) or Flat. The letter plate always prints flat.
- **Split raised border**: the letter plate carries the top + side border segments and the braille plate the bottom + sides, so the mounted pair forms one continuous tactile frame. Letters and braille stay at least 9.525 mm (3/8 in) inside it (ADA 703.2.7 and 703.3.2), measured from the real widths of the letters.
- `sign_part` renders **Both** plates side by side on the bed (default), or each plate alone.
- Up to **6 rows** of each script, wrapped **independently**: long lines wrap onto new rows of raised letters automatically, and the braille reflows into its own rows to fill the sign width. Because 16 mm raised letters hold far fewer characters per row than 7 mm braille cells, the braille usually packs into fewer, fuller rows. Line breaks you type are kept as hard breaks in both scripts.
- Independent wrapping is permitted by **ADA 703.3.2**, which places braille as one block below the entire text without requiring its line breaks to mirror the print rows. The preview lists the braille rows (with the words each row contains underneath) plus a summary of how many rows each plate uses.
- **Auto-fit** (`auto_fit`, on by default): the sign grows to fit its content. Plates get taller as rows are added, and wider if a single word needs more room than the set width; a new sign is 166 mm wide, enough for "Room 101" on one row. Turn auto-fit off to pin the exact size; content that then comes closer than 9.525 mm to the border or the edge prints a console warning that says what to change (for example "WARNING: the braille is less than 9.525 mm from the sign's side border or edge. Turn on auto_fit, widen the sign, or shorten the line.").
- **Ranges**: every sign setting that ADA gives a range is held to it. The sliders stop at the range, and if a value outside it arrives anyway (typed in, or from a link), the model stops and the status line says which rule the value breaks.
- **Braille editor (Unicode)**: the same hand-editing panel the card tool has, wired to the braille plate. See "Editing braille by hand".

### Making a sign, step by step

1. Open the sign tool (welcome screen → Braille Card Designer → Open — **Braille Sign** is the preselected tool — or `?example=braille-sign`).
2. Type the sign text into **Text to translate** — one line per message line (for example `Conference Room` then `101`). Long lines wrap onto new rows by themselves.
3. Check the **Braille preview**: each braille row shows the words it contains underneath, the row summary reports how many rows each plate uses, and any fit problems appear as errors or warnings.
4. To correct a contraction or paste braille you already have, open the **Braille editor (Unicode)** and edit the rows directly — see "Editing braille by hand". On a sign the editor drives the braille plate only; the raised letters keep coming from your text.
5. Adjust parameters if needed (character height, sign width, border, print orientation) — with auto-fit on, the sign resizes to whatever you enter.
6. Render and export. `sign_part` defaults to **Both**, so one STL holds the letter plate and the braille plate side by side; print it as modeled, no slicer supports.
7. After printing, snap the support fins off the back of the braille plate (Angled mode). Mount the plates with the letters above the braille so the split border joins into one frame, keeping the braille at least 9.525 mm (3/8 in) below the raised text.

> **ADA disclaimer:** the defaults follow the published 703 figures, but this tool does **not** guarantee compliance. Real signage has requirements the generator does not model: mounting height and location, visual contrast, glare, and the braille placed at least 9.525 mm (3/8 in) below the raised text (mount the braille plate accordingly). BANA advises that braille for signs be proofread by people qualified in braille codes. Check the standard before installing; [Braille sign standards](BRAILLE_STANDARDS.md#what-the-tool-does-not-check) lists what the tool does not check.

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
- The braille editor's status line is a polite status region, so fills, clears, and hand-edit locks are announced as they happen; row-count clamps are announced through the shared live region.
- Fit **errors** use an alert region (announced immediately); informational **warnings** and the multi-card notice use status regions (announced politely). Each message is said once, when it appears or changes, not again while it stays the same.
- The card and charm pagers are two ordinary buttons beside a status line ("Card 1 of 2"); each page is announced once when you press Previous or Next. At either end the button keeps focus and is announced as unavailable.
- In six-key entry, each cell's dots are announced as it is made ("dots 1 2 5", "space").
- All states render correctly in high-contrast and Windows forced-colors modes; severity is never conveyed by color alone.

## Privacy

Translation runs in a Web Worker on your device using liblouis compiled to WebAssembly. The text you type never leaves your browser.

## Licensing and attribution

- Braille translation is powered by [liblouis](https://liblouis.io/), the open-source braille translator (LGPL-2.1-or-later, for the library and for every translation table shipped; each table's header names its authors). The app runs liblouis 3.39.0, compiled to WebAssembly from its release tarball by `scripts/build-liblouis-wasm.sh`. The license and the build's README sit beside the binary in `public/wasm/liblouis/`, and `public/liblouis/NOTICE.txt` covers the tables.
- All three examples are adapted from Brennen Johnston's standalone desktop
  generators (© 2024–2026). Each was originally published under PolyForm
  Noncommercial 1.0.0 and **relicensed by the copyright holder to
  GPL-3.0-or-later** for the OpenSCAD Assistive Forge (2026); each SCAD header
  records the relicense. Upstream repos:
  [braille-wedge-card-openscad](https://github.com/BrennenJohnston/braille-wedge-card-openscad),
  [braille-sign-openscad](https://github.com/BrennenJohnston/braille-sign-openscad),
  [braille-charm-openscad](https://github.com/BrennenJohnston/braille-charm-openscad).
- The **Braille Charm** (GPL-3.0-or-later) combines the charm base from Nasif's Charm Maker (concept by Nasif Zaman, CC0) with the wedge card's braille dot system; its bracelet clip shape is adapted from the Charm Designer's Bracelet Clip Charm (CC0), whose design direction came from Duy Do's AAC bracelet charms (UW WOOF3D).
- The **Braille Sign** (GPL-3.0-or-later) uses the wedge card's braille dot system and renders raised characters with the Liberation Sans font (SIL OFL).
- Key references: [BANA size and spacing](https://brailleauthority.org/size-and-spacing-braille-characters), the CHI 2024 study on [3D-printed braille orientation](https://doi.org/10.1145/3613904.3642719), and the [2010 ADA Standards](https://archive.ada.gov/) section 703.
