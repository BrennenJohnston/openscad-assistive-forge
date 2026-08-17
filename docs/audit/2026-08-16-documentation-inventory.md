# Documentation inventory — 2026-08-16

This is the inventory half of release UF-30 ("Documentation tells the truth").
Nothing has been moved, deleted or rewritten to produce it. It is a list of
every Markdown file the repository tracks, what I found when I read it, and
what I think should happen to it.

The order it was asked for was: *"All documentation needs to be reviewed. there
are many outdated code sections like the AI bloat script that needs to be
archived along with any obsolete AI coding work arounds that are no longer
serving a function within our program. All specs and guides and info in general
needs a review and rewrite if necessary."*

That is three separate jobs, and this document keeps them separate:

1. Archive the AI bloat scanner — settled, evidence in section 3.
2. Sweep for other obsolete AI-era leftovers — section 7.
3. Review the whole documentation surface for accuracy — sections 4 to 6.

---

## 1. How to read a disposition

Every file gets exactly one of these:

| Disposition | Meaning |
|---|---|
| **ACCURATE-KEEP** | I checked its claims and they hold. Leave it alone. |
| **DATED RECORD** | It describes what was true on a stated date and says so. A record cannot go stale; it can only be superseded. Leave it alone. |
| **STALE-REWRITE** | It tells the reader something that is not true today. What is wrong is named. |
| **OBSOLETE-ARCHIVE** | It no longer serves a function. Evidence that nothing depends on it is given. |

Where I write **MEASURED**, I ran the command or read the code myself and the
evidence is quoted. Where I write **UNVERIFIED**, I could not settle it cheaply
and I am not asserting either way.

## 2. How much of each file I read

- **Read end to end:** every file users are pointed at (the guides, the docs
  index, both READMEs), every operational doc under `docs/`, the specs, the
  accessibility and VPAT documents, and everything in `docs/plans/`.
- **Header plus targeted search:** the dated audit, notes and research records.
  For those the only question worth asking is "is this a record of a date, or
  is it a live instruction someone might follow?" — and the header answers it.
  Where a header revealed a problem, I opened the file.

## 3. What was measured, at commit c384d2e

The bloat scanner, run at this HEAD:

```text
Scanning 136 file(s)...

AI Bloat Scan Results
=====================
  Files scanned: 136
  Blocking:      0
  Warning:       0
  Info:          0

  No AI bloat patterns detected.

PASSED: No AI bloat patterns detected.
```

So the premise behind the order holds by measurement: the scanner is a gate
that cannot fail. It is wired in exactly three places (`package.json:50`,
the "Scan for AI code bloat" step in `.github/workflows/test.yml`, and
`pixi.toml:58`) and mentioned in four documents, two of which are dated
records and two of which are themselves being archived.

The documentation surface:

| Where | Tracked `.md` files |
|---|---|
| `docs/` | 112 |
| Repository root | 10 |
| `.github/` | 6 |
| `scripts/` | 1 |
| `public/` | 4 |
| **Total tracked** | **133** |

Two further files exist on disk under `docs/planning/` but are deliberately
ignored by git (`.gitignore`: "Internal planning documents (not for public
release)"), so the earlier count of 114 under `docs/` is 112 once you count
only what is actually published. They are listed at the end for completeness
and are not part of this review.

Markdown linting at this HEAD reports **3 issues in 1 file**, and that file is
`.cursor/plans/v4.2.0_pre-release_audit_6246a847.validation.md`, which git
ignores and CI therefore never checks out. Against tracked files the gate is
clean, and it must stay clean.

---

## 4. The nine findings that cut across many files

These are the things worth your attention. The file-by-file table in section 8
just says where each one lands.

### F1. The documents disagree with each other about screen-reader testing, and the evidence folder says it never happened

This is the most serious thing in the set, because it is the claim a
procurement officer or an accessibility reviewer would rely on.

Five documents state that assistive technology testing was performed, and no
two of them agree:

| Document | What it claims |
|---|---|
| `docs/ACCESSIBILITY_CONFORMANCE.md:147-153` | A table: NVDA 2024.4, JAWS 2024, VoiceOver/Safari 17 — result "Functional" |
| `docs/vpat/VPAT-2.5-WCAG.md:157-164` | A different table: NVDA 2025.1, JAWS 2025, VoiceOver/Safari 18 and iOS 18 — result "Full support" |
| `docs/BROWSER_SUPPORT.md:106-111` | A third table: NVDA / JAWS / VoiceOver "Full", TalkBack "Partial" |
| `docs/guides/ACCESSIBILITY_GUIDE.md:141-146` | A fourth list: all three "Fully supported" |
| `RELEASE_NOTES.md:130` | "Screen Reader Testing: Verified with NVDA, JAWS, and VoiceOver" |

`docs/ACCESSIBILITY_CONFORMANCE.md:157-169` goes further and says an eight-step
core workflow "has been verified with assistive technology".

Against that, MEASURED:

- `docs/vpat/conformance-decisions.md` — which `docs/README.md:52` names as the
  source of truth — cites **"Code audit"**, **"Code review"** or **"E2E tests"**
  in every single Evidence cell, and for 2.1.1 Keyboard and 2.4.3 Focus Order it
  says in as many words: *"Manual AT verification recommended."* Its own change
  log contains only code audits.
- The only NVDA evidence file that exists, `docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md`,
  is a blank template: `**Date**: YYYY-MM-DD`, `**Tester**: [Your Name]`, every
  Pass/Fail cell empty, and an unsigned "Tested by: _______" line at the bottom.
- `docs/vpat/evidence/m1/validation-summary-2026-02-02.md:88` says
  *"Manual screen reader testing with NVDA+Chrome required for full M1 exit
  criteria."*
