# Changelog

All notable changes to the OpenSCAD Assistive Forge project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **A drawing can be built as a stack of layers, not just one flat shape** (DP-7, DP-8) - if the
  shapes in your drawing sit inside one another, the app can now work that out and build them as
  separate passes, each standing on the one before it. Three nested squares come out as a stepped
  pyramid instead of a single flat square. In the drawing editor each shape gets a Layer control,
  suggested from how deeply it is nested and yours to change. If you put a shape on a layer with
  nothing under it, the row says so in plain words and explains what to do, and nothing is moved
  for you: the choice stays yours. The Bracelet Clip Charm is the first model that can build
  them, with its own depth and raised-or-engraved choice per pass, and it is entirely optional -
  leave the layer files empty and the charm is exactly what it was. Measured: a simple drawing in
  three passes renders in 0.34 seconds against 0.31 for one; a very detailed one takes about ten
  seconds against three and a half, so a complicated drawing built in three passes is a
  ten-second render

- **Shapes can be deleted from the editor's list, not just left out of the result** (DP-4) -
  marking a shape "Ignore" kept it out of what gets printed but left it in the list, which is no
  help when a drawing has hundreds of them. Every row now has a Delete button, and above the list
  there are two ways to clear out a lot at once: remove everything smaller than a size you give,
  or keep only the largest few and remove the rest. Sizes are in square millimetres measured
  against the design width, so they are the size the shape will really print. One step of undo is
  available while you are working, and what you removed is remembered with the project, so
  reopening it shows the list you left behind. Removing enough shapes to get under fifty brings
  the automatic preview back

- **Drawings with more than fifty shapes can be opened and edited now** (DP-3) - the editor used
  to refuse any drawing with more than fifty shapes outright, showing no list at all, which was
  precisely backwards: the list is what you would use to delete the shapes you do not want. The
  limit turned out to be guarding one particular step, combining the shapes into a single
  outline, and not the list. So the list is now shown for drawings up to a thousand shapes, and
  the combining step waits until you press Render preview, telling you it is working and how
  long it took. Measured on a real 831-shape drawing: it used to be refused outright, then took
  64 seconds to open once the refusal was lifted, and now opens in about 2 seconds. Drawings of
  fifty shapes or fewer behave exactly as before

- **Saying "Not now" to the tour puts you back at the top of the Main Page** (DP-2) - the tour
  question scrolls the tour cards up so it can point at the button it is asking about, and until
  now answering "no" left you there, with "Open or start a project" and Saved Projects scrolled
  off the top. Answering no now takes you back to the top of the page and lands you on the Main
  Page heading, so a keyboard or screen-reader user carries on from the beginning of the page
  rather than from the middle. The Not now button, the Escape key and clicking outside the
  question all do the same thing, and the tip on the tour card still appears exactly as before.
  Choosing to start the tour is unchanged

- **The first screen makes the recommendation instead of asking you to** (DP-1) - the welcome
  modal now opens with Assistive Forge already chosen, and "Remember my choice on this device"
  now starts UNCHECKED. A first-time visitor can press Download & Continue once and be in the
  recommended interface, without that one press deciding anything permanent for the device: the
  choice is remembered only if you tick the box. Everything else about the modal is unchanged,
  including the wording, the mobile layout, and the notice that Classic is desktop-only

### Fixed

- **Drawings that declare their colours in a style block are no longer read as solid black**
  (DP-3) - drawings exported from CAD and illustration programs usually set "no fill, black
  outline" once at the top of the file and refer to it by name from every shape. Forge was not
  reading that, so it assumed every shape was filled in, and a line drawing became a page of
  solid blocks. On a stencil that meant the whole picture came out as one hole the shape of its
  outer edge, with none of the artwork in it. Forge now reads those rules, and such a drawing
  opens as the line art it is

- **The editor said the wrong thing about drawings it could not open** (DP-3) - a drawing with
  too many shapes was turned away with "has no shapes Forge can work with. A photo needs dark
  lines on a light background to trace." That is advice about photographs, given about a
  drawing, and it named a cause that was not the cause. It now says how many shapes the drawing
  has and how many Forge can work with

- **A picture that was too large to convert no longer reports that it worked** (DP-3) - when a
  photograph was too big to trace, the message saying so was immediately overwritten by one
  saying the file had been converted. The model got nothing, the preview said it was ready, and
  the only place the truth appeared was a message that scrolled past. The failure now stands

- **Two pieces of text on the chosen card were just under the contrast minimum** (DP-1) - putting
  a card in the chosen state on first paint was the first time the modal's amber text had ever sat
  on the pale yellow chosen fill, and there it measured 4.44 to 1 where the standard asks for 4.5.
  The badge and the Accessibility highlights link now use a foreground colour picked for that
  fill, measured at 5.78 to 1. The colour was missing from the design system rather than wrong in
  the modal, so it is added there and every theme states its own value; nothing that was already
  correct changed. Anyone who clicked a card before this release met the same problem

### Added

- **The reference image can sit on any surface, be cropped, and be used as the design** (DP-5,
  DP-6) - three additions to the Reference Image panel. **Sits against** chooses the height by
  naming a surface (under the plate, the plate itself, the top of the model, or a height you
  type) instead of asking for a number; "top of the model" follows the model as it changes, which
  is what you want when tracing onto the top of a charm. **Crop** keeps the part of a photograph
  you want, by typing the edges with the picture beside them showing the same rectangle; it never
  changes your picture, it saves a copy named after the original. **Use as design** hands the
  image to one of the model's design parameters, the same way a file you chose by hand would go
  in, so a photograph is traced and its proportions measured in the same step

- **Forge remembers where you put the reference image, per project** (DP-5) - position, rotation,
  size and chosen surface are saved with the project, so reopening it puts the reference back
  where you left it. Opacity and colour stay the same across every project, because those are
  settings for how you like to work rather than facts about one design. A project saved before
  this release opens exactly as it did

- **Groundwork for opening a file straight into Forge from your desktop** (IR-10, not switched on) -
  an installed app can be registered with the operating system so double-clicking a `.scad`, `.zip`,
  `.svg` or `.dxf` opens it in Forge. The routing is built and tested: a file handed over by the
  system takes exactly the path an uploaded one takes, waits for the engine to be ready first, and
  sends drawings to the drawing editor. The registration itself is deliberately NOT shipped. It is a
  claim on your operating system's file associations, and nobody has yet installed Forge on a real
  machine and watched an Open with actually work. That test is a person's to run

- **The provenance record inside a downloaded project is now a promise, not a proposal** (IR-6) -
  `forge-provenance.json` shipped in an earlier release marked "PROPOSED, not yet a guarantee".
  Its shape is countersigned and it now carries the same additive-only promise and six-month notice
  period as every URL parameter, so a tool at the other end can depend on it

- **One page a pipeline tool can build against without talking to anybody** (IR-6) -
  `docs/specs/FORGE_HANDOFF_CONTRACT.md` writes down how another program hands work to Forge and
  gets it back: the link parameters, the settings fragment, the zero-hosting `data:` lane with its
  measured budget, which hosts a file may live on, what comes back and what it is called, the error
  codes, the sizes, and the four things the browser's security policy will not allow (no iframe, no
  opener messaging, no arbitrary hosts, no server-side state). Every claim on it is backed by a
  shipped release or a file in this repository; where something does not work, it says so. A short
  machine-readable summary is served at `/forge-capabilities.txt`, and a test in the
  production-parity lane composes a link from the page alone and loads it, so the page cannot drift
  away from what the app does

