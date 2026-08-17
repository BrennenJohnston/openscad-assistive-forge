# Accessibility claims that need your signature — 2026-08-16

Companion to [the documentation inventory](./2026-08-16-documentation-inventory.md).

Six documents make accessibility claims that the project's own evidence does not
support. I have not changed any of them. Accessibility-critical text is reviewed
by the owner before it changes (D-35), and two of these are formal conformance
documents that people outside the project rely on, so correcting them is a
decision rather than an edit.

Everything below is exact current text, exact proposed text, and the measurement
behind the change. Nothing here is a matter of taste.

---

## 1. The problem in one paragraph

Five documents state that this app has been tested with NVDA, JAWS and
VoiceOver. No two of them agree on which versions or what the result was. The
project's own conformance decisions log — which `docs/README.md` names as the
source of truth — cites only code audits and automated scans, and says outright
that manual AT verification is still *recommended*. The only screen-reader
evidence file that exists is a blank template. Your release ledger records "No
NVDA validation" for every release, under a standing rule that defers human
screen-reader passes until Classic is stable.

So the summary documents claim something their own source of truth does not.

### The evidence, in full

| Where | What it says |
|---|---|
| `docs/vpat/conformance-decisions.md` | Every Evidence cell reads "Code audit", "Code review" or "E2E tests". For 2.1.1 Keyboard and 2.4.3 Focus Order it adds: *"Manual AT verification recommended."* |
| `docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md` | A blank form. `**Date**: YYYY-MM-DD`, `**Tester**: [Your Name]`, every Pass/Fail cell empty, "Tested by: _______" unsigned. |
| `docs/vpat/evidence/m1/validation-summary-2026-02-02.md` line 88 | *"Manual screen reader testing with NVDA+Chrome required for full M1 exit criteria."* |
| `docs/vpat/conformance-decisions.md` lines 121-122 | Names two example evidence files, `m1/nvda-chrome-vectors-2026-03-15.md` and `m2/voiceover-safari-expert-2026-04-01.md`. **Neither exists.** |
| Your release ledger | "No NVDA validation" against R-III, R-IV and every release since. |

---

## 2. `docs/ACCESSIBILITY_CONFORMANCE.md`

### 2a. The manual testing table

**Currently** (lines 143-155):

```markdown
### Manual Testing

The following assistive technology combinations have been tested:

| Screen Reader | Browser | Platform | Result |
|---------------|---------|----------|--------|
| NVDA 2024.4 | Chrome 124 | Windows 11 | Functional |
| NVDA 2024.4 | Firefox 125 | Windows 11 | Functional |
| JAWS 2024 | Chrome 124 | Windows 11 | Functional (textarea editor recommended) |
| JAWS 2024 | Edge 124 | Windows 11 | Functional (textarea editor recommended) |
| VoiceOver | Safari 17 | macOS 14 | Functional |

**Notes**: JAWS users may experience improved navigation with the accessible text
editor option enabled.
```

**Proposed:**

```markdown
### Manual Testing

**No assistive technology testing has been carried out yet.** This is the single
largest gap in this statement and we would rather say so than imply otherwise.

What has been done instead:

- Automated accessibility scanning with axe-core, including the `wcag22aa`
  ruleset, across all four themes, running on every pull request
- Keyboard operation asserted by end-to-end tests: focus order, focus traps,
  Escape handling, arrow-key navigation, and focus return after dialogs close
- Code audit of every WCAG 2.2 A and AA criterion, recorded per criterion in
  conformance-decisions.md
- Touch target sizes asserted against the design tokens

What that cannot tell us is whether the app is *usable* with a screen reader.
Roles and names being present and correct is not the same as a person being able
to get their work done. A structured session plan is ready at
`docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md` and we are looking
for people to run it.
```

**Why:** the table asserts five test sessions. No record of any of them exists,
and the document that is meant to hold those records is a blank form.

### 2b. The verified workflow

**Currently** (lines 157-169): *"The following core workflow has been verified
with assistive technology:"* followed by an eight-step list.

