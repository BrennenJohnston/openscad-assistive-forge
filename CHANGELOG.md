# Changelog

All notable changes to the OpenSCAD Assistive Forge project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Get map data works from the published site: the Tactile Map Designer
  reads OpenStreetMap US's map tiles first, and only when they fail asks
  OpenStreetMap's main Overpass server, then VK Maps' server, saying which
  one it is asking; a pull that fails says what failed instead of "busy".
- A map pull's result shows in a framed box under the buttons, a failure in
  red, and once a place is picked the preview shows an empty plate titled NO
  MAP YET instead of the sample station until the draft is made.

## [5.8.0] - 2026-11-01

### Added

- The Tactile Map Designer: a tactile map tile with up to three raised
  levels, research-sized symbols, a raised title, a north cue and channels
  for braille label tape, with a guide and a symbols page.
- Tactile maps split into plates for your print bed, each named by touch;
  one button renders every plate and downloads them as one zip with the
  plan, the levels files, a layout picture and a README.
- The drawing editor turns a line drawing, a DXF or a traced photo into a
  tactile map plan: a class on every shape, painted in the charm
  customizer's layer colors, with pan, zoom and a keyboard walk between
  shapes.
- Type an address and the Tactile Map Designer drafts a map of the
  sidewalks and landmarks you choose from OpenStreetMap, live or from a
  file, its shapes named by their street or building.
- Sidewalks steeper than a grade you set can carry uphill chevrons, from
  public terrain tiles.
- A route map: type where a walk starts and where it ends, and the draft
  raises the walk from door to door with its crossings and steps, on a
  plate fitted to the walk.

### Fixed

- The welcome cards' Tool menus are 44 px tall on a touch screen, the same
  floor as the buttons beside them.
- A menu focused by keyboard shows a solid ring in every look, where the
  dark and light looks drew a faint halo.
- In the Alt View, reaching the end of a list is the last sound a scroll
  makes: no line's tick follows it any more.
- On a phone held sideways the drawing editor scrolls to its picture, which
  its toolbar used to cut to a strip.

## [5.7.2] - 2026-10-26

### Fixed

- The Alt View's line drawing shows the axes, their tick marks and the grid
  again, and at larger sizes the axes are drawn as lines over the characters.

## [5.7.1] - 2026-10-22

### Fixed

- After an update, a page from the build before no longer loses its
  stylesheet, scripts or fonts: the offline worker stops keeping the host's
  fallback page in place of a file, keeps the page's own files when it trims
  its cache, and reloads an older page on the Main Page once a newer build
  is in charge (elsewhere the update banner offers the refresh).
- On a phone's data connection the engine question is asked once: a
  Download given is remembered on that device, and files the browser already
  holds need no question.
- On a phone the header no longer slides off the top of the Main Page when
  the page moves focus or scrolls a heading into view.

## [5.7.0] - 2026-10-22

### Added

- Preferences > Advanced > Engine chooses the Forge build or one of four
  official OpenSCAD snapshots, downloaded when asked for and kept; a failure
  that may be the engine's offers another.
- A game controller drives the app in three presets, Camera, Customizer and
  Menus; Keys > Controller shows its buttons, gives any action the button you
  press, tests it, and keeps presets of your own to export and import; a
  Joy-Con works alone, sideways or upright, and a pair the way you choose.
- In the Alt View, a Lens drawer draws the model as lines under 40% Focus,
  with a reset button after each slider; each look keeps its own Lens
  settings, and in Classic the Glow slider steps aside while the lines draw
  no glow. A sounds button sits beside the key, Preferences > Advanced turns
  each kind of sound off, and Classic's look has sounds of its own: a
  cassette deck's door and keys, a camcorder's zoom, a tape transport and
  plastic switches.
- Preferences > 3D View sets how solid a phone's Customizer and Preview
  Settings are.

### Changed

- Keyboard Shortcuts is Keys, with a Keyboard and a Controller tab and one
  scroll bar.
- Models render 10 to 45 percent faster, and Chrome renders a module nested
  more than twice as deep.
- On a phone the Customizer comes in over the preview, see-through, at the
  width you drag, and one button opens and closes it, its arrow turning to
  point the way it closes; held upright, Preview Settings & Info opens over
  the preview as a see-through sheet, never more than 40 percent of the
  screen, with a grip that sets its height and keeps it; the camera controls
  open in a drawer, and held sideways the header and the menu bar keep to
  one row each.
- A number box is as wide as its value, and its slider takes the rest.
- In the Alt View the drawers slide like desk drawers, and the key stays in
  the toolbar once it has been found three times.

### Fixed

- The app follows the controller you press, not a 3D mouse's joystick listed
  first, and the right stick turns the view the way it is pushed.
- An error is said once, by its dialog, and closing it puts focus back where
  you were; a model that uses a module the browser engine does not switch on
  gets a dialog that says so, and an example link whose file cannot be
  loaded says nothing after its error dialog.
- The menu bar opens the focused button's menu, the upload area is one Tab
  stop, the Save prompt and Discard draft put focus where you work, group
  headers show their focus ring, and icons stay readable in every state, as
  lines under Windows High Contrast.
- Opening Preview Settings no longer moves the 3D view, a rotation typed into
  Classic's Viewport-Control stays when a preview finishes after it, Classic's
  3D view toolbar wraps instead of hiding buttons, a flat model's status line
  says its preview is ready, a library file says "No preview: a library
  file", and an engine crash no longer blames projection() or roof().
