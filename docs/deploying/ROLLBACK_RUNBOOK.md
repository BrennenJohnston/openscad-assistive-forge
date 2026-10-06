# Rollback Runbook

**App version**: 5.2.0  
**Last reviewed**: 2026-10-06

This runbook provides step-by-step procedures for rolling back OpenSCAD Assistive Forge in production.

---

## Quick Reference

| Scenario | Method | Time | Command/Action |
|----------|--------|------|----------------|
| Feature bug | Feature flag | ~15 min | Disable the flag on `develop`, move `main` forward |
| Bad deployment | Cloudflare rollback | ~1 min | Dashboard → Rollback |
| Code regression | Git revert | ~15 min | `git revert` on `develop`, move `main` forward |
| Critical security | Emergency deploy | ~20 min | Hotfix pull request on `develop`, move `main` forward |

Every code change reaches production the same way, rollbacks included: a
pull request into `develop`, the checks, a squash-merge, then `main` moved
forward to it. `main` accepts only a fast-forward of a commit that already
passed the checks on `develop`; it refuses any other push, so there is no
shortcut to skip. Procedure 2 needs no commit at all.

---

## Pre-Rollback Checklist

Before any rollback, complete this checklist:

- [ ] **Identify the issue** - What is broken? Who reported it?
- [ ] **Assess severity** - Is it critical, high, medium, or low?
- [ ] **Document evidence** - Screenshot errors, copy console logs
- [ ] **Identify rollback target** - Which deployment/commit was last known good?
- [ ] **Notify stakeholders** - Alert team if critical (can be async for low severity)

---

## Procedure 1: Feature Flag Disable (Fastest for Flagged Features)

**Use when**: A feature behind a feature flag is causing issues  
**Time**: ~15 minutes, most of it the checks  
**Risk**: Low

### Steps

1. **Identify the flag**
   ```
   Feature flags are in: src/js/feature-flags.js
   The file lists the current flags and what each one gates.
   ```

2. **Edit the flag configuration**
   ```javascript
   // In src/js/feature-flags.js, find the flag and set:
   rollout: 0,        // Disable for all users
   killSwitch: true   // Emergency disable
   ```

3. **Commit on a branch and open the pull request**
   ```bash
   git switch -c fix/disable-[flag_name] origin/develop
   git add src/js/feature-flags.js
   git commit -m "fix: disable [flag_name]"
   git push -u origin fix/disable-[flag_name]
   gh pr create --base develop --fill
   ```
   Squash-merge it when the checks pass.

4. **Move main forward and watch the deployment**
   ```bash
   git fetch origin
   git push origin origin/develop:main
   ```
   - Cloudflare Pages deploys `main` on push
   - Check deployment status in Cloudflare Dashboard
   - Verify fix in production (clear cache, test)

5. **Create follow-up issue**
   - Document the problem
   - Plan proper fix before re-enabling

---

## Procedure 2: Cloudflare Pages Rollback (Fastest for Any Issue)

**Use when**: Need immediate rollback to previous version  
**Time**: ~1 minute  
**Risk**: Very low

### Steps

1. **Access Cloudflare Dashboard**
   ```
   URL: https://dash.cloudflare.com
   Navigate to: Pages → openscad-assistive-forge → Deployments
   ```

2. **Find last known good deployment**
   - Deployments listed with timestamp and commit hash
   - Look for deployment before the problematic one
   - Verify the commit message/hash matches expected good state

3. **Execute rollback**
   - Click the "..." menu on the target deployment
   - Select "Rollback to this deployment"
   - Confirm the action

4. **Verify rollback**
   - Clear browser cache
   - Navigate to production URL
   - Verify the issue is resolved
   - Check version indicator if available

5. **Document the rollback**
   - Note the rolled-back deployment
   - Create incident report
   - Plan fix for the issue

---

## Procedure 3: Git Revert (For Code Issues)

