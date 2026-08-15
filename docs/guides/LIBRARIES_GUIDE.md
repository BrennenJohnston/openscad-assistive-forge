# Using Libraries

A library is a folder of ready-made OpenSCAD code that someone else wrote. Instead of writing your own rounded box or gear, you borrow theirs with one line at the top of your model.

This guide covers the libraries that come with OpenSCAD Assistive Forge, how to bring your own, and how all of that compares with desktop OpenSCAD.

## TL;DR

1. Four libraries come with the app: MCAD, BOSL2, NopSCADlib and dotSCAD.
2. Write `include <MCAD/boxes.scad>` in your model and the app switches that library on for you.
3. To bring a library of your own, put its folder inside your project and open the project as a folder or a ZIP file.

---

## The four libraries that come with the app

| Library | What it is good for | Licence |
|---|---|---|
| MCAD | Mechanical parts: gears, screws, bearings, rounded boxes | LGPL-2.1 |
| BOSL2 | Shapes with rounding and chamfers, attachments, geometry helpers | BSD-2-Clause |
| NopSCADlib | Parts for 3D printers and enclosures | GPL-3.0 |
| dotSCAD | Patterns, curves and artistic shapes | LGPL-3.0 |

Each one is pinned to a fixed version, so a change published by its authors cannot alter your model without warning.

Desktop OpenSCAD ships with **one** library, MCAD. The other three are extra.

---

## Using a library in your model

Add one line near the top of your model:

```openscad
use <MCAD/boxes.scad>

roundedBox([45, 35, 28], 4, true);
```

`use` brings in the shapes and functions. `include` brings those in **and** runs any code in the file. If you are unsure, `use` is the safer of the two.

When you open a model that has a line like this, the app notices and switches that library on by itself. You should not have to do anything.

---

## The Libraries panel

The Libraries panel lists all four with a checkbox each, and a badge showing how many are on.

- In **Standard** mode it sits with the other model settings, under a heading called Libraries.
- In **Simplified** mode it is hidden, because most people never need it.
- **File > Show Library Folder...** brings it up from anywhere. On the desktop version this command opens your library folder on disk; a browser has no such folder, so here it opens the panel that lists what this app has.

A library only needs to be on if your model asks for it. Turning extra ones on does no harm, but each one has to be fetched the first time it is used, so leave the ones you do not need switched off.

---

## When a library is missing

If a model needs a library that is switched off, the app says so and names it:

> This model needs the MCAD library, which is switched off. Turn it back on in the Libraries panel.

If the model asks for a library the app does not have at all, it says that instead, and points you at the section below.

You can always see exactly what OpenSCAD reported in the Console. Look for a line beginning `WARNING: Can't open`.

---

## Bringing your own library

You can carry a library inside your project. This is not a workaround -- it is what desktop OpenSCAD does when a library folder sits next to the model file.

Arrange your files like this:

```text
my-project/
  main.scad
  MyLib/
    thing.scad
```

Then in `main.scad`:

```openscad
include <MyLib/thing.scad>

thing(12);
```

Zip the whole `my-project` folder and open the ZIP file. The app keeps the folder structure, and `MyLib/thing.scad` resolves exactly as it would on the desktop. Folders inside folders work too.

If your browser and build offer **File > Open Local Folder...**, you can open the folder directly instead of zipping it. That command is not available everywhere, so the ZIP route is the one to rely on.

### What this cannot do yet

- **The Add File button cannot create folders.** It puts whatever you choose at the top level of the project. To get a library folder in, open a folder or a ZIP file that already has the right shape.
- **The library belongs to that one project.** There is no shelf that keeps a library available for everything you make, the way `Documents\OpenSCAD\libraries` does on the desktop. That is a known gap and it is planned as its own piece of work.

---

## How this compares with desktop OpenSCAD

| What you want to do | Desktop OpenSCAD | This app |
|---|---|---|
| Use a bundled library | MCAD is included | MCAD, BOSL2, NopSCADlib and dotSCAD are included |
| Switch a library on | Nothing to switch -- anything in the library folder just works | Tick it in the Libraries panel, or let the app notice it for you |
| Put a library folder beside your model | Works | Works |
| Install a library for every project | Drop the folder into `Documents\OpenSCAD\libraries` | Not yet -- see above |
| See what is installed | File > Show Library Folder... opens the folder | File > Show Library Folder... opens the Libraries panel |
| Change which version of a library you use | Replace the folder yourself | Fixed at the version the app ships |

Models render the same either way. Each of the four bundled libraries has been checked against desktop OpenSCAD 2026.01.03 producing identical geometry for the same file and the same settings.

---

## Related guides

- [Getting Started](GETTING_STARTED.md)
- [Standard Mode](STANDARD_MODE_GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING_USER_GUIDE.md)
