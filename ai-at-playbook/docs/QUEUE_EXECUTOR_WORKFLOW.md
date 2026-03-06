# Queue Executor Workflow

A validated methodology for executing batched bug fixes, refactors, or
small-scoped tasks through session-isolated AI phases. Each phase is one
focused change, one validation gate, one checklist update, then a hard stop.

**Origin:** Validated against 15 micro-phases executed across the origin
project's Round 4+5 bugfix queue (2026-03). All 15 phases completed with
zero scope escape incidents and zero fabrication-from-context errors.

**Why this exists:** Broad-scope plans complete at 6%. Narrow-scope plans
complete at 50%. Queue executor plans decompose broad work into narrow
phases and enforce session boundaries between them, combining the
completion rate of narrow plans with the throughput of batch planning.

## When to use this workflow

Use the queue executor pattern when:

- You have 3+ related fixes, refactors, or small features to execute
- Each item can be scoped to 1-3 files
- Items have some dependency ordering but are individually completable
- You want to track progress across multiple AI sessions
- The work would otherwise become a sprint plan (7% completion rate)

Do NOT use this workflow for:

- Single bug fixes (use a simple plan instead)
- Architecture decisions (these need human design, not queued execution)
- Research tasks (use the research synthesis prompt instead)
- First implementations of new patterns (no gold standard exists yet)

## Architecture

The workflow has three artifacts that work together:

```
┌─────────────────────┐
│  Queue Plan File    │  Persistent state across sessions.
│  (frontmatter +     │  Lives outside git (e.g. .cursor/plans/).
│   phase specs)      │  Tracks todo status + master checklist.
├─────────────────────┤
│  Session Executor   │  Engineered prompt pasted into each
│  Prompt             │  fresh chat. Enforces the 8-step
│                     │  protocol. References the plan file.
├─────────────────────┤
│  Persona Prompts    │  One prompt per phase, selected from
│  (from library)     │  the prompt library. Gives the AI
│                     │  domain-specific constraints.
└─────────────────────┘
```

### Queue plan file

The plan file is the single source of truth for progress. It contains:

1. **Frontmatter todos** -- machine-parseable status for each phase
   (`pending`, `in_progress`, `completed`)
2. **Validation summary** -- why the plan was structured this way
3. **Operating rules** -- numbered rules that govern execution
4. **Checklists** -- session-start, phase-intake, phase-completion
5. **Master checklist** -- one line per phase with checkbox
6. **Phase details** -- one section per phase with:
   - Suggested prompt (from the prompt library)
   - Re-read file list (explicit paths, not vague descriptions)
   - Implementation scope (what to change)
   - Validation focus (how to verify)
   - "Do not widen into" boundaries (explicit scope fence)
   - Pause rule (stop after validation)
7. **Deferred follow-on work** -- items intentionally excluded and why
8. **Exit criteria** -- definition of "done" for the entire queue

### Session executor prompt

A meta-prompt that orchestrates each session. It enforces:

1. **Handoff inventory** -- re-read the plan, find the current phase
2. **Phase intake** -- verify the phase is still one tightly scoped fix
3. **Persona adoption** -- read and adopt the phase's suggested prompt
4. **Source re-read** -- read every file listed for this phase
5. **Implementation** -- make the narrowest change that satisfies scope
6. **Validation** -- run the phase's validation and confirm it passes
7. **Plan update** -- mark the phase complete, commit the change
8. **Hard stop** -- end the session without starting the next phase

The executor prompt is reusable across different queue plans. Only the plan
file path changes between projects.

### Persona prompts

Each phase selects one prompt from the prompt library (e.g., `10-bug-triage`,
`11-accessibility-remediation`, `03-css-design-tokens`). The session executor
reads and adopts that prompt's ROLE, CONSTRAINTS, and DO NOT rules for the
phase. Only one persona per session -- prompts are never stacked.

## Success factors (empirical)

These factors were validated across 15 phases:

### 1. Micro-phase decomposition

Each phase targets exactly one bug or change, scoped to 1-3 files. This
maps directly to the "narrow scope" category that completes at 50%.

**Anti-pattern avoided:** Sprint plans that bundle 4 bugs + 5 features
and complete at 7%.

### 2. Session isolation

One phase per chat. Fresh context each time. The human opens a new chat
for each phase. This prevents:

- Context-boundary fabrication (anti-pattern #7 in LESSONS_LEARNED)
- Scope escape across phases
- Accumulated context degradation over long sessions

### 3. Explicit scope fences

Every phase has a "Do not widen into" line that names the work the AI must
NOT touch. This is more effective than just listing what to do -- it
preemptively blocks the most likely scope escape vectors.

### 4. Validation-before-completion

No phase is marked complete until validation actually passes in that same
session. This directly implements the validation-before-completion rule
from PROCESS_CADENCE. A phase that was "implemented but not validated"
remains unchecked.

### 5. Plan file as state machine

The plan file's frontmatter todos and master checklist create a
machine-readable progress tracker. Each session reads the plan, finds the
first unchecked phase, and executes only that phase. The plan file persists
across sessions without being committed to git (it lives in
`.cursor/plans/` or equivalent).

### 6. Three-gate checklist protocol

Three checklists wrap every phase:

| Gate | When | Purpose |
| --- | --- | --- |
| Session-start | Before any work | Verify handoff, re-read sources, confirm scope |
| Phase intake | Before editing | Verify the phase is still one scoped fix |
| Phase completion | After validation | Verify tests, lints, build, plan update |

### 7. Persona rotation

Different phases need different expertise. A CSS contrast fix needs a
design-tokens persona; a worker stability fix needs a WASM debugging
persona. The queue plan maps each phase to the best-fit prompt, and the
session executor reads and adopts it.

### 8. Deferred follow-on work

Cross-cutting work that doesn't fit the queue gets an explicit "deferred"
section with reasoning for why it was excluded. This prevents the "just add
one more phase" drift that turns a focused queue into a sprint plan.

## Setting up a queue

### Step 1: Triage the work

List all the bugs, fixes, or small tasks. For each item, identify:

- The 1-3 files that need to change
- The validation method (test, lint, build, manual check)
- Dependencies on other items in the list

### Step 2: Order the phases

Place items in dependency order. If item B depends on understanding gained
from item A, A comes first. Items with no dependencies can be in any order,
but grouping related items helps the human reviewer.

### Step 3: Write the plan file

Use the queue plan template (`templates/queue-plan.md`). For each phase:

- Name the suggested prompt from the prompt library
- List every file to re-read (use exact paths, not vague descriptions)
- Write the "Implement only" scope as a single sentence
- Write the "Validation focus" as a single sentence
- Write the "Do not widen into" boundary naming the most likely scope escape
- Add the pause rule

### Step 4: Audit the plan

Before executing any phase, verify:

- All file paths resolve to real files in the codebase
- All test file references are accurate (or annotated as "needs creation")
- All prompt paths resolve to real files in the prompt library
- Phase ordering respects dependency chains
- "Do not widen into" clauses correctly defer to later phases
- No phase is secretly two fixes bundled together

### Step 5: Write the session executor prompt

Use the queue executor prompt template (`prompts/17-queue-executor.md`).
Fill in the plan file path and any shell-specific rules for your
environment. This prompt is reused for every phase -- only the plan file
path changes.

### Step 6: Execute phases

For each phase:

1. Open a fresh AI chat
2. Paste the session executor prompt (or reference it)
3. The AI reads the plan, finds the current phase, executes it
4. After validation passes, the AI updates the plan and commits
5. The AI stops. The human reviews and opens a new chat for the next phase.

### Step 7: Human review cadence

After every two validated phases, pause for human review of the accumulated
changes. This catches systematic issues that individual phase validations
might miss (e.g., inconsistent naming conventions across phases).

## Relationship to other playbook components

| Component | How the queue executor uses it |
| --- | --- |
| SESSION_BOUNDARY_PROTOCOL | Re-read discipline is enforced by the executor's Step 4 |
| multi-session-handoff checklist | Embedded in the plan's session-start checklist |
| ai-task-scoping checklist | Embedded in the plan's phase-intake checklist |
| Prompt library | Each phase selects one prompt; the executor reads and adopts it |
| PROCESS_CADENCE | Validation-before-completion rule is enforced by the executor's Step 6 |
| post-edit-verification | Phase completion checklist includes Tier 1 verification |
| LESSONS_LEARNED | Queue executor addresses anti-patterns #1 (scope overload), #3 (feature completion drift), #5 (architectural plans without decomposition), #7 (context-boundary fabrication) |

## Metrics

Track these to evaluate queue effectiveness:

| Metric | Target | Meaning |
| --- | --- | --- |
| Phase completion rate | >90% | Phases that pass validation on first attempt |
| Scope escape incidents | 0 | Phases where the AI touched files outside scope |
| Context fabrication incidents | 0 | Phases where the AI worked from stale context |
| Plan completion rate | 100% | All phases validated and checked off |
| Human review findings | Decreasing | Issues found during 2-phase review pauses |

## Failure modes to watch for

1. **Phase bundling** -- A phase that is secretly two fixes. Split it before
   executing.
2. **Vague re-read lists** -- "Read the relevant files" instead of exact paths.
   The executor will guess wrong.
3. **Missing "do not widen into"** -- Without explicit scope fences, the AI
   will expand into adjacent work.
4. **Skipped plan audit** -- Executing phases against a plan with wrong file
   paths wastes sessions.
5. **Skipped human review pauses** -- Systematic issues accumulate across
   phases and need periodic human inspection.
6. **Plan file drift** -- If the codebase changes between phases (e.g., a
   hotfix lands), re-audit affected phases before continuing.

### Project-specific configuration

- **Plan file location:** `[CONFIGURE: e.g., .cursor/plans/]`
- **Prompt library location:** `[CONFIGURE: e.g., ai-at-playbook/prompts/]`
- **Environment tool:** `[CONFIGURE: e.g., Pixi, Nix, npm]`
- **Shell rules:** `[CONFIGURE: e.g., PowerShell requires separate Shell calls instead of && chaining]`
- **Human review cadence:** `[CONFIGURE: e.g., every 2 validated phases]`
- **Max phases per queue:** `[CONFIGURE: e.g., 15-20; larger queues should be split into separate plans]`
