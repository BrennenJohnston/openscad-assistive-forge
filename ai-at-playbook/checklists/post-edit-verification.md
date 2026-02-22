# Post-Edit Verification

Run this after every AI-assisted change. It's the enforcement mechanism that ties
everything else together — bloat scanning, accessibility checks, OSS-first search,
and basic code quality.

The protocol has three tiers. Tier 1 runs on every change. Tier 2 adds manual checks
for UI and accessibility work. Tier 3 adds research and documentation checks for new
features and major changes.

## Tier 1: Automated (runs on EVERY AI-assisted change)

| Check | Command / Method | Blocking? |
| --- | --- | --- |
| Lint passes | `[CONFIGURE: lint command]` | Yes |
| Format passes | `[CONFIGURE: format check command]` | Yes |
| Unit tests pass | `[CONFIGURE: unit test command]` | Yes |
| E2E tests pass | `[CONFIGURE: e2e test command]` | Yes |
| Bundle budget met | `[CONFIGURE: budget check command]` | Yes (if applicable) |
| AI code bloat scan | Run Phase 11A checklist against diff | Warning |
| AI doc bloat scan | Run Phase 11B checklist against changed `.md` files | Warning |
| No hallucinated imports | Verify all imports resolve to actual files | Yes |
| No scope creep | `git diff --name-only` matches stated task scope | Warning |
| Protected files untouched | Cross-reference diff against file protection registry | Yes |

## Tier 2: Human-Reviewed (runs on UI / accessibility changes)

| Check | Method | Blocking? |
| --- | --- | --- |
| Keyboard-only walkthrough | Manual: Tab through all new/changed interactive elements | Yes |
| Screen reader spot-check | Manual: Verify accessible names, live region announcements | Yes |
| High-contrast mode | Manual: Visual check in all themes + forced-colors | Yes |
| Reduced-motion behavior | Manual: Enable `prefers-reduced-motion` and verify | Yes |
| Touch target measurement | Manual or DevTools: Verify >= minimum size | Yes |
| Visual consistency | Manual: Compare with existing components for design drift | Warning |

## Tier 3: Research-Informed (runs on new features and major changes)

| Check | Method | Blocking? |
| --- | --- | --- |
| OSS-first search completed | Verify search documentation exists (see `oss-first-search.md`) | Yes (for features) |
| Reference project linked | If OSS adopted, verify `REFERENCES.md` or `@see` entry | Yes (if applicable) |
| Feature flag added | Verify non-trivial features have a flag | Warning |
| Rollback procedure documented | Verify rollback path exists and is tested | Warning |
| CHANGELOG entry drafted | Verify user-facing changes are documented | Warning |
| Accessibility conformance | Verify WCAG criteria addressed if UI changed | Yes (for UI) |

## When to use which tier

- **Every AI-assisted change**: Tier 1
- **UI or accessibility changes**: Tier 1 + Tier 2
- **New features or major changes**: Tier 1 + Tier 2 (if UI) + Tier 3

## Automation strategy

For projects that want to automate parts of this:

1. **Pre-commit hook** — run lint, format, and hallucinated-import check locally
2. **CI pipeline** — run the full Tier 1 suite on every PR
3. **PR template** — include Tier 2 and Tier 3 checklists as checkboxes that the
   author must complete
4. **AI bloat bot** — optional GitHub Action that comments on PRs with detected
   AI anti-patterns

## Copy-paste checklist (for PR descriptions)

```markdown
### Post-edit verification

**Tier 1 (automated)**
- [ ] Lint passes
- [ ] Format passes
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Bundle budget met (if applicable)
- [ ] AI code bloat scan run against diff
- [ ] AI doc bloat scan run against changed docs
- [ ] All imports resolve to actual files
- [ ] Changes are within stated task scope
- [ ] Protected files are untouched

**Tier 2 (UI/accessibility changes only)**
- [ ] Keyboard-only walkthrough
- [ ] Screen reader spot-check
- [ ] High-contrast mode check
- [ ] Reduced-motion behavior verified
- [ ] Touch targets >= minimum size
- [ ] Visual consistency with existing components

**Tier 3 (new features / major changes only)**
- [ ] OSS-first search completed and documented
- [ ] Reference project linked (if applicable)
- [ ] Feature flag added (if applicable)
- [ ] Rollback procedure documented
- [ ] CHANGELOG entry drafted
- [ ] Accessibility conformance verified
```
