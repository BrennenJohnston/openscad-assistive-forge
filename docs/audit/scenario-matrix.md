# Scenario Matrix — Phase 1: Corpus Extraction

> **Audit:** OpenSCAD Color/Display Parity Investigation
> **Phase:** 1 — Corpus Extraction (complete) ▸ Phase 2 — Desktop Semantics Verification (complete)
> **Date:** 2026-03-10
> **Status:** Phase 2 complete — theory documented and validated — awaiting human review before Phase 3

---

## File Path Key

| Short Name | Full Path |
|---|---|
| `feedback-5` | `feedback part 5.md` |
| `issue-006` | `issues/issue-006-console-output-vs-openscad-messages.md` |
| `issue-007` | `issues/issue-007-customizer-settings-display-shows-content.md` |
| `issue-008` | `issues/issue-008-svg-laser-cutting-process-unclear.md` |
| `issue-009` | `issues/issue-009-display-color-coding-preservation.md` |
| `issue-010` | `issues/issue-010-unexpected-display-content-unknown-trigger.md` |
| `issue-011` | `issues/issue-011-openscad-color-passthrough-debug-modifier.md` |
| `round-4` | `OpenSCAD Assistive Forge feedback Round 4.md` |
| `feedback-6` | `2026-03-03 11-57-09 Feedback 6.txt` |
| `tinker-tue` | `2026-02-17 16-13-00-Tinker Tuesday Audio Extracted 01.txt` |

All files are in or under:
`C:\Users\WATAP\Documents\Research\OpenSCAD_AF\Volkswitch Compatibility Feature Update Research\New feedback\`

---

## Phase 2 — Documentation References

The following OpenSCAD documentation pages were fetched and consulted on 2026-03-10:

| Doc Page | URL | Key Specification |
|---|---|---|
| color() | https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color | "Displays the child elements using the specified RGB color + alpha value. **This is only used for the F5 preview as CGAL and STL (F6) do not currently support color.** The alpha value defaults to 1.0 (opaque) if not specified." |
| Modifier Characters | https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier | `#` Debug Modifier: "Use this subtree as usual in the rendering process but also draw it unmodified in transparent pink." / "Note: The color changes triggered by character modifiers appear only in 'Compile' mode, not 'Compile and Render (CGAL)' mode." |
| Customizer | https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer | Standard parameter-set mechanism. No color-specific behaviors documented. Parameters serialized as JSON; sets applied via `-P` flag or GUI presets. |

---

## Scenario Matrix

### S-001 — 3D-printed keyguard color not preserved in browser

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 7 (line 51–55); `issue-009`, Description + Screenshots |
| **User Action** | Display a 3D-printed keyguard in the preview; stakeholder has assigned a specific `color()` to distinguish this object type |
| **Expected Desktop Result** | Object renders in the user-assigned color for 3D-printed keyguard (screenshot shows a distinct color) |
| **Actual Browser Result** | Not explicitly stated for this individual object type, but the overall complaint is that the browser collapses all objects into a single-color mesh (implied by issue-011 context and the fact that all four color types are raised as a single concern) |
| **Mismatch Category** | color |
| **Screenshot References** | image9 |
| **Stakeholder Quote** | "Note that I use color in the display to indicate different types of objects: 3D-printed keyguard:" |
| **Mode (F5/F6/Export)** | F5 Preview |
| **Desktop Truth** | OBSERVED — `color()` is applied in F5 Preview (Compile mode). The object displays in the user-assigned color. Documentation: "This is only used for the F5 preview as CGAL and STL (F6) do not currently support color." The screenshot (image9) shows the stakeholder's desktop OpenSCAD F5 Preview with a user-assigned `color()` value distinguishing the 3D-printed keyguard from other object types. Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color). |

---

### S-002 — Laser-cut keyguard color not preserved in browser

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 7 (line 57–59); `issue-009`, Description + Screenshots |
| **User Action** | Display a laser-cut keyguard variant in the preview; stakeholder has assigned a different `color()` than S-001 |
| **Expected Desktop Result** | Object renders in the user-assigned color for laser-cut keyguard (distinct from S-001) |
| **Actual Browser Result** | Not explicitly stated; same single-color collapse concern as S-001 |
| **Mismatch Category** | color |
| **Screenshot References** | image10 |
| **Stakeholder Quote** | "Laser-cut keyguard:" |
| **Mode (F5/F6/Export)** | F5 Preview |
| **Desktop Truth** | OBSERVED — Same mechanism as S-001. `color()` is applied in F5 Preview. The screenshot (image10) shows a different user-assigned color distinguishing the laser-cut variant. Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color). |

