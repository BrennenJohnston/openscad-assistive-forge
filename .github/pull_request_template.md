## What changed

<!-- A sentence or two. Link the issue if there is one: Closes #123 -->

## How I checked it

<!-- What you ran or clicked. -->

- [ ] `npm run lint` and `npm run test:run` pass
- [ ] UI changes work by keyboard alone, show a focus ring, respect reduced motion, keep touch targets at 44 x 44 px or more, and read correctly in light, dark and high contrast
- [ ] Text that people read or hear (labels, alt text, messages, announcements) is listed above for review
- [ ] Example model changes pass `npm run validate:example public/examples/<folder>`, and every dimension read by touch has a documented range and an `assert()` for me to sign off (see `docs/guides/TILE_AUTHOR_GUIDE.md`)
- [ ] Protected files are untouched (`public/wasm/`, `public/liblouis/`, `public/libraries/`, `public/fonts/`, `vendor/`, `LICENSE`)
- [ ] AI tools helped with this change (say which parts)