- `docs/vpat/conformance-decisions.md:121-122` gives two example evidence
  filenames, `m1/nvda-chrome-vectors-2026-03-15.md` and
  `m2/voiceover-safari-expert-2026-04-01.md`. **Neither file exists.**
- Your own project ledger records "No NVDA validation" against R-III, R-IV and
  every release since, and carries a standing rule deferring human screen-reader
  passes until Classic is stable.

I am not rewriting any of this. Four of those five documents are
accessibility-critical text (D-35), two of them are formal conformance
documents that people outside the project act on, and correcting a conformance
claim is your decision, not mine. Section 6 asks you what to do.

### F2. Four documents advertise a command-line tool that was deleted

The CLI was removed on **2026-08-04** in commit `4704a85`
("chore: remove the CLI scaffolding tool; clear all high-severity audit
findings"). MEASURED at this HEAD: `package.json` has **no `bin` field**, there
is no `bin/` or `cli/` directory, and no tracked file is named
`openscad-forge`. Running the documented commands gives you a package with no
command and then "command not found".

Still advertising it:

- `README.md:88-95` — a whole section headed "CLI (developer toolchain)" with
  `npm install -g .` and `openscad-forge --help`. This is the repository's front
  page.
- `PROJECT_STATUS.md:14` — "The CLI is included for developers who want to
  scaffold standalone customizers."
- `docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md:32,52` — offers "a toolchain: CLI
  workflows to extract parameters, scaffold apps (multiple templates)" as the
  main reason to choose this project over the official OpenSCAD Playground. The
  headline differentiator does not exist.
- `docs/specs/PARAMETER_SCHEMA_SPEC.md:9` — "Usage in v2 (CLI Toolchain): The
  `forge extract` command generates `params.schema.json` files following this
  specification."
- `docs/ARCHITECTURE.md:403-430` — a "CLI tool" section with a diagram of seven
  commands and five framework templates, none of which exist.
- `docs/guides/MANIFEST_SHARING_GUIDE.md:232-247` — "CLI Quickstart", telling a
  user to run `npx openscad-forge manifest ...`. This is a user-facing
  instruction that cannot work.
- `docs/OPEN_SOURCE_PROJECTS.md:71-81` — lists Chalk and Commander as runtime
  dependencies. MEASURED: neither is in `package.json` at all; both went with
  the CLI. Neither was in `THIRD_PARTY_NOTICES.md`, so the licence record is
  unaffected.

**A correction to my own first pass.** The last three of those were found by a
grep sweep *after* I had written the table below, and two of them —
`ARCHITECTURE.md` and `MANIFEST_SHARING_GUIDE.md` — I had first marked
ACCURATE-KEEP on the strength of reading them for structure and tone. Reading a
long document for quality is not the same as searching it for a specific dead
name. Their rows are corrected.

### F3. Several documents send users to a Settings control that does not exist, for an editor that was deleted

`src/js/monaco-editor.js` was deleted on **2026-03-19** (commit `41a3619`).
MEASURED: **zero** references to Monaco remain anywhere in `src/` or
`index.html`, apart from one historical note in a comment. The editor is chosen
by `ModeManager.resolveEditorType()`, whose only values are `codemirror`,
`textarea` and automatic.

MEASURED further: `setPreferredEditor()` exists in `src/js/mode-manager.js:131`
but **its only callers are unit tests**. There is no "Editor Preference"
control, no "Use accessible text editor" checkbox, and no gear icon opening
one, anywhere in `index.html`.

So these instructions cannot be followed:

- `docs/guides/EXPERT_MODE_GUIDE.md:69-93` — a table offering "Monaco" or
  "Textarea", then "Open **Settings** (gear icon) → Editor Preference → Choose
  Monaco, Textarea, or Auto", then a "Monaco Editor Features" section.
- `docs/guides/EXPERT_MODE_GUIDE.md:470-476` — "If Monaco fails to load: check
  your internet connection (Monaco loads from CDN)". Nothing loads from a CDN;
  the Content Security Policy would refuse it.
- `docs/guides/TROUBLESHOOTING_USER_GUIDE.md:204,207,226` — the same advice.
- `docs/KNOWN_ISSUES.md:40` — "Enable 'Use accessible text editor' in Settings".
- `docs/BROWSER_SUPPORT.md:115-119` — "If you experience issues with the Monaco
  code editor... Open Settings (gear icon), Enable 'Use accessible text editor'".

This one matters more than the others because of where it lands. Both
`docs/ACCESSIBILITY_CONFORMANCE.md:70-76` and `docs/vpat/VPAT-2.5-WCAG.md:153,170`
offer that same setting as the **mitigation** for the code editor's assistive
technology limitations. A mitigation that does not exist is a conformance claim
resting on nothing. Flagged, not fixed — see section 6.

### F4. The published file-size limit is wrong by a factor of twelve

MEASURED in `src/js/validation-constants.js`:

```javascript
SCAD_FILE: 5 * 1024 * 1024,     // 5MB for individual .scad files
ZIP_FILE: 250 * 1024 * 1024,    // 250MB for .zip archives
STL_VIEW_FILE: 250 * 1024 * 1024,
```

Two user guides tell people the ZIP limit is 20 MB:

- `docs/guides/TROUBLESHOOTING_USER_GUIDE.md:25` — "Maximum 5 MB for single
  files, 20 MB for ZIP"
- `docs/guides/STANDARD_MODE_GUIDE.md:286-287` — "ZIP archives: 20 MB maximum"

The 5 MB figure is right. The ZIP figure is wrong, and it is wrong in the
direction that costs a clinician a working session: someone with a 40 MB
keyguard project reads that and concludes the app cannot take their file.
Neither guide mentions folder import at all, which has its own published caps
(2,000 files, 500 MB).

### F5. Two developer documents describe a setup step that does something else

MEASURED: `public/wasm/` contains `openscad-official/openscad.js`,
`openscad-official/openscad.wasm`, `INTEGRITY.json` and the source zip — all
tracked in git. There is no `openscad.worker.js`. `scripts/README.md:7` states
this correctly and says `setup-wasm` downloads **Liberation fonts**.

Contradicting it:

- `docs/TROUBLESHOOTING.md:39-43` — tells you to run `npm run setup-wasm` to fix
  missing WASM, then `ls public/wasm/` and expect
  "openscad.wasm, openscad.js, openscad.worker.js". Two of those three are one
  directory down and the third does not exist.
- `docs/DEV_QUICK_START.md:13` — "`npm run setup-wasm` # downloads OpenSCAD WASM
  (~15-30MB)". It downloads fonts, about 2 MB.

`docs/DEPLOYMENT.md` repeats the "~15-30 MB WASM files" figure; the actual
binary is 10.7 MB.

### F6. Three GitHub links point at the wrong organisation

MEASURED — these 404:

- `docs/BROWSER_SUPPORT.md:148`
- `docs/KNOWN_ISSUES.md:215`
- `docs/KNOWN_ISSUES.md:221`

All three use `github.com/openscad/openscad-assistive-forge`. The repository is
`github.com/BrennenJohnston/openscad-assistive-forge`. `KNOWN_ISSUES.md:3` gets
it right, so the file disagrees with itself. Every other link I opened in the
touched set resolves.

### F7. Version numbers have drifted apart, and one document contradicts itself

`package.json` says **4.5.0**. `PROJECT_STATUS.md` is the only document that
agrees.

| Document | Says |
|---|---|
| `docs/ACCESSIBILITY_CONFORMANCE.md:4` | 4.4.0 |
| `docs/vpat/VPAT-2.5-WCAG.md:7` | 4.4.0 |
| `docs/vpat/VPAT-2.5-WCAG.md:130` | 4.3.0 — *in the same document* |
| `docs/BROWSER_SUPPORT.md:3` | 4.3.0 |
| `docs/ROLLBACK_RUNBOOK.md:3` | 4.3.0 |
| `docs/PERFORMANCE.md:7` | 4.3.0 |

The VPAT contradicts itself twice over: its header says version 4.4.0 dated
2026-04-06, and its own "Report Information" table says version 4.3.0 dated
2026-03-20. It also carries a note (line 147) saying work is "planned for
v4.3.0" — two releases in the past — and its revision history lists version 3.0
above version 2.0.

The VPAT and `conformance-decisions.md` also disagree on four criteria
outright: 1.3.5, 1.4.12, 3.2.6 and the evidence basis for most of the rest.
1.4.12 Text Spacing is "Supports" in the VPAT and "Not Evaluated" in the
decisions log.

### F8. Counts and figures quoted as current are old

None of these is dangerous on its own; together they are why the docs read as
untrustworthy.

- `docs/TESTING.md:114` — "all unit tests pass (1982+)". The suite is at
  **3,957** tests across 108 files.
- `PROJECT_STATUS.md:23` — "3,426 unit tests". Same.
- `docs/TESTING.md:120` — "Bundle size is within the 153KB gzipped budget". The
  budget in `scripts/check-bundle-budget.js` is **500 KB** for the core app and
  150 KB for the second chunk; 153 KB was a measured value years of releases
  ago, not the budget.
- `docs/PERFORMANCE.md:137` and `docs/research/WASM_THREADING_ANALYSIS.md` both
  analyse `openscad-wasm-prebuilt@1.2.0`. `public/wasm/README.txt` says that
  package was **replaced** by the official 2026.04.03 Manifold build, and names
  the reason. Their conclusion about threading may still hold, but it was
  reached about a different binary.
- `docs/KNOWN_ISSUES.md:5` — "Last updated: 2026-07-05". Nothing from the last
  five weeks of work is in it.
- `docs/RENDER_TRIGGER_MAP.md` — "Last audited: 2026-03-03", and it names itself
  the ground truth for BUG-B and BUG-C, both of which `KNOWN_ISSUES.md` records
  as resolved.
- `docs/guides/SECURITY_TESTING.md:3` — "Recent fixes (2026-01-27)".

### F9. Documents that describe a version of the app that no longer exists

- `docs/guides/WELCOME_SCREEN.md` lists six role cards. MEASURED: `index.html`
  has **ten** — Welcome Page Tour, Beginners Start Here, Charm Customizer,
  Braille Card Customizer, Explore Features, and then the six it lists. Its
  opening sentence also says "the main entry point is a single 'Getting Started'
  tutorial", which contradicts its own body.
- `docs/guides/GETTING_STARTED.md:19-24` tells a first-time user to "look for
  the Welcome Panel in the centre of the screen". MEASURED: the first thing a
  first-time user actually meets is `#first-visit-modal` — a full-screen dialog
  asking whether they want the Assistive Forge or the Classic interface. **No
  user guide describes it.** The Classic interface is the whole subject of the
  last five releases and `docs/README.md` does not link its guide.
- `docs/design-d1-preset-companion-files.md:3` — "Status: Design approved, not
  yet implemented." MEASURED: `applyCompanionAliases` (`zip-handler.js:881`),
  `buildPresetCompanionMap` (`file-handler.js:31`) and 22 further
  `presetCompanion` references are live. It was implemented, and a bug in that
  exact code was KI-012's root cause.
- `docs/specs/CAMERA_CONTROLS_ACCESSIBILITY.md` documents `#cameraControlsBody`,
  `.camera-control-btn` and a "Panel position (bottom-right, bottom-left,
  top-right, top-left)" preference. MEASURED: those selectors appear in CSS and
  JavaScript but **not once in `index.html`**. This is the dead floating-camera
  fallback that UF-26 measured and reported: `setupCameraControls()` returns
  early because `#cameraPanel` and `#cameraDrawer` both exist, so everything
  after those guards is unreachable. The spec documents unreachable code as if
  it were the shipped control.