- **A shared link can decide which settings you meet first** (IR-9) - some designs have well over a
  hundred parameters, and every one of them is there for a reason, but that is not a first screen
  anybody can use. Whoever writes a project's manifest can now list the handful that matter
  (`defaults.starterParameters`), and Forge shows those and puts the rest behind one Show all
  parameters button. Nothing is removed: the button is a toggle, everything comes back in the order
  the design wrote it, and searching for a parameter drops the wall on its own and says so. A
  control you cannot see is not reachable by keyboard or screen reader either, so there is nothing
  lurking invisibly in the Tab order. A manifest that does not use the field opens exactly as it
  always did

- **Adding a design of your own is now a documented job, not a favour** (IR-8) - there is a
  template to copy in `public/examples/_template/`, a walkthrough in
  `docs/guides/TILE_AUTHOR_GUIDE.md` that assumes no knowledge of this app's code, and a checker,
  `node scripts/validate-example.mjs`, that reads a contribution and says in plain sentences what is
  missing: no license, a control with nothing to explain it, a picture the design reads but the
  manifest never declares. It also checks that anything meant to be read by touch has a written-down
  range and an `assert()` enforcing it - it cannot tell whether the numbers are right, and says so;
  those come from the standard governing the design and are signed off by a person. CI runs the
  checker on the example folders a pull request actually touches

- **Your edits can land in the folder the other program is watching** (IR-5, off by default) - Forge
  could already watch a linked folder and re-render when a desktop editor changed a file in it, but
  the loop only ran one way: nothing of Forge's could get back into the folder except a preset
  sidecar. Two explicit actions now close it - Save to folder puts a generated file beside your
  design, and Save companions to folder writes the companion files you edited. Every write is one
  you asked for, every write is announced, and your main design is never overwritten: Forge is not
  the editor of record for it in this loop. This ships switched OFF and stays off until the folder
  write-back has been tried on a real Chrome or Edge with the watcher running, which is a test only
  a person can do

- **Open a DXF, tidy it up, and save a DXF back** (IR-12) - laser and cutting software speaks DXF,
  and so does the tool chain some of this work arrives from. The drawing editor now takes a .dxf
  the same way it takes an SVG or a photo: Forge's own engine converts it, the editor opens on the
  drawing with every shape listed, and Save as DXF sits beside Save edited SVG. Measured on a
  40 by 25 mm drawing, converting takes about a third of a second each way. Forge states the size
  of what it saved out loud, because rebuilding a drawing from its shapes is not perfectly exact
  and a millimetre matters when you are cutting to a fit. A DXF holding only text or dimensions
  arrives empty - OpenSCAD reads drawing entities, not annotations - and Forge says exactly that
  rather than handing back a blank page

- **A symbol keeps its picture instead of turning into a coloured blob** (IR-11) - communication
  symbols are black line work over a strong colour, and the colour means something. Forge decided
  what to trace by brightness alone, which puts a blue background and the black drawing on top of
  it in the same bucket: a person symbol inside a blue square came out as a plain blue square, the
  person gone, with nothing said about it. Photos now come in through a choice - Line art, which
  keeps the drawn lines and drops the colour behind them, Solid shape for very small pieces, or
  Light and dark, which is what Forge did before and is one press away. Line art is the starting
  point for photos. Two sliders, each with a number box, tune it, and after every change Forge
  says how many shapes it found, how much of the picture became ink, and whether the result looks
  almost empty or almost solid. If one colour sat behind the lines, it tells you which, so you can
  choose a filament that keeps the symbol recognisable. Everything happens in your browser and
  nothing is uploaded

- **Open a drawing, clean it up, and save it back - no design needed** (IR-4) - Forge already had an
  editor that lists every shape in an SVG and lets you choose, by keyboard, which ones become the
  printed shape, which become holes, and which are dropped. You could only reach it through a
  design's file parameter, and there was no way to get the cleaned drawing back out. Now there are
  two doors - a line inside Explore Features & Accessibility on the welcome screen, and Edit
  Drawing in the Actions drawer - and a Save edited SVG button that hands you the result as a file
  named after the one you opened. Photos are traced first, the same as before. A photographed bird
  drawing goes in with its eye and feather strokes, and comes back as one clean outline the way a
  tactile printer can actually show it. Nothing is uploaded anywhere: the tracing, the editing and
  the saving all happen in your browser, and your original file is never changed

- **Send a link that opens with your settings, and get one back** (IR-3) - a plain link opened a
  design at its own defaults, so "make me this one, but 72 mm wide" meant writing the numbers out
  and hoping. Forge now puts the values you changed at the end of the link. Three ways to make
  one: copy the address bar, press Copy Link in the Actions drawer, or tick "Include my current
  settings in the link" in the Publish dialog before you fill in your hosting address. Only the
  values that differ travel, so the link stays short, and the person who opens it gets your
  numbers checked against what the design allows rather than applied blindly. A design you opened
  from your own computer still gets a link - it carries your settings and says plainly that
  whoever opens it needs to load the design first, because nothing on the web can fetch a file
  from your machine

- **Hand over the whole project as one file** (IR-3) - the Publish dialog can now download an
  archive holding your project's files, the manifest that describes them, and a small record of
  where the design came from, which preset was chosen, and the values that differed. Unzip it into
  your repository and everything is already in the right place

- **The smallest character size now knows your machine** (CW-42) - the game used to open at 50%
  characters on every machine and let you go down to 10% everywhere, even where 10% turned walking
  into a slideshow. Now, in the first moments after you enter a city, the game quietly measures how
  fast your machine actually draws and picks the smallest size in the 10-30% range that can hold
  30 frames per second: that size becomes both where a fresh session opens and how far down the
  Smaller control will go, with a spoken reason at the stop. A size you chose yourself is never
  touched - choose once and the game keeps your choice, today and every day after. On a machine
  where even 30% cannot keep up, the game says so plainly in one line and keeps the 50% default
  rather than pretending. Every city entry measures again, so one slow afternoon never brands a
  fast machine - and the measurement rides the frames the entry was already drawing, so there is
  nothing extra to see or wait for

- **Cars are cars now** (CW-46) - the streets used to park one identical car shape everywhere.
  Six vehicle classes now share the curbs and lanes: full-size pickups with open beds, SUVs,
  crossovers, minivans, sedans and compact hatches, sized from published segment dimensions and
  mixed the way American streets actually look (pickups and SUVs common). Each one is solid at its
  own true size - a pickup blocks more sidewalk than a hatch. And the buildings joined in: window
  sizes now differ between facade families, ground floors vary in height instead of all being one
  size, and shop lights lean warm where food is served, cool at banks and theatres, neutral at
  shops - no more identical white glow on every street

- **People are people now** (CW-45) - the city's pedestrians used to be one identical 1.72 m
  figure stamped everywhere. Every figure is now its own person: height drawn from the documented
  adult range (1.50-1.95 m, the span of published anthropometric reference tables), broader or
  slighter builds, and jointed poses - walkers caught mid-step, joggers leaning with bent elbows,
  people standing about, and figures sitting on real benches (only where OpenStreetMap actually
  records a bench - a city with two benches seats at most two people). Their colors come from the
  game's own color schemes. The same spot always holds the same person on every visit

- **Seattle reaches the Space Needle** (CW-44) - the Seattle map grew from a downtown patch to a
  1.3 km circle centered toward the waterfront: Pike Place, the Great Wheel piers, Pioneer Square
  and the Seattle Center are all in one walkable city now. The Space Needle stands at its true spot
  - and because OpenStreetMap itself records its legs, shaft and saucer as building parts, the
  ordinary building renderer draws a recognizable Needle with no special treatment; walk up and
  look straight up. The map legend fills with real places: Space Needle, Smith Tower Observatory,
  Underground Tour, the Great Wheel and more, each with a compass direction. The bigger download
  (about 4.9 MB) shows and speaks its progress while it loads - on a slow connection the picker
  says "Loading Seattle, Washington… 40%" instead of sitting silent for most of a minute

