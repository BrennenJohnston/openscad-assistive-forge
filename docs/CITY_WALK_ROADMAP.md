# ASCII City Walk: where this is going

The City Walk is a small 3D city you can walk around, rendered through the same
ASCII converter the rest of the app uses. It started as a hidden extra. This
document records two things it is deliberately built to grow into, so that
whoever picks it up next can see the line before they cut across it.

Nothing here is scheduled. It is a record of intent and of the seams already in
the code, not a promise about dates.

## The one design rule everything else rests on

`src/js/game/city-data.js` is deliberately free of the DOM and of three.js. The
same module runs in the browser when the game builds its scene, in Node when the
bake script trims an extract, and under vitest. It is written that way on
purpose, and it should stay that way.

That single property is what makes both roadmaps below possible. A city model
made of buildings, roads, landmarks, names and metres, with no renderer
attached, can be drawn on a screen, or measured for something else entirely.
The moment the model starts assuming a canvas, both futures get much harder.

The file format that model is loaded from is written down in
[the extract schema](ASCII_CITY_EXTRACT_SCHEMA.md).

## Part one: cities the player chooses

Today four cities ship with the app, baked ahead of time. The obvious next step
is letting someone type an address and walk there. That means talking to two
public services at runtime, and both have usage policies that shape the design
more than the code does.

### What the policies require

**Nominatim** (address search) publishes a
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) that a
feature like this has to be built around, not bolted onto:

- At most one request per second.
- An identifying `Referer` or `User-Agent`. Not a library default.
- **Autocomplete is forbidden.** Search runs when someone submits, never as
  they type. This is a user-interface constraint, not a throttling detail.
- No bulk or systematic querying.
- Cache results.
- The provider must be switchable without shipping a new version of the
  software.

**Overpass** (map data) is documented on the
[Overpass API wiki page](https://wiki.openstreetmap.org/wiki/Overpass_API).
Under about 10,000 queries and 1 GB a day is considered safe, an identifying
user agent is expected, and a `429` response means pause rather than retry.

The bake script already does the Overpass half correctly and can be read as the
reference: it sends a named `User-Agent`, and on a `429` it pauses 30 seconds
before its single retry. Both live in `scripts/bake-city-extract.mjs`.

### The Content-Security-Policy is the real gate

`public/_headers` sets `connect-src` to a **named-host allowlist**. The app
cannot reach any host that is not on it. Adding search would mean adding
`https://nominatim.openstreetmap.org` and `https://overpass-api.de` to that
list.

That change must be additive, signed off by the owner, and made everywhere in
one go. It must never become a wildcard, and it must never weaken any other
directive.

The policy string is copied into several documents, and a future change has to
update all of them together or the docs start lying about the deployed headers.
The copies at the time of writing:

- `public/_headers` (the one that is actually served)
- `docs/DEPLOYMENT.md`
- `docs/SECURITY_ADMIN_GUIDE.md`
- `docs/guides/IT_APPROVAL_GUIDE.md`
- `docs/specs/MANIFEST_STABILITY_CONTRACT.md`
- `RELEASE_NOTES.md`

Re-check that list before relying on it; documents move.

### The rest of the shape

- **Storage.** Fetched cities belong in OPFS, which is the pattern this project
  already uses for user files.
- **Offline.** The feature degrades to the four baked cities. Losing the
  network should cost you address search, not the game.
- **The smallest useful first slice** is a flag-gated "Custom city…" entry
  beside the four bundled ones: type an address, submit, fetch, bake in the
  browser using the existing parser, walk. End to end and small enough to
  judge, without committing the interface to anything.

### One seam that already exists

`trafficDensityFor(road)` in `city-data.js` decides how much frozen traffic a
street gets - the cars standing in the travel lanes, not the ones parked at the
kerb. It works from the road's class, with a lane multiplier that is ready for
a `lanes` tag the current extracts do not carry.

It is a proxy, and an honest one: real congestion data is a commercial product,
and this project uses open data. If that ever changes, that function is the one
place it lands.

## Part two: maps you can feel

This project builds assistive technology, and a city model in real metres is
exactly the input a tactile map needs. The map view already in the game — the
overhead street network, with landmarks marked — is the visual ancestor of the
idea.

### What already exists in the world

- **TMAP**, from the Smith-Kettlewell Eye Research Institute
  ([ski.org](https://www.ski.org/)): give it an address and a size, get an
  embosser-ready tactile street map. Distributed in partnership with LightHouse
  for the Blind.
- **Dot Pad X** ([dotincorp.com](https://dotincorp.com/)): a refreshable
  tactile graphics display, 300 cells plus a 20-cell braille line, working with
  iOS, macOS, JAWS and NVDA.
- **APH Monarch** ([aph.org](https://www.aph.org/)): 10 by 32 cells, 3,840
  pins, multiline braille and tactile graphics, able to display images through
  KeySoft.

There is also an existing open-source tactile map project, **touch-mapper**,
which is licensed AGPL-3.0. It is **reference only** unless licence
compatibility is checked properly and the owner signs it off. Do not copy from
it on the assumption that open means usable here.

### What "ready for tactile" means concretely

It means the city model stays renderer-independent and exportable: buildings,
roads, landmarks, names, all in metres, with no drawing code in the way. That
is the rule at the top of this document, and the schema document is what makes
it real — a written contract another program can consume.

Round 6 moved this from principle to inventory. The model now carries the
street-level classes a wayfinding map is actually made of, each at its true
surveyed position: benches, waste baskets and bicycle parking; bus stops, with
their shelters noted; fire hydrants; crossings, kerbs and tactile paving as a
dedicated wayfinding list with their accessibility tags riding along; and
named attractions as landmarks. Placement fidelity is the accessibility
feature — a bench on a tactile map is a promise about where a bench is — so
every one of these comes from the extract's own surveyed nodes, never
invented, and the schema document defines them all.

It does **not** mean the game should grow an embosser export next.

### The safety rule, stated once and without exception

When tactile work does begin, every tactile dimension — dot height, dot
spacing, wall thickness, anything a hand reads — is a safety value. Each one
must be an owner-signed number taken from the governing specification, with a
documented safe range, enforced in code.

Too large merges dots and destroys cell recognition just as surely as too small
makes them unreadable, and no build check will catch either. There are no
exceptions to this and no defaults to fall back on.

### Sequencing

Tactile output and audio are both **on hold** until the visual and audio polish
of the game itself lands. Audio is its own future round with its own decisions
to make. Writing the roadmap down is not the same as starting it.

## What this document is not

It is not a commitment, an estimate, or a design review. Anyone starting either
piece of work should expect to make real decisions that this file does not
make for them — and to bring the owner-facing ones to the owner first.
