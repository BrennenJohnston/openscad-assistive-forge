# NVDA listening pack

A scripted listening run for this app with NVDA — the verification step
no measurement can perform. Everything in here has been *measured*
correct (probes, the accessibility tree, automated scans); none of it
has been *heard* correct until this run happens. Chrome, NVDA running,
the app at `npm run dev`, a fresh profile or cleared site data so the
first-visit dialog appears.

Budget about an hour now, and it splits cleanly: sections 1 to 6 are the
app as it stood, about half an hour, and sections 7 to 11 are the
picture-to-charm work added in this round, about another half hour. Doing
only one half is a result too, as long as you say which.

Two traps to carry in, learned on a sibling project's runs:

- **Silence is not always a bug.** NVDA suppresses a description that
  merely repeats the accessible name. Check for duplication before
  recording an expected-but-unheard line as a defect.
- **Repetition always is.** Live regions do not de-duplicate; the same
  sentence spoken twice on one action is a real finding.

Record what actually happened in the third column, including the boring
parts — a run that finds nothing is a result.

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
| A disabled tab (Axes, Buttons, 3D Print) speaks its name plus ONE short reason sentence — not the whole paragraph | ☐ | |
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
| Landmarks: a banner (header), navigation, and main are all announced and distinct | ☐ | |
| The heading outline in the elements list reads like the app's real structure (one h1, panels as h2/h3) | ☐ | |
| Finding the parameter list by landmarks/headings alone takes seconds, not wandering | ☐ | |

## 7. Converting a picture (new this round)

Standard mode, a charm design (Q charm, the charm maker, the logo plate or
the stencil maker). Choose a PNG or a JPG for the design file. Nothing is
converted until you ask for it.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Choosing a picture reads it, then says the file's name, its size and "Ready to convert" — and does **not** start converting | ☐ | |
| The quick look's two sentences (what the picture looks like, and about how long converting will take) are findable by browsing, and are not announced over anything | ☐ | |
| "Start conversion" is a real button with that name, and Enter starts it | ☐ | |
| While it runs, the bar is a progress bar named "Converting your picture", and the stage sentence under it changes without announcing each change (DP-32: one action, one announcement) | ☐ | |
| Cancel is reachable by Tab while the bar is up, and pressing it says "Conversion cancelled" once | ☐ | |
| Letting it finish says "Converted: N shapes" once; a one-shape picture says "1 shape", not "1 shapes" | ☐ | |
| When a credit line came off, that is said once with the count, and "Undo" is the next control after the sentence | ☐ | |
| The thin-line advisory reads as a sentence with a real millimetre number in it, not as a warning symbol alone | ☐ | |

## 8. The shapes list in the drawing editor (rebuilt this round)

Open a charm design, give it a drawing, press **Edit Drawing**. Tab into the
shapes panel and walk the rows.

Four things are already known to be true here. They are in the list on
purpose: the question is not whether they exist, it is **how they sound**.

- the list's own name is still "SVG objects", while the panel above it is
  called "Shapes"
- the skip link still says "Skip to the regions table"
- the tint legend under the picture still says "Printed shape" where the row
  control says "Raised"
- a chosen row does not claim `aria-selected`; the choice is spoken as a
  sentence instead, because these rows hold radios and a button and an
  option may not

**The one to listen hardest for, sections 8 to 11.** This editor has its own
polite live region AND writes some of the same sentences to the app's global
announcer. MEASURED in the source: of the sixteen sentences it can say, eight
go into BOTH regions in the same action - deleting shapes, undoing that,
saving a file, the selection sentence, "Combining N shapes.", "Preview ready."
By the second trap at the top of this pack that is a doubled announcement, and
the markup cannot say whether NVDA speaks it once or twice. The
pattern predates this round (2026-03-26); one of the eight is new this round.
**If you hear anything in this editor twice, it is almost certainly this, and
knowing it is real is worth more than the whole rest of the section.**

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| A row reads as its name, then its role, then a group of three radio buttons named Raised, Hole and Ignore | ☐ | |
| Arrow keys inside the role group move between the three and say which is chosen, without leaving the row | ☐ | |
| "More" reads with the row it belongs to ("More for Shape 3"), says collapsed or expanded, and opening it puts the offset box, Layer and Delete in reach | ☐ | |
| Escape shuts an open More menu and leaves the editor open | ☐ | |
| Choosing rows says how many of how many ("3 of 7 shapes selected."), once per change | ☐ | |
| Ctrl and Shift on the rows sound like the count they produce, and clearing says "Nothing selected." | ☐ | |
| "Delete selected" carries the count in its own name once rows are chosen | ☐ | |
| A shape carrying a warning reads the warning beside its name, not after the More button | ☐ | |

## 9. Combining a big drawing (the work left the main thread)

The same editor, with a drawing of a few hundred shapes: the door's
over-budget fixture, or any traced photograph.

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| The sentence under the result pane says how many shapes there are and roughly how long combining will take, in words ("about 9 seconds"), and is findable by browsing | ☐ | |
| "Render preview" is described by that sentence rather than repeating it | ☐ | |
| While it combines, Apply and Save report themselves disabled, and the reason ("Still combining the shapes...") is findable | ☐ | |
| The bar carries the name "Combining N shapes" | ☐ | |
| Cancel says "Combining cancelled" once, and the Render button comes back | ☐ | |
| ★ Cancel is the worst case of the doubling above, and the only one where the two copies are not identical: the press says "Combining cancelled" and the stopped job says "Combining cancelled." with a full stop. Count how many times you hear it | ☐ | |
| Finishing says "Preview ready. It took N seconds." once, and nothing says "Rendering" while it runs | ☐ | |
| Changing a role while it combines does not leave a stale sentence about the role you replaced | ☐ | |
| Four older sentences in this editor still carry an em dash and the old word: "Preview updated — 5 foreground, 2 holes". Say how the em dash sounds and whether "foreground" now jars against "Raised" | ☐ | |

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

Know this going in: the picture became a **mouse and touch** surface this
round, not a keyboard one. The list is the keyboard and screen-reader path
to every shape and still is. So this section asks one question: does the
list still say everything the picture now shows?

| What should happen | Heard it? | What NVDA actually said |
|---|---|---|
| Moving the mouse over the picture marks a row and announces nothing (a hover is not an action) | ☐ | |
| Clicking a shape says the same selection sentence the list says for the same choice | ☐ | |
| With the picture zoomed in, the list still reads the whole drawing: nothing in it depends on what is in view | ☐ | |
| Fit, zoom in and zoom out have names, and work from the keyboard | ☐ | |
| Nothing about the picture is announced twice because both the row and the shape were touched by one action | ☐ | |

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