- **The street furniture is real** (CW-43) - bus stops, benches, waste baskets, bicycle racks and
  fire hydrants now stand in every city, each at the exact spot OpenStreetMap records it - never
  scattered for looks, because for a blind traveler the placement is the information. A bus stop is
  a pole with its flag, and a shelter where the data says there is one; a bench has a back where
  the mapper said so. Everything is solid: walk into a shelter and you press against it and slide,
  the same as a wall. The extracts also now carry the accessibility layer around crossings - kerb
  heights, tactile paving, whether a signal speaks or vibrates - as data for wayfinding features to
  come. Albuquerque, with almost no furniture mapped, stays exactly as sparse as it really is

- **Real attractions join the map legend** (CW-44 groundwork) - named attraction points from
  OpenStreetMap now count as landmarks, so Seattle's legend stops being a list of hotels: the
  Seattle Great Wheel, Pike Place's Public Market Clock, Wings over Washington and more appear by
  name with compass directions. The Wheel is a point in the map data, so it is findable by name
  rather than drawn as a wheel - the honest shape of what open data holds

- **Drop yourself onto any street** (CW-36) - the map was somewhere to look at the city; it is now
  somewhere to travel from. Click a street on the overhead map and the game tells you which street
  you picked, marks it with a ring, and waits. Press J and you are standing there, looking along the
  street rather than at a wall. Nothing is picked and you press J: you land on the middle of the
  map, which matters because the arrow keys already steer that middle - so the whole thing works
  from the keyboard alone, without needing to click anything. There is a **Teleport here** button on
  the map toolbar for the same job. You can never land inside a building: the landing uses the same
  test the walker itself uses to decide whether a step is possible, and if there is genuinely
  nowhere to stand near where you picked, it says so instead of putting you somewhere wrong

### Changed

- **Someone to find in every city** (CW-65) - a traveler is standing somewhere in each city, with a
  white cane and a high-visibility jacket, and walking up to them is worth doing: they say hello,
  the map legend records that you found them, and from then on they are waiting near where you start
  whenever you come back. Where they stand is fixed per city and remembered between sessions, so the
  search is the same one each time until you finish it. **The X key is how you actually find them**,
  and that is not a fallback for anyone - it is the search itself. Pressing X adds a line saying
  roughly how far away they are, from "a long way from here" down to "you can hear a cane tapping
  close by", and it goes quiet once you have found them. The reason is measured rather than assumed:
  a whole person is about two and a half characters wide and four tall at thirty metres, and the
  jacket stops standing out from the crowd at about twenty, in a city two and a half kilometres
  across. Nobody finds one figure in that by looking, so nobody is asked to. **The cane you see is
  drawn thicker than a real one** - a real cane is two-thirds of a screen pixel at that distance and
  could not mark a single character - and the record says so plainly rather than pretending
  otherwise

- **Links that unlock the City Walk no longer throw away what they were carrying** (CW-66) - opening
  a link with `?hfm=unlock` on it removes that part of the address afterwards, so the link is not
  passed on by accident. It was also removing everything after the `#`, which is where a shared set
  of parameters lives - so a link that both unlocked the game and carried a shared model destroyed
  the model on arrival. The part after the `#` is kept now, and the unlock is still stripped

- **Fireworks when you finish a city** (CW-64) - find all twelve landmarks and the sky over the
  city lights up for about twenty seconds: bursts on a ring around you, well above the rooftops,
  drawn as characters like everything else here. Afterwards a Fireworks button appears and the Y key
  replays it whenever you like, and the city remembers that you earned it. The overhead map shows
  the bursts where they really are, so you can watch it from up there instead. **If you use reduced
  motion you still get a celebration**: the same bursts, composed and held still for a few seconds
  in front of you, with a spoken line saying what it is and why it is not moving - because a reward
  that answers "no" is worse than one that answers quietly. The show was measured against WCAG
  2.3.1, the standard that protects people who can have seizures from flashing: it produces no
  flashes at all, and the whole picture's brightness moves about a ninth of what a single flash
  would need. The instrument that says so was first proven able to catch seventeen flashes in a
  deliberately strobing version

- **Two Seattle landmarks now look like themselves** (CW-63) - every building in the City Walk is
  drawn by one pipeline from its own OpenStreetMap data, on purpose, because a city where the code
  knows about particular buildings stops working when the data moves. Two named landmarks are now a
  deliberate exception, and only two. The Space Needle has its arched tripod: the map data holds
  thirteen straight volumes and no curve at all, so the hourglass - the one thing that makes the
  silhouette the Space Needle rather than a mast - is drawn from the published dimensions. The
  Seattle Central Library has its five offset platforms with the flowing planes between them and the
  diamond steel grid over the whole envelope, where before it was a plain box: its map data is a
  60 metre outline and four roof planes, with no massing in it at all. Both are authored from
  published heights, storey counts and section drawings, cited in the code beside the numbers they
  produced; there is no imagery involved and nothing traced from anybody's photographs. Every other
  building in every city takes exactly the path it always did, and each landmark is one line to
  reverse

- **The map asks before it moves you** (CW-61) - clicking the City Walk's map used to do nothing
  unless you had first pressed Teleport to arm it, and then any click sent you there instantly with
  no way back to where you were. Now a click anywhere on the map asks, in a small dialog that names
  the spot you would land on: "On 4th Avenue and Union Street", or one street where there is no
  corner, or open ground. Nothing moves until you press Travel here, and Cancel or Escape leaves you
  exactly where you were and says so. J asks the same question about the middle of the map, so the
  keyboard reaches it too. The naming is careful about what it claims: it will only call a spot a
  corner when a second street really is within twelve metres, and it will never offer a street its
  own cycle track as the cross street. A circle marks the spot being asked about while you decide.
  The old Teleport button stays, doing the asking rather than the arming

- **Four maps in one** (CW-60) - the City Walk's overhead map can be drawn four ways now, and each
  one is a simplification rather than a repaint. Standard is the map as it has always been.
  Roads only hides the buildings and parks so the street network stands alone. Buildings only takes
  the streets down to a hairline so the shapes of the buildings carry the place. Wayfinding is the
  reason the other three exist: it marks every crossing, every stretch of tactile paving and every
  kerb the map records, over everything else dimmed to be the ground they sit on. That information
  has been read out of OpenStreetMap and carried around in the game for eight releases without
  anything ever drawing it. The idea comes from how tactile maps are made, where one map carries one
  kind of thing because a finger cannot read a page as an eye can. Over the map the second control
  pad in the Camera panel changes the style, K and Shift+K step through it, there is a Map style
  button in the map toolbar, and the choice is remembered. Street view is untouched by all of it

- **Birds where birds rest** (CW-58) - gulls and crows on parapets and lamp heads, pigeons and
  sparrows on bench backs, picnic tables and planter rims, Canada geese gathered on park grass, and
  in Albuquerque the greater roadrunner along the roadside its name comes from. Each city has its
  own roster and each bird sits only on a perch that bird actually uses. Everything is built at its
  real field-guide size, and nothing was made bigger in order to be seen: the goose reads
  unmistakably, neck and all, while a house sparrow at true scale is a small mark on a bench back
  rather than a recognisable bird. That is the honest trade, and it is written down rather than
  papered over

- **Planters, flowerbeds and picnic tables** (CW-57) - where a city's map records them, and only
  there. Seattle and Burnaby have real ones and use them; Denver and Albuquerque have none recorded,
  so they get hash-placed planters inside their own real parks, counted separately so design can
  always be told from data. Denver's map has no picnic tables at all and none were invented. Each
  city's flowers come from a cited list of what its parks actually plant, which is why Albuquerque's
  come out yellow where Seattle's come out pink

