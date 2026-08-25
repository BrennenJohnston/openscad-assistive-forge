# Deliberately broken tile

This folder is a test fixture for `scripts/validate-example.mjs`. It is not a
design, nothing loads it, and nothing renders it.

It carries four faults on purpose, one for each thing the validator checks:

1. `manifest.json` has no `license`.
2. `plate_shape` has no comment above it, so the app would have nothing to
   label the control with.
3. `logo_file` defaults to `undeclared-logo.svg`, which is in this folder and
   is not listed in `manifest.json` under `files` - the exact shape of the
   defect where a first-party example shipped with a picture the app could not
   find.
4. `dot_height` is declared tactile in the manifest, has no documented range,
   and nothing asserts it.

Run it and watch every one of them fail:

```bash
node scripts/validate-example.mjs tests/fixtures/bad-example
```

A validator nobody has watched fail is a validator nobody should trust.

Everything here is original, written for this repository. `undeclared-logo.svg`
is a black square drawn by hand; no third-party artwork is in this folder.
