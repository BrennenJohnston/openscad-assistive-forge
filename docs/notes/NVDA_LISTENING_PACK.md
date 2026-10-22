# NVDA listening pack

A scripted listening run for this app with NVDA — the verification step
no measurement can perform. Everything in here has been *measured*
correct (probes, the accessibility tree, automated scans); whether it is
*heard* correct is this run's question, and what the last run heard is at
the end. Chrome, NVDA running, the app at `npm run dev`, a fresh profile or
cleared site data so the first-visit dialog appears.

Budget about an hour and a half, and it splits cleanly: sections 1 to 6 are
the core app, about half an hour; sections 7 to 11 are the picture-to-charm
path, about another half hour; sections 12 to 17 are the flows a release walk
repeats, about half an hour; section 18, the Alt View, takes a few minutes
once it is found. Doing only part is a result too, as long as you say which.

Two traps to carry in, learned on a sibling project's runs:

- **Silence is not always a bug.** NVDA suppresses a description that
  merely repeats the accessible name. Check for duplication before
  recording an expected-but-unheard line as a defect.
- **Repetition always is.** Live regions do not de-duplicate; the same
  sentence spoken twice on one action is a real finding.

Record what actually happened in the third column, including the boring
parts — a run that finds nothing is a result.

## Keeping a record

NVDA can write everything it says to its log: in NVDA's settings, General >
Logging level, choose "Input/output". The log is `%TEMP%\nvda.log`, started
fresh each time NVDA starts. From the repository:

```bash
npm run nvda-tail -- --mark
npm run nvda-tail -- "3. Changing a parameter"
```

The first line sets the starting point. Each later call appends what NVDA
said, and the keys it heard, since the last call to `build/nvda-speech.md`
under the step's label, with the time of each line, and prints it (`--out`
picks another file, `--quiet` skips the printing). A sentence spoken twice for
one action shows as two lines a few milliseconds apart.

**Privacy warning:** at this level the log holds every key you press and
everything NVDA reads, including passwords and messages in other windows.
Set the level back to "Info" after the run, and keep the record file out of
anything you share.

## 1. Arrival and the first-visit choice

Open the app fresh. The first-visit dialog should appear.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The dialog announces its title, "Welcome to OpenSCAD Assistive Forge" | ☐ | |
| The four first-time notes are read once as the dialog description (browser storage, the engine download, saving work, clearing site data) — long, but once | ☐ | |
| Arrowing through the two interface screenshots reads each picture's description | ☐ | |
| Choosing an interface speaks the choice and the dialog closes without a trailing announcement | ☐ | |

## 2. Loading a model

Load any example from the welcome screen (or upload a `.scad` file).

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The load is acknowledged once — not once per panel that appears | ☐ | |
| The parameter groups are reachable as collapsed groups with real names | ☐ | |
| The save-project prompt, if it appears, reads its options and closes quietly | ☐ | |

## 3. Changing a parameter (the auto-preview)

Open a parameter group, Tab to a numeric field, change its value, leave
the field.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| **Exactly one** announcement arrives when the preview completes: "Preview ready" | ☐ | |
| "Rendering preview..." is **not** spoken (it shows on the status bar only — this was measured at four spoken repeats per change before the fix) | ☐ | |
| Changing three parameters in a row yields three completions, no stacking, no run-ons | ☐ | |

## 4. The preferences dialog (the reworked descriptions)

Open Preferences. Arrow along the tab strip, including the disabled
tabs; then into the Editor panel's disabled checkboxes.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The disabled 3D Print tab speaks its name plus ONE short reason sentence, not the whole paragraph | ☐ | |
| The full explanation is still on the page when you browse into the panel | ☐ | |
| The disabled "Tab key inserts an indent" checkbox reads its two-sentence reason and stops | ☐ | |
| Crossing the same tab twice sounds tolerable, not like a recording stuck on repeat | ☐ | |

## 5. Generating and downloading

Press the primary Generate/Download action for STL.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The start is acknowledged once: "Generating STL. This may take a moment." | ☐ | |
| The completion is one announcement, and the download control is reachable directly after it | ☐ | |
| An intentionally broken model (delete a semicolon) reports its error once, assertively, and the error text is findable afterwards | ☐ | |

## 6. Navigation as a system

