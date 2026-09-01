# ASCII City Walk: the landmark registry

Each city's legend used to be arithmetic over map tags, and arithmetic has no
taste: Seattle's read eleven hotels and put the Space Needle eleventh of
twelve. The legend is now a curated table of seven landmarks per city, drafted
from each city's own landmark register, listed in the order below, and keyed
to OpenStreetMap elements by id rather than by name.

The tables live in `src/js/game/landmark-registry.js`. Every row is validated
against the shipped extract by
`tests/unit/game/landmark-registry.test.js`, so a rebake that retires an id
fails the test board instead of quietly shortening a legend. Deleting a row
is the whole removal.

Each landmark also gets a street-level waypoint: a man-in-circle mark on a
plinth at the landmark's street face, which announces the landmark by name
when you walk into it. Two landmarks carry authored bodies drawn from
published dimensions - the Seattle Great Wheel (mapped as a point, so nothing
used to be drawn at all) and the Space Needle's saucer stack (mapped as
narrow prisms, so it used to read as a mast). The dimensions and their
sources are in `src/js/game/landmark-dressings.js`, cited per entry.

## Seattle

| # | Landmark | OSM element | Source |
|---|---|---|---|
| 1 | Seattle Great Wheel | node 1809238334 | Wikipedia "Seattle Great Wheel": 175 ft / 53.3 m, 42 gondolas, Pier 57, opened 2012 (Q7442108) |
| 2 | Space Needle | way 12903132 | Seattle Landmarks Preservation Board; Wikipedia / spaceneedle.com: 605 ft, top house 138 ft at the 520 ft level (Q5317) |
| 3 | Seattle Central Library | way 37056442 | OMA / LMN, 2004; the library's own architecture pages |
| 4 | Smith Tower | way 52781661 | Seattle Landmarks Preservation Board; 1914, the city's first skyscraper (Q1196348) |
| 5 | Public Market Clock | node 4217400413 | Pike Place Market Historical District (National Register #70000086) |
| 6 | Paramount Theatre | way 115042486 | Seattle Landmarks Preservation Board; 1928 (Q3363536) |
| 7 | Arctic Building | way 110176001 | Seattle Landmarks Preservation Board; 1916 (Q638024) |

## Denver

| # | Landmark | OSM element | Source |
|---|---|---|---|
| 1 | Daniels & Fisher Tower | way 36729544 | Denver landmark (1968), 1601 Arapahoe St; 1911 (Q901770) |
| 2 | Brown Palace Hotel | way 458038539 | Denver landmark list, 321-401 17th St; opened 1892 (Q991069) |
| 3 | Paramount Theatre | way 305027510 | Denver landmark register, 1621 Glenarm Pl |
| 4 | Trinity United Methodist Church | way 52957908 | Denver landmark register, 1820 Broadway; 1888 (Q7842995) |
| 5 | Equitable Building | way 82874458 | Denver landmark register, 730 17th St; 1892 (Q5384616) |
| 6 | Kittredge Building | way 37868371 | Denver landmark and National Register, 511 16th St; 1891 (Q49511334) |
| 7 | Ellie Caulkins Opera House | way 304212732 | The Denver Municipal Auditorium's hall, 908 14th St; 1908 (Q3051472) |

Union Station is on Denver's register and is not in the table: it stands
outside the extract's circle, and a row that cannot be keyed to a mapped
element does not get to pretend.

## Albuquerque

| # | Landmark | OSM element | Source |
|---|---|---|---|
| 1 | KiMo Theatre | way 474070590 | City of Albuquerque Landmarks Commission, 423 Central Ave NW; 1927 (Q6403585) |
| 2 | Sunshine Building | way 119717403 | City landmark register, 120 Central Ave SW; 1924 (Q7641442) |
| 3 | Rosenwald Building | way 707216310 | City landmark register, 320 Central Ave SW; 1910 (Q7368615) |
| 4 | Occidental Life Building | way 329065341 | City landmark register, 305 Gold Ave SW; 1917 (Q7075686) |
| 5 | Hotel Andaluz | way 183521465 | La Posada de Albuquerque, 125 Second St NW, 1939; today the Hotel Andaluz (Q5911177) |
| 6 | Simms Building | way 401654872 | National Register, 400 Gold Ave SW; 1954 (Q7518027) |
| 7 | Southwestern Brewery and Ice Company | way 437201163 | National Register (Q7571396) |

## Burnaby

| # | Landmark | OSM element | Source |
|---|---|---|---|
| 1 | Central Park | way 23165846 | Heritage Burnaby; the 1891 park at Boundary and Kingsway (Q5061594) |
| 2 | Metrotower I | way 75718012 | List of tallest buildings in Burnaby; 104 m, 1989 |
| 3 | Metrotower II | way 75718011 | List of tallest buildings in Burnaby; 1991 |
| 4 | Metrotower III | way 105046492 | List of tallest buildings in Burnaby; completed 2015 |
| 5 | Station Square Tower 5 | way 962138235 | The Station Square development; the tallest tower in the circle |
| 6 | Daniel & Amelia Mowat House | way 551738891 | Heritage Burnaby register; mapped historic=house |
| 7 | Wilson House | way 870634459 | Heritage Burnaby register; mapped historic=house |

Burnaby's register names Swangard Stadium, the Central Park Gate, Metropolis
at Metrotown and the Sovereign tower as well; none of them is mapped as a
named element inside the circle. Central Park's row carries the stadium and
the gate, which stand inside it.

## How a city without a table behaves

A city not listed here - a test fixture, a future extract - falls back to the
old scorer, with one change: where two candidates tie on score, the one that
carries a `wikidata` tag ranks first. A mapped identity is the closest thing
the data has to "people write about this".