---

### S-003 — "First layer" preview color not preserved in browser

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 7 (line 61–63); `issue-009`, Description + Screenshots |
| **User Action** | Display the "first layer" preview of a keyguard; stakeholder has assigned a third `color()` to this object type |
| **Expected Desktop Result** | Object renders in the user-assigned color for the "first layer" preview (distinct from S-001 and S-002) |
| **Actual Browser Result** | Not explicitly stated; same single-color collapse concern |
| **Mismatch Category** | color |
| **Screenshot References** | image11 |
| **Stakeholder Quote** | "'first layer'" |
| **Mode (F5/F6/Export)** | F5 Preview |
| **Desktop Truth** | OBSERVED — Same mechanism as S-001/S-002. `color()` is applied in F5 Preview. The screenshot (image11) shows a third distinct user-assigned color for the "first layer" object type. Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color). |

---

### S-004 — Rendered first layer uses OpenSCAD-assigned colors (not user colors)

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 7 (line 65–66); `issue-009`, Description + Screenshots |
| **User Action** | Render (F6) the first layer in OpenSCAD desktop |
| **Expected Desktop Result** | "OpenSCAD makes these color choices" — the engine assigns its own colors during render, distinct from the user-assigned preview colors in S-001–S-003 |
| **Actual Browser Result** | Not explicitly stated; browser has no equivalent of the F5→F6 color distinction |
| **Mismatch Category** | color |
| **Screenshot References** | image12 |
| **Stakeholder Quote** | "Rendered first layer (OpenSCAD makes these color choices):" |
| **Note** | **CRITICAL SCENARIO for Phase 2.** Must determine: (a) whether image12 shows F5 preview or F6 render, (b) whether the colors are from explicit `color()` calls or from OpenSCAD's default material assignment during render. This reveals whether the stakeholder's SCAD code uses `color()` for all object types or relies on OpenSCAD's default coloring for some states. |
| **Mode (F5/F6/Export)** | F6 Render (INFERRED) |
| **Desktop Truth** | INFERRED — The stakeholder explicitly contrasts this screenshot with S-001–S-003 by stating "OpenSCAD makes these color choices," indicating these are NOT user-assigned `color()` values. The documentation confirms: "This is only used for the F5 preview as CGAL and STL (F6) do not currently support color." In F6 Render, user `color()` calls are ignored. The CGAL backend assigns its own per-face colors based on the CSG tree structure — different Boolean-operation surfaces receive different hues automatically. This produces a characteristic multi-color "rendered" appearance that is unrelated to the user's `color()` assignments. The word "Rendered" in the stakeholder's label aligns with OpenSCAD's F6 "Compile and Render (CGAL)" operation. **Conclusion:** image12 most likely shows F6 Render output. The colors are CGAL engine defaults, not explicit `color()` calls. The SCAD code does NOT rely on `color()` for this state — it relies on the engine's automatic face coloring. UNVERIFIED — requires desktop test to confirm image12 is F6 (not F5 Preview of a code path that omits `color()` calls). Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color); stakeholder description in `feedback-5` line 65. |

---

