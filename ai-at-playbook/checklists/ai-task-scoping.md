# AI Task Scoping Checklist

Run this checklist before giving any task to an AI agent. It is a human-enforced
gate — the developer runs it, not the AI. AI agents achieve roughly 30% compliance
with written standard operating procedures on difficult domains [S13, SOPBench].
Pre-task scoping by a human is the most reliable way to prevent scope escape,
over-abstraction, and dependency creep.

For the full task boundary definitions, see
[AI_TASK_DELEGATION_RULES.md](../docs/AI_TASK_DELEGATION_RULES.md).

## Checks

| # | Check | Method | Blocking? |
| --- | --- | --- | --- |
| 1 | Task is one function or component | Verify the task targets a single function, component, or tightly-scoped unit. Not a whole feature, module, or architectural decision. | Yes |
| 2 | Gold standard exists for this pattern | Verify a human-crafted, reviewed implementation of this pattern already exists in the codebase. AI replicates patterns; it does not design them. | Yes |
| 3 | Tests define expected behavior | Verify tests exist that specify what the output should do. The test is the spec. AI-generated code that passes human-written tests is acceptable; AI-generated tests of AI-generated code are not a sufficient quality gate. | Yes |
| 4 | Inputs and outputs are explicit | Verify the task description specifies input files, expected output, and boundary conditions. Vague prompts produce vague results. | Yes |
| 5 | Task runs inside environment tool | Verify the task will execute inside the project's environment tool, not raw shell. | Warning |
| 6 | Task is on the AI-appropriate list | Verify the task is something AI does well: boilerplate, pattern replication, test implementations (from human specs), documentation drafts, quality infrastructure, formatting. Not: architecture, first implementations, design decisions, domain-specific content where false positives create harm. | Yes |

## Copy-paste checklist (for task handoff)

```markdown
### AI task scoping (run before delegating to AI)

- [ ] Task is one function or component (not a whole feature)
- [ ] Gold standard implementation exists for this pattern
- [ ] Tests exist that define the expected behavior
- [ ] Input files and output expectations are explicit
- [ ] Task runs inside the project environment tool
- [ ] Task is on the AI-appropriate list (not architecture, design, first implementations, or domain-critical content)
```

### Project-specific configuration

- **AI-appropriate tasks for this project:** `[CONFIGURE: e.g., boilerplate, pattern replication, test implementations, docs drafts, linting rules, CI configs]`
- **AI-inappropriate tasks for this project:** `[CONFIGURE: e.g., architecture decisions, first implementations, design decisions, alt text, 3D models, user-facing text requiring domain knowledge]`
- **Gold standard location:** `[CONFIGURE: e.g., src/components/Button.tsx as the component gold standard]`
- **Environment tool:** `[CONFIGURE: e.g., Pixi, Nix, conda]`
