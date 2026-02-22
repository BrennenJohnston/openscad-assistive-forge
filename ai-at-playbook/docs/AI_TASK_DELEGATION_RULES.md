# AI Task Delegation Rules

When AI agents can delegate work to subagents or lower-tier models, you need
clear rules about what's safe to hand off and what isn't. This guide defines
the boundary.

The short version: if the task requires *understanding* source material, the
primary model must do it. If the task is mechanical, delegation is fine.

## Why this matters

The `research_analysis_plan_ce9d6056` incident (2026-02-21) demonstrated the
failure mode. An agent delegated the core work of a research plan -- reading,
comprehending, and summarizing 27 primary source documents -- to lower-tier
subagents. The resulting summaries became the foundation for all downstream
synthesis and development planning. Every artifact built on those summaries
inherited their errors.

This is not hypothetical risk. It happened, and the entire research output had
to be marked untrusted.

## Comprehension-critical tasks (NEVER delegate)

Any task where the AI must read, understand, and reason about source material
to produce derivative artifacts. This includes:

- Summarizing documents
- Analyzing meeting transcripts
- Extracting requirements from source material
- Synthesizing themes across multiple documents
- Making architecture recommendations from source review
- Writing documentation that encodes new project understanding (requirements,
  specs, transcript-derived summaries)

These tasks MUST be performed by the primary model in the session -- not by
subagents, task tools, or any other delegation mechanism, regardless of the
subagent's advertised model tier. Context fragmentation across subagents
degrades comprehension even at the same tier.

## Delegation-safe tasks (may delegate)

- File operations (create, copy, move, rename)
- Formatting and template scaffolding
- Running commands and scripts
- Mechanical transformations (converting file formats, renaming, reformatting)
- Simple lookups (file existence, grep for a string)
- Code modifications with explicit, unambiguous instructions

The dividing line: if you could write a precise, mechanical specification for
the task that a person with no domain knowledge could follow -- it's safe to
delegate. If the task requires judgment about what the source material *means*
-- it's not.

## The compounding error principle

When a lower-fidelity summary feeds a synthesis step, errors do not stay
contained. They propagate and amplify. Each layer of derivation from a flawed
source increases the error surface. A research base built on delegated summaries
poisons every downstream artifact: backlogs, architecture decisions, roadmaps.

This is the same class of risk as building on untested code, but harder to
detect -- a plausible-sounding summary with subtle inaccuracies looks correct
until you compare it against the original source.

## The "would you let a stranger summarize this?" test

If you would not trust a random person to read a document and tell you what it
says accurately enough to make decisions from their summary alone -- do not
delegate it to a subagent.

Meeting transcripts, planning discussions, audit reports, requirements
documents: these are all cases where the summarizer's comprehension directly
determines the quality of everything built downstream. Hand them to the
strongest model available.

## What "primary model" means

The model with the strongest reasoning capability available to the executing
agent at the time of the session. In Cursor, this is the model selected in your
model dropdown for the current chat. In Claude Code, it's the model running
your session.

If a plan requires comprehension-critical work and the only available model is
not the highest tier, **reduce scope or stop**. Do not down-tier and proceed.
A partial result from the right model is safer than a complete result from the
wrong one.

## Provenance labeling

Any derivative artifact created from primary sources must include a provenance
header:

```markdown
## Provenance
- **Sources**: [list of source documents]
- **Delegation**: None / [describe what was delegated and to what tier]
- **Verification**: Verified by primary model / Unverified / Untrusted
```

Artifacts labeled "Untrusted" or with comprehension-critical delegation must
be re-processed before use in downstream synthesis or decision-making.

## Budget-pressure guardrail

If you cannot afford to use the most capable model for comprehension-critical
work, reduce scope or stop. Do not down-tier and proceed.

The tokens saved on the reading step are dwarfed by the cost of acting on
inaccurate summaries, re-doing poisoned work, and the development time lost
to building on a flawed foundation. Reading 27 documents with the right model
costs less than re-planning a project because the summaries were wrong.

## Implicit delegation via context loss

The sections above cover explicit delegation — choosing to hand a task to a
subagent or lower-tier model. But delegation also happens implicitly when a task
spans multiple AI sessions.

When a session ends and a new one begins, the prior session's context is
compressed into a summary. That summary is a lossy version of the original
source content. The resumed session is effectively working from a lower-fidelity
representation of the source material — the same class of risk as subagent
delegation, triggered by infrastructure rather than agent choice.

**The rule:** Session-boundary context loss is functionally equivalent to
delegation to a lower-tier model. The same rules apply. If you would not
delegate the task to a subagent, you must not rely on carried-over context
for it.

This means:

- If you need to produce derivatives from source documents in a resumed session,
  re-read the source documents first
- If a prior session produced summaries you now need to build on, verify those
  summaries against the original sources before using them
- If the prior session's work includes unverified artifacts, treat them as
  untrusted until verified in the current session

For the full protocol, see
[SESSION_BOUNDARY_PROTOCOL.md](SESSION_BOUNDARY_PROTOCOL.md).

## Task appropriateness boundaries

The delegation rules above define what the primary model must do itself. This
section defines which tasks are appropriate for AI agents at all — regardless of
model tier.

**AI-appropriate tasks** (pattern replication, bounded scope):

- Boilerplate generation
- Repetitive pattern replication (after a human-crafted gold standard exists)
- Test implementations (when the spec is human-written)
- Documentation drafts (mechanical formatting, not comprehension-critical content)
- Quality infrastructure (linting rules, CI configs, accessibility checks)
- Formatting and mechanical transformations

**AI-inappropriate tasks** (novel design, unbounded scope):

- Initial architecture decisions
- First implementations of new patterns (before a gold standard exists)
- Design decisions (color, layout, UX flow)
- Domain-specific content where false positives create harm (e.g., alt text for
  assistive technology products, safety-critical documentation)
- Content requiring domain knowledge that the AI does not have
- `[CONFIGURE: additional AI-inappropriate tasks for your project]`

The dividing line: AI replicates patterns; humans design them. Once you have a
reviewed, human-crafted gold standard, AI can replicate it reliably. But AI
cannot design the first one — benchmarks show top models achieve only 33% on
difficult novel coding tasks and 21% on research paper replication [R4, FunCoder,
NeurIPS 2024].

Task appropriateness is enforced by the human before delegating, not by the AI
during execution. See
[ai-task-scoping.md](../checklists/ai-task-scoping.md) for the pre-task
checklist.

## Multi-output verification for accessibility-critical content

When AI generates accessibility-critical content (error messages, form labels,
status announcements, ARIA descriptions, navigation text), a single AI-generated
output is insufficient. Research shows that presenting multiple AI-generated
variations increases users' ability to detect unreliable information by 4.9x
compared to a single output [S15, Multi-MLLM, 2025].

**Rule:** For accessibility-critical content, generate outputs from at least two
independent prompts or models and compare. Discrepancies between outputs
indicate areas requiring human review. If all outputs agree, human review is
still required but discrepancies get priority.

This applies to:

- Error messages and validation text announced by screen readers
- Form labels and instructions
- Status region announcements (`aria-live` content)
- Navigation landmarks and headings
- Any text where an inaccuracy creates an accessibility barrier

This does NOT apply to:

- Boilerplate code that passes automated accessibility tests
- Mechanical formatting or restructuring
- Content already covered by automated checks (axe-core, HTML validation)
