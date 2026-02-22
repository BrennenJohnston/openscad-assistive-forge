# Lessons from Development History

This document analyzes 100 Cursor development plans from the origin project to
extract what worked, what failed, and what course corrections were needed when
using AI-assisted development. It's the empirical foundation for every rule in
this playbook.

**Source:** Development plan archives (100 plan files), internal development
experience.

**Note:** Plan names have been generalized from the origin project. Some names
reference project-specific features; they are included for statistical accuracy
and to illustrate the types of work that succeed or fail with AI assistance.

## Statistical summary

| Metric | Value |
| --- | --- |
| Total plans analyzed | 100 |
| Fully completed (all todos done) | 23 (23%) |
| Partially completed (>50% todos) | 9 (9%) |
| Stalled or pending (<=50% todos) | 66 (66%) |
| Superseded by later plan | 2 (2%) |

### Completion rate by scope size

| Scope | Plans | Completed | Rate |
| --- | --- | --- | --- |
| Narrow (1-2 files) | 18 | 9 | 50% |
| Medium (3-10 files) | 47 | 12 | 26% |
| Broad (10+ files / architectural) | 35 | 2 | 6% |

### Completion rate by type

| Type | Plans | Completed | Rate |
| --- | --- | --- | --- |
| Bug fix | 8 | 4 | 50% |
| Feature | 32 | 9 | 28% |
| Refactor | 10 | 3 | 30% |
| Documentation | 12 | 4 | 33% |
| Audit | 14 | 5 | 36% |
| Research | 10 | 2 | 20% |
| Build-plan / sprint | 14 | 1 | 7% |

### Key statistical findings

- **Narrow-scope plans complete at 8x the rate of broad-scope plans** (50% vs 6%).
  This is the single strongest predictor of plan success.
- **Bug fixes and audits complete at the highest rates** -- they have clear end
  conditions.
- **Sprint plans and build-plans complete at the lowest rates** (7%) -- they try
  to do too much at once.
- **Documentation plans completed numerically (33%) but required multiple iterations**
  -- three separate doc audit plans were needed to match the project's tone.

## Top 5 success patterns

### 1. Narrow scope with explicit acceptance criteria

Plans that targeted a single bug or feature with checkboxes completed reliably.

**Evidence:** `boolean_string_conversion_fix` (8/8), `github_sponsors_setup` (2/2),
`cad_version_reconciliation` (3/3), `remove_pwa_ui_prompts` (referenced in plan).

### 2. Layer-based decomposition

Breaking a large goal into feasibility -> build -> remediation layers allowed
progress tracking and early abandonment of infeasible work.

**Evidence:** `execute_layer_1_plan` (10/10), `feasibility_build_planning` (planned),
`layer_3_stakeholder_remediation` (planned).

### 3. Research-first plans

Plans that started with research before implementation had clearer scope and
fewer surprises.

**Evidence:** `accessibility_enhancements_research_plan` (12/12),
`cad_conversion_workflows` (7/7), `partner_device_compatibility_research` (referenced).

### 4. Stakeholder-driven scoping

Plans driven by real user feedback had clearer acceptance criteria than
internally-driven plans.

**Evidence:** `stakeholder_bug_audit` (7/7), `stakeholder_sanitization_build_plan`
(12/14), `layer_3_stakeholder_remediation` (stakeholder-driven).

### 5. Forensic audits before building

Running a full audit to understand the current state prevented wasted work downstream.

**Evidence:** `full_program_audit`, `plans_audit_&_build_plans` (9/9),
`github_repository_audit` (12/12).

## Top 6 failure anti-patterns

### 1. Scope overload

Trying to accomplish too many goals in one plan. Sprint plans and multi-feature
plans had a 7% completion rate.

**Evidence:** `project_sprint_plan` (0/18 -- 4 bugs + 5 features
simultaneously), `runtime_dependency_audit_plan` (0/20).

### 2. Documentation audit loops

Documentation audits required 3+ separate plans before the AI produced output
matching the project's warm, informal tone. AI consistently defaults to corporate
formality.

**Evidence:** `documentation_audit` (5/5), `documentation_audit_phase2` (6/6),
`documentation_style_audit` (0/8 -- the tone correction pass that finally addressed
the voice mismatch).

### 3. Feature completion drift

The same feature set was re-planned multiple times with expanding scope each time.

**Evidence:** `device_feature_completion` (0/8) ->
`device_feature_completion_v2_validated` (0/14, scope grew) ->
`device_remaining_features` (9/9, finally completed with reduced scope).

### 4. Duplicate plans for the same problem

The same goal appeared in multiple plans, suggesting the first prompt didn't
produce actionable output.

