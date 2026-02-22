# Documentation + Evidence Accessibility

The playbook asks projects to produce documentation, issue cards, videos, reports, and
other artifacts. If those artifacts aren't accessible, searchable, and maintainable,
the playbook defeats its own purpose.

This guide sets the floor for artifact hygiene.

**Source:** Open Source Guides (Section 7.2 "Documenting Your Processes"), team
discussion on PDF report friction.

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
  From the team: a colleague was manually retyping a 400-page manual annually because
  no one had introduced a conversion tool into the workflow.
- Playback speed on video/audio content is an accessibility affordance -- host on
  platforms that support user-controlled speed (from discussion: "I put it at the
  speed it was designed to be heard at... since it's on YouTube, you have the option
  of having a little more control over the speed yourself")

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

### Project-specific configuration

- **Preferred doc format:** `[CONFIGURE: e.g., Markdown in the repo]`
- **Video hosting:** `[CONFIGURE: e.g., YouTube (unlisted), Loom, in-repo .webm]`
- **PDF conversion tool:** `[CONFIGURE: e.g., pandoc, Adobe Acrobat, OCR tool, or "manual"]`