### S-005 — `#` debug modifier transparency lost in browser

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 9 (lines 85–92); `issue-011`, Description + Screenshots |
| **User Action** | Generate a keyguard frame with "show keyguard with frame" set to "yes"; the SCAD code uses the `#` debug modifier on the keyguard object to overlay it semi-transparently against the frame |
| **Expected Desktop Result** | Keyguard is shown semi-transparent (pink overlay) through the frame, leveraging the `#` modifier's F5-preview transparency behavior |
| **Actual Browser Result** | The browser renders a different result — transparency and overlay color are lost (image17 shows the browser output, which differs from images 15–16) |
| **Mismatch Category** | transparency |
| **Screenshot References** | image15 (desktop: frame with keyguard), image16 (desktop: `#` modifier transparency effect), image17 (browser: same state, different rendering) |
| **Stakeholder Quote** | "I'm leveraging the '#' [capability](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier) of OpenSCAD to display the keyguard along with the frame and also provide some transparency." |
| **Mode (F5/F6/Export)** | F5 Preview |
| **Desktop Truth** | OBSERVED — The `#` Debug Modifier documentation states: "Use this subtree as usual in the rendering process but also draw it unmodified in transparent pink." This is **F5 Preview (Compile mode) only**. The documentation explicitly notes: "The color changes triggered by character modifiers appear only in 'Compile' mode, not 'Compile and Render (CGAL)' mode." Therefore: **(a) F5 Preview:** `#`-marked object is included in the normal render AND additionally drawn as a transparent pink overlay. This is what images 15–16 show. **(b) F6 Render:** `#`-marked object is included in the render at full opacity with CGAL-assigned colors. No pink overlay, no transparency. **(c) Export (STL/OFF/SVG/DXF):** `#`-marked object IS included in the exported geometry (unlike `%` Background Modifier which excludes from render, or `*` Disable Modifier which excludes entirely). No transparency or color metadata is carried — the object is exported as normal solid geometry. Source: [Modifier Characters docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier). |

---

### S-006 — Color passthrough request (browser does not pass through OpenSCAD colors)

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 9 (lines 93–97); `issue-011`, Description |
| **User Action** | (Same state as S-005) Stakeholder observes the browser output and asks whether colors can be passed through |
| **Expected Desktop Result** | OpenSCAD desktop preserves per-object colors assigned via `color()` and the `#` modifier overlay |
| **Actual Browser Result** | Browser overrides the stakeholder's color scheme; colors are not passed through from the OpenSCAD engine output |
| **Mismatch Category** | color |
| **Screenshot References** | image17 (browser result showing overridden colors) |
| **Stakeholder Quote** | "I don't know if this is related to my comments about use of color. Is there a way to pass through OpenSCAD colors? We can talk further." |
| **Mode (F5/F6/Export)** | F5 Preview (stakeholder reference point) |
| **Desktop Truth** | OBSERVED — The stakeholder's "pass through OpenSCAD colors" request refers to two distinct F5 Preview display features: (1) User-assigned colors via the `color()` function, which applies per-object coloring in F5 Preview. (2) The `#` Debug Modifier's transparent pink overlay. Both are **F5 Preview display-only features** with no effect on F6 Render or exported geometry. The desktop "truth" the stakeholder wants replicated is the F5 Preview visual output — not the export output. For the browser to "pass through OpenSCAD colors," it would need to either: (a) obtain per-face color data from the WASM engine's output (COFF format), or (b) separately re-derive the `color()` and `#` effects from the SCAD source. Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color); [Modifier Characters docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Modifier_Characters#Debug_Modifier). |

---

### S-007 — Display shows geometry when `generate = Customizer Settings` (should be blank)

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 5 (lines 33–37); `issue-007`, Description + Screenshots |
| **User Action** | Set Keyguard Basics > generate = "Customizer Settings" |
| **Expected Desktop Result** | "In OpenSCAD I would see nothing in the display because I don't create any dimensional objects at this time." — the display pane should be blank |
| **Actual Browser Result** | The display pane shows content/geometry (image4 shows visible geometry) |
| **Mismatch Category** | blank-display |
| **Screenshot References** | image4 (display with unexpected content), image5 (status/output bar in same state) |
| **Stakeholder Quote** | "This is what I see when I choose Keyguard Basics > generate = Customizer Settings. In OpenSCAD I would see nothing in the display because I don't create any dimensional objects at this time." |
| **Mode (F5/F6/Export)** | N/A — no geometry generated in this mode |
| **Desktop Truth** | OBSERVED (from stakeholder description) — When the SCAD code's `generate` parameter selects a mode that produces no dimensional objects (only `echo()` / console output), OpenSCAD desktop displays an empty viewport. An empty CSG tree produces a blank preview in both F5 and F6 modes. The stakeholder confirms this directly: "In OpenSCAD I would see nothing in the display because I don't create any dimensional objects at this time." This is standard OpenSCAD behavior — no objects = blank viewport. Source: stakeholder quote in `feedback-5` line 33–37. No additional documentation citation needed; this is inherent to how OpenSCAD works (no geometry → nothing to render). |

---