Use NVDA's landmark navigation (`D`), heading navigation (`H`/`1`-`4`),
and the elements list (`NVDA+F7`) rather than Tab.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The skip link is the first Tab stop and actually lands on the app content | ☐ | |
| Landmarks: a banner (header) and main are announced and distinct, and the menu bar reads as "Application menu"; a navigation landmark appears only inside a saved-project folder, for its breadcrumbs | ☐ | |
| The heading outline in the elements list reads like the app's real structure (one h1, panels as h2/h3) | ☐ | |
| Finding the parameter list by landmarks/headings alone takes seconds, not wandering | ☐ | |

## 7. Converting a picture

Standard mode, a charm design (Q charm, the charm maker or the logo plate).
Choose a PNG or a JPG for the design file. Nothing is converted until you
ask for it.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Choosing a picture reads it, then says the file's name, its size and "Ready to convert" — and does **not** start converting | ☐ | |
| The quick look's two sentences (what the picture looks like, and about how long converting will take) are findable by browsing, and are not announced over anything | ☐ | |
| "Start conversion" is a real button with that name, and Enter starts it | ☐ | |
| While it runs, the bar is a progress bar named "Converting your picture", and the stage sentence under it changes without announcing each change (one action, one announcement) | ☐ | |
| Cancel is reachable by Tab while the bar is up, and pressing it says "Conversion canceled" once | ☐ | |
| Letting it finish says "Converted: N shapes" once; a one-shape picture says "1 shape", not "1 shapes" | ☐ | |
| When a credit line came off, that is said once with the count, and "Undo" is the next control after the sentence | ☐ | |
| The thin-line advisory reads as a sentence with a real millimeter number in it, not as a warning symbol alone | ☐ | |
| Choosing a photo says "Looks like a photo. Crop first to the part you want." with the cost sentence after it, and both "Start conversion" and "Crop first" are buttons; "Crop first" reads "Crop first, before converting the picture" | ☐ | |
| The two switches under the modes read as switches named "Smooth the picture first" and "Leave out specks under 0.1 mm²", each with its help sentence as its description, and a change says "Smooth the picture first: on." (or off) once | ☐ | |
| After a camera picture converts, the summary says the size it was worked at ("Worked at 413 px wide, the size a 10.3 mm design can use.") and how many specks were left out, once, with the count | ☐ | |
| A picture that traces into too many shapes says once "This picture traced into N shapes, and the editor can work with 1,000 at a time. Try Solid shape, fewer colors, or a closer crop, then Convert again." and the badge under it reads "Too many shapes to work with (N)" as a status; nothing reaches the charm | ☐ | |
| Cancel pressed while the stage line reads "Preparing the drawing" says "Conversion canceled" once, and the design is as it was | ☐ | |
| Crop first opens the editor with the status "Crop view open on your picture. Four sliders take an edge off; Save crop starts the conversion." and focus on the Top slider; Escape says "Crop canceled. Nothing was converted." once and focus is back on Crop first | ☐ | |

## 8. The shapes list in the drawing editor

Open a charm design, give it a drawing, press **Edit Drawing**. Tab into the
shapes panel and walk the rows.

Three of the four things this section used to warn about are fixed, so
do not go listening for them. What changed, in case you hear
the old words anywhere and want to know they are wrong:

- the list is named **"Shapes"** now, not "SVG objects"
- the skip link says **"Skip to the shapes list"** now, not "Skip to the
  regions table"
- the tint legend under the picture says **On · Cut out · Off** (or **Layer 1 · Layer 2 · Layer 3 · Cut out · Off** where the design has layers), the same
  words as the control on the row - and on a traced picture, where the rows
  say On / Off, the legend says **On · Off** to match

One is unchanged and still worth knowing:

- a chosen row does not claim `aria-selected`; the choice is spoken as a
  sentence instead, because these rows hold radios and a button and an
  option may not

