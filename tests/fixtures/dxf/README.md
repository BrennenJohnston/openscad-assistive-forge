# dxf fixtures

- `known-extents.dxf` - a 40 x 25 mm rectangle with a 10 mm square hole,
  exported by Forge's own engine from `difference() { square([40,25]);
  translate([12,8]) square([10,10]); }`. Its header declares `$EXTMIN 0,0` and
  `$EXTMAX 40,25`, which is what makes "the drawing came back the same size" an
  assertion rather than an impression. The round trip seeds itself: the fixture
  is a measured export, so a test can compare against a number the engine
  itself produced.

- `text-only.dxf` - a DXF whose only entity is a TEXT label. OpenSCAD's DXF
  import reads drawing entities, not annotation entities, so this file arrives
  as nothing at all. It exists to prove Forge says so plainly instead of
  handing back an empty drawing. Do not "fix" it by adding geometry; being
  unimportable is its entire job.

Both are plain ASCII DXF (AC1009) and original to this repository.