- **Trees with names** (CW-56) - a street tree used to be one shape repeated. Each city now plants
  the species its own street-tree inventory records, in the crown form that species has, and where
  the map says a tree is needle-leaved it is drawn as a conifer even when the city's common list
  names none. Heights are compressed against the cited ranges, because at full size this city's
  infill spacing closes the sky into a ceiling

- **The cars have wheels, and the ones that are driving have their lights on** (CW-54) - a parked
  row used to read as a low dotted mass, because every car body sat flat on the road with nothing
  under it. Each car now rides on four wheels at a height typical of its own kind, so there is a gap
  under it, and at this size that shadow line is what says vehicle long before a wheel is big enough
  to see. Tyres are a little darker than the body they carry, but not so dark that they vanish
  against black tarmac. The cars standing in the traffic lanes have white head lamps at the front
  and red brake lights at the back; the parked ones are dark, because a parked car is parked and
  because a string of bright points down every kerb is not what a street looks like at night

- **Twenty kinds of shop front instead of five** (CW-53) - the ground floor of a building used to
  come from one of five window patterns picked at random. There are now twenty, and which one a
  building gets is decided by what the map actually records there: a restaurant gets warm glass with
  dark tables along the bottom, a bakery a lit counter under a canopy, a bank one lit alcove in a
  dark front, a theatre a bright bulb band, an empty unit papered windows with no light in them at
  all. Buildings with nothing recorded near them still fall back to a pattern chosen from the
  building itself, so a street is never uniform. All twenty appear in all four cities

- **The city stops flickering while you move** (CW-52) - lit surfaces used to fizz and flash as you
  walked or turned, in a way a screenshot could never show. The cause was not the lighting. A
  second, hidden pass tells the drawing which surface each character is looking at, so a shopfront
  and the wall behind it can be drawn with different characters, and that pass could not reliably
  tell the two apart where they touch: it changed its mind again and again as you moved, and better
  than a quarter of the screen kept swapping character sets frame after frame. It now keeps them
  apart the same way the picture itself does. Measured over twenty consecutive frames of a very
  slow turn, the flicker drops by more than nine tenths at every character size, in both screen
  colors, while the brightness of the picture is unchanged to the last digit - the glow stays, the
  fracture goes. Two ground textures that were never actually being filtered for the character grid
  are now filtered, and the ground far ahead of you, which you see almost edge on, is filtered for
  that angle as well

- **Lines on the road, and a pavement with the finish its own city specifies** (CW-51) - the
  arterial streets now carry a dashed centre line, so a main road reads as a main road rather than
  as a wider gap. The lines are derived from what kind of street it is, because the map data does
  not record road markings anywhere in the four cities. Pavements had no surface at all and now
  carry control joints about every metre and a half, plus the finish the city itself specifies:
  pebbly river stone in Seattle, flat with cracks and grip scoring in Albuquerque, and a broom
  finish in Denver and Burnaby, which is what both of those cities' construction standards call
  for

- **The streets are the width real streets are, and they have curbs** (CW-50) - the road widths
  described the driving lanes only, so a street read as narrower than the one you would stand on,
  and the roadway itself was an indistinct dark gap between two thin lines. Widths are now measured
  curb to curb, the way a pavement meets a road: a two-lane residential street with parking on both
  sides is about eight metres across, not six, and each step up from there adds a lane. Every
  street now has a raised pavement beside it and a real curb you can step down off and back up
  onto, instead of only the few streets whose pavements the map happens to record separately. Your
  eye follows the ground: it drops as you step into the road and climbs as you step back up, over a
  short distance rather than in a jump, and it never changes with how fast you are walking. The
  curb is never a wall - you can always walk across it. Pedestrianised streets have no curb at all,
  because they are pavement from one side to the other

- **Every part of a figure takes a color from the scheme** (CW-49) - a person's torso and legs
  already wore colors from the city's own color scheme, but their head and shoulders kept a single
  fixed tone, so a street of people repeated one note at the top of every figure. All three zones
  now take their own hue, picked from the figure's own position so the same spot always holds the
  same person. The monochrome screens are unchanged by design: there is no color scheme to show
  there, so a head is simply a bright head

- **The city walks at city speed** (CW-48) - walking used to start at a stroll, and the way to a
  brisk pace was to turn the speed up every time you arrived. What the slider called 300 percent is
  now what it calls 100, and it is where the game starts. The top of the range is faster than the
  old top was, and Shift now always outruns whatever pace you have set - it used to be a fixed
  speed that a turned-up walk could overtake. The numbers the slider announces are the same 50 to
  300 they always were, so nothing you learned about it has changed except how far it gets you. A
  walking speed you saved before is carried over, with the old top of the range becoming the new
  normal one. If you had it near the bottom you will come back a little faster than you left,
  because the slowest setting on the new scale is quicker than the slowest on the old one

- **Walking into things works the same however fast you are going** (CW-48) - collision was checked
  once per drawn frame, so how precisely it worked depended on how far you travelled in that frame,
  which meant it depended on your walking speed and on how busy your machine was. Tripling the
  default speed would have made the loose case the usual one, and at the very top of the new range
  a sprint on a slow frame could cross a tree trunk entirely. Each frame's movement is now checked
  in fixed short steps instead, so how close you can get to a bench, a car or a wall no longer
  depends on your pace or your hardware

- **The sharing guide stops recommending hosting that does not work** (IR-2) - it told authors to
  put a GitHub release URL, or a Cloudflare R2 / S3 bucket URL, into their manifest. Forge's
  security policy names the hosts it may fetch from, and none of those are on it: the browser
  blocks the request before it is sent, so those projects simply never loaded. The guide now says
  so plainly, shows what was measured, and points at the hosts that do work - the repository
  itself, GitHub Pages, GitLab Pages, Cloudflare Pages. It also stops claiming no tool writes the
  manifest for you, because the Publish dialog has been doing exactly that

- **The shimmering facades hold still** (CW-41) - at small character sizes, building fronts used to
  carry sliding interference bands - "a fractured polygon" look - because the window pattern sat at
  the same scale as the characters themselves, and every tiny movement of the view re-rolled which
  characters lit up. Measured first, then fixed: the facade textures are now filtered for the
  character grid rather than the pixel grid, so window patterns dissolve smoothly exactly where
  they become too small to draw honestly, and stay sharp everywhere they fit. Up close nothing
  changes; the interference is gone at the small sizes, and drawing got no slower - on the densest
  city it measured slightly faster

- **Teleporting is drop-a-pin now** (CW-40) - press **Teleport** on the map toolbar and the cursor
  becomes a ring; click anywhere on the map and you are there, in one step - the "I'm here" marker
  moves to the spot, the game says which street you landed on, and you stay on the map so you can
  keep hopping without re-arming. Enter the street whenever you choose; it opens exactly where you
  landed. Pressing the button again turns the mode off, and leaving the map turns it off by itself.
  From the keyboard nothing got harder: the arrows still steer the map and **J** still drops you at
  the middle of the screen, with no mode to arm. The old two-step flow - click to pick, then press J
  to go - is gone, along with its "Press J to go" prompt. The marker itself was redrawn as a bright
  square frame around a dark centre that stays the same size at every zoom level: the old solid
  block shrank to a dot zoomed out, and in color mode it vanished entirely among white buildings