**The one to listen hardest for, sections 8 to 11.** This editor has its own
polite live region AND writes some of the same sentences to the app's global
announcer. MEASURED in the source: of the sixteen sentences it can say, eight
go into BOTH regions in the same action - deleting shapes, undoing that,
saving a file, the selection sentence, "Combining N shapes.", "Preview ready."
By the second trap at the top of this pack that is a doubled announcement, and
the markup cannot say whether NVDA speaks it once or twice. The pattern dates
from 2026-03-26.
**If you hear anything in this editor twice, it is almost certainly this, and
knowing it is real is worth more than the whole rest of the section.**

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| A row reads as its name, then its role, then a group of three radio buttons named On, Cut out and Off | ☐ | |
| Arrow keys inside the role group move between the three and say which is chosen, without leaving the row | ☐ | |
| "More" reads with the row it belongs to ("More for Shape 3"), says collapsed or expanded, and opening it puts the offset box, Layer and Delete in reach | ☐ | |
| Escape shuts an open More menu and leaves the editor open | ☐ | |
| Choosing rows says how many of how many ("3 of 7 shapes selected."), once per change | ☐ | |
| Ctrl and Shift on the rows sound like the count they produce, and clearing says "Nothing selected." | ☐ | |
| "Delete selected" carries the count in its own name once rows are chosen | ☐ | |
| A shape carrying a warning reads the warning beside its name, not after the More button | ☐ | |
| Ctrl+A with the list focused says "All 7 shapes selected." once; Delete removes the chosen rows and says how many | ☐ | |
| The notice above the list reads as a status when it changes: "5 shapes are thinner than 0.5 mm at 12 mm wide and may not print." | ☐ | |
| A too-thin row's description is read after its name and role: "too thin to print", or "too small to trace clearly", or both; the word "thin" beside the name is NOT read a second time | ☐ | |
| "Turn those off" says "5 thin shapes turned off. Each can be turned back on in the list." once, and "Turn those back on" says "Undone. 5 shapes are back to how they were." | ☐ | |
| The layer sentence under the notice ("3 layers, each with its own height on the charm. Every shape starts on layer 1. Choose a layer under More to build a stack.") is findable by browsing and not announced at every change | ☐ | |
| Reopening the editor after Apply says "Drawing editor open, as you left it. N shapes on, M off." once, and Apply reads enabled at once | ☐ | |
| Reset says "Roles, offsets and layers reset." once (on a design without layers, "Roles and offsets reset."), and every Layer select reads Layer 1 after it | ☐ | |
| The Design width box's description reads "The charm sets this from its size. Type a width only to see what would change." after its name and value | ☐ | |
| The Smaller than, Keep largest and Thinner than fields share one description: "Sizes are the box around each shape at the design width, so a long thin line measures big. Thinner than measures each shape's narrowest part." | ☐ | |
| An offset change says "Offset for Shape N updated to 0.05 mm" once, and the box steps by 0.05 | ☐ | |

## 9. Combining a big drawing (it combines by itself now)

The same editor, with a drawing of a few hundred shapes: the door's
over-budget fixture, or any traced photograph. There is no Render preview
button in the drawing view any more: the result combines by itself a third of
a second after the last change, and the sentence under the picture is the
only thing that says so.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| After a change, the sentence under the picture says how many shapes and roughly how long, in words ("Combining 146 shapes, about 2 seconds. Apply is ready when they are combined."), and is findable by browsing rather than announced at every change | ☐ | |
| While it combines, Apply and Save report themselves disabled, and the reason (the same sentence) is findable | ☐ | |
| A second change made while it combines does not leave two sentences, one stale | ☐ | |
| Cancel says "Combining canceled. Change anything to combine again." once | ☐ | |
| Cancel is the worst case of the doubling above, and the only one where the two copies are not identical: the press says its sentence and the stopped job says its own. Say whether you heard one or two, and which | ☐ | |
| Finishing says "Preview ready. It took N seconds." once, and nothing says "Rendering" while it runs | ☐ | |
| Changing a role while it combines does not leave a stale sentence about the role you replaced | ☐ | |
| The editor's own sentences say "raised", not "foreground", and carry no em dash; say if any older wording is still heard | ☐ | |

## 10. Drawing or Charm, and the draft note

The same editor, on a design that has a model behind it. The control is in
the editor's toolbar; through the standalone door it is not there at all,
which is correct — there is no charm to show.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Tabbing to it reads a radio group named "View" with two choices, Drawing and Charm | ☐ | |
| Switching says "Showing the charm." or "Showing the drawing." once | ☐ | |
| "Previews are drawn at draft quality while you edit." is read once and stays findable, rather than being announced again at every change | ☐ | |
| Switching back leaves every role and removal where it was, and nothing is announced as though the drawing had reloaded | ☐ | |
| Closing the editor does not announce the quality change back again | ☐ | |

## 11. The picture itself (mouse, finger, and what a screen reader gets)

