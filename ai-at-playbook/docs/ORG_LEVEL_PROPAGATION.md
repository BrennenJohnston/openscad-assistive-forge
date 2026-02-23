# Organization-Level Propagation

If your GitHub organization has multiple AT-related repos, you can propagate the
playbook's rules to all of them automatically using GitHub's `.github` repo feature.

## How it works

GitHub organizations can have a special repo named `.github`. Files placed in
specific paths within that repo are inherited by all new repos in the organization.
This means you set up your issue templates, PR templates, and Copilot instructions
once, and every new repo gets them automatically.

## Setup steps

1. **Create a `.github` repo** in your organization (if it doesn't already exist)

2. **Copy the playbook templates** into the `.github` repo:

```bash
# From the playbook repo:
cp templates/.github/copilot-instructions.md .github/
cp -r templates/.github/ISSUE_TEMPLATE/ .github/ISSUE_TEMPLATE/
cp templates/.github/PULL_REQUEST_TEMPLATE.md .github/
```

3. **Fill in `[CONFIGURE: ...]` placeholders** with organization-wide defaults

4. **All new repos** in the org now inherit these files automatically

5. **Existing repos** can either:
   - Copy the files manually from the `.github` repo
   - Symlink to the `.github` repo (if your workflow supports it)
   - Override with repo-specific versions when needed

## What propagates

| File | Propagates? | Notes |
| --- | --- | --- |
| `.github/copilot-instructions.md` | Yes | Copilot reads org-level instructions |
| `.github/ISSUE_TEMPLATE/*.md` | Yes | Issue templates show up in all repos |
| `.github/PULL_REQUEST_TEMPLATE.md` | Yes | PR template shows up in all repos |
| `AGENTS.md` | No | Must be copied to each repo root |
| `CLAUDE.md` | No | Must be copied to each repo root |
| `.cursor/rules/*.mdc` | No | Must be copied to each repo's `.cursor/` |

## What doesn't propagate

- `AGENTS.md` and `CLAUDE.md` must live in each repo's root to be read by their
  respective tools
- Cursor rule files (`.mdc`) must be in each repo's `.cursor/rules/` directory
- These files should be copied manually or via a setup script when a new repo is
  created

## Keeping rules in sync

When you update the playbook:

1. Update the `.github` repo (for propagated files)
2. Run a script or manually update `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/`
   in each repo

A simple sync script:

```bash
# Sync non-propagated files to all repos
for repo in [CONFIGURE: list of repo directories]; do
  cp ai-at-playbook/AGENTS.md "$repo/AGENTS.md"
  cp ai-at-playbook/CLAUDE.md "$repo/CLAUDE.md"
  cp ai-at-playbook/templates/.cursor/rules/golden-rules.mdc "$repo/.cursor/rules/golden-rules.mdc"
done
```

### Project-specific configuration

- **Organization name:** `[CONFIGURE: GitHub org name]`
- **`.github` repo URL:** `[CONFIGURE: e.g., https://github.com/your-org/.github]`
- **Repos to sync:** `[CONFIGURE: list of repos that should receive playbook rules]`
