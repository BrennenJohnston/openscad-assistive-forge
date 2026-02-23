# Session Boundary Protocol

When a task spans multiple AI sessions, each session boundary is an information
loss event. The context carried over from a prior session is compressed, lossy,
and unreliable for anything that depends on source document content. This guide
defines rules to prevent that loss from corrupting your work.

**Why this exists:** Multi-session tasks produced confident, plausible, and wrong
output because the AI worked from compressed prior-session context instead of
re-reading source documents. The errors were undetectable without comparing
derivatives against their original sources.

## Re-read before rewrite

When resuming a multi-session task, any source document whose content is needed
for the current session's work must be re-read in full. Compressed context from
a prior session is not a substitute for direct reading.

This rule has no exceptions. If you need the content of a document to produce
a derivative (summary, synthesis, plan, recommendation), you must have read that
document in the current session. "I read it last session" is not sufficient —
session boundaries degrade content with the same severity as delegation to a
lower-tier model.

## Session handoff inventory

At the start of any resumed session, produce this inventory before doing any
other work:

1. **What was completed in prior sessions** — list artifacts produced, with
   their current status (verified, unverified, untrusted)
2. **What source documents are needed for this session's work** — list every
   source that will inform the current session's output
3. **Which documents must be re-read vs. which are only needed for mechanical
   reference** — a document needed for comprehension must be re-read; a document
   needed only for a file path or a format example can be referenced from context

Prioritize re-reading documents whose content was processed in the middle of
the prior session (neither the first nor last items worked on). Positional bias
research demonstrates that content in the middle of a long context window is
most susceptible to lossy compression — the model retains beginnings and endings
better than middles [R2, Liu et al., TACL 2024].

## Fabrication self-check

Before writing any derivative from a source document, answer this question
honestly:

> "Did I read this document in the current session, or am I working from
> carried-over context?"

If the answer is "carried-over context," stop and re-read the document before
proceeding. This applies even when you feel confident about the content. The
failure mode this check prevents is not uncertainty — it is confident
fabrication from degraded memory.

This check is especially important for:

- Attributed quotes (did the person actually say this?)
- Participant lists (was this person actually in this meeting?)
- Specific numbers, dates, or findings (is this figure accurate?)
- Topic descriptions (did the document actually cover this?)

## Verbatim quote verification

When attributing a quote to a source:

- Verify the quote appears in the source document in the current session
- If you cannot verify, label it as a paraphrase, not a direct quote
- Never present paraphrased content in quotation marks
- If the source is unavailable for verification, state that explicitly rather
  than guessing

## Relationship to delegation rules

Session-boundary context loss is functionally equivalent to delegation to a
lower-tier model. The same rules in
[AI_TASK_DELEGATION_RULES.md](AI_TASK_DELEGATION_RULES.md) apply: if you would
not delegate the task to a subagent, you must not rely on carried-over context
for it.

See also: [multi-session-handoff.md](../checklists/multi-session-handoff.md) for
the operational checklist.

### Project-specific configuration

- **Session handoff log location:** `[CONFIGURE: e.g., .cursor/session-logs/, project wiki, or "inline in chat"]`
- **Source document root:** `[CONFIGURE: e.g., docs/, research/, or specific folder path]`
- **Maximum sessions before mandatory human review:** `[CONFIGURE: e.g., 2 sessions]`