- `docs/guides/EXPERT_MODE_GUIDE.md:105-137` — three of sixteen keyboard rows
  are wrong. MEASURED against the installed CodeMirror keymaps:

  | Guide says | Installed binding | Verdict |
  |---|---|---|
  | `Ctrl+G` go to line | `Mod-g` is **find next**; go to line is `Mod-Alt-g` | wrong |
  | `Ctrl+H` replace | **no `Mod-h` binding exists**; replace lives inside the find panel | wrong |
  | `Ctrl+Shift+D` duplicate line | duplicate is `Shift-Alt-ArrowDown` | wrong |
  | `Ctrl+Shift+K` delete line | `Shift-Mod-k` | correct |
  | `Alt+Up` / `Alt+Down` move line | `Alt-ArrowUp` / `Alt-ArrowDown` | correct |
  | `Ctrl+F`, `Ctrl+Home`, `Ctrl+End`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Enter`, `Ctrl+S` | all present | correct |

  `Ctrl+Shift+Z` for redo is bound on Linux and macOS but not on Windows, where
  `Ctrl+Y` is the binding.
- `docs/ACCESSIBILITY_CONFORMANCE.md:45` — "All text meets 4.5:1 minimum ratio".
  Your ledger still carries D-13 open: the saved-project Delete button measures
  3.81:1.

---

## 5. What I checked and found genuinely accurate

Worth saying, because it is most of the recent work and it sets the standard
for the rewrites:

- `docs/guides/LIBRARIES_GUIDE.md` — every claim checked; the four bundled
  libraries, the auto-switch-on behaviour, the desktop comparison table and the
  2026.01.03 geometry check all hold.
- `docs/guides/CLASSIC_UI_GUIDE.md` — accurate, including the light-only
  appearance and the Preferences tab list.
- `docs/guides/RUN_OFFLINE_GUIDE.md` — accurate and genuinely useful; the
  group-policy JSON and both browser paths check out.
- `docs/specs/UI_STANDARDS.md` — I spot-checked ten tokens against
  `src/styles/variables.css` and all ten match exactly. One nit: the deprecated
  alias row says `--radius-sm` is 6px; it is defined as
  `var(--border-radius-sm)`, which is 4px.
- `docs/RESPONSIVE_UI.md` — all four breakpoints match `variables.css`
  (480 / 768 / 1024 / 1440).
- `docs/guides/STANDARD_MODE_GUIDE.md` export table — matches the shipped
  output select exactly, including 3MF marked unavailable. The Export Quality
  section, which was previously wrong, now reads correctly.
- `docs/vpat/conformance-decisions.md` — honest throughout about resting on code
  audit rather than AT testing. It is the document the others should have
  followed.
- `CONTRIBUTING.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` — accurate; every command named exists in
  `package.json`.

Two corrections to your ledger while I was checking.

**D-16, partly closed.** The ledger records that "the output-format select still
offers 3MF and will still fail there". MEASURED at this HEAD: the select's 3MF
option now carries `disabled`.

**D-1 is closed.** The ledger still lists it open — "its Disable Auto-Preview
and Reduce Quality buttons only `console.log`". MEASURED at this HEAD, both have
real handlers: `#memoryBannerReduceFn` calls `setExportQualityMode('low')` and
drops preview quality (with a comment recording that dispatching a `change`
event there started four renders, which is the opposite of what the banner
wants), and `#memoryBannerDisableAuto` unchecks `#autoPreviewToggle` and fires
its change event. I had written this file's row for
`TROUBLESHOOTING_USER_GUIDE.md` on the strength of the ledger rather than my own
reading, and it was wrong; the guide's advice to press those buttons is sound.

