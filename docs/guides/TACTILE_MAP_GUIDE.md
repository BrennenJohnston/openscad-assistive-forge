# Tactile Map Designer Guide

The Tactile Map Designer turns a line drawing of a place into a map that is read by touch and printed on an ordinary 3D printer: up to three raised levels, symbols at a size a finger can tell apart, a raised title, a north cue, and channels for braille label tape. It splits the map into plates that fit your printer's bed and names every plate so you know where it goes. I built it from the station maps I print for a transit agency, and the figures below are the ones those maps settled on, backed by the published guidelines named at the end.

It is for anyone who makes a map for a blind or low-vision reader: a station, a campus, a building floor, a park. You need a drawing of the place and a printer. You do not need to type a coordinate.

## What the tool makes

- A base plate, 0.4 mm thick by default, meant to be glued to a backing board; or a 1.2 mm plate that stands on its own.
- Three raised levels: the floor level for areas, walkways and edges; the symbol level above it for point symbols, routes, crossings and the words you draw; the top level for walls. Each level is one step above the one below, and the symbol level stands a symbol step, a little more, above the floor; the figures are under Heights and sizes.
- A raised title along the top edge in capitals at the ADA figures for raised characters; an arrow with an N in the top right corner, or a north line along the whole top edge, or neither.
- Channels for braille label tape, described under Label tape channels.
- Plates: the map cut into equal pieces that fit a print bed, one STL each, with a README and a picture of the layout, in one zip.

The sample it opens with is a stand-in station: a platform, a waiting area, stairs, landmarks, transit stops, a dotted route and two label channels, 480 x 360 mm, about two hand spans by one.

## Opening it

On the welcome screen choose the **Tactile Map Designer** card and press **Open Tactile Map Designer**, or open `?example=tactile-map` directly. The **Tactile map plates** section sits above the model's own controls (the map file, the print style, the heights, the title and north cue, the label channels).

## Three ways in

### A drawing you upload or trace

Choose your drawing for the **Map file**: an SVG, a DXF (converted on your device), or a photo saved as PNG or JPG, which the app traces into shapes. The drawing editor can crop a photo or a drawing first, through the Map file's own **Open the drawing editor** button.

1. **Drawing width (mm)** fills itself from the file when the file says how wide it is (a DXF in millimeters, an SVG with a width in mm, cm or inches); otherwise it starts at the map's width. Type the real width of the drawing, and the map is built at that scale. When you change it, the app says what one drawing unit is in millimeters.
2. Press **Edit drawing as a map**. The drawing editor opens with every shape of the drawing as a row, and each row has a **Class** menu. Every row starts at Ignore.
3. Set a class on each shape that belongs on the map. A row's shape lights up on the picture when its row is focused; Undo and Redo on the toolbar take a class change back and forward, and Ctrl+Z and Ctrl+Y do the same. On the picture each shape takes its level's color, the colors the charm customizer gives its layers: blue for the floor level, orange for the symbol level, yellow-green for the top level, each with a light edge. A shape with no class, or Off, is hatched with a dashed edge, and the legend under the picture names all four.
4. Press **Apply classes**. The editor closes, the app says how many features the plan now holds and how many shapes were ignored, the plates section rebuilds its summary, and the preview shows the map.

What a class does to a shape:

- A **line** class (Wall, Curb or edge, Walkway, Route, Crossing, Track) keeps the shape's centerline and draws it at the class's width and style. A wall drawn as a closed outline is one shape with an inner ring; set the inner ring to the wall's class or leave it at Ignore, and either way the line runs between the two edges. A shape wider than 6 mm at its middle is not a line anyone drew, so it stays an area and a warning names it. Dots drawn along a dotted line, each set to the same line class, are joined in order into one line.
- An **area** class keeps the shape's outline, and keeps open whatever is drawn inside it (a courtyard, a slot, letters cut into a plateau) when those inner shapes are set to the same class or left at Ignore. A shape of another class inside it is a feature of its own.
- A **point** class (Stairs, Elevator up, Elevator down, Entrance, Landmark, You are here, Transit stop) drops the drawn shape and puts the class's symbol at its center. The several strokes of one drawn symbol, within 10 mm of each other, become one point.
- **Text** keeps a drawn word's letters as drawn, counters open, and raises them one symbol step above the floor they stand on, the height my printed maps use and, with the defaults, the ADA minimum for raised characters.
- **Ignore** leaves the shape out. A key sheet beside the map, the digits of a scale bar, a border you do not want: set them to Ignore and they add nothing.

