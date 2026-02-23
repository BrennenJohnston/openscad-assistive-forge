# AI Code Bloat Scan

Run this checklist after every AI-assisted code change. It catches the ten most common
patterns where AI tools add code that shouldn't be there.

This checklist is universal — it works for any programming language and any project.
The detection heuristics may need language-specific adaptation (the examples below lean
toward JavaScript/TypeScript, but the patterns show up everywhere).

## The 10 Patterns

| # | Pattern | Description | Detection Heuristic | Severity |
| --- | --- | --- | --- | --- |
| 1 | **Narrating comments** | Comments that restate what the code does instead of explaining non-obvious intent | Grep for comment prefixes: `// Get`, `// Set`, `// Create`, `// Initialize`, `// Return`, `// Handle`, `// Update`, `// Check` followed by exactly what the next line does | Blocking |
| 2 | **Defensive over-abstraction** | Unnecessary wrapper functions, single-use utility files, premature generalization | Functions called exactly once from exactly one location; files with a single exported function under 10 lines | Warning |
| 3 | **Hallucinated imports** | Import statements for modules or packages that don't exist in the project or package registry | Cross-reference every `import`/`require` against actual file system and `node_modules`/equivalent; flag any that resolve to nothing | Blocking |
| 4 | **Zombie error handling** | try/catch blocks that swallow errors, log generic messages, or catch without acting | Grep for empty `catch {}` blocks, catch blocks containing only `console.log`/`console.error` with string literals (no error object), or re-throws without added context | Warning |
| 5 | **Unnecessary type guards** | Excessive typeof/instanceof checks in contexts where types are structurally guaranteed by the call chain | Manual review; flag `typeof x === 'string'` etc. in functions where all callers pass the correct type | Info |
| 6 | **Duplicate implementation** | Reimplementing functionality that already exists in the project's existing modules | Before adding a new utility function, search the entire codebase for functions with similar names or purposes | Blocking |
| 7 | **Scope creep** | Changes to files unrelated to the stated task | Compare `git diff --name-only` against the plan/issue's stated scope; flag files that don't appear in the plan | Warning |
| 8 | **Corporate/emoji injection** | AI-typical tone markers in code comments, commit messages, or documentation | Grep for: emoji in `.js`/`.ts`/`.py` comments, "ensure", "utilize", "leverage", "facilitate", "streamline" in code comments (not docs) | Warning |
| 9 | **Phantom dependencies** | Adding npm/pip/cargo packages for functionality achievable with existing code or standard library | Before `npm install <package>`, verify the functionality isn't already available in the project's dependencies or in Node/browser built-ins | Blocking |
| 10 | **Test theater** | Tests that pass but don't verify meaningful behavior — testing implementation details, asserting on mocks, or testing that a function "was called" without verifying correctness | Review test assertions: flag tests where the only assertions are `toHaveBeenCalled` or `toHaveBeenCalledWith` without also asserting on output/state | Warning |

## Severity levels

- **Blocking** — Fix before merging. These patterns introduce real defects (broken
  imports, duplicated logic, phantom dependencies).
- **Warning** — Flag for human review. These patterns aren't always wrong, but they're
  wrong often enough that a human should decide.
- **Info** — Note for future cleanup. Won't block a PR, but worth tracking.

## How to run this scan

**Quick manual pass (every change):**

1. Open the diff (`git diff` or your editor's diff view)
2. Walk through each changed file and check for patterns 1, 3, 6, 8, 9
3. For new functions, run pattern 6 (search the codebase for existing implementations)
4. For new dependencies, run pattern 9 (check if it's already covered)

**Automated (for CI pipelines):**

1. **Pre-commit hook** — run a lightweight script that checks for narrating comment
   patterns and hallucinated imports
2. **CI job** — run a more thorough scan that checks all 10 patterns against the diff
3. **PR bot** — comment on PRs with detected AI bloat patterns for human review

## Why these patterns matter

AI coding tools are good at generating plausible-looking code. The problem is that
"plausible-looking" and "correct" aren't the same thing. These 10 patterns are the ones
that showed up most often during 100+ AI-assisted development sessions on the origin
project. Pattern 3 (hallucinated imports) and pattern 6 (duplicate implementation)
caused the most actual production bugs.

The HALoGEN study (arXiv:2501.08292) found LLM hallucination rates reach 86% in some
domains. Code is high-risk. Every AI-generated artifact should be verified against the
actual codebase — never trusted at face value.