---

## 6. What I need you to decide

### Q-62 riders — three new archive candidates the sweep found

Your Q-62 signature covered the two named executor prompts. These three were
deliberately left unsigned because you had not read them. Here is the evidence.

| File | Bytes | Evidence | My recommendation |
|---|---|---|---|
| `docs/plans/lighting-visual-parity.plan.md` | 36,837 | All five phases carry `status: completed` in its own front matter. Zero inbound references from any tracked file. Its "Playbook basis" section points at five files under `ai-at-playbook/`, which is not in this repository. | **Archive** |
| `docs/plans/qa_parity_fix_plan_validation_report.md` | 6,427 | Validates a plan file at `C:\Users\WATAP\.cursor\plans\qa_parity_fix_plan_84e638ba.plan.md` — a path outside the repository, in a git-ignored folder. Zero inbound references. Same family as the two you already signed. | **Archive** |
| `docs/plans/lwfl-csg-bypass-test-protocol.md` | 3,321 | **Do not archive.** See below. | **Keep, with a status line** |

On the third one, which your signature specifically told me to check before
proposing anything: it belongs to the **live** keyguard workstream. MEASURED —
all three debug hooks it documents are live in the app right now
(`toggleCsgBypass` at `main.js:16128`, `exportScadSource` at `main.js:16225`,
`dumpRenderArgs` at `main.js:16266`), and the untracked capture
`docs/audit/lwfl-parity-reproduction/lwfl-parity-results.json`, taken on
2026-08-16, re-investigates the exact two parameters this protocol is written
around (`expose_home_button`, `expose_upper_message_bar`). Its only fault is a
framing line: it presents "CSG colour injection is the root cause" as an open
hypothesis, when KI-012's findings report settled the original bugs on a
different cause four months ago. That is a status line to add, not a reason to
archive.

