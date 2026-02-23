# Lead Developer Choices Needed

Decisions that require the lead developer's input before they can be
implemented. Each decision includes the question, the options, supporting
research, and the default if no decision is made.

---

## OQ-1: Pixi enforcement

### Should the project build a pre-commit hook for Pixi enforcement?

Written rules alone achieve roughly 30% compliance from AI agents on difficult
domains [S13, SOPBench]. A pre-commit hook that rejects non-Pixi commands would
raise compliance mechanically.

| Option | Trade-off |
| --- | --- |
| **Build a pre-commit hook** | High compliance, upfront development cost, requires maintaining hook logic as Pixi evolves |
| **Accept ~30% rule compliance** | No development cost, but AI agents will continue to bypass Pixi for some commands |

**If no decision is made:** The playbook ships with a written rule and a
`[CONFIGURE: ...]` placeholder for the hook. Compliance stays at whatever the
AI tool's default obedience rate is.

### Should the project adopt `pixi-skills` for versioned rule distribution?

`pixi-skills` packages environment tool rules as versioned, installable
artifacts. This would allow playbook adopters to install rules the same way they
install dependencies — with version pinning and update workflows.

| Option | Trade-off |
| --- | --- |
| **Adopt pixi-skills** | Rules become installable and versionable; adds a dependency on the pixi-skills ecosystem |
| **Keep rules as flat files** | No new dependency; manual update process continues |

**If no decision is made:** Rules stay as flat files in the playbook. Adopters
copy them manually.

### Should the project invest in automated enforcement now or defer?

Automated enforcement (CI checks, pre-commit hooks, linting rules) for every
golden rule vs. manual-only enforcement with `[CONFIGURE: ...]` placeholders.

| Option | Trade-off |
| --- | --- |
| **Invest now** | Higher initial cost, but golden rules are mechanically enforced from the start |
| **Defer** | Lower initial cost; enforcement stays manual until a pain threshold is reached |

**If no decision is made:** The playbook ships with `[CONFIGURE: ...]`
placeholders in the rule enforcement matrix. Projects decide enforcement
timing individually.

---

## OQ-2: Contributor onboarding

### How many human-first contributions should be required?

Before a new contributor submits AI-generated (AIL-2) work, they should
demonstrate understanding of the project through human-authored contributions.
The question is how many.

| Option | Rationale |
| --- | --- |
| **1 contribution** | Low barrier to entry; proves the contributor can follow the workflow |
| **3 contributions** | Higher confidence the contributor understands project norms and codebase patterns |
| **Tied to scaffolded complexity** | First contribution is simple (docs, link check), second is moderate (bug fix), third is feature-level — then AIL-2 opens |

**If no decision is made:** The playbook ships with a `[CONFIGURE: e.g., 1, 3]`
placeholder. Each adopting project decides its own threshold.

### Should the project adopt OpenTelemetry's AIL-0/AIL-1/AIL-2 levels or a simpler binary disclosure?

The graduated model (AIL-0/AIL-1/AIL-2) provides more signal about how AI was
used. A binary model (human / AI-assisted) is simpler to enforce but collapses
the distinction between "AI helped with autocomplete" and "AI wrote the whole
PR."

| Option | Trade-off |
| --- | --- |
| **Three-level (AIL-0/1/2)** | More signal for reviewers; slightly higher contributor friction |
| **Binary (human / AI-assisted)** | Simpler; loses the distinction between assistance and generation |

**If no decision is made:** The playbook ships with the three-level model
(already added to issue templates). Projects can simplify to binary by
collapsing AIL-1 and AIL-2 into a single label.

---

## OQ-3: Dual-audience docs

### Should the project adopt SurfContext to auto-generate tool-specific rule files from AGENTS.md?

Maintaining four rule files (AGENTS.md, CLAUDE.md, golden-rules.mdc,
copilot-instructions.md) is a recurring maintenance burden. SurfContext reads
a single AGENTS.md and generates tool-specific variants.

| Option | Trade-off |
| --- | --- |
| **Adopt SurfContext** | Single source of truth; adds a build-time dependency; some tool-specific formatting may be lost |
| **Keep manual 4-file approach** | Full control over tool-specific formatting; higher maintenance cost |

**If no decision is made:** The playbook keeps the 4-file approach. A note in
section 17 of PLAYBOOK.md mentions SurfContext as an option.

