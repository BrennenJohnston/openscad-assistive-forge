# Releasing

How I do releases for this project.

## Before releasing

Run the checks:

```bash
npm run test:run && npm run test:e2e
npm run lint
npm run format:check
npm run build
```

Update `CHANGELOG.md` with what changed.

## Doing the release

`main` is what deploys to production, and `develop` is where the work lands, so
a release is a promotion of one to the other.

```bash
# On develop, with everything merged and green
git checkout develop
git pull

# Bump version in package.json
npm version X.Y.Z --no-git-tag-version

git add -A
git commit -m "chore: release vX.Y.Z"
git push origin develop
```

Then open a pull request from `develop` into `main` and let it go green. Both
branches are guarded by rulesets and both need an approving review; `main` also
requires signed commits and linear history. See
[`.github/BRANCH_PROTECTION.md`](../.github/BRANCH_PROTECTION.md) for the exact
required checks — **and read its warning before you try**, because `main`
currently requires a check name that no longer exists.

Once it is merged:

```bash
git checkout main
git pull
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

Then go to GitHub → Releases → Draft a new release, pick the tag, paste the CHANGELOG section.

## Service worker cache

The cache version is auto-generated at build time:
- CI builds: `commit-<sha>`
- Local builds: `build-<timestamp>`

Old caches get cleaned up automatically.

## If something breaks in production

```bash
# Hotfix branch from the last good tag
git checkout -b hotfix/X.Y.Z vX.Y.Z

# Fix it, test it
npm run test:all

# Merge back
git checkout develop
git merge hotfix/X.Y.Z
git tag -a vX.Y.Z -m "Hotfix vX.Y.Z"
git push origin develop vX.Y.Z
```

## Version scheme

Semver: MAJOR.MINOR.PATCH
- Major = breaking changes
- Minor = new features
- Patch = bug fixes

The service worker cache version is separate and managed automatically.
