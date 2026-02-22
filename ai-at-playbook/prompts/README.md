# Prompt Library

15 copy-and-paste prompts for common AI-assisted development scenarios. Each prompt
is a self-contained role definition that you paste into your AI tool before starting
a task.

## How to use

1. Pick the prompt that matches your task
2. Copy the entire file contents
3. Fill in the `[CONFIGURE: ...]` placeholders with your project's paths, tool names,
   and conventions
4. Paste into your AI tool (Cursor, Copilot Chat, Claude Code, etc.)
5. Start your task

## Design principles

These prompts follow findings from the Prompt Programming Study (arXiv:2412.20545):

- **One dominant technique per prompt** -- persona OR chain-of-thought OR few-shot,
  not all combined. Stacking techniques does NOT improve outcomes; targeted single
  techniques outperform stacking.
- **Under 500 words each** -- focused sessions outperform sprawling ones (METR RCT,
  GitHub Copilot Field Study). The prompt sets the scope; your codebase context
  fills in details.
- **Project-configurable** -- every prompt has `[CONFIGURE: ...]` placeholders.
- **Acceptance criteria included** -- every prompt ends with clear success/failure
  conditions so the AI session has a defined endpoint.
- **Anti-patterns included** -- every prompt lists things the AI must NOT do, based
  on failure modes observed in 100+ development sessions.

## Prompt inventory

| # | File | Scenario | Dominant Technique |
| --- | --- | --- | --- |
| 1 | `01-wasm-worker-debugging.md` | WASM / Worker debugging | Persona (runtime specialist) |
| 2 | `02-ui-layout-accessibility.md` | UI layout change | Persona (accessibility engineer) |
| 3 | `03-css-design-tokens.md` | CSS / design token changes | Persona (design systems engineer) |
| 4 | `04-parser-changes.md` | Parser / language processing | Persona (parser specialist) |
| 5 | `05-service-worker-pwa.md` | Service worker / PWA changes | Persona (PWA specialist) |
| 6 | `06-security-changes.md` | Security changes | Persona (security engineer) |
| 7 | `07-test-writing.md` | Test writing | Persona (QA engineer) |
| 8 | `08-documentation-writing.md` | Documentation writing | Persona (technical writer) |
| 9 | `09-performance-optimization.md` | Performance optimization | Persona (perf engineer) |
| 10 | `10-bug-triage.md` | Bug triage / root cause analysis | Persona (debugging specialist) |
| 11 | `11-accessibility-remediation.md` | Accessibility remediation | Persona (WCAG specialist) |
| 12 | `12-new-feature-design.md` | New feature design (OSS-first) | Chain-of-thought (search then build) |
| 13 | `13-responsive-ui-change.md` | Responsive UI change | Persona (responsive engineer) |
| 14 | `14-3d-print-at-device.md` | 3D-printed AT device design | Persona (AT engineer) |
| 15 | `15-open-source-contribution.md` | Open source contribution | Persona (community contributor) |

## Tips

- Don't combine prompts. Use one at a time. If your task spans multiple areas
  (e.g., a UI change that also needs new tests), run them as separate AI sessions.
- Fill in ALL `[CONFIGURE: ...]` placeholders before pasting. Unfilled placeholders
  waste tokens and confuse the AI.
- The acceptance criteria double as a review checklist. When the AI says it's done,
  walk through each criterion manually.