Know this going in: the picture is a **mouse and touch** surface, not a
keyboard one. The list is the keyboard and screen-reader path to every shape.
So this section asks one question: does the list say everything the picture
shows?

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Moving the mouse over the picture marks a row and announces nothing (a hover is not an action) | ☐ | |
| Clicking a shape says the same selection sentence the list says for the same choice | ☐ | |
| With the picture zoomed in, the list still reads the whole drawing: nothing in it depends on what is in view | ☐ | |
| Fit, zoom in and zoom out have names, and work from the keyboard | ☐ | |
| Nothing about the picture is announced twice because both the row and the shape were touched by one action | ☐ | |
| Ctrl-click on a second shape says "2 of 7 shapes selected."; Shift-click says the range's count; a click on the background says "Nothing selected." | ☐ | |
| "Crop" in the toolbar has the name "Crop the picture"; pressing it says "Crop view open. Four sliders take an edge off the picture." once and puts focus on the Top slider | ☐ | |
| Each slider reads its label (Top, Bottom, Left, Right), its value in percent, and is described by "How much to take off this edge, as a share of the picture." and by "Keeping 100 % of the width and 50 % of the height." | ☐ | |
| The number box beside a slider reads "Top value in percent, editable", and typing 50 moves the slider and the sentence | ☐ | |
| Save crop: the editor comes back on the result and says "Cropped. N shapes." once; Cancel or Escape says "Crop canceled. Your drawing is unchanged." and puts focus back on Crop | ☐ | |
| After a crop, "Undo crop" is in the toolbar; pressing it says "Crop undone. N shapes." once, and the button goes away | ☐ | |
| The charm view's "Render preview" says "Rendering the charm with the drawing as it is now." once, and the note under the charm says which drawing it shows | ☐ | |

## 12. The two tours

Start the Main Page Tour from the Main Page, then Getting Started from the
simple box's Start Tutorial.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The tour opens with focus on Next or on the step's text, not on "Minimize tutorial" | ☐ | |
| Each step's title and its explanation are read when the step appears, once each, and the step number once | ☐ | |
| After Next, focus is in the tour panel, not on the page body | ☐ | |
| The Exit button's name and its description are not the same words twice | ☐ | |
| Getting Started, "Adjust a parameter": typing a value in Width and pressing Tab makes Next available | ☐ | |
| On the last step the button's spoken name says Finish, as its text does | ☐ | |
| Finishing says one sentence, and focus goes back to the button that started the tour | ☐ | |

## 13. Dialogs from the Help menu

Open About, the Features Guide, Keyboard Shortcuts (the Keys dialog) and
Library info, each from the Help menu.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Opening reads the dialog's name, then what has focus inside it. When focus lands on a selected tab or radio (the Features Guide, the welcome dialog), NVDA itself says the dialog's name a second time; that is NVDA's, not the page's | ☐ | |
| The Features Guide's tab strip reads as tabs with names and positions ("Libraries, tab, selected, 1 of 6") | ☐ | |
| Escape, or the dialog's own close button, closes it and puts focus back on the Help menu button. With focus on a tab NVDA is in focus mode, and takes the first Escape to leave it; the dialog closes on the second | ☐ | |

## 14. Deleting a preset

Save a preset, then delete it from the Presets panel. Save another and delete
it from Import / Export.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The question reads its title, "Delete Preset", then `Delete the preset "<name>"? This cannot be undone.`, with no markup words in it | ☐ | |
| Cancel leaves the preset where it was and puts focus back on the control that asked | ☐ | |
| After Delete, focus is on the preset list, not the page body; from Import / Export, focus stays in that dialog | ☐ | |

## 15. The braille preview

The Braille Sign, the Braille Card and the Braille Charm: type a short text
and let it translate.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Each line of the braille preview reads its number and its braille, with no language name ("und") before the cells | ☐ | |
| "Translate to braille" reports its result once, and the whole Customizer panel is not read out again | ☐ | |

## 16. The words on the controls

Tab along the header, open Presets in the Customizer, open Keys, then switch
to Classic and Tab to its top right.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Each header button is named by the word on it, first: "Keys: keyboard and controller", "HC: high contrast" (a toggle, pressed or not), "Theme: Auto" (or Light, or Dark), "Full Screen: the preview alone" (a toggle), "Help: features guide and examples" | ☐ | |
| The interface switch reads "Interface mode: Simplified, Standard, switch", on or off | ☐ | |
| "Main Page, button" says nothing about unsaved changes until a value has changed; then "Main Page. Unsaved changes will be lost." | ☐ | |
| Copy Link, in Presets, leads with its words: "Copy Link" | ☐ | |
| In Keys, a key button reads its key ("F6"), then "Change shortcut for ..." as its description | ☐ | |
| A saved project's card buttons name the project: "Load {name}", "Edit {name}", "Delete {name}" | ☐ | |
| In Classic, "A. Forge, button" is described by "Switch to the Assistive Forge interface", with no "pressed"; a pane separator says its real share ("Editor: 26%"), never "0%"; the Font List radios say their style ("Liberation Sans Bold") | ☐ | |