A fourth group, which I am raising rather than recommending: four files under
`docs/audit/ki-012-investigation/` are **empty result templates for tests that
were never run**, on an issue that was resolved by a different route.
`playground-comparison-results.md` and `version-bisect-results.md` both read
`Date executed: ___________ / Executed by: ___________`;
`phase-4-wasm-validation-protocol.md` says "awaiting manual execution";
`wasm-audit-results.md` says "Testing pending". A fifth,
`phase-1-csg-elimination-results.md`, states "CONFIRMED — CSG color injection is
the root cause of Bug A and Bug B", which the findings report in the same folder
contradicts. My inclination is to leave the folder intact as the record of a
real investigation and add one line to its findings report pointing out which
files were never executed — but they are the clearest "no longer serving a
function" candidates outside `docs/plans/`, so it is your call.

### D-35 flags — accessibility-critical text I will not touch without you

1. **The screen-reader testing claims (F1).** Five documents, four of them
   accessibility-critical, assert testing your own records say never happened.
   The options as I see them: (a) strike the claims and replace them with what
   is actually true — automated axe-core and code audit, with manual AT
   verification outstanding; (b) leave them and schedule the testing that would
   make them true; (c) something else. I recommend (a), because
   `conformance-decisions.md` already says (a) and the documents that contradict
   it are the ones handed to IT departments.
2. **The fictional editor setting (F3)**, where it appears in
   `ACCESSIBILITY_CONFORMANCE.md` and the VPAT as a conformance *mitigation*.
   Removing a mitigation may change a conformance level. That is your call.
3. **`#prefsEditorSyntaxScheme`'s reason text** — carried over from UF-29's
   report, unchanged: it says the editor "picks between them from your system
   setting", but `resolveEditorDarkMode` reads the app's resolved theme, and
   Classic is always light. First sentence true, second false.
4. **CodeMirror's folded-range wording** — carried over from UF-29: a screen
   reader meets `aria-label="folded code"` at a collapsed fold. Unchanged by
   this release; still wants your ear.

### One question that is not mine to answer

`docs/README.md:84` lists `planning/` as part of the folder layout, but
`docs/planning/` is git-ignored, so nobody who clones the repository has it.
Either the line goes or the folder does.

---

## 7. The scripts and source sweep (U-38 part ii)

The order asked for obsolete AI-era workarounds, not just the scanner. This is
what the sweep found. `ai-at-playbook/` turns out to be the common thread — an
external framework this project borrowed from, which is not in this repository,
so every reference to it dangles.

| Item | Category | Evidence | Disposition |
|---|---|---|---|
| `scripts/bloat-scanner.js` | AI-era artifact | 8,906 bytes; header reads "adapted from ai-at-playbook/scripts/bloat-scanner.js"; scans 136 files and finds nothing | **Delete** — Q-62a, signed |
| `scripts/check-bundle-budget.js:5` | Stale reference in live code | Cites `LAYER_2_BUILD_PLAN.md` as its authority. MEASURED: that file is not tracked anywhere in the repository. Line 8 also budgets "Core app (no Monaco)" | **Report** — the script is a live CI gate; only its comments are stale |
| `scripts/import-check.js:4` | AI-era provenance note | "adapted from ai-at-playbook/scripts/import-check.js". This one is a **live required CI gate** and must stay | **Report only** — attribution, not a workaround |
| `scripts/README.md` | Incomplete | Documents 4 of the 14 scripts, and its own "Adding scripts" rule says every new script must be documented there | **STALE-REWRITE** |
| `src/js/preview.js` — `setupCameraControls()` floating fallback | Dead code | Carried over from UF-26, re-confirmed here from the documentation side: `#cameraControlsBody` and `.camera-control-btn` exist in JS and CSS but in **zero** places in `index.html`. Also contains a second, dead `.camera-view-btn` binding and a dead `#cameraResetView` binding | **Report** — dead code, its own change. This is U-38's category but it is not an AI artifact |
| `src/js/mode-manager.js` — `setPreferredEditor()` | Unreachable API | Exists and is unit-tested, but has **no production caller**. Four documents describe the UI that would call it | **Report** — either wire a control or retire it, your call |
| `.cm-scroller` axe finding | Not a defect | Carried over from UF-28, unchanged: `scrollable-region-focusable` is the R-I documented false positive. If any accessibility document lists it as an open failure, that is a docs bug | **Report** |
| `.cursor/`, `.volkswitch/`, `docs/planning/` | Git-ignored | Not published, so out of scope for a documentation review | **No action** |

Nothing else in `scripts/` or `src/` matched the "obsolete AI workaround"
description. The other twelve scripts are all reachable from `package.json`,
`pixi.toml`, `.github/workflows/test.yml`, `vite.config.js` or a test.

---

## 8. The file-by-file table

### Repository root (10)

| File | Disposition | Note |
|---|---|---|
| `README.md` | **STALE-REWRITE** | F2: the CLI section documents a deleted tool. Everything else checked out, including the export list. |
| `PROJECT_STATUS.md` | **STALE-REWRITE** | F2 (CLI), F8 (test count). Version 4.5.0 is correct — the only document that gets it right. Says nothing about Classic. |
| `CHANGELOG.md` | ACCURATE-KEEP | A dated log by nature. Has a live `[Unreleased]` section. |
| `RELEASE_NOTES.md` | **STALE-REWRITE** | Mostly a proper dated record — the Monaco mentions in old sections are legitimate history. Line 130's AT claim is F1. |
| `CONTRIBUTING.md` | ACCURATE-KEEP | Every command verified. Good tone. |
| `CODE_OF_CONDUCT.md` | ACCURATE-KEEP | Standard text. |
| `SECURITY.md` | ACCURATE-KEEP | Reporting paths are current. |
| `MAINTAINERS.md` | ACCURATE-KEEP | Policy, not a claim about the past. Note its policy — "screen reader testing expected for new UI components" — is not currently met. |
| `CREDITS.md` | ACCURATE-KEEP | The "v34.2.1" is a third-party component version, not the app's. |
| `THIRD_PARTY_NOTICES.md` | ACCURATE-KEEP | Legal file; the R-I chokusen provenance entry is intact. One phrase, "the web applications it generates", is CLI-era language. |

