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

Round 7 took that inventory off the page and **drew it**. Three additions
matter for tactile work, and one of them is a warning rather than a gain:

- **The wayfinding list is rendered for the first time.** Round 6 collected
  crossings, kerbs and tactile paving; Round 7 put them on the map, under a
  map style named for them. Data nobody draws is data nobody checks, and the
  first time it was drawn it turned out to need two fixes before anything
  appeared at all — which is the argument for drawing an inventory as soon as
  you collect it.
- **Landmarks are findable rather than merely listed.** They carry a mark on
  the map and the map remembers which ones you have reached, per city and
  between sessions.
- **A non-visual path now exists for a task that has no visual answer**, and
  measuring it is the finding worth carrying forward. Round 7 added a
  character to find in the city, and then measured what a player can actually
  resolve: **a whole person is about 2.5 by 4.2 character cells at thirty
  metres**, and the brightest clothing stops separating them from the crowd at
  about twenty. So the spoken distance report is not an accessible alternative
  to looking — **it is the only instrument that works, for everybody**. When
  tactile output is designed, expect the same shape of answer: the legible
  channel is often not the one that looks obvious, and the way to find out is
  to measure the medium before designing for it.

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

## How the picture gets measured

A picture that stands still and a picture that is being walked through are two
different things, and only one of them can be judged from a screenshot. Three
rounds of this game were steered by stills and by a two-centimetre test step,
and the walk a player actually does is 4.8 m/s. There are now two instruments,
and they ask different questions.

**`scripts/stability-city-walk.mjs`** asks whether a nearly still picture
fractures: it scores a 0.05 degree turn and a two-centimetre creep, which is
the motion that was suspected of flashing.

**`scripts/seq-city-walk.mjs`** asks what the picture does while somebody walks
through it. It freezes the world's own clock, drives the pose analytically,
waits for one CONVERTED frame per step, and scores the converter's decisions
cell by cell. Its modes are the point:

| mode | what it stands for |
|---|---|
| `stand` | the control. It must read zero. A non-zero stand row means something else is still moving and no other number in the run means anything |
| `walk` | 4.8 m/s at the converter's 30/s governor, which is 0.16 m per converted frame - the walk a player does |
| `walkclamp` | the same walk on a 10 fps machine, where the clamped time step moves 0.48 m between two conversions |
| `look` | 1.5 degrees of yaw per frame, a moderate mouse sweep |
| `creep`, `turn` | the older comparators, kept so a new number can be put beside the old verdict |

### Reading what it writes

Every sequence writes four things into `--out`, and a run writes one WebM of
the whole session.

- **The contact sheet** (`-sheet.png`) tiles every converted frame with its
  frame number stamped on it. This is the filmstrip: what changed between two
  tiles is what a player sees change.
- **The flip map** (`-flipmap.png`) is one pixel per character cell, summed
  over the sequence. **Green** is glyph change, **red** is drive change (the
  intensity level in mono, the palette index in colour), **blue** marks a cell
  whose surface CLASS moved at some point. A green field with no blue in it is
  texture churn - the same surface picking different characters. Blue bands are
  geometry edges sweeping across cells, which is honest motion.
- **The class map** (`-classmap.png`) puts frame 0's surface classes on the
  left, one colour per class, and on the right the cells whose class moved.
  Reading it beside the flip map is what separates "this wall is boiling" from
  "the camera swept a wall past this cell".
- **The JSON summary** carries every table row, so a later release can diff
  against it rather than against a remembered number.

### The columns

Change rate is the plain per-frame churn. **Flip** is the A-B-A signature: a
cell that comes back to what it was two frames ago while its neighbours slide
on is flashing rather than moving, and a flip rate means nothing without the
change rate it is a fraction of. **Persistence** is the mean run length, in
frames, of one glyph in one cell - two scenes with the same change rate feel
completely different at 3 frames and at 15. **Churn cells** is the share of
cells that changed in more than half the frame pairs: the population that is
boiling rather than sliding. **Ghost** asks the opposite question, for the sake
of any future frame-to-frame memory: of the moments a cell's class changed and
the cell had ink in it, how often did its glyph fail to follow? A cell that
holds a stale glyph after the thing under it changed is a ghost.

