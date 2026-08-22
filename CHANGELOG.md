# Changelog

All notable changes to the OpenSCAD Assistive Forge project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The streets have people, parked traffic and working signals** (CW-19) - the city was
  furnished but empty: nothing stood on the pavements and nothing sat in the road. It now has
  standing figures built from a real outline - head, shoulders, body, arms and legs, most of them
  frozen mid-step, and about one in six walking a dog - along with cars stopped in the travel lanes
  facing the way they would be going, and traffic lights at the junctions where three or more
  streets actually meet. Nothing moves except the signals, which is deliberate: this city is
  deliberately held still, and a traffic light that never changes is not a traffic light. The
  signals run in two groups so that when one street goes green the cross street is red, every
  colour holds for at least two seconds, and they stop entirely - holding a real colour rather than
  going dark - for anyone who has asked for reduced motion. They also only ask the screen to
  redraw when a light actually changes, roughly once every two seconds, rather than every frame.
  You can walk around the people, the signal posts and the parked cars; the cars stopped in the
  traffic lanes are scenery you pass through, because fencing off the lanes would turn the street
  into a maze. How many cars a street gets comes from what kind of street it is, which is the
  honest limit of what open map data can say - live traffic information is not freely available -
  and the code is arranged so a better source can be dropped in one place. Per city: 101 signals
  and 1,419 stopped cars in Seattle, 87 and 908 in Denver, 46 and 887 in Albuquerque, 52 and 539
  in Burnaby

- **Every surface speaks in its own characters** (CW-23) - the City Walk picked each character by
  how BRIGHT a patch of the screen was and nothing else, so a stretch of pavement and the side of a
  tower that happened to be equally bright came out looking like the same material. The game now
  draws a second, tiny picture behind the scenes - one pixel per character cell - whose only job is
  to say what each cell is looking at, and a small table decides which characters each surface may
  use. Roads get characters that lie down, so the roadway stacks into receding bands instead of a
  field of noise; walls get characters that stand up; foliage gets characters that clump;
  shopfronts and signs get the round, heavy ones. The table is plain data, one line per surface,
  meant to be adjusted by eye. Two of its rules are not taste, and the suite enforces both: every
  surface must be allowed the space character, or the darkest cells can no longer stay empty and
  the black the whole picture is built on fills in with texture; and every surface needs light,
  middle and heavy characters, or that surface flattens to one tone. Measured cost: about 1.1 ms a
  frame at the default character size and 1.7 ms at the smallest, against a budget of 3

- **A skyline past the fog** (CW-24) - the fog faded everything to black beyond about 260 metres,
  and a cell that is exactly black is an empty cell, so every tower past the fog was not being
  pushed into the distance - it was being deleted. The middle of the frame was a void even though
  the city data reaches 700 metres. Buildings now keep about a seventh of their brightness however
  far away they are, so a distant tower reads as a dim silhouette. Only buildings: the ground,
  roads and kerbs still fade to true black, because a dim carpet across the lower half of the
  screen is a failure this project has already made once. In colour the far towers keep their own
  hue, so the skyline reads as a coloured city rather than a grey smudge

- **Buildings no longer all wear the same windows** (CW-25) - every building used one identical
  window pattern, so once the picture had become characters, one tower's wall was
  indistinguishable from the next: colour told them apart, texture did not. There are now eight
  facade patterns, each cutting a different letter shape out of its lit window panes - not writing,
  just glazing bars, the way a leaded window has a pattern. Which one a building gets is fixed by
  the same identity that fixes its colour, so a building keeps its face for as long as the city
  data does. The patterns are painted when the city loads, so eight of them add nothing to the
  download

- **Monochrome is a choice now, not a loss** (CW-21) - with colour switched off the City Walk was a
  single flat tone: pavement, walls and lit shop signs all painted at exactly the same brightness, so
  turning colour off cost depth as well as hue. Real single-colour terminals never had that problem,
  because they separated things with an intensity attribute rather than with more characters - which
  matters here, since this project only ever draws the 95 printable ASCII characters and the densest
  one of those fills less than half its cell. Three things change. Darker parts of the picture are
  now driven at 65% of the phosphor rather than 100%, so pavement and distant walls sit back and lit
  surfaces come forward; nothing is brighter than it used to be, and the dim level is still
  6.45:1 against black in green and 5.03:1 in amber, both above the 4.5:1 this project holds itself
  to. The brightest cells - lit shop signs, billboards, lamp heads - flip to reverse video, a solid
  block of phosphor with the character knocked out of it, which is the only way to make a cell read
  as genuinely LIT when no available character can fill more than half of one; it claims about 1.9%
  of a street, chosen by counting: at a lower threshold every lit window turns solid too and the
  signs stop being the brightest thing you can see. And the picture now keeps a soft phosphor trail
  while you move, the way a slow tube smeared when it scrolled, gone within about three frames and
  gone entirely when you stop. The trail is motion, so it turns itself off for anyone who asks for
  reduced motion, including if that preference changes while you are walking. All of this is
  monochrome only - with colour on, each cell is already picked out by its own hue - and none of it
  reaches the main app's Alt View. Measured cost at the size the game starts at: the intensity and
  reverse-video work is lost in the noise, the trail adds about 5 ms and the game stays at 60 frames
  a second; at the smallest characters the trail takes it from 30.0 to 28.3

- **Street life, standing still** (CW-18) - the City Walk's streets had trees and parked cars but
  nothing above head height and nothing on the walls. Now streetlights march down every ordinary
  street and arterial, one every 30 m, alternating sides: a slim post with a bright head reaching out
  over the roadway, which at glyph scale is the row of bright dashes overhead that the reference
  screenshots show. Shop signs hang over the storefront glass, and the rarer big billboard high on a
  tower's flank. A sign is two pieces on purpose - a bright near-white plate with a deeply coloured
  face laid on it - because one piece cannot do both jobs: a tone bright enough to be the brightest
  thing on the street is too close to white for the colour quantizer to read as anything but white.
  So monochrome sees a bright bordered panel and colour sees a vivid one. Signs pick the wall people
  actually walk past rather than simply the longest, which moves the typical sign from about 20 m off
  the nearest street to about 13. A long parade of shops is a single footprint in OpenStreetMap, so a
  long frontage carries a row of up to four signs rather than one lonely one. Towers grow rooftop
  masts, and the pavement gets its scuffs back: the ground texture went from 150 single pixels to
  about 2400 short streaks laid in patches, so the near field reads as worn tarmac with lighter and
  darker stretches instead of near-black. Per city that is 659 to 1071 lamps, 226 to 343 signs and
  54 to 130 masts. The cost, measured on this machine's real GPU: about one frame per second at the
  default character size and a third of one at the smallest

- **Colour is now a switch of its own** (CW-Q16) - colour used to arrive only with high contrast, so
  anybody who wanted the city in colour had to take high contrast with it, and anybody who wanted the
  authentic single-colour retro screen had to give up high contrast to keep it. The game's header
  carries a third button, Colour, with O as its key, and the two are independent. Nothing changes for
  anyone who does not press it: with no choice stored, colour still follows high contrast exactly as
  it did. Once you press it, your choice is remembered and outranks high contrast in both directions.
  Turning colour off is not a step down in legibility - the single phosphor measures 15.3:1 (green)
  and 11.5:1 (amber) against the black screen, and a test now reads those from the same token the
  renderer reads so that stays true

### Changed

- **The City Walk runs at full frame rate from its default size upwards** (CW-22) - the game draws
  its picture by stamping one character at a time onto a canvas, and asking the canvas to draw
  something costs about the same whether the thing is big or small. At the size the game starts at,
  that stamping was over half of all the work in a frame. There was already a faster way in the code
  - build the whole frame in memory and hand the canvas one finished picture - but it was only used
  for characters 4 pixels wide and under, and the game starts at 5. Measured with timers inside the
  converter, the faster way wins at every size, so the size limit is gone. At the default size a
  conversion drops from 40.7 to 17.5 ms and the game goes from about 42 to 60 frames a second; at 60%
  character size, which was the slowest setting in the whole game despite drawing fewer characters
  than the default, from 48.7 to 15.6 ms and 38 to 60 frames a second; at the largest characters from
  25.0 to 12.9 ms. Everything from 40% down was already using the faster way and is unchanged.
  Nothing looks different, and that is checked rather than asserted: 40 full-frame comparisons across
  two cities, monochrome and colour, at every character size from 2 to 12 pixels wide, found 0
  differing pixels out of about 1.6 million on every colour channel, and the suite now carries that
  comparison against a hand-written reference so it stays true. The main app's Alt View gets the same
  speed-up and the same unchanged picture. The phosphor afterglow still draws character by character,
  because layering the previous frame on top is the one thing a single buffer cannot do

- **The retro colour palettes read as colour more of the time** (CW-Q11) - measured by counting the
  pixels the game actually paints, nearly half of a high-contrast street had no colour in it at all.
  Three changes cut that to about a quarter: the quantizer's chroma boost rises from 3.5 to 5.0,
  which is the point where every tinted surface in the scene lands on a colour rather than washing
  out to white (genuinely grey things - pavement, curbs, lamp posts, sign plates - still come out
  white, as they should); the amber neon set gains a seventh entry, a foliage green, because tree
  crowns and yellow-green buildings had both been landing on the same lime; and the green set's soft
  red becomes a saturated one, which was carrying the most work of any entry and now hands the
  warm-yellow hues back to yellow. Every entry is still guarded at 4.5:1 or better against black

- **Twice the city** (CW-17) - each of the four City Walk cities now covers twice the ground it did.
  The bake radius moves from 500 m to 707 m, which is the number that doubles the AREA; doubling the
  radius would have quadrupled it. All four extracts were rebaked from OpenStreetMap at the same
  centers. Seattle grows from 272 to 475 buildings and 569 KB to 1016 KB, Denver from 190 to 330 and
  343 KB to 893 KB, Albuquerque from 248 to 638 and 310 KB to 610 KB, Burnaby from 183 to 436 and
  351 KB to 628 KB; the playable area of each goes from about 1.1 square kilometers to about 2.1.
  Only Seattle had real map trees before, because the tree query arrived with CW-16 and only Seattle
  was rebaked then. Now all four do - Denver alone carries 2291 of them, and its downtown streets read
  as the leafy ones they are. Two things the extra ground does not cost you: the far city still fades
  into the fog at the same distance, because that is a look and not a boundary, and the frame rate at
  the default character size is unchanged, because the whole city has always been a handful of merged
  meshes rather than one mesh per building. The extra ground is emptier than the middle, so the city
  is in fact more walkable than it was: the share of it blocked by buildings falls in three cities of
  four. What it does cost is the download - the largest city goes from 76 KB to 137 KB compressed -
  and about a fifth of a second more to open a city on this machine

- **Trees and parked cars along the streets** (CW-16) - the City Walk's streets were empty tarmac
  between the buildings: correct, and nothing like a city anybody has stood in. Trees and parked cars
  now furnish them. The trees are the real ones first - the bake script asks OpenStreetMap for its
  `natural=tree` nodes, and Seattle's extract carries 119 of them, planted where the map says they
  stand - and then a deterministic infill fills the gaps along residential, tertiary, pedestrian and
  living-street curbs about every 18 m, on the sidewalk side of the curb line. A trunk is 2.5 m of
  dark stem and the crown starts at 2.2 m, above eye height, so you walk under the leaves and around
  the trunk. Cars park in hashed runs with gaps, 40 to 60 percent of the slots filled, parallel to the
  curb and just inside it, on ordinary streets only - nobody leaves a car on a motorway. Each is two
  boxes, a body and a slightly brighter cabin, in varied tones so a parked row reads as separate cars
  rather than one long block, and a tone below the buildings so the lit shopfronts stay the brightest
  thing at street level. Under the monochrome modes the props are what the reference calls the life
  band: a seam of glyphs where the buildings meet the road. Under high contrast the crowns
  quantize to the palette's green in dark mode and its lime in amber, so a tree is a tree at a glance.
  The map view stays a clean street network - props hide there exactly as the curb lines do. Cars and
  trunks are solid: walk into one and you stop. Crowns are not, because they are over your head. The
  same rule that keeps a prop out of a building keeps the player out of a prop - the collision grid is
  built from the buildings first, so nothing is ever placed inside one, and the props' own footprints
  are stamped in before the spawn point is chosen, so nobody starts a game inside a parked car.
  Measured across the four cities: 594 to 809 trees and 952 to 1213 cars each, all merged into three
  draw calls