- The Full Screen button's icon stands off its word, the preview badge's
  hourglass and spinner follow the alternative look as text, and while it
  generates the Generate button's name says so.
- On a phone, Preferences scrolls only its settings; menus held sideways,
  touch targets, the tour and the drawer toggles work as on other screens;
  the open Customizer's arrow reads in every look; and held sideways in the
  Alt View the settings row's buttons and the status line no longer cover
  one another or the ready badge. In the Alt View a drawer opened over
  another no longer waits for the preview on every frame of its slide, a
  selected tab is filled, auto-rotate ticks as a drag does, and the Download
  icon, a phone's lists, and Classic's Lens drawer and cursors follow the
  look.

## [5.6.0] - 2026-10-15

### Added

- The camera panel's buttons are pictures: each standard view is a cube with
  that face shaded, and the projection button shows the projection and is
  drawn pressed in orthographic.
- The camera panel's keyboard shortcuts open in a pop-out above their button.

### Changed

- Every drawer toggle has one arrow that points the way its drawer moves, and
  an open drawer's toggle is drawn pressed.
- A panel's title shares one row with its toggle.
- Every menu drops down under its own button, drawn pressed, and leaves the
  page behind it clear.
- Reset View and View All sit in the centers of the camera panel's Rotate and
  Pan pads.
- Auto-rotate is a switch in Preview Settings & Info, and View > Auto-rotate
  turns it on and off. Its speed shows the real degrees per second, and the
  preview starts at the speed shown.
- The mouse wheel zooms toward the center of the view; Preferences > 3D View >
  Zoom toward the mouse pointer zooms toward the pointer instead. After a
  change to the design, the view stays centered on the model.
- The Actions drawer is gone: Copy Link sits with the presets, Publish… is in
  the File menu, and Design > Open a drawing in the editor… opens the drawing
  editor.

### Fixed

- The Customizer reopens at the width it was resized to, and its divider's
  arrow keys and spoken width are right while it opens.
- Near the bottom of the window, the preset list opens upward instead of off
  the screen.

## [5.5.1] - 2026-10-14

### Added

- The braille sign warns when a character in its text has no shape in the
  sign's font and would print as a hollow square.

### Changed

- The braille sign's note in OpenSCAD Messages says what its description
  says about ADA 703.

### Fixed

- The drawing editor says each sentence once; a screen reader heard most of
  them twice.
- After an interrupted start, Recovery Mode shows a banner that stays until
  dismissed, with a button that turns automatic preview back on; the old
  notice could not be seen and was soon replaced.
- Where the browser has WebGL switched off, the Alt View key says why it
  cannot start and stays off, instead of doing nothing.
- Start New Project's accessible name begins with the words on it, so voice
  control finds it.

## [5.5.0] - 2026-10-13

### Added

- The Alt View has Characters (Fine, Normal, Bold) and Edges (Soft, Normal,
  Sharp) controls beside the preview; the minus and equals keys step the
  characters.
- Preferences > Advanced > Play sounds, on to begin with.

### Changed

- The Alt View starts with finer characters, no grid and a gentle afterglow,
  and the model stands on the grid as in the ordinary preview.
- Every surface takes the Alt View's look, the code editor and the drawing
  editor included, without rounded corners or shadows; Classic has a look of
  its own.
- The Alt View's key and its pan adjust button say what they do in plain
  words, once each, and the camera panel's sliders read Edges, Characters
  and Glow.
- The Features Guide's Alt View tab is in plain words.

### Fixed

- Screen readers hear the Alt View's key appear; the sentence used to be cut
  off by the camera button's own words.
- The drawing editor no longer opens hidden under the Alt View's characters.

## [5.4.0] - 2026-10-12

### Added

- The app's questions are its own dialogs: a kept draft, a slow engine
  download, presets from an earlier version, a folder or file's name, a
  delete, a copy the browser refused. Each follows the theme, names its
  fields and puts focus back where it was.
- Preferences > Editor's "Autocomplete as you type" is a working switch: on
  by default, and it can now be turned off.
- The camera panel and the phone camera drawer have View All beside Reset
  View: View All fits the model, Reset View keeps the default pose.

### Changed

- Help > Library info lists the bundled libraries, each with its license,
  the date of the copy bundled and whether it is on.
- Keyboard Shortcuts lists "Toggle Editor panel" and "Toggle Customizer
  panel" once each, with both of their keys, under headings that follow
  the dialog's title.
- The View menu's interface choices say where they go: "Assistive Forge,
  Simplified" and "Assistive Forge, Standard", apart from Classic's own
  "Simplified view".
- Classic's panel title bars put a panel away with Hide or Stow; the Collapse
  button, which could leave an empty column and started out blank, is gone.
- The Customizer has one reset-all button, Reset All, at full size; it still
  asks first. The second Reset in its top row is gone.
- File > Save As and File > Save a Copy each open a dialog of their own name
  that says where Save writes afterwards.
- Clear Cache keeps your saved projects unless you untick Keep my Saved
  Projects; it used to delete them by default.
- The question about saving a file for quick access is one step, Save or Not
  now, with no box to tick first.
- Library switches follow the project: opening one turns on the libraries its
  files include and turns the rest off.
- The Main Page button asks before leaving only when a change would be lost,
  and a draft is kept only once something changed.
- The size labels in the preview scale with the model and stand beside it;
  the OpenSCAD messages drawer makes room for the open Actions drawer.
