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
since CW-26 `building:part`, `roof:shape`, `roof:height`, `roof:levels`,
`roof:orientation` and `shop`, since CW-33 `surface`, `footway`, `lanes`,
`width`, `landuse`, `leisure`, `building:material` and `building:colour`,
and since CW-43 `emergency`, `shelter`, `bench`, `bin`, `backrest`, `seats`,
`kerb`, `tactile_paving`, `crossing`, `crossing:island`, `crossing:markings`,
`traffic_signals:sound`, `traffic_signals:vibration` and `attraction`),
rounds coordinates to ~0.1 m, and self-checks that the game parser accepts the
result. `KEPT_TAGS` in `src/js/game/city-data.js` is the authoritative list.

## What is in the four files

Measured from the files as they ship, not from the bake logs:

| city | size | buildings | parts | outlines with parts | greens | sidewalks | roads with a surface | shop/cafe nodes | trees |
|---|---|---|---|---|---|---|---|---|---|
| seattle | 1848 KB | 485 | 418 | 122 | 17 | 1539 | 3150/3564 | 674 | 265 |
| denver | 1664 KB | 363 | 895 | 152 | 249 | 493 | 690/1941 | 255 | 2325 |
| albuquerque | 726 KB | 639 | 35 | 15 | 24 | 260 | 130/1383 | 136 | 142 |
| burnaby | 1011 KB | 537 | 182 | 24 | 80 | 256 | 1209/1717 | 534 | 244 |

Street furniture and wayfinding data (CW-43, rebaked 2026-08-24 — true node
positions from OSM, never decorative scatter), and named attraction nodes
(CW-44):

| city | bus stops | benches | waste baskets | bicycle parking | hydrants | wayfinding points | named attractions |
|---|---|---|---|---|---|---|---|
| seattle | 71 | 31 | 155 | 309 | 43 | 1907 | 6 |
| denver | 80 | 20 | 4 | 147 | 171 | 886 | 0 |
| albuquerque | 24 | 2 | 8 | 7 | 54 | 250 | 2 |
| burnaby | 45 | 142 | 51 | 58 | 89 | 610 | 0 |

Wayfinding points are the data-only accessibility layer: `highway=crossing`
nodes with their kerb / tactile-paving / signal-sound companions riding as
tags, plus bare `kerb=*` and `tactile_paving=*` nodes (Seattle's richness is
OpenSidewalks-style mapping living in OSM itself). Nothing is drawn from
them yet. Albuquerque is the deliberate near-zero control city. Seattle's
named attractions at this radius include the Seattle Great Wheel — a point
in OSM, so it appears in the landmark legend by name rather than as 3D
geometry.

## Building parts, and how Denver got its shape (CW-26, CW-33)

Whole-building `roof:shape` is nearly absent from US downtowns - about 1.5%
of Seattle and 3.6% of Denver carry it - while residential Burnaby has it on
26.8%. Downtown silhouettes are mapped a different way: as `building:part`
volumes standing inside a plain outline. Those parts are what make a stepped
tower look stepped, and until CW-26 the bake stripped every one of them.

CW-26 rebaked three of the four cities with parts and left **Denver** out: it
has 3,013 of them, mostly tiny — the median part covers 2.76 m2 and a quarter
are under 0.59 m2 — and carrying them all took the extract to 2303 KB, well
past the 1600 KB bar the bake script warns at. Denver was the one city still
drawn as plain boxes, and the measured trade looked like this:

| minimum part area | parts kept | extract size |
|---|---|---|
| none (all parts) | 2365 | 1922 KB |
| 5 m2 | 1190 | 1419 KB |
| **10 m2** | **897** | **1288 KB** |
| 20 m2 | 677 | 1218 KB |
| 50 m2 | 516 | 1161 KB |

**CW-Q31 chose 10 m2 and CW-33 rebaked all four cities with it**, so every
city now has its parts and its roofs. A ledge or setback smaller than ten
square metres is under a tenth of the area of a single character cell at the
sizes this game is played at — nothing that small could ever be seen, which is
what makes the floor a saving rather than a loss. Denver drops 2,118 slivers
that way and keeps 895 real volumes, which is what finally gave it stepped
towers.

`MIN_PART_AREA_M2` in `src/js/game/city-data.js` is the floor, applied by the
bake script so the saving is in the file rather than in every page load.