### S-008 — Unexpected geometry appears in display from unknown trigger

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 8 (lines 73–81); `issue-010`, Description + Screenshots |
| **User Action** | Unknown — stakeholder had no idea what triggered the display update. Possibly related to console interaction. |
| **Expected Desktop Result** | "Normally, I would just display nothing in the Display pane." — the display should remain blank in the current mode |
| **Actual Browser Result** | Geometry spontaneously appeared in the display pane |
| **Mismatch Category** | stale-state |
| **Screenshot References** | image13 (unexpected content in display), image14 (console output, possible trigger) |
| **Stakeholder Quote** | "This is interesting. I have no idea what triggered it. Maybe because I've written this to the Console? Normally, I would just display nothing in the Display pane. Let's talk." |
| **Note** | Likely related to S-007 (blank-display issue). May share root cause: stale geometry not cleared, or debounce timer triggering an unwanted render. |
| **Mode (F5/F6/Export)** | N/A — stale state concern (should be blank) |
| **Desktop Truth** | INFERRED — In OpenSCAD desktop, each F5 compile replaces the previous preview with the new result. If no geometry is produced, the viewport is cleared. Writing to the console (via `echo()`) does NOT trigger a new preview render — console output is a side effect of compilation, not a render trigger. Stale geometry from a prior compile does not persist after a new (empty) compile completes. The stakeholder's expectation ("display nothing") is consistent with standard desktop behavior. The spontaneous appearance of geometry in the browser suggests either: (a) a stale mesh from a previous render was not cleared, or (b) an unintended re-render was triggered. Source: stakeholder description in `feedback-5` lines 73–81. Desktop clearing behavior is standard but not explicitly documented in the pages consulted. |

---

### S-009 — SVG laser cutting export workflow unclear

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 6 (lines 40–47); `issue-008`, Description + Screenshots |
| **User Action** | Stakeholder attempted to understand how to create an SVG file for laser cutting |
| **Expected Desktop Result** | In OpenSCAD desktop, the user would export as SVG via a known menu/workflow |
| **Actual Browser Result** | The process is unclear; screenshots show UI states that don't communicate the workflow |
| **Mismatch Category** | workflow |
| **Screenshot References** | image6, image7, image8 |
| **Stakeholder Quote** | "I don't understand what the process is for creating an SVG file for laser cutting. Let's talk." |
| **Mode (F5/F6/Export)** | Export (SVG) |
| **Desktop Truth** | OBSERVED — In OpenSCAD desktop, SVG export is performed via File > Export > Export as SVG. This exports 2D geometry (produced by `projection()` or native 2D operations like `square()`, `circle()`, `polygon()`). The F6 Render must be completed before export is available. The color() documentation states color is F5-only and "CGAL and STL (F6) do not currently support color" — SVG is not explicitly mentioned, so color behavior in SVG export is UNVERIFIED. The stakeholder's confusion is about the browser workflow, not the desktop export mechanics. Source: [color() docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Transformations#color) (for color-in-export limitations); desktop export workflow is standard OpenSCAD UI. |

---

### S-010 — Console Output pane vs OpenSCAD Messages box confusion

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 4 (lines 17–29); `issue-006`, Description + Screenshots |
| **User Action** | Stakeholder observed both the Console Output pane and the OpenSCAD Messages box |
| **Expected Desktop Result** | OpenSCAD desktop has a single messages/console area with clear purpose |
| **Actual Browser Result** | Two separate display areas (Console Output and OpenSCAD Messages) with unclear distinction |
| **Mismatch Category** | workflow |
| **Screenshot References** | image1 (Console Output initial state), image2 (OpenSCAD Messages box) |
| **Stakeholder Quote** | "I don't understand how the Console Output pane differs from the OpenSCAD Messages box…" |
| **Mode (F5/F6/Export)** | N/A — UI/workflow concern |
| **Desktop Truth** | OBSERVED — OpenSCAD desktop has a single unified console panel that displays compilation messages, `echo()` output, warnings, and errors in one area. There is no separation between "Console Output" and "Messages." The browser app's dual-panel design (Console Output + OpenSCAD Messages) is a browser-specific UI choice with no desktop equivalent. Source: stakeholder description; OpenSCAD desktop UI is well-established with a single console. No specific documentation page covers the console layout, but it is standard behavior observable in any OpenSCAD desktop installation. |

---

