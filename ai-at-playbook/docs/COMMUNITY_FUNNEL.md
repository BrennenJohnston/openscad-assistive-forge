# Finding Users + Building Welcoming Communities

This guide translates Open Source Guides Sections 5-7 into lightweight community
guardrails for AT projects. The goal: earn users, retain contributors, and reduce
maintainer load -- without adding bureaucratic overhead.

**Source:** Open Source Guides (Sections 5-7), team discussion transcripts.

## Minimal "home" + message

- Define ONE canonical home URL (README and/or project website)
- Provide a one-paragraph "why this exists" that is written for users (not just
  developers)
- Include a "Start Here" path for both users and contributors (tie to your triage
  pipeline and your SLA targets)

### Template (for your README)

```markdown
## Why this exists

[CONFIGURE: one paragraph, written for users, explaining what this project does
and why it matters. Use warm, human language -- not marketing copy.]

## Start here

- **Users:** [CONFIGURE: link to user-facing documentation or demo]
- **Contributors:** See `CONTRIBUTING.md` for how to help
```

## Contributor funnel scaffold

Design for the funnel: user -> casual contributor -> repeat contributor -> maintainer.
Reduce friction at each step.

- **Maintain a curated `good first issue` set** that stays small and accurate. Close
  or relabel issues when they stop being beginner-friendly.
- **Provide non-code on-ramps**: docs fixes, link checks, accessibility test recordings,
  alt-text PR events
- **Use short "thanks + next step" reply macros** (human tone, no corporate bloat)

### Project-specific configuration

- **"Good first issue" label:** `[CONFIGURE: label name]`
- **Non-code contribution types:** `[CONFIGURE: e.g., docs, link checks, accessibility testing, alt-text PRs]`
- **Reply template location:** `[CONFIGURE: e.g., .github/SAVED_REPLIES/ or just kept in your head]`

## Alt-text contribution PR template (non-code on-ramp)

From team discussion: "You make a PR with between six to ten images with ellipses in
the alt text. And then a group can come along and make those changes on GitHub."

This is a tested, inclusive contribution pattern for AT projects:

1. Maintainer creates a PR with placeholder alt text (`alt="..."` or
   `alt="[needs description]"`)
2. Contributors fork and fill in real descriptions from their own perspective
3. All contributors appear in project history -- non-code contribution is first-class
4. Can be run as a community event (e.g., "Alt Text Sprint") with minimal coordination

```markdown
# Template: Alt-Text Contribution PR

## What this PR does
Adds placeholder alt text to [N] images that need human-written descriptions.

## How to contribute
1. Fork this PR branch
2. Open each image and write a description that conveys its meaning in context
3. Replace the `[needs description]` placeholder with your text
4. Submit your changes as a PR against this branch

## Guidelines
- Describe what the image communicates, not just what it shows
- Keep descriptions under 150 characters when possible
- If you are a screen reader user, your perspective is especially valuable here
```

## Public process defaults

- Prefer public notes: decisions, meeting takeaways, and roadmap updates should land
  as issues/discussions
- Provide a single public channel (Discussions/Issues) so maintainers aren't pulled
  into private DMs

### Project-specific configuration

- **Public communication channel:** `[CONFIGURE: e.g., GitHub Issues, GitHub Discussions, Discord]`
- **Response time target:** `[CONFIGURE: e.g., "we respond to new issues within 7 days" -- aligned with your SLA targets in OSS_WORKFLOW_METRICS.md]`
