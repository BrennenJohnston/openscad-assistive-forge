# Releasing

How I do releases for this project.

`develop` is where the work lands. `main` is the released version, and the
live site is built from it. A release moves `main` forward to a commit on
`develop` that has already passed its checks, and tags it. There is no release
pull request and nothing to merge back.

## Before releasing

1. Everything for the release is merged into `develop`.
2. One last pull request sets the version and closes the changelog:

   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```

   In `CHANGELOG.md`, rename "Unreleased" to the version and the date, and trim
   the section to about 40 lines.
3. Wait for the checks to pass on `develop` after that pull request merges.
   A pull request runs the Test Suite workflow. Every merge into `develop`
   also starts the Release Checks workflow (Edge, Firefox, Safari, the
   visual comparison and the Lighthouse audit), which takes about 40
   minutes; `main` requires its Edge and Lighthouse checks as well.
4. Walk the release candidate's preview by hand, with NVDA running ("Walking
   a release candidate" in `docs/developing/TESTING.md`). Anything wrong is
   fixed before the release.

### Braille tools

Before any release that changes how braille is translated (the liblouis
engine or its tables, `src/js/liblouis-engine.js`,
`src/worker/liblouis-worker.js`, any `src/js/braille-*.js` file, or the
braille sign, card and charm models), the whole braille suite must be
present and pass, on all three tools:

- the "Build liblouis wasm" workflow, whose check compares the built
  engine with native liblouis on every test phrase in both tables;
- `tests/unit/braille-parity.test.js` and the other braille unit tests;
- `tests/e2e/braille-card.spec.js`, and
  `tests/e2e-prod/liblouis-wasm-csp.spec.js` on a build;
- each braille model's OpenSCAD check, with its range checks in place;
- on the release's preview, `ROOM ROOM ROOM ROOM`, `See3D`, both phone
  number forms, the card and the charm, each as native liblouis writes it;
- a screen reader check (NVDA) when an announcement or a control's name
  changed.

I write the results into the version pull request. A check that cannot run
holds the release until it has run.

## Doing the release

```bash
git fetch origin

# Move main forward to develop.
git push origin origin/develop:main

# Tag it and publish.
git tag -a vX.Y.Z origin/develop -m "Release X.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z: a few words" --notes-file notes.md
```

The release text is the changelog section for the version.

If the push to `main` is refused, the checks on that `develop` commit have not
all passed yet. Wait for them, or re-run the one that failed.

A change that does not alter the app (documentation, comments) goes to `main`
the same way, with no new version number and no tag. Its merge started the
Release Checks, so wait for them as for a release. A run started by hand
(`gh workflow run release-checks.yml --ref develop`) does not count toward
`main`'s required checks: GitHub only counts the run a push started.

## Service worker cache

The cache version is auto-generated at build time:
- CI builds: `commit-<sha>`
- Local builds: `build-<timestamp>`

Old caches get cleaned up automatically.

## If something breaks in production

The fastest way back to a working site is a Cloudflare Pages rollback, which
changes no code. The steps are in the
[Rollback Runbook](../deploying/ROLLBACK_RUNBOOK.md).

Then fix it the ordinary way: a pull request into `develop`, the checks, and a
patch release.

## Version scheme

Semver: MAJOR.MINOR.PATCH
- Major = breaking changes
- Minor = new features
- Patch = bug fixes