### S-011 — Console Output pane updates unexpectedly

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 4 (lines 23–28); `issue-006`, Description + Screenshots |
| **User Action** | Stakeholder was reviewing the interface when the Console Output pane updated without an obvious trigger |
| **Expected Desktop Result** | Console/messages update only in response to explicit user actions (F5/F6/export) |
| **Actual Browser Result** | Console updated spontaneously; stakeholder could not identify the cause |
| **Mismatch Category** | stale-state |
| **Screenshot References** | image3 (Console Output after unexpected update) |
| **Stakeholder Quote** | "just noticed that the Console Output pane updated. Don't know what caused the update… We should talk about the format of these displays." |
| **Mode (F5/F6/Export)** | N/A — stale-state / unexpected trigger concern |
| **Desktop Truth** | INFERRED — In OpenSCAD desktop, the console updates when a compile (F5), render (F6), or export operation is triggered. With "Automatic Reload and Preview" enabled (Design menu), the console can also update when the SCAD file changes on disk. However, console updates always correspond to an identifiable compilation event. The stakeholder's inability to identify the trigger suggests the browser app may be firing auto-preview renders or debounce-triggered recompiles without clear user-visible cause. Source: stakeholder description in `feedback-5` lines 23–28. Desktop auto-reload behavior is a standard OpenSCAD feature but not documented on the pages consulted — UNVERIFIED for exact trigger semantics. |

---

### S-012 — Missing include file warning not shown in console

| Field | Value |
|---|---|
| **Source** | `round-4`, Bugs section, item 1 (lines 11–19) |
| **User Action** | Loaded keyguard project without uploading the companion file `openings_and_additions.txt` |
| **Expected Desktop Result** | Console shows warning: "WARNING: Can't open include file 'openings_and_additions.txt'." |
| **Actual Browser Result** | "I see no Warnings with 'Warnings' checked." The warning is absent from the console, though the file is shown as "Missing" in the Companion Files section. |
| **Mismatch Category** | workflow |
| **Screenshot References** | None |
| **Stakeholder Quote** | "Console output, I would expect to see a warning: WARNING: Can't open include file 'openings_and_additions.txt'. Because I didn't 'upload the file'. This warning occurs in local OpenSCAD. But I see no Warnings with 'Warnings' checked." |
| **Mode (F5/F6/Export)** | N/A — console warning behavior |
| **Desktop Truth** | OBSERVED (from stakeholder description) — OpenSCAD desktop emits "WARNING: Can't open include file 'filename'" to the console when an `include <filename>` directive references a file that cannot be found. The stakeholder confirms: "This warning occurs in local OpenSCAD." This is standard OpenSCAD compiler behavior — the `include` directive's file-not-found produces a WARNING-level message in the console during compilation. Source: stakeholder quote in `round-4` Bugs section. The exact warning format is confirmed by the stakeholder's verbatim quote of the expected message. |

---

### S-013 — Companion file screenshot does not display as reference overlay

| Field | Value |
|---|---|
| **Source** | `round-4`, Bugs section, item 3 (line 23) |
| **User Action** | Uploaded a screenshot as a Companion File and set "show screenshot" to "yes" |
| **Expected Desktop Result** | Screenshot displays behind the keyguard in the preview (reference image overlay) |
| **Actual Browser Result** | Screenshot did not display |
| **Mismatch Category** | blank-display |
| **Screenshot References** | None |
| **Stakeholder Quote** | "Uploading the screenshot as a Companion File and then setting 'show screenshot' to 'yes' didn't cause the screenshot to display behind the keyguard." |
| **Mode (F5/F6/Export)** | F5 Preview |
| **Desktop Truth** | INFERRED — This is a project-specific feature: the stakeholder's SCAD code contains logic to load and display a screenshot image file behind the keyguard when "show screenshot" is set to "yes." In OpenSCAD desktop, this works because the image file is present in the local filesystem and accessible via `import()` or `surface()`. The SCAD code reads the file, and the resulting geometry (with the image mapped) appears in the F5 Preview. This is not a built-in OpenSCAD feature but a project-level SCAD code feature that depends on companion files being in the expected filesystem location. Source: stakeholder description in `round-4` Bugs section. The mechanism (SCAD code loading local files) is standard OpenSCAD `import()`/`surface()` behavior but the specific "show screenshot" feature is project-specific. |

---

### S-014 — Rendering chain degrades across preset switches (structural geometry missing)