- **The phosphor trail is retired** (CW-39) - moving through the city used to leave a fading
  double-exposure behind every tree, pole and sign, the way a slow CRT smeared when it scrolled. The
  owner found it distracting, and it was expensive: measured side by side in one session, drawing
  without it is 19 to 32 percent faster per frame on a throttled machine, which on this hardware is
  the difference between about 26 and about 40 frames a second standing in heavy rain at the
  smallest character size. The night city itself is untouched - the lit windows, the bright
  storefronts and the dark ground all read exactly as before; only the smear is gone. The main
  app's Alt View keeps its own afterglow slider exactly as it was

- **The Camera panel speaks the game's language** (CW-38) - its two direction pads were titled
  "Rotate View" and "Pan View", the 3D preview's camera words. In the street they now say
  **Look Around** and **Walk Around**, and over the map both say **Pan Map**, because over the map
  both pads pan. In high contrast the panel also fits the screen again: every control grows in that
  mode and the panel had quietly become taller than a 1600x900 display, leaving Reset View stranded
  below the edge of the screen behind a scrollbar

- **One key, one meaning** (CW-38) - Minus and Equals used to change character size in the street
  but zoom the map overhead, so the same key did different things depending on where you were
  standing. They now change character size everywhere, and the map zooms with **Page Up** and
  **Page Down** instead - held down, exactly the way the old keys worked. The help panel, the spoken
  map-view announcement and the toolbar tooltips all teach the new keys

- **The Colour button now says Color** (CW-38) - the game speaks US English everywhere a player can
  see, and this was the one hold-out. Only the words changed: your saved choice is kept, and
  everything under the hood keeps its old name so nothing you stored is lost

- **A phone toolbar that earns its rows** (UF-42) - with a project open on a phone, the app used to
  spend four stacked rows before you saw anything you came for: the header, a row holding four
  icons, the menu row, and the Customizer row. That is 147 pixels in the Simplified view and 187 in
  Standard, on a screen about 810 pixels tall. High contrast, theme, Full Screen and Help now sit in
  the Customizer row, which had the width going spare, and the row they came from is gone.
  Simplified spends **93** pixels of chrome instead of 147; Standard spends **135** instead of 187.
  On a real phone that is about a tenth more preview. Nothing was hidden or shrunk to do it: all
  four controls are the same size, in the same order, with the same names, still reachable by
  keyboard, and every tour that points at one of them still finds it. On a desktop-shaped window
  they move straight back where they were, live, with no reload. The Main Page keeps its own row
  exactly as it was, because high contrast and theme have to be reachable before you open anything

- **The Classic button no longer sits greyed out on a phone** (UF-42) - Classic is a desktop layout
  and is not being offered on phones for now, so on a phone-shaped screen the button is simply not
  there, rather than sitting there dimmed and unusable. It comes straight back when the window
  becomes desktop-shaped, without a reload, and if you are already in Classic on a window you have
  narrowed, the button stays put - the way out is never taken away. The explanation you used to get
  from the greyed-out button is still there, on the first-visit screen, in the same place it was

- **Where the City Walk's speed actually landed** (CW-37) - this round set out to hold 30 frames a
  second at the smallest character size, with heavy rain, on a machine running four times slow.
  Measured on all four cities, walking, on a real graphics card: **on a normal machine the target is
  met with room to spare** - 18.6 to 22.2 ms a frame against an allowance of 33, and 60 frames a
  second. At the character size most people play at, the frame-rate target is met even on the
  four-times-slow machine. At the smallest size on that slow machine it is **not** met: 25 to 28
  frames a second instead of 30. The round took that case from 3 frames a second to 26, and the
  reason it stops there is now measured rather than guessed - between 39 and 49 ms of every frame
  does not depend on the number of characters at all, so no further work on the characters can
  reach the target. What is left is the painting and the phosphor trail, which are not part of this
  round's plan and are a question for the owner rather than a decision for it

- **The camera controls are the ones you already know** (CW-35) - the game had its own vocabulary
  along the bottom of the screen - Turn left, Look up, Forward, Step left - which is a second thing
  to learn for the same job the Forge's 3D preview already does with a Camera panel down its
  right-hand side. That panel is in the game now, same sections in the same order: Rotate View, Pan
  View, Zoom, Standard Views, Reset View. The buttons do not reinvent anything; each one drives an
  action the game already had. Two words changed to fit a city: the Forge's `Bottom` view is
  `Street` here, and its Front/Back/Left/Right are `North`/`East`/`South`/`West`, because the game
  has a real compass and the status line already speaks in bearings. `Towers` tilts your gaze up at
  the skyline. The panel collapses if you want the city back, and remembers that you collapsed it
- **The same panel works over the map** (CW-35) - it does not disappear when you switch to the
  overhead view, it re-labels: the D-pads pan the map, Zoom becomes the map's own zoom, and Reset
  centers it back on you. The four compass buttons and Towers stand down there, because there is no
  walker on screen to turn. What still swaps on the toolbar is only what genuinely means nothing
  overhead - Fast and Rain leave, and the map's own three arrive
- **The buildings stop repeating** (CW-34) - two things you photographed. The first: at your
  character size the near towers read as literal giant letters, because each family of buildings
  had a letter cut out of its window panes to tell it from the next. The letters are gone. What
  identifies a building now is the shape of its glazing - nine kinds, from a plain pane to a
  vertical slot to a continuous horizontal band - and, more than that, **which of its windows are
  lit**. The old pattern lit each window independently, which produces an even scatter that repeats
  every four windows across; the city read as wallpaper because it was. Windows are now lit in
  runs, with the run length and how many are lit re-rolled every few floors, so a tower reads as
  offices working late. Each building also slides its own pattern along the tile, so two neighbours
  of the same family are not the same wall twice
- **Ground floors that are not all the same** (CW-34) - the second: every building's first level was
  literally one repeating strip. There are five now - a glass front, an awning, a closed roller
  shutter, an arcade, and a blank service wall, because a street where every ground floor is a shop
  reads as a film set. Which one a building gets comes from the nearest shop or cafe in the map
  data where there is one, and from the building itself where there is not

### Fixed

- **The Logo Plate example works out of the box** (IR-7) - opening it always failed underneath:
  the engine could not find the sample logo it imports, so the engraving was missing, while the
  status line cheerfully said "Preview ready". The file had been sitting in the repository the
  whole time and the example's own description listed it; the part of the app that fetches files
  read a different list that did not. Both now come from one place

- **A shipped sample drawing a browser could not read** (IR-7) - `sample-logo.svg` contained a
  stray control character in a comment, left over from an em dash. OpenSCAD ignored it, but a
  browser refuses such a file outright, so the moment the file finally reached the project the
  reference-image overlay failed to load it. Fixed, and every SVG the app ships is now checked for
  characters XML does not allow

- **When a link's numbers get changed, the message now waits for you** (IR-13) - opening a shared
  link whose value is outside what the design allows adjusts it, and Forge said so in the status
  line for about two thirds of a second before the render replaced it. Anyone who looked up a
  moment later never found out their number had moved. It is now a notice that sits above the
  controls until you dismiss it, and it names each one: which parameter, what the link asked for,
  and what it is now

- **Changing how a photo is read no longer throws you out of the control you are using** (IR-11) -
  re-reading a picture rebuilds the editor underneath, and that was moving the settings panel in a
  way that dropped your keyboard focus and shrank the editor back behind the page. Both were found
  by a test that runs the same walk four times. The editor now stays as you left it: expanded if it
  was expanded, with the keyboard still on the control you were adjusting

- **The drawing editor reads correctly to a screen reader** (IR-4) - two long-standing faults, both
  found the first time the editor was checked with an accessibility scanner. The list of shapes had
  a hidden announcement area parked among the list items, which made the whole list invalid - a
  screen reader could not rely on "shape 3 of 7" meaning anything. And both preview panes claimed
  to be pictures while holding zoom buttons inside them, which is a combination assistive
  technology refuses. The announcement area moved out of the list, and the panes are now named
  groups holding a picture. The scanner reports nothing on the editor at all now

