# Open Source Contribution AI Guide

This guide teaches AI coding tools how to handle open source contribution workflows —
issues, pull requests, community communication, and governance. It's based on the
GitHub Open Source Guides (CC-BY-4.0) and lessons from the origin project.

If you're adding this to your AI's rules, the whole point is: AI agents that touch
your open source project should follow the same norms that human contributors follow.
They need to be told explicitly, because they default to corporate-formal patterns that
damage community warmth.

**Source:** GitHub Open Source Guides (Sections 1-13), internal development
experience.

## Why this matters

This playbook is designed to be reusable by anyone in the AT field who wants to
learn AI-assisted development with proper guardrails.

AI agents that submit PRs, create issues, or interact with community members must follow
the same norms that human contributors follow — and must be told explicitly, because
they default to corporate-formal patterns that damage community warmth.

## AI agent issue creation guidance

When an AI agent creates or suggests a GitHub issue:

1. **Search first** — Check existing open AND closed issues before creating a new one
   (Open Source Guides Section 3.5: "do a quick check to make sure your idea hasn't
   been discussed elsewhere")
2. **Give context** — Explain what you're trying to do, what happened, and how to
   reproduce it. No "I noticed an issue with..." preambles.
3. **Keep it short and direct** — One issue, one problem. Do not bundle.
4. **Use the project's issue template** — If a template exists, fill it out completely.
   Never skip required fields.
5. **Label appropriately** — Use existing labels. Never create new labels without
   maintainer approval.
6. **Never create issues for work the AI is about to do itself** — If the AI is going to
   fix something, just fix it in a PR. Creating an issue first wastes maintainer
   attention.

### Project-specific configuration

- **Issue templates location:** `[CONFIGURE: path to issue templates, e.g., .github/ISSUE_TEMPLATE/]`
- **Required labels:** `[CONFIGURE: list of standard labels, e.g., bug, accessibility, enhancement]`
- **Triage process:** `[CONFIGURE: who triages issues, e.g., "maintainer reviews weekly"]`

## AI agent pull request guidance

When an AI agent creates or assists with a pull request:

1. **Keep PRs small** — "Small PRs land. Huge PRs usually stall." (Open Source Guides
   Section 7.3, Golden Rule 7)
2. **Reference the issue** — Link to the issue being addressed with "Closes #N" or
   "Fixes #N" syntax.
3. **Write a meaningful description** — Explain the WHY, not just the WHAT. Include:
   - What problem this solves
   - How it was tested
   - Any trade-offs or decisions made
4. **Contribute in the style of the project** — Match indentation, naming conventions,
   commit message format, and test patterns (Section 3.5: "Contribute in the style of
   the project to the best of your abilities").
5. **Draft PRs for work in progress** — Open as draft if not yet complete, so others can
   see progress without being asked to review unfinished work (Section 3.5).
6. **Respond to review feedback** — Never abandon a PR after opening it. If changes are
   requested, make them or explain why not.
7. **Never force-push to shared branches** — Unless explicitly asked by a maintainer.
8. **Include screenshots** for UI changes — Before and after, in both light and dark
   themes.

### Project-specific configuration

- **Base branch:** `[CONFIGURE: default branch for PRs, e.g., develop]`
- **Branch naming convention:** `[CONFIGURE: e.g., feat/short-name, fix/short-name]`
- **Commit message format:** `[CONFIGURE: e.g., conventional commits — feat:, fix:, docs:, test:, chore:]`
- **PR template location:** `[CONFIGURE: e.g., .github/PULL_REQUEST_TEMPLATE.md]`

## Communication norms for AI-assisted contributions

- **Keep all communication public** (Section 7.2) — Never DM maintainers unless
  discussing a security vulnerability or CoC violation.
- **Match the project's tone** — Read CONTRIBUTING.md and recent issue discussions to
  calibrate. Most AT/accessibility projects use a warm, human tone. AI defaults to
  corporate formality; override this.
- **Assume good intentions** (Section 3.5) — In code review, issue discussion, and
  community interaction.
- **Respect community decisions** (Section 3.5) — "If you disagree with their direction,
  you can always work on your own fork."
- **No emoji in technical contexts** unless the project's existing docs use them.

### Project-specific configuration

- **Communication channels:** `[CONFIGURE: e.g., GitHub Issues only, or Discord + Issues]`
- **Tone reference:** `[CONFIGURE: path to file that best represents the project's voice, e.g., CONTRIBUTING.md]`

## Governance awareness for AI agents

AI agents must NEVER:

- Make governance decisions (commit access, role assignments, policy changes)
- Create GOVERNANCE.md or modify existing governance documents without maintainer
  direction
- Override a maintainer's "no" on a PR or issue
- Create voting mechanisms or consensus processes

AI agents SHOULD:

- Respect the project's governance model (BDFL, meritocracy, liberal contribution)
  as documented in GOVERNANCE.md or inferred from maintainer behavior
- Defer to CODEOWNERS for review routing
- Recognize when a decision is above the AI's scope and flag it for human review

### Project-specific configuration

- **Governance model:** `[CONFIGURE: e.g., single maintainer (BDFL), or committee, or liberal contribution]`
- **CODEOWNERS path:** `[CONFIGURE: e.g., .github/CODEOWNERS]`

## Code of conduct awareness

AI-generated content (code comments, documentation, issue responses, PR descriptions)
must:

- Never use language that violates common Codes of Conduct (Contributor Covenant, etc.)
- Never use gendered pronouns when gender is unknown — use "they/them" or the person's
  name
- Never make assumptions about a contributor's ability, experience, or background
- Flag potential CoC violations in contributor interactions for human review rather than
  attempting to moderate directly

### Project-specific configuration

- **Code of Conduct:** `[CONFIGURE: path to CoC, e.g., CODE_OF_CONDUCT.md]`
- **Enforcement contact:** `[CONFIGURE: email or reporting mechanism for CoC violations]`

## Welcoming-community defaults (contributor funnel)

Based on Open Source Guides Section 6 ("Building Welcoming Communities"):

- **Design for the contributor funnel**: user -> casual contributor -> repeat
  contributor -> maintainer. Reduce friction at each step.
- **Keep "good first issue" real**: maintain a small, curated set of truly
  beginner-friendly issues; close or relabel when they stop being beginner-friendly.
- **Treat non-code work as first-class**: documentation, accessibility testing videos,
  link checks, tag audits, and content fixes are valid contributions.
- **Thank-first, not boilerplate**: short gratitude beats corporate templates. Use
  human language; avoid performative hype.
- **Publish response expectations**: even "we respond weekly" reduces contributor churn.
  Tie this to your project's SLA targets.

### Project-specific configuration

- **"Good first issue" label:** `[CONFIGURE: label name, e.g., "good first issue"]`
- **Response time target:** `[CONFIGURE: e.g., "we respond to new issues within 7 days"]`

## AI-assisted contribution transparency (project-configurable)

Some projects want AI assistance disclosed; others don't. This playbook supports both.

- **If required by the project**: add a single PR-template checkbox like
  "AI-assisted (scope: ___)" and keep it factual.
- **If not required**: do not over-emphasize tools; focus on evidence (tests,
  screenshots, reproduction steps).

This reduces ambiguity for reviewers and supports the "legacy code where history is
lost" recovery strategy (see `AT_SCOPE_GUIDE.md`).

### Project-specific configuration

- **AI disclosure policy:** `[CONFIGURE: "required" or "not required"]`
- **Disclosure format:** `[CONFIGURE: if required, e.g., "PR template checkbox" or "commit message tag"]`

## Open Source Guides section cross-reference

This guide draws from the following GitHub Open Source Guides sections:

| Guide Section | Topic | Where it's used above |
| --- | --- | --- |
| Section 3.5 | How to contribute | Issue creation, PR guidance, communication norms |
| Section 6 | Building welcoming communities | Contributor funnel defaults |
| Section 7.2 | Best practices for maintainers — public communication | Communication norms |
| Section 7.3 | Best practices for maintainers — keeping PRs small | PR guidance |
