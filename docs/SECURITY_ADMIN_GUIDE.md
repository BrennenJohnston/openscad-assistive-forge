# Security Administration Guide

This guide covers security features, configuration, and best practices for administrators deploying OpenSCAD Assistive Forge.

## Security Architecture

### Overview

OpenSCAD Assistive Forge is a client-side web application with no backend services:

- All processing happens in the browser
- No user data is transmitted to servers
- No authentication or user accounts
- No database or server-side storage

This architecture significantly reduces attack surface but still requires security controls for content delivery and client-side protection.

### Data Flow

```
User's Browser
    │
    ├─► Static Assets (HTML, JS, CSS)  ─► CDN (Cloudflare Pages)
    │
    ├─► OpenSCAD WASM (Local execution)
    │
    ├─► User Files (Local only)
    │
    └─► localStorage (Browser-only persistence)
```

No user data leaves the browser except for explicit file downloads.

---

## Content Security Policy (CSP)

### Current Policy

The application uses a strict Content Security Policy to prevent XSS and injection attacks:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none'
```

### Directive Explanations

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `script-src 'wasm-unsafe-eval'` | Required | OpenSCAD WASM needs to compile code at runtime |
| `script-src https://cdn.jsdelivr.net` | Required | Monaco Editor loads from CDN |
| `worker-src blob:` | Required | Monaco Editor workers use blob URLs |
| `style-src 'unsafe-inline'` | Required | Monaco Editor requires inline styles |
| `frame-ancestors 'none'` | Security | Prevents clickjacking via framing |

### CSP Reporting

CSP violations are logged to the browser console. For production monitoring, configure a report endpoint:

```http
Content-Security-Policy-Report-Only: ...; report-uri /csp-report
```

### Modifying CSP

If you need to modify the CSP for your deployment:

1. Edit `public/_headers` for Cloudflare Pages
2. Or configure headers in your CDN/proxy
3. Test all functionality after changes
4. Monitor for violations before enforcement

---

## Security Headers

### Required Headers

The application should be served with these security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Legacy clickjacking prevention |
| `X-XSS-Protection` | `0` | Disable legacy XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disable unused APIs |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolate browsing context |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Enable SharedArrayBuffer |

### Cloudflare Pages Configuration

Headers are configured in `public/_headers`:

```
/*
  Content-Security-Policy: [policy]
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

### Verifying Headers

Test your deployment's security headers:

1. Use [securityheaders.com](https://securityheaders.com)
2. Target: Grade A or better
3. Check browser DevTools → Network → Response Headers

---

## WASM Security

### Sandboxing

The OpenSCAD WASM module runs in the browser's WASM sandbox:

- No direct file system access
- No network access from WASM
- Memory isolated from JavaScript heap
- Cannot execute arbitrary system calls

### WASM Artifact Integrity

Verify WASM artifacts haven't been tampered with:

```bash
# Check hashes against known-good values
sha256sum public/wasm/openscad-official/openscad.wasm
sha256sum public/wasm/openscad-official/openscad.js
```

Store expected hashes in your deployment documentation.

### WASM Memory Limits

The application monitors WASM memory usage:

- Warning at 400 MB
- High alert at 800 MB
- Critical at 1200 MB (auto-preview disabled)

These limits prevent runaway memory consumption from affecting the browser.

---

## Supply Chain Security

### Dependencies

The application uses npm for JavaScript dependencies:

```bash
# Audit for vulnerabilities
npm audit

