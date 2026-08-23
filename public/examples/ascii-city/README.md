# ASCII City Walk — bundled city extracts

These JSON files are trimmed extracts of OpenStreetMap data (building
footprints, heights, and roads) used by the hidden ASCII City Walk game.
Each was generated with `scripts/bake-city-extract.mjs` from the public
Overpass API for a ~707 m radius around a city-center point. That radius is
CW-Q9's decision: 707 m covers twice the ground area of the original 500 m,
which is what "twice the city" means. Doubling the radius instead would have
quadrupled it.

## License and attribution

**Map data © OpenStreetMap contributors, available under the Open Database
License (ODbL 1.0).**

- Copyright and license: https://www.openstreetmap.org/copyright
- ODbL full text: https://opendatacommons.org/licenses/odbl/1-0/

These extracts are a derivative database of OpenStreetMap and are
redistributed under the ODbL. Each file carries its own `attribution`,
`license`, `center`, `radiusM`, and `generated` fields. The game displays
the attribution wherever the data is shown.

## The file format

The wrapper fields, the element shapes, the full kept-tag list and the
versioning promise are written up in
[docs/ASCII_CITY_EXTRACT_SCHEMA.md](../../../docs/ASCII_CITY_EXTRACT_SCHEMA.md).
That document is the contract; this one is the provenance of the four files
that ship here.

## Regenerating or adding a city

```
node scripts/bake-city-extract.mjs --name <slug> --center <lat,lon> --radius 707
```

The four bundled cities were baked with these centers:

| city | center (lat,lon) |
|---|---|
| seattle | 47.6089,-122.3357 |
| denver | 39.7439,-104.9922 |
| albuquerque | 35.0844,-106.6504 |
| burnaby | 49.2276,-123.0076 |

The script trims tags to what the game reads (`building`, `height`,
`building:height`, `building:levels`, `min_height`, `building:min_level`,
`name`, `highway`, `tourism`, `historic`, `amenity`, `natural`,
and since CW-26 `building:part`, `roof:shape`, `roof:height`,
`roof:levels`, `roof:orientation` and `shop`), rounds coordinates
to ~0.1 m, and self-checks that the game parser accepts the result.

## Building parts, and why Denver has none (CW-26)

Whole-building `roof:shape` is nearly absent from US downtowns - about 1.5%
of Seattle and 3.6% of Denver carry it - while residential Burnaby has it on
26.8%. Downtown silhouettes are mapped a different way: as `building:part`
volumes standing inside a plain outline. Those parts are what make a stepped
tower look stepped, and until CW-26 the bake stripped every one of them.

Three of the four cities were rebaked with parts. **Denver was not**, and the
file here is still its CW-17 bake:

| city | size | parts kept | outlines carrying parts |
|---|---|---|---|
| seattle | 1256 KB | 423 | 122 |
| burnaby | 726 KB | 182 | 24 |
| albuquerque | 623 KB | 35 | 15 |
| **denver** | **893 KB (not rebaked)** | **0** | **0** |

Denver has 3,013 parts, and they are mostly very small: the median part covers
2.76 m2 and a quarter of them are under 0.59 m2. Carrying them all takes the
extract to 2303 KB, well past the 1600 KB bar the bake script warns at. The
measured trade, for whoever picks this up:

| minimum part area | parts kept | extract size |
|---|---|---|
| none (all parts) | 2365 | 1922 KB |
| 5 m2 | 1190 | 1419 KB |
| 10 m2 | 897 | 1288 KB |
| 20 m2 | 677 | 1218 KB |
| 50 m2 | 516 | 1161 KB |

Choosing a floor there is a product decision, not a mechanical one, so Denver
keeps its old extract until someone makes it. Nothing breaks meanwhile: an
extract without parts renders exactly as it did before CW-26.
