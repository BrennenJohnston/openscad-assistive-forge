# GitHub Open Source Guides — Reference Index

A distilled reference of all 12 chapters from the GitHub Open Source Guides, mapped to
existing playbook documents and supplemented with AI-agent decision rules.

**Primary source:** [GitHub Open Source Guides](https://opensource.guide)  
**License:** Content under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).  
**Full verbatim text:** `docs/OPEN_SOURCE_GUIDES.md` (same directory — 1,800+ lines, all 12 chapters)  
**Attribution:** *Content based on github.com/github/opensource.guide used under the CC-BY-4.0 license.*

> **For humans:** Read `OPEN_SOURCE_GUIDES.md` in this folder for the complete, unabridged guide.  
> **For AI agents:** Use this file for decision rules and cross-references; load `OPEN_SOURCE_GUIDES.md`
> when you need the full context of a specific chapter.

---

## How to use this document

Each section below:
- Summarizes the chapter's core guidance
- Links to the playbook doc that expands on it (where one exists)
- Adds AI-agent decision rules that are unique to that chapter

When making an open source contribution decision, find the relevant section and follow
the rules. When a playbook doc is listed, read it for deeper guidance.

---

## Chapter 1 — Security Best Practices

**Playbook doc:** `docs/SECURITY_OPERATIONS_BASELINE.md`

### AI-agent rules (security)

- NEVER commit API keys, tokens, passwords, or credentials — use secret scanning
  (GitHub Secret Scanning, Trufflehog) to catch slips before they reach remote
- CHECK dependency licenses AND vulnerabilities before suggesting new packages; use
  Dependabot / Renovate signals already present in the repo
- REQUIRE passing CI checks (including security scans) before merging any PR
- RECOMMEND `SECURITY.md` + private vulnerability reporting (PVR) when a project
  does not yet have one — this is a hard prerequisite for public projects
- FLAG any PR that removes or weakens branch protection rules; escalate to human review

### Key thresholds (from Section 1)

| Practice | Required for | Notes |
|---|---|---|
| MFA for all maintainers | Any project with external contributors | |
| SAST tool in CI | Projects with > 1 contributor | GitHub CodeQL is free for OSS |
| Secret scanning | All projects | Enable before first push |
| Branch protection on `main` | Projects with > 1 contributor | Require reviews + passing CI |
| `SECURITY.md` + PVR | All public projects | Private email is minimum viable |
| SBOM | Projects with corporate or regulated users | `syft` or `trivy` |

---

## Chapter 2 — Maintaining Balance / Avoiding Burnout

**Playbook doc:** `docs/MAINTAINER_SUSTAINABILITY.md`

### AI-agent rules (burnout prevention)

- Do NOT open new issues or PRs on behalf of maintainers without being asked —
  surprise work arrivals are a burnout trigger
- When a repository shows signs of low activity (no response > 30 days, stale PRs),
  ACKNOWLEDGE this in any proposed contribution and set low expectations; do not
  interpret silence as approval
- TIME-BOX AI sessions to 90 minutes; flag if a task is expanding beyond scope

---

## Chapter 3 — How to Contribute to Open Source

**Playbook doc:** `prompts/15-open-source-contribution.md`

### Pre-contribution checklist (from Section 3.4)

Before opening an issue or PR on any project:

- [ ] Does the project have a LICENSE file? (If no, it is not open source — stop)
- [ ] Is the project actively maintained? (Recent commits, issues getting responses)
- [ ] Is the community welcoming? (Tone in issues/PRs, maintainer responses)
- [ ] Have you searched open AND closed issues for duplicates?
- [ ] Have you read CONTRIBUTING.md end-to-end?

### Contribution communication rules (from Section 3.5)

- **Give context** — explain WHY, not just WHAT; include reproduction steps for bugs
- **Keep it short** — concise contributions get reviewed faster
- **Stay public** — never DM maintainers except for security or CoC violations
- **Respect "no"** — if a contribution is declined, don't argue; fork if you disagree
- **Reference the issue** — every PR must close or reference an issue number

### Post-submission rules (from Section 3.6)

- If no response after 7 days, ONE polite follow-up ping is acceptable
- If requested changes come back, respond within the window maintainers set
- If declined, say thank you — the maintainer reviewed your work

---

## Chapter 4 — Starting an Open Source Project

*No dedicated playbook doc — rules are inlined here.*

### Pre-launch checklist (from Section 4.5)