The map is as big as the shapes you keep, plus half the width of the widest line class among them, so a wall along the edge stays on the plate. A drawing's margins add nothing. If you want a margin, draw a border and give it a class.

Pressing **Edit drawing as a map** again reopens the editor on the same drawing with the classes you applied. Choosing another file for the Map file replaces the drawing.

### Your own map plan

Every map is a plan: a list of features in millimeters, each with a class and a kind (a line with its points, an area with its ring and any holes, a point with its center, a channel with its center and length), and the map's size. The plan the tool built is in the zip as `map_plan.json`, beside the plates, so what you made is yours to keep, read and reuse. The plan's shape is documented in the source file `src/js/tactile-map/plan.js`.

### An address

The **Map from an address** section stands above the plates section. It drafts a map of a street address from OpenStreetMap, for you to edit the same way as a drawing.

1. Type a street address, an intersection or the name of a place in **Address or place** and press **Search**. Nothing is sent until you press. Up to five places come back as a list; pick the one you meant. The search goes to OpenStreetMap's Nominatim service, one request a second at most, and the app does not offer suggestions as you type, because that service forbids it.
2. Set the **Map radius (m)**, 100 to 600 m, at 250 m to start: how far from the address the map reaches, so the map is twice that wide. At 250 m on a 480 mm plate set, one meter on the ground is about one millimeter on the map, and a 1.5 mm walkway line stands for 1.6 m of sidewalk. A smaller radius gives more millimeters to the meter and a lighter pull; 600 m downtown can be several megabytes.
3. Tick the **Landmarks to show** you want in the draft: Entrances and Transit stops start ticked; Crossings, Steps and stairs, Shops and Benches start off. Press **Get map data**. One request goes to the Overpass service for everything within the radius, and the status line says how many features came back: walkways, crossings, buildings and landmarks. The public server is shared and sometimes full; when it refuses, the app waits 30 seconds and asks once more, then 60, then tells you to try later or load a file instead.
4. Press **Make a draft map**. The data becomes a plan with north up and opens in the drawing editor's map purpose, one shape per feature. Everything starts off except the sidewalks within 30 m of the address, the crossings they end on, the landmarks you ticked and the **You are here** point in the middle: a draft is a list of what is there, and you choose what a reader needs. Switch a shape on by giving it a class; switch it off with the Class menu's last entry, **Off**. Buildings arrive as off areas and roads as off pairs of curb lines, because a block of raised buildings is a field a finger must cross; turn on the ones that help. Press **Apply classes** and the plates section rebuilds from what you kept; the editor says how many features are on and off.

**Walk this** is a tool in the editor's toolbar for the route: pick it (the key is W), then click the sidewalks in the order you walk them. Each one joins the route where one of its ends meets either end of the route, so the first two may be picked in either direction, and the status says how many segments are on the route and how long it is in meters. A segment that touches nothing on the route yet is refused, so pick the one between them first. **Clear route** puts every picked segment back. When you apply, the segments that meet become one Route line, the dotted line a finger follows.

**Mark steep sidewalks** reads heights along every sidewalk you kept and marks the runs steeper than the **Steep grade (%)** with chevrons pointing uphill, so a reader knows before the hill. The grade is 3 to 12 % and starts at 5 %, the grade where a walking surface counts as a ramp. The heights come from public terrain tiles at about 3 m per pixel, read every 10 m and smoothed over 30 m: a long hill shows; a short steep step, a curb ramp or a stair does not. Switching it off removes the chevrons.