### Should the project elevate Pixi toml task descriptions as the recommended agent context surface?

Pixi's `pixi.toml` task descriptions are dense, structured, and
machine-readable — better context per token than free-text rule files. Elevating
them as the primary context surface would mean AI agents read task descriptions
from the config file before consulting rule files.

| Option | Trade-off |
| --- | --- |
| **Elevate pixi.toml descriptions** | Better token efficiency; requires Pixi adoption by the project |
| **Keep rule files as primary** | No Pixi dependency; rule files remain the primary context surface |

**If no decision is made:** TOKEN_ECONOMICS.md already recommends pixi.toml
task descriptions as a preference. No further elevation happens.

---

## OQ-5: Alt text strategy

### Should the project evaluate Mozilla's DistilViT for draft alt text generation?

Mozilla shipped DistilViT (182M parameters, Apache-2.0) in Firefox 130 for
browser-local alt text. It runs on-device, avoids cloud costs, and could
generate draft descriptions for human review.

| Option | Trade-off |
| --- | --- |
| **Evaluate DistilViT** | On-device, no cloud cost, Apache-2.0 licensed; requires integration work and quality assessment |
| **Skip for now** | No development cost; alt text remains fully human-authored |

**If no decision is made:** The playbook recommends human-in-the-loop alt text
only. DistilViT is mentioned as a future exploration path.

### What should the quality bar for AI-drafted alt text be?

If AI-generated alt text is explored, two quality bars are possible:

| Option | Trade-off |
| --- | --- |
| **Draft-for-reviewers** | AI generates a draft; a human must review and approve before it goes live. Higher quality, slower throughput. |
| **Any-is-better-than-none** | AI-generated alt text ships immediately as a placeholder, replaced by human text over time. Faster coverage, risk of inaccurate descriptions reaching users. |

**If no decision is made:** The playbook's current position is that AI does not
generate alt text for AT content. No AI alt text ships.

### Timeline priority: community events first, or browser-local detection in parallel?

Two alt text improvement paths are available. The question is sequencing.

| Option | Trade-off |
| --- | --- |
| **Community events first** | Lower technical risk; builds community engagement; slower coverage growth |
| **Browser-local detection in parallel** | Faster detection of gaps; requires DistilViT evaluation; can run alongside community events |

**If no decision is made:** Community contribution model is the default (already
in COMMUNITY_FUNNEL.md). Browser-local detection remains a future exploration
item.

---

## OQ-6: Ouroboros cycle (test bootstrapping)

### Which AI test generation tool should be evaluated?

| Tool | Language | Pass Rate | Cost | Source |
| --- | --- | --- | --- | --- |
| **TestForge** | JavaScript/TypeScript | 84.3% | ~$0.63/file | [R8] |
| **CoverUp** | Python | ~80% coverage | ~$0.63/file | [R9] |
| **Testora** | Any (regression detection) | N/A | ~$0.003/PR | [R10] |

| Option | Trade-off |
| --- | --- |
| **TestForge (JS/TS focus)** | Best fit for web-focused AT projects; no Python coverage |
| **CoverUp (Python focus)** | Best fit for Python-based tools; no JS/TS coverage |
| **Both** | Broader coverage; more evaluation work |

**If no decision is made:** The playbook ships with `[CONFIGURE: ...]`
placeholders for tool choice. No specific tool is recommended as default.

### Should test bootstrapping start with zero-coverage files or the 10 most critical files?

| Option | Trade-off |
| --- | --- |
| **Zero-coverage files first** | Maximum coverage gain per test; may include low-priority files |
| **10 most critical files first** | Highest risk reduction; requires upfront triage to identify critical files |

**If no decision is made:** The bootstrapping guidance recommends zero-coverage
files as the default starting point. Projects can override with a critical-files
list.

### Should the project adopt Testora for $0.003/PR regression detection?

Testora runs AI-generated regression tests on every PR at very low cost.

| Option | Trade-off |
| --- | --- |
| **Adopt Testora** | Cheap, automated regression detection on every PR; adds a CI dependency |
| **Skip for now** | No new CI dependency; regression detection relies on existing tests only |

**If no decision is made:** The bootstrapping guidance mentions Testora with a
`[CONFIGURE: ...]` placeholder. Projects opt in individually.