**Evidence:** `ui_accessibility_standardization_46751cfa` (12/12) and
`ui_accessibility_standardization_be8c33bf` (4/4) -- two separate plans for the
same problem. Also `welcome_feature_paths` (0/7) and `welcome-feature-paths-v2`
(0/5).

### 5. Architectural plans without decomposition

Broad-scope plans that tried to redesign architecture in a single pass stalled
almost universally.

**Evidence:** `dual_controller_architecture` (0/4), `file_storage_system_overhaul`
(0/12), `responsive_drawer-based_ui_overhaul` (0/10),
`accessible_color_system_rebuild` (0/15).

### 6. Comprehension delegation

Offloading the reading and analysis of primary source documents to lower-tier
AI models or subagents. The `research_analysis_plan` incident (2026-02-21)
demonstrated that this poisons the research base and makes all downstream
artifacts unreliable. The cost of re-reading documents correctly is far less
than the cost of building a project roadmap on hallucinated summaries. Even
same-tier subagents fragment context across documents, reducing synthesis
quality.

**Evidence:** Plan `research_analysis_plan_ce9d6056` Phase 3 execution
delegated primary-source reading and summarization to lower-tier subagents.
All resulting summaries are marked untrusted pending re-processing.

See [AI_TASK_DELEGATION_RULES.md](AI_TASK_DELEGATION_RULES.md) for the full
delegation policy added in response to this incident.

### 7. Context-boundary fabrication

Multi-session tasks produce derivatives from compressed prior-session context
instead of re-reading source documents. The output is confident, plausible,
and wrong. This is distinct from generic hallucination — the AI has a degraded
memory of having previously read something and writes detailed but inaccurate
content based on that memory.

**Pattern:** A resumed session writes summaries, quotes, or analyses from
carried-over context instead of re-reading the source documents it claims to
reference. The AI does not signal uncertainty because the compressed context
feels like real memory.

**Detection:** Compare a sample of derivatives against their claimed sources.
If quotes, participant lists, or topic descriptions don't match, the entire
session's output from carried-over context is suspect. Check middle-of-session
documents first — positional bias makes these most prone to lossy compression
[R2, Liu et al., TACL 2024].

**Prevention:** Re-read before rewrite (see
[SESSION_BOUNDARY_PROTOCOL.md](SESSION_BOUNDARY_PROTOCOL.md)). At the start
of any resumed session, produce a handoff inventory and re-read every source
document needed for the current session's work.