**Load an OpenStreetMap file** is the other way in: an `.osm` export from openstreetmap.org (the Export button, a small box around your address) or a `.geojson` file, read on your device and never sent anywhere. It is for a busy server, for working offline, and for a map you want to build again later from the same data. With an address picked the file centers on it; without one, on the middle of the file.

#### A route map

Give the section a second place and it maps the walk between two places instead of the ground around one.

1. Pick the start in **Address or place** as above. Type the destination in **To (optional)**, press its **Search** and pick it under **Destinations found**. The radius is not used: the map covers both places and the walk between them.
2. Press **Get map data**. The request asks for a box around both places with at least 150 m to spare beyond them.
3. Press **Make a route map**. The app finds the shortest walk on the ways people walk, from a door of the first building to a door of the second (its main entrance when the data marks one). Where the data has no sidewalk the walk may follow a street, counted at three times its length so that a sidewalk wins whenever there is one. Steps are allowed and marked: they are often the shortest way, and a reader should know they are there.
4. The draft switches on what the walk needs:
   - the walk as one dotted Route line from door to door, so no short piece of path is lost;
   - the crossings and the flights of steps on it;
   - the two buildings, **You are here** at the start door and an **Entrance** at the destination door;
   - each path that meets the walk, as its first 15 m, so a finger feels every junction it passes;
   - the curbs of each street the walk crosses, for 25 m each side of the crossing;
   - the landmarks you ticked within 25 m of the walk, each set beside the route; of two that face each other across a street, one: the nearer, unless it has no room 3 mm clear of the route.

   Nothing that is on comes within 3 mm of the route, so a finger never takes a curb for the route. Everything else in the data is drawn too, switched off, one choice away in the editor.
5. The map is fitted to the walk and the two buildings, north up, with 30 m of ground around them, at the largest scale your map size allows, and the plate is cut to fit: a walk that runs north and south on a 480 x 360 mm setting keeps the height and narrows the plate. The status line says how long the walk is, how many crossings and flights of steps are on it, and the map's size.
6. The editor opens on the draft. Its shapes are named by their street or building, or by their class and the nearest named place ("Stairs near Husky Union Building"). Change what your reader needs and press **Apply classes**; **Edit drawing as a map** reopens it later with your classes.

The raised title stays empty for you to write: two full place names are usually longer than the plate, and a short title ("HUB TO GATES") reads faster. When no walk joins the two places in the data, the status line says so; try other places, or load an OpenStreetMap file of the area.

What leaves your device, and when, is under Privacy. The data is OpenStreetMap's, under the Open Database License, and the map carries the line "Map data from OpenStreetMap contributors, ODbL"; the terms are under Sources.

## The classes

| Class                      | Stands for                             | Level  | Width or symbol                                                  | Where it comes from                                                 |
| -------------------------- | -------------------------------------- | ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Wall                       | a wall or a building edge you follow   | top    | a solid line 2.0 mm wide                                         | the thick solid line of my printed station maps                     |
| Curb or edge               | a curb, a platform edge, any thin edge | floor  | a solid line 1.0 mm wide                                         | BANA 2022 line styles                                               |
| Walkway                    | a path a finger traces                 | floor  | a solid line 1.5 mm wide                                         | BANA 2022 8.6.7                                                     |
| Route                      | the way to walk                        | symbol | dots 1.5 mm across, 3 mm apart                                   | BANA 2022 dashed primary lines; the dotted route of my printed maps |
| Crossing                   | a street crossing                      | symbol | a line 1.5 mm wide with short cross-ticks, 6 mm long, 6 mm apart | BANA 2022 line styles                                               |
| Track                      | rails                                  | floor  | two lines 1.0 mm wide with a 1.5 mm gap                          | Jehoel 2006: a double line reads as two when the gap is over 1.3 mm |
| Steep sidewalk             | a sidewalk run steeper than your grade | symbol | a line 1.5 mm wide with a chevron every 10 mm, 6 mm across, pointing uphill | Ungar 2005: arrows are read by their point; OpenSidewalks: incline as rise over run |
| Area                       | a platform, a building, water          | floor  | a plain raised area                                              | BANA 2022 3.4.3.1                                                   |
| Stairs                     | a staircase                            | symbol | three bars, 10 mm                                                | Ungar 2005; BANA 2022                                               |
| Elevator up, Elevator down | an elevator, read as up or down        | symbol | a solid triangle, 10 mm, apex up or down                         | Ungar 2005; Gual 2012                                               |
| Entrance                   | a door or a gate                       | symbol | a half disc, 10 mm, flat side toward the way in                  | ISO 19028                                                           |
| Landmark                   | anything you name in the key           | symbol | a disc, 10 mm                                                    | BANA 2022 8.6.5; Jehoel 2009                                        |
| You are here               | the reader's place                     | symbol | a disc with a square hole, 10 mm                                 | BANA 2022 8.5.6; ISO 19028                                          |
| Transit stop               | a bus, train or tram stop              | symbol | a square with a notch, 9 mm                                      | BANA 2022 8.5.4                                                     |
| Text                       | a word you drew                        | symbol | the letters as drawn                                             | ADA 703.2                                                           |