- **The Publish dialog is readable in the light theme again** (IR-3) - it painted a dark box under
  dark text, so the manifest it generated and the address you typed were both invisible unless you
  used the dark theme. The dialog's colors came from names the app does not define, each with a
  dark value written in beside it as a fallback, so the dialog never followed your theme at all.
  Measured before: about 1.03 to 1 against a 4.5 to 1 minimum. Measured after: about 14 to 1

- **Publish no longer hands you a manifest Forge would refuse** (IR-2) - for a project you loaded
  from a ZIP, the Publish dialog put the archive's own filename where the main design file belongs.
  Forge rejects that on the way back in, so the link built from it could not open the project, and
  nothing said so until someone tried it. A ZIP project is now described as what it is: the archive
  as the bundle, the real main .scad inside it named beside it, and the files it contains not
  listed twice. The dialog also checks its own output against the same rules the loader uses, and
  refuses to open with a plain explanation rather than handing over something broken

- **A link with your settings in it now actually opens with your settings** (IR-1) - the app has
  always written the values you changed into the end of the address bar, so a link you copied
  carried them with it. Opening that link never applied them: the person you sent it to saw the
  model's plain defaults while the address still promised your numbers. Now the values arrive in
  the controls, out-of-range numbers are pulled to the nearest allowed value with a spoken note
  saying so, and a value the model does not have is dropped with the same note rather than
  silently ignored. Anything else already in the address after the # sign - a marker some other
  tool put there - is now left alone instead of being wiped when a project loads

- **You spawn facing down the street, not into a wall** (CW-44) - every city entry used to face
  due north no matter what stood there, and the bigger Seattle put a storefront two and a half
  meters that way: the first thing a new player did was walk into a wall. The spawn now faces the
  direction with the longest clear, walkable run - in Seattle that is an open street with a proper
  vanishing point. CI caught this before a person did

- **Collapsing the game's Camera panel no longer traps you** (CW-38) - the collapse arrow hid the
  panel and then hid itself, so there was no way to bring the panel back - and worse, the vanishing
  button silently dropped your keyboard: after collapsing, M, the arrows, every game key went dead
  until you happened to press Tab. The reopen arrow now stays put when the panel is collapsed, keeps
  your focus, and the keyboard keeps working the whole time

- **The preview status line can actually be read on a phone** (UF-42) - the line that tells you the
  preview is ready, how big the file is and how many triangles it has was written into a corner
  that, on a phone, always had something on top of it: the Actions and Camera bar when the camera
  pad was shut, and the camera pad itself when it was open, where it came out washed-out with the
  pad's own headings printed through it. It now reads at the top of the preview, clear of both.
  One thing this quietly repairs: pressing the theme button writes "Theme: Light" to that same line,
  so on a phone the first press looked like it did nothing at all. It has been saying so all along
- **The Main Page button is whole again** (UF-42) - at phone width the GitHub button was painted
  over the last 19 pixels of "Main Page", and a tap that landed on the tail of the label opened
  GitHub instead of going back
- **High contrast no longer pushes the toolbar off the side of the screen** (UF-42) - high contrast
  makes every control a little wider, and the header row had no way to give: it slid its contents
  off the left edge, where there is no scrollbar to bring them back. "Main Page", "File" and
  "Customizer" were all cut. The row now wraps onto a second line when it genuinely cannot fit,
  which costs a little height in high contrast and keeps every control on screen and tappable
- **A tour card no longer sits on top of buttons it is not talking about** (UF-42) - on a phone, a
  step pointing at something near the bottom of the screen put its card over the whole top of the
  app: ten controls were underneath it and could not be tapped. The card now starts below the app's
  own toolbar
- **High contrast advertises its keyboard shortcut** (UF-42) - the high-contrast button never told
  screen readers about Ctrl+Shift+H, though the theme button beside it always had

### Added

- **Real ground under your feet** (CW-33) - the city had one floor: a roadway, a kerb line and a
  dotted plane. It has three now. Pavements that are mapped separately from the road - and there
  are 1,539 of them in Seattle alone - are drawn as their own narrow ribbons, lighter than the
  carriageway and written with their own set of characters, so you can see where the kerb is
  instead of inferring it. Parks, gardens, pitches and playgrounds appear as greenspace, with their
  own characters again: clumps and tufts rather than the lines the road uses. And where the map
  says what a road is paved with - asphalt, concrete, paving stones - the texture shifts to suit;
  where it does not, a roadway is assumed asphalt and a pavement concrete, which is what
  OpenStreetMap itself assumes. All four cities were rebaked to collect this
- **Denver has its shape at last** (CW-33, CW-Q31) - it has been the one city drawn as plain boxes
  since the stepped towers arrived, because it is mapped in unusual detail: 3,013 separate volumes,
  more than the file budget allowed. **2,118 of those are smaller than ten square metres** - ledges
  and setbacks a few centimetres across that no character on screen could ever show. Dropping them
  leaves 895 real volumes and brings the city inside the budget, so Denver now has its stepped
  towers and its roofs

### Changed

- **The graphics card now chooses the characters** (CW-32) - deciding which character to draw in
  each cell was the single most expensive thing the City Walk did: sixteen brightness samples, two
  contrast curves and a nearest-shape search, on the processor, about 140,000 times per frame at the
  smallest character size. All of it is now one drawing pass on the graphics card, which is the kind
  of work graphics cards exist for. Same session, same standing view, heavy rain, 10% characters,
  with the processor slowed to a quarter speed: a conversion fell from 220 ms to 65 ms in
  monochrome, and from 268 ms to 34 ms in colour. The picture refreshes about three times as often
  and the frame rate roughly tripled. The city looks the same - the two paths were photographed side
  by side at 10% and 50%, in monochrome, colour and high contrast, and the differences are subtle
  changes in how densely a few cells are inked, about half of them cases where the graphics card
  picks the *nearer* character than the processor's cache did. Nothing depends on it: a machine
  without WebGL2, a shader that will not compile, or a readback that fails all fall back to the
  processor permanently and silently, and that path is unchanged and still runs everywhere. **The
  goal of thirty frames a second on a low-end machine is still not met** - drawing the finished
  picture is now the expensive step, and it was not part of this work

- **The city runs colder at the smallest characters** (CW-30) - at the 10% character size a cell is
  about two device pixels wide, and the converter was reading sixteen samples for it. Measured,
  those sixteen land on six distinct pixels: the ring of samples meant to see a cell's surroundings
  was reading the very pixels the cell itself had already read. Each pixel is now read once and
  handed to every sample that asked for it, which is not an approximation - the picture comes out
  the same character for character. The two contrast curves, which raise a number to a fixed power
  up to twelve times per cell, are now read from a table built once per frame rather than computed
  per cell. Same session, same standing view, heavy rain, 10% characters, under a 4x CPU throttle:
  a conversion took 287-346 ms before and 179-190 ms after, and the picture refreshed about three
  times a second before and about five after. Nothing about how it looks has changed - at 50%
  characters the frame is pixel-for-pixel identical to the old path, and at 10% it differs in 17
  pixels out of 1,129,600, against a 31,000-pixel floor from capturing the same code twice. This
  is the first of three staged pieces of performance work; the goal of thirty frames a second on a
  low-end machine is not met yet

### Added

- **The tour ends by telling you the way out** (UF-39, U-45) - the Getting Started tour used to
  finish with "You're ready!" and leave you standing in a project with no word about how to get back
  to your own files. The way people reached for was the browser's Back button, which closed the app.
  Both project tours, Forge and Classic, now end on one more step that points at the Main Page button
  in the top left corner and says to use that instead. Pressing the button it is pointing at is a
  first-class way to finish: the tour closes with the project, announces that it did, and keeps your
  progress. The Main Page tour gained the same sentence in its closing step, so the button is named
  from both directions. Both project tours are 18 steps rather than 17