# Generate Software Bill of Materials
npm run sbom
```

### Automated Checks

CI pipeline enforces:

1. `npm audit` passes (no high/critical vulnerabilities)
2. Lockfile integrity (`npm ci` validates)
3. SBOM generated with each release

### Updating Dependencies

Process for security updates:

1. Run `npm audit` to identify vulnerabilities
2. Update affected packages: `npm update [package]`
3. Run full test suite
4. Deploy to preview environment
5. Monitor for issues
6. Promote to production

### SBOM Location

Software Bill of Materials is generated at:
- `docs/planning/sbom.json` (CycloneDX format)
- Included in release artifacts

---

## Incident Response

### Severity Levels

| Severity | Definition | Response Time |
|----------|------------|---------------|
| **Critical** | Active exploitation, data breach | 4 hours |
| **High** | Exploitable vulnerability, major feature broken | 24 hours |
| **Medium** | Limited impact vulnerability | 72 hours |
| **Low** | Minor issue, hardening opportunity | 1 week |

### Response Process

1. **Triage**: Assess severity and impact
2. **Contain**: Disable affected feature via feature flag if possible
3. **Fix**: Develop and test patch
4. **Deploy**: Push fix to production
5. **Notify**: Update stakeholders
6. **Document**: Post-incident review

### Security Contact

Report security vulnerabilities via:
- GitHub Security Advisories (private disclosure)
- Email to project maintainer (see SECURITY.md)

Do not create public issues for security vulnerabilities.

---

## Privacy Considerations

### Data Collection

By default, the application collects **no user data**:

- No analytics
- No tracking pixels
- No external requests to third parties
- No cookies (except browser-standard functionality)

### Local Storage

The application uses browser localStorage for:

- Parameter presets
- User preferences (theme, editor choice)
- Feature flag states

This data never leaves the user's browser.

### Network Requests

The application makes network requests only to:

1. The hosting origin (static assets)
2. cdn.jsdelivr.net (Monaco Editor - if Expert Mode enabled)

No user content is transmitted.

### GDPR/CCPA Compliance

Because no personal data is collected or processed:

- No consent banners required
- No data deletion obligations
- No data portability requirements

Document this in your privacy policy.

---

## Deployment Security

### HTTPS Enforcement

Always serve over HTTPS:

- Configure HSTS header (included by default)
- Redirect HTTP to HTTPS at CDN level
- Use valid TLS certificate (Cloudflare provides automatic)

### Access Controls

For private deployments, consider:

1. **Cloudflare Access**: Add authentication layer
2. **IP Allowlisting**: Restrict to specific networks
3. **VPN Requirement**: Deploy behind corporate VPN

The application itself has no authentication—use infrastructure controls.

### Environment Isolation

Recommended environments:

| Environment | Purpose | Access |
|-------------|---------|--------|
| Production | Live users | Public |
| Preview | Pre-release testing | Team only |
| Development | Active development | Developers only |

Cloudflare Pages provides automatic preview deployments for branches.

---

## Monitoring

### What to Monitor

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| CSP violations | > 10/hour | Investigate source |
| Error rate | > 5% | Check for regressions |
| Page load time | > 5s P95 | Performance investigation |
| Availability | < 99.9% | Check infrastructure |

### Log Collection

Browser errors and CSP violations can be collected via:

1. Cloudflare Analytics (automatic)
2. Custom error handler (if implemented)
3. CSP report endpoint (if configured)

### Health Checks

Monitor the application health:

```bash
# Basic availability check
curl -I https://your-domain.com/

# Check specific assets
curl -I https://your-domain.com/wasm/openscad.wasm
```

---

## Compliance

### Section 508

The application includes a VPAT documenting accessibility conformance:
- Location: `docs/vpat/VPAT-2.5-WCAG.md`
- Covers: WCAG 2.2 Level AA criteria

### FedRAMP Considerations

For U.S. government deployment:

- Static site hosting may qualify for FedRAMP Tailored
- No server-side components = reduced control requirements
- Focus on client-side security and hosting platform controls

Consult with your compliance team for specific requirements.

### SOC 2 Considerations

The application itself has minimal SOC 2 scope:

- No data processing
- No authentication
- No audit logging

SOC 2 controls primarily apply to the hosting platform (e.g., Cloudflare).

---

## Security Checklist

### Pre-Deployment

- [ ] Security headers configured and verified
- [ ] CSP tested with all functionality
- [ ] npm audit shows no critical/high vulnerabilities
- [ ] WASM artifact hashes documented
- [ ] SBOM generated and stored

### Post-Deployment

- [ ] Security headers scan passes (securityheaders.com)
- [ ] HTTPS enforced and verified
- [ ] CSP report monitoring active (if configured)
- [ ] Error monitoring active
- [ ] Incident response contacts documented

### Periodic Review

- [ ] Weekly: npm audit check
- [ ] Monthly: Dependency updates
- [ ] Quarterly: Full security review
- [ ] Annually: Penetration test (if required)

---

## Further Reading

- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [WebAssembly Security (WebAssembly.org)](https://webassembly.org/docs/security/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