- **Every City Walk key gets a button** (CW-15) - the game was a keyboard game. Someone playing with a
  mouse alone could launch it and pick a city, and then reach nothing: walking, turning, looking, the
  map, the landmarks and both size controls were keys and only keys. A toolbar now runs along the
  bottom of the layer, one button per key, in six named groups - Camera, Move, Speed, Characters, Map
  and Landmarks - with the group names shown, so the two smaller/larger pairs are never a guess. Hold
  a movement button and the player keeps moving for as long as the mouse is down; click it and you get
  one 250 ms step, which is also what Enter or Space does when the button has focus, because a key
  press has no duration of its own. Every button drives the action its key already drove, so the map
  view reinterprets them exactly as it does the keys: Forward walks a street and pans a map. Buttons
  that would do nothing in the view you are in are not left lying there - Look up, Look down and Fast
  step aside in map view, and Center on you, Zoom out and Zoom in take their place, announced. Fast is
  a sticky toggle rather than a held key, because a mouse cannot hold Shift; it carries its pressed
  state and Shift still works alongside it. The strip is one row on a wide window and wraps by group
  on a narrower one, every button keeps the 44 px hit-target floor, and the help panel and landmark
  legend now measure the toolbar and stop above it instead of covering the buttons. Contrast was
  measured on the real buttons at rest and hovered in all four in-game states, the pressed toggle
  among them; the worst of the twenty readings is 7.22:1

- **C and T in the City Walk** (CW-Q15) - the two accessibility toggles CW-14 put in the game's header
  now have keys as well: C turns high contrast on and off, T cycles the theme. Both run through the
  same handlers the buttons call, so there is one announcement and one place the labels are kept
  honest, and Ctrl+T still belongs to the browser

- **Accessibility toggles inside the City Walk** (CW-14) - the game layer is a modal that traps focus,
  so the app header's high contrast and theme buttons were out of reach for as long as you were
  walking. The game's own header now carries both, in the same order the app header uses: High
  contrast, Theme, then Help and Exit game. They call the app's existing theme manager, so a flip made
  inside the game is the same flip as one made outside it, and it is still in force when you leave.
  High contrast is a toggle button that carries its pressed state, and switching it on mid-walk raises
  the multicolour high-contrast palette over the city without a reload; switching it off returns the
  single phosphor. The theme button cycles the app's three settings and names the one it is on - Auto,
  Light or Dark - and because the phosphor colour is the theme's accent, dark walks the city in green
  and light walks it in amber, swapping live as you press. Both buttons announce what happened through
  the game's own in-layer announcer rather than the app's status line, which a modal hides, and both
  keep their labels honest when the flip arrives from somewhere else. The pressed pair was measured on
  the real button at rest and hovered in all four states the game can be in; the worst of the eight
  readings is 9.46:1

- **Look up at the towers in the City Walk** (CW-13) - the game's camera is no longer fixed to the
  horizon. R and F tilt the gaze up and down at 45 degrees a second, stopping at 60 degrees either
  way, and V returns it to level and says so. Dragging the viewport with a mouse looks around too,
  at a quarter of a degree per pixel, with no pointer lock and no cursor capture - a press that
  travels less than four pixels is still an ordinary click. The bearing survives every tilt, so
  looking up at a tower and then walking still walks the way you were facing, and the HUD adds
  "looking up" or "looking down" while the gaze is tilted. Every look action has a key; the mouse
  drag is an addition, never the only way to reach anything. The map view keeps both hands off:
  walking is suspended there and so is looking around