The shapes, and how to load a set of your own, are on the [Tactile map symbols](TACTILE_MAP_SYMBOLS.md) page.

## Heights and sizes

Each of these is a control in the model, and the model refuses a value outside its range rather than printing a map that cannot be read.

| Control              | Default                                               | Range                                           | Where the figure comes from                                                                                                                              |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base thickness       | 0.4 mm for plates on a board; 1.2 mm when all printed | 0.3 to 3.0 mm; all printed keeps 1.2 mm or more | my printed maps; the thinnest wall this project prints reliably                                                                                          |
| Level step           | 0.6 mm                                                | 0.3 to 1.0 mm                                   | my printed maps; Jehoel 2006 reads a feature from 0.2 mm; Bris 2001 (quoted by Wabinski 2024) asks 0.5 mm between levels; ISO 19028 allows 0.3 to 1.5 mm |
| Symbol step          | 0.8 mm                                                | 0.5 to 1.5 mm                                   | my printed maps: symbols read best one step higher than lines                                                                                            |
| Levels used          | 3                                                     | 1 to 3                                          | three height changes at most on one map                                                                                                                  |
| Title height         | 16 mm, the capital I                                  | 16 to 50.8 mm                                   | ADA 703.2.5                                                                                                                                              |
| Title raise          | 0.8 mm                                                | 0.8 to 2.0 mm                                   | ADA 703.2.1                                                                                                                                              |
| Label tape width     | 12.7 mm (1/2 in)                                      | 9.5 or 12.7 mm                                  | the two widths of braille label tape                                                                                                                     |
| Label channel depth  | 0.3 mm                                                | 0.2 to 0.5 mm                                   | my printed maps: tape nearly flush                                                                                                                       |
| Map width and height | 480 x 360 mm                                          | 100 to 600 by 75 to 450 mm                      | two hand spans by one: Rowell and Ungar 2003; Olczyk 2014                                                                                                |
| Symbol size          | 10 mm                                                 | 6 to 15 mm                                      | ISO 19028 (10 mm); BANA 2022 3.4.3.11 (6 mm the smallest)                                                                                                |
| Gap between symbols  | 3 mm                                                  | a check, not a control                          | BANA 2022 8.5.3                                                                                                                                          |

The north cue starts as the arrow with an N because my printed maps carry one; BANA 8.5.8 prefers a line along the north edge, which many readers find easier to find, and the model offers it. The map starts on plates for a backing board because that is how I print: the board gives the stiffness a 0.4 mm plate lacks and the plates print fast and flat. All printed is for a map that must stand alone.

## Plates

Pick your printer's bed in the **Print bed** list and the map splits into the fewest equal plates that fit it, each with a 2 mm margin to the bed's edges. The list: Bambu Lab X1C, P1S or P1P (256 x 256 mm, the first), Bambu Lab A1 (256 x 256), Bambu Lab A1 mini (180 x 180), Prusa MK4S, MK4 or MK3S (250 x 210), Prusa MINI (180 x 180), Prusa XL (360 x 360), Creality Ender 3 family (220 x 220), Creality K1 Max (300 x 300), and a custom size from 100 to 600 mm. The summary line says how many plates and how big: "4 plates of 240 x 180 mm, A1 to B2." for the sample on the X1C. A bed that would cut the map into plates under 100 x 75 mm is refused in that line; choose a larger bed.

