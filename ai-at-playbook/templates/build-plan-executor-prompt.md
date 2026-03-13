# Build Plan Executor — Recycled Phase Prompt

A reusable prompt template designed to be pasted verbatim into each fresh AI
chat session to execute exactly one phase of a multi-session build plan. The
prompt never changes between phases — only the plan file's internal state
advances.

**Origin:** Validated against the parity remediation build plan (2026-03),
where this prompt pattern achieved 100% phase completion across all sessions
with zero prompt drift and zero scope escape incidents.

**Relationship to queue executor:** The queue executor prompt
(`prompts/17-queue-executor.md`) is optimized for batched bugfix queues with
persona rotation. This template is optimized for structured build plans and
remediation plans that carry their own operating rules, hallucination
safeguards, and fallback gates inside a single authoritative plan document.

---

## How to use

1. **Write your build plan first.** The plan file is the single source of
   truth. It must contain: frontmatter `todos` with phase status tracking,
   operating rules, hallucination safeguards (if applicable), three
   checklists (session-start, phase-intake, phase-completion), phase
   specifications with file lists and validation targets, and fallback gates
   for each phase.

2. **Fill in the `[CONFIGURE: ...]` placeholders** in the prompt template
   below. Most are one-time settings (workspace path, OS, environment tool).

3. **Paste the completed prompt into a fresh AI chat** to execute the next
   pending phase. Do not modify the prompt between phases.

4. **After the AI completes one phase and stops,** review the changes, then
   open a new chat and paste the same prompt again for the next phase.

---

## Prompt template

Copy everything between the `---` delimiters below into your AI chat.

---

### Build Plan — Phase Execution Prompt

You are implementing exactly one phase of a structured, multi-session build
plan for the [CONFIGURE: project name] project. The full plan, including
operating rules, hallucination safeguards, checklists, phase specifications,
file references, and fallback gates, lives in a single authoritative document:
`[CONFIGURE: full path to the plan file]`

#### Your instructions

1. **Read the plan file in full** before doing anything else. Do not skim —
   the plan contains operating rules, non-negotiable boundaries, and
   hallucination safeguards that govern your behavior for the entire session.

2. **Identify the next pending phase** by inspecting the `todos` frontmatter
   block at the top of the plan. Find the first item whose `status` is
   `pending` — that is the phase you will implement. Do not skip phases. Do
   not implement more than one phase.

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
   - [CONFIGURE: environment tool command prefix, e.g., "Use `pixi run <task>` for all commands; fall back to `npm run <task>` only if Pixi is unavailable."]

