# The `ascii-city-extract@1` format

This is the file format the ASCII City Walk reads: a trimmed extract of
OpenStreetMap data describing one city centre. It is written by
`scripts/bake-city-extract.mjs` and read by `parseCityExtract` in
`src/js/game/city-data.js`.

This document describes the format as the code implements it today. Where a
plan or an older note disagrees with what is written here, the code is the
authority and this file follows the code.

If you only want to regenerate one of the bundled cities, see
[the extract README](../public/examples/ascii-city/README.md); it carries the
exact commands and the provenance of the four files that ship. This document is
for anyone writing an extract from scratch, or writing a second consumer of one.

## What the file is

A single JSON object. It wraps a list of OpenStreetMap elements that have been
stripped down to the handful of tags the game reads, with coordinates rounded
to about 0.1 m.

```json
{
  "format": "ascii-city-extract@1",
  "name": "seattle",
  "center": { "lat": 47.6089, "lon": -122.3357 },
  "radiusM": 707,
  "generated": "2026-08-22",
  "source": "OpenStreetMap via Overpass API",
  "attribution": "Map data © OpenStreetMap contributors",
  "license": "ODbL 1.0 — https://www.openstreetmap.org/copyright",
  "elements": []
}
```

### The wrapper fields

| field | type | what it means |
| --- | --- | --- |
| `format` | string | Always `ascii-city-extract@1` for this version. Check it before trusting anything else. |
| `name` | string | The slug the file is stored under, such as `seattle`. |
| `center` | `{lat, lon}` | The projection origin. Every coordinate in the parsed model is in metres from this point. |
| `radiusM` | number | The radius the extract was queried with, in metres. |
| `generated` | string | The day it was baked, as `YYYY-MM-DD`. Day granularity on purpose: a finer stamp would churn the file on every rebake without telling anyone anything. |
| `source` | string | Where the data came from, in words. |
| `attribution` | string | The credit line the game displays. Do not remove it. |
| `license` | string | ODbL 1.0, with a link. |
| `elements` | array | The trimmed OpenStreetMap elements, described below. |

`attribution` and `license` are not decoration. These extracts are a derivative
database of OpenStreetMap and are redistributed under the Open Database
License; the game shows the attribution wherever the data is shown.

## The elements

Three shapes, produced by `trimOverpassElement`. Anything that is not one of
these three, or that carries none of the kept tags, is dropped during the bake.

### Way

```json
{
  "type": "way",
  "id": 12345,
  "tags": { "building": "yes", "height": "42" },
  "geometry": [
    { "lat": 47.6089, "lon": -122.3357 },
    { "lat": 47.609, "lon": -122.3357 }
  ]
}
```

A way is kept only if its surviving tags include `building`, `highway`, or
`building:part`. Coordinates are rounded to six decimal places, which is about
0.1 m; keeping more digits would grow the file without changing anything a
walker can see.

### Relation

```json
{
  "type": "relation",
  "id": 67890,
  "tags": { "building": "yes" },
  "members": [
    { "type": "way", "ref": 111, "role": "outer", "geometry": [] },
    { "type": "way", "ref": 222, "role": "inner", "geometry": [] }
  ]
}
```

Only `type=multipolygon` building relations are queried, and only `way` members
with geometry are kept. A relation with no usable members is dropped. Members
with the role `inner` become holes; everything else is treated as an outer ring.

### Node

```json
{
  "type": "node",
  "id": 24680,
  "tags": { "natural": "tree" },
  "lat": 47.6089,
  "lon": -122.3357
}
```

Standalone nodes are point props. Today only `natural=tree` is used.

## The kept tags

Everything else is thrown away during the bake. This list is `KEPT_TAGS` in
`src/js/game/city-data.js` and is the whole reason an extract is a fraction of
the size of the raw Overpass response.

| tag | why it is kept |
| --- | --- |
| `building` | Marks a footprint as a building. |
| `height`, `building:height` | The building's height, in metres or feet. |
| `building:levels` | Storey count, used when no height is tagged. |
| `min_height`, `building:min_level` | Where the volume starts, for things that do not touch the ground. |
| `name` | Building and landmark names, and street names. |
| `highway` | Road class, which sets the drawn width. |
| `tourism`, `historic`, `amenity` | Landmark scoring. |
| `natural` | Street trees. |
| `building:part` | A volume inside a building outline. See below. |
| `roof:shape`, `roof:height`, `roof:levels`, `roof:orientation` | Pitched roofs. |
| `shop` | A proxy for where people gather. |