- Preferences opens on its first tab; every folder and file row button names
  its item; the console's Copy says Copied once; Flush Caches writes its
  line to the console; a project with its own reference image says so.

### Fixed

- Ctrl+E and Ctrl+Alt+3 do the same thing in every layout: in Classic they
  show and hide the Editor panel, and in Simplified they say the Editor is in
  the Standard view instead of announcing an editor that never appears.
- The page never grows past the window with the Customizer's Console open.
- In a saved project's file manager, a folder's Rename and Delete work from
  the keyboard and with a screen reader, and moving between folders keeps
  focus.
- Undo after loading a preset brings back the values before it; Reload keeps
  the camera; the editor's edited mark means changed from the saved text.
- A failed preview clears the size and triangle count; a 2D format's line
  omits triangles; the messages drawer keeps every echo argument; the
  viewport badge says outdated, never none, while a model shows.
- The phone camera drawer's zoom buttons are 44 px; clearing the Customizer
  search gives each group back as it was.
- The Getting Started tour completes its preset step on a saved preset, keeps
  its card beside a control at the window's edge, and numbers only the steps
  it shows; the tour offer and tip wait for a start-up question.
- A saved-project card pressed before start-up waits for it; a declined
  approximate-outline question logs no error; the service worker's update
  message raises no warning.

## [5.3.0] - 2026-10-11

What a screen reader hears, across the app: each status once, focus that
never falls to the page body, controls named by the words on them. The
engine recovers from a failed preview, and the sample projects' folders and
phones work as they should.

### Added

- The preview draws a model's `%` shapes see-through, in their own color, as
  desktop OpenSCAD does.

### Changed

- The Actions drawer is shorter: the render queue, Compare, Export
  Customizer Settings and its Console button are gone; Publish is in
  Standard view.
- Controls are named by the words on them, first: the header ("Keys", "HC",
  "Full Screen", "Help", "Main Page"), the Actions drawer, the Main Page's
  folder buttons, Classic's "A. Forge", each key in Keyboard Shortcuts, and
  every saved project card button names its project. The theme button says
  which theme is on; the interface switch says its two options; "Main Page"
  mentions unsaved changes only when there are some.
- Downloads are named for the project and the day, the two STL kinds apart
  (`-ascii.stl`, `-binary.stl`); the viewport image and Export Changed
  Settings name the project.

### Fixed

- After a preview fails or runs past its time limit, the next change
  previews again, and the message says what happened.
- Folder and ZIP projects keep their STL, 3MF, OBJ and AMF files, so a model
  that imports one previews whole; a folder of several projects offers every
  model, grouped by folder.
- Text settings apply from a phone's keyboard, and a preset chosen while a
  text setting is being edited lands whole.
- On a phone, the preview's messages stay above the Actions and Camera
  buttons, named by their words, each line's level shown once.
- A color name such as "Chartreuse" no longer reads as a missing include
  file.
- Escape stops a Generate, as Cancel does; a stopped Generate is not
  reported as an error.
- The open Actions drawer stays on top of Preview Settings & Info in a short
  window.
- Models that repeat a module many levels deep preview in Firefox and
  Safari: the engine has the 8 MiB stack desktop OpenSCAD assumes.
- Dialogs take focus as they open, close on Escape, and give focus back to
  what opened them: focus no longer falls to the page body. Buttons that
  turn themselves off keep focus nearby; greyed-out menu items are reached
  by the arrow keys and say why they are off; a saved project card's buttons
  work with Enter and Space.
- A screen reader hears each status once: "Preview ready", "Generating" and
  a Generate's result were said up to four times. With Automatic preview
  off, the status bars say "Preview outdated".
- The code editor no longer reads its own changes aloud; the console reads
  each new line once, warnings are no longer alerts, and the full console no
  longer announces that it opened.
- Braille preview lines are read without "und (not supported)" in front.
- Tours open on Next, each step's heading takes focus so its text is read,
  the last button is named Finish, and finishing says so once. An example
  opened from the Features Guide leaves focus on its first setting.
- A failed preview or Generate says so once, with OpenSCAD's own error, and
  messages name your files instead of `/tmp/input.scad`.
- A PDF export of a 3D model says what works instead: SVG or DXF, which
  offer an approximate outline. The drawing editor says "1 shape".
- In Classic, the pane separators say their real share from the start; Play
  has one state signal; a font radio says its style; the opacity, brightness
  and contrast sliders say their value.
- Touch targets of at least 44 px: the Customizer's "?" and reset buttons,
  the camera view buttons, dialog close buttons, the Clear Cache dialog's
  Keep checkbox, the code editor's search panel; a parameter's help tip
  opens inside the panel.
- Automatic preview, switched off, stays off on the next visit; Viewport
  Control's fields accept the fractions the app writes into them.

## [5.2.2] - 2026-10-09

The OpenSCAD engine starts again in browsers that opened the app before
5.2.0, and previews recover after the engine stops.

### Fixed

- The engine starts in a browser that kept an older copy of it. Since
  5.2.0, such a browser said "Engine Initialization Failed" until its
  cached files were deleted; a copy that fails its check is now fetched
  again past every cache.
- When the engine still cannot start, the dialog says what most likely
  happened and how to delete the browser's cached files, which the app's
  Clear Cache button cannot reach.
- After the engine stops and cannot start again, the next change starts
  it again, and until then the status line says what to do, instead of
  every later preview failing with "Something Went Wrong".

## [5.2.1] - 2026-10-09

