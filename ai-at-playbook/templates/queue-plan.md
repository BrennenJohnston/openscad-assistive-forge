---
name: "[CONFIGURE: Queue name, e.g., Sprint 4 Bugfix Queue]"
overview: "[CONFIGURE: 1-2 sentence description of this queue's purpose]"
todos:
  - id: phase-01-short-slug
    content: "Phase 1: [CONFIGURE: one-line description]"
    status: pending
  - id: phase-02-short-slug
    content: "Phase 2: [CONFIGURE: one-line description]"
    status: pending
  - id: phase-03-short-slug
    content: "Phase 3: [CONFIGURE: one-line description]"
    status: pending
isProject: false
---

# [CONFIGURE: Queue Title]

## Validation summary

[CONFIGURE: 2-3 sentences explaining why this queue was structured this way.
Reference the original source of the work items (issue tracker, audit report,
stakeholder feedback) and explain how the phases were decomposed.]

## Playbook basis

Validated against:

- `ai-at-playbook/docs/QUEUE_EXECUTOR_WORKFLOW.md`
- `ai-at-playbook/docs/SESSION_BOUNDARY_PROTOCOL.md`
- `ai-at-playbook/checklists/multi-session-handoff.md`
- `ai-at-playbook/checklists/ai-task-scoping.md`
- `ai-at-playbook/prompts/README.md`

## Operating rules

1. Implement exactly one phase per AI chat.
2. Re-read this plan in the current session before touching the next phase.
3. Re-read only the files listed for the current phase, plus the nearest existing tests or evidence needed for that phase.
4. Do not mark a phase complete until its validation checklist has actually been executed in that same chat.
5. After validation, update both the frontmatter `todos` status and the master checklist in this file.
6. After updating the checklist, stop. Do not continue to the next phase in the same chat.
7. After two validated phases, pause for human review before opening more AI chats.
8. If a phase expands beyond its listed files or becomes an architecture/design problem, stop and write a new micro-plan instead of widening this one.
9. Use the environment tool for validation: prefer `[CONFIGURE: e.g., pixi run <task>]`; if unavailable, use the matching `[CONFIGURE: e.g., npm run <task>]` command.
10. Use one suggested `ai-at-playbook` prompt per chat if a prompt is listed. Do not stack multiple prompts in the same session.

## Fresh chat opener

Copy this into a new chat at the start of each phase:

```markdown
Read `[CONFIGURE: full path to this plan file]`, run the multi-session handoff checklist, verify which phases are already validated, and implement only the next unchecked phase. Use the suggested `ai-at-playbook` prompt for that phase if listed. Stop after validation, update the plan checklist, and do not continue to another phase in this chat.
```

## Session-start checklist

Use this at the top of every new chat before implementation begins:

```markdown
### Multi-session handoff

- [ ] Plan file re-read in current session
- [ ] Current phase status verified against actual code/tests
- [ ] Source files and test files for this phase listed
- [ ] Re-read decisions made for each source
- [ ] No earlier phase marked complete without validation
- [ ] Scope boundary confirmed: only this phase will be worked
- [ ] Prior session artifacts reviewed for verification status
- [ ] Fabrication self-check acknowledged
```

## Phase intake checklist

Run this before starting edits in each fresh chat:

```markdown
### AI task scoping

- [ ] This phase is still one tightly scoped bug fix
- [ ] Existing pattern or gold standard identified
- [ ] Test or validation target identified before editing
- [ ] Inputs and outputs for this phase are explicit
- [ ] Validation will use the project environment tool
- [ ] No new dependency is needed; if one seems needed, stop and do OSS-first review first
```

## Phase completion checklist

A phase is only complete when every applicable item below is done:

```markdown
### Phase completion

- [ ] Focused implementation for this phase is complete
- [ ] Relevant tests were added or updated
- [ ] Targeted validation passed through the project environment tool
- [ ] Linting completed for touched files when applicable
- [ ] Build completed when runtime or UI behavior changed materially
- [ ] Accessibility-sensitive phases also ran relevant keyboard/screen-reader checks
- [ ] Plan checklist updated after validation
- [ ] Chat stopped without beginning the next phase
```

## Master checklist

- [ ] Phase 1. [CONFIGURE: short description]
- [ ] Phase 2. [CONFIGURE: short description]
- [ ] Phase 3. [CONFIGURE: short description]

## Phase details

### Phase 1 -- [CONFIGURE: short name] (`[CONFIGURE: issue ref if applicable]`)

- Suggested prompt: `[CONFIGURE: e.g., ai-at-playbook/prompts/10-bug-triage.md]`
- Re-read: `[CONFIGURE: exact file paths, comma-separated]`
- Implement only: [CONFIGURE: single sentence describing the narrowest change]
- Validation focus: [CONFIGURE: single sentence describing how to verify]
- Do not widen into: [CONFIGURE: name the most likely scope escape vectors]
- Pause rule: once validation passes, mark Phase 1 complete and end the chat

### Phase 2 -- [CONFIGURE: short name] (`[CONFIGURE: issue ref if applicable]`)

- Suggested prompt: `[CONFIGURE: prompt path]`
- Re-read: `[CONFIGURE: exact file paths]`
- Implement only: [CONFIGURE: narrowest change]
- Validation focus: [CONFIGURE: verification method]
- Do not widen into: [CONFIGURE: scope fences]
- Pause rule: once validation passes, mark Phase 2 complete and end the chat

### Phase 3 -- [CONFIGURE: short name] (`[CONFIGURE: issue ref if applicable]`)

- Suggested prompt: `[CONFIGURE: prompt path]`
- Re-read: `[CONFIGURE: exact file paths]`
- Implement only: [CONFIGURE: narrowest change]
- Validation focus: [CONFIGURE: verification method]
- Do not widen into: [CONFIGURE: scope fences]
- Pause rule: once validation passes, mark Phase 3 complete and end the chat

## Deferred follow-on work

[CONFIGURE: List any work items that were intentionally excluded from this
queue and explain why. Common reasons: cross-cutting concern that spans too
many files, architecture decision needed first, depends on evidence from
multiple earlier phases.]

## Exit criteria

This queue is done only when:

- All master checklist items are validated and checked off
- Each completed phase has its matching frontmatter `todo` marked complete
- No phase was marked complete before its validation step ran
- Any remaining follow-on work has a separate plan instead of being folded back into this queue