5. **Respect the Hallucination Safeguards** (Section "Hallucination
   Safeguards" in the plan). Every code claim must cite file and line.
   Distinguish OBSERVED / INFERRED / UNVERIFIED. Do not assert browser
   behavior from code reading alone.

6. **Honor the phase's FALLBACK GATE.** If the primary approach hits a
   roadblock, downgrade to the documented fallback for that phase and
   continue. Document the decision.

7. **After validation passes:**
   - Update the phase's `status` in the plan frontmatter from `pending` to
     `completed`.
   - Append a brief completion record (result, any fallback decisions) to
     the phase's section in the plan body.
   - Commit using the project's git convention.
     [CONFIGURE: commit instructions, e.g., "Write message to `.git/COMMIT_MSG`, commit with `-F`; never use `-m`."]
   - **Stop.** Do not begin the next phase. Do not suggest continuing.

#### Environment context

- **Workspace:** `[CONFIGURE: full workspace path]`
- **OS:** [CONFIGURE: e.g., Windows 11 (PowerShell), macOS (zsh), Linux (bash)]
- **Environment tool:** [CONFIGURE: e.g., "`pixi run` preferred; `npm run` fallback. See `pixi.toml` for available tasks."]
- **Git convention:** [CONFIGURE: e.g., "Commit messages go in `.git/COMMIT_MSG` and are committed with `git commit -F .git/COMMIT_MSG`. Never use `git commit -m`."]
- **Frozen layers:** [CONFIGURE: e.g., "Layer 1 (WASM binary): frozen. Never modify." or "None."]
- **Test baseline:** [CONFIGURE: e.g., "~1600+ unit tests across 47 files. All must pass after your changes." or describe your test suite.]

#### What success looks like

At the end of this session, exactly one phase has moved from `pending` to
`completed` in the plan frontmatter, its validation has been executed and
passed, a clean commit exists, and the chat has stopped without beginning
another phase.

---

## Why this prompt structure works

The prompt is a **thin orchestration layer** — it tells the AI *how to read
and follow the plan*, not what to build. All implementation specifics live in
the plan file. This design has several advantages:

| Property | Benefit |
| --- | --- |
| Recycled verbatim | Zero prompt drift between phases; zero human effort per session beyond "paste and go" |
| Plan-first discipline | The AI reads the full plan before acting, preventing partial-context errors |
| State-driven phase selection | The AI finds the next pending phase from frontmatter, not from human instruction |
| Three-gate checklist protocol | Session-start, intake, and completion gates prevent scope escape and premature completion |
| Rules by reference | Operating rules and safeguards live in the plan, keeping the prompt short and the plan authoritative |
| Fallback gate awareness | Each phase can degrade gracefully without human intervention |
| Environment context block | Workspace, OS, tools, and constraints stated once — the AI doesn't guess |
| Hard stop enforcement | Explicit "do not begin the next phase" prevents session-boundary violations |
| Success definition | "What success looks like" gives the AI a self-evaluation target |

## Plan file requirements

For this prompt to work, the plan file must contain:

1. **Frontmatter `todos`** with `id`, `content`, and `status` (`pending` /
   `in_progress` / `completed`) for each phase
2. **Operating rules section** with numbered rules governing execution
3. **Hallucination safeguards section** (recommended for complex plans)
4. **Three checklists:** session-start, phase-intake, phase-completion
5. **Phase specifications** with:
   - File list (exact paths to re-read)
   - Implementation scope (single sentence)
   - Validation focus (single sentence)
   - Fallback gate (what to do if the primary approach fails)
   - Scope fences ("do not widen into")
   - Pause rule ("mark complete and end the chat")
6. **Deferred follow-on work section** for items intentionally excluded
7. **Exit criteria** for the entire plan

See `templates/queue-plan.md` for a compatible plan file template. The queue
plan template can serve as the plan file structure for this executor prompt
with minor additions (hallucination safeguards, fallback gates).

## Adapting for your project

| Placeholder | What to fill in |
| --- | --- |
| `[CONFIGURE: project name]` | Your project's display name |
| `[CONFIGURE: full path to the plan file]` | Absolute path to the `.plan.md` file |
| `[CONFIGURE: environment tool command prefix]` | How to run tasks (e.g., `pixi run`, `npm run`, `make`) |
| `[CONFIGURE: commit instructions]` | Your project's commit convention |
| `[CONFIGURE: full workspace path]` | Absolute path to the workspace root |
| `[CONFIGURE: OS]` | Operating system and shell |
| `[CONFIGURE: frozen layers]` | Files or layers the AI must never modify |
| `[CONFIGURE: test baseline]` | Number and location of existing tests |

## Anti-patterns to avoid

1. **Editing the prompt between phases** — The whole point is that it's
   recycled. If you need phase-specific instructions, put them in the plan
   file, not the prompt.
2. **Omitting the environment context block** — Without explicit OS, tool,
   and path information, the AI will guess wrong on Windows/macOS/Linux
   differences.
3. **Skipping the hallucination safeguards reference** — For complex plans
   with many files, the safeguards prevent confident-but-wrong code claims.
4. **Removing the hard stop** — Without "do not begin the next phase," the
   AI will attempt to continue and context will degrade.
5. **Using this for single-phase work** — If your plan has only one phase,
   a simple prompt is more efficient. This template shines at 3+ phases.
