# aac fixtures

Two SYNTHETIC cards, original to this repository, standing in for the pictures
communication symbols are actually made of: black line work over a saturated
fill, where the fill colour carries meaning (Fitzgerald coding).

Nothing here comes from PCS, SymbolStix, ARASAAC, Mulberry or any other set.
No proprietary symbol belongs in this repository, and checking Forge against a
real licensed export is an owner-run acceptance, not a committed test.

- `blue-field-glyph.svg` / `.png` - a black person glyph inside a blue rounded
  square with a black border. This is the failure case: MEASURED against the
  tracer as it shipped, this picture came back as ONE path, the blue square,
  with the person gone and nothing said about it. Line art mode keeps the
  glyph.
- `fitzgerald-card.svg` / `.png` - one swatch per Fitzgerald colour band
  (yellow, blue, green, red), each with black line work over it. Yellow's line
  work survived the old tracer by luck, because yellow is light enough to land
  in the paper bucket; the other three swallowed theirs. It is also the case
  where the colour-to-filament suggestion must stay QUIET, because four fills
  average to a colour that is in none of them.

The `.png` files are the `.svg` files rendered at their natural size, so the
same drawing can be pushed through the raster path and the vector path.