**Proposed:** change the sentence to *"The following core workflow is covered by
the automated keyboard and axe-core suites, and is the workflow the assistive
technology session plan follows:"*. Keep the eight steps — they are the right
steps.

### 2c. The code editor mitigation

**Currently** (lines 70-76):

```markdown
### Code Editor

The CodeMirror 6 code editor has some assistive technology limitations:

- **Mitigation**: Accessible textarea fallback available
- **Mitigation**: User can select preferred editor in Settings
- **Status**: Textarea provides full feature parity for core operations
```

**Proposed:**

```markdown
### Code Editor

The CodeMirror 6 code editor builds its own DOM rather than using a plain text
box, which can interfere with some assistive technology navigation patterns.

- **Mitigation**: a plain `<textarea>` editor is used instead whenever the
  operating system reports a preference for increased contrast
- **Limitation of that mitigation**: it is the *only* way to reach the plain
  editor. There is no in-app setting, so a user who wants it must change an
  operating-system-wide preference to get it
- **Status**: the plain editor covers core editing. Neither editor has been
  tested with a screen reader
```

**Why, MEASURED:** `setPreferredEditor()` exists in `src/js/mode-manager.js`
but its only callers are unit tests. No control for it appears anywhere in
`index.html`. **A mitigation that cannot be reached is not a mitigation**, and
this one is load-bearing for a conformance claim.

### 2d. Two smaller corrections in the same file

- Line 4: `**Version**: 4.4.0` → `4.5.0`, and the date to the day you sign this.
- Line 45: *"**Color contrast**: All text meets 4.5:1 minimum ratio"*. Your
  ledger still carries **D-13** open — the saved-project Delete button measures
  **3.81:1** (white on `#e5484d`), on a destructive control. Proposed: *"Text
  meets the 4.5:1 minimum, with one known exception: the Delete button on
  project cards measures 3.81:1 and is tracked as a defect."*

---

## 3. `docs/vpat/VPAT-2.5-WCAG.md`

This is the formal procurement document, so it needs the most care. It has four
separate problems.

### 3a. It contradicts itself about which version it describes

- Line 7: `**Product Version**: 4.4.0`, line 8: `**Report Date**: 2026-04-06`
- Line 130: `| **Product Version** | 4.3.0 |`, line 132: `| **Report Date** | 2026-03-20 |`

Same document, two versions, two dates. Line 147 also says work is "planned for
v4.3.0" — two releases in the past. The revision history lists version 3.0 above
version 2.0.

**Proposed:** one version (4.5.0), one date, and the stale "planned for v4.3.0"
sentence either updated to what is true or removed.

### 3b. The evaluation methods and the AT table

**Currently** (lines 17-22):

```markdown
### Evaluation Methods

- Automated testing: axe-core, Lighthouse accessibility audit
- Manual testing: Keyboard navigation, screen reader testing
- Assistive technology testing: NVDA, JAWS, VoiceOver
- User testing: Feedback from users with disabilities
```

and (lines 155-164) a table of six AT combinations, all "Full support",
naming NVDA 2025.1, JAWS 2025, VoiceOver on Safari 18 and iOS 18.

**Proposed:**

```markdown
### Evaluation Methods

- Automated testing: axe-core with the wcag22aa ruleset, on every pull request,
  across all four themes; Lighthouse accessibility audit
- Automated keyboard testing: end-to-end assertions covering focus order, focus
  traps, Escape handling and focus return
- Manual code audit against each WCAG 2.2 A and AA criterion
- **Not yet performed**: assistive technology testing, and user testing with
  people with disabilities
```

and replace the AT table with a single line: **"No assistive technology testing
has been performed. See the accessibility conformance statement for what has
been done instead."**

**Why:** this table and the one in `ACCESSIBILITY_CONFORMANCE.md` name different
versions of the same screen readers and report different results, and neither
has a record behind it. Two irreconcilable tables is itself evidence that
neither was written from a session.

### 3c. The preferred-editor line

Line 153: *"**Preferred Editor**: Screen reader users can select textarea editor
in settings"*.