- **City Walk characters small enough to disappear into** (CW-12) - the game's character size now
  runs from 10% to 100% in ten-point steps, replacing the old 50-250%, and persists across
  sessions on its own preference key. The floor was MEASURED rather than guessed: at a fullscreen
  game viewport the converter's automatic base font is 21 px, so 10% lands on the renderer's own
  3 px floor - the smallest size that still changes anything on screen. Getting there needed two
  renderer fixes. Painting a frame of 238,000 character cells was calling drawImage once per cell,
  which cost more than everything else in the conversion put together; below a 4 px cell the
  glyphs are now composed into one buffer and handed to the canvas in a single putImageData,
  measured 4-5x faster (30% went from 143 ms a frame to 34 ms) and proven pixel-identical to the
  old path. And a glyph rasterized into a 2x4 pixel cell is almost all antialiasing, which was
  quietly dimming the whole city as the characters shrank - in amber the brightest pixel of a
  frame measured 4.08:1 on black - so tiny glyph atlases are now normalized back to full opacity
  (amber's floor measures 8.99:1 after, high contrast dark 19.43:1). The brightness
  treatment is opt-in per caller, so the main app's Alt View keeps exactly the rendering it had;
  it does share the faster paint path, which changes speed and not one pixel

- **City Walk is desktop-only, like Classic** (CW-11) - the hidden game card's "Enter the City"
  button now gates on the same viewport shape as the Classic interface (at least 1024 px wide and
  not portrait, U-10/Q-24a). On a phone-shaped window it reads as unavailable, shows a
  plain-language reason on the card that is also its accessible description, and a press announces
  the refusal instead of starting a game whose controls were never designed for that shape. The
  gate is ENTRY only: a session already running survives any resize, Escape always leaves, and the
  button re-enables live when a desktop-shaped window returns, with no reload

- **ASCII City Walk Round 2 — a city that looks alive** (CW-8, CW-6, CW-9, CW-10) — the game's
  comprehensive visual pass and feature round. Buildings are now distinct: window-grid wall
  textures (world-meter UVs, no custom mapping), deterministic per-building lightness tiers and
  palette-family hues carried as vertex colors, lit storefront strips on the ground floor, and
  streets drawn at eye level as curb lines that fade under the fog (surfaces stay black — any
  visible surface tone carpets the horizon). The signed high-contrast color model ships: the ANSI
  bright terminal set in green+HC, the cyberpunk neon set in amber+HC, single phosphor everywhere
  else, via a new per-instance palette mode in the Alt View converter (per-color glyph atlases,
  chroma-normalized per-cell picks that survive fog, guarded ≥4.5:1 on black). Character size is
  adjustable in-game (-/=; see CW-12 below for the range that superseded this one). The map view is
  navigable: arrows pan at constant screen speed, -/= and the mouse wheel zoom 0.4×–8×, Home
  recenters on the player (follow mode), solid emissive-free block masses over dark street
  corridors. Walking speed is a persistent 0.5×–3× multiplier on [ and ]. And every city carries
  up to twelve landmarks (rebaked extracts keep tourism/historic/amenity tags): map beacons,
  L/Shift+L cycling with announcements, a real-text legend with compass directions, and
  "near NAME" street-view proximity announcements with hysteresis

### Fixed

- **A dialog you open during a tour is now a dialog you can answer** (UF-36, D-61) - following the
  Main Page tour on a phone to the Clear Cache step and pressing the button it points at left people
  stuck. The tour did shrink to its pill, but shrinking is not standing aside: the dimming veil kept
  painting over the dialog, the highlighted button kept the ring and the raised position the
  spotlight gives it, and the pill kept the dialog's bottom corner. On a phone-sized screen that
  button lands squarely across the dialog's own Cancel and its red confirm, so aiming at either one
  pressed the page button underneath instead - and each press opened another copy of the same dialog,
  every one of them with its Cancel buried the same way. Now, whenever a dialog you opened is on
  screen, the tour stands down completely: no veil, no ring, and the pill moves to a gap the dialog
  leaves or steps off screen when it leaves none. Close the dialog and the tour comes back exactly
  where it was, ring and all. This covers every dialog a highlighted control can open, not only Clear
  Cache. The one case that keeps its spotlight is a step whose subject IS the open dialog, like the
  Features Guide step, which is unchanged. The Clear Cache step also now says what Cancel does, and
  still tells you about the checkbox that keeps your saved projects

- **The tour overlay stopped climbing above its own head** (UF-36, D-67) - the code that lifts the
  tour above awkward parts of the page measured the highlighted element itself, which the tour had
  just raised a moment earlier. So on every single step it read its own work back and lifted itself
  higher again, which is how the dimming veil ended up above dialogs it should never have covered.
  The layering is now written down once, in the design tokens, instead of being rediscovered on each
  step, and the last hardcoded stacking numbers in the tutorial code moved onto those tokens. Nothing
  about the finished picture changes: the ring still shows through the veil, the tour card still sits
  above both, and the tour's own dialogs still sit above the card

- **The contrast modes finally get the thicker focus ring they ask for** - both the app's own high
  contrast mode and the operating system's "increase contrast" preference are supposed to draw a
  heavier ring around whatever has keyboard focus, and neither ever did on a button or a link. The
  rule that paints those rings carried a hardcoded width that overrode the setting, so people who had
  asked for a stronger focus indicator were quietly getting the ordinary one. Nothing changes for
  anyone who has not asked for more contrast. The test that was supposed to cover this could not:
  it measured whatever the first Tab press happened to reach, and accepted the ordinary ring as a
  pass, so it now focuses a known control and checks the ring both with the preference and without it

- **The header toggles no longer lie about the state they are in** (D-60) - the high contrast and
  theme buttons each wrote their spoken label only inside their own click handler, so any other route
  left the label saying the opposite of the truth, to the one group of people who cannot see the
  button change. Three routes reached it: the keyboard shortcut, the City Walk's in-game toggles
  (which act on the same setting from inside a modal that hides the header), and - under the Auto
  theme setting - the system simply changing colour scheme, with nobody touching anything at all.
  Both labels now follow the theme manager itself, which every route already notifies

- **The Classic button reads clearly while it is unavailable** (CW-Q13c) - on a window too narrow for
  Classic the header button stays focusable and explains why, dimmed so it also reads as unavailable
  without relying on colour. That dimming was quietly costing the label its legibility: measured
  across all eight theme states, five sat below the 4.5:1 minimum, the worst of them in high contrast
  and the mono Alt View - the modes people choose because they need contrast. The dimming is gentler
  now, so the worst reading is 5.35:1 and the button still reads as unavailable. Nothing had caught
  this because nothing could: a dimmed control blends with whatever is behind it, and automated
  contrast checks skip disabled controls entirely, so the guard added here does the blending itself

- **City Walk: help panel rendered under the ASCII glyphs** — the overlay canvas carries
  z-index 5 and the help panel (and the new landmark legend) defaulted below it, so both panels
  were occluded by the rendered city; visibility assertions cannot detect occlusion, which is why
  no test caught it. Both panels now sit at `--z-index-dropdown`, verified by screenshot

- **ASCII City Walk — a playable game inside the hidden Alt View mode** (CW-1…CW-5) — unlocking
  Alt View now also reveals a game card on the welcome screen. Pick one of four bundled cities
  (Seattle, Denver, Albuquerque, Burnaby — built from real OpenStreetMap building footprints,
  heights, and streets; Map data © OpenStreetMap contributors, ODbL) and walk it in first person,
  rendered entirely through the existing ASCII pipeline in the active phosphor (green dark /
  amber light). Keyboard-only controls (arrows/WASD walk, Q/E turn, Shift faster, M toggles a
  top-down map view with a player beacon, H help, Escape exits), fullscreen modal layer with a
  capture-phase focus trap, in-layer screen-reader announcements, and persistent map-data
  attribution. The Alt View renderer was refactored from a module singleton to per-instance
  state (public API unchanged) so the game and the model preview can each hold their own ASCII
  view; city extracts are baked by `scripts/bake-city-extract.mjs` (Overpass API, tags trimmed,
  ODbL attribution stamped) into `public/examples/ascii-city/`, load lazily, and are excluded
  from the bundle budget under the same lazy-payload rationale as liblouis. New unit suites
  (parser/heights/ring-stitching, collision/movement/compass, scene build, alt-view instance
  isolation) and an e2e spec (gating, keyboard flow, map toggle, focus restore, axe scans of the
  open layer)

### Fixed

- **A click on the City Walk killed the keyboard** (D-59) - the game's viewport is not a focusable
  element, so a plain click anywhere on the city moved focus to the page body, outside the layer
  the game's key handler is bound to. Every key stopped working for the rest of the session, in
  both the street and map views, with only Escape and Tab as a way back and nothing on screen to
  say so. Present since the game first shipped; found while checking that the new mouse drag left
  the focus trap alone, and measured on the release base before and after the fix

- **Mono variant: primary buttons keep a legible label while hovered** (D-55 pattern) — the mono
  theme's generic button hover repaints the surface with `--color-hover-bg` and nothing else,
  which under a primary button's black label measured **1.11:1** (label erased on mouse-over) on
  every primary button in the hidden theme. Found by the City Walk axe scan, which deliberately
  hovers a real button — a hover state is invisible to a scan unless something happens to be
  hovering. variant.css now completes the pair by flipping the hovered label (and its
  `currentColor` icons) to the accent: measured 7.2:1 (green) / 10.2:1 (amber), guarded by new
  token-pair tests beside the existing mono contrast guards

- **Braille editor (Unicode) extended to the Braille Sign** (Braille Sign 1.2.0) — the
  card tool's hand-editing panel now appears in the sign tool too, wired to the sign's
  `Line_1`–`Line_6` braille parameters. On a sign it drives the **braille plate only**:
  the raised letters keep wrapping from the text box, because ADA 703 treats the two as
  separate plates and correcting a contraction by hand should not silently rewrite the
  printed word above it. Braille beyond the sign's six rows is reported as an error and
  dropped rather than truncated silently, and non-braille characters still block the
  parameter write so the sign keeps its previous valid braille. "Translate to braille"
  fills the editor from the same wrapping pass the sign would otherwise have rendered,
  so what you edit is exactly what you were about to get. Charm mode is deliberately
  excluded — one cell per character leaves no rows to edit. Adds a `skipBrailleRows`
  option to `layoutSignText()` (letter rows only, no translation) so the editor path
  cannot raise cell-capacity warnings about braille the sign is not going to carry, and
  factors the editor's parsing and validation into a shared `parseBrailleField()` used
  by both modes

### Changed

- **Braille Card example synced to wedge-card 1.2.1** — `Line_9`–`Line_20` moved into a
  `[More Braille Lines (Advanced)]` Customizer group, so the parameter panel opens with
  eight text fields (the `grid_rows` default) instead of twenty, and the settings below
  them are reachable without scrolling past twelve empty boxes. Parameter names are
  unchanged, so saved presets and the translation panel's writes are unaffected; the
  group renders collapsed like every other group. Also corrects the example's stale
  `VERSION` header

- **Braille editor (Unicode) for the Braille Card** — a collapsible editor in the translation panel holds one line of editable Unicode braille per card row. "Translate to braille" fills it from the typed text through the normal wrap pipeline; "Translate to text" back-translates it on-device (new `backTranslate` message type in the liblouis worker + `backTranslateText()` in `braille-translator.js`) so a braille reader can verify pasted braille. Whenever the editor has content the card embosses it exactly as written — no liblouis pass — with per-line validation (braille block U+2800–U+28FF only, line capacity) and the same multi-card chunking, pager, and render-all handling as translated text. A dirty-state lock keeps hand-edited braille authoritative (editing the English text clears only pristine, translation-mirroring content), and every fill/clear is announced through a visible status live region. Ported from the braille-cylinder-stl-generator project. Includes a UEB number-sign help note (hyphens end numeric mode, so `206-543-4779` legitimately needs three number signs; the BANA form `206.543.4779` needs one) in the panel and `BRAILLE_CARD_GUIDE.md`
- **Friendly download names for cards and signs** — card and sign exports join the charms in being named after their content: `Braille Card hello.stl`, `Braille Card 2 of 3 hello.stl` (paging), `Braille Cards hello.stl` (render-all), `Braille Sign Exit.stl`. When braille pasted into the braille editor is the only input, the first line is back-translated on-device to recover a name; the hashed default remains the fallback. The multi-card pager hint and render-all notice now show the real export name
- **Edge detail limit** — a new select in the Preview Settings drawer caps how many segments the Show Edges overlay may draw: Low (25,000), Balanced (75,000, the default), High (250,000), or Unlimited. When a model exceeds the cap the overlay keeps the *longest* segments, so silhouettes and structural lines survive while the short tessellation facets that turn a dense keyguard into a solid dark mass are dropped. A readout under the select reports the result ("Showing 75,000 of 214,338 edges") after every rebuild, and the choice persists per app profile
- **Per-theme edge-overlay colors** — the Show Edges overlay color now comes from a new `edges` entry in every `PREVIEW_COLORS` theme (held to ≥4.5:1 against the model color per W3C thin-stroke guidance, enforced by a new contrast unit test) instead of a hardcoded light/dark pair, and the overlay rebuilds on theme change via `refreshThemeSensitiveOverlays()`
- **Braille Charm multi-charm mode** (Braille Charm 1.3.0) — each non-whitespace character of the typed text becomes its own charm, translated individually (a capital's indicator cell shares its charm). The new **Generate all charms** toggle (on by default) renders every charm side by side in one model, laid out along the bed and separated by the new `charm_gap_mm` parameter (default 5 mm), via `charm_layout = "All charms"` and twelve `Charm_1`–`Charm_12` slots; with the toggle off, a Previous/Next pager steps through the charms ("Charm 2 of 7 — r") and renders each one separately. The panel warns per charm when a character exceeds the 2-cell face budget, when a word needs more than the 12 in-file slots, and (in the SCAD console) when the combined layout exceeds ~250 mm of bed width. The raw `braille_chars` parameter still accepts pasted Unicode braille for a single charm
- **Friendly braille-charm download names** — charm exports are named after their content instead of the hashed default: `Braille Charm B.stl` for a single charm (the character as typed) and `Braille Charms Brennen.stl` when generating all charms in one file; applies to the download button and all export-format menu items (new `resolveDownloadFilename` helper in `download.js`)

### Changed

- **Show Edges is on by default.** The outline overlay makes shape, wall thickness, and feature boundaries legible without rotating the model, which matters most for the low-vision users the Forge targets — but it was hidden behind a View menu item most people never found. It now starts on, bounded by the new edge detail limit so dense models stay responsive. A saved preference still wins: anyone who explicitly turned edges off keeps them off, with no migration
- **Reference-image help text is now visible to sighted users.** The note explaining that an overlay image is a visual guide only — it does not modify the SCAD file — was marked `sr-only`, so only screen-reader users ever heard it and several sighted users reasonably assumed the PNG/JPEG/SVG upload was a model import. `#overlaySourceHelp` now renders as visible tertiary-colored helper text under the overlay source row (new `.overlay-source-help-text` class) while remaining the control's `aria-describedby` target, so both audiences get the same explanation
- **Upstream attribution repointed after the braille repos were split and renamed.** The sign and charm generators moved out of `braille-wedge-card-openscad` into [braille-sign-openscad](https://github.com/BrennenJohnston/braille-sign-openscad) and [braille-charm-openscad](https://github.com/BrennenJohnston/braille-charm-openscad), and the cylinder pair was renamed to `braille-cylinder-stl-generator` / `braille-cylinder-stl-generator-openscad`. The `braille-sign` and `braille-charm` manifests' `inspired_by.reference`, all three example SCAD headers, the welcome-screen link, the braille guide's licensing section, and the liblouis worker's attribution comment now name the right upstream repo. Each example's SCAD header separates its own upstream from the wedge card it borrows the dot system from, and the integration tests assert the matching repo slug per example rather than all three asserting the wedge card
- **Braille Card auto-sizes by default** (Braille Card 1.2.0) — `auto_size_card` now defaults On, so short labels come out as small cards that fit the text plus margin instead of a mostly empty 200 × 100 mm face; the panel's Card size select gains a matching **Auto-size to fit text** option (the new default) and syncs back to it whenever auto-sizing is on. Fixed presets (Business card, Postcard, …) still turn auto-sizing off and use the manual capacity math
- **Thinner braille defaults** — the Braille Card's `card_thickness_mm` default drops 1.5 → 1 mm, and the Braille Sign's `plate_thickness_mm` (Braille Sign 1.1.0) drops 3 → 1 mm with the slider minimum lowered 2 → 1 mm, saving filament and print time on parts whose stiffness comes from the leaning print orientation

### Fixed

- **Silent grid_rows reset in the Braille Card panel** — editing the raw `grid_rows` parameter used to be overwritten without notice by the panel's next layout (which always re-wrote the clamped capacity value). `grid_rows` and "Max rows per card" are now synced two ways: a direct parameter edit updates the panel input, and when the card height cannot fit the requested rows the clamp is surfaced in the warning tier and announced to screen readers ("Rows per card limited to N by the card height") instead of happening silently. The requested value stays put (sticky intent), so it takes effect again as soon as the card grows
- **Show Edges never refreshed after a parameter change.** The display-options controller subscribed to the preview's post-load event during app startup, but the `PreviewManager` is not constructed until the first SCAD file loads — so the subscription read a `null` manager, returned without registering anything, and was never retried. The outline stayed frozen on whatever geometry was current when the toggle was last flipped, and theme-driven edge recoloring was dead for the same reason. The one-shot private hook is replaced by a public, idempotent `connectPreviewManager()` that `file-handler.js` calls once the manager exists (alongside the existing overlay/grid call), re-targets cleanly if the manager is ever replaced, and self-heals if some other path creates one. Toggling the overlay by hand always worked, and Alt View installed its own refresh hook, which is why the bug looked intermittent
- **Edges overlay desync** — the Show Edges overlay was added to the scene with a one-time copy of the mesh transform, so any later mesh movement (recentering, auto-bed, rotation centering) left the outline floating in the wrong place. The overlay is now parented to the mesh itself and inherits every transform, and the model materials gained `polygonOffset` so the overlay lines are not chewed up by z-fighting with the facets they trace (technique ported from the braille-cylinder-stl-generator project)
- **Light-theme model contrast (WCAG 2.2 SC 1.4.11)** — the light theme's model colors were the desktop Cornfield pair `#f9d72c` / `#9dcb51`, which measure 1.3:1 and 1.7:1 against the `#f5f5f5` viewer background and fail the 3:1 non-text contrast requirement. They are darkened in the same hues to `#9a8200` (3.5:1) and `#5a8a22` (3.8:1); all themes' model, back-face, and edge colors are now verified computationally by `tests/unit/preview-colors-contrast.test.js`

### Security

- **Three high-severity transitive advisories patched, unblocking the CI Security Checks job.** `fast-uri` 3.1.3 → 3.1.4 ([GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) — host confusion via a literal backslash authority delimiter) is the only one that ships, reaching the bundle through the `ajv` runtime dependency. The other two are build-time only: `postcss` 8.5.16 → 8.5.25 ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) — path traversal in `sourceMappingURL` auto-loading) via `vite`, and `brace-expansion` 5.0.7 → 5.0.9 ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — denial of service via unbounded expansion) via `eslint` → `minimatch`. All three fixes land inside the semver ranges already declared in `package.json`, so the change is confined to `package-lock.json` and `npm audit --audit-level=high` passes again

---

## [4.5.0] - 2026-07-12

### Braille Toolset, SVG Pipeline Overhaul & Alt View Rework

Feature release introducing the Braille Card Customizer tool family (card, charm, and sign with on-device liblouis translation), a rebuilt SVG import/preparation pipeline, a faster and simpler Alt View engine, a WebGL 1 fallback fix for the 3D preview, and watertight STL exports for the charm generators.

### Added

