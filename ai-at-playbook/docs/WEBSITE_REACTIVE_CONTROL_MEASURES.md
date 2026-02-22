# Website Reactive UI Control Measures

These are website-specific control measures that go beyond breakpoint rules. They
govern the risky interaction surfaces that showed up during real development --
the kind of things that look fine in a demo but break for real users.

## The 9 control measures

### 1. External link guardrail

Verify links resolve, announce behavior, and avoid silent failures or dead
interactions. A broken link on an AT resource page isn't just annoying -- it can
block someone from finding a service they need.

### 2. Link behavior disclosure

If a link opens a new tab/window or triggers a download, disclose this in visible
text or the accessible name. Screen reader users and keyboard users need to know
what a link will do before they activate it.

### 3. Tag interaction guardrail

Require keyboard + screen reader validation for tag add, edit, remove, and filter
flows. Tags are a common UI pattern for AT resource directories, and they're easy
to make inaccessible.

### 4. Language metadata guardrail

The app shell MUST have a correct `lang` attribute. Mixed-language content should be
tagged so screen readers use the right voice/pronunciation. See
`LANGUAGE_AND_I18N_GUARDRAILS.md` for the full requirements.

### 5. Cognitive funnel guardrail

Landing/first-run UI must provide context and progressive disclosure. Avoid the
"wall of controls" experience. Prefer a warm, guided entry into complex interactions.

From team discussion, the goal is to prevent the "big hand" experience -- where a
new user sees everything at once and doesn't know where to start.

### 6. Staging readiness gate

No major UX claims until a staging environment verifies mobile + desktop parity.
"It works on my laptop" is not a ship decision for an AT project.

### 7. Construction-underway disclosure

Incomplete features must be visibly and programmatically marked. Use disabled
controls + explanatory accessible text. See the "Construction Underway" pattern in
`AT_SCOPE_GUIDE.md`.

### 8. Deterministic accessibility policy

AI must not auto-complete accessibility-critical content without human verification.
Alt text, ARIA labels, heading structure, and landmark assignments all require human
sign-off.

### 9. ARIA-live restraint guardrail

Use live regions sparingly. Avoid continuous announcements that spam screen reader
users. Verify with at least one real screen reader before shipping changes to live
regions.

## Verification evidence

- Click-test recordings (10-15 min) are valid evidence for triage and regression checks
- UI changes must include before/after screenshots and mobile viewport verification
- Language check: screen reader uses correct language/voice for primary and
  mixed-language content (where applicable)

## Checklist version (for PR descriptions)

```markdown
### Website control measures check

- [ ] External links resolve and announce behavior
- [ ] Link behavior disclosed (new tab, download)
- [ ] Tag interactions work with keyboard + screen reader
- [ ] Language metadata: correct `lang` attribute on root
- [ ] Cognitive funnel: progressive disclosure for new users
- [ ] Staging readiness: mobile + desktop parity verified
- [ ] Construction-underway: incomplete features marked
- [ ] No auto-completed accessibility-critical content
- [ ] ARIA-live regions verified with a real screen reader
```

### Project-specific configuration

- **Staging environment URL:** `[CONFIGURE: e.g., staging.example.com]`
- **Primary language:** `[CONFIGURE: e.g., en]`
- **Screen reader used for testing:** `[CONFIGURE: e.g., NVDA, VoiceOver, JAWS]`