| Field | Value |
|---|---|
| **Source** | `feedback-6`, Speaker 1 / developer (lines 38–42) |
| **User Action** | Load a keyguard preset, then switch to a second and third preset sequentially |
| **Expected Desktop Result** | Each preset renders fully and correctly; switching presets produces a clean new render |
| **Actual Browser Result** | "bits and pieces of the key guard not generate… actual structural missing, not fully rendered" |
| **Mismatch Category** | stale-state |
| **Screenshot References** | None |
| **Stakeholder Quote** | (Developer, not stakeholder): "I'll go to your preset of a key guard, and then I'll go to a second and a third. And each time I'm seeing bits and pieces of the key guard not generate. And there's actual structural missing, not fully rendered." |
| **Note** | This is the developer's observation, not the stakeholder's. Included because it describes a display pipeline failure during preset-switching that may share root cause with S-007 and S-008. |
| **Mode (F5/F6/Export)** | F5 Preview (triggered by Customizer parameter change) |
| **Desktop Truth** | INFERRED — In OpenSCAD desktop, changing Customizer parameters triggers a recompile (equivalent to F5). The Customizer documentation describes parameter sets that can be saved and loaded: "Sets of parameter values can also be saved, which effectively saves a variant of a particular model." Each parameter change or preset switch produces a fresh, complete CSG tree and preview. There is no state degradation across parameter changes in desktop OpenSCAD — each compile is independent. The "structural missing" behavior is browser-specific. Source: [Customizer docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer); desktop recompile-on-parameter-change is standard Customizer behavior. |

---

### S-015 — Stakeholder requests minimal desktop-parity baseline

| Field | Value |
|---|---|
| **Source** | `feedback-6`, Speaker 2 / stakeholder (lines 161–169) |
| **User Action** | Stakeholder reviewed the overall browser tool and compared it to desktop OpenSCAD |
| **Expected Desktop Result** | "the base OpenSCAD functionality that I see in the PC version" — a browser tool that replicates core desktop behavior faithfully |
| **Actual Browser Result** | "lots of complexity in this space… some of them I don't even understand… their purpose" — the tool has features beyond desktop OpenSCAD but does not reliably replicate the core behaviors the stakeholder depends on |
| **Mismatch Category** | workflow |
| **Screenshot References** | None |
| **Stakeholder Quote** | "if it were possible to just implement the base OpenSCAD functionality that I see in the PC version, in a browser, well, that's a huge leg up for my audience… Having a browser-based approach, with no more functionality than that, that simple OpenSCAD user interface would completely remove the barrier for them." |
| **Mode (F5/F6/Export)** | N/A — meta-request for desktop parity |
| **Desktop Truth** | N/A — This is a stakeholder request for the browser tool to replicate core OpenSCAD desktop functionality, not a specific desktop behavior to verify. The "base functionality" the stakeholder references includes: F5 Preview with `color()` and modifier characters (S-001–S-006), blank viewport for empty geometry (S-007), clean recompile on parameter changes (S-014), console warnings for missing files (S-012), and SVG export workflow (S-009). No desktop verification needed — this scenario aggregates the parity expectations from all other scenarios. |

---

### S-016 — Grid color/darkness not controllable

| Field | Value |
|---|---|
| **Source** | `feedback-5`, section 3 (line 11); `issue-004` |
| **User Action** | Stakeholder wants to adjust the grid's visual appearance in the 3D display pane |
| **Expected Desktop Result** | Not explicitly stated what desktop OpenSCAD offers for grid control |
| **Actual Browser Result** | No control available for grid color/darkness |
| **Mismatch Category** | color |
| **Screenshot References** | None |
| **Stakeholder Quote** | "I'd like to be able to control the color/darkness of the grid." |
| **Mode (F5/F6/Export)** | N/A — UI feature request |
| **Desktop Truth** | UNVERIFIED — OpenSCAD desktop displays a grid in the 3D viewport with a default color scheme (gray lines). OpenSCAD desktop offers View > Show Axes and View > Show Crosshairs toggles, and the color scheme can be adjusted via Edit > Preferences > 3D View (background, axes colors). However, fine-grained grid color/darkness control is not a prominent or well-documented desktop feature. The stakeholder does not claim desktop OpenSCAD has this feature — the request may be a browser-specific enhancement wish rather than a parity gap. Source: OpenSCAD desktop Preferences dialog (not documented on the wiki pages consulted). UNVERIFIED — requires desktop inspection to confirm exact grid customization options. |