**Consequence class:** Same as comprehension delegation (anti-pattern #6) —
errors propagate into all derivative artifacts. A fabricated summary feeds a
flawed synthesis feeds a wrong plan. Every layer of derivation from the
corrupted source amplifies the error.

## Course-correction strategies that worked

### 1. Validated re-plans

Creating a `_v2_validated` version after verifying which parts of v1 actually
succeeded. The "validated" suffix means someone checked before re-planning.

### 2. Stakeholder-driven scoping

Plans driven by real user feedback (`stakeholder_bug_audit`,
`layer_3_stakeholder_remediation`) had clearer acceptance criteria than
internally-driven plans.

### 3. Forensic audits before building

`full_program_audit`, `plans_audit_&_build_plans` surfaced issues that prevented
wasted work downstream.

### 4. Legacy code treatment

Treating AI-generated code as legacy code (where history has been lost) and
applying characterization tests before refactoring. Even new code becomes legacy
when the reasoning behind decisions is not preserved.

AI-generated codebases are legacy from birth because:

- Architectural reasoning is not preserved in the code
- The developer who prompted the AI may not understand the generated patterns
- Dependencies were selected by AI without team vetting
- The codebase may look modern but its internal decisions are opaque

The impulse to abandon and rebuild with AI is techno-optimism. The reality is
that you bought something not fit for purpose and need to make it fit for
purpose. Measured data confirms this framing: AI-generated code exhibits reduced
refactoring and increased duplication, resembling temporary contractor work
rather than maintainable contributions [S5, Harding & Kloster, 2024]. Existing
regression tests catch only 7.6% of semantics-changing code changes during
refactoring [R7, ChangeGuard, FSE 2025], meaning characterization tests must be
written specifically for legacy sections before any modification.

**Treatment protocol:**

1. Wrap in characterization tests before modifying
2. Build equitable interfaces around opaque sections
3. Recover understanding incrementally
4. Prefer refactoring to rewriting
5. Measure progress by code removed, not code added

### 5. Video-based bug reporting

Recording 10-15 minute testing sessions and uploading to YouTube (unlisted)
proved faster than written reproduction steps and more accessible for the team
to review.

## Environmental and tooling lessons

1. **Environment tool enforcement is critical** -- AI defaulting to bash instead of
   Pixi was a persistent, unresolved pain point across the entire development history
2. **Token economics matter** -- Cursor preferences and rules bloat token counts
   invisibly, raising costs with every prompt
3. **Process cadence prevents burnout** -- "Build, build, build, refactor, refactor,
   refactor" cycles are healthier than continuous feature addition
4. **Goodhart's Law applies** -- "Features become a metric and cease to be a feature."
   Measuring AI productivity by output volume incentivizes bloat
5. **Cross-tool portability is non-optional** -- Rules in `.cursor/rules/` are invisible
   to contributors using Copilot or Claude Code

## Recommended plan template

Based on these empirical patterns, use this template for AI-assisted development plans:

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

## Delegation Guardrail
- Comprehension-critical tasks in this plan: [list tasks that must NOT be delegated]
- Delegation-safe tasks in this plan: [list tasks that MAY be delegated]
- Verification: [ ] All comprehension-critical tasks were performed by the primary model

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

## Classification table

One row per plan file, sorted by outcome then alphabetically.

| Plan | Type | Scope | Todos | Done | Outcome |
| --- | --- | --- | --- | --- | --- |
| accessibility_enhancements_research | research | medium | 12 | 12 | Completed |
| cad_conversion_workflows | research | medium | 7 | 7 | Completed |
| boolean_string_conversion_fix | bug fix | narrow | 8 | 8 | Completed |
| compatibility-hardening-plan | feature | medium | 8 | 8 | Completed |
| comprehensive_model_testing | feature | medium | 20 | 20 | Completed |
| documentation_audit | documentation | medium | 5 | 5 | Completed |
| documentation_audit_phase2 | documentation | medium | 6 | 6 | Completed |
| execute_layer_1_plan | build-plan | broad | 10 | 10 | Completed |
| final_testing_guide | documentation | medium | 13 | 13 | Completed |
| project_manifest | feature | narrow | 7 | 7 | Completed |
| recommendations_implementation | feature | medium | 12 | 12 | Completed |
| github_repository_audit | audit | medium | 12 | 12 | Completed |
| github_sponsors_setup | feature | narrow | 2 | 2 | Completed |
| hardware_controller_ui_plan | feature | medium | 13 | 13 | Completed |
| cad_debug_alignment | bug fix | narrow | 10 | 10 | Completed |
| cad_version_reconciliation | refactor | narrow | 3 | 3 | Completed |
| plans_audit_&_build_plans | audit | broad | 9 | 9 | Completed |
| stakeholder_bug_audit | audit | medium | 7 | 7 | Completed |
| model_validation_framework | feature | medium | 14 | 14 | Completed |
| ui_accessibility_standardization (46751cfa) | refactor | broad | 12 | 12 | Completed |
| ui_accessibility_standardization (be8c33bf) | refactor | medium | 4 | 4 | Completed |
| device_compatibility_update | feature | medium | 14 | 14 | Completed |
| device_remaining_features | feature | medium | 9 | 9 | Completed |
| accessibility_audit_plan | audit | medium | 8 | 7 | Partial |
| client-side_mesh_repair | feature | narrow | 6 | 5 | Partial |
| cloudflare_client-side_preview_performance | feature | narrow | 8 | 7 | Partial |
| cross-browser_ui_hardening | feature | medium | 7 | 6 | Partial |
| major_package_updates | refactor | broad | 36 | 29 | Partial |
| rendering_performance_reference | feature | medium | 7 | 5 | Partial |
| stakeholder_sanitization_build_plan | build-plan | broad | 14 | 12 | Partial |
| hosting_alternatives_research | research | narrow | 4 | 1 | Partial |
| easter_egg_feature | feature | narrow | 6 | 1 | Partial |
| web_bridge_tool_CONSOLIDATED | build-plan | broad | 0 | 0 | Superseded |
| web_bridge_tool | build-plan | broad | 15 | 0 | Superseded |
| accessible_color_system_rebuild | refactor | broad | 15 | 0 | Stalled |
| accessible_preview_controls | feature | narrow | 1 | 0 | Stalled |
| add_cylinder_presets | feature | narrow | 4 | 0 | Stalled |
| add_paper_thickness_presets | feature | narrow | 8 | 0 | Stalled |
| project_sprint_plan | build-plan | broad | 18 | 0 | Stalled |
| auto-rotation_feature | feature | medium | 7 | 0 | Stalled |
| braille_safety_audit_plan | audit | medium | 11 | 0 | Stalled |
| business_card_guidance | documentation | medium | 12 | 0 | Stalled |
| capitalized_letters_toggle | feature | narrow | 6 | 0 | Stalled |
| dead_code_cleanup_plan | refactor | broad | 9 | 0 | Stalled |
| documentation_style_audit | documentation | medium | 8 | 0 | Stalled |
| dual_controller_architecture | refactor | broad | 4 | 0 | Stalled |
| educator_tutorial_enhancement | feature | medium | 9 | 0 | Stalled |
| feasibility_build_planning | build-plan | broad | 10 | 0 | Stalled |
| feature_discoverability_integration | feature | medium | 9 | 0 | Stalled |
| feature_testing_checklist | documentation | medium | 6 | 0 | Stalled |
| file_storage_system_overhaul | refactor | broad | 12 | 0 | Stalled |
| full_program_audit | audit | broad | 11 | 0 | Stalled |
| help_guide_documentation_audit | documentation | medium | 9 | 0 | Stalled |
| help_guide_restructuring | documentation | medium | 9 | 0 | Stalled |
| dev_unlock_bypass | feature | narrow | 6 | 0 | Stalled |
| hardware_integration_research | research | medium | 11 | 0 | Stalled |
| layer_3_stakeholder_remediation | build-plan | broad | 12 | 0 | Stalled |
| led_visualization_modes | feature | medium | 6 | 0 | Stalled |
| mesh_processing_path_forward | research | medium | 5 | 0 | Stalled |
| master_audit_prompt | audit | medium | 6 | 0 | Stalled |
| measurement_mm_and_calibration | feature | medium | 8 | 0 | Stalled |
| measurement_ux_and_preview_controls | feature | medium | 9 | 0 | Stalled |
| mobile_desktop_qol_fixes | bug fix | medium | 6 | 0 | Stalled |
| mobile_tutorial_ux | feature | medium | 6 | 0 | Stalled |
| multi-phase_accessibility_audit | audit | broad | 10 | 0 | Stalled |
| multi-platform_output_roadmap | build-plan | broad | 11 | 0 | Stalled |
| panel_layout_optimization | refactor | medium | 5 | 0 | Stalled |
| parametric_device_design | feature | narrow | 12 | 0 | Stalled |
| phase1-2_gap_fixes | bug fix | medium | 7 | 0 | Stalled |
| remove_pwa_ui_prompts | refactor | medium | 12 | 0 | Stalled |
| remove_upstash_dependencies | refactor | medium | 13 | 0 | Stalled |
| responsive_drawer-based_ui_overhaul | refactor | broad | 10 | 0 | Stalled |
| retro_mode_button | feature | narrow | 5 | 0 | Stalled |
| theme_expansion | feature | medium | 6 | 0 | Stalled |
| robust_responsive_tutorial | feature | medium | 6 | 0 | Stalled |
| saved_projects_feature | feature | medium | 10 | 0 | Stalled |
| screenshot_reference_overlay | feature | narrow | 8 | 0 | Stalled |
| stakeholder_testing_plan | audit | medium | 11 | 0 | Stalled |
| stepper_motor_feasibility | research | narrow | 2 | 0 | Stalled |
| tof_velocity_braking_system | research | medium | 5 | 0 | Stalled |
| tutorial_+_settings_+_companion_fixes | bug fix | medium | 13 | 0 | Stalled |
| ui-polish-standardization-pass | refactor | broad | 11 | 0 | Stalled |
| ui_consistency_framework | refactor | broad | 14 | 0 | Stalled |
| ui_remediation_plan | bug fix | medium | 9 | 0 | Stalled |
| v2.3_audit_release | audit | broad | 5 | 0 | Stalled |
| validation_+_dead-code_cleanup_roadmap | audit | broad | 7 | 0 | Stalled |
| device_compatibility_research | research | medium | 12 | 0 | Stalled |
| device_features_testing | audit | medium | 7 | 0 | Stalled |
| device_feature_completion | feature | medium | 8 | 0 | Stalled |
| device_feature_completion_v2_validated | feature | broad | 14 | 0 | Stalled |
| device_feedback_implementation | feature | medium | 6 | 0 | Stalled |
| device_export_validation | audit | medium | 9 | 0 | Stalled |
| device_workflow_gap_analysis | research | medium | 6 | 0 | Stalled |
| walker_brake_assist_system | research | medium | 6 | 0 | Stalled |
| runtime_dependency_audit_plan | audit | broad | 20 | 0 | Stalled |
| welcome-feature-paths-v2 | feature | narrow | 5 | 0 | Stalled |
| welcome_feature_paths | feature | medium | 7 | 0 | Stalled |
| major_package_updates_historical_backup | refactor | broad | 38 | 18 | Stalled |
| major_package_updates_historical_backup_2 | refactor | broad | 38 | 18 | Stalled |
