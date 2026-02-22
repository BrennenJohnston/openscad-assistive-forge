# AI Documentation Bloat Scan

Run this checklist after every AI-assisted documentation change. It catches the six
most common patterns where AI tools make documentation worse instead of better.

Three separate documentation audit cycles in the origin project failed because AI
defaulted to corporate formality instead of matching the project's voice. This
checklist exists so you don't repeat that.

## The 6 Patterns

| # | Pattern | Description | Detection Heuristic |
| --- | --- | --- | --- |
| 1 | **Heading proliferation** | H4+ nesting depth for content that doesn't warrant it | Count heading levels; flag sections with `####` or deeper that contain fewer than 3 paragraphs |
| 2 | **Corporate vocabulary** | AI-typical formal words that don't match a project's natural voice | Grep for: "leverage", "utilize", "ensure", "facilitate", "streamline", "comprehensive", "robust", "seamless", "harness", "empower" in markdown files |
| 3 | **Hallucinated cross-references** | Links to files, sections, or URLs that don't exist | Validate all markdown links: `[text](path)` where `path` is a relative file path should resolve to an actual file; anchor links should resolve to actual headings |
| 4 | **Stale metrics** | Hardcoded counts (test counts, line counts, file counts, budget numbers) that will drift | Grep for number patterns near keywords: `\d{3,}.*tests`, `\d{3,}.*lines`, `~\d+.*modules`. Prefer "all tests pass" over "1184 tests pass" |
| 5 | **Excessive disclaimers** | Hedging language that adds no information | Grep for: "Please note that", "It is important to understand", "It should be noted", "Keep in mind that", "It's worth mentioning" |
| 6 | **Tone mismatch** | AI-generated docs that don't match the project's established voice | Compare vocabulary and sentence length statistics against existing human-written docs (e.g., `CONTRIBUTING.md`); flag statistical outliers |

## Severity levels

All six patterns default to **Warning** severity — they should be flagged for human
review, but they won't break builds. Promote pattern 3 (hallucinated cross-references)
to **Blocking** if your project has link-checking in CI.

| # | Pattern | Default Severity |
| --- | --- | --- |
| 1 | Heading proliferation | Warning |
| 2 | Corporate vocabulary | Warning |
| 3 | Hallucinated cross-references | Warning (promote to Blocking if you have link checking) |
| 4 | Stale metrics | Warning |
| 5 | Excessive disclaimers | Warning |
| 6 | Tone mismatch | Warning |

## How to run this scan

**Quick manual pass (every docs change):**

1. Read the diff out loud. If you hear "leverage", "utilize", or "facilitate" — that's
   pattern 2. Rewrite it in plain English.
2. Click every link in the changed file. If any lead nowhere — that's pattern 3.
3. Search for hardcoded numbers. Ask: "Will this number still be right next week?" If
   not — that's pattern 4. Rewrite to describe the property, not the count.
4. Compare the tone against your project's `CONTRIBUTING.md` or `README.md`. If the
   new text sounds like it was written by a different person — that's pattern 6.

**Automated (for CI pipelines):**

1. **Link checker** — tools like `markdown-link-check` or `lychee` catch pattern 3
2. **Word list grep** — a simple script with the corporate vocabulary list catches
   patterns 2 and 5
3. **Heading depth linter** — `markdownlint` rule MD001 catches some of pattern 1

## The tone problem in detail

This pattern deserves extra attention. The origin project's `CONTRIBUTING.md` starts
with "Hey — thanks for taking a look." The `README.md` says "Because I work in the
assistive technology field, I love parametric OpenSCAD models..." That's the voice.

AI tools consistently replace this kind of warmth with corporate formality. Three
audit plans were needed to undo it. Your project has its own voice — protect it.
The best defense is a one-paragraph "voice sample" in your project's AI rules
(AGENTS.md, copilot-instructions.md, etc.) with 3-5 example sentences that show
how your project talks.