- **The city file format is written down, and so is where this is going** (CW-28) - two new
  documents. The first describes the city extract format field by field, so that someone who has
  never seen this project could write a valid city file, or write a second program that reads one.
  The second records two things the City Walk is deliberately built to grow into: letting people
  search for an address and walk there, and feeding tactile maps for readers who cannot see the
  screen. The roadmap is a record of intent and of the seams already in the code, not a schedule -
  and it states plainly that when tactile work does begin, every dimension a hand reads is a
  safety value that needs a signed-off number, with no exceptions
- **The status line knows which street you are on** (CW-27) - walk down a street and the line at
  the top now reads "on 4th Avenue", changing as you turn onto another one. If you are not
  actually on a street it says "near" the closest one, and if there is nothing close it says
  nothing at all rather than naming a street you cannot see. Press **X**, or the new **Where am
  I?** button in the toolbar, and the game says the whole thing out loud through the same
  announcer everything else uses: which street, which landmark is nearby, and which way you are
  facing. The names were in the map data all along - the game had been throwing them away while
  reading the file
- **The cities get the shapes they were actually mapped with** (CW-26) - a tall building is rarely
  one plain box, and until now every one of them was. Mappers describe a stepped tower by drawing
  its separate volumes, and describe a house roof by naming its shape; the bake threw both away
  before the game ever saw them. Seattle, Burnaby and Albuquerque have been rebaked to keep them.
  One Seattle tower that used to be a single 259 m block is now twenty-six stacked volumes
  stepping 255, 147, 126, 110 m and down - and the skyline as a whole gained about a sixth more
  steps in it. Pitched roofs - pyramidal, gabled and hipped - are built as real shapes that finish
  at the height the building is tagged with, rather than being stacked on top of it. Roof shapes
  nobody can draw honestly from the tags, and buildings too irregular to say which way they run,
  keep their flat tops rather than being guessed at. **Denver is unchanged for now**: its 3,013
  mapped parts are mostly tiny architectural details and carrying them all would nearly double the
  download, so that trade is written up for a decision rather than made quietly
- **Weather, photographs, and a reason to wander** (CW-20) - three things the City Walk did not
  have. **Rain**, on the G key or the Rain button, in two strengths: heavy is not simply more
  drops but faster and more slanted ones, because rain that only gets denser reads as fog. The
  drops are real objects in the world rather than something painted over the top, so the same
  machinery that turns the city into characters turns them into streaks - look up while it is
  raining and they converge overhead the way falling rain actually does. While it rains the fog
  slowly breathes between a clear night and a murky one, taking about three minutes to cross,
  and distant thunder lifts the light by a fifth for a third of a second every half minute or so.
  All of that is movement, so all of it stops for anyone who has asked for reduced motion - and
  the G key says so out loud rather than ignoring the press, while the button removes itself
  instead of sitting there doing nothing. **Photo mode**, on P, saves a PNG of exactly what is on
  screen, named for the city and the date. **A landmark tracker**: the status line counts the
  landmarks you have walked past, the map legend ticks them off, and when you have found them all
  the game says so once. Nothing is stored - a fresh visit is a fresh walk
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

- **One name per thing** (UF-40, U-44) - the app used four names for two things. The page you land
  on was the "welcome page", the "welcome screen" and the "Main Page" depending on which tour, button
  or message you happened to read; the panel where you change a model was "Params" on a phone,
  "Parameters" in the tours, and "Customizer" on its own heading. It is now the **Main Page** and the
  **Customizer**, everywhere a user can read it, in both interfaces and every theme. The Main Page
  also says its own name now, in its heading, with a line explaining what it is for: your projects,
  organized like folders on a desktop computer. Five controls that named the panel indirectly came
  with it, so **Export Params** is **Export Customizer Settings**, **View Params JSON** is **View
  Customizer JSON**, **Color Parameters** is **Color Settings**, **Reset All Parameters?** is **Reset
  the Customizer?**, and the search box says **Search the Customizer**. The individual values inside
  the panel are still parameters, which is what desktop OpenSCAD calls them, and nothing in a .scad
  file was touched. Two controls also had accessible names that did not contain the words printed on
  them, so someone using speech input could read "Main Page" or "Customizer" on screen and have
  nothing happen when they said it; both now match (WCAG 2.5.3). The tour that walks you around the
  Main Page is the **Main Page Tour**, and the step that used to say "Click Generate" now names both
  labels that button can wear, because once a file exists it says Download
- **The two halves of the browser test suite now take the same amount of time** (CW-29, D-72) - the
  Chromium and Edge test lanes each run in two halves side by side, and each half was being given
  the same NUMBER of tests: 476 against 475. The work was nowhere near equal, because the slow
  files happen to sort first alphabetically - one of them, the City Walk's own suite, is a quarter
  of the whole lane on its own. One half ran for 32 to 35 minutes against a 35-minute limit and
  failed three times on the clock rather than on anything being wrong; its sibling finished in 12.
  The halves are now packed by measured cost, from real timings read out of a green run, and come
  out at about 20 minutes each. The list of files is read off disk every time, so a test file added
  later cannot fall between the two halves and quietly stop being run
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

- **The welcome dialog fits the phone, and the Download button never leaves the screen** (UF-41,
  U-39) - the first thing a new person saw on a phone was a dialog with two enormous screenshots in
  it, nothing to say it scrolled, and the button that starts the app hidden somewhere below the
  bottom of the screen. The whole Classic card was down there too. Measured across six screen sizes,
  **Download & Continue was below an unmarked fold on every one of them**, laptops included - a
  1366x768 screen missed it by about 90 pixels, so this was never only a phone problem. The dialog
  is now built as three parts instead of one: the title at the top and the button at the bottom stay
  put, and only the middle scrolls. Download & Continue is on screen and pressable at every size
  tested, down to 360x640, where fitting everything without scrolling is simply not possible. On a
  phone the two interface screenshots are gone - Classic cannot be chosen on a phone anyway, so they
  were pictures of a choice you are not being offered - and the four "note for first time users"
  facts become four tappable rows you can open one at a time: **Browser based process**, **Initial
  download, about 15 to 30 MB**, **Local project storage**, **Completely removable**. On a computer
  nothing is hidden: the four facts stay written out in full, and the two screenshots are still
  there, just small enough to sit side by side. Where the dialog does still scroll, a fade and a
  small chevron above the button now say so, and they go away when you reach the end. In high
  contrast the fade becomes a hard line instead, because a soft gradient is the wrong instrument
  there and does not render at all in Windows' forced-colours mode. Screen-reader users lose
  nothing when the pictures go: the description of each interface's layout moved to text that is
  always present, so it is read out exactly as before
- **The welcome dialog's title no longer hides under the browser's toolbar** (UF-41, U-39) - on a
  phone the title was cut off at the top by the browser's own chrome. The dialog was being sized
  against the height a phone has with its toolbar hidden, so whenever the toolbar was showing the
  box was taller than the space it was being centred in, and it overflowed off the top and the
  bottom at once. It is now sized against the space that actually exists, with the phone's safe
  areas already taken out of it
