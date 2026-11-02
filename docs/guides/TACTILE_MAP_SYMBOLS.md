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

| Name               | Stands for                                           | Shape at 10 mm                                                 | Where the shape comes from                                                                                                                                    |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stairs             | A staircase                                          | Three horizontal bars, each 1.6 mm tall, across the full width | Parallel bars read as stairs in the symbol study by McCallum, Ungar and Jehoel (British Journal of Visual Impairment 24(2), 2006); bars are a BANA line style |
| Elevator up        | An elevator, read as "up"                            | A solid triangle, apex up, 10 mm wide and 9 mm tall            | Simple arrows read best in the same study; the proportions follow BANA 2022 3.4.3.7 on arrowheads                                                             |
| Elevator down      | An elevator, read as "down"                          | The same triangle, apex down                                   | The up arrow turned over                                                                                                                                      |
| Entrance           | A door or gate, with its flat side toward the way in | A half disc, 10 mm across and 5 mm tall, flat side down        | ISO 19028 uses a semicircle to show a direction (Wabinski, Moscicka and Touya 2024)                                                                           |
| Landmark, circle   | Any landmark you name in the key                     | A disc 10 mm across                                            | BANA 2022 3.4.3.11; Jehoel, Ungar, McCallum and Rowell (2009) found a circle identified from 5.5 mm                                                           |
| Landmark, square   | A raised curb, or a second landmark                  | A square 9 mm on a side                                        | The same sources; a square identified from 5.0 mm                                                                                                             |
| Landmark, triangle | A curb ramp, or a third landmark                     | An equilateral triangle, 10 mm on a side                       | The same sources; a triangle identified from 6.4 mm, so it is the shape to use last at small sizes                                                            |
| You are here       | The reader's own place                               | A disc 10 mm across with a 3 mm square hole in its center      | BANA 2022 8.5.6 asks for the most prominent symbol on the map, first in the key                                                                               |
| Transit stop       | A bus, train or tram stop                            | A 9 mm square with a 3 by 4.5 mm notch cut from its top edge   | BANA 2022 8.6.5: a shape used for two things differs by 25 to 30 percent of its size, so the notch keeps it apart from the landmark square                    |
| Uphill chevron     | The uphill direction of a steep sidewalk             | A V band 10 mm wide, its point up; along a line it is drawn every 10 mm, 6 mm across, pointing uphill | Arrows are read by their point (McCallum, Ungar and Jehoel 2006); the chevron pitch keeps inside BANA 2022 3.4.3.3's dash figures; steepness follows the OpenSidewalks incline, rise over run |

A reader tells a shape by its outline, so the set stays small and each outline differs from its neighbors in more than one way. One pair does not yet: the curb ramp's triangle and the elevator-up arrow differ by less than a millimeter in height, so a map that needs both should load a set that keeps them apart. The classes that place these symbols, and the lines and areas beside them, are in the [Tactile Map Designer guide](TACTILE_MAP_GUIDE.md).

## Loading a set of your own

Choose **Load a symbol library** in the Tactile Map Designer panel and pick a JSON file. The file is a list, one entry per symbol:

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
- `source` says where the shape comes from, so the next person can check it.

A loaded set replaces the shipped set as a whole until you choose **Use the built-in symbols**; the two are never mixed. The app refuses a file that is not such a list, a symbol smaller than 6 mm at its smallest size, and a symbol with a part thinner than 1.0 mm at 10 mm, and says which symbol and why. The file stays on your computer; nothing is uploaded.
