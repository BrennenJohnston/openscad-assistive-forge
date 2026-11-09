# Tactile Map Designer Guide

The Tactile Map Designer makes a map that is read by touch and printed on an ordinary 3D printer: up to three raised levels, symbols at a size a finger can tell apart, a raised title, a north cue, and channels for braille label tape. It starts from the ground around an address, from the walk between two places, or from a drawing of your own, and splits the map into plates that fit your printer's bed, each named so you know where it goes. I built it from the station maps I print for a transit agency, and the figures below are the ones those maps settled on, backed by the published guidelines named at the end.

It is for anyone who makes a map for a blind or low-vision reader: a station, a campus, a building floor, a park, a street corner, a walk to a bus stop. You need a printer, and an address or a drawing. You do not need to type a coordinate.

## What the tool makes

- A base plate, 0.4 mm thick by default, meant to be glued to a backing board; or a 1.2 mm plate that stands on its own.
- Three raised levels: the floor level for areas, walkways and edges; the symbol level above it for point symbols, routes, crossings and the words you draw; the top level for walls. Each level is one step above the one below, and the symbol level stands a symbol step, a little more, above the floor; the figures are under Heights and sizes.
- A raised title along the top edge in capitals at the ADA figures for raised characters; an arrow with an N in the top right corner, or a north line along the whole top edge, or neither.
- Channels for braille label tape, described under Label tape channels.
- Plates: the map cut into equal pieces that fit a print bed, one STL each, with a README and a picture of the layout, in one zip.

The sample it opens with is a stand-in station: a platform, a waiting area, stairs, landmarks, transit stops, a dotted route and two label channels, 480 x 360 mm, about two hand spans by one.

## Opening it

On the welcome screen choose the **Tactile Map Designer** card and press **Open Tactile Map Designer**, or open `?example=tactile-map` directly. The card's **Map type** menu, or a link's `type` (`place`, `route` or `drawing`), says which map you want; opened without one, the panel above the model's own controls asks. Each map type walks you through five numbered steps, one at a time: **Next** goes on, waiting with its reason beside it until the step has what it needs, and **Back** goes back. The heading of each step says which it is and how many there are. The last step, **Check and print**, is the same for every type and is described under [Plates](#plates).

## A place map

Choose **A place map** to map the ground around one address: a block, a campus, the streets around a stop. Its steps are Where, How much ground, What to show, Make the map, and Check and print.

