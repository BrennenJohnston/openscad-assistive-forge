<!--
  DRAFT - this journal and every image alt text in it are awaiting my
  review pass before release. Do not link from released surfaces until
  this banner is removed.
-->

# What's new in version 5

A photo journal of what changed since version 4.5.0 shipped in July
2026. This is the tour I would give you at my desk: the pictures are
the app as it is today, and the words are why each thing exists.

If you want the complete engineering record instead, it lives in
[CHANGELOG.md](../../CHANGELOG.md).

## A friendlier front door

![The welcome screen showing the tool cards: Main Page Tour, Beginners Start Here, and the Charm Customizer card with its credits line](images/welcome-tools.png)

The welcome screen is now a real front door instead of a hurdle. A
guided tour and a beginners' path sit at the top, and below them each
tool gets its own card with a plain description and the credits for
the designers whose work it builds on. On a phone, the dialog finally
fits the screen: the title stays out from under the browser toolbar
and the buttons never wander off the bottom edge.

## Three views of the same workshop

![The Simplified interface: a Customizer panel with presets and three parameter groups on the left, and a 3D preview of an open box with its lid on the right](images/forge-model-open.png)

Version 5's biggest visible change is that the app now has three
interfaces, and you can switch between them at any time without
losing your work.

**Simplified** is the default and the one in the picture above: the
parameters on the left, the model on the right, one yellow Generate
button. It is built for the person who opened a link and wants a
printable file, not a CAD lesson.

![The Standard interface: the same model with a menu bar and additional panels for Console, Image Measurement, Reference Image, Libraries, and Companion Files](images/standard-model-open.png)

**Standard** adds the working panels back: a console, libraries,
companion files, reference images and image measurement. It is the
middle ground for someone comfortable poking at a project's insides.

![The Classic interface: a desktop OpenSCAD style layout with menu bar, icon toolbar, a pale viewport with axes and tick marks, and the Customizer docked on the right](images/classic-model-open.png)

**Classic** rebuilds the desktop OpenSCAD experience in the browser:
the menu bar, the icon toolbar, the pale viewport with its axes, the
viewport readout along the bottom. If you learned OpenSCAD on the
desktop, your hands already know where everything is; the camera
controls are the ones you already know. It took a long programme of
small fidelity fixes to make this view feel honest rather than like a
costume, and it is the part of version 5 I am quietly proudest of.

## Type words, print braille

![The Braille Card Customizer: a wedge shaped card with braille dots reading hello world in the preview, and a translation panel with the text box and a language and grade selector](images/braille-card.png)

The braille tools arrived in 4.5.0; version 5 is where they grew up.
Translation still runs entirely on your device - the text never
leaves your browser. What is new is the braille editor: a Unicode
braille field on both the Card and the Sign where you can inspect and
correct the translation cell by cell before it becomes plastic. Cards
now size themselves to their content by default, the charm can carry
several charms in one print, and downloads leave with names that say
what they are, so `braille-card-hello-world.stl` lands in your
folder instead of a mystery string.

## A charm from a drawing

![The Charm Customizer: a round pendant with a heart design and a hanging hole, with Shape, Design, Border, and Attachment parameter groups](images/charm-customizer.png)

The Charm Customizer turns a simple drawing into a wearable pendant,
and feeding it your own art is now a documented job rather than a
favour. The drawing editor underneath it learned the two halves of a
round trip this summer: open a drawing, clean it up, and save it back
out - as SVG or as DXF - even if you never make a 3D design from it.
Symbols keep their pictures instead of turning into coloured blobs,
and if another program is watching a folder, your edits can land
straight in it.

## A stencil from a picture

![The Stencil Maker: a flat yellow stencil plate with a ring shaped cutout, thin bridges holding the centre, and registration marks in the corners](images/stencil-maker.png)

The Stencil Maker is new since 4.5.0. It takes a shape or a picture
and produces printable stencil plates: bridges hold the islands so
the letter centres do not fall out, registration marks in the corners
line the plates up, and a multi-colour picture becomes one plate per
paint colour with a jig to keep them all honest.

## Share it with one link

![The Publish Project dialog showing a generated manifest, numbered steps for hosting on GitHub, a Download Project ZIP button, and a Get Your Shareable Link section](images/share-link.png)

Sharing used to mean sending someone a file and a paragraph of
instructions. Now the app writes the instructions itself. The Publish
dialog generates a small manifest describing your project, hands you
the whole thing as one ZIP if you prefer, and composes a link that
opens Forge with everything pre-loaded - your settings included, if
you tick the box. Every downloaded project also carries a provenance
record now, a small file that says where the design came from, so a
file that travels can still answer for itself. For the people wiring
Forge into pipelines and other tools, there is finally one contract
page to build against without talking to anybody.

## The quieter work

Most of a year's effort does not photograph well, and that is fine.
A sample of what else changed, in plain terms:

- The drawing editor reads correctly to a screen reader, and the
  Publish dialog is readable in the light theme again.
- High contrast mode got the thicker focus ring it always asked for,
  and it no longer pushes the toolbar off the side of the screen.
- The guided tour's cards can be reached and heard while the
  Customizer is open, and a dialog opened during a tour is a dialog
  you can actually answer.
- The preview status line can be read on a phone, and the phone
  toolbar earns its rows instead of wrapping into chaos.
- When a shared link's numbers have been altered, the warning waits
  for you to read it instead of vanishing on a timer.
- Three high severity security advisories in build dependencies were
  patched, and the supply chain facts are now written down in one
  place for anyone who needs to approve this app for a network.

Thank you for printing, testing, and telling me what broke. Version 5
is the release where the workshop got big enough for everyone I built
it for.
