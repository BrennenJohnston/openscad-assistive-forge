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
`name`, `highway`, `tourism`, `historic`, `amenity`, `natural`), rounds
coordinates to ~0.1 m, and self-checks that the game parser accepts the
result. The last four arrived with landmark scoring (CW-10) and street
trees (CW-16); this list had not caught up until CW-17.
