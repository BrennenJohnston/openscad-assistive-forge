# Rollback Runbook

**Version**: 4.2.0  
**Last Updated**: 2026-02-02  
**Owner**: On-call maintainer

This runbook provides step-by-step procedures for rolling back OpenSCAD Assistive Forge in production.

---

## Quick Reference

| Scenario | Method | Time | Command/Action |
|----------|--------|------|----------------|
| Feature bug | Feature flag | ~3 min | Disable flag in code, push |
| Bad deployment | Cloudflare rollback | ~1 min | Dashboard → Rollback |
| Code regression | Git revert | ~5 min | `git revert`, push |
| Critical security | Emergency deploy | ~10 min | Hotfix branch, expedited deploy |

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
**Time**: ~3 minutes  
**Risk**: Low

### Steps

1. **Identify the flag**
   ```
   Feature flags are in: src/js/feature-flags.js
   
   Current flags:
   - expert_mode: Expert Mode editing
   - monaco_editor: Monaco vs textarea
   - memory_monitoring: Memory tracking
   - csp_reporting: CSP violation logging
   ```

2. **Edit the flag configuration**
   ```javascript
   // In src/js/feature-flags.js, find the flag and set:
   rollout: 0,        // Disable for all users
   killSwitch: true   // Emergency disable
   ```

3. **Commit and push**
   ```bash
   git add src/js/feature-flags.js
   git commit -m "fix: disable [flag_name] due to [issue]"
   git push origin main
   ```

4. **Monitor deployment**
   - Cloudflare Pages auto-deploys on push
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
**Time**: ~5 minutes  
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

3. **Revert the commit**
   ```bash
   git revert <commit-hash>
   # This creates a new commit that undoes the changes
   # Editor opens for commit message - keep default or add context
   ```

4. **Push the revert**
   ```bash
   git push origin main
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
**Time**: ~10-15 minutes  
**Risk**: Medium (expedited process)

### Steps

1. **Create hotfix branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/security-YYYY-MM-DD
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
   git checkout main
   git merge hotfix/security-YYYY-MM-DD
   git push origin main
   ```

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

## Rollback Drill Schedule

**Frequency**: Quarterly  
**Duration**: 30 minutes  
**Participants**: On-call maintainer

### Drill Procedure

1. Deploy intentional "test" change to preview environment
2. Execute Cloudflare rollback (Procedure 2)
3. Time the process
4. Document results
5. Review and update this runbook if needed

### Drill Log

| Date | Participant | Method Tested | Time | Issues |
|------|-------------|---------------|------|--------|
| [TBD] | [Name] | Cloudflare rollback | [Time] | [Notes] |

---

## Escalation

### When to Escalate

- Rollback procedure fails
- Issue persists after rollback
- Data loss suspected
- Security breach confirmed

### Escalation Contacts

| Role | Contact | When |
|------|---------|------|
| Project Lead | [TBD] | Any escalation |
| CEO | [TBD] | Critical security, data loss |
| Cloudflare Support | https://support.cloudflare.com | Platform issues |

---

## Post-Rollback Actions

After any production rollback:

1. **Immediate** (within 1 hour)
   - [ ] Verify production is stable
   - [ ] Notify stakeholders of resolution
   - [ ] Create incident tracking issue

2. **Same day**
   - [ ] Write incident summary
   - [ ] Identify root cause
   - [ ] Plan fix timeline

3. **Within 1 week**
   - [ ] Complete incident report
   - [ ] Implement fix
   - [ ] Add regression test
   - [ ] Update documentation if needed

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
