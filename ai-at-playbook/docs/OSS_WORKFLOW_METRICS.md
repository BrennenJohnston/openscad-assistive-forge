# Open Source Workflow Metrics and SLA Guardrails

You can't improve what you don't measure. These metrics help you see how your
contribution workflow is actually performing -- and set targets that are honest
about what a small team (or solo maintainer) can handle.

## Metrics baseline

Track these six metrics. You don't need fancy tooling -- GitHub Insights, a
spreadsheet, or even a periodic manual count will do.

| Metric | What It Measures | Why It Matters |
| --- | --- | --- |
| **First maintainer response time** | Time from issue/PR creation to first maintainer comment | Contributors who wait too long don't come back |
| **PR review start time** | Time from PR creation to first review comment | Long waits signal a bottleneck or capacity problem |
| **Merge cycle time** | Time from PR creation to merge | Tracks end-to-end velocity |
| **Issue-to-PR conversion rate** | Percentage of issues that result in a PR | Low rates may mean issues are unclear or too large |
| **Repeat contributor rate** | First-time vs returning contributors | Measures community health and onboarding success |
| **Accessibility bug closure rate** | Closure rate by severity (P0/P1/P2) | Tracks whether accessibility bugs get prioritized |
| **Stale issue/PR ratio** | Percentage of issues/PRs with no activity in 30+ days | Signals capacity problems or scope creep |

## Suggested SLA targets

These are starting points. Adjust to your capacity -- an honest "we respond within
a week" is better than an aspirational "24 hours" that you can't keep.

| Target | SLA | Notes |
| --- | --- | --- |
| **First maintainer response** | `[CONFIGURE: e.g., within 48 hours]` | Even "thanks, I'll look at this" counts |
| **PR initial review** | `[CONFIGURE: e.g., within 72 hours]` | Doesn't mean merged -- just first feedback |
| **Accessibility P0 triage** | `[CONFIGURE: e.g., same day when possible]` | P0 = blocks core functionality or creates a barrier |
| **Status update on open critical issues** | `[CONFIGURE: e.g., at least weekly]` | Contributors need to know their issue isn't forgotten |

## Review cadence

Pick a rhythm that works for your project:

| Project Size | Suggested Review Cadence |
| --- | --- |
| Solo maintainer | Weekly: 30 min to review metrics, triage stale items |
| Small team (2-5) | Biweekly: brief sync on metrics + SLA performance |
| Larger team | Monthly: formal metrics review + quarterly trend analysis |

### Project-specific configuration

- **Metrics review cadence:** `[CONFIGURE: e.g., weekly]`
- **Metrics tracking tool:** `[CONFIGURE: e.g., GitHub Insights, spreadsheet, custom dashboard]`
- **SLA published location:** `[CONFIGURE: e.g., CONTRIBUTING.md, README.md]`
