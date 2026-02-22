# Maintainer Sustainability for AI-Assisted Projects

Open source maintainer burnout is well-documented (Open Source Guides Section 2). But
AI-assisted development adds its own unique burnout patterns on top of the familiar ones.
This guide names them so you can watch for them, and gives you templates for setting
boundaries.

**Source:** Open Source Guides (Sections 2, 7), internal development experience.

## AI-specific burnout patterns

In addition to the standard open source burnout factors, AI-assisted development
introduces five new ones:

### 1. Context window fatigue

Constantly re-establishing project context for AI tools that lose state between sessions.
The maintainer becomes the human memory that the AI lacks. You end up explaining the
same architecture, the same constraints, the same "don't touch that file" rules over
and over.

### 2. Rule management overhead

Rules grow with every AI failure. Maintaining rules becomes a project unto itself.
Rule sets tend to grow unchecked as new edge cases surface. Every time the AI
does something wrong, you add a rule to prevent it. Soon you're spending more time
managing rules than writing code.

### 3. Output review exhaustion

AI generates more code faster than humans can review. The review bottleneck shifts from
writing to reading. A single AI session can produce changes across dozens of files --
and every line needs human verification. The HALoGEN study found hallucination rates
up to 86% in some domains.

### 4. Diminishing returns despair

Per METR RCT: experienced devs took 19% longer with AI on familiar codebases while
BELIEVING they were 24% faster. The gap between perceived and actual productivity is
demoralizing when discovered. You feel like you should be moving faster, but you're
actually moving slower.

### 5. Tool churn fatigue

AI tools update constantly, changing behavior, adding preferences, and sometimes
breaking existing rules. Keeping up feels like running on a treadmill. The tool you
learned last month works differently this month.

## Boundary-setting for AI sessions

Adapted from Open Source Guides Section 2.1 ("Set boundaries"):

- **Time-box AI sessions** -- 90 minutes max, then step away and review
- **Define "AI days" vs "hands-on days"** -- Not every day should involve AI tools.
  Designate some weeks for AI-assisted building and others for hands-on maintenance.
- **Communicate AI boundaries in README** -- "This project uses AI-assisted development.
  AI-generated PRs are reviewed with the same rigor as human PRs."
- **Don't feel guilty about NOT using AI** -- Sometimes manual refactoring is more
  effective and more educational. Hands-on code removal and cleanup can be deeply
  satisfying work.

### Boundary template (for your README or CONTRIBUTING.md)

```markdown
## AI-assisted development

This project uses AI coding tools for some tasks. Here's what that means for you:

- AI-generated PRs are reviewed with the same rigor as human PRs
- We time-box AI sessions to [CONFIGURE: max session length, e.g., 90 minutes]
- We alternate between AI-assisted and hands-on development weeks
- AI output is always verified against the post-edit verification checklist
- [CONFIGURE: your project's AI disclosure policy]
```

## Delegation patterns

- **Assign AI-rule maintenance to a contributor** -- Not everything has to be done by
  the lead maintainer
- **Use PR checklists to offload review** -- The post-edit verification checklist
  (see `checklists/post-edit-verification.md`) turns review into a structured process
  any contributor can follow
- **Record video for bug reports** -- A 10-15 minute testing video is often faster
  to produce and review than written reproduction steps, and more accessible to
  screen reader users who can listen

## Resourcing and funding

From Open Source Guides Section 9 ("Getting Paid for Open Source Work") and the
practical reality: time and AI credits are part of sustainability.

- **Prefer simple, transparent funding**: GitHub Sponsors, grants, institutional
  support, or a small donor base.
- **Budget AI spend like cloud spend**: set a monthly credit cap and treat token
  economics (see `TOKEN_ECONOMICS.md`) as an operational constraint.
- **Keep participation paywall-free**: contributors should be able to run tests and
  follow the workflow without buying proprietary tools; document paid-tool fallbacks
  when possible.

### Project-specific configuration

- **Funding model:** `[CONFIGURE: e.g., GitHub Sponsors, grants, self-funded]`
- **Monthly AI budget:** `[CONFIGURE: e.g., $50/month across all AI tools]`
- **Free-tier alternatives documented:** `[CONFIGURE: yes/no — if yes, where]`

## Signs you need a break

Watch for these signals (adapted from Open Source Guides Section 2):

- You dread opening your AI tool more than your code editor
- You're adding rules faster than you're shipping features
- You can't remember the last time you wrote code without AI assistance
- Review fatigue: you're approving AI output without reading it carefully
- You feel guilty when you don't use AI, even when manual work is faster

If you recognize three or more of these, step back. Take a hands-on week. The project
will still be there when you come back.
