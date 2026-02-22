# AI Development Playbook for Assistive Technology

This is the capstone document. It ties together every guide, checklist, template,
and prompt in the playbook into a single reading path. If you're new here, start
with the [README](../README.md) for quick setup, then come back here for the full
picture.

## What this playbook is

A portable, updatable rulebook that you import into your project to guide AI
coding tools (Cursor, GitHub Copilot, Claude Code, Windsurf) in following
accessibility, security, open source, and code quality norms. It's built from
empirical evidence — 100 development plans, three rounds of documentation audits,
and real stakeholder feedback from an assistive technology project.

## What this playbook is not

- Not a tutorial on how to use AI coding tools
- Not a replacement for learning accessibility fundamentals
- Not a one-size-fits-all ruleset (that's what the `[CONFIGURE: ...]` placeholders
  are for)

## How to read this document

Each section below maps to a concern area. Within each section you'll find:

1. **The rule** — what your AI agent must do
2. **Where it lives** — which file(s) enforce it
3. **Why it matters** — evidence from the origin project

If you're configuring the playbook for your project, follow the sections in order.
Each builds on the previous one.

---

## 1. Golden rules

Seven blocking rules that every AI agent must follow, regardless of tool.

| Rule | Why |
| --- | --- |
| Never modify protected files | Vendored binaries, fonts, and licenses are not yours to edit |
| Focus-visible ring on all interactive UI | Keyboard-only users can't navigate without it |
| Design tokens for all visual values | Prevents hardcoded values that break theming and accessibility |
| Respect `prefers-reduced-motion` | Vestibular disorders make animations dangerous, not just annoying |
| Semantic HTML before ARIA | ARIA is a repair tool, not a design tool |
| OSS-first search before new code | Prevents duplicate implementations and phantom dependencies |
| One feature or fix per PR | Keeps reviews meaningful and reverts safe |

**Enforced in:**
[AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) |
[.cursor/rules/golden-rules.mdc](../templates/.cursor/rules/golden-rules.mdc) |
[.github/copilot-instructions.md](../templates/.github/copilot-instructions.md)

---

## 2. Assistive technology scope

This playbook covers seven categories of AT, not just web accessibility:

1. Screen reader-optimized web interfaces
2. Tactile/Braille output generation
3. 3D-printed adaptive devices
4. Motor accessibility hardware interfaces
5. Cognitive accessibility tools
6. Communication augmentation systems
7. Sensory substitution devices

**Full guide:** [AT_SCOPE_GUIDE.md](AT_SCOPE_GUIDE.md)

---

## 3. AI bloat detection

AI coding tools produce characteristic defects. The playbook defines 10 code
patterns and 6 documentation patterns to scan for after every AI-assisted change.

### Code bloat patterns (blocking or warning)

| # | Pattern | Severity |
| --- | --- | --- |
| 1 | Narrating comments | Blocking |
| 2 | Defensive over-abstraction | Warning |
| 3 | Hallucinated imports | Blocking |
| 4 | Zombie error handling | Warning |
| 5 | Unnecessary type guards | Info |
| 6 | Duplicate implementation | Blocking |
| 7 | Scope creep | Warning |
| 8 | Corporate/emoji injection | Warning |
| 9 | Phantom dependencies | Blocking |
| 10 | Test theater | Warning |

### Documentation anti-patterns

| # | Pattern |
| --- | --- |
| 1 | Heading proliferation |
| 2 | Corporate vocabulary |
| 3 | Hallucinated cross-references |
| 4 | Stale metrics |
| 5 | Excessive disclaimers |
| 6 | Tone mismatch |

**Checklists:**
[ai-code-bloat-scan.md](../checklists/ai-code-bloat-scan.md) |
[ai-doc-bloat-scan.md](../checklists/ai-doc-bloat-scan.md)

**Automation:**
[scripts/bloat-scanner.js](../scripts/bloat-scanner.js) |
[scripts/import-check.js](../scripts/import-check.js)

---

## 4. OSS-first search workflow

Before writing new code or adding a dependency, search for existing
implementations. This is mandatory for features, new dependencies, and new
utility modules.

The workflow: search your own modules -> search your existing dependencies ->
search package registries -> search GitHub -> evaluate candidates against six
criteria (license, maintenance, bundle size, accessibility, security, fit) ->
document the decision either way.

**Full checklist:** [oss-first-search.md](../checklists/oss-first-search.md)

---

## 5. Post-edit verification

A three-tier verification protocol runs after every AI-assisted change:

| Tier | What | Blocking? |
| --- | --- | --- |
| Tier 1: Automated | Linter, formatter, tests, build, bloat scan | Yes |
| Tier 2: Human-reviewed | Diff review, accessibility spot-check, scope check | Yes |
| Tier 3: Research-informed | Cross-reference against docs, upstream issues, regression check | Conditional |

