# Validation Summary - Multi-Color COFF Plan Audit

## Audit target

- Audited plan: `C:\Users\WATAP\.cursor\plans\multi-color_coff_parity_b30736da.plan.md`
- Validation basis: the original build-plan prompt provided in this chat
- Template baseline: `ai-at-playbook/templates/queue-plan.md`
- Executor baseline: `ai-at-playbook/templates/build-plan-executor-prompt.md`
- Handoff baseline: `ai-at-playbook/checklists/multi-session-handoff.md`
- Date: `2026-03-14`

## Verdict

**Status: NOT COMPLIANT (rewrite required before execution).**

The audited document is a useful draft with solid research intent and mostly sensible phase ordering, but it is not the executor-ready plan the prompt required. The biggest failures are template non-conformance, missing execution scaffolding, and a few evidence/citation problems that would make later phase execution drift-prone.

## What passes

1. Frontmatter todos exist and are all `pending` for phases 0 through 5.
2. A research section appears near the top and addresses all five requested research questions.
3. The phase sequence broadly follows the requested Phase 0 through Phase 5 structure.
4. Most phases include a scoped implementation statement and a scope fence.
5. A deferred follow-on work section exists.

## Blocking findings

1. The required deliverable file does not exist.
   The prompt required `multi_color_coff_parity.plan.md` in the workspace root. The audited artifact is still a draft under `.cursor/plans/`, and no root-level `multi_color_coff_parity.plan.md` exists.

2. The document does not follow `queue-plan.md` exactly.
   Missing template sections include `Validation summary`, `Playbook basis`, `Operating rules`, `Fresh chat opener`, `Session-start checklist`, `Phase intake checklist`, `Phase completion checklist`, `Master checklist`, `Phase details` in template field format, and `Exit criteria`. The current file jumps from `Research Findings` to `Build Plan` and ends after deferred items.

3. The file is still written as a meta-plan, not the final executor artifact.
   The line `The plan file will be written to multi_color_coff_parity.plan.md` shows the current document is describing the intended artifact rather than being that artifact.

4. Required operating rules are missing.
   The prompt required a configured `Operating rules` section covering the environment tool, git convention, frozen layers, and phase-execution discipline. No such section exists.

5. Required hallucination safeguards are missing.
   The prompt required an explicit `Hallucination safeguards` section stating that every code claim must cite file and line, that claims must be tagged `OBSERVED` / `INFERRED` / `UNVERIFIED`, and that runtime browser behavior must not be asserted from static reading alone. The draft uses confidence labels in places, but it never installs the required safeguards section for future executor chats.

6. The three mandatory checklists are missing.
   The prompt required configured `Session-start`, `Phase intake`, and `Phase completion` checklists copied from the playbook template. None are present.

7. The master checklist is missing.
   The prompt required a master checklist in the plan body in addition to frontmatter todos. It is not present.

8. Pause-rule / hard-stop discipline is incomplete.
   Each phase was required to include an explicit pause rule such as `mark complete and end the chat`. No phase has that line.

9. Phase 5 is missing a fallback gate.
   The prompt required a fallback gate for every phase. Phase 5 has re-read, implementation, validation, and scope fence lines, but no fallback gate.

10. Exact re-read paths are not provided for every phase.
   Phase 4 says `Test results from Phases 1-3, fragile system entry points` instead of listing exact paths. The prompt required exact file paths to re-read in every phase.

11. Regression protection is not embedded in every implementation phase.
   The prompt required every implementation phase to run `pixi run test` and confirm no regressions in SVG export, DXF export, render preview, and generate-and-export. The draft centralizes most regression work in Phase 4 instead of repeating that guardrail in earlier implementation phases.

12. Exit criteria are missing.
   The prompt supplied explicit exit criteria and required them to be included. The audited file ends before any `Exit criteria` section.

13. Test-first and desktop-baseline discipline is weakened in Phase 1.
   Phase 1 allows tests sourced from existing synthetic constants `or Phase 0 output`, and its fallback shifts to validating parser internals directly. The prompt required tests to encode expected behavior from the desktop baseline rather than from the current implementation. The primary Phase 1 path should be anchored to Phase 0 evidence or a documented reference derived from that baseline.