### `.github/` (6)

| File | Disposition | Note |
|---|---|---|
| `.github/BRANCH_PROTECTION.md` | **STALE-REWRITE** (UNVERIFIED detail) | Needs re-checking against ruleset 12059827, which now requires seven contexts after the Edge split and keeps `E2E Tests (Chromium)` as an aggregate after PR #93. |
| `.github/pull_request_template.md` | ACCURATE-KEEP | |
| `.github/ISSUE_TEMPLATE/bug_report.md` | ACCURATE-KEEP | |
| `.github/ISSUE_TEMPLATE/feature_request.md` | ACCURATE-KEEP | |
| `.github/ISSUE_TEMPLATE/accessibility_issue.md` | ACCURATE-KEEP | Asks the reporter for their AT; makes no claim of its own. |
| `.github/ISSUE_TEMPLATE/maintainer-welcome.md` | ACCURATE-KEEP | Describes the job, including AT testing as an expectation. |

### `docs/` root (21)

| File | Disposition | Note |
|---|---|---|
| `docs/README.md` | **STALE-REWRITE** | The index misses 9 of the 19 guides — including `CLASSIC_UI_GUIDE.md` and `LIBRARIES_GUIDE.md`, the two newest and best. Lists a git-ignored folder. |
| `docs/ACCESSIBILITY_CONFORMANCE.md` | **STALE-REWRITE — D-35, needs your sign-off** | F1, F3, F7, and the 4.5:1 claim against open D-13. Its Classic and console sections are recent and accurate. |
| `docs/KNOWN_ISSUES.md` | **STALE-REWRITE** | F3, F6, F8. Five weeks stale; nothing from Rounds 1–5. |
| `docs/BROWSER_SUPPORT.md` | **STALE-REWRITE** | F1, F3, F6, F7. |
| `docs/TESTING.md` | **STALE-REWRITE** | F8. Also omits half the test surface: `test:e2e:prod`, `test:visual`, the parity suite and the never-started guard. Its `$t` parity row needs re-checking now that an Animate panel exists. |
| `docs/TROUBLESHOOTING.md` | **STALE-REWRITE** | F5. "Node 18+" is unsourced — `package.json` has no `engines` field. |
| `docs/DEV_QUICK_START.md` | **STALE-REWRITE** | F5. Its project-structure block omits `tests/e2e-prod/` and `tests/visual/`. |
| `docs/PERFORMANCE.md` | **STALE-REWRITE** | F7, F8. Bundle figures and the WASM package are both from a superseded build. |
| `docs/DEPLOYMENT.md` | **STALE-REWRITE** | F5 (WASM size). Its cross-origin-isolation rationale says threading; the app is single-threaded, which `BROWSER_SUPPORT.md` states correctly. |
| `docs/ROLLBACK_RUNBOOK.md` | **STALE-REWRITE** | F7 (version/date header). Procedure itself looks sound. |
| `docs/RENDER_TRIGGER_MAP.md` | **STALE-REWRITE** | F8. Calls itself single-source-of-truth while being five months unaudited, for two resolved bugs. |
| `docs/RELEASING.md` | **STALE-REWRITE** | Never mentions merging `develop` into `main`, though `DEVELOPMENT_WORKFLOW.md` says `main` is what deploys. The release procedure has a hole in it. |
| `docs/QUICK_REFERENCE.md` | **STALE-REWRITE** | 331 bytes that duplicate three sections of `DEVELOPMENT_WORKFLOW.md`. Candidate to merge away — your call. |
| `docs/DEVELOPMENT_WORKFLOW.md` | ACCURATE-KEEP | |
| `docs/RESPONSIVE_UI.md` | ACCURATE-KEEP | Breakpoints verified. |
| `docs/MOBILE_LIMITATIONS.md` | **STALE-REWRITE** | "Solved in v1.4" uses a version scheme that no longer exists. Does not mention the mobile entry gate or that Classic is desktop-only. |
| `docs/ARCHITECTURE.md` | **STALE-REWRITE** | F2: carried a whole "CLI tool" section. The rest of the high-level description matches; its module map still deserves a line-by-line check. |
| `docs/SECURITY_ADMIN_GUIDE.md` | ACCURATE-KEEP (UNVERIFIED in detail) | Names the permanent CodeMirror CSP violation, which is correct and deliberate. |
| `docs/OPEN_SOURCE_PROJECTS.md` | **STALE-REWRITE** | F2: listed Chalk and Commander as runtime dependencies; both left with the CLI. |
| `docs/OPEN_SOURCE_GUIDES.md` | DATED RECORD | 151 KB of collected external reference material. |
| `docs/OPENSCAD_LANGUAGE_REFERENCE.md` | DATED RECORD | 585 KB of upstream OpenSCAD language reference; explicitly excluded from Markdown linting. Not ours to rewrite. |

Plus three files that sit loose in `docs/` rather than in a subfolder:

| File | Disposition | Note |
|---|---|---|
| `docs/design-d1-preset-companion-files.md` | **STALE-REWRITE** | F9: says "not yet implemented" about code that is live. |
| `docs/source-code-foundation-assessment.md` | DATED RECORD | Decision document, 2026-02-21. |
| `docs/testing-guide-stakeholder-bugs.md` | DATED RECORD | Verification steps for a specific past fix set. |

### `docs/guides/` (19)