- **Braille Card Customizer** — a new welcome-screen tool family: type plain text and get 3D-printable braille, with translation to Unicode braille running entirely on-device (liblouis compiled to WebAssembly in a Web Worker — text never leaves the browser). The **Braille translation** panel offers English UEB/US Grade 1 and Grade 2 tables, a preserve-capitals toggle (on by default), card-size and margin presets, BANA-style word wrapping with multi-card overflow splitting, a live braille preview with per-line cell counts and severity-tiered errors/warnings (alert vs status live regions), a keyboard card pager, and a render-all-cards mode; `scripts/setup-liblouis.js` (wired into `prebuild` and `pixi run setup`) copies the engine and curated tables with their full include closure into `public/liblouis/`. See `docs/guides/BRAILLE_CARD_GUIDE.md`
- **Braille Card** (`?example=braille-wedge-card`) — a card that prints leaning back at 75° (the CHI 2024 research angle) with break-away support fins, adapted from the Braille Wedge Card STL Generator (relicensed GPL-3.0-or-later by the copyright holder for the Forge); defaults to a manual 200 × 100 mm face with ADA-friendly dot geometry and BANA-standard spacing
- **Braille Charm** (`?example=braille-charm`) — a small pendant, keychain charm, or zipper pull carrying one or two braille cells, combining the Charm Customizer base with the wedge card's dot system (see the bracelet clip entries below)
- **Braille Sign** (`?example=braille-sign`) — a two-part tactile sign with 2010 ADA section-703-style defaults: raised uppercase Liberation Sans letters on one plate and the same text in Grade 2 braille on a second, a split raised border that joins into one frame when mounted, up to 6 rows per script wrapped independently (permitted by ADA 703.3.2), and auto-fit sizing that grows the plates to their content

- **Braille Charm bracelet clip shape (new default)** — `charm_shape = bracelet_clip` adds the Charm Customizer's C-clip bracelet charm (q_charm lineage, AAC prior art by Duy Do / UW WOOF3D) to the Braille Charm as its default shape; it always exports standing vertically (the C profile lies on the bed, braille on the vertical outer wall) so the dots print crisply with no support fin. The braille is rotated 90° on the face (selectable ±90) to read along the band when worn, centered by default with left/right and up/down offset nudges. Fit parameters (channel length, clip height, profile depth, wall thickness, gap width/offset) and the full q-charm rounding set (outer/inner corner radii, edge radius, rounded top rim — bottom rim stays flat for bed adhesion) live under a Bracelet Clip group shown only when the shape is selected (`@depends`)
- **Braille Charm Large/Small Charm presets** — `presets/large-charm.json` and `presets/small-charm.json` mirror the original Bracelet Clip Charm's preset sizes, mapped onto the braille charm's clip parameters and auto-imported when the example loads
- **Braille Charm `bed_contact_mm` parameter** — the Angled-mode bed sink (previously hardcoded at 0.6 mm) is now exposed and defaults to 2.0 mm, trimming the leaning charm's bottom edge into a flat first-layer contact strip with real surface area instead of a knife edge

- **Alt View on-demand rendering** — the ASCII conversion now runs only when the camera moves, auto-rotate is active, or a setting changes (dirty-flag + `invalidate()` API with a 1 Hz self-healing fallback tick), dropping idle Alt View cost from a continuous ~30 fps conversion loop to near zero
- **Alt View glyph atlas** — glyphs are pre-rendered once into a phosphor-tinted atlas (from `--color-accent`) and painted with `drawImage` blits at device-pixel resolution; shape vectors are computed from the same atlas bitmap so glyphs align with their vectors, descenders no longer overflow rows, and output is crisp on HiDPI displays
- **Alt View Afterglow slider** — a third slider (0–100%) joins Contrast and Font Size in the camera panel and mobile drawer; hidden under `prefers-reduced-motion`
- **Alt View unlock announcement** — unlocking the easter egg now announces itself to screen-reader users via the live region
- **CRT power-on animation** — a one-shot ~300 ms scale-in/brightness flash plays when Alt View is enabled (skipped under `prefers-reduced-motion`)

- **SVG transform baking** — `transform` attributes (including nested `<g>` chains) are composed via the new `transformation-matrix` dependency and baked into path data during parsing, so rotated/translated/scaled shapes keep their position through preparation instead of collapsing to the origin; unparseable transforms produce a per-element warning and route to the editor
- **Unicode-safe SVG encoding** — new `svg-text-encoding.js` (`svgToDataUrl`/`dataUrlToText`) replaces raw `btoa`/`atob` at every SVG encode/decode site, so SVGs with accented characters, CJK text, or emoji no longer throw `InvalidCharacterError`
- **SVG editor role color-coding** — a translucent tint layer color-codes every shape by its assigned role (printed / cut-out / ignored), with a header toggle, a three-chip legend, and "Original" / "Will print as" pane captions
- **SVG editor compound-path mode** — subpaths of a single compound `<path>` get Include/Exclude radios and "Subpath N" labels instead of the meaningless Foreground/Hole/Ignore triad
- **Unit test coverage for the SVG pipeline** — 12-design charm library sweep, transform-baking geometry checks, style/inherited-fill resolution, flatten fallback behavior, unicode round-trips, overlay highlighting, and compound-mode editor tests

- **`aria-keyshortcuts` on shortcut-bearing controls** — new `keyboard-shortcuts-binder.js` annotates the render/download button, camera views, theme/expert-mode toggles, and more with WAI-ARIA shortcut syntax so screen-reader users can discover F6/F7/Control+E etc.; re-applies when shortcuts are re-mapped
- **Safe localStorage helpers** — `safeGetItem`/`safeSetItem`/`safeRemoveItem` in `storage-keys.js` (with quota/security-error tests) replace ad-hoc try/catch across main.js, preview, camera, overlay, and settings controllers
- **Storage-key snapshot test** — every exported `STORAGE_KEY_*` string is frozen by a unit test so user data cannot be orphaned by accidental key renames
- **Error-translation parity corpus** — 19-entry raw-stderr corpus freezes worker and main-thread classifications (BR-5 safety net)
- **CI: css-variable-audit** — the semantic-tokens/mono-variant audit now runs in the unit-tests job

### Changed

- **Braille Sign is the default tool on the welcome screen** — the Braille Card Customizer card's Tool dropdown now preselects Braille Sign (Open button target updated to match); Braille Card and Braille Charm remain one pick away
- **Braille Charm defaults to Angled printing** — `print_orientation` now defaults to Angled (75° lean, the CHI 2024 sweet spot) for the pendant shapes, so every exported STL is already oriented for optimal braille printing; the support fin is slimmed for the charm's small volume (fin thickness 1.2 → 0.8 mm, brim 2.0 → 1.5 mm) with a minimum of 3 break-away bridges that auto-scale up (~one per 10 mm of fin height) for taller charms
- **Alt View engine follows the researched pipeline** — the 1.77M-entry precomputed lookup table (`_hfm-lut.js`, ~250 ms rebuild on every font-metric change) is replaced by a lazily-filled cache (`_hfm-lookup.js`); the directional-contrast neighborhood now maps each internal sample to a small local set of external samples (crisper edges); sampling drops from 34 to 16 taps per cell using bilinear-downscale area averaging; per-cell brightness colors are removed in favor of a single phosphor color per theme (glyph density carries the lightness signal) with an optional CSS bloom on the overlay canvas
- **Alt View controller simplified** — device auto-calibration and browser-zoom compensation (~300 lines of overlapping adaptive systems) are removed; first-enable defaults are plain (contrast 100%, size 100%, glow 0%) with saved values honored; setting writes to localStorage are debounced; the Contrast/Font Size sliders now actually appear while Alt View is enabled (their `setEnabled` previously ignored its argument); status bar text tightened to `[ALT VIEW] EDGE 100% · SIZE 100% · GLOW 0%`
- **Relocated non-theme exports out of `hfm-controller.js`** — `sanitizeUrlParams` → `file-param-resolver.js`, `exportFormatFromMenu` → `file-actions-controller.js`, `applyToolbarModeVisibility` → `toolbar-menu-controller.js`
- **Mono scanline overlay layering** — the CRT scanline pseudo-element drops from z-index 9999 to 900 so modals and toasts render above it, and no longer pins a permanent GPU layer via `will-change`
- **Simple SVGs bypass flattening (lossless by default)** — when every element is dark/foreground with no transforms-gone-wrong, gradients, or clip-paths, the original file is used as-is (OpenSCAD unions overlapping shapes natively); multi-shape designs like Paw, Sun, and Music note no longer lose parts to a destructive union
- **"Needs review" no longer swaps in a prepared file silently** — when the analyzer recommends the editor, the original SVG is used until the user explicitly clicks Apply; closing the editor (Escape or ×) now counts as "Keep original"
- **SVG prep metadata no longer persists the analysis object** — live DOM references made restored `prepAnalysis` objects crash the editor; the raw SVG is re-analyzed on project restore instead
- **SVG status card copy** — pass-through reads "Using original (N shapes) — OpenSCAD merges these automatically", auto-prepare reads "Simplified N shapes for 3D printing", and flatten fallback warnings are surfaced on the card
- **Error translation honors worker codes (BR-5)** — the main thread resolves worker-classified errors by `code` via `TRANSLATIONS_BY_CODE` instead of re-matching prose, so errors like `UNKNOWN_MODULE` or `OUT_OF_MEMORY` show specific guidance instead of "Something Went Wrong"
- **WASM init progress is honestly indeterminate** — hardcoded 5→95% milestones replaced with an indeterminate bar plus stage messages; render-time estimates are labeled "estimated" and suppressed entirely at low confidence
- **Focus trap consolidation** — the error modal uses the shared `createFocusTrap` (selector now includes `summary`); guided-tour stub and permanently disabled View-menu toggles removed
- **Mirror tests eliminated** — cli-manifest, svg-validation, dxf-postprocess, missing-file-warnings, image-companion-mounting, saved-projects-load, color-contrast, and resolve-2d-export tests now import the real implementations (new shared modules under `src/worker/`) instead of "keep in sync" copies
- **Storage keys centralized** — `STORAGE_KEY_*` constants, `PRESET_SORT_KEY`, WASM crash flags, and the KI-012 debug-toggle keys live in `storage-keys.js`; KI-012 checks go through `isDebugPrefEnabled()`
- **Helper dedup** — shared `perf-metrics.js` replaces the copy-pasted metrics append blocks; `RENDER_QUALITY` DRAFT/MEDIUM/HIGH derive from `QUALITY_TIERS`; intentionally-different sanitizers/formatters are documented in place
- **q_charm.scad parameter naming** — renamed positional parameters to plain-language labels for Customizer clarity: `design_x`/`design_y` → `design_left_right`/`design_up_down`, `text_x`/`text_y` → `text_left_right`/`text_up_down`, `design_x_2`/`design_y_2` → `design_2_left_right`/`design_2_up_down`, `design_z_2` → `design_2_thickness`
- **q_charm.scad Fit parameter rename** — `charm_length` → `charm_width` (Y-axis dimension along bracelet), `bracelet_width` → `charm_length` (inner channel width); labels now match physical meaning
- **q_charm.scad Rounding parameter rename** — `all_edges_radius` → `side_edge_radius` with new default 2.5 (was 0); description clarified to "rounds the edges along the side profile"
- **q_charm.scad edge rounding algorithm** — replaced `minkowski()` sphere/cylinder rounding with stepped `linear_extrude` + `offset()` approach via new `edge_rounded_profile()` module for significantly faster renders
- **q_charm.scad section order** — reordered Customizer tabs to Design → Design Layer 2 → Text → Fit → Rounding → Attachment → Quality, placing creative controls before fit adjustments
- **q_charm.scad default values** — updated Fit defaults to better match standard silicone bracelets (`charm_width` 22, `charm_height` 8.65, `charm_thickness` 2.75, `charm_length` 15, `gap_offset` 2, `gap_width` 3); raised design scale max from 95 → 150
- **Preset JSONs** — updated `large-charm.json` and `small-charm.json` to match renamed parameters and new `side_edge_radius` default
- **q-charm SVG library** — trimmed manifest to only reference SVG files that exist on disk (removed 6 placeholder entries)
- **SVG offset quality** — adaptive sample count (256–2048 based on path length) replaces fixed 128-point default; Chaikin corner-cutting smoothing applied to offset output for smoother curves; uses `ClipperOffset` API directly

