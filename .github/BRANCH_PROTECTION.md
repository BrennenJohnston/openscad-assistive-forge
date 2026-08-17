# Branch protection

This describes how `main` and `develop` are actually protected, read from the
GitHub API on **2026-08-16**. It is a record of the configuration, not a list of
suggestions.

Both branches are guarded by **rulesets**, not by classic branch protection.
That distinction matters when you go looking: the old
`/repos/:owner/:repo/branches/:branch/protection` endpoint returns
**`404 Branch not protected`** for both, which reads like "unprotected" and is
not.

## `develop` — ruleset 12059827

Active, targeting `refs/heads/develop`.

| Rule | Setting |
|---|---|
| Pull request required | 1 approving review |
| | Stale approvals dismissed on push |
| | Review threads must be resolved |
| | Merge, squash and rebase all allowed |
| Deletion | blocked |
| Force push (non-fast-forward) | blocked |
| Bypass | Repository role, always |

Seven required status checks:

- `E2E Tests (Chromium)`
- `E2E Tests (Edge 1/2)`
- `E2E Tests (Edge 2/2)`
- `Unit Tests`
- `Lint Markdown`
- `Build Check`
- `Cloudflare Pages`

## `main` — ruleset 12059665

Active, targeting the default branch. Stricter than `develop`: it also requires
**signed commits**, **linear history**, and blocks branch **creation** and
direct **updates**.

Eight required status checks:

- `E2E Tests (Chromium)`
- `E2E Tests (Edge 1/2)`
- `E2E Tests (Edge 2/2)`
- `Unit Tests`
- `Lint Markdown`
- `Build Check`
- `Lighthouse Performance Audit`
- `Cloudflare Pages`

All eight were verified against the jobs that actually report, on 2026-08-16.

> ### Repaired 2026-08-16 — worth knowing why
>
> Until that date this ruleset required a context named `E2E Tests (Edge)`.
> Nothing had produced that name since the Edge lane was split into two shards;
> the `develop` ruleset was updated at the time and this one was missed.
>
> **A required check that never reports does not fail — it stays pending.** So
> the symptom was not a red board. It was a pull request into `main` that sat
> "waiting for status to be reported" indefinitely, with nothing saying why.
> That is a worse failure than a red check, because there is nothing to click.
>
> Two API details, kept because they cost an afternoon the first time:
>
> - The ruleset update endpoint is **`PUT`, not `PATCH`**. A `PATCH` to that
>   path matches no route and returns a bare `404`, which reads exactly like a
>   permissions problem and is not one.
> - **`PUT` replaces the ruleset.** Name, target, enforcement, conditions,
>   bypass actors and *every* rule must be sent back or they are silently lost.
>   `main` carries four rules `develop` does not — `required_signatures`,
>   `required_linear_history`, `update` and `creation` — plus
>   `strict_required_status_checks_policy: true`. Read the ruleset, modify the
>   one field, send the whole thing back, then read it again and compare.

## Where the check names come from

A required status check matches the `name:` of a workflow job, not its id. The
jobs live in `.github/workflows/`:

| Workflow | Job name it reports as |
|---|---|
| `test.yml` | `Unit Tests`, `Build Check`, `Lint Markdown`, `Security Checks`, `WASM Smoke (blocking, no skips)`, `Geometry Parity (golden, blocking)`, `Visual Regression (Linux)`, `E2E Tests (Chromium)`, `E2E Tests (Chromium 1/2)`, `E2E Tests (Chromium 2/2)`, `E2E Tests (Edge 1/2)`, `E2E Tests (Edge 2/2)`, `E2E Tests (Firefox)`, `E2E Tests (Safari/WebKit)`, `E2E Tests (Production CSP)` |
| `lighthouse.yml` | `Lighthouse Performance Audit` |
| Cloudflare Pages | `Cloudflare Pages` (external integration) |

Note that several jobs whose names say "blocking" are **not** in either ruleset's
required list. The word describes what the job does to itself, not to a merge.

`E2E Tests (Chromium)` is a small aggregate job that succeeds only if both
Chromium shards passed. It exists so the lane could be split without changing
the required check name. It carries `if: always()` deliberately — without that,
a failed shard would cause the aggregate to be **skipped**, and a skipped
required check leaves a merge waiting rather than refusing it.

## Renaming a job

Because the check name is the job name, renaming a job silently breaks any
ruleset that requires the old name — which is what happened to `main` above. If
you rename one:

1. Change the job's `name:` in the workflow.
2. Push the branch and let the new check report once, so GitHub knows the name.
3. Update every ruleset that required the old name.
4. Read the ruleset back afterwards and confirm nothing else was dropped.

## Reading the configuration yourself

```bash
gh api repos/:owner/:repo/rulesets
gh api repos/:owner/:repo/rulesets/12059827
gh api repos/:owner/:repo/rulesets/12059665
```

## Resources

- [GitHub Rulesets docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Status checks docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