The arithmetic lives in `src/js/game/seq-metrics.js` as pure functions over
typed arrays, unit-tested against three-frame sequences whose answers were
worked out by hand. The instrument imports that module through the dev server,
so the code the tests cover is the code that produces the numbers.

### What the instrument found first: the picture had no memory

The converter's per-cell decision was stateless. Every converted frame chose
each cell's character, brightness level and reverse-video flag from that frame
alone, so a texture scrolling one pixel was enough to choose a different
character, and the two brightness cliffs turned a one per cent drift into a
whole cell flipping. Measured on a Seattle street at the real walking speed:
**nine to eleven per cent of building-facade characters were re-rolled every
frame**, and a character survived six to eight frames on average.

Each of those decisions now has a dead band, and a cell keeps what it had
unless the new answer is better by more than the band. What makes that safe
rather than a smear is what DROPS the memory: a cell forgets the moment its
surface class changes under it or its reverse-video state flips - the two
moments when the thing it is drawing became a different thing - and no cell
may override the plain pick for more than a second in a row. The rules are one
small module, `src/js/_hfm-hysteresis.js`, and the same arithmetic is
carried in the GPU shader, which reads the previous frame's answers out of its
own previous render target.

Measured after: facade characters re-roll **one to two per cent** per frame
walking, a character survives **fifteen to sixteen** frames, and a standing
picture is still perfectly still. The share of surface changes where the
character failed to follow - the smear this could have introduced - went DOWN
rather than up, on both graphics cards and in both colour and monochrome.

It is off for everything except the game. The converter is shared with the main
application's Alt View, which converts one still frame, and a memory of a
previous frame can only cost it.

### Asking the scene which part of it is moving

`--scene-exp` takes one thing away from the scene and measures again, so a
churn number can be attributed instead of argued about. It changes nothing in
the repository and nothing is written: the mesh is altered in the page for the
length of the run.

The ground was the first thing it was pointed at. The pavement had been
photographed as a field of crawling stipple, and the reading of the flip map
was that the texture's mip-level rings were riding along with the walker. That
reading was half right, and the table is why the release that would have
rebuilt the ground pattern did not:

Class `ground`, looking down at the pavement, the frame-to-frame memory turned
OFF so the mechanism is visible, per cent of characters re-rolled per frame:

| what was taken away | 10% walk | 10% at 10 fps | 30% walk | 30% at 10 fps |
|---|---|---|---|---|
| nothing (the control) | 38.0 | 57.8 | 46.6 | 63.5 |
| the mip chain | 35.0 | 41.8 | 43.0 | 51.1 |
| the cell-raster blur | 35.0 | 41.8 | 43.0 | 51.1 |
| both | 35.0 | 41.8 | 43.0 | 51.1 |
| the tile spread over 2x the metres | 34.9 | 34.9 | 35.1 | 35.3 |
| ...4x | 21.2 | 32.4 | 28.3 | 38.8 |
| ...8x | 8.4 | 19.2 | 14.5 | 20.9 |
| **the ground texture itself** | **0.25** | **0.23** | **0.26** | **0.30** |

Read it downwards. The filtering is worth three to sixteen points, and the
mip chain and the blur turn out to be the same intervention: without the mip
chain the blur has nothing to bias, and with the blur at zero the mip level is
the natural one. Everything else is the scatter itself. Walking through a
pattern finer than a character cell's footprint means every cell sees
different marks every frame, and coarsening the pattern eightfold - which is
already a visible change to what the pavement looks like - still leaves eight
to twenty-one per cent. Only removing the pattern outright reaches zero.

The same shape holds on the building faces: taking the window texture away
drops a wall's churn from 8.0 to 3.6 per cent walking, and the rest is the
geometry itself moving past.

**So the ground was left alone.** The frame-to-frame memory already takes both
numbers to zero, including at the ten-frames-a-second worst case, and no change
to the sampling comes close to that. What the table says is that the ground's
crawl was never a filtering bug to be fixed: it is what a fine pattern does when
you walk through it, and the answer is the memory.

