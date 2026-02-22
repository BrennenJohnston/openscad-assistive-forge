# Multi-Session Handoff Checklist

Run this checklist at the start of any AI session that continues work from a prior
session. It prevents the three most common multi-session failures: fabrication from
lossy context, premature completion marking, and scope escape.

For the full rationale, see
[SESSION_BOUNDARY_PROTOCOL.md](../docs/SESSION_BOUNDARY_PROTOCOL.md).

## Checks

| # | Check | Method | Blocking? |
| --- | --- | --- | --- |
| 1 | Plan file state verified | Read the plan file. Compare "completed" markers against actual artifact state. Flag any phase marked complete without verification evidence. | Yes |
| 2 | Source documents listed | List every source document needed for this session's work. | Yes |
| 3 | Re-read decisions documented | For each source document: state whether it was read in a prior session and must be re-read, or is only needed for mechanical reference. Prioritize re-reading documents processed in the middle of the prior session. | Yes |
| 4 | No premature completion | Confirm the plan's validation phase has not been marked complete before validation was actually executed. | Yes |
| 5 | Scope boundary confirmed | Confirm this session will not begin work outside the current plan until all plan validation passes. | Yes |
| 6 | Prior session artifacts reviewed | For any artifacts produced in prior sessions, confirm their verification status (verified, unverified, untrusted). | Warning |
| 7 | Fabrication self-check acknowledged | Confirm awareness: "I will not write derivatives from carried-over context without re-reading the source in this session." | Yes |

## Copy-paste checklist (for session start)

```markdown
### Multi-session handoff

- [ ] Plan file read — current phase status verified against actual artifacts
- [ ] Source documents needed for this session listed
- [ ] Re-read decisions made for each source (re-read vs. mechanical reference)
- [ ] Middle-of-prior-session documents prioritized for re-reading
- [ ] No plan phases prematurely marked complete
- [ ] Scope boundary confirmed — no new work until plan validation passes
- [ ] Prior session artifacts reviewed for verification status
- [ ] Fabrication self-check acknowledged
```

### Project-specific configuration

- **Plan file location:** `[CONFIGURE: e.g., .cursor/plans/, project root, or issue tracker]`
- **Source document root:** `[CONFIGURE: e.g., docs/, research/, or specific folder path]`
- **Session log format:** `[CONFIGURE: e.g., markdown in chat, separate log file, or project wiki]`