Fixes for things that did not work as they should: the menus, the render
queue, preview with automatic preview off, comparison, the Design menu's
results, New File and Flush Caches, and a return visit that lost its
project.

### Fixed

- Menus act once per key press, give focus back to their button when they
  close, and stay open when a grayed-out item is clicked.
- Every File > Export item can be reached with a mouse: opening Export
  scrolls the whole list into view.
- The render queue renders on a first visit, shows job names as text and a
  failed job's reason in plain words, and its counts return to 0 when the
  last job is removed.
- Design > Preview and F5 render with automatic preview off, turning it
  back on catches up, and Preview with nothing changed says the preview is
  current.
- Comparison's Edit opens the variant's values, and a new project starts
  with no variants, link values, last file or messages left from the one
  before.
- Design > Display Parameters and Check Validity show their result in a
  dialog; Check Validity counts unique vertices.
- File > New File asks before replacing a project and opens a starter file;
  Design > Flush Caches keeps the project and previews it again.
- A return visit with "Remember my choice" restores its draft instead of
  failing, and the restored draft keeps the values you changed.
- Switching quickly between braille tools no longer carries the earlier
  text's braille into the new design.
- The Getting Started tour's Width step unlocks Next when a value is typed.
- The Charm Designer no longer says the hole is outside the shape when a
  design comes from its library.
- Classic: the Console dock stays open and keeps its log; Window > Console
  moves focus to it; Viewport-Control and Copy viewport rotation use
  OpenSCAD's rotation numbers ([55, 0, 25] for the default view).
- Library includes are no longer reported as missing files, and the
  Companion Files count leaves out the main file.
- A parameter's "?" help opens and closes with one click.
- Deleting a preset asks plainly, with no markup in the question.
- Save SVG in the drawing editor writes the design's size in millimeters.
- A shared project's name and author show as plain text.
- The Features Guide no longer pulls focus back to its first tab.
- No text the app shows or says uses an em dash.
- The model color picker's default and Reset match the preview's color.
- The 3D preview does not draw while the drawing editor or a 2D preview
  hides it, and the drawing tools load with the first picture, not with the
  app; if they cannot load, the app says so in plain words.

## [5.2.0] - 2026-10-05

The braille tools now translate the way liblouis does, on a current
liblouis, and the Braille Sign is built to the figures of ADA 703, with a
page that says which rule governs each figure; the Braille Card and the
Braille Charm keep their dots to the same figures. Models that use
`minkowski()` preview in the browser without falling back to a much
slower method, and a shared link renders its first preview once, with its
preset.

### Translation

- Each line you type is translated whole and divided into rows
  afterward. The tools had translated one word at a time, so a capital
  passage came out as a capital sign on every word and other rules that
  span words were lost; "ROOM ROOM ROOM ROOM" now has one capital passage
  sign and one terminator, as Unified English Braille (UEB) writes it.
- The braille engine is liblouis 3.39.0, built from its release source by
  a script in this repository and checked against native liblouis on
  every test phrase. The liblouis packages from 2017 are gone, and with
  them a fault that crashed some short words mixing letters and digits.
- The table list offers UEB Grade 1 and Grade 2. The English Braille
  American Edition tables, the code the United States used before 2016,
  are gone: the Braille Authority of North America (BANA) no longer
  accepts it for signage.
- A character the table has no braille for is left out, with a warning
  that names it, and a no-break space or a tab is a word space.
- The Braille Card starts on contracted braille (Grade 2), as BANA's
  business card examples are.
- "Translate to text" lays the sign out again, so its raised letters
  follow the text it writes.

### The Braille Sign

- Sign braille follows ADA 703.3.1's rule for capitals by default: it is
  lowercase except a capital letter standing alone, such as the B in 3B.
  Choose "Exactly as typed" under Braille capitals to keep the capitals you
  type, for a name, an acronym or a sentence.
- The letter height setting is the height of the capital I, as ADA
  703.2.5 measures it, so the default letters are 16 mm tall (they were
  15.3 mm).
- At letter spacing 1.21 every pair of capitals and every pair of digits
  is 3.2 mm to four stroke widths apart (ADA 703.2.7). A new sign is
  166 mm wide, so "Room 101" stays on one row.
- Letters and braille stay at least 9.525 mm (3/8 in) inside the raised
  border, sized from the real widths of the letters, and braille lines
  are 10.1 mm apart.
- Every setting that ADA gives a range is held to it: the sliders stop at
  the range, and a value outside it stops the model with a message that
  names the rule. The sign offers rounded dots only.
- When one of a model's own checks stops it, the status line says what
  the check says. It had said the selection produced no geometry, in a
  dialog.
- [Braille sign standards](docs/guides/BRAILLE_STANDARDS.md) says which
  rule governs each figure, the sign's measured value, and what the tool
  does not check.

### The Braille Card and the Braille Charm

- Their dots keep to the same ADA 703.3.1 ranges as the sign's: the
  sliders stop at each range, and a value outside it stops the model with
  a message that names the rule. Both offer rounded dots only; an old link
  that asks for the Cone dot gets rounded dots.
- The card's braille lines are 10.1 mm apart by default, as on the sign.
  At the default "Max rows per card" every size preset holds as many rows
  as before.
- The charm has the braille editor too: one line per charm, used exactly
  as written, with braille ASCII, six-key entry and "Translate to text".
- The charm's table help says what contracted braille costs a charm: a
  letter standing alone takes an extra cell, so most capital letters no
  longer fit.

### Transcriber tools

- A divided e-mail address, web address or long number ends each row but
  its last with the line continuation sign (dot 5).