### Fixed

- **Charm border exported non-watertight STLs** (Braille Charm 1.2.1 and Charm Customizer) — the raised border was extruded as a separate ring stacked on the charm body, leaving two coincident outer walls; on curved outlines (circle, oval, hexagon, rounded rect) the border's re-tessellated boundary exported as T-junction open edges. The body and border are now carved from one extrusion, and the Charm Customizer's raised design is embedded 0.02 mm into the body so it fuses instead of exporting a touching shell; every shape/orientation/attachment combination now exports a watertight single-body STL
- **3D preview blank in browsers without WebGL 2** — the three.js upgrade from r160 to r182 (Jan 2026 dependency bump) silently dropped WebGL 1 support (removed upstream in r163), so Firefox profiles with WebGL 2 unavailable (hardware blocklist, `webgl.enable-webgl2=false`, privacy hardening) got an empty preview pane while everything else worked; three is now pinned to `^0.162.0`, the last release that falls back to a WebGL 1 context. If WebGL is entirely unavailable, the preview pane now shows an accessible explanatory notice instead of failing silently with only a console warning
- **Theme switch while Alt View is enabled** — the theme listener passed the raw light/dark theme to the preview instead of the mono-aware key, flipping the WebGL scene to a bright background and muddying the ASCII output; it now uses `detectTheme()` and re-tints the glyph atlas on theme change
- **Emoji-swap button accessible names** — controls whose emoji labels are swapped for bracketed text in the mono variant now carry explicit `aria-label`s (unlock-limits toggle, features-guide example buttons, accessibility-guide link), so screen readers hear one stable name instead of emoji + bracket concatenation
- **Charm Customizer default design import** — `nasif_charm_maker.scad` referenced `svg-library/heart.svg`, a path that never matched the mounted basename, so first render always warned "Can't open file"; the SCAD default and manifest gallery options now use basenames, `design_2d()` guards against an empty `design_file`, and the gallery pre-selects the default design
- **SVG editor area highlight rebuilt** — hovering an object row now draws the shape's actual path into an SVG overlay (replacing a dead CSS attribute-selector approach that never rendered), so highlights work for all shapes including individual subpaths of compound paths
- **`style="fill:…"` and inherited paints respected** — fill/stroke are resolved from the inline `style` attribute and ancestor elements per SVG precedence, so Inkscape/Illustrator exports classify correctly instead of every shape defaulting to "black"
- **SVG flattening crash-hardened** — each boolean union/difference is individually guarded; shapes that fail to merge are appended verbatim with a warning instead of crashing the pipeline or silently dropping geometry
- **SVG uploads detected by `.svg` extension** — files served with a generic MIME type (common on Windows) are now recognized as SVGs
- **SVG editor QoL** — Apply is disabled (with a hint) when no shapes are included; preview failures show an inline "original will be kept" message instead of a blank pane; viewBox is derived from `width`/`height` when missing so zoom controls work; result-pane zoom survives preview re-renders; the editor auto-expands to fullscreen on narrow screens; selecting a new design dismisses a stale editor without firing its callbacks
- **Recovery mode CodeMirror disable was a no-op** — it wrote a localStorage key the flag system never read; now uses `setUserPreference('codemirror_editor', false)`
- **`escapeHtml` attribute injection** — the shared helper now escapes quotes (all five significant characters); console-panel filenames interpolated into `data-file="…"` can no longer break out of the attribute; duplicate escape implementations removed
- **Stale version strings** — startup log derives from `__APP_VERSION__` (was hardcoded v4.1.0); sw.js drops its stale version comment
- **A11Y quick wins** — features-note contrast token (AA in dark mode), zero Nu HTML validator errors in index.html, `prefers-reduced-transparency` now covers all modal/drawer/tooltip surfaces, stale `aria-valuenow` removed from the overlay opacity slider
- **Dead code removed** — 16 unused symbols, the orphaned `animation-controller.js` and `schema-generator.js` modules, and the dead `tutorialProgress` localStorage migration
- **Test-runner hygiene** — storage mocks install at setup module scope, eliminating the `--localstorage-file` warnings and `localStorage.getItem is not a function` stderr leaks; e2e fake-pass `expect(true)` assertions replaced with real assertions or honest skips
- **SVG editor fullscreen portaling** — fullscreen mode now reparents root and backdrop to `document.body` to escape ancestor `transform`/`will-change` containing blocks (e.g. drawer panels)
- **SVG editor fullscreen preview sizing** — preview panes use `dvh` units with fallback, `min-height`, and `object-fit: contain` for consistent sizing across viewports
- **SVG editor header overflow** — narrow viewports (≤540px) wrap header controls and truncate the title with ellipsis, in both fullscreen and inline modes
- **Example loader UX** — features guide modal now closes before the confirm dialog appears, preventing modal overlap when loading examples over existing files
- **Prebuild step** — `setup-libraries` added to `prebuild` script so library bundles are fetched automatically during `npm run build`

---

## [4.4.0] - 2026-04-06

### SVG Offset, Companion Hardening & Preset Improvements

Feature release adding SVG path offset support, hardened companion file resolution, project-native preset separation, developer diagnostic controls, numeric-aware preset sorting, and an updated OpenSCAD WASM binary.

### Added

- **SVG path offset** — new `svg-offset.js` bridge to clipper2-js enables inward/outward offset of SVG paths in the preparation workspace
- **Project-native presets** — presets bundled in sidecar JSON files are separated from user-saved presets (behind `project_presets` feature flag)
- **SCAD parameter formatter** — new `scad-param-formatter.js` module for type-aware parameter formatting
- **Developer diagnostic controls** — console-only toggles for CSG bypass, desktop quality, geometry comparison, and ground-truth rendering (`window.__forgeDebug`)
- **Numeric-aware preset sorting** — presets with numeric prefixes sort naturally (e.g., "2 Small" before "10 Large")
- **E2E test suites** — `lwfl-parity-reproduction.spec.js`, `preset-audit-sweep.spec.js` for regression testing
- **Unit test suite** — `svg-offset.test.js` for offset geometry validation

### Changed

- **Companion file resolution hardened** — hierarchy fallback, brand filtering, sibling disambiguation for multi-file projects
- **OpenSCAD WASM updated** to 2026.04.03 build with `callMain --help` first-init fix
- **Worker refactored** — `openscad-worker.js` major cleanup (+66/−265 lines), improved error translation, defense-in-depth guards
- **Split preset dropdown** — project-native vs user-saved presets displayed in separate groups
- **Feature flags** — added `project_presets` and `svg_path_offset` flags

### Fixed

- **KI-012**: Parameter dropout on re-render resolved via worker restart fix
- **innerHTML XSS** in `dialogs.js` and `file-handler.js` — user content now escaped via `escapeHtml()`
- **Blocking `confirm()`** in example loader replaced with accessible `showConfirmDialog`

### Security

- **innerHTML hardening** — `showConfirmDialog` title/message/labels and `_promptScadSelection` file paths now escaped to prevent XSS via crafted filenames

---

## [4.3.0] - 2026-03-20

### Architecture, Security & Accessibility Release

Major release completing the main.js decomposition (~6,300 lines extracted into 5 modules), enforcing Content-Security-Policy, replacing all `alert()` calls with accessible error dialogs, migrating the toolbar to WAI-ARIA menubar, and stabilizing cross-browser CI.

### Added

- **CodeMirror 6 editor** replacing dead Monaco Editor module
  - CSP-compatible (uses constructable stylesheets, no `unsafe-inline` required)
  - OpenSCAD language support with syntax highlighting
  - Integrated into Expert Mode with editor-state-manager and mode-manager
- **Accessible error dialogs** (`showFriendlyError`) replacing all 56 `alert()` calls
  - Modal with `role="alertdialog"` for critical errors (WASM init, file corruption)
  - Toast with `role="alert"` for informational messages (save success, format unsupported)
  - Auto-focused close button with focus trap
- **WAI-ARIA menubar** for toolbar navigation
  - `role="menubar"` container with `role="menuitem"` triggers
  - Arrow-key roving across 6 menus and within menu items
  - Enter/Space activates, Escape closes, Home/End jump
- **Accessibility role-path cards** on welcome screen
  - 5 cards re-enabled: Keyboard-Only, Low Vision, Voice Input, Screen Reader, Advanced Makers
  - Content updated with accurate feature references and documentation links
- **Expert Mode mobile layout** for viewports below 768px
  - Collapsible panel with max 40vh height
  - Touch-friendly resize handle
- **Forced-colors support** for camera D-pad buttons and code editor borders
- **Mono high-contrast preview colors** (`mono-hc`, `mono-light-hc`) for differentiated 3D preview
- **Automated benchmark runner** recording render times for 4 benchmark models
- **CSS variable audit** verifying all semantic tokens have mono variant overrides
- **Platform-specific visual regression baselines** (win32 + Linux directory structure)

### Changed

- **main.js decomposed** into 5 extracted modules (~6,300 lines removed):
  - `overlay-grid-controller.js` — grid/overlay settings and SVG color management
  - `saved-projects-ui.js` — project save/load/rename/delete UI
  - `companion-files-controller.js` — include/use file detection and management
  - `hfm-controller.js` — HFM/Alt View controller, confirm dialogs, URL sanitization
  - `file-handler.js` — drag-drop, file input, URL load, and folder import handling
- **Cache-clearing consolidated** into single `_clearBrowserCaches()` helper in storage-manager
- **Content-Security-Policy enforced** (upgraded from Report-Only)
  - Removed `unsafe-inline` from `style-src` directive
  - Updated csp-reporter from report-only to enforcing mode
- **Three.js granular imports** for tree-shaking (replaced `import('three')` with named imports)
- **JSZip converted to dynamic import** for on-demand code splitting

### Security

- **CSP enforcement**: `Content-Security-Policy` header active (no longer Report-Only)
- **`unsafe-inline` removed** from `style-src` — all styles via external CSS or constructable stylesheets
- **SVG sanitizer hardened**: strips `<foreignObject>`, `<iframe>`, `<embed>`, `<object>`; blocks external `<use>` references and `data:` protocol in `href`/`xlink:href`

### Fixed

- Firefox/WebKit CI stabilized with parallel workers and WASM binary caching
- Saved-projects and basic-workflow E2E tests un-skipped (modal timing and file upload fixes)
- Expert Mode responsive layout prevents full-screen takeover on mobile

### Removed

- Orphaned `sw-manager.js` and `version.js` modules
- Dead Monaco Editor module (`monaco-editor.js`, 730 lines)
- ~1,600 lines of confirmed dead CSS rules
- ~85 debug `console.log` calls gated behind `import.meta.env.DEV` flag

### Technical

- E2E: Firefox and WebKit CI jobs pass without `continue-on-error`
- Visual regression: platform-specific baselines (win32 + Linux)
- Benchmark runner outputs JSON for CI artifact collection
- CSS variable audit enforces mono variant completeness

---

## [4.2.0] - 2026-03-16

### Accessibility, Security & Expert Mode Release

Major release adding Expert Mode code editing, vector parameter support, intelligent memory management, desktop parity remediations, visual theme overhaul (Alt View mono variant), and security hardening. Targets WCAG 2.2 AA / Section 508 conformance.

### Added

- **Expert Mode** - Edit OpenSCAD code directly in the browser with real-time preview
  - Monaco Editor with OpenSCAD syntax highlighting
  - Accessible textarea fallback for full AT compatibility
  - State preservation (cursor, scroll, selection) across mode switches
  - Keyboard shortcut: `Ctrl+E` to toggle
- **Vector parameter editor** - Visual editor for `[x,y,z]`-style parameters
  - Individual controls per element with smart parsing
  - Keyboard navigation between elements
  - Screen reader support ("X coordinate, 1 of 3")
- **Memory management** - Intelligent monitoring with graceful degradation
  - Real-time usage tracking at 400MB / 800MB / 1200MB thresholds
  - Auto-preview disabled at critical levels; safe recovery mode