One measured option is left on the table rather than taken: the cell-raster
blur, which exists to stop window ROWS beating against the character grid, is
applied to the ground as well, and the ground has no rows. Turning it off there
would make the ground about a quarter steadier at ten frames a second. With the
memory on it changes nothing at all, so it is recorded rather than shipped.

### Three treatments of the solid bright layer

The brightest cells are not drawn as characters at all. At or above a
luminance of 0.80 the converter paints the whole cell in phosphor and knocks
the character out of it, and the shopfront bands are painted at 0.937, which is
the brightest thing the city draws. Standing across the street from a row of
shops, that is eight solid blocks in a row at eye level; a lamp cone paints a
solid patch on whatever wall it lands on.

There are now three selectable treatments, so they can be compared against one
scene in one session rather than remembered:

| | solid cells | shopfront band | what it looks like |
|---|---|---|---|
| `stock` | above 0.80 | 0.937 | what the game has always drawn |
| `calm` | above 0.80, share bounded | 0.871 | the blocks stay, the sweep is bounded |
| `off` | never | 0.777 | no solid cells anywhere; lit shopfronts drawn as characters |

Measured at a shopfront pose at the default size, standing: solid cells 2,936 /
2,261 / 0, and the shopfront class's LIT cells 4,162 / 4,097 / 4,042. Turning
the layer off costs three per cent of the ink in the shopfront band and all of
its solidity: the same shop is still lit, and now you can see the characters in
it. Under a sweeping look at the lamp pose, `calm` takes the solid-cell
crossings from 37,386 to 14,191 and `off` to zero.

**A share cap needs a bound, or it quietly becomes the other option.** The cap
is a controller: the previous frame's share raises the threshold for the next
one, because the solid decision has to be made before the character is chosen
and no cell can know the frame's total. In front of a wall of shopfronts, where
the natural share is four times the cap, the first version lifted the threshold
until every band had gone - and then oscillated, because the shopfronts are all
painted at ONE luminance, so no threshold keeps some of them and drops the rest.
Measured: 10,164 solid crossings over 47 standing frames where the uncapped
picture produced none. The lift is now bounded below the gap between the
threshold and the lit band, so the cap can bound a sweeping cone and can never
delete a lit ground floor. The same pose now settles in five frames and holds
flat for the remaining forty-two.

**None of this reaches colour mode.** The solid layer is a monochrome feature:
with a palette active the converter has no intensity ladder, so it paints no
solid cells at all. Measured across all three treatments, six poses and both
distances: zero solid cells in colour, every time. What is bright in colour is
the white palette entry, which is a different mechanism and a different
release's question.

### Colour mode had no way to say "this cell is dim"

Monochrome has an intensity ladder, so a dim cell is drawn dim and an empty one
is drawn empty: three to seven per cent of a monochrome frame carries ink.
Palette mode has no ladder. The cell contrast curve normalises every cell to
full scale before its character is chosen, and a palette entry is then put on
whatever came out, so a cell's ABSOLUTE brightness never reaches the picture.
Measured at the Seattle spawn: **seventy to eighty-nine per cent of every frame
carried ink, and about sixty per cent of all cells were WHITE**.

The histogram is the clearest way to see it. Mean cells per frame on each entry
of the six-colour green palette, standing at the spawn at the default size:

| entry | green | cyan | yellow | magenta | red | white | blank |
|---|---|---|---|---|---|---|---|
| without a budget | 6,305 | 2,802 | 5,543 | 1,373 | 2,299 | **41,559** | 7,277 |
| with the budget | 435 | 450 | 813 | 203 | 188 | **5** | 65,064 |

Six colours, and one of them was sixty-two per cent of the screen.