| File | Disposition | Note |
|---|---|---|
| `docs/guides/EXPERT_MODE_GUIDE.md` | **STALE-REWRITE — highest user impact** | F2, F3, F9. Three wrong keyboard rows, a dead editor, a dead settings path. |
| `docs/guides/TROUBLESHOOTING_USER_GUIDE.md` | **STALE-REWRITE** | F3, F4. Its memory-banner advice is correct — see the ledger correction below. |
| `docs/guides/GETTING_STARTED.md` | **STALE-REWRITE** | F9: describes the wrong first screen. Export list is incomplete but not wrong. |
| `docs/guides/ACCESSIBILITY_GUIDE.md` | **STALE-REWRITE — D-35** | F1. Otherwise a strong document. Says nothing about Classic, which withholds dark and high-contrast themes — an accessibility-relevant fact. |
| `docs/guides/WELCOME_SCREEN.md` | **STALE-REWRITE** | F9: six cards described, ten exist; opening sentence contradicts its own body. |
| `docs/guides/STANDARD_MODE_GUIDE.md` | **STALE-REWRITE** | F4 only. Everything else I checked was accurate. |
| `docs/guides/CHOOSING_FORGE_VS_PLAYGROUND.md` | **STALE-REWRITE** | F2: its headline differentiator is the deleted CLI. Also the most buzzword-heavy page in the set. |
| `docs/guides/SECURITY_TESTING.md` | **STALE-REWRITE** | F8: "Recent fixes (2026-01-27)". |
| `docs/guides/LIBRARIES_GUIDE.md` | ACCURATE-KEEP | The model for the rewrites. |
| `docs/guides/CLASSIC_UI_GUIDE.md` | ACCURATE-KEEP | |
| `docs/guides/RUN_OFFLINE_GUIDE.md` | ACCURATE-KEEP | |
| `docs/guides/ACCESSIBILITY_HIGHLIGHTS.md` | ACCURATE-KEEP | Claims are hedged correctly and match the app. |
| `docs/guides/CONCEPTUAL_MODEL.md` | ACCURATE-KEEP | One nit: says projects are stored in "local storage"; they are in IndexedDB, as the other guides say. |
| `docs/guides/IT_APPROVAL_GUIDE.md` | ACCURATE-KEEP, but see F1 | Well written and honest about the CSP. Its accessibility paragraph rests on the VPAT, so whatever you decide in F1 lands here too. This is the document you hand to IT. |
| `docs/guides/BRAILLE_CARD_GUIDE.md` | ACCURATE-KEEP | Matches the three shipped variants. |
| `docs/guides/KEYGUARD_WORKFLOW_GUIDE.md` | ACCURATE-KEEP | |
| `docs/guides/MANIFEST_SHARING_GUIDE.md` | **STALE-REWRITE** | F2: its "CLI Quickstart" told users to run a removed command. The hand-written route it also documents is correct, so nobody is stranded. |
| `docs/guides/COLOR_SYSTEM_GUIDE.md` | ACCURATE-KEEP | |
| `docs/guides/GOLDEN_SVG_PROCEDURE.md` | ACCURATE-KEEP | A procedure for producing desktop reference output; still valid. |

### `docs/specs/` (4)

| File | Disposition | Note |
|---|---|---|
| `docs/specs/UI_STANDARDS.md` | ACCURATE-KEEP | Ten tokens verified. One nit on the deprecated `--radius-sm` value. |
| `docs/specs/CAMERA_CONTROLS_ACCESSIBILITY.md` | **STALE-REWRITE** | F9: documents the unreachable floating-controls widget. |
| `docs/specs/PARAMETER_SCHEMA_SPEC.md` | **STALE-REWRITE** | F2: the "v2 (CLI Toolchain)" framing. The schema itself is sound; the nested-vector note is pinned to v4.2.0 and wants re-checking. |
| `docs/specs/MANIFEST_STABILITY_CONTRACT.md` | ACCURATE-KEEP | A stability promise to outside authors — exactly the kind of document that should not be edited casually. |

### `docs/vpat/` (8)

| File | Disposition | Note |
|---|---|---|
| `docs/vpat/VPAT-2.5-WCAG.md` | **STALE-REWRITE — D-35, needs your sign-off** | F1, F3, F7. Contradicts itself on version and date, and contradicts `conformance-decisions.md` on four criteria. |
| `docs/vpat/conformance-decisions.md` | ACCURATE-KEEP | One line to fix: 1.4.10's remark still says "Monaco editor". Otherwise the honest document of the set. |
| `docs/vpat/evidence/m1/nvda-firefox-core-workflow-TEMPLATE.md` | ACCURATE-KEEP | A blank template, correctly named as one. It is evidence that the testing has not been done, so it should stay exactly as it is. |
| `docs/vpat/evidence/m0/validation-summary-2026-02-02.md` | DATED RECORD | |
| `docs/vpat/evidence/m1/validation-summary-2026-02-02.md` | DATED RECORD | Its line 88 is the counter-evidence in F1. |
| `docs/vpat/evidence/m2/validation-summary-2026-02-02.md` | DATED RECORD | Describes Monaco; correct for its date. |
| `docs/vpat/evidence/m3/validation-summary-2026-02-02.md` | DATED RECORD | |
| `docs/vpat/evidence/m5/validation-summary-2026-02-02.md` | DATED RECORD | |

### `docs/audit/` (36)

All **DATED RECORD** unless noted. Each carries its date and scope in its own
header, which is what makes it a record rather than a stale instruction.

- `2026-04-17/00-baseline.md` through `07-additional-recommended-changes.md`
  (8 files) — the professional code review. `00-baseline.md` records the bloat
  scanner at 85 files, which is correct for its date.
- `accessibility-audit-2026-03-13.md`, `braille-toolset-a11y-2026-07-11.md`
- `browser-pipeline-trace.md`, `desktop-coloring-theory.md`,
  `parity-probe-results.md`, `root-cause-brief.md`, `scenario-matrix.md` — the
  colour/display parity investigation, phases 1 to 5.