**Documentation (required before any public launch):**
- [ ] `LICENSE` file with a recognized open source license
- [ ] `README` that answers: what it does, why it matters, how to get started, where
  to get help
- [ ] `CONTRIBUTING.md` explaining how to contribute and what types are welcome
- [ ] `CODE_OF_CONDUCT` (Contributor Covenant is a safe default)

**Code:**
- [ ] No sensitive materials in revision history (secrets, credentials, PII)
- [ ] Consistent code conventions documented or enforced by linter
- [ ] Comments document intent and edge cases, not obvious mechanics

**People (individual):**
- [ ] Reviewed employer IP agreement — confirm project is not company IP

**People (company/org):**
- [ ] Legal team informed and has approved the license choice
- [ ] At least two people have admin access
- [ ] Someone is committed to community management (not just code shipping)

### License selection decision tree (from Section 4.3 + 12.5)

```
Starting a new project?
  └─ What is your primary goal?

      "Maximum adoption, fewest restrictions"
          └─ MIT

      "Same as MIT but with explicit patent grant (corporate-friendly)"
          └─ Apache 2.0

      "All derivatives must also be open source"
          └─ GPLv3 (binary/library) or AGPLv3 (web services)

      "Open core / dual licensing"
          └─ Talk to a lawyer first. Never pick BSL or SSPL — they are
             source-available, not open source.

      "Non-code content (docs, images, datasets)"
          └─ CC0-1.0 (public domain) or CC-BY-4.0 (attribution required)
```

### AI-agent rules (new projects)

- NEVER set the project's license to a source-available license (BSL, SSPL, Commons
  Clause) and call it "open source" — these are not open source licenses
- ALWAYS create a LICENSE file as the first commit; a public GitHub repo without a
  license is NOT open source (copyright defaults to exclusive)
- RECOMMEND MIT for new AT projects unless a specific copyleft goal exists
- NEVER remove or downgrade a project's existing license without explicit human
  approval and legal review

---

## Chapter 5 — Finding Users for Your Project

**Playbook doc:** `docs/COMMUNITY_FUNNEL.md`

### Core rules (from Section 5)

- Define ONE canonical home URL before promoting anywhere
- Write a "why this exists" paragraph aimed at users, not developers
- Focus outreach on communities that will actually benefit — not broad spam
- Build reputation by contributing to related projects first

---

## Chapter 6 — Building Welcoming Communities

**Playbook doc:** `docs/COMMUNITY_FUNNEL.md`

### Community health rules (from Section 6)

- Label beginner-friendly issues explicitly (`good first issue`)
- Respond to new issues within the SLA window (see `docs/OSS_WORKFLOW_METRICS.md`)
- Document everything in public; decisions made in private should be posted as issue
  comments or discussion notes
- Zero tolerance for toxic behavior — address it publicly, promptly, and kindly

---

## Chapter 7 — Best Practices for Maintainers

**Playbook doc:** `docs/MAINTAINER_SUSTAINABILITY.md`

### Saying no — response template (from Section 7.3)

```
Thank you for contributing! This doesn't fit into the project's current scope
because [reason]. If you'd like to pursue it, a fork is always welcome.
[Optional: link to related documentation or issue]
```

- NEVER leave an unwanted contribution open out of guilt — close it promptly
- Use written project vision (README/VISION file) to depersonalize scope disputes
- Automate what robots can handle: tests, linting, stale-issue closing, dependency
  updates

---

## Chapter 8 — Leadership and Governance

*No dedicated playbook doc — rules are inlined here.*

### Governance model decision tree (from Section 8.5)

```
How many people make final decisions on the project?

  One person (founder/lead)
      └─ BDFL (Benevolent Dictator for Life)
         Example: Python, many small projects
         Risk: single point of failure

  Small core group, consensus-based
      └─ Meritocracy / Apache model
         Example: Apache projects
         Note: "meritocracy" has contested social history — name the model
         explicitly if you use it

  Current contributors weighted by recent activity
      └─ Liberal contribution model
         Example: Node.js, Rust
         Best fit for AT projects with rotating contributors
```

### Governance documentation rules (from Sections 8.3, 8.6)

- ALWAYS document governance model in `GOVERNANCE.md` before the first major
  community dispute — retroactive governance is much harder
- List leadership roles and how contributors can attain them (write it down before
  someone asks)
- Move projects from personal accounts to a GitHub Organization when community grows
  beyond 2-3 maintainers; add at least one backup admin
- When corporate contributors join, evaluate contributions on technical merit only —
  paid developers do not get preferential treatment

