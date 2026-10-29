# The Alt View's picture, measured

What the Alt View's converter learned from measuring a moving picture: a
still can be judged from a screenshot, a walk cannot, and the lessons below
(a memory for the glyph, the solid bright layer, the ink budget in color mode)
came from instruments that score the converter's decisions frame by frame.
The instruments, a census of what stands where, a stability still, a sequence
instrument and a frame-time bench, live with the game they were built for, in
its own repository; this note keeps what they found, because the converter
that drew that picture is the one that draws the Alt View.

## How the picture gets measured

A picture that stands still and a picture that is being walked through are two
different things, and only one of them can be judged from a screenshot. Three
rounds of the moving picture were steered by stills and by a two-centimetre
test step, and the walk a player actually does is 4.8 m/s. There are three
instruments, and they ask different questions.

**The census** asks a different kind of question from the
other two: not what the picture does, but what is IN it. It builds all four
cities with the real parser and the real builders and counts what stands where.

It takes a list of cities, a sample count, and a JSON path to write to.

It prints one column per city and a sample of coordinates under the table, so a
row that says 474 can be followed to the street it is on. The rows that matter:

| row | what a non-zero means |
|---|---|
| trunks / lamp posts inside a roadway | a prop standing on the tarmac. Both are counted from the obstacle's own square side, never lumped together: a 0.15 m lamp pole is not a tree, and a count that mixes them is a wrong number with a right shape |
| traffic vs parked, parked vs parked, traffic vs traffic | two cars occupying the same ground, as a true rotated-rectangle overlap rather than a distance |
| people in a roadway, no crossing | somebody standing in the road where the map records no crossing |
| floating buildings, roofs solid from the ground | measured here so the work that grounds them starts from a before number |

**It never re-implements a placement.** Every position it judges comes out of
the builders themselves - `buildStreetProps` writes down every car it places,
parked and moving alike - and the overlap test is the one the placement streams
use to refuse a spot. Two copies of a geometry test is how a census comes to
disagree with the build for a reason that is not a bug.

**The stability still** asks whether a nearly still picture
fractures: it scores a 0.05 degree turn and a two-centimetre creep, which is
the motion that was suspected of flashing.

**The sequence instrument** asks what the picture does while somebody walks
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
  intensity level in mono, the palette index in color), **blue** marks a cell
  whose surface CLASS moved at some point. A green field with no blue in it is
  texture churn - the same surface picking different characters. Blue bands are
  geometry edges sweeping across cells, which is honest motion.
- **The class map** (`-classmap.png`) puts frame 0's surface classes on the
  left, one color per class, and on the right the cells whose class moved.
  Reading it beside the flip map is what separates "this wall is boiling" from
  "the camera swept a wall past this cell".
- **The JSON summary** carries every table row, so a later release can diff
  against it rather than against a remembered number.

### The columns

Change rate is the plain per-frame churn. **Flip** is the A-B-A signature: a
cell that comes back to what it was two frames ago while its neighbors slide
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
rather than up, on both graphics cards and in both color and monochrome.

It is off for the main application. The converter is shared with the main
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
| the tile spread over 2x the meters | 34.9 | 34.9 | 35.1 | 35.3 |
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
| `stock` | above 0.80 | 0.937 | what had always been drawn |
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

**None of this reaches color mode.** The solid layer is a monochrome feature:
with a palette active the converter has no intensity ladder, so it paints no
solid cells at all. Measured across all three treatments, six poses and both
distances: zero solid cells in color, every time. What is bright in color is
the white palette entry, which is a different mechanism and a different
release's question.

### Color mode had no way to say "this cell is dim"

Monochrome has an intensity ladder, so a dim cell is drawn dim and an empty one
is drawn empty: three to seven per cent of a monochrome frame carries ink.
Palette mode has no ladder. The cell contrast curve normalizes every cell to
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

Six colors, and one of them was sixty-two per cent of the screen.

There is now an ink budget with two rules, both about the absolute luminance
the contrast curve threw away: a FLOOR below which the cell draws nothing (the
monochrome ladder's own blank level), and a GATE on white, which a cell may
take only if it is both bright enough and colorless enough. The sRGB match
that measures color distance is untouched; the budget only decides which
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
at the monochrome floor, color mode inks about as much of the screen as
monochrome does, because it is the same rule. Both palettes keep all their
entries in use at every setting - nothing collapses to two colors.



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

The frame-time bench remains the frame-TIME instrument and is separate
on purpose. It gained `--sizes` (a character-size sweep inside one browser
session) and the same `--gpu-luid`; its old "reverse" column has been retired,
because it counted reverse-video cells in the LAST converted frame - a snapshot
of wherever the walker happened to stop, which swung between 0 and 95,425
across runs of the same configuration. What the reverse-video layer does over a
sequence belongs to the sequence instrument, and it is reported per frame pair.
