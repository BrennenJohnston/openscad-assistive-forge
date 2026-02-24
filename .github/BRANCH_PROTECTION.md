# Branch Protection Configuration

This document outlines the recommended branch protection rules for the repository. These should be configured in **GitHub Settings > Branches > Branch protection rules**.

## Protected Branches

### `main` Branch (Production)

**Purpose**: Production-ready code, stable releases only

#### Settings

**Branch protection rules:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners (if CODEOWNERS file exists)
  
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks:**
    - `test` - Unit tests
    - `test-e2e` - End-to-end tests
    - `lint` - ESLint checks
    - `build` - Build verification
    - `lighthouse-ci` - Accessibility checks (if configured)

- ✅ Require conversation resolution before merging

- ✅ Require linear history (optional, helps keep history clean)

- ✅ Do not allow bypassing the above settings

- ✅ Restrict who can push to matching branches
  - Add: Repository maintainers/owners only

- ❌ Allow force pushes: **Disabled**

- ❌ Allow deletions: **Disabled**

**Additional Protections:**
- ✅ Require signed commits (recommended for security)
- ✅ Include administrators (enforce rules for everyone)

---

### `develop` Branch (Integration)

**Purpose**: Active development, integration of features

#### Settings

**Branch protection rules:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: **1** (can be same as main or fewer for faster dev)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks:**
    - `test` - Unit tests
    - `lint` - ESLint checks
    - `build` - Build verification
    - E2E tests (optional for develop, required for main)

- ✅ Require conversation resolution before merging

- ⚠️ Allow force pushes: **Only for administrators** (for history cleanup if needed)
  - Set to "Specify who can force push"
  - Add: Repository administrators only

- ❌ Allow deletions: **Disabled**

**Additional Protections:**
- ✅ Include administrators (recommended)

---

## Setting Up Branch Protection

### Via GitHub Web UI

1. Go to your repository on GitHub
2. Click **Settings** (⚙️) tab
3. Click **Branches** in the left sidebar
4. Click **Add branch protection rule**
5. Enter branch name pattern: `main`
6. Configure settings as listed above
7. Click **Create**
8. Repeat for `develop` branch

### Via GitHub CLI

```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Authenticate
gh auth login

# Add protection rule for main
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","lint","build"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

# Add protection rule for develop
gh api repos/:owner/:repo/branches/develop/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","lint","build"]}' \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

## Verification

After setting up, verify by:

1. Attempting to push directly to `main` (should be blocked)
2. Creating a PR without required checks passing (should be blocked)
3. Creating a PR with failing tests (should be blocked)
4. Creating a proper PR with all checks passing (should be allowed)

## Rulesets (Modern Alternative)

GitHub now offers **Rulesets** as an alternative to classic branch protection rules. Rulesets provide more flexibility and can target multiple branches.

### To use Rulesets instead:

1. Go to **Settings > Rules > Rulesets**
2. Click **New ruleset**
3. Select **Branch ruleset**
4. Configure targeting (e.g., `main`, `develop`)
5. Add rules (status checks, PR requirements, etc.)
6. Save ruleset

Benefits of Rulesets:
- Target multiple branches with one rule
- More granular permissions
- Bypass lists for emergency situations
- Better organization for complex repositories

## Bypassing Protection (Emergency Only)

If you need to bypass protection in an emergency:

1. **Preferred**: Use the "Bypass list" feature in Rulesets
2. **Temporarily disable protection** (not recommended):
   - Settings > Branches > Edit rule
   - Uncheck relevant options
   - **Re-enable immediately after**

## CI/CD Integration

Ensure your CI workflow (`.github/workflows/*.yml`) includes:

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:run

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
```

## Auto-merge Configuration (Optional)

For dependabot or trusted automated PRs:

1. Enable auto-merge in Settings
2. Configure conditions in branch protection
3. Require specific labels (e.g., `dependencies`, `automated`)

## Troubleshooting

**"Cannot push to protected branch"**
- Expected behavior. Create a PR instead.

**"Required status check missing"**
- Ensure CI workflow runs on PRs
- Check workflow file triggers include `pull_request`
- Verify job names match required checks

**"Required review not satisfied"**
- Request review from a team member
- Check if review was dismissed due to new commits

**"Branch is not up to date"**
- Pull latest changes from base branch
- Merge or rebase base into your branch

## Resources

- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Rulesets Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Status Checks Documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
