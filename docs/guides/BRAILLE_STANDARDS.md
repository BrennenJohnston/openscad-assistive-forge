# Braille sign standards

This page says which rules the Braille Sign's raised letters and braille follow, the figures I build it to, and how the tool keeps to them. The Braille Card and the Braille Charm are covered at the end.

## What this page is, and is not

- The sign follows section 703 (Signs) of the 2010 ADA Standards for Accessible Design and the Braille Authority of North America's (BANA) guidelines for braille signage. The figures below are theirs; the sign's own numbers are measured from the 3D model the app exports.
- ADA states each figure in inches, with a rounded metric figure in parentheses, and the two do not always agree (3/8 in is 9.525 mm, printed 9.5 mm). Where they differ, the sign keeps to the stricter of the two, so it meets both.
- The tool does not certify a sign. Where a sign is mounted, its finish and contrast, and anything else section 703 asks of an installed sign are outside what it can check (see "What the tool does not check" below).
- BANA advises that braille for signs be proofread by qualified people who know braille codes, and that the final sizing and spacing be checked. Please do both before installing a sign.

## Translation

- The braille is translated on your device by liblouis 3.39.0, in Unified English Braille (UEB).
- A sign uses contracted braille (Grade 2), as ADA 703.3 requires. English Braille American Edition (EBAE), the code used in the United States before UEB, is not offered: BANA says it "is no longer an accepted standard for braille signage."
- Capital signs: ADA 703.3.1 allows them only before the first word of a sentence, proper nouns and names, single letters, initials and acronyms, and BANA recommends the same where space permits. So on a sign "Preserve capital letters" starts off and the braille carries no capital signs. Turn it on to keep the capitals you type; liblouis then capitalizes as UEB does.
- Each line you type is translated as one unit and then divided into rows at its blank cells, so rules that span words (a capital passage, a divided address) come out the way UEB writes them.

## Braille dots on the sign (ADA 703.3.1, Table 703.3.1)

All distances are measured center to center, as the table says.

| Measure | ADA | The sign's default (measured) | How the tool keeps to it |
|---|---|---|---|
| Dot shape | domed or rounded | a rounded dome | Rounded is the default; a flat-topped Cone shape is also offered |
| Dot base diameter | 1.5 to 1.6 mm (0.059 to 0.063 in) | 1.59 mm at the face of the plate | the slider allows 0.5 to 3 mm, and nothing stops a value outside the range |
| Dot height | 0.6 to 0.9 mm (0.025 to 0.037 in) | 0.68 mm | the base height (0 to 2 mm) and the dome height (0.1 to 2 mm) have separate sliders, unchecked |
| Between two dots in the same cell | 2.3 to 2.5 mm (0.090 to 0.100 in) | 2.5 mm | the slider allows 1 to 5 mm, unchecked |
| Between corresponding dots in adjacent cells | 6.1 to 7.6 mm (0.241 to 0.300 in) | 7.0 mm | the slider allows 2 to 15 mm, unchecked |
| Between corresponding dots one cell directly below | 10 to 10.2 mm (0.395 to 0.400 in) | 10.1 mm | the slider allows 5 to 25 mm, unchecked |

## Raised letters on the sign (ADA 703.2)

| Rule | ADA | The sign today (measured) |
|---|---|---|
| 703.2.1 Depth | 0.8 mm (1/32 in) minimum above the background | 0.8 mm |
| 703.2.2 Case | uppercase | uppercase by default (`force_uppercase`) |
| 703.2.3 Style | sans serif; not italic, oblique, script or highly decorative | Liberation Sans |
| 703.2.4 Proportions | the "O" 55 to 110 % as wide as the "I" is tall | 99 % |
| 703.2.5 Height | 16 mm (5/8 in) to 51 mm (2 in), measured on the uppercase "I"; 13 mm (1/2 in) is allowed where separate visual characters carry the same information | 16.00 mm at the default setting of 16: the setting is the height of the "I" |
| 703.2.6 Stroke | the "I" stroke 15 % maximum of its height | 13.6 % |
| 703.2.7 Spacing | 3.2 mm (1/8 in) minimum between the closest points of adjacent letters in a word (the sign's letters have rectangular cross sections), and four times the stroke maximum (8.7 mm at the default size) | at the default spacing of 1.21, measured on every pair of capital letters and every pair of digits: all are 3.2 mm or more apart (the closest, A and A, 3.35 mm) and no more than four strokes apart (the widest, Y and J, 8.44 mm). A letter beside a digit can fall outside: 7A is 9.06 mm and Y4 9.53 mm apart, and no single spacing keeps every such pair in range |
| 703.2.8 Line spacing | baseline to baseline, 135 to 170 % of the character height | 135 % |

## Layout (ADA 703.2.7, 703.3.2)

- The braille sits below the entire text, on its own plate, as 703.3.2 asks; mount it with the braille at least 9.525 mm (3/8 in) below the lowest raised letters.
- Letters and braille must be at least 9.5 mm (3/8 in) from raised borders. The sign's optional raised border is split between the two plates so that, mounted together, they form one frame. The sign keeps its letters and braille at least 9.525 mm (3/8 in) inside that border (inside the plate's edge when the border is off), and sizes each row of letters from the measured widths of its characters: measured, the closest they come is 9.53 mm where rows fill a plate, and 10.7 mm beside a long word.

## What the tool does not check

- Mounting height and place (703.4): the baselines of the tactile characters between 48 in (1220 mm) and 60 in (1525 mm) above the floor, beside the door on the latch side, and the rest of 703.4.
- Finish and contrast (703.5.1): a non-glare finish, and light characters on a dark background or the reverse. That depends on your materials and colors, not on the model.
- Visual characters (703.5), pictograms (703.6) and symbols of accessibility (703.7).

## Braille cards and charms

Cards and charms are not signs, and section 703 does not govern them. Their dot defaults are a 1.6 mm base, about 0.68 mm high, 2.5 mm between dots, 7.0 mm between cells and 10.0 mm between lines: the sign's, except that the sign spaces its lines 10.1 mm apart to meet ADA's range in inches as well as in millimeters. The card starts on contracted braille, as BANA's business card examples are; the charm starts on uncontracted braille (Grade 1), since each charm holds a single character.

For comparison, braille embossed on paper in the United States and Canada follows the Library of Congress's Specification 800, which BANA quotes: dots 0.48 mm high with a 1.44 mm base, 2.340 mm between dots in a cell, 6.2 mm between cells and 10.0 mm between lines.

## Sources

Read on 2026-10-01 and 2026-10-02.

- U.S. Access Board, [2010 ADA Standards for Accessible Design, section 703 Signs](https://www.access-board.gov/ada/#ada-703)
- Braille Authority of North America, [Guidelines for the Creation of Braille Signage](https://www.brailleauthority.org/sites/default/files/2024-01/BANA%20Guidelines%20for%20the%20Creation%20of%20Braille%20Signage%20Approved%2010-2023.pdf) (approved October 2023)
- Braille Authority of North America, [Size and Spacing of Braille Characters](https://www.brailleauthority.org/size-and-spacing-braille-characters), which quotes Specification 800
- International Council on English Braille, [The Rules of Unified English Braille](https://iceb.org/ueb.html)
- [liblouis](https://liblouis.io/), the braille translator the tools use