**Full protocol:** [post-edit-verification.md](../checklists/post-edit-verification.md)

---

## 6. Open source contribution guidance

AI agents need explicit rules for OSS workflows: how to write issues, create PRs,
communicate with maintainers, and respect governance and codes of conduct.

**Guides:**
[OSS_CONTRIBUTION_AI_GUIDE.md](OSS_CONTRIBUTION_AI_GUIDE.md) |
[CODE_OF_CONDUCT_ENFORCEMENT.md](CODE_OF_CONDUCT_ENFORCEMENT.md) |
[COMMUNITY_FUNNEL.md](COMMUNITY_FUNNEL.md) |
[OSS_WORKFLOW_METRICS.md](OSS_WORKFLOW_METRICS.md)

**Templates:**
[PULL_REQUEST_TEMPLATE.md](../templates/.github/PULL_REQUEST_TEMPLATE.md) |
[bug_report.md](../templates/.github/ISSUE_TEMPLATE/bug_report.md) |
[accessibility_issue.md](../templates/.github/ISSUE_TEMPLATE/accessibility_issue.md) |
[feature_request.md](../templates/.github/ISSUE_TEMPLATE/feature_request.md) |
[issue-card.md](../templates/issue-card.md)

---

## 7. Environment tool enforcement

AI agents default to raw shell commands. If your project uses an environment tool
(Pixi, Nix, conda, etc.), the AI must use it.

**Rule file:**
[env-tool.mdc](../templates/.cursor/rules/env-tool.mdc)

---

## 8. Responsive UI and multi-device guardrails

Eight responsive UI checks plus five mandatory system preference media queries
ensure AT web projects work across devices and user preferences.

**Guides:**
[RESPONSIVE_UI_GUARDRAILS.md](RESPONSIVE_UI_GUARDRAILS.md) |
[WEBSITE_REACTIVE_CONTROL_MEASURES.md](WEBSITE_REACTIVE_CONTROL_MEASURES.md)

**Checklist:**
[responsive-ui-check.md](../checklists/responsive-ui-check.md)

---

## 9. Process cadence

A repeatable 4-week cycle: build -> refactor -> stabilize. Each phase has
different AI rules. Sprint plans that try to do everything at once have a 7%
completion rate; narrow-scope plans complete at 50%.

**Full guide:** [PROCESS_CADENCE.md](PROCESS_CADENCE.md)

---

## 10. Token economics and cost awareness

AI tools consume tokens invisibly. Rules bloat raises costs. The playbook
provides a model-tier selection framework, a Cursor preferences audit guide,
and a warning about Goodhart's Law applied to AI productivity metrics.

**Full guide:** [TOKEN_ECONOMICS.md](TOKEN_ECONOMICS.md)

---

## 11. Security operations

Minimum security posture for AI-assisted OSS projects: MFA, protected branches,
secret scanning, code scanning, `SECURITY.md`, and incident response.

**Guides:**
[SECURITY_OPERATIONS_BASELINE.md](SECURITY_OPERATIONS_BASELINE.md)

**Template:**
[SECURITY.md](../templates/SECURITY.md)

---

## 12. Legal and licensing

AI agents must understand license compatibility, attribution requirements, and
the unsettled copyright status of AI-generated code.

**Full guide:** [LEGAL_LICENSE_GUIDE.md](LEGAL_LICENSE_GUIDE.md)

---

## 13. Maintainer sustainability

Five AI-specific burnout patterns and boundary-setting strategies. Maintainers of
AI-assisted projects face unique fatigue from context window management, rule
maintenance, and output review.

**Full guide:** [MAINTAINER_SUSTAINABILITY.md](MAINTAINER_SUSTAINABILITY.md)

---

## 14. Evidence-to-issue triage

A 6-step workflow to convert raw feedback (videos, screenshots, reports) into
actionable, deduplicated issue cards with severity and accessibility impact.

**Guide:** [WORKFLOW_TRIAGE_PIPELINE.md](WORKFLOW_TRIAGE_PIPELINE.md)

**Template:** [issue-card.md](../templates/issue-card.md)

---

## 15. Documentation and evidence accessibility

Rules for making documentation artifacts accessible, searchable, and maintainable.
Text-first formats, alt text requirements, chunked audits, and video summaries.

**Guide:**
[DOCS_AND_EVIDENCE_ACCESSIBILITY.md](DOCS_AND_EVIDENCE_ACCESSIBILITY.md)

**Checklist:**
[docs-evidence-accessibility-check.md](../checklists/docs-evidence-accessibility-check.md)

