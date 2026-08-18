# ASCII City Walk — bundled city extracts

These JSON files are trimmed extracts of OpenStreetMap data (building
footprints, heights, and roads) used by the hidden ASCII City Walk game.
Each was generated with `scripts/bake-city-extract.mjs` from the public
Overpass API for a ~500 m radius around a city-center point.

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
node scripts/bake-city-extract.mjs --name <slug> --center <lat,lon> [--radius 500]
```

The script trims tags to what the game reads (`building`, `height`,
`building:height`, `building:levels`, `min_height`, `building:min_level`,
`name`, `highway`), rounds coordinates to ~0.1 m, and self-checks that the
game parser accepts the result.
