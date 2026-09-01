# Cutting a stencil on a laser

PROSE: owner review pending (DP-R1 text pack).

Forge prepares the file. Your laser's own software cuts it. This page is about
the handover: what Forge puts in the file, what it deliberately leaves for the
laser software to do, and the two or three settings worth checking before you
press start.

Forge is not a laser slicer and does not try to be one. It does not know your
material, your machine, or your beam.

## The short version

1. Set **Output type** to `laser cut`.
2. Leave **Bridges** on unless you know your design has nothing enclosed.
3. Save the file. **SVG** is the safe choice.
4. In your laser software, set the black lines to **Cut**.
5. Check the size is what you expected before you start. It should be exact.

## What Forge puts in the file

**True size.** The drawing is exactly the size it says. Nothing is shrunk or
grown to allow for the beam.

**Millimetres, stated.** The SVG carries `width="200mm"` and matching
coordinates, so no software has to guess. The DXF now declares millimetres too
(`$INSUNITS`), which it did not before: a DXF with no unit header is read as
inches by software set up for inches, and a 200 mm plate arrives 5,080 mm wide.

**Closed outlines, not filled shapes.** Cut lines are strokes with no fill,
which is what a laser wants. A filled shape can be read as an area to engrave.

**Registration marks.** Four corner crosses, identical on every plate, so a
multi-plate stencil can be lined up between coats.

**Bridges, when they are needed.** See below.

## What Forge deliberately leaves to your software

**Kerf.** A laser beam removes material, so a cut lands about half a beam width
inside the line. LightBurn, LaserGRBL, xTool and Glowforge all apply that
offset themselves, as a cutting setting that knows your material and power.

Forge used to shrink every cut by half a kerf as well. Two corrections make the
part undersized by a **full** kerf, and nothing on screen shows it: you find
out when the pieces do not fit. So Forge exports true size and lets the one
place that knows the beam do the job.

If your software has no kerf setting, apply the offset there rather than asking
Forge for it, so there is only ever one correction and you know where it is.

**Power, speed, passes, focus, air.** All of it. Forge has no idea what you are
cutting.

## Which format

**SVG is the safe choice.** It states its units in the file, every current
laser program reads it, and Forge writes cut lines as unfilled strokes.

**DXF also works** and some older machines and job shops prefer it. Forge now
writes a millimetre declaration into it. If your software still asks what unit
the file is in, answer millimetres.

Whichever you pick, **check the size after import**. It takes five seconds and
catches a unit mistake before it costs a sheet.

## Colours are instructions

Laser software decides what to do with a line by its **colour**. Forge uses:

| Colour | What it is | Set it to |
|---|---|---|
| Black `#000000` | The stencil outline and every opening | **Cut** |
| Red `#FF0000` | The plate label, when you ask for one | **Score** or **Fill** |

In LightBurn these arrive as two layers. Set them once and the machine
remembers. If you only ever cut, everything is black and there is nothing to
set up.

## Bridges, and why a stencil needs them

A laser cuts one sheet, once. Any shape completely surrounded by a cut falls
out: the middle of an **O**, the counter of an **A**, the island inside a ring.

Forge finds those shapes and leaves narrow ribs of material holding them. You
can set how wide the ribs are and how many hold each shape.

A rib shows in the sprayed image as a small gap in the paint. That is the
trade: a visible rib, or a hole where the shape used to be.

**If Forge cannot bridge a shape it says so, and it keeps saying so.** The
warning cannot be dismissed, because the failure is invisible until the sheet
is cut and the piece is on the floor. Usually the fix is to make the shape a
little larger, or move it away from the edge it is nearly touching.

### The bridge-less alternative

If you have a 3D printer, the **layered** mode needs no bridges at all. It
prints a stack of plates and you paint through them in turn, so no shape is
ever left unsupported and no rib ever crosses the artwork. See the layered
designs section of the tile author guide for how the plates work.

## Before you press start

- Does the size match what you designed?
- Is black set to Cut?
- Are the bridges where you can live with them?
- Is the material one you are willing to lose if this is the first try?
