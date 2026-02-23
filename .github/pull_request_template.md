# Pull request

## What changed

<!-- A couple sentences is fine. Reference the issue if applicable: Closes #123 -->

## How to test

<!-- What should a reviewer click/run? -->

## Verification checklist

### Tier 1 — Automated (must pass)

- [ ] `npm run lint` passes
- [ ] `npm run format` passes
- [ ] `npm run test:run` passes
- [ ] `npm run test:e2e` passes
- [ ] No hallucinated imports (all imports resolve)
- [ ] Protected files untouched (`public/wasm/`, `public/sw.js`, etc.)

### Tier 2 — Accessibility (if UI changed)

- [ ] Keyboard-only navigation works
- [ ] Screen reader announces correctly (if applicable)
- [ ] Light / dark / high-contrast pass
- [ ] `prefers-reduced-motion` respected (if animations present)
- [ ] Touch targets >= 44x44px

### Tier 3 — Process

- [ ] PR is small (one feature or fix)
- [ ] CHANGELOG updated (if user-facing)

## AI disclosure (if applicable)

- [ ] AI was used in this PR
- Scope: <!-- which parts were AI-generated? -->