- `grid-printer-presets.validation-summary.md`,
  `multi_color_coff_parity.validation-summary.md`,
  `parity-remediation-validation-report.md`, `offline-pwa-spike-results.md`,
  `remediation-found-not-fixed.md`, `remediation-review-signoff.md`
- `testing-round-7/README.md`, `testing-round-7/desktop-baseline-v75.md`,
  `testing-round-8/README.md`
- `ki-012-investigation/` (12 files) — DATED RECORD, **with the exception
  raised in section 6**: four are unexecuted templates and one
  (`phase-1-csg-elimination-results.md`) states a root cause the folder's own
  findings report contradicts. Your call.

### `docs/notes/` (8)

| File | Disposition | Note |
|---|---|---|
| `docs/notes/README.md` | ACCURATE-KEEP | Explains the folder honestly. |
| `docs/notes/RELEASE_AUDIT_CHECKLIST.md` | DATED RECORD | 99 KB, closed 2026-02-24. |
| `docs/notes/COLOR_PASSTHROUGH.md` | DATED RECORD | |
| `docs/notes/2026-01-25/README.md`, `SUMMARY.md` | DATED RECORD | |
| `docs/notes/2026-01-26/CODE_AUDIT_FINDINGS.md` | DATED RECORD | |
| `docs/notes/2026-01-27/AUDIT_IMPLEMENTATION_SUMMARY.md` | DATED RECORD | |
| `docs/notes/2026-01-27/DOC_INVENTORY.md` | DATED RECORD | The 2026-01-27 documentation audit — the direct ancestor of this document. Worth reading beside it: several of its rewrites landed, and its "verify claims" note against `README.md` is the one that was never finished. |

### `docs/research/` (6)

| File | Disposition | Note |
|---|---|---|
| `docs/research/WASM_THREADING_ANALYSIS.md` | DATED RECORD, see F8 | Its subject package was replaced. The record stands; the conclusion needs re-testing before anyone relies on it. |
| `docs/research/CLOUDFLARE_VALIDATION.md` | DATED RECORD | |
| `docs/research/COMPARABLE_PROJECTS.md` | DATED RECORD | |
| `docs/research/PROJECT_SHARING_REFERENCES.md` | DATED RECORD | |
| `docs/research/SAVED_PROJECTS_REFERENCE.md` | DATED RECORD | |
| `docs/research/TUTORIAL_DESIGN_RESEARCH.md` | DATED RECORD | |

### `docs/plans/` (5)

| File | Disposition | Note |
|---|---|---|
| `docs/plans/geometry_fix_executor_prompt.md` | **OBSOLETE-ARCHIVE — done** | Q-62b, signed. Zero inbound references. Now at `docs/archive/geometry_fix_executor_prompt.md` with a dated note. |
| `docs/plans/qa_parity_executor_prompt.md` | **OBSOLETE-ARCHIVE — done** | Q-62b, signed. Zero inbound references. Now at `docs/archive/qa_parity_executor_prompt.md` with a dated note. |
| `docs/plans/lighting-visual-parity.plan.md` | **OBSOLETE-ARCHIVE — awaiting your signature** | All phases completed; zero inbound references. |
| `docs/plans/qa_parity_fix_plan_validation_report.md` | **OBSOLETE-ARCHIVE — awaiting your signature** | Validates a plan outside this repository; zero inbound references. |
| `docs/plans/lwfl-csg-bypass-test-protocol.md` | **ACCURATE-KEEP** (with a status line to add) | Live workstream tooling. Evidence in section 6. |

### `docs/archive/` (2)

| File | Disposition | Note |
|---|---|---|
| `docs/archive/README.md` | ACCURATE-KEEP | Sets the convention my archive notes will follow. |
| `docs/archive/audit-phases-18-32-report.md` | DATED RECORD | Already archived. |

### `public/` and `scripts/` (5)

| File | Disposition | Note |
|---|---|---|
| `scripts/README.md` | **STALE-REWRITE** | Documents 4 of 14 scripts. Correct on `setup-wasm`, where two `docs/` files are wrong. |
| `public/libraries/README.md` | ACCURATE-KEEP | |
| `public/icons/README.md` | ACCURATE-KEEP | |
| `public/fonts/README.md` | ACCURATE-KEEP | |
| `public/vendor/openscad-icons/README.md` | ACCURATE-KEEP | Vendored attribution; not ours to edit. |

### Not reviewed, and why

- `docs/planning/BUILD_PLAN_V2.md` and `docs/planning/decision-log.md` — present
  on disk, git-ignored, never published.
- Everything under `public/libraries/*/` — vendored third-party documentation
  (BOSL2, dotSCAD, NopSCADlib). Protected by the project's own rule against
  editing vendored files.
- `build/`, `dist/`, `artifacts/`, `.cursor/`, `.volkswitch/` — generated or
  git-ignored.

---

## 9. Tally

| Disposition | Files |
|---|---|
| ACCURATE-KEEP | 36 |
| DATED RECORD | 59 |
| STALE-REWRITE | 34 |
| OBSOLETE-ARCHIVE | 4 (2 signed, 2 awaiting signature) |
| **Total tracked** | **133** |

Of the 34 that need rewriting, 9 are guides users are pointed at directly and
17 are operational documents under `docs/`. That is the order the rewrite
chunks follow.

The pattern behind those numbers is worth stating plainly: **almost every
stale document dates from February to April 2026, and almost every accurate one
was written in the last two months.** The older set was written alongside a
version of the app that had a Monaco editor, a command-line tool, a settings
dialog for choosing editors, and a 20 MB ZIP limit. All four of those are gone.
The documents were never revisited when they went.