Plates are named by row letter and column number, A1 at the top left. The **Plate** radio buttons show one plate in the preview, or the whole map; a plate shows the title only when it is the top-left plate, and the north arrow only when it is the top-right one (a north line runs along the whole top row). The **Plate name style** menu decides how a plate carries its name:

- **Notches on the bottom edge** (the default): one to four 3 x 2 mm notches cut right through the plate at its bottom edge say the row (A is one notch), and dots after them say the column. A finger finds them from either side, and a glued map shows only small pits along the seams.
- **Raised letters in the margin**: a 10 mm strip below the map carries the name in 6 mm capitals, readable by touch and by eye before assembly. The strip sits between the rows unless you trim it after printing; it is the better choice if your readers handle loose plates.

**Render every plate and download** renders each plate in turn through the same model (a sentence counts them off; **Cancel** stops after the plate under way, and the plates finished so far still download) and offers one zip: an STL per plate (a 3MF when the output format says so), `map_plan.json`, a levels file per plate, `plate_grid.svg` (the map with the grid and the names), and `README.txt`, which repeats the bed, the plate size, the list to print, the levels measured from the underside and the tape width.

To assemble: print one of each plate, lay them out as the grid reads, row A at the top and column 1 at the left, and glue them edge to edge onto a backing board of the map's size. I use 4 mm corrugated plastic and spray adhesive; the plates butt against each other with no tabs.

## Label tape channels

A channel is a recess the width of your tape plus 0.4 mm and 0.3 mm deep, so a strip of braille label tape sits nearly flush with the surface. Set the tape width the model asks for, 9.5 or 12.7 mm, to the tape your labeler uses. The sample carries two channels; a plan places a channel by its center and length, horizontal or vertical. The builder warns when a channel comes within 3 mm of another feature.

## The warnings

The plates section lists the builder's warnings under the plate picker, each naming the feature so you can move it, resize it or switch it off:

| What it says                                                                                        | What to do                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| "{feature} is 2.4 mm wide; lines wider than 2.2 mm read as two lines."                              | Use 2.2 mm or a double line (Jehoel 2006).       |
| "{feature}'s symbol is 5 mm; symbols smaller than 6 mm are hard to recognize."                      | Use 6 mm or more.                                |
| "{feature} and {feature} are 1.5 mm apart, closer than the 3 mm minimum."                           | Move one or turn one off.                        |
| "The label channel {feature} is 2 mm from {feature}; keep 3 mm clear."                              | Move the channel or the feature.                 |
| "16 different symbols on this map. More than 15 is hard to remember."                               | Use fewer kinds of symbol.                       |
| "5 area textures. More than 4 read as noise."                                                       | Use plain areas.                                 |
| "The map is 700 mm wide; more than 600 mm is beyond two hand spans." (and the same for 450 mm tall) | Make the map smaller, or split it into two maps. |
| "This map uses 4 levels; more than 3 are hard to tell apart by touch."                              | Use three.                                       |
| "{shape} was traced as a line but is too wide to find its center; it was kept as an area."          | Set the shape to Area, or draw it as a line.     |

The sentences give the real numbers; the ones above are examples.

## Printing

- Layers 0.12 mm or finer for the symbol level, so a 0.8 mm step is several layers and its top is flat.
- A 0.4 mm nozzle; no line on the map is thinner than 1.0 mm.
- A matte filament; a glossy surface is harder to read by touch and by eye.
- A 0.4 mm base needs a clean, level first layer: a slow first layer, and a brim if the plate lifts.
- No supports: every face is flat or vertical.
- Print the plates one at a time if your bed is not perfectly level; a thin plate shows every ridge.

## What the tool does not check

- Whether the map is right for its reader. BANA 8.1 asks for an orientation and mobility specialist in the loop, and the editor is where that happens: the map is yours to read, revise and test with the people who will use it.
- Whether the drawing is current. The tool draws what you give it.
- Whether the scale you typed is the true width of the drawing.
- Mounting, finish and contrast.

