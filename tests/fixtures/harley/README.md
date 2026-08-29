# Harley fixtures - the acceptance oracle for the stencil lane

These nine files are the owner's own work, contributed by them to this
repository as test fixtures (DP-Q17, 2026-08-28). They are what a correct
Stencil Maker has to be able to produce.

| file | what it is |
|---|---|
| `sketch4.svg` | the line drawing, exported from Illustrator with "Outline Stroke": one compound path (the outer contour of the line network plus one inner contour per enclosed face) and a group of three band paths for the eye rings. No fills, no colours, 119.813 x 150.065 user units. |
| `sketch4.png` | the same drawing coloured, 503 x 629 px. This is where the colours live. |
| `plate-base.stl` | the registration jig: a 60 x 60 x 0.6 mm sheet with four pegs 4.4 mm tall, round 3.0 mm diameter at the two top corners and rectangular 3.0 x 2.0 mm at the two bottom corners, all centred 2.5 mm in from both edges. Round at one end and rectangular at the other means a plate cannot be laid on backwards. |
| `plate-1.stl` .. `plate-6.stl` | the six stencil plates, 60 x 60 x 0.6 mm each, with matching holes and notches and the plate number cut through the bottom margin. Plate 1 cuts the whole head silhouette (the base coat); plates 2 to 6 cut only their own colour's regions. |
| `harley-plan.json` | the colour plan those plates encode, MEASURED out of them by DP-15 rather than typed from a description. Regions are located by a point inside them, in `sketch4.svg` user units. |

## Provenance

Harley is the owner's cat. The photograph, the Photoshop posterize steps, the
Illustrator drawing and the Fusion 360 CAD are all the owner's own work, and
they are published here under the repository's licence (GPL-3.0-or-later).

**The photograph is deliberately not here.** Only the drawing derived from it,
the coloured version of that drawing, and the CAD output are in the repository.

Nothing in this folder was traced from, or borrowed from, anyone else's work.

## Why the plan file is keyed by point and not by index

`harley-plan.json` says "the region containing (53.897, 70.057) is brown", not
"element 12 is brown". Element indices belong to whatever extracted them, and
the whole point of DP-16 is that the regions of a line drawing are the FACES of
the line network rather than the drawn elements. A point inside a face survives
any change to how faces are found; an index does not.

How each row was derived, so it can be checked or redone:

1. Read the boundary loops of each plate's top face straight out of the binary
   STL (every triangle at max z; the edges that appear once are the boundary).
2. Map them into SVG user units through plate 1's silhouette - one uniform
   scale, 0.264525 mm per SVG unit, with y flipped because the CAD measures y
   upward and SVG measures it down. The two axes agreed to 0.023%, which is
   what says the mapping is a similarity and not a guess.
3. Sample `sketch4.png` inside each loop, with every region a LATER plate
   sprays over removed first. Without that removal the eyes read `#000000`,
   because the picture shows the last coat and the pupils are painted over the
   green.

The script is `New Research 2026_08_28/DP15-measurements/scripts/
harley-plan-derive.mjs` in the owner's research folder; its raw output is
`harley-regions-measured.json` beside it.

## What the fixtures are used by

- `scripts/stencil-golden.mjs` renders a plate and compares it with the
  reference plate of the same number, and reports intersection over union.
- The unit tests that pin plate geometry, the colour model, and the raster
  colour lane.