## 17. The questions the app asks

Open a few of the app's questions: come back with a draft kept (the question
on arrival), New Folder and Rename Folder in Project Files, Delete on a
project file, Copy Link with the clipboard refused, Remove on a companion
file, Delete on a grid preset. Each is the app's own dialog; the browser's
box, with the site's address in its title, is never heard.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| A question reads its title, then its message, then the focused button, each once: "Restore a saved draft?", `A draft of "simple_box.scad" from <date> is kept in this browser. Restore it, or discard it?`, "Restore draft, button" | ☐ | |
| A question that deletes or removes opens on Cancel: "Delete File", `Delete "helpers.scad"? This cannot be undone.`, "Cancel, button"; Tab reaches Delete | ☐ | |
| A question that asks for a name opens in its field: New Folder reads "Folder name, edit, blank"; Rename Folder reads the field with the current name selected, so typing replaces it | ☐ | |
| Copy by hand (the browser refused the clipboard) reads its sentence, then the link, selected, in a read-only field | ☐ | |
| Escape, or Cancel, closes the question and puts focus back on the control that asked (Rename, Copy Link, the Companion Files heading), with no announcement | ☐ | |
| After the answer, what happened is said once: "Draft restored", `Created folder "docs"`, `Deleted file "helpers.scad"`, "Removed file: walk-note.txt" | ☐ | |

## 18. The Alt View

With the Alt View found (its key appears next to the theme button), open
the simple box. The status line under the preview is not live, so what it
shows is never spoken.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| When the key appears: "A key appeared next to the theme button." once, about 4 s after the last press when sounds are on (it waits for a short tune), or at once with Preferences > Advanced > Play sounds off | ☐ | |
| Found a second time, with the key showing: "Something cracked around the key." once, about 3.5 s after the last press when sounds are on (it waits for a short melody), or at once with sounds off | ☐ | |
| Found a second time on a later visit, before the key shows: "A key appeared next to the theme button. Something cracked around the key." once, as one sentence | ☐ | |
| Found a third time: "The key is here to stay." once, about 4 s after the last press when sounds are on (after a short fanfare), or at once with sounds off; found with the Alt View on, it waits until the key turns the look off, after "Alt View off." | ☐ | |
| After a reload the key is there and nothing is said about it | ☐ | |
| The key reads "Alt View, toggle button, not pressed"; pressing it says "Alt View on. The preview is drawn with characters and the interface follows." then "pressed"; again, "Alt View off." | ☐ | |
| At the left of the Generate button's row, under the preview, "Expand Lens controls" (beside the heading "Lens") opens the Lens drawer; Tab goes through Edges, Focus, Glow and Surfaces with their values, each followed by its reset button, "Reset Edges to its starting value, button"; Surfaces with its description; Escape closes the drawer and returns to the button, now "Collapse Lens controls" no longer | ☐ | |
| "Edges" groups the toggle buttons Soft, Normal and Sharp; a press says "Edges 70%" (or 100%, 160%), once | ☐ | |
| In focus mode, the minus and equals keys step Focus and say the size, once | ☐ | |
| The sounds button, just before the key, reads "Sounds, toggle button, pressed"; a press turns the sounds off and it says "not pressed" | ☐ | |
| Under 40% the Focus slider's value reads "Vector lines, 35%" (at 40% and over, "40%"); the Surfaces slider reads its value and then "Below 40% Focus: how solid the faces under the lines are." | ☐ | |
| In Classic, the 3D view toolbar's "Lens settings" button moves to the "Lens" grouping, "Edges, slider, 140%"; the grouping is heard once while Tab goes through its sliders and their reset buttons (three sliders while Focus is under 40%: Glow draws nothing in the lines and leaves the group; four from 40%); in the Simplified view the same group sits at the foot of the Customizer | ☐ | |
| A reset button's press says the slider's new value once, "Edges 90%" (in Classic "Edges 140%"); Focus under 40% says "Vector lines, 10%"; nothing is said twice | ☐ | |
| Each look keeps its own Lens: turn the look on in the Forge interface (Edges 90%, Focus 65%, Glow 50%; on a phone Focus 45%), switch to Classic (Edges 140%, Focus 10%, Glow 10%) and back, and each look reads its own values again; after a reload both are kept. The status line under the preview shows them ("[ALT VIEW] EDGE 90% · FOCUS 65% · GLOW 50%", in Classic "EDGE 140% · LINES 10% · GLOW 10%") and is not spoken | ☐ | |
| The pan D-pad's center reads "Adjust the Alt View with the pan arrows"; on, it says "Pan arrows now adjust the Alt View: up and down for edges, left and right for focus, Shift with up and down for glow."; each arrow says one value ("Edges 95%", "Focus 60%", "Glow 20%"); off, "Pan arrows move the view again." | ☐ | |