- The braille editor converts braille ASCII (from a BRF file, or braille
  typed as keyboard characters) with "Convert braille ASCII".
- Six-key entry types braille in the editor with F, D, S and J, K, L, the
  way a Perkins brailler does, and a screen reader hears each cell's dots.

### Previews, shared links and uploads

- The OpenSCAD engine is OpenSCAD's own 2026.04.03 source built with one
  definition added, `CGAL_ALWAYS_ROUND_TO_NEAREST`. In the browser,
  `minkowski()` had failed a CGAL check and fallen back to a much slower
  method: my two-sided Plug Puller, as it was with `minkowski()` edges,
  took about 65 s to preview and takes about 10 s now, and the volumes
  match desktop OpenSCAD's. A `minkowski()` that never failed can take up
  to about 0.9 s longer. A script in this repository builds the engine;
  built without that one definition, it gives the official snapshot back
  byte for byte.
- A shared link renders its first preview once. A manifest with
  automatic preview rendered it twice, and a link that names a preset
  rendered the design's own values first and then threw that picture
  away.
- A shared link that names a preset the project does not have says so in
  a notice that stays until you dismiss it. When a link has more than one
  thing to say, each notice has its own Dismiss button.
- A project opened from a manifest goes by its main file's name instead
  of `example.scad`: in the file box, the status line, recent files and
  its saved interface settings.
- An `include`, `use` or `import` inside a comment no longer brings a
  missing-file warning when the model renders, or a "Missing companion
  files" message and dialog when it is uploaded.
- The sharing guide's Git LFS section describes GitHub's metered billing;
  GitHub no longer sells data packs.

### Accessibility

- The braille tools' labels, status lines and messages end with a full
  stop or a colon where they had an em dash.
- A screen reader hears the braille editor's first status and its first
  error in words, each warning once rather than after every layout, and
  each pager page once. The pager's end buttons keep focus and are
  announced as unavailable.
- A message that repeats within a second and a half is spoken again. With
  six-key entry, a cell typed right after the same cell had been silent.
- The memory indicator no longer says "0 MB allocated to the OpenSCAD
  engine" every ten seconds, and Fontconfig's note that it has no config
  file is no longer called an error on every render that draws text.
- After a shared link applies a preset, the status line says the same
  sentence the screen reader hears, "{project} loaded with preset
  {name}".
- A warning from the engine is announced as a warning, politely, and no
  longer as an error that interrupts the screen reader.
- The many-parts notice no longer says a model will be slow before its
  first preview: "This model has many parts. If previews are slow, switch
  Preview quality to "Performance (auto)"."

## [5.1.1] - 2026-09-23

My own example links stopped opening: a person who followed one saw the
Main Page and nothing else. This release is what came of opening those
links the way the person who receives them does, as a first-time visitor,
and of making the example branch that an author copies true again.

### Shared project links

