# Evidence-to-Issue Triage Pipeline

Raw feedback comes in many shapes -- PDF reports, transcripts, videos, screenshots,
test recordings. This pipeline turns that mess into clear, actionable issues that
AI agents (and humans) can work through safely.

## Required workflow

1. **Ingest evidence** (PDF/text transcript/video/screenshot bundle)
2. **Normalize into issue cards** (one issue, one problem)
3. **Deduplicate and cluster** by user impact and affected surface
4. **Assign severity + accessibility impact** (`P0/P1/P2`)
5. **Label and route** (`a11y`, `responsive`, `links`, `tags`, `good first issue`, etc.)
6. **Define test evidence required** before merge (automated + manual)

## Issue card schema

Every issue created from evidence should follow this structure. A ready-to-copy
template is in `templates/issue-card.md`.

| Field | Description |
| --- | --- |
| **Problem statement** | User-impact first -- what breaks and for whom |
| **Reproduction steps** | Numbered steps to see the problem |
| **Expected vs actual behavior** | What should happen vs what does happen |
| **Accessibility impact** | Screen reader / keyboard / mobile effects |
| **Required evidence artifact** | Video / screenshots / logs attached |
| **Suggested acceptance criteria** | What "fixed" looks like |
| **Scope guard** | Allowed files / out-of-scope files |

## Severity rubric

| Severity | Meaning | Response Target |
| --- | --- | --- |
| **P0** | Blocks core functionality or creates an accessibility barrier | `[CONFIGURE: e.g., same day triage]` |
| **P1** | Degrades experience for a meaningful user group | `[CONFIGURE: e.g., within 48 hours]` |
| **P2** | Cosmetic, minor, or affects edge cases | `[CONFIGURE: e.g., next sprint]` |

## Label taxonomy

These labels work well for AT projects. Adapt to your project's needs.

| Label | Purpose |
| --- | --- |
| `a11y` | Accessibility bug or improvement |
| `responsive` | Mobile / viewport / touch issue |
| `links` | Broken or misleading links |
| `tags` | Tag/metadata/taxonomy issue |
| `good first issue` | Beginner-friendly (keep this set small and accurate) |
| `construction-underway` | Feature is incomplete and marked as such |

### Project-specific configuration

- **Label set:** `[CONFIGURE: your project's label taxonomy]`
- **Triage cadence:** `[CONFIGURE: e.g., weekly, daily for P0]`
- **Issue template path:** `[CONFIGURE: e.g., .github/ISSUE_TEMPLATE/]`

## Evidence format and accessibility guardrail

Large PDF reports with embedded images are high-friction unstructured blobs. Prefer
evidence that is:

- **Linkable**: one URL per issue card (issue link, doc page, or timestamped video link)
- **Searchable**: text-first (Markdown/plain text) with images as supplemental
- **Accessible**: images in issues/docs have alt text; videos have captions or a
  transcript when feasible
- **Chunked**: split large audits into many small issue cards instead of one mega-file
- **Portable**: avoid formats that are hard to diff/review (scanned PDFs) unless
  unavoidable

AI agents SHOULD, when given a PDF/report:

- Extract actionable findings into issue cards
- Preserve the original artifact as a reference attachment, but do not make it the only
  source of truth
