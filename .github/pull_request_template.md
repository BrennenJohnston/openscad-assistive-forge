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

### Tier 4 — If you added or changed a tile (`public/examples/`)

- [ ] `node scripts/validate-example.mjs public/examples/<folder>` passes
- [ ] The design renders in the app, and the render gate passes:
      `npx playwright test tests/e2e/wasm-smoke.spec.js --project=chromium`
- [ ] `license` is filled in, and `inspired_by` names whoever the design came
      from (if it came from somebody)
- [ ] Every file the design reads is listed in `manifest.json` under `files`
- [ ] Anything read by touch is named in `tactile`, has a documented range and
      an `assert()`, and **the ranges are flagged below for the maintainer to
      sign off** - they are never merged unreviewed
- [ ] Text a person will read (the tile's name, description, and control
      labels) is flagged below for the maintainer to review

<!-- Walkthrough: docs/guides/TILE_AUTHOR_GUIDE.md -->

### Tier 3 — Process

- [ ] PR is small (one feature or fix)
- [ ] CHANGELOG updated (if user-facing)

## AI disclosure (if applicable)

- [ ] AI was used in this PR
- Scope: <!-- which parts were AI-generated? -->