- A link that fails says so. When a shared link's download failed
  (GitHub's download limit, a spent Git LFS month, a wrong address), Forge
  went back to the Main Page, put its explanation only in a hidden status
  region, and removed the link from the address bar. Now a notice at the
  top of "Open or start a project" reads "The shared project could not be
  opened.", gives the loader's reason, and offers Try again, which opens
  the same link again, and Dismiss. It is announced once.
- A first visit previews the project. The engine download waits for the
  welcome dialog, so a small shared project arrived before the engine
  could draw it; the first preview ran anyway, and the page said "Preview
  failed: Something Went Wrong", out loud as well. On the deployed 5.1.0
  that happened on 11 of 11 first visits of the box and braille links.
  The first preview now waits for the engine.
- A direct link to a project archive (`?project=`) follows a Git LFS
  pointer to the archive itself, reports an archive it cannot open, and no
  longer says "Loaded" after a load that did not happen. On a first visit
  it waits for the welcome dialog before it opens anything, so neither
  its processing screen nor the "Save this file for quick access?"
  question stands over the dialog.
- The preset a link applies, from the manifest or from `?preset=`, is
  named in the preset list, which had kept saying "design default values"
  over the preset's values.

### The example projects

- The example branch's presets file is in OpenSCAD's own format, so the
  box link opens on its "Small Gift Box" preset with its five presets in
  the list. The old file was in a shape Forge never imported.
- The keyguard example opens a lean bundle: the same designer and its 292
  presets without the 54 overlay screenshots, 8.9 MB in plain git instead
  of 65.7 MB through Git LFS, so it no longer runs out with the month's LFS
  bandwidth (about 150 opens on a Free account). The full bundle is one
  manifest away.
- The branch's README is rewritten as the walkthrough for an author
  sharing their own design: the steps from a repository to one link on
  their own site, one link per client, the presets file, the hosts Forge
  may fetch from, and the LFS arithmetic. It no longer recommends a
  command-line generator that was removed, GitHub Releases hosting that
  Forge refuses, or a presets shape Forge never read.

### Accessibility

- The memory warning banner, when it is not showing, is hidden from the
  keyboard and from screen readers. It had only been moved above the
  window, so on every page two Tab presses landed on buttons nobody could
  see, and a screen reader could reach "High memory usage detected" while
  memory was normal.

### The sharing guide

- The hosting section starts with a lean bundle, adds the 65.7 MB row to
  the LFS table and what happens when the month's bandwidth runs out, names
  your own GitHub Pages site for busy or very large projects, and explains
  "server returned 429" behind one shared address. Step 6 says what a
  first-time visitor sees, the `?project=` section says what that road now
  does, and a short list opens the four examples. The manifest fields `id`
  and `defaults.skipWelcome` are described as what they are: accepted,
  and not used.

## [5.1.0] - 2026-09-21

A photograph of a printed communication symbol is a third kind of picture,
after library icons and my own logo, and the first version of the picture
lane had never met one. This release is what came of walking that
photograph and a marker drawing through the app until both printed.

### A photo of a symbol

- A camera picture (no transparent background, grain, an unevenly lit
  ground) is worked at forty pixels per printed millimeter, smoothed by a
  3x3 median, and floored at a tenth of a square millimeter before it is
  traced; the summary says the size it was worked at and how many specks
  were left out. Two switches under the modes, "Smooth the picture first"
  and "Leave out specks under 0.1 mm²", start on for a camera picture and
  off for a file. The cleaning-symbols panel that traced into 1,270 shapes
  traces into 18; the marker drawing into one outline. The thin-line
  advisory measures the drawing after the floor, not the specks.
- A trace with more shapes than the editor lists (a thousand) is refused
  before anything is prepared: the card says how many and what to try,
  nothing reaches the charm, and Convert again waits. The conversion's
  "Preparing the drawing" stage is sliced so Cancel is heard inside it, a
  paint precedes each stage's label, and a canceled conversion changes
  nothing.
- Crop first, beside Start conversion, opens the editor's crop view on the
  photograph before anything is converted; Save crop converts the part
  kept; Cancel or Escape closes it with nothing converted. At the drawing
  door, a refused trace opens the crop view instead. On a phone the
  parameter drawer stands aside while the editor is open.
- The editor reopens where it was left: Apply stores the combined result
  with the key of its choices, a reopen with the same choices at the same
  width paints it with Apply ready at once, and the door into the editor,
  Convert again and Crop survive a preset, an undo and a reset.
- The per-shape Offset is per ring with its own sign: plus is more ink on
  every ring, a hole shrinks, a Cut out flips, and a drawn line thickens
  by twice the offset; a traced drawing with an offset is combined by its
  rings' parity, never concatenated, so a ring grown into its neighbor
  merges instead of inverting it. The step is 0.05 mm in the editor and on
  both charm tiles' Offset slider. The offset's smoothing no longer cuts
  the corners clipper leaves bare.
- Reset puts every shape back on layer 1 with the roles and offsets and
  says what it reset; the Design width box says the charm set it; the bulk
  bar says its sizes are the box around each shape and what Thinner than
  measures; the advisory names the Offset dial as it reads.

## [5.0.0] - 2026-09-19

Since 4.5.0 the app grew three interfaces, a drawing lane that opens, cleans
and saves SVG and DXF, one-link sharing with provenance records, braille
editing on every braille tool, and a long accessibility pass. The last work
before release rebuilt the picture-to-charm editor as one product and walked
it with my own logo until it held. `docs/updates/WHATS_NEW_v5.md` is the
illustrated version.

### The interfaces and the welcome screen

- Three interfaces: Simplified for the person who opened a link, Standard
  for working inside a project, and Classic, a desktop layout that stays
  off phones.
- The first screen recommends Assistive Forge, with "Remember my choice"
  unchecked; "Not now" returns you to the top of the Main Page; the tour
  ends by telling you the way out; one name per thing across the tours.
- On a phone the welcome dialog fits the screen and its Download button
  stays on it, the toolbar earns its rows, the status line can be read, the
  Back button asks before it closes the app, and tour cards no longer cover
  the controls they are not talking about or cut off mid-sentence.
- High contrast no longer pushes the toolbar off the screen, and its
  keyboard shortcut is announced.

### The Charm Designer and the drawing editor

- Choosing a picture no longer takes the page away: one sentence says what
  the picture appears to be and what converting will cost, a small picture
  converts by itself, anything bigger waits for Start conversion, and the
  conversion runs in a dialog with its stages named and a Cancel at every
  one. Tracing runs on a worker thread; a second tracing engine, Potrace
  built from source, is the default.
- Four ways to read a picture: Line art, Solid shape, Light and dark, and
  Colors, which separates a photo or a colored drawing into one shape per
  color. Muted colors get their own names. A cropped reference photo can be
  the design. A symbol keeps its picture instead of becoming a blob.
- The drawing editor is one picture that fills its space, with the side
  panel as a drawer and the toolbar in named rows. It lives where the 3D
  preview is, and a Drawing / Charm switch shows the charm the drawing will
  become. A DXF opens, edits and saves back as DXF; a plain SVG opens,
  cleans up and saves back with no design involved. Your edits can land in
  the folder another program is watching.
- Every shape has one row: its name, a switch reading On, Cut out or Off,
  and More. The panel, the row, the color key and the screen reader use the
  same words. Hovering a shape marks its row, a press chooses it, two
  fingers pinch and pan. Several rows can be chosen together with Ctrl,
  Shift, Ctrl+A and the arrow keys, and a switch pressed on a chosen row
  sets them all. Shapes can be deleted from the list, and drawings with
  hundreds of shapes open.
- The result combines by itself a third of a second after each change, off
  the main thread, with one sentence saying how long it takes; a combine
  that would take longer than the measured budget waits to be asked. The
  combine that used to take nineteen seconds takes about one and a half.
- Every shape starts on layer 1, and three layers are always offered, each
  with its own height on the charm, raised or engraved. The stack is built
  once, in bands, so nothing stands on air. All three shapes of the Charm
  Designer build it: the Bracelet Clip Charm, the Flat Pendant and the Logo
  Plate. The Flat Pendant can take the shape of your own drawing.
- The wall behind a picture is left out by itself, so the charm carries the
  drawing rather than a plate with the drawing cut out of it. A plain
  drawing's own background starts Off, and an automatic preparation that
  keeps nothing opens the editor instead of applying an empty design.
- Every shape is measured against half a millimeter at the width the charm
  really prints, the too-thin ones are marked, and one press turns them all
  off, reversibly. The charm tells the app how wide it prints a design.
- Crop takes an edge off a picture and traces it again; Undo crop puts it
  back.
- The credit line that comes with a downloaded icon is left out of the
  charm.
- A drawing can arrive by a link: `?drawing=<url>` on any link that opens a
  design fetches an SVG, DXF, PNG or JPG, converts it without a press and
  opens the drawing editor on it; the design parameters take DXF.
- `@label(text)` beside a parameter in a `.scad` tile names its dial.
- Fixed on the way: a role pressed on a chosen row is pressed for the
  selection; the ring inside a drawn letter can be turned off; Close keeps
  the applied design; the way back into the editor after Apply; a changed
  setting never starts a conversion by itself; the drawing that came back
  in nineteen seconds; the picture cap that did nothing for three of the
  four modes; every plain upload turning the layered design on; three
  editors built side by side; the bail loop cut from the Flat Pendant
  instead of added to it; the selection you could not see; Shift-click
  selecting text; the relief flatten that lost real drawings; a DXF's
  curves; the traced color masks that did not touch; a file control saying
  [object Object]; the Logo Plate example that never found its sample logo.

### Braille

- A braille editor (Unicode) in the Braille Card and the Braille Sign: one
  editable line of braille per row, filled from the typed text and checked
  before it is written; on a sign it drives the braille plate only.
- Multi-charm mode on the Braille Charm: each character becomes its own
  charm, translated on its own.
- Cards, signs and charms are named after their content when downloaded.
- The Braille Card auto-sizes by default and its rarely used lines sit in a
  collapsed group; card and sign plates are thinner by default; editing the
  raw row count no longer resets silently. Upstream attribution follows the
  split braille repositories.

### Sharing and links

- A link opens with your settings, and Forge gives you one back with the
  values you changed. The Publish dialog hands over the whole project as
  one file, with a manifest and a provenance record that is now a promise:
  `forge-provenance.json` is countersigned. A shared link can decide which
  settings you meet first.
- One page a pipeline tool can build against without talking to anybody:
  `docs/specs/FORGE_HANDOFF_CONTRACT.md`. Adding a design of your own is a
  documented job, with a template and a guide.
- Fixed: a link's adjusted numbers wait for you; the Publish dialog is
  readable in the light theme and never hands you a manifest Forge would
  refuse; the sharing guide stops recommending hosting that does not work.
- Groundwork, off by default: opening a file straight into Forge from the
  desktop.

### The preview

- Show Edges is on by default, with an edge detail limit and a color per
  theme, and it follows the model after every move. The light theme's model
  colors meet the contrast bar.
- The reference image can sit on any surface, be cropped and be used as the
  design, and its place is remembered per project.
- The preview's heavy work after a load runs off the main thread, and it
  speaks its completion rather than its progress. A build stamp in the
  About dialog tells two builds of one version apart.

### Accessibility

- Long help texts deliver their first sentence to a screen reader, then the
  rest on request. The drawing editor reads correctly. The contrast modes
  get the thicker focus ring they ask for, the header toggles say the state
  they are in, and every slider row meets the 44 px touch floor.
- American English everywhere a person reads or hears it, with a guard that
  reads every string.
- `docs/notes/SCREEN_READER_LESSONS.md` writes down what a screen reader
  actually hears.
- Fixed: the mono theme's hovered primary buttons keep a legible label; two
  texts on the chosen welcome card met the contrast minimum; Safari gives
  focus back after the tour closes; the preview works on Safari in the
  dev server.

### Alt View

- The alternate view's walk gained four cities built from map data, with
  real ground, weather, people, traffic, street furniture, real landmarks
  to find, a legend and a map to travel from, an auto-walk, day and night,
  color as a switch of its own, and keys with buttons for everyone. Its
  picture holds still while you move, runs at full frame rate from the
  default size up, and speaks the street you are on.

### Security

- Three high-severity transitive advisories patched (`fast-uri`), unblocking
  the CI security job.

### Shelved

- The Stencil Maker: a welcome-screen tool that turned a shape or a picture
  into spray-stencil plates with bridges, registration marks and a jig. The
  work grew bigger than I expected, so it is shelved: its card, its example
  and its tests are out of the app, and the engine stays in the repository,
  dormant, for when I pick it up again.

## [4.5.0] - 2026-07-12

- **Braille Card Customizer**: a new tool family on the welcome screen. Type
  plain text and get 3D-printable braille, translated on your device by
  liblouis; the text never leaves the browser. Three tools: the Braille Card,
  which prints leaning back at 75 degrees with break-away support fins; the
  Braille Charm, a small pendant, keychain charm, zipper pull or bracelet
  clip carrying one or two cells; and the Braille Sign, a two-part tactile
  sign with raised letters and Grade 2 braille on ADA 703 style defaults.
- **SVG import**: transforms are kept through preparation; files with
  accented characters, CJK text or emoji open; fills set in a `style`
  attribute or inherited from a parent are respected; simple files are used
  as they are instead of being flattened; and the editor color-codes each
  shape by its role. A file that needs review is no longer swapped for a
  prepared one until you press Apply.
- **Preview**: three.js is pinned to the last release that falls back to
  WebGL 1, so browsers without WebGL 2 show the model again, and a browser
  with no WebGL at all gets a notice instead of a blank pane.
- **Charms**: the Charm Customizer's parameters have plain-language names,
  edge rounding renders much faster, and charm borders export as one
  watertight body.
- **Errors and progress**: errors show specific guidance instead of
  "Something Went Wrong", and the engine's loading bar no longer invents
  percentages.
- **Accessibility**: controls with keyboard shortcuts announce them,
  emoji-labeled buttons have one stable name, and reduced transparency
  covers every modal, drawer and tooltip.
- **Alt View**: converts only when something changes, draws from a glyph
  atlas, and gained an Afterglow slider.

## [4.4.0] - 2026-04-06

- SVG paths can be offset inward or outward in the preparation workspace.
- Presets that come with a project are listed apart from the ones you save,
  and presets with numbers in their names sort naturally ("2 Small" before
  "10 Large").
- Companion file resolution is hardened for multi-file projects, and the
  parameter dropout on re-render (KI-012) is fixed.
- The OpenSCAD engine is the 2026.04.03 build.
- File names and dialog text are escaped before display, closing a
  cross-site scripting path through crafted file names, and the example
  loader's blocking confirm box is an accessible dialog.

## [4.3.0] - 2026-03-20

- The Content-Security-Policy is enforced, with `unsafe-inline` removed from
  `style-src`, and the SVG sanitizer strips embedded objects and external
  references.
- Expert Mode has a CodeMirror 6 editor with OpenSCAD syntax highlighting.
- Every `alert()` is replaced by an accessible error dialog or toast.
- The toolbar is a WAI-ARIA menubar: arrow keys move across and within
  menus, Enter or Space activates, Escape closes.
- Five accessibility role cards on the welcome screen: Keyboard-Only, Low
  Vision, Voice Input, Screen Reader and Advanced Makers.
- Expert Mode has a phone layout, and forced-colors mode covers the camera
  pad and the code editor.

## [4.2.0] - 2026-03-16

- **Expert Mode**: edit OpenSCAD code in the browser with a live preview
  (`Ctrl+E`).
- **Vector parameters**: an editor with one control per element for
  `[x,y,z]` values.
- **Memory management**: usage is watched at three thresholds, auto-preview
  turns off at critical levels, and there is a safe recovery mode.
- **Desktop parity**: 14 of 16 audited differences from desktop OpenSCAD
  resolved, including per-face colors, the `#` debug modifier, a combined
  console and error log, SVG and DXF export, and missing-file warnings in
  the desktop's format. The toolbar menus follow the desktop layout (File,
  Edit, Design, View, Window, Help).