### Commit access decision guide (from Section 8.4)

| Project size | Recommended approach |
|---|---|
| 1–2 maintainers | Commit access only for maintainers |
| 3–10 contributors | Commit access after 3+ merged PRs demonstrating project norms |
| Active community | Protected `main` branch; merge via PR only; trusted contributors get review rights |

---

## Chapter 9 — Getting Paid for Open Source Work

**Playbook doc:** `docs/MAINTAINER_SUSTAINABILITY.md` (Resourcing section)

### Funding options summary (from Section 9.3)

| Channel | Good for | Examples |
|---|---|---|
| GitHub Sponsors | Individual maintainers | Direct recurring support |
| Open Collective | Projects needing transparent org finances | webpack, Babel |
| Crowdfunding | Specific features or milestones | Kickstarter, Patreon |
| Grants | Non-profits, research-adjacent projects | Mozilla OSS, Sloan Foundation |
| Corporate sponsorship | Popular infrastructure projects | Direct company contracts |
| Fiscal sponsor | Projects that don't want legal entity overhead | Software Freedom Conservancy, Open Collective |

---

## Chapter 10 — Your Code of Conduct

**Playbook doc:** `docs/CODE_OF_CONDUCT_ENFORCEMENT.md`

### Minimum viable CoC setup (from Sections 10.2–10.3)

1. Add `CODE_OF_CONDUCT.md` to project root (Contributor Covenant is the safe default)
2. Link to it from README and CONTRIBUTING
3. Provide a **private** reporting channel (email or GitHub private vulnerability
   reporting)
4. Provide an **alternate** reporter contact for violations involving maintainers
5. Document the enforcement steps **before** a violation occurs

---

## Chapter 11 — Open Source Metrics

**Playbook doc:** `docs/OSS_WORKFLOW_METRICS.md`

### Six metrics to track (from Section 11)

1. **Discovery** — page views, unique visitors, referring sites (GitHub Insights > Traffic)
2. **Usage** — package downloads, clone counts
3. **Retention** — new vs. returning contributors, first-time vs. repeat contributors
4. **Issue health** — open issue count, average time to first response, stale rate
5. **PR health** — open PR count, average time to merge, abandoned PR rate
6. **Maintainer responsiveness** — time from issue open to first maintainer response

---

## Chapter 12 — The Legal Side of Open Source

**Playbook doc:** `docs/LEGAL_LICENSE_GUIDE.md`

### Critical legal rules for AI agents (from Section 12)

- A **public** GitHub repo without a LICENSE file is NOT open source. The author
  retains exclusive copyright. Never treat an unlicensed repo as freely usable.
- Contributions without a CLA or inbound=outbound license agreement belong to their
  authors — they cannot be legally used, even by the project owner
- NEVER relicense a project without consent from ALL copyright holders; flag any
  request to change licenses for human + legal review
- Source-available licenses (BSL, SSPL) are NOT open source — flag immediately if a
  dependency uses one
- SBOM requirements: if a project targets regulated industries or government users,
  ask whether SBOM tooling is in scope before adding dependencies

---

## Chapter 13 — Legal Disclaimer

GitHub is not a law firm. This guide does not constitute legal advice. When in doubt,
consult your own legal counsel.

*Content based on github.com/github/opensource.guide used under the CC-BY-4.0 license.*

---

## Cross-reference map

| Chapter | Topic | Playbook doc |
|---|---|---|
| 1 | Security | `docs/SECURITY_OPERATIONS_BASELINE.md` |
| 2 | Maintainer burnout | `docs/MAINTAINER_SUSTAINABILITY.md` |
| 3 | Contributing | `prompts/15-open-source-contribution.md` |
| 4 | Starting a project | This file (inlined) |
| 5 | Finding users | `docs/COMMUNITY_FUNNEL.md` |
| 6 | Welcoming communities | `docs/COMMUNITY_FUNNEL.md` |
| 7 | Maintainer best practices | `docs/MAINTAINER_SUSTAINABILITY.md` |
| 8 | Governance | This file (inlined) |
| 9 | Getting paid | `docs/MAINTAINER_SUSTAINABILITY.md` |
| 10 | Code of conduct | `docs/CODE_OF_CONDUCT_ENFORCEMENT.md` |
| 11 | Metrics | `docs/OSS_WORKFLOW_METRICS.md` |
| 12 | Legal / licensing | `docs/LEGAL_LICENSE_GUIDE.md` |