## Keyboard and screen reader notes

- Every control in the plates section is a native control with a visible label; the section is a labeled region.
- The plates summary is a polite live region: a change of bed or of plate is said once. Rendering every plate is counted off the same way, and the zip's name is said when it is ready.
- In the drawing editor, each row's Class menu is a native menu named for its row, in the row's Tab order; the plan's size is said when Apply classes closes the editor.
- The warnings are a plain list under the plate picker.

## Privacy

Everything runs on your device: the drawing's conversion and tracing, the plan, the rendering and the zip. Nothing is uploaded.

A map from an address is the one part that talks to anyone, and only when you press:

- **Search** sends the words you typed to OpenStreetMap's Nominatim service (nominatim.openstreetmap.org), with the app's web address as the referer and nothing else: no account, no email, no location of yours.
- **Get map data** sends the picked place's coordinates and the radius, or for a route map the four edges of a box around both places, to the Overpass service (overpass-api.de) and receives the map data.
- **Mark steep sidewalks** fetches up to four terrain tiles from AWS Open Data (s3.amazonaws.com), each a 256 by 256 pixel picture of heights named by its tile number, which says what square kilometer the map is in and nothing more.

Each of those hosts sees your connection's address, as any web request does. A file you load through **Load an OpenStreetMap file** stays on your device. The drawing route and the plates never leave it.

## Sources

Read on 2026-10-26, except ADA 703, read on 2026-10-01, and the data sources, read on 2026-10-29.

The map data and the terrain heights:

- OpenStreetMap contributors, https://www.openstreetmap.org/copyright: the map data, under the Open Database License (ODbL).
- The Nominatim usage policy, https://operations.osmfoundation.org/policies/nominatim/: the terms the search keeps to.
- The Overpass API's public instances and their usage page, https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances: the terms the pull keeps to.
- The Mapzen terrain tiles on AWS Open Data, https://registry.opendata.aws/terrain-tiles/: Terrarium PNG tiles of heights, built from public elevation data under open terms listed on that page; the app reads zoom 15 at about 3 m per pixel. The incline figure and the rise-over-run definition follow the OpenSidewalks schema, https://sidewalks.washington.edu/opensidewalks/.

The research behind the figures:

- Braille Authority of North America, Guidelines and Standards for Tactile Graphics, 2022 edition (sections 3.4.3 on lines, areas and point symbols; 5.9 on keys; 8.1, 8.5 and 8.6 on maps), https://www.brailleauthority.org/
- Wabinski, Moscicka and Touya, "Guidelines for standardizing the design of tactile maps: a review of research and best practice", The Cartographic Journal, 2024, which carries the ISO 19028 figures (10 mm point symbols, 0.3 to 1.5 mm heights) and Bris 2001
- Jehoel, Ungar, McCallum and Rowell, "An evaluation of substrates for tactile maps and diagrams", British Journal of Visual Impairment, 2006 (features read from 0.2 mm; a double line needs a 1.3 mm gap; a single line over 2.2 mm reads as two)
- Jehoel, Ungar, McCallum and Rowell, "An evaluation of tactile symbol sizes", 2009 (5.0 to 6.4 mm identifies a symbol)
- Gual, Puyuelo and Lloveras, "Three-dimensional tactile symbols produced by 3D printing", 2012, and their 2014 follow-up (prisms and pyramids recognized best; 5 mm the smallest)
- McCallum, Ungar and Jehoel, "An evaluation of tactile directional symbols", British Journal of Visual Impairment 24(2), 2006 (Ungar 2005 in the class table)
- Holloway, Marriott and Butler, "Accessible maps for the blind: comparing 3D printed models with tactile graphics", CHI 2018
- Rowell and Ungar, "The world of touch: an international survey of tactile maps", 2003, and Olczyk, 2014 (a map within two hand spans)
- U.S. Access Board, [2010 ADA Standards for Accessible Design, section 703](https://www.access-board.gov/ada/#ada-703), the raised title's figures