- **Desktop parity remediation** - 14 of 16 parity scenarios resolved
  - COFF per-face color rendering via `--enable=render-colors` flag
  - `#debug` modifier geometry overlay (pink THREE.Group)
  - Console and Error Log unified panel with Log/Structured views
  - File > Export As SVG/DXF with guidance animation
  - Grid opacity slider with localStorage persistence
  - Rendering toast indicator and pulsing badge
  - Missing-file synthetic warnings in desktop console format
- **Alt View mono variant** - Retro terminal aesthetic (green/amber phosphor, CRT effects)
  - Scanlines, vignette, glow pulse effects (respects `prefers-reduced-motion`)
  - High-contrast passthrough for forced-colors mode
  - Custom cursor SVGs per variant
- **Manifest sharing** - External manifest loading with URL stability contract
  - Rewritten sharing guide with non-technical instructions
  - `MANIFEST_STABILITY_CONTRACT.md` documenting URL parameter stability
  - 20-case E2E test suite for manifest loading
- **Lighting, color, and printer presets** - Desktop-parity camera and render presets
- **Color passthrough** - Full render color passthrough via OFF format when active
- **VPAT document** - Section 508 conformance documentation (59 criteria)
- **Documentation suite** - Getting Started, Standard Mode, Expert Mode, Troubleshooting, Security Admin, Browser Support, and Known Issues guides
- **Desktop-parity toolbar menus** - File, Edit, Design, View, Window, Help menus matching OpenSCAD desktop layout
  - Full keyboard navigation with arrow keys and mnemonic shortcuts
  - Design tools (flush caches, display AST, geometry info)
  - Edit actions (copy camera values, error navigation, font size controls)
- **UI Mode system** - Progressive complexity disclosure (Beginner / Advanced)
  - Feature-flag gated UIModeController
  - Advanced-only features hidden in Beginner mode
- **Feature flags** - Runtime feature configuration (`expert_mode`, `vector_parameters`, `csp_reporting`, `searchable_presets`, `alt_view`)
- **Folder import** - Direct project folder upload via `webkitdirectory` input
- **Auto-rotate camera** - Animated 3D preview rotation with theme-aware controls
- **Image measurement tool** - Reference overlay measurement with tab-unit inference
- **Custom grid presets** - Save, name, and recall grid size configurations
- **Customizer detail modes** - Adjustable parameter display density

### Changed

- **Renamed example directories** - `volkswitch-keyguard` → `keyguard-demo` / `keyguard-minimal`
- **Generalized code comments** - Stakeholder-specific references replaced across 27 files
- **Updated deep-link URLs** - `?example=keyguard-demo` and `?load=keyguard` aliases

### Security

- **Content Security Policy** - CSP headers in Report-Only mode with violation logging (`csp-reporter.js`)
- **Supply chain security** - SBOM generation (CycloneDX), npm audit in CI, lockfile integrity checks
- **Security Admin Guide** - Deployment hardening documentation with CSP policy details
- **Privacy notice** - Documents IP exposure for externally-hosted manifest loading
- **SW message validation** - Service worker isolation verified; no cross-origin cache
- **escapeHtml hardening** - Extended to all remaining `innerHTML` insertion points

### Fixed

- Always set `data-theme` to resolved value even in auto mode
- Toggle switch off-state contrast meets 3:1 in all themes
- Alt View panel remediation (HC passthrough, amber detection, mono toggle)
- Camera button icon visibility on hover
- HC toggle knob geometry overflow
- Edge E2E timeout and Firefox COFF probe failures
- Sequential render overlap via `_callMainInvoked` guard
- Heading hierarchy: 4 heading-level skips corrected for screen reader navigation
- Added `type="button"` to ~75 buttons preventing unintended form submission
- ARIA cleanup: removed redundant `aria-hidden`, added missing form labels
- Mono variant: ~20 missing semantic token overrides causing color bleedthrough
- Focus ring in mono variant uses theme accent color instead of default blue
- Screen reader error announcements wired to render errors, WASM init, and memory emergencies
- Non-functional Window menu panel toggles resolved
- Unhandled promise rejections caught in fire-and-forget chains
- Ctrl+E shortcut guarded against Expert Mode activation in Beginner mode
- Nested-array URL parameters no longer silently dropped
- WASM render cancel latency reduced from 5 s to 200 ms
- SVG/DXF 3D-model conflict uses accessible guidance modal instead of `alert()`
- Storage quota errors surfaced via status bar and screen reader announcement
- Global `window.onerror` and `unhandledrejection` handlers for uncaught errors

### Technical

- 2093 unit tests passing (100%) — up 51% from v4.1.0 baseline (1383)
- Coverage: 52% statements, 51% branches, 53% functions, 53% lines
- E2E: 341 tests across 25 test files (Chromium, Edge, Firefox, WebKit)
- Lighthouse: Performance 100, Accessibility 96, Best Practices 100, SEO 100
- Bundle: Core 231.8KB/500KB gzipped, CSS 46.5KB/150KB, total 600.2KB/1MB
- Build: 211 modules, 4.62s production build
- Visual regression: 13 baselines (10 committed + 3 new)

---

## [4.1.0] - 2026-01-27

### Security & Features Release

Security hardening, saved projects, documentation overhaul, and accessibility improvements.

### Added

- **Saved Projects** - Save, load, and export complete projects (SCAD + parameters) to browser storage
  - IndexedDB storage with localStorage fallback
  - Export projects as ZIP files
  - Import projects from ZIP
  - Project metadata (name, notes, timestamps)
  - Full unit test coverage (26 tests)
- **Gamepad support** - Full gamepad controller for 3D navigation and parameter adjustment
- **Keyboard configuration** - Configurable keyboard shortcuts with persistent storage
- **Service worker manager** - Better update detection and user notifications
- **Version module** - Build info (version, commit SHA, timestamp) injected at build time
- **Schema generator** - Convert parameters to standard JSON Schema format
- **Shared utility modules** - `html-utils.js` and `color-utils.js` for consolidated functionality
- **Modal helper** - `createModal()` function for consistent modal creation

### Security

