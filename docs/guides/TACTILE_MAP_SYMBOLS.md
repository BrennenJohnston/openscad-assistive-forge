# Tactile map symbols

The set is provisional until it has been printed and felt; a shape that confuses readers is a change to data, not to the app.

The Tactile Map tile places point symbols for the things a reader looks for on a map: stairs, elevators, entrances, landmarks, a transit stop, and the place the reader stands. This page lists the ten shapes the app ships, what each stands for, how big it prints, and where its shape comes from. You can also load a set of your own, which the last section explains.

## The rules every symbol keeps

- A symbol is at least 6 mm across, and the map keeps 3 mm clear around it. Below that, two shapes stop being two shapes under a finger (Braille Authority of North America, Guidelines and Standards for Tactile Graphics 2022, 3.4.3.11).
- The default size is 10 mm, the size the published standard for tactile maps uses (ISO 19028, as reviewed by Wabinski, Moscicka and Touya in 2024) and the size my station maps were printed at.
- No part of a symbol is thinner than 1.0 mm at 10 mm, which is what a 0.4 mm nozzle lays down reliably.
- Every shape is a filled, flat-topped area, raised 0.8 mm above the floor level so it stands out from lines. Shapes with a few straight sides and a clear outline, prisms and pyramids rather than domes, were recognized best in printed tests (Gual, Puyuelo and Lloveras 2012).
- The levels builder warns when a map carries more than 15 different symbols or two symbols closer than 3 mm, because maps with too much on them are the complaint readers raise most often.

## The ten shapes

| Name               | Stands for                                           | Shape at 10 mm                                                                                                        | Where the shape comes from                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stairs             | A staircase                                          | Three horizontal bars, each 1.6 mm tall, across the full width                                                        | Parallel bars read as stairs in the symbol study by McCallum, Ungar and Jehoel (British Journal of Visual Impairment 24(2), 2006); bars are a BANA line style                                 |
| Elevator up        | An elevator, read as "up"                            | A solid triangle, apex up, 10 mm wide and 9 mm tall                                                                   | Simple arrows read best in the same study; the proportions follow BANA 2022 3.4.3.7 on arrowheads                                                                                             |
| Elevator down      | An elevator, read as "down"                          | The same triangle, apex down                                                                                          | The up arrow turned over                                                                                                                                                                      |
| Entrance           | A door or gate, with its flat side toward the way in | A half disc, 10 mm across and 5 mm tall, flat side down                                                               | ISO 19028 uses a semicircle to show a direction (Wabinski, Moscicka and Touya 2024)                                                                                                           |
| Landmark, circle   | Any landmark you name in the key                     | A disc 10 mm across                                                                                                   | BANA 2022 3.4.3.11; Jehoel, Ungar, McCallum and Rowell (2009) found a circle identified from 5.5 mm                                                                                           |
| Landmark, square   | A raised curb, or a second landmark                  | A square 9 mm on a side                                                                                               | The same sources; a square identified from 5.0 mm                                                                                                                                             |
| Landmark, triangle | A curb ramp or flush curb, or a third landmark       | An equilateral triangle, 10 mm on a side                                                                              | The same sources; a triangle identified from 6.4 mm, so it is the shape to use last at small sizes                                                                                            |
| You are here       | The reader's own place                               | A disc 10 mm across with a 4 mm dot in its center that stands one symbol step (0.8 mm) higher than every other symbol | BANA 2022 8.5.6 asks for the most prominent symbol on the map, first in the key; ISO 19028 6.5.1 raises the present location higher than the other marks                                      |
| Transit stop       | A bus, train or tram stop                            | A 9 mm square with a 3 by 4.5 mm notch cut from its top edge                                                          | BANA 2022 8.6.5: a shape used for two things differs by 25 to 30 percent of its size, so the notch keeps it apart from the landmark square                                                    |
| Uphill chevron     | The uphill direction of a steep sidewalk             | A V band 10 mm wide, its point up; along a line it is drawn every 10 mm, 6 mm across, pointing uphill                 | Arrows are read by their point (McCallum, Ungar and Jehoel 2006); the chevron pitch keeps inside BANA 2022 3.4.3.3's dash figures; steepness follows the OpenSidewalks incline, rise over run |

A reader tells a shape by its outline, so the set stays small and each outline differs from its neighbors in more than one way. One pair does not yet: the curb ramp's triangle and the elevator-up arrow differ by less than a millimeter in height, so a map that needs both should load a set that keeps them apart. The classes that place these symbols, and the lines and areas beside them, are in the [Tactile Map Designer guide](TACTILE_MAP_GUIDE.md).

## The University of Oregon set

The app also carries a published set: the symbols Amy Lobben and Megan Lawrence designed and tested with travelers who are blind ("The use of environmental features on tactile maps by navigators who are blind", The Professional Geographer 64(1): 95-108, 2012), as Megen Brittell, Manny Garcia, Amy Lobben and Megan Lawrence modeled them for 3D printing at the University of Oregon (2013, 2016; doi 10.7264/D37P4V). Their 3D models are free software under the GNU General Public License, version 3; each shape here is the outline of its model seen from above. A map made with the set credits "Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3" in its README.

