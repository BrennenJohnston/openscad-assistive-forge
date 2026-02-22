# PR Review Checklist: Accessibility + AI Guardrails

Run this checklist when reviewing any pull request. The accessibility section applies
to all UI changes. The AI guardrails section applies when AI tools were used to
generate any part of the PR.

Reference this checklist from your PR template
(`templates/.github/PULL_REQUEST_TEMPLATE.md`).

## Accessibility checks

| # | Check | Method | Blocking? |
| --- | --- | --- | --- |
| 1 | `:focus-visible` ring present | Tab through all new/changed interactive elements. Every one must show a visible focus indicator. | Yes |
| 2 | Keyboard operable | Operate every new/changed interactive element with keyboard only (Tab, Enter, Space, Escape, arrows). | Yes |
| 3 | Accessible name exists | Inspect each interactive element for an accessible name (visible label, `aria-label`, or `aria-labelledby`). | Yes |
| 4 | Semantic HTML used | Verify native elements (`button`, `details`, `fieldset`, `nav`, `main`, headings) are used where they work. No ARIA where a native element achieves the same result. | Yes |
| 5 | Touch target >= 44x44px | Measure touch targets on interactive elements. Verify minimum size at all breakpoints. | Yes |
| 6 | `prefers-reduced-motion` respected | Enable reduced motion preference. Verify no required animation plays. | Yes |
| 7 | Screen reader tested | Test with at least one screen reader. Note which one: ___ | Yes |
| 8 | High contrast / forced colors | Verify UI is readable and operable in `forced-colors: active` mode. | Warning |

## AI guardrails checks

| # | Check | Method | Blocking? |
| --- | --- | --- | --- |
| 1 | AI usage noted in PR description | If AI tools generated any code in this PR, the PR description states which parts were AI-generated. | Yes |
| 2 | Tests existed before AI implementation | Verify that tests defining expected behavior existed (or were written by a human) before AI generated the implementation. | Yes |
| 3 | PR description matches actual changes | Diff the PR description against the actual code changes. Verify no claims of unimplemented features. Research shows 45.4% of AI-authored PR descriptions contain unimplemented claims [S7]. | Yes |
| 4 | No new dependencies without team agreement | Check `git diff` for added packages. Flag any new dependency not discussed with the team. | Yes |
| 5 | No new abstractions without justification | Flag new wrapper functions, utility files, or abstraction layers. Each must have a stated reason. | Warning |
| 6 | Design tokens used | Verify no hardcoded colors, spacing, font sizes, or z-index values. All visual values must use tokens. | Yes |
| 7 | Environment tool used for all commands | Verify the PR was developed using the project's environment tool. No raw shell commands for tasks that have environment tool equivalents. | Warning |
| 8 | Delegation quality verified | If any part of this work involved AI reading source documents, verify the primary model did the reading — not a subagent. | Yes |

## Copy-paste checklist (for PR descriptions)

```markdown
### Accessibility

- [ ] `:focus-visible` ring on all new/changed interactive elements
- [ ] Keyboard-only operation verified
- [ ] Accessible names present on all interactive elements
- [ ] Semantic HTML used (no ARIA where native elements work)
- [ ] Touch targets >= 44x44px
- [ ] `prefers-reduced-motion` respected
- [ ] Screen reader tested (which one: ___)
- [ ] High contrast / forced colors checked

### AI guardrails (if AI was used)

- [ ] AI usage noted in this PR description
- [ ] Tests existed before AI generated implementation
- [ ] PR description accurately reflects actual code changes (no unimplemented claims)
- [ ] No new dependencies without team agreement
- [ ] No unjustified new abstractions
- [ ] Design tokens used for all visual values
- [ ] Environment tool used for all commands
- [ ] Delegation quality verified (no comprehension-critical tasks delegated)
```

### Project-specific configuration

- **Screen reader for testing:** `[CONFIGURE: e.g., NVDA, VoiceOver, JAWS, or "any available"]`
- **Environment tool:** `[CONFIGURE: e.g., Pixi, Nix, conda]`
- **Design token file:** `[CONFIGURE: e.g., src/styles/variables.css]`
- **AI disclosure label:** `[CONFIGURE: e.g., "ai-assisted" PR label, or inline note]`
