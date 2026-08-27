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

A way is kept only if its surviving tags include `building`, `highway`,
`building:part`, or one of the greenspace values listed under
[Greenspace](#greenspace). Coordinates are rounded to six decimal places, which
is about 0.1 m; keeping more digits would grow the file without changing
anything a walker can see.

Keeping a tag is not enough on its own: the gate above decides whether the way
survives at all, and a way whose only tags are kept ones it does not recognise
is still dropped. Both have to be changed together.

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

Standalone nodes are point props and point data. The parser routes them, in
this order: street trees (`natural=tree`); planters (`man_made=planter`) and
picnic tables (`leisure=picnic_table` — CW-55); rendered street furniture
(`highway=bus_stop`, `amenity` in bench / waste_basket / bicycle_parking,
`emergency=fire_hydrant` — CW-43); data-only wayfinding points
(`highway=crossing`, bare `kerb=*`, bare `tactile_paving=*` — CW-43); named
attractions (`tourism=attraction` or `attraction=*` with a `name` — CW-44);
then storefront pois (`shop` or any remaining `amenity`). The order matters:
a bench is an `amenity` node and a picnic table is a `leisure` node, and
without their own branches both would reach the storefront chooser.

**A tag has to be admitted twice.** Keeping it in `KEPT_TAGS` only decides
what survives the trim; the node and way gates decide whether the element
survives at all. Four releases have now paid for that distinction — a
`building:part` way, a `leisure=park` way, a bus stop, and a planter each
arrived from Overpass with their tags intact and were dropped a few lines
later because the gate did not list their key.

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
| `shop` | A proxy for where people gather, and the storefront a ground floor takes. |
| `surface` | What a road or pavement is paved with, which shifts its texture. Absent on most ways; see the class defaults below. |
| `footway` | `footway=sidewalk` is what tells a kerbside pavement from a path through a park. |
| `lanes`, `width` | Kept for a future release. Too sparse to design on today: at most fourteen `width` tags in any of the four bundled cities. |
| `landuse`, `leisure` | Greenspace, for the named values below. |
| `building:material`, `building:colour` | Facade variety, where a mapper has said. |
| `emergency` | Fire hydrants (CW-43). |
| `shelter`, `bench`, `bin` | A bus stop's companions: does the stop offer a roof, a seat, a basket. |
| `backrest`, `seats` | A bench's own shape. |
| `kerb` | Kerb form at crossings and on bare kerb nodes: raised, lowered, flush, rolled. |
| `tactile_paving` | Tactile paving presence: yes, no, partial, contrasted. |
| `crossing`, `crossing:island`, `crossing:markings` | What kind of crossing, whether an island splits it, how it is marked. |
| `traffic_signals:sound`, `traffic_signals:vibration` | Whether the signal speaks or buzzes — wayfinding data for the mission the owner named. |
| `attraction` | The specific attraction kind on a named node (CW-44): `big_wheel`, `carousel`… |
| `genus`, `species` | What a tree is, where a mapper has said. Near-absent in all four bundled cities and kept anyway, at no measurable size cost, so a later release never has to rebake to read them (CW-55). |
| `leaf_type` | `broadleaved` or `needleleaved`. The one tree tag that is actually there: Seattle 990 of 1,759 trees, Burnaby 170 of 244, Denver 66 of 2,325, Albuquerque none (CW-55). |
| `denotation` | Whether a tree is an avenue tree, a landmark, a natural monument (CW-55). |
| `man_made` | Carries `man_made=planter` (CW-55). |

### Greenspace

Greenspace is kept for a NAMED set of values, not for every way carrying
`landuse` or `leisure`. A downtown is wall to wall
`landuse=commercial`/`retail`/`industrial`, and keeping those would multiply
the file for ground that is already drawn as ground.

| key | values kept |
| --- | --- |
| `leisure` | `park`, `garden`, `pitch`, `playground`, `grass` |
| `landuse` | `grass`, `recreation_ground`, `forest`, `meadow`, `village_green` |

The list lives once, as `GREEN_LEISURE_VALUES` and `GREEN_LANDUSE_VALUES` in
`src/js/game/city-data.js`; the bake builds its Overpass filter from it and the
trim gate admits exactly the same values, so an extract cannot carry a polygon
the game will not draw.

**Ways only.** A park mapped as a multipolygon relation is not kept. That is a
known gap rather than an oversight.

### Surfaces, and what is assumed when there is none

`surface` is tagged on most of some cities' roads and almost none of others'
(88% of Seattle's, 9% of Albuquerque's). Where it is absent the renderer
assumes the OSM default for the class: **asphalt** for a roadway, **concrete**
for a pavement. A pavement with no `width` is drawn 1.8 m wide.

### The part-area floor

A `building:part` whose footprint is smaller than **10 m²** is dropped at bake
time. Downtowns are mapped with thousands of sliver parts - ledges and setbacks
a few centimetres across - that no character cell could ever show, and dropping
them is what lets a densely-modelled city fit inside the size budget at all.
The number is `MIN_PART_AREA_M2` in `src/js/game/city-data.js`.

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
  roads: [{ points: [[x, y], ...], widthM, kind, name, sidewalk, surface }],
  trees: [{ x, y, leafType?, genus?, species?, denotation? }, ...],
  greens: [{ outer: [[x, y], ...], kind }],
  pois: [{ x, y, kind }],
  furniture: [{ x, y, kind, shelter?, backrest? }],
  plantings: [{ x, y, kind, areaM2 }],
  picnicTables: [{ x, y }],
  wayfinding: [{ x, y, kind, tags }],
  attractions: [{ name, x, y, kind, heightM }],
  boundsM: { minX, minY, maxX, maxY },
  stats: {
    buildingCount, roadCount, treeCount,
    partCount, orphanParts,
    greenCount, sidewalkCount, surfacedRoadCount, poiCount,
    furnitureCount, furnitureByKind, wayfindingCount, attractionCount,
    plantingCount, plantingByKind, picnicTableCount, leafTypedTreeCount,
    droppedRings, droppedElements
  }
}
```

**`trees` changed shape in CW-55**, from `[x, y]` pairs to objects. What a tree
IS has to travel with where it is; a parallel array keyed by index is how two
lists drift apart. Every field but `x` and `y` is optional, because most trees
in most cities carry nothing — Albuquerque has 142 trees and not one
`leaf_type` among them.

`furniture` (CW-43) is the rendered street furniture at true node positions;
`kind` is one of `bus_stop`, `bench`, `waste_basket`, `bicycle_parking`,
`fire_hydrant`; a bus stop carries `shelter` and a bench `backrest`, both
booleans. `wayfinding` is the data-only accessibility layer — `kind` is
`crossing`, `kerb` or `tactile_paving`, and `tags` carries the kept
companions (a crossing with kerb and tactile companions is one point, not
three). Nothing is drawn from it yet. `attractions` (CW-44) are the named
attraction nodes that join the landmark legend; `heightM` is parsed from the
`height` tag, `0` where untagged.

`plantings` (CW-55) are planters and flowerbeds — `kind` is `planter` or
`flowerbed`. A planting mapped as a polygon is carried as its **centroid and
its area**, never as a ring: a two-by-four pixel character cell cannot show the
shape of a flowerbed, and keeping the ring would put real bytes in every
extract for a detail nobody can see. A planter mapped as a bare node reports
`areaM2: 0` rather than guessing a footprint. `picnicTables` are
`leisure=picnic_table` nodes at their true positions. Neither is drawn yet.

A flowerbed is deliberately **not** greenspace. A park is a lawn to colour; a
flowerbed is a planting to dress, and adding `flowerbed` to the greenspace
value lists would have been one word and would have painted every bed as grass.

`greens` are the parks, gardens, pitches and playgrounds listed under
[Greenspace](#greenspace); `kind` is the `leisure` or `landuse` value they came
from. `pois` are the shop and cafe nodes a facade generator uses to decide what
a ground floor looks like; `kind` is the `shop` value, or the `amenity` value
where there is no `shop`. A road's `sidewalk` and `surface` carry its tags
through unchanged, and are `undefined` where the mapper did not say.

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