14. Research confidence tagging is incomplete.
   The prompt required each research question answer to include confidence classification. RQ-4 and RQ-5 contain useful content, but they do not consistently tag each finding as `OBSERVED`, `INFERRED`, or `UNVERIFIED`.

15. Several research citations need correction before executor use.
   The fragile-system inventory cites `main.js` entry points, but the actual file is `src/main.js` for the `onExport2D('svg')` and `onExport2D('dxf')` handlers. The screenshot row cites a generic canvas `toDataURL()` path without a file reference, but the actual viewport-image path here uses `canvas.toBlob()` in `src/js/edit-actions-controller.js`. Some other line references are also stale enough to reduce traceability.

16. Some regression-signal claims are too vague to serve as a reliable execution checklist.
   Examples like `some E2E tests` and `manual verification` are directionally helpful but not specific enough for a later one-phase executor chat. The plan should name the exact tests or exact manual steps that count as passing evidence.

## Evidence spot-checks performed for this audit

1. `scripts/desktop-audit.ps1` confirms the scenario array shape and shows the new multi-color scenario would be added inside `$Scenarios`.
2. `tests/fixtures/keyguard-v75/keyguard_v75.scad` confirms both `have_a_keyguard_frame` and `show_keyguard_with_frame` default to `"no"` and that the multi-color branch is the `generate=="keyguard frame"` path with Turquoise plus red geometry.
3. `tests/fixtures/color-debug-test.scad` confirms a lightweight two-color fixture already exists.
4. `src/js/preview.js` confirms `loadOFF()` is the relevant parser path and that the color override, legend, auto-bed, grid opacity, and debug-overlay logic live there.
5. `src/main.js` confirms the 2D export menu handlers and the full generate/export pipeline live there, not in `main.js` without the `src/` prefix.
6. `src/js/edit-actions-controller.js` confirms the viewport-image path uses `canvas.toBlob()` for clipboard image export.

## Required corrections

1. Create the actual deliverable file at workspace root: `multi_color_coff_parity.plan.md`.
2. Rebuild the document on the exact `queue-plan.md` skeleton instead of the current freeform layout.
3. Add `Validation summary`, `Playbook basis`, `Operating rules`, `Fresh chat opener`, the three checklists, `Master checklist`, `Phase details`, `Deferred follow-on work`, and `Exit criteria` in template order.
4. Configure `Operating rules` with the project-specific settings the prompt required:
   `pixi run` preferred, `npm run` fallback; commit via `.git/COMMIT_MSG` plus `git commit -F`; frozen layers are `public/wasm/` and vendored fonts.
5. Add a `Hallucination safeguards` section with explicit `OBSERVED` / `INFERRED` / `UNVERIFIED` discipline and a rule against asserting runtime behavior from code reading alone.
6. Copy and configure the `Session-start`, `Phase intake`, and `Phase completion` checklists for this project.
7. Add a master checklist covering all phases 0 through 5.
8. For every phase, include the full template-style field set:
   `Suggested prompt`, exact `Re-read` paths, `Implement only`, `Validation focus`, `Do not widen into`, `Fallback gate`, and `Pause rule`.
9. Replace Phase 4's generic re-read text with exact file paths.
10. Add a fallback gate to Phase 5.
11. Add explicit pause rules to every phase: mark complete and end the chat.
12. Repeat regression protection inside every implementation phase, not only Phase 4:
   run `pixi run test` and confirm no regressions in SVG export, DXF export, render preview, and generate-and-export.
13. Tighten Phase 1 so the expected behavior is anchored to the Phase 0 desktop baseline or to a clearly documented reference derived from that baseline.
14. Refresh all file paths and line references, including correcting `main.js` to `src/main.js` where applicable.
15. Replace or fix unsupported claims such as the screenshot `toDataURL()` reference, and name exact validation evidence instead of vague `some E2E tests` wording.
16. Add the prompt-specified `Exit criteria` section verbatim in meaning.

## Final assessment

The current artifact is a strong draft, but it is **not yet executor-ready** under the stated prompt. It should be rewritten as `multi_color_coff_parity.plan.md` in the workspace root, on the exact queue-plan scaffold, with the evidence and per-phase guardrails tightened before any execution chat begins.
