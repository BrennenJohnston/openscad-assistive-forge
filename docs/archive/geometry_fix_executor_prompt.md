# Geometry Fix Investigation — Recyclable Phase Execution Prompt

> **Archived 2026-08-16.** This was a prompt for driving an AI chat through a
> phased investigation, built on the external `ai-at-playbook` framework, which
> is not part of this repository. The investigation it drove is over and nothing
> in the repository referenced this file. It is kept as a record of how that
> work was run. Do not follow it — among other things it tells you to run
> `bloat-scan`, a command removed in the same release that archived this file.

Paste the prompt below verbatim into each fresh AI chat to execute the next
phase. Do not modify the prompt between phases — only the plan file's internal
state advances.

**Playbook basis:** `ai-at-playbook/templates/build-plan-executor-prompt.md`

---

## Prompt (copy from here to end of file)

You are implementing exactly one phase of a structured, multi-session build
plan for the OpenSCAD Assistive Forge project. The full plan, including
operating rules, hallucination safeguards, checklists, phase specifications,
file references, and fallback gates, lives in a single authoritative document:
`c:\Users\WATAP\.cursor\plans\geometry_fix_investigation_29992e80.plan.md`

### Your instructions

1. **Read the plan file in full** before doing anything else. Do not skim —
   the plan contains operating rules, hallucination safeguards, a conditional
   Phase 4 gate, and scope fences that govern your behavior for the entire
   session.

2. **Identify the next pending phase** by inspecting the `todos` frontmatter
   block at the top of the plan. Find the first item whose `status` is
   `pending` — that is the phase you will implement. Do not skip phases. Do
   not implement more than one phase.

   **Phase 4 gate:** If the next pending phase is Phase 4 (`wasm-update`),
   check whether Phases 1-3 have brought browser geometry within acceptable
   tolerance of the desktop reference (same vertex/facet counts within ~10%
   of desktop Nightly). If they have, mark Phase 4 as `completed` with a
   note "Geometry within tolerance — WASM update not needed" and proceed to
   Phase 5 instead. If they have not and Phase 4 is pending, STOP and tell
   the user that Phase 4 requires manual WASM binary replacement with human
   approval before proceeding.

3. **Execute all three checklists** defined in the plan, in order:
   - **Session-Start Checklist** — verify plan state, prior phase
     completions, and scope boundaries before touching any code.
   - **Phase Intake Checklist** — confirm the phase is tightly scoped,
     patterns are identified, and validation targets are set.
   - After implementation, **Phase Completion Checklist** — confirm tests
     pass, lints pass, plan is updated, and the chat stops.

4. **Follow the Operating Rules exactly** (Section "Operating Rules" in the
   plan). Key constraints:
   - Re-read only the files listed for the current phase, plus the nearest
     existing tests.
   - Do not mark a phase complete until its validation checklist has actually
     been executed in this session.
   - If the phase expands beyond its listed files, stop and write a
     micro-plan instead.
   - Use `pixi run <task>` for all commands; fall back to `npm run <task>`
     only if Pixi is unavailable.

5. **Respect the Hallucination Safeguards** (Section "Hallucination
   Safeguards" in the plan). Every code claim must cite file and line.
   Distinguish OBSERVED / INFERRED / UNVERIFIED. Do not assert browser
   behavior or geometry output from code reading alone.

6. **If the phase has a suggested persona prompt**, read the prompt file at
   the path listed in the phase details and adopt that prompt's ROLE,
   CONSTRAINTS, and DO NOT rules for this session. Do not stack multiple
   persona prompts.

7. **Honor the phase's FALLBACK GATE.** If the primary approach hits a
   roadblock, downgrade to the documented fallback for that phase and
   continue. Document the decision in the plan.

8. **After validation passes:**
   - Update the phase's `status` in the plan frontmatter from `pending` to
     `completed`.
   - Check off the matching line in the master checklist.
   - For Phase 2 (geometry diagnostic): append the baseline measurement
     results to the plan's phase details section.
   - For implementation phases (1, 3, 5): commit using the project's git
     convention. Write the commit message to `.git/COMMIT_MSG` and commit
     with `git commit -F .git/COMMIT_MSG`. Never use `git commit -m`.
     Use conventional commit prefix (`fix:`, `feat:`, `test:`). Explain
     the root cause, not just the symptom. Include the AI disclosure
     trailer `Assisted-By: Cursor` on the last line of the commit body.
     After committing, verify no unwanted `Co-authored-by` trailers were
     injected.
   - **Stop.** Do not begin the next phase. Do not suggest continuing.

### Environment context

- **Workspace:** `c:\Users\WATAP\Documents\github\openscad-assistive-forge`
- **OS:** Windows 10 (PowerShell)
- **Environment tool:** `pixi run` preferred; `npm run` fallback. See
  `pixi.toml` for available tasks. Key tasks: `test`, `lint`, `format`,
  `build`, `bloat-scan`, `import-check`.
- **Git convention:** Commit messages go in `.git/COMMIT_MSG` and are
  committed with `git commit -F .git/COMMIT_MSG`. Never use `git commit -m`.
  Work from the `develop` branch.
- **Frozen layers:** Layer 1 (WASM binary in `public/wasm/`): frozen. Never
  modify unless explicitly executing Phase 4 with human approval. Layer 2
  (vendored libraries in `public/libraries/`): frozen always.
- **Prompt library:** `ai-at-playbook/prompts/` — each phase lists its
  suggested prompt from this directory.
- **Desktop reference data:** `docs/audit/testing-round-7/reference-data/
  cli-extracts/nightly/` — baseline geometry statistics for comparison.
- **Plan file location:** `.cursor/plans/` — outside git. Update with file
  tools; do not `git add` or commit the plan file.

### What success looks like

At the end of this session, exactly one phase has moved from `pending` to
`completed` in the plan frontmatter, its validation has been executed and
passed, diagnostic data or clean commits exist as appropriate, and the
chat has stopped without beginning another phase.
