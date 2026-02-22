# AI Development Playbook for Assistive Technology

A downloadable rulebook for open source developers who use AI coding tools to build
assistive technology software. Drop it into your project, fill in the
`[CONFIGURE: ...]` placeholders, and your AI assistant gets guardrails that protect
accessibility, security, open source norms, and code quality.

This playbook grew out of a real-world assistive technology project and 100+
AI-assisted development sessions. The rules are grounded in peer-reviewed research
on AI coding productivity (see the Scientific Foundations table in `docs/PLAYBOOK.md`)
and hard-won lessons from shipping an accessibility-first web app with AI assistance.

## What's inside

| Folder | What you'll find |
| --- | --- |
| `docs/` | Deep-dive guides: AT scope, OSS contribution, responsive UI, process cadence, token economics, legal, maintainer sustainability, GitHub Open Source Guides reference index, and more |
| `checklists/` | Quick-reference checklists: bloat scanning, post-edit verification, OSS-first search, responsive UI, docs accessibility |
| `prompts/` | 16 copy-and-paste prompt templates covering WASM debugging, accessibility remediation, 3D-print AT devices, OSS contribution, research synthesis, and more |
| `templates/` | Ready-to-copy config files for Cursor, GitHub Copilot, issue templates, PR templates, `.editorconfig`, and `pixi.toml` |
| `scripts/` | Optional automation: bloat scanner, hallucinated import detector |
| `AGENTS.md` | Universal golden rules (works with any AI tool) |
| `CLAUDE.md` | Rules formatted for Claude Code |

## Quick start

### 1. Pick an import pattern

**Pattern 1: Copy and configure (simplest)**

```bash
git clone https://github.com/[CONFIGURE: your-username]/ai-assistive-tech-guardrails.git /tmp/playbook
cp /tmp/playbook/AGENTS.md ./AGENTS.md
cp /tmp/playbook/CLAUDE.md ./CLAUDE.md
cp -r /tmp/playbook/templates/.github ./.github
# Edit [CONFIGURE: ...] placeholders in each file
```

**Pattern 2: Git submodule (stays updated)**

```bash
git submodule add https://github.com/[CONFIGURE: your-username]/ai-assistive-tech-guardrails.git .playbook
# Reference .playbook/AGENTS.md from your project rules
```

**Pattern 3: GitHub org `.github` repo (propagates automatically)**

```bash
# In your org's .github repo:
cp ai-at-playbook/templates/.github/* .github/
# All new repos in the org inherit these files
```

### 2. Fill in the placeholders

Search for `[CONFIGURE: ...]` across the files you copied. Each placeholder tells you
what to fill in — your project name, stack, license, accessibility target, etc.

### 3. Start building

Your AI assistant now has context about accessibility requirements, security
boundaries, commit conventions, and code quality standards for your project.

## Update cadence

This playbook is a living document. Here's when to revisit it:

- **Monthly**: Review rules against current AI tool behavior (Cursor updates, Copilot
  changes, new Claude Code features)
- **Quarterly**: Review against new research (check arXiv for AI coding studies)
- **Per-release**: Update project-specific `[CONFIGURE: ...]` values after each project
  release
- **On-incident**: Add new rules when an AI-caused incident occurs (add to the
  "Lessons Learned" document)

## License

Dual-licensed:

- **Documentation and content** (`.md` files, checklists, prompts): [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)
- **Code** (scripts, config templates): [MIT](https://opensource.org/licenses/MIT)

See `LICENSE` for full text.

## Origin

This playbook was extracted from a real-world assistive technology project — a
browser-based tool that generates accessible 3D models client-side via WebAssembly,
with an accessibility-first UI. The rules here are designed to work for any
assistive technology project, not just the one that inspired them.
