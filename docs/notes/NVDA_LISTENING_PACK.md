# NVDA listening pack

A scripted listening run for this app with NVDA — the verification step
no measurement can perform. Everything in here has been *measured*
correct (probes, the accessibility tree, automated scans); none of it
has been *heard* correct until this run happens. Budget about thirty
minutes. Chrome, NVDA running, the app at `npm run dev`, a fresh
profile or cleared site data so the first-visit dialog appears.

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

## What to send back

1. Anything heard **twice** for one action, or heard talking over
   something else.
2. Anything expected and **not** heard — with a note on whether it
   duplicates a nearby label.
3. The one overall verdict measurement cannot give: did the page feel
   navigable, or did you wander?