## 19. Keys and the controller

Open Keys from the header and arrow to its Controller tab. With a controller
connected, press Start the test and press a few buttons, B among them. Then
open Preferences, choose its Controller tab and press Open the controller
settings.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Opening reads "Keys, dialog", then "Keyboard, tab, selected, 1 of 2" | ☐ | |
| Right Arrow reads "Controller, tab, selected, 2 of 2"; Left, Home and End move the same way, wrapping at the ends | ☐ | |
| Start the test says "Test started. Press a button on your controller."; each press is said once, for example "Pressed: B [1]."; B does not close the dialog while the test runs | ☐ | |
| The test ends after 10 seconds without a press, or with Escape or Stop the test, says "Test stopped." and leaves the dialog open | ☐ | |
| Open the controller settings closes Preferences and lands on "Controller, tab, selected, 2 of 2" in Keys; Escape then goes back to where Preferences was opened from | ☐ | |

## 20. The phone's sheets

On a phone held upright (or a window under 768 px wide), open the simple box
in Standard.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The Customizer button at the head of the Preview Settings row reads "Customizer panel, button, collapsed"; Enter says "expanded" and lands at the parameters; Escape in the panel comes back to the same button and says "collapsed"; no control named "Close customizer panel" is met | ☐ | |
| With Preview Settings & Info open, the grip on the sheet's bottom edge reads "Resize the Preview Settings" with its value, "Preview Settings 40% of the screen's height"; Down Arrow says the new value (42%), Shift+Down 5% more; Escape on it closes the sheet and comes back to the settings arrow | ☐ | |

## The last run

2026-10-12, on the release candidate for 5.4.0, a scripted run: NVDA 2026.2
logging at Input/output, a headed Chromium at 1920 by 889, each step cut
from the log with `nvda-tail`. Sections 1 to 6, 12 to 14, 16 and 17 were
heard on the flows the release changed; sections 7 to 11 were heard this
time, on a small line drawing and the clip charm; section 15 on the same
day.

- Sections 3 and 5: "Preview ready" once per change; "Console copied" once
  after Copy.
- Section 7: a small picture converts as soon as it is chosen, "Converting
  test-image.png" as a dialog with its Cancel button, then "Converted: 1
  shape" once.
- Section 8: the list reads "Shapes" with its help sentence, a row as "Role
  for Path 1" with its three radios ("On, radio button, checked, 1 of 3"),
  a role change says "Preview updated: 1 on, 0 cut out." once; "More for
  Path 1" says expanded and collapsed.
- Sections 8 to 11, the doubling the warning above describes is real: Ctrl+A
  said "All 1 shape selected." twice, the View radios said "Showing the
  charm." and "Showing the drawing." twice each, and Crop said "Crop view
  open. Four sliders take an edge off the picture." twice, each pair word for
  word and under half a second apart. Nothing else in the editor doubled.
- Section 11: the Top slider reads its value and both description sentences.
- Section 15: the braille cells read without "und".
- Section 17: every question read its title, message and focused button once;
  Escape put focus back on the control that asked.

## What to send back

1. Anything heard **twice** for one action, or heard talking over
   something else.
2. Anything expected and **not** heard — with a note on whether it
   duplicates a nearby label.
3. Whether the words you HEAR match the words on the SCREEN. Three known
   mismatches are listed at the head of section 8; there may be more, and
   an unlisted one is worth more than the three already written down.
4. The one overall verdict measurement cannot give: did the page feel
   navigable, or did you wander?
