# Security Operations Baseline

Minimum security operations for AI-assisted open source projects. These are the
basics -- not a full security program, but the floor below which you shouldn't go.

**Source:** Open Source Guides security recommendations, Project CodeGuard
(CoSAI, 2025).

## Security operations minimum

1. **Enforce MFA** for privileged contributors (anyone with write/admin access)
2. **Enable protected branches** and required checks on your default branch
3. **Enable secret scanning** and dependency update automation (Dependabot, Renovate,
   or equivalent)
4. **Enable SAST/code scanning in CI** (e.g., CodeQL or Semgrep) with review-friendly
   false-positive handling
5. **Publish `SECURITY.md`** with a private vulnerability reporting flow (see
   `templates/SECURITY.md`)
6. **Maintain a lightweight threat model document** -- doesn't need to be formal; a
   one-page "what could go wrong and what do we do about it" is enough
7. **Maintain an incident response runbook** with roles and communication steps

## AI-specific security considerations

AI-assisted development adds security surface area:

- AI tools may suggest dependencies with known vulnerabilities -- always run
  `npm audit` / `pip audit` / `cargo audit` after adding dependencies
- AI-generated code may introduce secrets or credentials in comments or string
  literals -- secret scanning catches some of this, but manual review catches more
- AI may weaken security headers or CSP directives while "fixing" other issues --
  protect security-critical files in your file protection registry
- AI tools themselves may transmit code to external services -- review your AI
  tool's data handling policy

## Checklist (for periodic review)

- [ ] MFA enforced for all privileged contributors
- [ ] Protected branches enabled with required checks
- [ ] Secret scanning enabled
- [ ] Dependency update automation enabled
- [ ] SAST/code scanning in CI
- [ ] `SECURITY.md` published and up to date
- [ ] Threat model document exists
- [ ] Incident response runbook exists

### Project-specific configuration

- **Protected branches:** `[CONFIGURE: e.g., main, develop]`
- **Required CI checks:** `[CONFIGURE: e.g., lint, test, build, security scan]`
- **SAST tool:** `[CONFIGURE: e.g., CodeQL, Semgrep, or "none yet"]`
- **Vulnerability reporting email:** `[CONFIGURE: private contact for security reports]`
