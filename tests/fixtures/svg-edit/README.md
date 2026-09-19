# svg-edit fixtures

A stand-in for the acceptance story behind IR-4: a photographed tactile
drawing of a bird, with the interior detail a laser cutter or a tactile
printer can never show.

`bird-drawing.svg` is **composed, not hand-drawn** - a thick dark outline, an
eye, three feather strokes and a beak line on a paper-toned ground. It is
stated as composed so nobody mistakes it for a real person's drawing.
`bird-drawing.png` is that same file rasterised at 600x450, so the tests can
exercise the photo lane (raster to tracer to editor) as well as the SVG lane.

Both are original to this repository. Nothing traced, nothing borrowed.

What they are for: the tracer turns the PNG into seven separate paths. Keeping
only the outline and ignoring the rest is the whole point of the SVG
Preparation Editor, and `tests/e2e/svg-edit-door.spec.js` walks exactly that,
by keyboard alone.

## The size fixtures

`many-shapes-210.svg` (210 plain rects), `over-budget-300.svg` (300 curved
shapes) and `over-cap-1200.svg` (1,200 rects) exist to put a drawing on each
side of a line the app draws.

- **1,200** is over the LIST cap of 1,000 shapes and is refused outright.
- **300 curved shapes** are 19,200 ring points, predicted at 8.8 seconds and
  MEASURED at 923 ms, so they are over the 300 ms flatten budget (DP-Q33) and
  wait to be asked. They are curved on purpose: a drawing has to be slow
  enough that somebody can really press Cancel in the middle of combining it.
- **210 rects** are 840 ring points and MEASURED at 80 to 110 ms, so they
  combine by themselves. They used to be the manual-band fixture, back when
  the band was a count of shapes rather than a measured cost.

All three are generated from plain geometry, original to this repository.

## The two papers

`two-papers.svg` is two light squares side by side, each with a dark bar on
it. Neither square is a frame around the whole drawing, so both are cut-outs
by their luminance, and the automatic preparation subtracts them from the
bars and keeps nothing. It exists so the app's answer to that, opening the
drawing editor and saying so instead of applying an empty design, has a
drawing to be measured on (D-167). Plain geometry, original to this
repository.
