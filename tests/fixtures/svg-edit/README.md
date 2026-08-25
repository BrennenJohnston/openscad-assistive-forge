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