---

## 16. Language and i18n guardrails

Language-aware rules that prevent screen reader pronunciation errors and support
multilingual content.

**Full guide:** [LANGUAGE_AND_I18N_GUARDRAILS.md](LANGUAGE_AND_I18N_GUARDRAILS.md)

---

## 17. Cross-tool portability

The same rules ship in four formats so every contributor's AI tool can read them:

| File | Tool |
| --- | --- |
| `AGENTS.md` | Any tool (universal) |
| `CLAUDE.md` | Claude Code |
| `.cursor/rules/golden-rules.mdc` | Cursor |
| `.github/copilot-instructions.md` | GitHub Copilot |

**Propagation guide:** [ORG_LEVEL_PROPAGATION.md](ORG_LEVEL_PROPAGATION.md)

---

## 18. Prompt library

Fifteen ready-to-use prompts for common development scenarios. Each uses one
dominant technique (per arXiv:2412.20545), stays under 500 words, and includes
acceptance criteria and anti-patterns.

**Library index:** [prompts/README.md](../prompts/README.md)

| # | Prompt | Technique |
| --- | --- | --- |
| 01 | WASM / Worker debugging | Persona |
| 02 | UI layout + accessibility | Persona |
| 03 | CSS design tokens | Chain-of-thought |
| 04 | Parser changes | Persona |
| 05 | Service worker / PWA | Persona |
| 06 | Security changes | Persona |
| 07 | Test writing | Chain-of-thought |
| 08 | Documentation writing | Persona |
| 09 | Performance optimization | Chain-of-thought |
| 10 | Bug triage | Chain-of-thought |
| 11 | Accessibility remediation | Persona |
| 12 | New feature design | Chain-of-thought |
| 13 | Responsive UI change | Persona |
| 14 | 3D-print AT device design | Persona |
| 15 | Open source contribution | Persona |

---

## 19. Lessons from development history

Analysis of 100 Cursor development plans from the origin project. Key findings:

- **Narrow-scope plans complete at 8x the rate of broad-scope plans** (50% vs 6%)
- **Bug fixes complete at the highest rate** (50%) — clear end conditions help
- **Sprint plans complete at the lowest rate** (7%) — scope overload kills progress
- **Documentation audits required 3 iterations** to match the project's tone

**Full analysis:** [LESSONS_LEARNED.md](LESSONS_LEARNED.md)

---

## 20. Recommended plan template

Based on the empirical analysis, use this template when planning AI-assisted work:

```markdown
# [Title] -- [Type: bug fix | feature | refactor | docs | research]

## Scope
- Files affected: [list specific files or directories]
- Estimated size: [narrow | medium | broad]

## Context
- [2-3 sentences: what problem this solves and why now]
- Related plans: [link to any predecessor or successor plans]

## Acceptance Criteria
- [ ] [Specific, verifiable criterion 1]
- [ ] [Specific, verifiable criterion 2]
- [ ] [Specific, verifiable criterion 3]
- [ ] All existing tests pass
- [ ] AI bloat scan passes (no narrating comments, no hallucinated imports)

## OSS-First Search (if feature)
- Searched: [what was searched]
- Found: [what was found, or "nothing suitable"]
- Decision: [use existing / build from scratch + justification]

## Implementation Steps
1. [Step 1 -- one file or one logical change]
2. [Step 2]
3. [Step 3]

## Verification
- [ ] Pre-commit checklist passes
- [ ] Post-AI-edit verification protocol completed (Tier 1 + applicable Tier 2/3)
```

---

## Configuration checklist

When you first import this playbook, work through these steps:

- [ ] Copy rule files to your project (`AGENTS.md`, `CLAUDE.md`, etc.)
- [ ] Find all `[CONFIGURE: ...]` placeholders and replace with your project values
- [ ] Set up protected file paths in the rule files
- [ ] Set up your environment tool preference (Pixi, Nix, conda, etc.)
- [ ] Set up your commit convention and authorship rules
- [ ] Set up your quality gate commands (lint, format, test)
- [ ] Copy issue and PR templates to `.github/`
- [ ] Review the prompt library and adapt prompts to your stack
- [ ] Schedule your first monthly review of rules vs. AI tool behavior

---

## Update cadence

| Frequency | Action |
| --- | --- |
| Monthly | Review rules against current AI tool behavior |
| Quarterly | Review against new AI coding research |
| Per-release | Update `[CONFIGURE: ...]` values |
| On-incident | Add new rules when an AI-caused incident occurs |

---

## License

Documentation: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
Code and scripts: [MIT](https://opensource.org/licenses/MIT).
See [LICENSE](../LICENSE) for full text.