**Use when**: A specific commit introduced a bug  
**Time**: ~15 minutes, most of it the checks  
**Risk**: Medium (creates new commit)

### Steps

1. **Identify the bad commit**
   ```bash
   git log --oneline -10
   # Find the commit hash that introduced the issue
   ```

2. **Verify the commit**
   ```bash
   git show <commit-hash>
   # Confirm this is the problematic change
   ```

3. **Revert the commit on a branch**
   ```bash
   git switch -c fix/revert-<short-name> origin/develop
   git revert <commit-hash>
   git push -u origin fix/revert-<short-name>
   gh pr create --base develop --fill
   ```
   The pull request title becomes the public commit: plain words, no
   account of how the bug was found. Squash-merge when the checks pass.

4. **Move main forward**
   ```bash
   git fetch origin
   git push origin origin/develop:main
   ```

5. **Monitor deployment**
   - Wait for Cloudflare Pages to deploy
   - Verify the fix in production
   - Clear cache if needed

6. **Follow up**
   - Create issue explaining why revert was needed
   - Plan proper fix
   - Re-apply change after fix is ready

---

## Procedure 4: Emergency Security Deployment

**Use when**: Critical security vulnerability discovered  
**Time**: ~20 minutes, most of it the checks  
**Risk**: Medium (expedited process)

### Steps

1. **Create hotfix branch**
   ```bash
   git fetch origin
   git switch -c hotfix/security-YYYY-MM-DD origin/develop
   ```

2. **Apply minimal fix**
   - Make ONLY the security fix
   - No other changes
   - Add test if possible

3. **Expedited review**
   - If available, get quick review from another maintainer
   - If alone, self-review carefully
   - Document decision in commit message

4. **Deploy**
   ```bash
   git push -u origin hotfix/security-YYYY-MM-DD
   gh pr create --base develop --fill
   # squash-merge when the checks pass, then
   git fetch origin
   git push origin origin/develop:main
   ```
   The checks are not skipped for a security fix: `main` refuses anything
   that has not passed them on `develop`.

5. **Verify deployment**
   - Check Cloudflare deployment status
   - Verify fix in production
   - Monitor for side effects

6. **Post-incident**
   - Create detailed incident report
   - Determine if disclosure needed
   - Update security documentation if needed

---

## Verification Checklist

After any rollback, verify:

- [ ] **Core workflow works**: Load file → Edit parameters → Preview → Export
- [ ] **No console errors**: Check browser developer tools
- [ ] **Accessibility intact**: Tab navigation, screen reader basics
- [ ] **Memory monitor working**: If applicable to the rollback
- [ ] **Expert Mode**: If applicable, verify mode switching works

### Quick Smoke Test Script

```
1. Open application in new incognito window
2. Click "Load Example" → Select any example
3. Change one parameter value
4. Click "Preview" → Wait for render
5. Press Ctrl+E → Verify Expert Mode (if enabled)
6. Press Ctrl+E → Return to Standard Mode
7. Click "Export STL" → Verify download starts
```

---

## Post-Rollback Actions

After any production rollback:

1. **Immediate**: Verify production is stable, create a tracking issue
2. **Same day**: Write a short incident summary, identify root cause
3. **Within a week**: Implement the fix, add a regression test if applicable

---

## Incident Report Template

```markdown
# Incident Report: [Brief Title]

**Date**: YYYY-MM-DD
**Duration**: HH:MM - HH:MM (X minutes)
**Severity**: Critical / High / Medium / Low
**Rolled back**: Yes / No

## Summary
[One paragraph describing what happened]

## Timeline
- HH:MM - Issue reported by [source]
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Rollback executed
- HH:MM - Verified resolved

## Root Cause
[Technical explanation]

## Impact
- Users affected: [estimate]
- Features impacted: [list]
- Data loss: Yes / No

## Resolution
[What was done to fix]

## Prevention
[What will prevent recurrence]

## Lessons Learned
[What we learned]
```