- **Fixed XSS vulnerability** in ZIP file tree display - file paths now properly escaped
- **Added Service Worker message validation** with allowlists at all 3 message handlers
- **Added path traversal protection** for ZIP extraction (rejects `..`, leading `/` or `\`)

### Documentation

- **Added `docs/ARCHITECTURE.md`** - Complete system architecture with 10 Mermaid diagrams
  - Module map, render pipeline, saved projects flow, validation pipeline
  - Service worker caching, tutorial sandbox, comparison mode, CLI structure
- **Added `docs/guides/SECURITY_TESTING.md`** - Security audit procedures
- **Added `docs/DEV_QUICK_START.md`** - Developer onboarding guide
- **Documentation style audit** - Rewrote docs to single-maintainer voice
  - Removed boilerplate patterns and excessive emoji
  - Consolidated docs into predictable `docs/` structure
  - Moved specs to `docs/specs/` (UI_STANDARDS, CAMERA_CONTROLS_ACCESSIBILITY)

### Changed

- Service worker cache versioning uses commit SHA (CI) or build timestamp (local)
- Consolidated duplicate code: hex color validation, file size formatting (~80-130 lines removed)
- UI generator refactored for better maintainability

### Fixed

- **Saved Projects**: Fixed loading issue where single-file projects weren't loading correctly

### Technical

- 1383 unit tests passing (100%)
- 0 linter errors
- Production build: 125KB gzipped (main), 187KB gzipped (Three.js)

---

## [4.0.0] - 2026-01-22

### Major Stable Release

This is the **first major stable release** of OpenSCAD Assistive Forge, marking the project as ready for general use.

**Highlights:**
- Documentation overhaul for accessibility and onboarding
- Enhanced README with detailed project intent and accessibility features
- Package metadata improvements for npm discoverability
- Open source conventions fully implemented

### Changed

- **README.md**: Completely rewritten with clear project intent, accessibility features documentation, user role guide, and improved organization
- **package.json**: Added author, repository, homepage, and bugs fields; expanded keywords for better discoverability
- **Version**: Bumped to 4.0.0 to signify stable release milestone

### Documentation

- Enhanced accessibility documentation with standards compliance tables
- Added detailed keyboard shortcut reference
- Documented screen reader support and tested configurations
- Added user role guide (screen reader users, clinicians, low vision users, etc.)
- Improved CLI documentation with command tables
- Better organized feature sections

### Open Source

- Complete open source convention compliance
- Enhanced CONTRIBUTING.md with UI consistency rules
- Full THIRD_PARTY_NOTICES.md
- Clear licensing information throughout

### Dependencies

- **commander**: Updated from ^11.1.0 to ^14.0.2 (CLI argument parsing)
- **three**: Updated from ^0.160.0 to ^0.182.0 (3D rendering engine)

### Fixed

- Guard against null worker in `render-controller` cancel flow after terminate
- Dispose Three.js `GridHelper` geometry/material on theme changes to prevent leaks
- Add null checks in parameter extraction to prevent crashes on unexpected inputs
- Improve state cloning error handling for non-serializable values
- Add XSS protection for file names displayed in info area
- Fix mobile drawer collapse button positioning with fixed position

### Accessibility

- Ensure `.btn-role-try` touch targets meet 44×44px minimum sizing

---

## [3.1.0] - 2026-01-20

### Enhanced UI & Accessibility Release

**Highlights:**
- Color system overhaul with Radix Colors for WCAG compliance
- Responsive drawer UI with mobile-first design
- Camera panel controller for keyboard-accessible 3D navigation
- Preview settings drawer with improved UX
- Enhanced accessibility documentation and testing

### Added

- **Radix Colors Integration**: New semantic color system with automatic light/dark/high-contrast support
- **Camera Panel Controller**: Keyboard-accessible camera controls for 3D preview navigation
- **Preview Settings Drawer**: Collapsible overlay drawer for preview settings with resize capability
- **Color Contrast Testing**: Automated WCAG 2.x and APCA contrast verification
- **UI Standards Guide**: Full documentation for theme-consistent UI development
- **Color System Guide**: Complete guide for using the new semantic token system
- **Color Migration Guide**: Instructions for updating existing components

### Improved

- **Mobile Off-Canvas Drawer**: Bootstrap-inspired off-canvas pattern for parameters panel
- **Forced Colors Support**: Full compatibility with Windows High Contrast and OS color schemes
- **Focus Management**: Enhanced scroll-margin and scroll-padding for WCAG 2.4.11/2.4.13 compliance
- **Touch Targets**: 44x44px minimum touch targets throughout the UI
- **Accessibility Guide**: Updated with new color system and contrast information
- **Status Bar**: Compact floating status overlay on preview canvas

### Technical

- New CSS files: `color-scales.css`, `semantic-tokens.css`
- New test file: `color-contrast.test.js`
- New guides: `COLOR_SYSTEM_GUIDE.md`, `COLOR_MIGRATION_GUIDE.md`, `UI_STANDARDS.md`
- Radix UI Colors dependency for professional color palette
- Improved high contrast mode with 7:1 AAA contrast ratios

---

## [3.0.0] - 2026-01-19

### Major Milestone - Cloudflare Stable Deployment

This is the first **major stable release** for production deployment on Cloudflare Pages.

**Highlights:**
- Stable deployment on Cloudflare Pages (unlimited bandwidth)
- All ESLint errors resolved for clean CI builds
- Documentation cleanup and organization
- Complete feature set across 25+ releases now stable

**Infrastructure:**
- Primary hosting: Cloudflare Pages (https://openscad-assistive-forge.pages.dev/)
- COOP/COEP headers pre-configured for WASM threading compatibility
- Global CDN for fast worldwide delivery
- Automatic deployments from Git

**Documentation:**
- Updated all references from Vercel to Cloudflare as primary platform
- Marked all completed build plans as done
- Cleaned up PROJECT_STATUS.md with accurate metrics
- Updated README with Cloudflare deployment badge and links

### Fixed

- Resolved `openFeaturesGuide` scope error that caused lint failures
- Fixed unused variable warnings (`formatPresetDescription`, `index`, `fileContent`)
- Prevented generate actions from cancelling in-progress previews
- Improved internal render retry detection for numeric OpenSCAD error codes

---

## [2.10.1] - 2026-01-18

### Fixed

- Prevented generate actions from cancelling in-progress previews, which could leave the UI stuck when generating before preview completion.
- Improved internal render retry detection for numeric OpenSCAD error codes to recover cleanly without user intervention.

---

## [2.10.0] - 2026-01-17

### Added - Enhanced Accessibility & Layout

- **Collapsible Parameter Panel**: Desktop-only collapse/expand with smooth animations
  - Persistent state saved to localStorage
  - Full keyboard accessibility with `aria-expanded` and focus management
  - Automatic expansion on mobile viewports
  
- **Resizable Split Panels**: Drag-to-resize with Split.js integration
  - 8px gutter with visual grip indicator
  - Keyboard navigation (Arrow keys, Home/End)
  - Persistent sizing saved to localStorage
  - Minimum sizes: 280px (params), 300px (preview)
  
- **Focus Mode**: Maximize preview by hiding parameter panel
  - New focus button in preview header
  - Keyboard shortcut: `F` key
  - `aria-pressed` state management
  
- **Compact Header**: Auto-compact mode after file load
  - Reduces vertical space usage
  - Smooth transition animations
  
- **Collapsible UI Sections**: Better space efficiency
  - Preset controls now use `<details>` element
  - Preview settings moved to collapsible disclosure
  - Reduces initial visual complexity
  
- **Actions Dropdown Menu**: Secondary actions in "More" menu
  - Contains: Add to Queue, View Queue, Share Link, Export Params
  - Native `<details>` element for accessibility
  
- **Auto-Hide Status Bar**: Status bar hides when idle ("Ready" state)

### Improved

- **File Info Display**: Collapsible file tree for multi-file projects
- **Output Format Selector**: Moved to parameter panel for better grouping
- **Compact Actions Bar**: Reduced padding and spacing for efficiency
- **Keyboard Navigation**: Enhanced focus management throughout
- **Screen Reader Support**: Full ARIA attributes on all interactive elements
- **Responsive Design**: Desktop features properly disabled on mobile
- **Performance**: RequestAnimationFrame for smooth drag operations

### Technical

- New dependency: split.js (v1.6.5)
- Modified files: main.js (+459), layout.css (+325), components.css (+210), index.html (+158)
- Bundle impact: +~10KB gzipped
- WCAG 2.1 AA compliance maintained
- Full keyboard support with new shortcuts
- Respects `prefers-reduced-motion`

---

## [2.9.0] - 2026-01-16

### Added - WASM Progress & Mobile Enhancements

- **WASM Loading Progress UI**: Full-screen progress indicator during WASM initialization
  - Progress bar with percentage display
  - Stage-based progress messages (downloading, initializing, loading fonts)
  - Indeterminate progress animation for rendering stages
  - Fade-out animation on completion
  - Accessible with ARIA live regions

- **Mobile Viewport E2E Tests**: Multi-device mobile testing suite
  - Tests on Pixel 5, iPhone 12, iPhone SE devices
  - Landscape orientation tests
  - Small screen (320px) compatibility tests
  - Touch target size verification (WCAG 2.1 compliant)
  - Horizontal overflow detection
  - Font size readability checks

- **Bundle Size Optimization**: Code splitting and lazy loading
  - Three.js split into separate chunk (172KB gzipped)
  - STLLoader and OrbitControls loaded on-demand
  - Main bundle reduced to 67KB gzipped
  - AJV validation library isolated

### Improved

- **Memory Warning System**: Enhanced user notifications
  - Non-intrusive toast notification for high memory usage
  - Auto-dismiss after 15 seconds
  - Manual dismiss option
  - Mobile-responsive design

### Fixed

- **Worker bundling in preview/production**: Kept the worker constructor inline so Vite
  bundles `openscad-wasm-prebuilt` into the worker chunk, preventing OpenSCAD WASM
  initialization failures during preview or Vercel deployments.

### Technical

- Total tests: 602 unit + 42 E2E
- Build time: 4.48s
- Bundle sizes:
  - Main: 231KB (67KB gzipped)
  - Three.js: 667KB (172KB gzipped)
  - CSS: 69KB (10KB gzipped)
- Full mobile viewport E2E coverage

---

## [2.8.0] - 2026-01-16

### Added - Performance & Test Coverage

- **Three.js Lazy Loading**: Already implemented - Three.js modules are loaded on-demand to reduce initial bundle size
  - Parallel loading of three, OrbitControls, and STLLoader
  - Loading indicator shown during module fetch
  - Code splitting via Vite's dynamic imports

- **Memory Usage Monitoring**: Already implemented - WASM memory tracking with user warnings
  - `getMemoryUsage()` method in RenderController
  - Memory warning callback when usage exceeds 80%
  - Real-time memory stats (used, limit, percent)

- **Font Support for text()**: Already implemented - Liberation fonts mounted in WASM virtual filesystem
  - LiberationSans-Regular, Bold, Italic
  - LiberationMono-Regular
  - Automatic font mounting on WASM initialization

### Improved

- **Unit Test Coverage**: Increased from 72.38% to 80.31%
  - library-manager.js: 57.95% → 60.24% (41 tests)
  - comparison-view.js: 44.14% → 45.85% (61 tests)
  - render-controller.js: 62.85% → 64.21% (37 tests)
  - preset-manager.js: 66.44% → 70.37% (41 tests)
  - preview.js: 45.75% → 45.05% (54 tests)
  - Added 95 new unit tests (507 → 602 total)

- **Test Infrastructure**
  - Added LibraryManager tests (autoEnable, getMountPaths, getStats)
  - Added ComparisonView event handling tests
  - Added RenderController memory monitoring tests
  - Added PresetManager listener and statistics tests
  - Added PreviewManager theme detection and LOD tests

### Technical

- Total tests: 602 unit + 42 E2E
- Test coverage: 80.31% statements, 74.85% branches, 82.42% functions
- Build time: 4.33s
- Bundle size: 67.44KB gzipped (main), 172.28KB gzipped (Three.js)

---

## [2.7.1] - 2026-01-16

### Fixed - Audit Gap Resolutions

- **Gap 2**: Validate command is now template-aware
  - Auto-detects React, Vue, Svelte, Angular, Preact projects
  - Uses template-specific file checks instead of hardcoded paths
  - Shows detected template in validation output
  
- **Gap 4**: Scaffold `--theme` option now fully functional
  - Generates theme CSS using selected preset
  - Automatically links theme CSS in index.html
  - Available themes: blue (default), purple, green, orange, slate, dark
  
- **Gap 7**: Sync auto-fix uses correct npm package names
  - Fixed `three.js` → `three` package name mapping
  - Uses stored `packageName` field instead of parsing message
  
- **Gap 8**: Scaffolded apps auto-load embedded models
  - Apps with embedded `param-schema` and `scad-source` tags now boot immediately
  - No upload required for scaffolded standalone apps
  - Graceful fallback to upload UI if embedded data is invalid
  
- **Gap 9**: Validate JSON output includes `passed` flag
  - JSON format now includes top-level `passed: boolean` for CI integration
  - Added `summary` object with schema/UI/test pass counts
  - Added `metadata` with timestamp and webapp path

### Added - New Example Models

- **Phone Stand**: Customizable stand with angle adjustment and charging cable support
- **Honeycomb Grid**: Parametric hexagonal grid pattern for organizers
- **Cable Organizer**: Desk cable management with multiple slot styles
- **Wall Hook**: Mountable hook with multiple curve styles and mounting options

### Technical

- Exported `THEME_PRESETS` and `generateThemeCSS` from theme.js for scaffold integration
- Added `loadEmbeddedModel()` function in main.js for scaffolded app initialization
- Template detection logic in validate.js supports all framework templates
- Total example models: 10 (4 new)

---

## [2.7.0] - 2026-01-16

### Added - Advanced Menu (P1 Features)

- **View SCAD Source**: Read-only view of uploaded OpenSCAD source code
  - Modal viewer with monospace font and line count
  - Copy to clipboard functionality
  - File statistics (lines, characters)
  
- **Override Parameter Limits**: Unlock toggle for numeric parameters
  - Allow values outside parsed min/max ranges
  - Visual indicators for unlocked parameters
  - Warning styling for out-of-range values
  - Limits automatically restored when toggle is disabled
  
- **Enhanced Reset Tools**: Multiple reset options
  - Reset All: Reset all parameters to defaults
  - Reset Group: Reset parameters in a specific group
  - Individual Reset: Per-parameter reset buttons (appear on hover)
  - Reset buttons show "modified" state when value differs from default
  
- **View Params JSON**: View current parameters as formatted JSON
  - Modal viewer with copy functionality
  - Useful for debugging and sharing configurations

### Technical

- New exports from `ui-generator.js`: `setLimitsUnlocked`, `getAllDefaults`, `resetParameter`
- Advanced Menu UI in collapsible `<details>` element
- ~400 lines of new CSS for Advanced Menu styling
- ~200 lines of new JavaScript for Advanced Menu functionality
- Full accessibility support (keyboard navigation, ARIA labels, focus management)
- High contrast mode support for all new components

## [2.4.0] - 2026-01-15

### Added - Testing Infrastructure & Performance

- **Unit Testing Suite**: Vitest-based unit tests for core modules
  - 119+ unit tests covering parser, state, presets, theme, and ZIP handling
  - 88.82% coverage on parser module, 70%+ on preset and theme managers
  - Test fixtures for OpenSCAD file validation
  - Mock-based testing for localStorage and DOM interactions
  
- **E2E Testing Framework**: Playwright integration for end-to-end testing
  - Basic workflow tests (upload → customize → download)
  - Accessibility compliance tests with axe-core
  - Keyboard navigation validation
  - Multi-browser testing (Chromium, Firefox, WebKit)
  
- **GitHub Actions CI**: Automated testing on every push and PR
  - Unit test execution with coverage reporting
  - E2E test execution with artifact upload
  - Build verification and bundle size monitoring
  - Markdown linting
  
- **Documentation**: Testing and performance guides
  - TESTING.md - Complete guide for unit and E2E testing
  - PERFORMANCE.md - Performance optimization strategies and targets
  - Coverage targets and best practices
  - Troubleshooting and debugging tips

### Fixed

- **Theme Manager API**: Updated `addListener()` to return unsubscribe function for consistency with StateManager pattern

### Improved

- **State Management Tests**: Extended coverage for URL synchronization and localStorage persistence
- **Test Infrastructure**: Added setup files and fixtures for better test organization
- **CI/CD Pipeline**: Complete automated testing workflow for continuous quality assurance

### Technical

- Dependencies: @playwright/test, @axe-core/playwright, vitest, @vitest/ui, @vitest/coverage-v8
- Test count: 119 unit tests + 8 E2E tests
- Coverage: 21%+ overall, 80%+ on core modules
- New files: 10+ test files, 2 documentation files, 3 config files
- GitHub Actions: 4 workflow jobs (unit, E2E, build, lint)

## [2.3.0] - 2026-01-15

### Fixed - Audit & Polish Release

- **Debug Code Removal**: Removed debug fetch call from `auto-preview-controller.js`
- **Version Alignment**: Synchronized version strings across `main.js`, `sw.js`, and `package.json`

### Audited

- Core runtime modules reviewed for correctness: parser, preview, library-manager, render-queue, openscad-worker
- All modules verified clean with no correctness issues

### Technical
- No new features (polish release)
- Service Worker cache auto-invalidates with version bump

## [2.2.0] - 2026-01-15

### Added - Additional Templates & Enhanced Tooling

- **Vue 3 Template**: Full Vue Composition API template for scaffold command
- **Svelte Template**: Modern Svelte template with reactive programming
- **Enhanced Auto-Fix**: 15+ checks for dependencies, scripts, files, and code quality
- **Golden Fixtures**: Fixture system for regression testing
- **Template Comparison**: 4 framework options (vanilla, React, Vue, Svelte)
- **Better CLI Reporting**: Enhanced error messages and diff output

### Technical
- Vue template (~13 files, 1,400 lines) with Composition API
- Svelte template (~13 files, 1,300 lines) with reactive stores
- Enhanced sync command (+100 lines) with 6 new checks
- Enhanced validate command (+150 lines) with golden fixtures
- Updated scaffold command to support Vue and Svelte
- Template dependencies: Vue 3.4+, Svelte 4.2+
- Total new code: ~2,800 lines

## [2.1.0] - 2026-01-15

### Added - Enhanced CLI

- **React Templates**: Full React template support for scaffold command with component architecture
- **Theme Generator**: Custom color theme generation with 6 presets (blue, purple, green, orange, slate, dark)
- **CI/CD Helpers**: Configuration generators for 6 platforms (GitHub, GitLab, Vercel, Netlify, Docker, Validation)
- **React Components**: Pre-built components (App, Header, ParametersPanel, PreviewPanel, ParameterControl)
- **Theme Presets**: Professional color palettes with accessibility support
- **CI/CD Templates**: Tested workflows and configurations

### Technical
- New `theme` command (~420 lines) with 6 presets and custom color support
- New `ci` command (~570 lines) with 6 provider templates
- React template (~10 files, 600+ lines)
- Updated scaffold command with `--template react` option
- Version bumped to 2.1.0
- Total new code: ~2,400 lines

## [2.0.0] - 2026-01-15

### Added - Developer Toolchain

- **CLI Interface**: `openscad-forge` command-line tool for automation
- **Extract Command**: Extract parameters from .scad files to JSON Schema
- **Scaffold Command**: Generate standalone web apps from schema + .scad file
- **Validate Command**: Test schema compliance and accessibility
- **Sync Command**: Auto-fix common project issues
- **NPM Package**: Global installation support via npm

### Technical
- New CLI entry point `bin/openscad-forge.js`
- 4 command modules (~1,265 lines total)
- Commander.js for command parsing
- Chalk for colorized output
- Dependencies: commander@^11.1.0, chalk@^5.3.0

## [1.10.0] - 2026-01-14

### Added - OpenSCAD Library Bundles
- **Library Support System**: Integration with popular OpenSCAD libraries (MCAD, BOSL2, NopSCADlib, dotSCAD)
- **Auto-Detection**: Parser automatically detects library usage from include/use statements
- **Library Manager UI**: Collapsible panel with checkboxes, icons, and badges
- **Auto-Enable**: Required libraries automatically enabled on file load
- **Virtual Filesystem**: Libraries mounted in OpenSCAD WASM worker
- **Setup Script**: `npm run setup-libraries` command to download all libraries
- **State Persistence**: Library selections saved to localStorage
- **Test Example**: Created library-test example demonstrating MCAD usage

### Fixed
- **URL Param Clamping**: Out-of-range URL parameters are clamped to schema limits to prevent invalid renders
- **Comparison Mode Libraries**: Variant renders now mount enabled libraries (fixes MCAD comparison errors)

### Technical
- New `library-manager.js` module (303 lines)
- New `setup-libraries.js` script (320 lines)
- Modified 7 core files for library integration
- Added 250+ lines of CSS for library UI
- Total: ~1,352 lines added

## [1.9.0] - 2026-01-14

### Added - Comparison View

Multi-variant comparison system for side-by-side parameter testing.

- **Multi-Variant Comparison**: Compare up to 4 parameter variants side-by-side
- **Independent 3D Previews**: Each variant has its own interactive preview
- **Batch Rendering**: Render all variants sequentially with progress tracking
- **Variant Management**: Add, rename, edit, and delete variants
- **Export/Import**: Share comparison sets as JSON files
- **State Tracking**: Visual indicators for pending, rendering, complete, error states
- **Responsive Layout**: Grid adapts from 4 → 2 → 1 columns based on screen size

### Technical
- New `ComparisonController` class (273 lines) for variant state management
- New `ComparisonView` class (557 lines) for UI rendering
- State integration with `comparisonMode` and `activeVariantId` properties
- Theme-aware styling (light/dark/high-contrast)
- WCAG 2.1 AA compliant accessibility
- Build time: 3.15s
- Bundle size: +14.4KB gzipped

## [1.8.0] - 2026-01-14

### Added - STL Measurements
- **Dimension Measurements**: Real-time bounding box visualization with X, Y, Z dimensions
- **Dimensions Panel**: Dedicated UI panel showing width, depth, height, and volume
- **Measurements Toggle**: "Show measurements" checkbox in preview settings
- **Visual Overlays**: Red wireframe bounding box with dimension lines and text labels
- **Theme-Aware Colors**: Measurement colors adapt to light/dark/high-contrast themes
- **Persistent Preference**: Saves measurement state to localStorage
- **High Contrast Support**: Thicker lines (3px) and larger text (48px) in HC mode

### Technical
- Enhanced `PreviewManager` with measurement methods (+250 lines)
- New dimension calculation and visualization system
- Canvas-based text sprites for dimension labels
- Three.js BoxHelper for bounding box visualization
- +4.2KB gzipped bundle size impact
- Build time: 3.55s

## [1.7.0] - 2026-01-13

### Added - Parameter Presets System
- **Save Presets**: Save current parameter configurations with names and descriptions
- **Load Presets**: Quick dropdown selector and management modal for instant loading
- **Manage Presets**: Full modal to view, load, export, and delete presets
- **Import/Export**: Share presets as JSON files (single or collection)
- **Smart Merging**: Duplicate preset names update existing presets
- **Persistence**: LocalStorage per-model preset storage
- **Accessibility**: Full keyboard navigation, ARIA labels, focus management
- **Responsive Design**: Mobile-optimized layout with stacked controls

### Technical
- New `PresetManager` class (374 lines) for CRUD operations
- 272 lines of CSS for preset UI components
- Integration with state management system
- Import validation with error handling
- +4.1KB gzipped bundle size impact
- Build time: 3.83s

## [1.6.0] - 2026-01-13

### Added - Multiple Output Formats
- Support for 5 output formats: STL, OBJ, OFF, AMF, 3MF
- Format selector dropdown in UI
- Format-specific file downloads with correct extensions
- Format-aware rendering in OpenSCAD worker
- Triangle counting for all mesh formats

### Technical
- Multi-format render logic in worker
- Format detection and conversion
- +0.73KB gzipped bundle size impact
- Build time: 2.39s

## [1.5.0] - 2026-01-13

### Added - High Contrast Mode
- Independent high contrast modifier (works with any theme)
- WCAG AAA (7:1) color contrast ratios
- Pure black/white color scheme
- 12-17% larger text sizes
- 2-3px thicker borders
- 4px focus rings
- Enhanced shadows and grid lines
- HC toggle button in header
- Persistent preferences via localStorage

### Technical
- Enhanced `ThemeManager` with high contrast support
- `PreviewManager` HC color palettes
- +0.89KB gzipped bundle size impact
- Build time: 2.53s

## [1.4.0] - 2026-01-13

### Added - Dark Mode
- Three-mode theme system: Auto, Light, Dark
- Theme toggle button in header (☀️/🌙 icons)
- System preference detection (`prefers-color-scheme`)
- Persistent theme preferences via localStorage
- Theme-aware 3D preview with adaptive colors
- 36 theme-aware CSS custom properties

### Technical
- New `ThemeManager` class (195 lines)
- Theme integration in `PreviewManager`
- +3KB (+0.8KB gzipped) bundle size impact
- Build time: 2.71s

## [1.3.0] - 2026-01-13

### Added - ZIP Upload & Multi-File Projects
- ZIP file upload and extraction (JSZip library)
- Automatic main file detection (5 strategies)
- Virtual filesystem mounting in OpenSCAD worker
- File tree visualization with main file badge
- Support for include/use statements
- Multi-file example project (Multi-File Box)
- 20MB ZIP file size limit
- Nested directory support

### Technical
- Virtual filesystem operations in worker
- `mountFiles()` and `clearMountedFiles()` functions
- Directory creation and file mounting
- ~500 lines of new code
- ~10KB bundle size impact (JSZip)
- Build time: 2.72s

## [1.2.0] - 2026-01-13

### Added - Auto-Preview & Progressive Enhancement
- Automatic preview rendering with 1.5s debounce
- Progressive quality rendering (preview $fn ≤ 24)
- Intelligent render caching (max 10 cache entries)
- Visual preview state indicators (6 states)
- Rendering overlay with spinner
- Smart download button logic
- Quality tiers: PREVIEW (fast) vs FULL (final)

### Technical
- New `AutoPreviewController` class (375 lines)
- Render caching by parameter hash with LRU eviction
- 5-10x faster parameter iteration
- Preview renders: 2-8s vs Full: 10-60s

## [1.1.0] - 2026-01-12

### Added - Enhanced Usability
- URL parameter persistence for sharing
- Keyboard shortcuts (Ctrl+Enter, R, D)
- Auto-save drafts with localStorage (2s debounce, 7-day expiration)
- Copy Share Link button with clipboard API
- Export Parameters as JSON button
- Simple Box example model
- Parametric Cylinder example model
- Welcome screen with 3 example buttons

### Technical
- URL serialization with non-default values only
- LocalStorage persistence with housekeeping
- Clipboard API with fallback

## [1.0.0] - 2026-01-12

### Added - MVP Release
- Drag-and-drop file upload with validation
- OpenSCAD Customizer parameter extraction
- Auto-generated parameter UI (sliders, dropdowns, toggles)
- Parameter grouping and collapsible sections
- Client-side STL generation (OpenSCAD WASM)
- 3D preview with Three.js
- Orbit controls (rotate, zoom, pan)
- Smart filename downloads (model-hash-date.stl)
- WCAG 2.1 AA accessibility compliance
- Full keyboard navigation
- Screen reader support
- Dark mode support (system preference)
- Universal Cuff example model

### Technical
- Vite build system
- Vanilla JavaScript (no framework)
- Web Worker for WASM isolation
- State management with pub/sub pattern
- CSS custom properties for theming
- Mobile-responsive design

## [0.2.0] - 2026-01-12

### Changed
- Major rescope: v1 changed from CLI tool to web application
- Original CLI scope moved to v2 (developer toolchain)

### Added
- Detailed user journey and UI specifications
- Phased implementation plan with deliverables
- Success metrics and acceptance criteria
- Reference implementation analysis
- Browser requirements and compatibility matrix
- Security considerations and threat model
- Performance optimization guidelines
- CSS architecture and design system

## [0.1.0] - 2026-01-11

### Added
- Initial build plan with CLI-focused approach
- Parameter schema specification
- Validation framework design

---

## Release Cadence

- **v1.0.0** (2026-01-12): Initial MVP release
- **v1.1.0 - v1.7.0** (2026-01-13): Rapid feature releases
- **v1.8.0 - v1.10.0** (2026-01-14): Advanced features
- **v2.0.0** (2026-01-15): Developer toolchain
- **v2.1.0 - v2.10.1** (2026-01-15 to 2026-01-18): CLI enhancements, templates, testing
- **v3.0.0 - v3.1.0** (2026-01-19 to 2026-01-20): Cloudflare deployment, UI/accessibility enhancements
- **v4.0.0** (2026-01-22): Major stable release with full documentation
- **v4.1.0** (2026-01-27): Security hardening, saved projects, documentation overhaul
- **v4.2.0** (2026-03-16): Expert Mode, vector parameters, memory management, desktop parity, Alt View
- **v4.3.0** (2026-03-20): Architecture decomposition, CSP enforcement, accessible errors, menubar, CI stabilization
- **v4.4.0** (2026-04-06): SVG offset, companion hardening, project-native presets, KI-012 resolution, WASM update
- **v4.5.0** (2026-07-12): Braille toolset (card/charm/sign), SVG pipeline overhaul, Alt View rework, WebGL 1 fallback fix

## Version Scheme

We follow [Semantic Versioning](https://semver.org/):
- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backwards compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

## Links

- **Repository**: [GitHub](https://github.com/BrennenJohnston/openscad-assistive-forge)
- **Live Demo**: [Cloudflare Pages](https://openscad-assistive-forge.pages.dev/)
- **Documentation**: [docs/](docs/)
- **License**: GPL-3.0-or-later

---