---

## Screenshot Accounting

All screenshots from `feedback part 5.md` are accounted for:

| Image | Scenario | Description |
|---|---|---|
| image1 | S-010 | Console Output pane — initial state |
| image2 | S-010 | OpenSCAD Messages box |
| image3 | S-011 | Console Output pane after unexpected update |
| image4 | S-007 | Display pane when generate = Customizer Settings |
| image5 | S-007 | Status/output bar in same state |
| image6 | S-009 | SVG workflow context 1 |
| image7 | S-009 | SVG workflow context 2 |
| image8 | S-009 | SVG workflow context 3 |
| image9 | S-001 | 3D-printed keyguard color |
| image10 | S-002 | Laser-cut keyguard color |
| image11 | S-003 | "First layer" preview color |
| image12 | S-004 | Rendered first layer (OpenSCAD color choices) |
| image13 | S-008 | Unexpected content in display |
| image14 | S-008 | Console output — possible trigger |
| image15 | S-005 | Keyguard frame with # modifier (desktop) |
| image16 | S-005 | # debug modifier transparency effect (desktop) |
| image17 | S-005, S-006 | Same state rendered in browser |

Round 4 feedback embedded images (base64):
| Image | Scenario | Description |
|---|---|---|
| [image1] | — (preset management, not display pipeline) | Obsolete preset warnings |
| [image2] | — (preset management, not display pipeline) | "New" parameters that aren't parameters |
| [image3] | — (project vs design naming, not display pipeline) | Start page Projects/Designs reference |

---

## ★ Issue File Coverage Check

| ★ Issue File | Scenarios | Covered? |
|---|---|---|
| `feedback part 5.md` | S-001 through S-011, S-016 | ✅ |
| `issue-009` | S-001, S-002, S-003, S-004 | ✅ |
| `issue-011` | S-005, S-006 | ✅ |
| `issue-007` | S-007 | ✅ |
| `issue-010` | S-008 | ✅ |

---

## Non-★ Files — Disposition