There is now an ink budget with two rules, both about the absolute luminance
the contrast curve threw away: a FLOOR below which the cell draws nothing (the
monochrome ladder's own blank level), and a GATE on white, which a cell may
take only if it is both bright enough and colourless enough. The sRGB match
that measures colour distance is untouched; the budget only decides which
entries a cell may choose from, and whether it draws at all.

**The white and the ink turned out to be separate problems.** Three settings,
measured at the spawn at the default size:

| | inked | white | what it looks like |
|---|---|---|---|
| no budget | 89.3 % | 61.8 % | large flat fields, mostly white |
| gate only, no floor | 89.2 % | 0.01 % | the same flat fields, now teal |
| floor 0.3 | 28.5 % | 0.01 % | a street again, with one large flat cyan wall |
| floor 0.5 (shipped) | 3.1 % | 0.01 % | near-black, with the lit signs and windows |

The gate alone removes every white cell and changes nothing else - which says
plainly that the flatness was never only about white. Take the ink away as
well and the flat fields go with it, at the cost of a much emptier picture:
at the monochrome floor, colour mode inks about as much of the screen as
monochrome does, because it is the same rule. Both palettes keep all their
entries in use at every setting - nothing collapses to two colours.



**Which GPU rendered it.** Windows hands a non-fullscreen Chromium the
power-saving adapter, so on a laptop with two GPUs the default is the
INTEGRATED one. Both instruments and the frame-time bench print the GL renderer
string on every table, and `--gpu-luid=<high>,<low>` (the LUIDs are listed on
`chrome://gpu`) selects the other. Two drivers rendering one identical scene
move about one per cent of the glyph picks, which is itself worth knowing: the
per-cell decision sits that close to a knife edge. The class pass, being a
deterministic id render, gives identical counts on both.

**That the sequence really happened.** The instrument asserts the frame count,
a constant grid, and a non-empty lit population, and it aborts on a software
renderer or on a dev server that does not serve its marker module. A sweep that
silently measured nothing has been this project's failure mode more than once,
and a tidy zero is what it looks like.

`scripts/bench-city-walk.mjs` remains the frame-TIME instrument and is separate
on purpose. It gained `--sizes` (a character-size sweep inside one browser
session) and the same `--gpu-luid`; its old "reverse" column has been retired,
because it counted reverse-video cells in the LAST converted frame - a snapshot
of wherever the walker happened to stop, which swung between 0 and 95,425
across runs of the same configuration. What the reverse-video layer does over a
sequence belongs to the sequence instrument, and it is reported per frame pair.

### One size, and a floor

The game used to measure the machine at the door and land it on whichever of
two sizes it could hold. That made a picture nobody else had: two players of
the same city were not looking at the same thing, and a screenshot could not be
compared with anybody's memory of it.

There is one default now - 30 per cent, a 3x6 pixel character cell - and it was
chosen from the bench rather than from taste. On the signed hardware target, in
45-second walks in heavy rain, it is the smallest size that holds thirty frames
a second on a four-times-slower machine in both the lightest city (41.6) and the
heaviest (43.6); the next size down does not (27 to 30). Ten and twenty per cent
are the same 2x4 pixel cell here because the font has a three-pixel floor, so
the ladder is really 10 / 30 / 40 / 50.

What a machine measures about itself is a FLOOR. It may raise the size, never
lower it, and a raise needs two consecutive visits to agree - one slow visit is
a busy afternoon, two is a machine. Nothing lowers a floor automatically; a
player who wants a finer picture chooses one, and their choice is remembered.
A size stored by the old calibration that is finer than the default is migrated
up to it, or the machine that wrote it would keep its private game for ever.

### What the owner chose when the pictures were on the table

The three treatments of the bright layer, the four settings of the colour ink
budget and the size were all put to the owner with the measurements and the
pictures beside each option. The answers:

- **No solid cells at all.** A lit shopfront is drawn as characters. It costs
  three per cent of the ink in the shopfront band and all of its solidity.
- **30 per cent**, as above.
- **Colour's ink floor at 0.3**, which leaves a street you can read, rather
  than the monochrome rule at 0.5, which empties it to a few lights.
- **Raise a park's surface above the ink floor**, knowing that puts it brighter
  than the road. Measured afterwards: the raise takes the share of park cells
  that draw in colour from 26 to 35 per cent, and then SATURATES - a much
  brighter tone adds two more points and nothing else. So the tone is set where
  the gain is, not where the brightness is.

## What this document is not

It is not a commitment, an estimate, or a design review. Anyone starting either
piece of work should expect to make real decisions that this file does not
make for them — and to bring the owner-facing ones to the owner first.