1. **Where.** Type a street address, an intersection or the name of a place in **Address or place** and press **Search**. Nothing is sent until you press. Up to five places come back as a list; pick the one you meant. The search goes to OpenStreetMap's Nominatim service, one request a second at most, and the app does not offer suggestions as you type, because that service forbids it. The place you pick is the map's destination: a cone marks it (Touch Mapper's address marker, 4.9 mm tall, the tallest thing on the plate), and the key names it first with the words you typed, up to the first comma. You are here is yours to place: the draft puts none down, because only you know where the reader will stand.
2. **How much ground.** Choose the **Map scale**, named for the ground it fits: **A building and its doors** (1:500), **A block** (1:1000, where it starts), **A few blocks** (1:2000), **A neighborhood** (1:4000), or **Custom**, any ratio from 1:200 to 1:10000, which draws by the rules of the named scale nearest its ratio. **Plate orientation** turns the map: **Landscape**, where it starts, lies the map's width across; **Portrait** stands it upright at the same scale, less ground across and more up and down, for a street that runs north and south. Under each scale, a sentence says how much ground fits across the plate, what a 10 mm symbol stands for, and what draws:
   - near a building, every sidewalk, curb ramp and raised curb, and a crossing without markings dashed. A crossing counts as painted when its data names any pattern (zebra, ladder, lines) and as unpainted when it names none. A curb ramp or raised curb starts on where it stands on a sidewalk or crossing that starts on and its symbol has 3 mm of room; the others wait in the list, off;
   - at a block, the sidewalks and crossings;
   - over a few blocks, a street whose curbs would fall 3 mm apart or closer draws as one line, and entrances start off;
   - over a neighborhood the streets are the map, one line each, and crossings, side paths and landmarks leave.
3. **What to show.** Under **How much to show**, choose a level; the sentence under each says what it shows. **The way and its doors** is the sidewalks and crossings near the address, its door and the steps; **Named places**, where a map starts, adds the named places and transit stops the scale has room for and the buildings along the way; **Every building** draws every sidewalk, crossing, building and entrance; **Everything in the data** turns everything on, for you to turn off what a reader does not need. Under **Change a group** you can change one group at a time: Sidewalks, Crossings, Entrances, Buildings, Named places and points, Transit stops, Benches, bins and racks (street furniture, a class of their own, because a traveler does not steer by them), and Curb ramps and raised curbs. The level's name then says "(changed)". Once the map data is here, a line under the choices says how many features are on and how many different symbols they use. Past 10 symbols it says they are hard to remember; a choice that would need more than 15 is refused and put back, and the sentence says what to lower first. Under **Symbol set** choose the shapes the whole map draws with: the ten basic shapes at 10 mm, the University of Oregon set at its published 13 mm with its street, sidewalk and railroad lines, or a file of your own (**Your own set**, then **Load a symbol library**); the status says which set is in use, and the key and the README follow it. The sets are described in [the symbols page](TACTILE_MAP_SYMBOLS.md). [Mark steep sidewalks](#steep-sidewalks) is here too.
4. **Make the map.** One press gets the [map data](#where-the-map-data-comes-from) for the ground the scale covers, makes the draft and opens it [in the editor](#the-draft-in-the-editor). The draft holds every feature in the data; the level and groups from step 3 decide which start on. The scale still decides what has room: a symbol the scale leaves out stays off, and so do the buildings over a few blocks or a neighborhood. Near the address means within 30 m; its door is the entrance nearest it within 30 m, on at every level; the **You are here** point in the middle is always on. A draft is a list of what is there, and you choose what a reader needs. The editor works with 1,000 shapes at a time, so a draft of a large piece of ground keeps every feature that is on and the others nearest the address, and the status line says how many it left out. A second press drafts again from the same data; a new place, scale or plate size gets new data first.
5. **Check and print.**

## A route map

Choose **A route map** to map the walk between two places instead of the ground around one. Its steps are From and To, How you travel, What to show, Make the map, and Check and print.

1. **From and To.** Pick the start in **From** as a place map picks its address. Type the destination in **To**, press its **Search** and pick it under **Destinations found**. There is no scale to choose: the map covers both places and the walk between them.
2. **How you travel.** Under **On foot, or by bus and train?**, choose how the trip goes; **On foot** is where it starts. Under **Steps on the way**, choose **Allowed, and marked on the map**, where it starts, or **Avoided where another way exists**. Steps are often the shortest way, and a reader should know they are there.

   By bus and train, set **Leave at**, press **Find journeys**, and pick one of up to three journeys from Transitous, the open journey planner, each said in words, for example "22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony." Then choose **Which walk to map**: the walk to the first stop, or the walk from the last stop. Each is a map of its own, drawn the way a walk is, with the stop as a Transit stop named with its line; make one, then come back for the other. The ride between the stops is not drawn; the journey's words follow the map's ready sentence.
3. **What to show.** Choose how much to show, as a place map does: **The route and its crossings**, **Named places along it** (where a map starts), **Every building along it**, or **Everything**. A route decides its own sidewalks, crossings and doors, so those groups are not offered. [Mark steep sidewalks](#steep-sidewalks) is here too.
4. **Make the map.** One press gets the [map data](#where-the-map-data-comes-from) for a box around both places with at least 150 m to spare, finds the walk and opens the draft [in the editor](#the-draft-in-the-editor). The walk is the shortest one on the ways people walk, from a door of the first building to a door of the second (its main entrance when the data marks one). Where the data has no sidewalk the walk may follow a street, counted at three times its length so that a sidewalk wins whenever there is one. The draft switches on what the walk needs:
   - the walk as one dotted Route line from door to door, so no short piece of path is lost;
   - the crossings and the flights of steps on it;
   - the two buildings, **You are here** at the start door and an **Entrance** at the destination door;
   - each path that meets the walk, as its first 15 m, so a finger feels every junction it passes;
   - the curbs of each street the walk crosses, for 25 m each side of the crossing;
   - the named places, transit stops and street furniture the level shows within 25 m of the walk, each set beside the route; of two that face each other across a street, one: the nearer, unless it has no room 3 mm clear of the route;
   - the buildings the level shows: those within 10 m of the walk, the named ones, or all.

   Nothing that is on comes within 3 mm of the route, so a finger never takes a curb for the route. Everything else in the data is drawn too, switched off, one choice away in the editor. The map is fitted to the walk and the two buildings, north up, with 30 m of ground around them, at the largest scale your map size allows, and the plate is cut to fit: a walk that runs north and south on a 480 x 360 mm setting keeps the height and narrows the plate. The status line says how long the walk is, how many crossings and flights of steps are on it, and the map's size; when no walk joins the two places in the data, it says so: try other places, or use a file of the area instead.
5. **Check and print.**

The raised title stays empty for you to write: two full place names wrap onto several lines of [the title band](#plates) and make it tall, and a short title ("HUB TO GATES") reads faster.

## A map from your drawing

Choose **A map from your drawing** for a floor plan, a station drawing, a DXF or a traced photo. Its steps:

1. **Choose the drawing.** The model's **Map file** control stands in this step. Choose an SVG, a DXF (converted on your device), or a photo saved as PNG or JPG, which the app traces into shapes. Until you choose one, the map uses the sample station. A photo can be cropped before it is traced: **Crop first** stands beside **Start conversion**. Until its shapes are classed, the preview shows the drawing raised whole on the floor level, so you see what you chose.
2. **The drawing's real width.** **Drawing width (mm)** fills itself from the file when the file says how wide it is (a DXF in millimeters, an SVG with a width in mm, cm or inches); otherwise it starts at the map's width. Type the real width of the drawing, and the map is built at that scale. When you change it, the app says what one drawing unit is in millimeters.
3. **Class the shapes.** Press **Edit drawing as a map**. The [editor](#the-draft-in-the-editor) opens with every shape of the drawing as a row, each starting at Ignore. Set a class on each shape that belongs on the map.
4. **Apply classes.** Press **Apply classes** in the editor. The editor closes, the app says how many features the plan now holds and how many shapes were ignored, the plates rebuild their summary, and the preview shows the map.
5. **Check and print.**

What a class does to a drawn shape:

- A **line** class (Wall, Curb or edge, Walkway, Route, Crossing, Track) keeps the shape's centerline and draws it at the class's width and style. A wall drawn as a closed outline is one shape with an inner ring; set the inner ring to the wall's class or leave it at Ignore, and either way the line runs between the two edges. A shape wider than 6 mm at its middle is not a line anyone drew, so it stays an area and a warning names it. Dots drawn along a dotted line, each set to the same line class, are joined in order into one line.
- An **area** class keeps the shape's outline, and keeps open whatever is drawn inside it (a courtyard, a slot, letters cut into a plateau) when those inner shapes are set to the same class or left at Ignore. A shape of another class inside it is a feature of its own.
- A **point** class (Stairs, Elevator up, Elevator down, Entrance, Landmark, You are here, Transit stop) drops the drawn shape and puts the class's symbol at its center. The several strokes of one drawn symbol, within 10 mm of each other, become one point.
- **Text** keeps a drawn word's letters as drawn, counters open, and raises them one symbol step above the floor they stand on, the height my printed maps use and, with the defaults, the ADA minimum for raised characters.
- **Ignore** leaves the shape out. A key sheet beside the map, the digits of a scale bar, a border you do not want: set them to Ignore and they add nothing.

The map is as big as the shapes you keep, plus half the width of the widest line class among them, so a wall along the edge stays on the plate. A drawing's margins add nothing. If you want a margin, draw a border and give it a class. Pressing **Edit drawing as a map** again reopens the editor on the same drawing with the classes you applied; choosing another file for the Map file replaces the drawing.

## Where the map data comes from

A place map and a route map are drafted from OpenStreetMap. **Make the map** reads OpenStreetMap US's map tiles over the ground, each about 800 m across, one to nine of them, usually in a second or two, and the status line says how many features came back: walkways, crossings, buildings and other points. The tiles are made ahead of time from OpenStreetMap and carry the tags a draft is made from, so the draft is the same either way. When the tiles do not answer within 20 seconds or refuse, the status line says so and the app asks an Overpass server instead: OpenStreetMap's main server first, then VK Maps' server, which can take half a minute. Those servers are shared and often full; when neither answers, the app waits 30 seconds and asks both again, then 60, then tells you to try later or use a file instead.

**Use a file instead**, beside **Make the map**, is the other way in: an `.osm` export from openstreetmap.org (the Export button, a small box around your address) or a `.geojson` file, read on your device and never sent anywhere. It is for a busy server, for working offline, and for a map you want to build again later from the same data. With an address picked the file centers on it; without one, on the middle of the file.

The data is OpenStreetMap's, under the Open Database License. The panel shows the line "Map data from OpenStreetMap contributors, ODbL", and the README in the zip carries it with the plates, with Transitous's credit beside it for a trip by bus and train; the terms are under Sources.

## The draft in the editor

A draft opens in the drawing editor's map purpose, one shape per feature, each named by its street or building, or by its class and the nearest named place ("Stairs near Husky Union Building"). A point says what it is first, read from the map data: "Restaurant: Plaza Cafe", "Bus stop 29405: NE Pacific St & Montlake Blvd NE" with the stop's number, and an unnamed one what it is near the nearest named place, "Bench near Northeast San Juan Road". Where the name says it already, the name stands alone: "Health Sciences Library". Where the data maps one stop twice, as a platform where people wait and a stop position where the bus halts, the platform starts on and the stop position off. The rows list what is on the map first, then what is off, with the curbs last in each part, so the first rows are the map you have. The editor measures the shapes at the map's own width, 480 mm for the usual plate, so it marks only what is really too thin to print, and none of a draft's rows is marked too small to trace, since a draft is drawn from its data, not traced. Each row has a **Class** menu: switch a shape on by giving it a class, and off with the menu's last entry, **Off**. Buildings arrive as off areas and roads as off pairs of curb lines, because a block of raised buildings is a field a finger must cross; turn on the ones that help. A row's shape lights up on the picture when its row is focused; Undo and Redo on the toolbar take a class change back and forward, and Ctrl+Z and Ctrl+Y do the same. On the picture each shape takes its level's color, the colors the charm customizer gives its layers: blue for the floor level, orange for the symbol level, yellow-green for the top level, each with a light edge. A shape with no class, or Off, is hatched with a dashed edge, and the legend under the picture names all four. Press **Apply classes** and the plates rebuild from what you kept; the editor says how many features are on and off. **Edit drawing as a map** reopens it later with your classes.

Above the list, **Turn a whole class on or off** has one button for each class in the draft, with how many shapes have it, such as "Area (41)". One press turns every shape of the class on, or, when all are on already, off; one Undo takes the whole press back. A button reads as pressed when all its shapes are on. **Show** lists every shape, or only the shapes that are on; a shape you switch off in its row stays in the list until you choose again, so the row you are on never disappears.

The picture moves under your hand in every tool: drag on empty ground with the mouse or a finger and the map follows; **Shift** with an arrow key moves it a tenth of the view, and in the **Hand** tool the arrow keys alone do; the four pan buttons beside **Fit**, **+** and **−** do the same by touch. The arrow keys alone, in any other tool, still walk from shape to shape.

The two marks move. The destination cone stands where the address search put it, and **You are here** is yours to place: a draft carries it off, at the middle, until you put it where the reader stands. Press **Place You are here** and it comes on at the middle of the view; then drag either mark with the mouse or a finger, or walk to it with the arrow keys and press Space to pick it up, move it with the arrow keys (1 mm a press, 10 mm with Shift), and press Space to put it down; Escape puts it back. The status says where a mark stands in millimeters from the map's top left corner, and one Undo takes a whole move back. A mark you drag comes on if it was off.

**Walk this** is a tool in the editor's toolbar for drawing a route yourself: pick it (the key is W), then click the sidewalks in the order you walk them. Each one joins the route where one of its ends meets either end of the route, so the first two may be picked in either direction, and the status says how many segments are on the route and how long it is in meters. A segment that touches nothing on the route yet is refused, so pick the one between them first. **Clear route** puts every picked segment back. When you apply, the segments that meet become one Route line, the dotted line a finger follows.

## Steep sidewalks

**Mark steep sidewalks**, in a place or route map's What to show, marks the sidewalks you kept that are steeper than the **Steep grade (%)** with chevrons pointing uphill, so a reader knows before the hill. The grade is 3 to 12 % and starts at 5 %, the grade where a walking surface counts as a ramp. For a feel of the numbers, AccessMap's: 5 % is a gentle slope, 8 % is near the most a ramp may be, and 15 % is a steep hill. Where the map data gives a sidewalk's incline as a number, such as 8 % or -6 %, that number is used: OpenStreetMap writes the steepest part of a way there, so the whole sidewalk gets chevrons when it is over the grade. The OSM US tiles leave that tag out, so a number is used only when the data came from an Overpass server or a file. Every other sidewalk is read from public terrain tiles at about 3 m per pixel, every 10 m and smoothed over 30 m: a long hill shows; a short steep step, a curb ramp or a stair does not. Switching it off removes the chevrons.

## The map plan

Every map is a plan: a list of features in millimeters, each with a class and a kind (a line with its points, an area with its ring and any holes, a point with its center, a channel with its center and length), and the map's size. The plan the tool built is in the zip as `map_plan.json`, beside the plates, so what you made is yours to keep, read and reuse. The plan's shape is documented in the source file `src/js/tactile-map/plan.js`.

## The classes

| Class                      | Stands for                             | Level  | Width or symbol                                                  | Where it comes from                                                 |
| -------------------------- | -------------------------------------- | ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Wall                       | a wall or a building edge you follow   | top    | a solid line 2.0 mm wide                                         | the thick solid line of my printed station maps                     |
| Curb or edge               | a curb, a platform edge, any thin edge | floor  | a solid line 1.0 mm wide                                         | BANA 2022 line styles                                               |
| Walkway                    | a path a finger traces                 | floor  | a solid line 1.5 mm wide                                         | BANA 2022 8.6.7                                                     |
| Route                      | the way to walk                        | symbol | dots 1.5 mm across, 3 mm apart                                   | BANA 2022 dashed primary lines; the dotted route of my printed maps |
| Crossing                   | a street crossing                      | symbol | a line 1.5 mm wide with short cross-ticks, 6 mm long, 6 mm apart; near a building, dashed where it has no markings | BANA 2022 line styles                                               |
| Track                      | rails                                  | floor  | two lines 1.0 mm wide with a 1.5 mm gap                          | Jehoel 2006: a double line reads as two when the gap is over 1.3 mm |
| Steep sidewalk             | a sidewalk run steeper than your grade | symbol | a line 1.5 mm wide with a chevron every 10 mm, 6 mm across, pointing uphill | Ungar 2005: arrows are read by their point; OpenSidewalks: incline as rise over run |
| Traffic island             | the crossing's part on an island       | symbol | a plain line 1.5 mm wide, so the ticks pause there               | OpenSidewalks: the island is part of the crossing                   |
| Area                       | a platform, a building, water          | floor  | a plain raised area                                              | BANA 2022 3.4.3.1                                                   |
| Stairs                     | a staircase                            | symbol | a zigzag, 10 mm | Ungar 2005; BANA 2022                                               |
| Elevator up, Elevator down | an elevator, read as up or down        | symbol | an outlined triangle, 10 mm, point up or down | Ungar 2005; Gual 2012                                               |
| Entrance                   | a door or a gate                       | symbol | a door frame, 10 mm, open toward the way in | ISO 19028                                                           |
| Street furniture           | a bench, a bin, a bike rack, a mailbox | symbol | two dots, 10 mm | Holloway and others 2019: not a place to steer by                   |
| Landmark                   | a named place: a cafe, a clinic, a garage | symbol | a solid diamond, 10 mm | BANA 2022 8.6.5; Jehoel 2009                                        |
| Destination                | the address you typed, or a walk's end | symbol | a cone 4.9 mm tall and 4.9 mm across, flat at the top, standing above everything else | Touch Mapper's address marker (skarkkai/touch-mapper, AGPL-3.0)     |
| You are here               | the reader's place, placed by you      | symbol | a disc, 10 mm, with a 4 mm center dot one symbol step higher    | BANA 2022 8.5.6; ISO 19028 6.5.1                                    |
| Transit stop               | a bus, train or tram stop              | symbol | an outlined square with a T, 10 mm | BANA 2022 8.5.4                                                     |
| Curb ramp                  | a lowered or flush curb, no edge       | symbol | three rising bars, 10 mm | OpenSidewalks curbs; Jehoel 2009                                    |
| Raised curb                | a curb a wheel cannot take             | symbol | a comb, 10 mm | OpenSidewalks curbs; Jehoel 2009                                    |
| Text                       | a word you drew                        | symbol | the letters as drawn                                             | ADA 703.2                                                           |

The shapes, and how to load a set of your own, are on the [Tactile map symbols](TACTILE_MAP_SYMBOLS.md) page.

## Heights and sizes

Each of these is a control in the model, and the model refuses a value outside its range rather than printing a map that cannot be read.

| Control              | Default                                               | Range                                           | Where the figure comes from                                                                                                                              |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base thickness       | 0.4 mm for plates on a board; 1.2 mm when all printed | 0.3 to 3.0 mm; all printed keeps 1.2 mm or more | my printed maps; the thinnest wall this project prints reliably                                                                                          |
| Level step           | 0.6 mm                                                | 0.3 to 1.0 mm                                   | my printed maps; Jehoel 2006 reads a feature from 0.2 mm; Bris 2001 (quoted by Wabinski 2024) asks 0.5 mm between levels; ISO 19028 allows 0.3 to 1.5 mm |
| Symbol step          | 0.8 mm                                                | 0.5 to 1.5 mm                                   | my printed maps: symbols read best one step higher than lines; You are here's center dot stands one more symbol step up, so it is the highest mark on the map (ISO 19028 6.5.1) |
| Levels used          | 3                                                     | 1 to 3                                          | three height changes at most on one map                                                                                                                  |
| Title height         | 16 mm, the capital I                                  | 16 to 50.8 mm                                   | ADA 703.2.5                                                                                                                                              |
| Title raise          | 0.8 mm                                                | 0.8 to 2.0 mm                                   | ADA 703.2.1                                                                                                                                              |
| Label tape width     | 12.7 mm (1/2 in)                                      | 9.5 or 12.7 mm                                  | the two widths of braille label tape                                                                                                                     |
| Label channel depth  | 0.3 mm                                                | 0.2 to 0.5 mm                                   | my printed maps: tape nearly flush                                                                                                                       |
| Map width and height | 480 x 360 mm                                          | 100 to 600 by 75 to 450 mm                      | two hand spans by one: Rowell and Ungar 2003; Olczyk 2014. The map's face; the plate is the sheet around it, see [Plates](#plates)                       |
| Margin               | 10 mm                                                 | 10 to 40 mm                                     | a clear band around the map on every side: Gardiner and Perkins 2003; BANA 2022 keeps raised text clear of the map's edge                                |
| Title band           | one 16 mm line: 41 mm                                 | follows the title's lines, whole millimeters    | each line at 135 % of the capital height, 9.5 mm (3/8 in) clear above and below, rounded up to the millimeter: ADA 703.2.7 and 703.3.2; BANA 2022 puts the title in the upper part of the map |
| Symbol size          | 10 mm                                                 | 6 to 15 mm                                      | ISO 19028 (10 mm); BANA 2022 3.4.3.11 (6 mm the smallest)                                                                                                |
| Destination cone     | 4.9 mm tall from the plate's underside, 4.9 mm across | fixed                                           | Touch Mapper's address marker (AGPL-3.0), the form other tactile map makers know: a 16-sided cone with its top cut flat at an eighth of the radius so it prints; it rises through whatever stands at its foot, so it is the tallest thing on the map |
| Wedge face angle     | 75 degrees                                            | 45 to 90 degrees                                | my embosser's assembly map; 75 degrees and upright read faster than flat (Puerta and others 2024)                                                        |
| Wedge foot           | 2 mm                                                  | 2 to 12 mm                                      | the sloped face below the braille, which lifts the cells off the plate; a larger foot makes a taller wedge                                               |
| Numeral raise        | 1.0 mm                                                | 0.8 to 2.0 mm                                   | ADA 703.2.1 at the least; 10 mm bold digits on a thing, 16 mm in the margin and on the key                                                               |
| Lead line            | 1.2 mm wide, one level step above the top level       | fixed                                           | its own level, so a finger never takes it for a wall or a route                                                                                          |
| Gap between symbols  | 3 mm                                                  | a check, not a control                          | BANA 2022 8.5.3                                                                                                                                          |

The north cue starts as the arrow with an N because my printed maps carry one; BANA 8.5.8 prefers a line along the north edge, which many readers find easier to find, and the model offers it. The map starts on plates for a backing board because that is how I print: the board gives the stiffness a 0.4 mm plate lacks and the plates print fast and flat. All printed is for a map that must stand alone.

Nothing stands on the cue. Lines and areas stop 9.525 mm short of it, the clearance raised letters keep, and a symbol in its way moves out by the shortest path, so the arrow has nothing around it but itself. A symbol on the destination or on You are here moves off too, keeping the map's 3 mm. Step 5's warnings say how many moved and how far.

## Plates

**Check and print** holds the print bed, the sheet, the plates, the warnings and the render button.

What prints is the sheet: the map's face inside a blank band, with the raised title on a band of its own above the face. **Margin (mm)** sets the blank band, 10 mm where it starts and up to 40, the same on every side: it is where the title and the labels stand clear of the shapes, and the clear edge a finger finds the map by (Gardiner and Perkins 2003). **Title placement** says where the raised title stands: **Above the map, on its own band**, where it starts, wraps the title in capitals to the map's width at the title height and gives each line 135 % of that height, with 9.5 mm clear above and below the lines, as the Braille Sign spaces raised letters (ADA 703); **Inside the map's top edge** draws the title in the face as the model always did, over whatever stands there; **No raised title** leaves it off. A 16 mm title of one line adds 41 mm to the sheet (the band is rounded up to whole millimeters, as the model's sizes are), so the sample's 480 x 360 mm face in its 10 mm band is a 500 x 380 mm sheet without a title, and 500 x 421 mm with one.

**Trim the empty edges**, above Print bed, cuts the face down to the box around what prints (the shapes, the cone, the labels and the raised letters), rounded out to whole millimeters and never under 100 x 75 mm, and the band then goes around that box; a place map starts trimmed, because its face is the whole ground step 2 chose and the drawn ground is often a part of it, a drawing starts untrimmed, and a route map has no switch, its plate fitted to its walk already. Turning a shape on or off re-trims at the next change; the summary says the plates that result, the editor draws the trimmed sheet as a dashed frame over the draft, and the README says the plates are trimmed to the shapes with the margin. At 3600 Ferry Pl NE at 1:1000 the trim turns four 250 x 190 mm plates into two of 189 x 240 mm.

Pick your printer's bed in the **Print bed** list and the sheet splits into the fewest equal plates that fit it, each with a 2 mm margin to the bed's edges. The list: Bambu Lab X1C, P1S or P1P (256 x 256 mm, the first), Bambu Lab A1 (256 x 256), Bambu Lab A1 mini (180 x 180), Prusa MK4S, MK4 or MK3S (250 x 210), Prusa MINI (180 x 180), Prusa XL (360 x 360), Creality Ender 3 family (220 x 220), Creality K1 Max (300 x 300), and a custom size from 100 to 600 mm. The summary line says how many plates and how big: "4 plates of 250 x 190 mm, A1 to B2." for the sample on the X1C. A bed that would cut the sheet into plates under 100 x 75 mm is refused in that line; choose a larger bed. The title band rides in the top row of plates when the rows stay as the map alone would cut them; when it would force one more row of short plates, the map keeps its rows and the band prints on plates of its own above row A, one per column, named Title 1, Title 2 and on, each at least 75 mm tall; the summary says so, and the README and the grid picture show where they go.

Plates are named by row letter and column number, A1 at the top left. The **Plate** radio buttons show one plate in the preview, or the whole sheet. A title on its band falls to the plates that hold its lines, a line across a seam going on at the next plate, as the map's shapes do; a title inside the map shows only on the top-left plate. The north arrow shows only on the top-right plate (a north line runs along the whole top row). The **Plate name style** menu decides how a plate carries its name:

- **Notches on the bottom edge** (the default): one to four 3 x 2 mm notches cut right through the plate at its bottom edge say the row (A is one notch), and dots after them say the column. A finger finds them from either side, and a glued map shows only small pits along the seams.
- **Raised letters in the margin**: a 10 mm strip below the map carries the name in 6 mm capitals, readable by touch and by eye before assembly. The strip sits between the rows unless you trim it after printing; it is the better choice if your readers handle loose plates.

**Render every plate and download** renders each plate in turn through the same model (a sentence counts them off; **Cancel** stops after the plate under way, and the plates finished so far still download) and offers one zip: an STL per plate (a 3MF when the output format says so), `map_plan.json`, a levels file per plate, `plate_grid.svg` (the map with the grid and the names), and `README.txt`. The README says what the map is (a place map with its place and scale, a route map with its walk, or a map from a drawing), then the bed, the plate size, the list to print, the levels measured from the underside and the tape width, then the data's credits.

To assemble: print one of each plate, lay them out as the grid reads, the title plates above row A when there are any, row A at the top and column 1 at the left, and glue them edge to edge onto a backing board of the sheet's size. I use 4 mm corrugated plastic and spray adhesive; the plates butt against each other with no tabs.

## The map paper

The preview lays a flat paper under the plate, as a sheet under a print: the same shapes in the editor's level colors, every named thing's name printed at it, each label channel with the text its tape will carry, the title where the raised one stands, and the plate's name. It is the print layer a sighted helper reads beside a touch reader (Gardiner and Perkins 2003; BANA 2022 8.5.1), and the way to check a map before printing it: a blank-looking plate of grooves reads as the map it is. The plate covers the paper; the View menu's **Show Model** hides the plate so the paper reads, and brings it back. **Show the map paper** in step 5 switches the paper itself. It follows the plate shown, the whole map, a plate or a key plate; its opacity and position are the reference overlay's own controls. It is never printed: the model takes the levels file, not the paper.

## The PDF

**Download the PDF** in step 5 gives the same paper as pages to print, and the zip carries it as `map_print.pdf`: the first page is the whole map with its plates outlined and named; then one page per plate at full size, so a page laid under a printed plate shows where every label channel goes, each drawn as a box with the text its tape will carry; then the labels as a list, each with its cells and its channel's length; then the key. A plate too big for the paper is drawn smaller and the page says by how much. **Paper** chooses Letter or A4, sideways; a 250 x 190 mm plate fits both at full size, A4 just. The pages use the standard PDF fonts, which spell Latin letters; a name they cannot spell is printed with question marks and listed in the README.

## The key

Every map gets a key, made from what the map draws, to read before the map (BANA 2022 8.5.9). It lists each symbol, line and area the map uses, You are here first and the rest in order of importance (ISO 19028 6.4.2), each shown at the size and height it prints; shapes that print alike share one entry, so a finger never meets two names for one shape. Then come the [numbered places](#numbers-on-the-map), in number order: "1 Building: Center on Human Development and Disability South".

The key prints on its own plates, the size of the map's plates: a sample of each symbol, line or area at the left and, beside it, a channel for its name in braille on label tape, as the map's own labels are; a 1 mm raised line frames each plate. A key too long for one plate continues on the next, Key 1, Key 2 and on. **Check and print** lists the key's plates after the map's, the summary says how many it takes, **Render every plate and download** adds them to the zip, and the README carries the key as text with each plate's tape texts, top to bottom, to write with your labeler.

**Key words** in step 5 chooses what a row carries beside its sample. *Braille only*, the start, is the tape channel alone, the words in the README: about seven strips of tape to a 250 x 190 mm plate. *Print and braille* raises each name in capitals above its channel, as a sign does, for readers who use both; *Print only* raises the names and cuts no channel. The raised words follow the Braille Sign's rules for letters (ADA 703.2): 16 mm capitals by default, the **Key letter height** in the model's Key plate controls, 16 to 50.8 mm; Liberation Sans at the sign's spacing and a 135 % line pitch; raised 0.8 mm, the title's raise. Words, channels and samples keep 9.5 mm (3/8 in) from each other and from the frame, the distance ADA 703.3.2 asks between braille and anything else raised, so a 16 mm capital being about 17 mm wide, a plate of words holds ten letters a line and a few rows. The summary says how many plates the key takes; the count falls as the plates grow, as the level shows less, and as contracted braille shortens the strips (at 3600 Ferry Pl NE, at Named places, the key takes five plates with braille only and more than twenty with print and braille).

## Numbers on the map

Every named building, area and point that is on carries a number, and the key lists each number with its name, so a name too long for the map is still one number away. The draft's rows in the editor read with the number first, as "3 Building: Haring Center". A kind with no name of its own, a bench or an unnamed building, keeps its symbol and takes no number, and a street keeps its name on the paper and the PDF.

A map with an address counts outward from it: the address's own building is 1, then the nearest and on, so placing or dragging You are here moves no number and a printed key stays right. A map with no address counts outward from You are here, and one with neither reads row by row, left to right. A route map counts in walking order along the route. Things the same distance away go left to right, then top to bottom.

The numbers follow what is on: turning a thing off renumbers the ones after it, and a key printed before that change no longer matches the map. The README carries the numbers of its own zip, so a key and a map from one zip always agree.

**Labels** in step 5 says what a number on the map is made of. **Braille (wedges and tape)** raises it as a braille wedge, the number sign and the digits on a face that leans back toward you, and puts the names that fit on tape. **Raised letters** raises it as a bold numeral, 10 mm tall on a place and 16 mm in the margin, and puts no tape on the map. **Both**, where it starts, raises the numeral with the wedge at its right, 3 mm apart, and the tape: a reader of braille and a reader of print each find the number, so I would start there. The key keeps its own choice, Key words.

A number stands on its place when it fits there and covers at most half of it, 3 mm clear of everything else, with its name's tape 3 mm under it when the tape fits too. A number with no room on its place stands in the margin, at the nearest edge with room (the bottom, the left or the right; the top holds the title and the north cue), at the end of a raised lead line from the place. A lead stands on a level of its own above everything else, touches the wedge's back or stops 3 mm short of a numeral, so a finger knows where it ends (BANA 2022 3.4.3.6). The numbers along one edge are ordered so no two leads cross, and a lead runs over no other number when another edge has room. The margin widens on a side that holds numbers, to 3 mm, the deepest number and 9.525 mm to the edge; with Both a side margin holds a 16 mm numeral and its wedge side by side, which can add plates. A number with no room anywhere is in the key alone, and the warnings say so. The wedge's face angle and its foot are dials in the Customizer's Numbers group ([Heights and sizes](#heights-and-sizes)), and the numbers move to fit when they change. A wedge that falls across a plate seam is cut at the seam, so the two plates together hold it whole. The map paper and the PDF draw each number where it stands, the wedge's braille laid flat on it so a sighted helper can read it. A map from your own drawing keeps its numbers in the key.

## Label tape channels

A channel is a recess the width of your tape plus 0.4 mm and 0.3 mm deep, so a strip of braille label tape sits nearly flush with the surface. Set the tape width the model asks for, 9.5 or 12.7 mm, to the tape your labeler uses. The sample carries two channels; a plan places a channel by its center and length, horizontal or vertical. The builder warns when a channel comes within 3 mm of another feature.

**Tape channels** in step 5 says how a channel is cut. **A recess with a floor**, where it starts, leaves a floor of the plate under the tape and works with either print style, so I would start there. **Cut through, for a backing board** opens each channel right through the plate, for tape you would rather stick to the board the plates are glued to than to the printed plastic. The key plates follow the same choice, the map paper and the PDF draw a cut-through channel with a dashed edge, and the README says which cut the plates have. An **All printed** plate has no board under it, so a note under the choice and a line in the warnings say a cut-through channel would leave nothing under the tape; the choice stays yours.

A place map or a route map lays in a channel for a numbered place's name when it fits: beside a point's symbol for a name of up to six cells, as "Pine" takes; inside an area at any length, as long as the channel covers at most half of the area. Any other place carries only its number, with the full name in [the key](#the-key). A channel beside a symbol goes right, left, below or above it, or at a corner, wherever it keeps 3 mm from every symbol, line, area, the title and the other channels (BANA 2022 8.5.3); inside an area it stands at the middle, or the nearest spot that keeps those 3 mm. The lower numbers come first, so they get the room. Its length is the label's cells at 6.2 mm each, a braille labeler's spacing, and 4 mm of tape at each end. The cells are counted by the app's own braille translator (liblouis, the engine the Braille Sign uses) in the grade **Braille on tape** in step 5 names: **Contracted (UEB Grade 2)**, where it starts, the braille most adult readers and labelers write, which shortens most words, or **Uncontracted (Grade 1)**, which spells every letter; the key plates' strips are measured the same way. The note under the choice says what the tape comes to, "Label tape: contracted braille (UEB Grade 2). 7 labels, 23 cells, about 199 mm of 12.7 mm tape; uncontracted would take 5 labels, about 241 mm.", and reads "Measuring the braille labels" while the translator works. Should the engine not load, the channels are sized by an estimate (a cell a letter, one more for each capital and run of digits) and the note and the README say so. The README in the zip lists the labels to write on tape, each with its braille, its cells and its channel's length, and where each goes; the PDF draws each label's braille as dots at the labeler's pitch. The channels are not rows in the editor: they follow the places you keep on. A map from your own drawing keeps the channels you drew.

## The warnings

Check and print lists the builder's warnings under one line that counts them ("3 warnings"), folded until you open it. Each names the feature so you can move it, resize it or switch it off:

| What it says                                                                                        | What to do                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| "{feature} is 2.4 mm wide; lines wider than 2.2 mm read as two lines."                              | Use 2.2 mm or a double line (Jehoel 2006).       |
| "{feature}'s symbol is 5 mm; symbols smaller than 6 mm are hard to recognize."                      | Use 6 mm or more.                                |
| "{feature} and {feature} are 1.5 mm apart, closer than the 3 mm minimum."                           | Move one or turn one off.                        |
| "6 benches within 3 mm of one another near {place}." (three or more of one kind at one spot)        | Keep one and turn the others off.                |
| "3 symbols within 3 mm of one another near {place}." (three or more of different kinds)             | Move them apart or turn some off.                |
| "The label channel {feature} is 2 mm from {feature}; keep 3 mm clear."                              | Move the channel or the feature.                 |
| "No room on the map or in its margin for {name}'s number {n}; it is in the key."                    | Make room near it, or let the key carry it.      |
| "16 different symbols on this map. More than 15 is hard to remember."                               | Use fewer kinds of symbol.                       |
| "5 area textures. More than 4 read as noise."                                                       | Use plain areas.                                 |
| "The map is 700 mm wide; more than 600 mm is beyond two hand spans." (and the same for 450 mm tall) | Make the map smaller, or split it into two maps. |
| "This map uses 4 levels; more than 3 are hard to tell apart by touch."                              | Use three.                                       |
| "{shape} was traced as a line but is too wide to find its center; it was kept as an area."          | Set the shape to Area, or draw it as a line.     |
| One symbol moved 6 mm to keep the north arrow and the marks clear. | Nothing, if the move reads well; otherwise move the symbol in the editor, or turn it off |

The sentences give the real numbers; the ones above are examples.

## Generating and downloading

The preview follows every choice. Once you have pressed **Generate**, the file does too: a later change in any step generates the map again by itself when its preview has settled, and **Download** always hands over the map on screen.

## Printing

- Layers 0.12 mm or finer for the symbol level, so a 0.8 mm step is several layers and its top is flat.
- A 0.4 mm nozzle; no line on the map is thinner than 1.0 mm.
- A matte filament; a glossy surface is harder to read by touch and by eye.
- A 0.4 mm base needs a clean, level first layer: a slow first layer, and a brim if the plate lifts.
- With channels cut through, glue the plates to the backing board first, then press each strip of tape into its slot so it sticks to the board. With a recess, the tape sticks to the channel's floor.
- No supports: every face is flat or vertical.
- Print the plates one at a time if your bed is not perfectly level; a thin plate shows every ridge.

## What the tool does not check

- Whether the map is right for its reader. BANA 8.1 asks for an orientation and mobility specialist in the loop, and the editor is where that happens: the map is yours to read, revise and test with the people who will use it.
- Whether the drawing or the map data is current. The tool draws what it is given.
- Whether the scale you typed is the true width of the drawing.
- Mounting, finish and contrast.

## Keyboard and screen reader notes

- Every control in the steps and the plates is a native control with a visible label; the panel is a labeled region.
- **Next** and **Back** move between the steps, and the new step's heading takes focus, so a screen reader says which step it is and how many there are.
- A step's status sentences are said once: a pick, the draft's ready sentence, a failure and what to try instead. The counts shown when the map data arrives are not said, because the ready sentence follows.
- The plates summary is a polite live region: a change of bed or of plate is said once. Rendering every plate is counted off the same way, and the zip's name is said when it is ready.
- In the drawing editor, each row's Class menu is a native menu named for its row, in the row's Tab order; the plan's size is said when Apply classes closes the editor.
- The editor's picture is one Tab stop whose help names its keys: the arrows walk the shapes, Shift with an arrow moves the picture, Space picks up and puts down the destination or You are here. The four pan buttons are named Pan left, Pan up, Pan down and Pan right.
- The warnings are a plain list inside a disclosure whose summary counts them.

## Privacy

Everything runs on your device: the drawing's conversion and tracing, the plan, the rendering and the zip. Nothing is uploaded.

A place or route map is the one part that talks to anyone, and only when you press:

- **Search** sends the words you typed to OpenStreetMap's Nominatim service (nominatim.openstreetmap.org), with the app's web address as the referer and nothing else: no account, no email, no location of yours.
- **Make the map** asks OpenStreetMap US's tile service (tiles.openstreetmap.us) for the tiles over the area: each request names a tile's number, which says what square of about 800 m the map is in and nothing more. Only when the tiles fail does the app send the four edges of a box, the ground the chosen scale covers or the room around a route's two places, to an Overpass server (overpass-api.de, then maps.mail.ru); the status line names each before it is asked.
- **Mark steep sidewalks** fetches up to four terrain tiles from AWS Open Data (s3.amazonaws.com), each a 256 by 256 pixel picture of heights named by its tile number, which says what square kilometer the map is in and nothing more.
- **Find journeys**, for a trip by bus and train, sends the two places' coordinates and the time to Transitous's journey planner (api.transitous.org), once a press, with the site's address as the referer, which is how its terms ask a browser app to be known. Nothing else goes with it.

Each of those hosts sees your connection's address, as any web request does. A file you load through **Use a file instead** stays on your device. A map from your drawing and the plates never leave it.

## Sources

Read on 2026-10-26, except ADA 703, read on 2026-10-01, and the data sources, read on 2026-10-29.

The map data and the terrain heights:

- OpenStreetMap contributors, https://www.openstreetmap.org/copyright: the map data, under the Open Database License (ODbL).
- The Nominatim usage policy, https://operations.osmfoundation.org/policies/nominatim/: the terms the search keeps to.
- The OpenStreetMap US Tileservice, https://tiles.openstreetmap.us/, and its usage policy, https://tiles.openstreetmap.us/usage-policy/: free for low volume non-commercial use, with the credit "Tiles by OSM US"; its Sourdough tiles, https://sourdough.osm.fyi/, keep OpenStreetMap's own tags layer by layer. Read on 2026-11-01.
- The Overpass API's public instances and their usage page, https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances: the terms the pull keeps to. It lists the main server (overpass-api.de), which asks an app to pause 30 seconds after a 429 or 406 answer, and VK Maps' instance (maps.mail.ru/osm/tools/overpass), the second server the pull asks, which says it has no request limits at present. Read again on 2026-11-01.
- The Mapzen terrain tiles on AWS Open Data, https://registry.opendata.aws/terrain-tiles/: Terrarium PNG tiles of heights, built from public elevation data under open terms listed on that page; the app reads zoom 15 at about 3 m per pixel. The incline figure and the rise-over-run definition follow the OpenSidewalks schema, https://sidewalks.washington.edu/opensidewalks/, which reads an incline from OpenStreetMap as the most along the path; its curbs, crossings and traffic islands are the pedestrian base a map near a building draws.
- OpenStreetMap's `incline` key, https://wiki.openstreetmap.org/wiki/Key:incline: a percent or a degree value, positive uphill along the way, or `up` and `down` when the number is unknown. AccessMap's profiles, https://taskarcenteratuw.github.io/tcat-wiki/accessmap/user-manual/profiles/: the words for 5, 8 and 15 %. Read on 2026-11-01.
- Transitous, https://transitous.org/, and its API terms, https://transitous.org/api/: a community-run journey planner on the MOTIS engine, free for open-source, non-commercial apps that are light on its resources, routing on OpenStreetMap data and the transit agencies' published schedules, which it lists at https://transitous.org/sources. Read on 2026-11-01.

The research behind the figures:

- Braille Authority of North America, Guidelines and Standards for Tactile Graphics, 2022 edition (sections 3.4.3 on lines, areas and point symbols; 5.9 on keys; 8.1, 8.5 and 8.6 on maps), https://www.brailleauthority.org/
- Wabinski, Moscicka and Touya, "Guidelines for standardizing the design of tactile maps: a review of research and best practice", The Cartographic Journal, 2024, which carries the ISO 19028 figures (10 mm point symbols, 0.3 to 1.5 mm heights) and Bris 2001
- Jehoel, Ungar, McCallum and Rowell, "An evaluation of substrates for tactile maps and diagrams", British Journal of Visual Impairment, 2006 (features read from 0.2 mm; a double line needs a 1.3 mm gap; a single line over 2.2 mm reads as two)
- Jehoel, Ungar, McCallum and Rowell, "An evaluation of tactile symbol sizes", 2009 (5.0 to 6.4 mm identifies a symbol)
- Gual, Puyuelo and Lloveras, "Three-dimensional tactile symbols produced by 3D printing", 2012, and their 2014 follow-up (prisms and pyramids recognized best; 5 mm the smallest)
- McCallum, Ungar and Jehoel, "An evaluation of tactile directional symbols", British Journal of Visual Impairment 24(2), 2006 (Ungar 2005 in the class table)
- Holloway, Marriott and Butler, "Accessible maps for the blind: comparing 3D printed models with tactile graphics", CHI 2018
- Holloway, Marriott, Butler and Reinders, "3D printed maps and icons for inclusion: testing in the wild by people who are blind or have low vision", ASSETS 2019, https://arxiv.org/abs/2501.09204 (the tiers of what a map carries: benches and bins left out of the first; read on 2026-11-02)
- Rowell and Ungar, "The world of touch: an international survey of tactile maps", 2003, and Olczyk, 2014 (a map within two hand spans)
- U.S. Access Board, [2010 ADA Standards for Accessible Design, section 703](https://www.access-board.gov/ada/#ada-703), the raised title's figures