Two things differ from the published set, and both are worth knowing before you print:

- The symbols are 13 mm across, as published, which is 1.3 times the basic shapes. A plate holds fewer of them, and the 3 mm gaps start from 13 mm.
- The published lines are 0.8 mm wide. That is under the 1.0 mm a 0.4 mm nozzle prints reliably, so every line here is 1.2 mm, the width the set itself gives its street line. The open circle's hole is 10.6 mm across instead of 11.4.

The authors note that any change in a symbol's size should be tested for readability; printing the sheet below and reading it with your fingers is the place to start.

Each map class takes one of the set's symbols, or keeps its basic shape where the set has none:

| Class                                  | Takes                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| Entrance                               | Entrance (number 9 on the sheet)                          |
| Stairs                                 | Elevation change (3)                                      |
| A crossing drawn as a point            | Intersection (5)                                          |
| Landmark, and street furniture with it | Flexible feature (2)                                      |
| Transit stop                           | Challenging feature (1)                                   |
| Curb ramp, raised curb, elevators      | their basic shapes: the set has no curbs and no elevators |
| You are here                           | its basic mark, the same in every set                     |

The set's fourteen point symbols, numbered as the sheet prints them:

| Number | Name                               | Stands for                                | Shape                                                  |
| ------ | ---------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| 1      | Challenging feature                | a feature of special relevance to the map | a filled square, 13 mm                                 |
| 2      | Flexible feature                   | a general feature of relevance to the map | a filled circle, 13 mm                                 |
| 3      | Elevation change                   | a change of height, pointing up the slope | a filled triangle, 15 mm wide and 13 mm tall           |
| 4      | Vegetation                         | any kind of vegetation                    | three crossed bars, a star 13 mm across                |
| 5      | Intersection                       | an intersection with no traffic control   | an open circle, 13 mm                                  |
| 6      | Intersection, controlled across    | an intersection controlled one way        | the open circle with a line across                     |
| 7      | Intersection, controlled along     | an intersection controlled the other way  | the open circle with a line along                      |
| 8      | Intersection, controlled both ways | an intersection controlled both ways      | the open circle with a cross                           |
| 9      | Entrance                           | an entrance, its open side the way in     | a square with one side open, 13 mm                     |
| 10     | Entrance with stairs or ramp up    | an entrance up stairs or a ramp           | the entrance beside a triangle pointing up, 32 mm long |
| 11     | Entrance with stairs or ramp down  | an entrance down stairs or a ramp         | the same with the triangle pointing down               |
| 12     | Passageway                         | a way through                             | two nested curves, 14 mm                               |
| 13     | Overpass or bridge                 | a way over                                | the curves beside a triangle pointing up, 31 mm long   |
| 14     | Underpass or tunnel                | a way under                               | the same with the triangle pointing down               |

Its line symbols are a plain line for a street (the Curb or edge class), two lines 5 mm apart for a railroad (Track) and short dashes for a sidewalk (Walkway), each 1.2 mm wide; its fence, one-way and two-way street, sidewalk-with-stairs and water lines, and its six area fills, are named in the set and not drawn, since no map class uses them yet.

## A sheet to print

`docs/guides/symbol-sheet/symbol_sheet.scad` prints a set on one plate, every symbol at the size a map draws it, its number in raised 8 mm digits under it, at the map's own heights: a 1.2 mm plate, symbols 1.4 mm above it. Open it in OpenSCAD, choose the set under **Set** (the University of Oregon set or the basic shapes), and render; the console lists each number's name. The Oregon sheet is 235 by 107 mm, the basic one 228 by 44 mm, so each fits a 256 mm bed.

## Loading a set of your own

Under **Symbol set** in the Tactile Map Designer's step 3, choose **Your own set (a file)**, then **Load a symbol library** and pick a JSON file. The file is a list, one entry per symbol:

```json
[
  {
    "key": "stairs",
    "name": "Stairs",
    "pathData": "M 0 0.08 H 1 V 0.24 H 0 Z M 0 0.42 H 1 V 0.58 H 0 Z M 0 0.76 H 1 V 0.92 H 0 Z",
    "minSizeMm": 6,
    "source": "where this shape comes from"
  }
]
```

- `key` is what a map's features refer to; use the ten keys above to replace the shipped shapes one for one, or your own keys for new ones.
- `name` is what the key sheet prints and a screen reader says.
- `pathData` is SVG path data in a box one unit wide and one unit tall, y down, drawn as filled shapes with no strokes. Several subpaths make several parts; a subpath inside another makes a hole.
- `minSizeMm` is the smallest size the shape still reads at; 6 is the floor.
- `raisedPathData`, if you give it, is a part of the symbol in the same box that stands one symbol step higher than the rest, as You are here's center dot does. It is checked the same way: no part thinner than 1.0 mm at 10 mm.
- `source` says where the shape comes from, so the next person can check it.

A loaded set replaces the shipped set as a whole until you choose **Use the built-in symbols**; the two are never mixed. The app refuses a file that is not such a list, a symbol smaller than 6 mm at its smallest size, and a symbol with a part thinner than 1.0 mm at 10 mm, and says which symbol and why. The file stays on your computer; nothing is uploaded.