**Proposed:** *"**Plain text editor**: used automatically when the operating
system reports a preference for increased contrast. There is no in-app setting
to select it."* Same reason as 2c.

Line 170 also still says **"Monaco Editor"**, a module deleted on 2026-03-19.
Proposed: "Code editor".

### 3d. Four criteria where it contradicts the decisions log

`docs/README.md` says `conformance-decisions.md` is the source of truth. Where
they differ, the VPAT should follow it.

| Criterion | VPAT says | Decisions log says |
|---|---|---|
| 1.3.5 Identify Input Purpose | Supports | Not Applicable |
| 1.4.12 Text Spacing | Supports | **Not Evaluated** |
| 3.2.6 Consistent Help | Not Applicable | Supports |
| 2.5.8 Target Size | "at least 24×24" | tokens are 44px (36px on compact) |

1.4.12 is the one that matters: claiming "Supports" for a criterion your own log
marks "Not Evaluated" is the same class of problem as the AT table.

---

## 4. `docs/guides/ACCESSIBILITY_GUIDE.md`

**Currently** (lines 141-146):

```markdown
#### Tested Configurations

- **NVDA + Firefox** (Windows): Fully supported
- **JAWS + Chrome/Edge** (Windows): Fully supported
- **VoiceOver + Safari** (macOS/iOS): Fully supported
- **TalkBack + Chrome** (Android): Supported for basic workflows
```

**Proposed:**

```markdown
#### What we have and have not tested

The app is built to work with NVDA, JAWS, VoiceOver and TalkBack, and everything
in this guide is asserted by automated tests — roles, names, focus order, live
region announcements.

**We have not yet sat down with a screen reader and worked through it.** If you
use one and something here is wrong, please tell us; that report is worth more
to this project than another automated scan.
```

**Why:** this is the guide a screen-reader user is sent to. "Fully supported" is
a promise, and a promise made on the strength of automated checks is the wrong
promise for this particular audience.

There is a second gap in the same file: it never mentions that the **Classic**
interface has one fixed light appearance, so dark theme and high contrast are
unavailable there. `ACCESSIBILITY_CONFORMANCE.md` documents that honestly; the
guide someone actually reads does not.

---

## 5. `docs/BROWSER_SUPPORT.md`

**Currently** (lines 104-111): a third AT table — NVDA "Full", JAWS "Full",
VoiceOver "Full", TalkBack "Partial".

**Proposed:** replace with *"The app targets NVDA, JAWS, VoiceOver and TalkBack
on the browsers listed above. No assistive technology testing has been performed
yet — see the accessibility conformance statement."*

The rest of this file has already been corrected in this release (the dead
editor setting, a 404 link, the version header). Only the table is held.

---

## 6. `RELEASE_NOTES.md`

Line 130, inside a past version's section: *"**Screen Reader Testing**: Verified
with NVDA, JAWS, and VoiceOver"*.

This one is different from the others: release notes are a dated record of what
was said at the time, and rewriting history has its own cost. **Two options:**

- **(a)** Leave it, and let the conformance documents carry the correction.
- **(b)** Add a bracketed note — *"[Corrected 2026-08-16: this claim was not
  supported by evidence; no screen-reader testing had been performed.]"*

I lean to **(b)**, because a reader searching the repository for "NVDA" should
not find an uncorrected claim.

---

## 7. `docs/vpat/conformance-decisions.md`

One line only, 1.4.10 Reflow: *"3D preview canvas and Monaco editor may require
horizontal scrolling at very narrow widths."*

**Proposed:** "Monaco editor" → "code editor". The conformance status
(Partially Supports) does not change. Held with the rest only because it lives
in a conformance document.

---

## 8. What I recommend, in one line

Say what is true. The automated coverage on this project is genuinely
substantial — axe-core on every pull request across four themes, a keyboard suite,
a per-criterion code audit — and it is more than most projects of this size do.
It is not screen-reader testing, and an assistive technology product claiming
tests it has not run is a worse position than one that says plainly what it has
and has not checked.

Once you have signed the wording, all six files can be corrected in one change.