- **One-link sharing**: a project can be loaded from an external manifest,
  with a contract for which link parameters stay stable.
- **Also new**: folder import, auto-rotate, an image measurement tool,
  custom grid presets, lighting, color and printer presets, and an
  alternate retro terminal theme.
- **Security**: Content-Security-Policy headers in report-only mode, a
  software bill of materials and `npm audit` in CI, and escaping at every
  remaining HTML insertion point.
- **Accessibility**: a VPAT for Section 508, corrected heading levels,
  toggle contrast of 3:1 in every theme, and errors announced to screen
  readers.
- **Guides**: Getting Started, Standard Mode, Expert Mode, Troubleshooting,
  Security Admin, Browser Support and Known Issues.

## [4.1.0] - 2026-01-27

- **Saved Projects**: save, load and export whole projects (the model and
  its parameters) in the browser, with ZIP import and export.
- Gamepad support for the 3D view and the parameters, and configurable
  keyboard shortcuts.
- Security: file paths in the ZIP file tree are escaped (a cross-site
  scripting fix), service worker messages are validated, and ZIP extraction
  rejects path traversal.
- An architecture document with diagrams, a developer quick start, and a
  security testing guide.

## [4.0.0] - 2026-01-22

The first release I called stable. The documentation was rewritten around
accessibility and getting started, and the open source housekeeping (the
contributing guide, third-party notices, licensing) was completed.

- Fixed: a crash when canceling after the worker had stopped, a leak on
  theme changes, crashes on unexpected input during parameter extraction,
  and unescaped file names in the info area.
- The role cards' buttons meet the 44 x 44 px touch target minimum.

## Earlier versions (0.1.0 to 3.1.0)

Released in the project's first ten days, 11 to 20 January 2026.

- **1.0 to 1.10** (January 12 to 14): the first working version, then
  auto-preview, ZIP upload for multi-file projects, dark and high contrast
  modes, more output formats, parameter presets, STL measurements, a
  comparison view and bundled OpenSCAD libraries.
- **2.0 to 2.10** (January 15 to 18): a command-line toolchain and
  templates (later removed), a test suite, an advanced menu, engine loading
  progress, and mobile, accessibility and layout improvements.
- **3.0 and 3.1** (January 19 and 20): deployment on Cloudflare Pages, and
  interface and accessibility improvements.

## Links

- **Repository**: [GitHub](https://github.com/BrennenJohnston/openscad-assistive-forge)
- **Live Demo**: [Cloudflare Pages](https://openscad-assistive-forge.pages.dev/)
- **Documentation**: [docs/](docs)
- **License**: GPL-3.0-or-later

---