- **The Back button asks before it closes the app** (UF-39, U-41) - on a phone, halfway through the
  Getting Started tour, pressing the browser's Back button closed the whole app. Not the panel, not
  the tour, the app: the next thing on screen was the browser's home page. Nothing the app did had
  ever put an entry in the browser's history, so the first Back press was always a step out of the
  document, with no chance to say anything about it. Opening a project now adds one history entry of
  its own, and that is the entry Back lands on, so instead of leaving you get a dialog: "Leave the
  app? The browser's Back button closes this app. It does not go back to the Main Page or the
  previous menu. Your saved projects stay in this browser." Stay in the app puts you back exactly
  where you were, including the address bar, and it works every time rather than once. Leave really
  leaves. Escape and a press outside the box both choose Stay, and Stay is the button that already
  has focus when the dialog opens. A tour that is running stays running, on the step it was on. The
  Main Page keeps the browser's own behaviour: the guard is for a project you are inside of, and it
  takes its entry back out of the history when you return to the Main Page, so nothing stale is left
  behind. If you press Back twice, the second press leaves, the same as it always did
- **Walls you look straight at are drawn as walls again** (CW-29, D-73) - the City Walk decides what
  each character is looking at before it picks the character, so that a road can be drawn with
  characters that lie down and a wall with characters that stand up. It worked out which way a
  building face pointed relative to the CAMERA rather than relative to the world, so any facade you
  stood square to was filed as a rooftop and drawn with the flat horizontal characters rooftops
  get - the venetian-blind banding the wall vocabulary exists to avoid, on whichever building you
  happened to be looking at. Standing at one Seattle corner with the view level, 28.6% of the
  screen was being called rooftop; from street level with a level view the true answer is
  essentially none, and now is. Every other surface classified identically before and after, and
  the map view - where the camera really does look down and roofs really are roofs - is unchanged
- **The fog no longer outstays the rain that brought it** (CW-29, D-74) - while it rains the fog
  slowly breathes between a clear night and a murky one, over about three minutes. That drift was
  read off a clock that kept running whether or not it was raining, and was only ever applied while
  it was. Stop the rain on the murky half and the fog stayed at its thickest for the rest of the
  session, on a clear night, with nothing on screen to explain why you could not see across the
  street. Start it again and the fog jumped in a single frame to wherever the clock had got to.
  Now a shower picks the drift up from the fog that is actually on screen and carries on
  thickening from there, and ending a shower hands back the clear night it borrowed
- **Thunder lets go of the city** (CW-29, D-75) - a thunder swell lifts the ambient light by up to
  22% over a third of a second and then puts it back. Putting it back needs a frame, and both ways
  out of the rain skip those frames: stopping the rain, and turning on reduced motion. Either one,
  caught mid-swell, left the whole city sitting under a raised light with no rain and no thunder
  in it, until something unrelated happened to reset it. Both exits now put the light down
- **Asking for less movement ends the shower** (CW-29, D-76) - the rain key has always refused to
  START rain while reduced motion is on. Rain already falling was left exactly where it stood,
  because turning the preference on stops the frames that move the drops rather than stopping the
  rain: the shower froze in mid-air as a field of static diagonal streaks, and the Rain button
  stayed in a toolbar where pressing it now only produced the refusal message. Turning reduced
  motion on now ends the shower the same way the key does - the drops go, the fog goes back to
  clear, the button leaves the toolbar, and it says so
- **The status line stopped spilling onto a second row in Denver** (D-71) - standing near the
  Embassy Suites by Hilton Denver Downtown Convention Center made the line long enough to wrap,
  which pushed the game view down by a row. Very long street and landmark names are now shortened
  with an ellipsis in the status line only; anything the game says out loud still uses the full
  name

- **Tour cards that admit when there is more to read** (UF-38, D-65) - on a phone the instruction
  card was cut off mid-sentence with nothing to say so. One step ended on "You can resize this drawer
  using the handle. With", and that was simply where the text stopped; there was no scrollbar, no
  fade, no arrow, nothing. The card is capped at 45% of the screen height, and a phone screen is not
  as tall as the emulator's - once the browser's address bar and the gesture bar are taken off a
  1080x2520 phone there are about 810 usable points, not 915. At 810 three steps of the Getting
  Started tour overflow that cap, by 47, 19 and 40 points. Nothing about that was visible. Now the
  card's text area fades out at the bottom and shows a small chevron whenever there is more below,
  and both disappear the moment you reach the end. The cue costs the text no room at all, is
  invisible to screen readers and cannot be tabbed to, and at high contrast it is drawn as a hard
  rule rather than a fade, because a soft gradient is exactly the wrong instrument there. The text
  area also keeps a floor now - enough for the step's heading and a line of its text - so it can
  never be squeezed away to a clipped headline the way the reported screenshots showed. And a step
  you scrolled through no longer hands its scroll position to the next step, which was arriving with
  its own title already scrolled off the top

- **"Close to continue" no longer prints across the Features Guide's title** (UF-38, D-66) - the
  hint was pinned to the left of the modal's X, which on a wide window puts it in empty space and on
  a phone puts it straight on top of the words "Features Guide". At phone widths it now takes its own
  line under the title, where it has room, and the close button keeps its pulse

- **The Clear Cache dialog is centred again, and its backdrop covers the screen** (UF-38, D-69) - a
  `max-width` meant for the dialog had been applied to the full-screen layer behind it, so on any
  window wider than 500 points the dialog sat against the left edge and the dark backdrop was a
  narrow strip beside it instead of dimming the page. Phones were never affected, which is why this
  went unseen. Measured at 800 and 1280 points wide, the backdrop now spans the window and the dialog
  sits in the middle

- **The tour card can be reached and heard while the Customizer is open** (UF-38, D-70) - on a phone
  the Customizer is a drawer that covers the screen, so it correctly tells a screen reader to ignore
  everything behind it. Since the tour card started staying on screen next to that drawer, "behind
  it" included the instructions. A blind user got no instructions at all on the drawer steps, which
  is most of the tour, and a keyboard user could not reach Next, Back, minimise or Close - measured
  at eighty consecutive Tab presses without once leaving the panel. While a tour is running, the
  drawer and the card stop competing to be the only thing on screen, and the drawer's keyboard trap
  now spans the card as well: one Shift+Tab from the top of the drawer reaches it. Everything is put
  back the moment the drawer closes, and the drawer is unchanged for anyone not on a tour

- **The Getting Started tour stopped arguing with you on a phone** (UF-37, D-62 and D-63) - three
  quarters of that tour lives in the Customizer panel, and on a phone that panel is a drawer covering
  the screen. Because a drawer that covers the screen has to say so for a screen reader, the tour read
  it as a dialog somebody had opened over the top of it and politely got out of the way - collapsing
  to a small yellow pill on every single one of those steps. So step 3 arrived with the drawer already
  open, a ring around a Close button nobody had been told about, and not one word of instruction on
  screen. Pressing the pill to get the instructions back closed the drawer, and pressing Next opened
  it again, and the instructions vanished again. On step 4 it was worse: the pill did nothing at all
  that you could see, because the drawer was still open and the tour minimised itself again in the
  same instant. Closing the drawer by hand did not work either, since the tour reopened it within half
  a second. Four things change. The tour now knows the Customizer is part of the app rather than a
  dialog you opened, so the instruction card stays on screen next to the open drawer instead of
  hiding - and it docks below the drawer's title so it never sits on the drawer's only Close button.
  Step 3 arrives with the drawer shut and the ring on the Params button, which is what its words tell
  you to press; open the drawer and the ring walks over to the Close button, so the one step teaches
  both halves. If you close the drawer while a step still needs it, it stays closed: the tour rings
  the button that opens it again and says "Open Params to continue." rather than dragging it back
  open. And Escape now takes one surface at a time - the first press closes the drawer, the second
  ends the tour - where before, once the drawer stopped counting as a dialog, a single press would
  have taken both. Minimising and restoring the card by hand works and stays worked. The same rules
  apply to the collapsing panel on a desktop, where the line reads "Expand Parameters to continue."

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
