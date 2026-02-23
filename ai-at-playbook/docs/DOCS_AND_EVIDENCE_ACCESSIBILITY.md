# Documentation + Evidence Accessibility

The playbook asks projects to produce documentation, issue cards, videos, reports, and
other artifacts. If those artifacts aren't accessible, searchable, and maintainable,
the playbook defeats its own purpose.

This guide sets the floor for artifact hygiene.

**Source:** Open Source Guides (Section 7.2 "Documenting Your Processes"), internal
development experience.

## Documentation accessibility rules (minimum)

- Prefer **text-first formats** (Markdown) for anything that should be reviewed,
  searched, or versioned
- Images in docs/issues MUST have alt text (or a nearby text equivalent)
- Avoid "image-only instructions" (screenshots without accompanying steps)
- Split large audits into multiple issues with clear titles (see
  `WORKFLOW_TRIAGE_PIPELINE.md`) instead of one giant report
- When video is used as evidence, prefer adding a short written summary + timestamps
- When consuming external documents (reports, manuals, assessments), convert to
  text-first format before acting on them -- OCR and PDF-to-text tools exist for this.
  Manual retyping of long documents is a common hidden time sink when conversion tools
  have not been introduced into the workflow.
- Playback speed on video/audio content is an accessibility affordance -- host on
  platforms that support user-controlled speed so viewers can adjust pacing to their
  own needs

## Artifact format preferences

| Format | When to Use | Accessibility Notes |
| --- | --- | --- |
| **Markdown** | Docs, issues, meeting notes, decision records | Searchable, versionable, screen reader friendly |
| **Video** | Bug reports, testing evidence, demos | Add written summary + timestamps; host where speed control is available |
| **Screenshots** | UI issues, before/after comparisons | Always include alt text and contextual description |
| **PDF** | External reports (if unavoidable) | Convert actionable content to Markdown; keep PDF as reference attachment |
| **Spreadsheet** | Metrics, audit data | Provide a Markdown summary; use accessible table markup |

## Checklist

A copy-paste version is in `checklists/docs-evidence-accessibility-check.md`.

- [ ] Text-first format used for all new documentation
- [ ] All images have alt text or nearby text equivalent
- [ ] No image-only instructions
- [ ] Large audits split into individual issue cards
- [ ] Video evidence has written summary + timestamps
- [ ] External documents converted to text-first before acting on them
- [ ] Video/audio hosted where user-controlled playback speed is available

## Alt text strategy: human-in-the-loop

Do not use AI to generate alt text for assistive technology products or any
content where false positives create inaccessibility. AI-generated descriptions
lack the contextual understanding that human creators and users possess [S14,
Google Research]. Screen reader users receiving single AI-generated descriptions
struggle to detect unreliable information — though presenting multiple AI
variations increases error detection by 4.9x [S15, Multi-MLLM, 2025].

**Three-part strategy:**

1. **Transparent gap indicator**: When alt text is unavailable, use a UI pattern
   that screen readers announce as work-in-progress (e.g., a disabled "generate
   alt text" toggle). Be transparent about the gap rather than hiding it.
2. **Community contribution model**: Create issues or PRs with images having
   placeholder alt text. Community members fill in descriptions and get included
   in project history. This is a non-technical contribution path. Build events
   around this.
3. **Upstream encouragement**: Encourage source platforms and data providers to
   improve their metadata quality. Better upstream data reduces the alt text gap
   at the source.

**Community-driven verification (Mozilla precedent):** Auto-detect missing alt
text in scraped or imported data, seed to GitHub issues, community resolves the
accessibility gaps as a participation activity. Mozilla shipped a browser-local
alt text model (DistilViT, 182M parameters, Apache-2.0) in Firefox 130,
demonstrating that on-device models can handle detection while human resolution
handles quality [E3, Mozilla, 2024–2025].

**Future exploration:** Browser-local AI (on-device models) for alt text
generation avoids cloud token costs and keeps processing local. If explored,
require multiple model outputs for comparison rather than accepting a single
description — the 4.9x error detection improvement from multiple outputs makes
this a hard requirement [S15].

## CI tooling for alt text detection

Automated CI checks catch missing alt text before it reaches production. These
tools detect the gap — they do not fill it. Human authors still write the
descriptions; CI prevents gaps from shipping unnoticed.

### Recommended GitHub Actions

| Tool | Purpose | Stage |
| --- | --- | --- |
| `github/accessibility-alt-text-bot` | Monitors PRs and issues for images missing alt text; comments inline | Real-time PR/issue monitoring |
| `markdown-image-alt-text-checker` Action | Scans Markdown files for `![]()` patterns with empty or missing alt attributes | CI pre-merge gate |
| `accessibility-scanner` (GitHub) | Broader accessibility scan that includes alt text as one check | Optional deeper scan |

### Integration pattern

Add the Markdown checker as a required status check so PRs with missing alt
text cannot merge. The alt text bot provides real-time feedback on issues and
PRs where images are pasted inline (outside Markdown files).

```yaml
# Example: .github/workflows/alt-text-check.yml
name: Alt text check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check Markdown image alt text
        uses: '[CONFIGURE: action reference for markdown-image-alt-text-checker]'
```

The accessibility scanner is heavier and optional. Run it on a schedule
(weekly or per-release) rather than on every PR if build times are a concern.

### Project-specific configuration

- **Alt text CI check:** `[CONFIGURE: "required status check" or "advisory only"]`
- **Alt text bot scope:** `[CONFIGURE: e.g., "PRs only", "PRs + issues", or "disabled"]`
- **Accessibility scanner schedule:** `[CONFIGURE: e.g., "weekly", "per-release", or "disabled"]`

### Project-specific configuration

- **Preferred doc format:** `[CONFIGURE: e.g., Markdown in the repo]`
- **Video hosting:** `[CONFIGURE: e.g., YouTube (unlisted), Loom, in-repo .webm]`
- **PDF conversion tool:** `[CONFIGURE: e.g., pandoc, Adobe Acrobat, OCR tool, or "manual"]`
- **Alt text contribution workflow:** `[CONFIGURE: e.g., GitHub issues with "alt-text-needed" label, community events, PR-based]`
- **Alt text placeholder format:** `[CONFIGURE: e.g., "..." (ellipsis), "[image description needed]", or project convention]`