### A note on `building:part`

In the OpenStreetMap Simple 3D Buildings convention, a complicated building is
described as a plain outline with separate `building:part` volumes standing
inside it. That is how most stepped towers are mapped, and a `building:part`
way usually carries **no** `building` tag at all.

Two consequences for anyone writing an extract:

- Query for `building:part` ways explicitly. They will not arrive with a
  `building` query.
- Do not filter them out for lacking a `building` tag.

## What the parser gives you

`parseCityExtract(extract)` turns the file into flat, renderer-ready data.
Distances are metres; `x` is east, `y` is north; height is added by whatever
draws it.

```js
{
  center: { lat, lon },
  attribution: string,
  buildings: [
    {
      outer: [[x, y], ...],
      holes: [[[x, y], ...], ...],
      heightM: number,
      minHeightM: number,
      name: string | undefined,
      tags: object,
      parts: [ /* same shape, minus parts */ ],
      partsAreMass: boolean,
      roof: { shape, heightM, orientation } | null
    }
  ],
  roads: [{ points: [[x, y], ...], widthM, kind, name }],
  trees: [[x, y], ...],
  boundsM: { minX, minY, maxX, maxY },
  stats: {
    buildingCount, roadCount, treeCount,
    partCount, orphanParts,
    droppedRings, droppedElements
  }
}
```

### How a height is decided

`resolveBuildingHeight` works down a cascade, taking the first answer it gets:

1. `height`, then `building:height`. Both accept `12`, `12.5`, `12 m`, `12m`,
   `40'`, `40 ft`.
2. `building:levels` multiplied by 3 m per storey.
3. A default of 8 m, so an untagged building is a low-rise rather than nothing.

Anything over 700 m is treated as a tagging error and clamped. `min_height` and
`building:min_level` resolve the same way, defaulting to 0. If a building would
end up with no volume at all, it is given a half-metre sliver instead.

### How parts and outlines fit together

Each `building:part` is matched to the outline that contains it, by testing the
part's centroid against outline polygons. The result decides how it is drawn:

- **`partsAreMass` is true** when the parts cover at least 60% of the outline's
  area. The parts are the building; the outline is not drawn as a volume.
- **`partsAreMass` is false** otherwise. Both are drawn, so the parts stand
  proud of the outline.

That second case exists because real data is untidy. A building mapped with one
small turret and nothing else would lose its whole body if the outline stood
down, leaving the turret hanging in the air.

A part whose outline is not in the extract is counted in `stats.orphanParts`
and added to `buildings` in its own right. It is a real volume on a real street
and drawing it beats dropping it.

**Collision reads outlines and never parts.** The gaps between parts are inside
the building, and a player must not be able to walk into one.

### Roads

`kind` is the raw `highway` value. `widthM` is a game-world ribbon width chosen
per class, not survey data. `name` is the street name where the way has one;
most ways in a downtown extract are unnamed service spurs and footpaths, so
expect roughly a fifth of them to carry a name.

Overpass `around` queries return **whole ways**, so a road passing through the
radius can trail for kilometres beyond it. `boundsM` is therefore computed from
buildings alone whenever any exist, and long road tails are treated as scenery
outside the playable core.

## The versioning promise

`format` carries the version, and consumers should check it before reading
anything else.

- **Additive changes keep `@1`.** A new kept tag, a new optional field on a
  parsed object, or a new `stats` counter does not break a reader that ignores
  it. Everything CW-26 and CW-27 added was additive.
- **A breaking change bumps to `@2`.** Renaming or removing a field, changing a
  unit, changing what a coordinate means, or changing the element shapes. A
  reader that sees a version it does not know should say so rather than guess.

The bake script self-checks: after writing, it parses its own output with
`parseCityExtract` and refuses to claim success if the parser rejects it.

## Writing your own extract

You do not need this repo's bake script. Anything that produces the wrapper
above with valid elements will load. If you do write your own, please keep the
attribution and licence fields intact, round your coordinates (the file gets
large fast otherwise), and respect the
[Overpass API usage policy](https://wiki.openstreetmap.org/wiki/Overpass_API)
if that is where your data comes from: send an identifying `User-Agent`, stay
well under 10,000 queries a day, and pause on a 429 rather than retrying
immediately.