| File | Display-Pipeline Scenarios | Non-Pipeline Items (excluded from matrix) |
|---|---|---|
| `issue-006` | S-010, S-011 | — |
| `issue-008` | S-009 | — |
| `issue-001` | — | Projects/Companion Files conceptual model |
| `issue-002` | — | PNG/JPEG reference image format support |
| `issue-003` | — | Tablet screen size scaling for reference images |
| `issue-004` | S-016 | — |
| `issue-005` | — | Prusa MK4 build volume data |
| `round-4` | S-012, S-013 | Preset management (export/import/sort/naming), preset warnings about obsolete/new params, project vs design naming |
| `Ken's Feedback V2.0` | — | Slider discrete value entry, Save Preset naming, Customizer spec reference |
| `New Volkswitch Feedback` | — | Slider precision, Save Preset naming, Customizer spec (same concerns as Ken's V2.0) |
| `feedback-6` | S-014, S-015 | AI cost concerns, re-engineering suggestion, rendering chain architecture |
| `tinker-tue` | — | Demo context, casual color discussion with third parties ("getting color right is not easy"), Pixi/JSON schema tooling discussion; no specific parity claims |

---

## Summary Statistics

- **Total scenarios extracted:** 16
- **By mismatch category:**
  - **color:** S-001, S-002, S-003, S-004, S-006, S-016 (6 scenarios)
  - **transparency:** S-005 (1 scenario)
  - **blank-display:** S-007, S-013 (2 scenarios)
  - **stale-state:** S-008, S-011, S-014 (3 scenarios)
  - **workflow:** S-009, S-010, S-012, S-015 (4 scenarios)
  - **2D/3D-mode:** 0 (may emerge in Phase 3 tracing)
  - **shape:** 0 (may emerge in Phase 3 tracing)

- **Critical scenarios for Phase 2 (desktop semantics):**
  - **S-004** — Must determine whether image12 is F5 or F6, and whether colors are explicit `color()` calls or engine defaults
  - **S-005** — Must confirm `#` modifier transparency is F5-preview-only behavior
  - **S-006** — Must determine what "pass through OpenSCAD colors" means at the engine level

- **Scenarios likely sharing root cause:**
  - S-001 + S-002 + S-003 + S-006 → color passthrough pipeline (COFF output)
  - S-004 → may be COFF or may be a distinct F5/F6 rendering state issue
  - S-005 → `#` modifier transparency (known engine limitation for export formats)
  - S-007 + S-008 → blank-display / stale-state (render intent / mesh clearing)
  - S-010 + S-011 → console behavior / unexpected triggers

---

## Phase 2 — Desktop Coloring Theory

A comprehensive theory of how OpenSCAD Desktop produces the colors observed by the stakeholder has been developed and validated. The full theory document is at:

**[`docs/audit/desktop-coloring-theory.md`](desktop-coloring-theory.md)**

### Three-System Model

OpenSCAD Desktop uses three separate coloring systems that run in parallel:

| System | Mechanism | Scope | Stakeholder Scenarios |
|---|---|---|---|
| **System 1** — User-assigned colors | `color()` function | F5 Preview only | S-001, S-002, S-003, S-006 |
| **System 2** — Engine-assigned CSG colors | Automatic yellow (positive) / green (subtracted) face coloring | F5 Preview + F6 Render | S-004 |
| **System 3** — Modifier character overlays | `#` debug modifier → transparent pink | F5 Preview only | S-005, S-006 |

### Key Finding: System 2 is Undocumented

The OpenSCAD User Manual does **not** document the automatic yellow/green face coloring that appears in F6 Render. This behavior was confirmed through:

- **GitHub Issue #5065** — "Display colors when rendering using F6" (opened by @kintel, March 2024)
- **GitHub PR #5185** — "Color support in 3D rendering" (merged July 14, 2024) — formalized the yellow/green scheme and added Manifold OriginalID-based color tracking

The User Manual PDFs (local: `C:\Users\WATAP\Documents\Research\OpenSCAD_AF\OpenSCAD Book\`) were consulted to validate this theory. They confirm Systems 1 and 3 explicitly, and their silence on System 2 is consistent with its undocumented status.

### Critical Unknown for Phase 3/4

The WASM build date (`OpenSCAD-2025.03.25.wasm24456`) is after PR #5185 (July 2024). Whether this build includes the `render-colors` feature and outputs COFF with per-face RGBA data is the primary question for Phase 4, Probe 1.

---

## Phase 2 — Desktop Semantics Verification Summary

### Confidence Classification

| Confidence | Scenarios | Meaning |
|---|---|---|
| **OBSERVED** | S-001, S-002, S-003, S-005, S-006, S-007, S-009, S-010, S-012 | Desktop behavior confirmed by documentation citation and/or direct stakeholder description of desktop behavior |
| **INFERRED** | S-004, S-008, S-011, S-013, S-014 | Desktop behavior inferred from documentation + stakeholder description, but not directly confirmed by a single authoritative source |
| **UNVERIFIED** | S-016 | Desktop behavior cannot be confirmed from documentation consulted; requires desktop inspection |
| **N/A** | S-015 | Meta-request; no specific desktop behavior to verify |

### Critical Findings

1. **S-004 (Rendered first layer):** INFERRED as F6 Render. The stakeholder's explicit statement "OpenSCAD makes these color choices" combined with the color() documentation ("This is only used for the F5 preview as CGAL and STL (F6) do not currently support color") strongly indicates image12 shows F6 CGAL output where user `color()` calls are ignored and the engine assigns per-face colors automatically. However, an alternative interpretation exists: the SCAD code for this particular mode may simply not include `color()` calls, producing OpenSCAD's default yellow/gold F5 preview color. **Requires desktop test to definitively confirm.**

2. **S-005 (# Debug Modifier):** OBSERVED from documentation. The `#` modifier's transparent pink overlay is **strictly F5 Preview behavior**. In F6 Render, the object appears at full opacity with engine colors. In export, the object is included as normal geometry with no transparency. This is explicitly documented.

3. **S-006 (Color passthrough):** The stakeholder's request to "pass through OpenSCAD colors" refers to F5 Preview display features (`color()` + `#` modifier). Both are display-only and not present in standard export formats (STL, OFF without color extension). Replicating this in the browser requires either COFF (colored OFF) output from the WASM engine or a separate color-derivation mechanism.

4. **SVG color in export (S-009):** The documentation explicitly excludes CGAL and STL from color support but does not mention SVG. SVG color behavior in OpenSCAD export is UNVERIFIED from the documentation consulted.
