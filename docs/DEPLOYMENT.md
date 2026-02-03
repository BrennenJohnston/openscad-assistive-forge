# Deployment Guide

This guide covers deploying OpenSCAD Assistive Forge to various hosting platforms and setting up operational monitoring.

## Overview

OpenSCAD Assistive Forge is a static Vite site with special requirements:

- **Cross-Origin Isolation**: Required for SharedArrayBuffer (WASM threading)
- **Security Headers**: CSP, HSTS, and other protective headers
- **Large Assets**: ~15-30 MB WASM files need proper caching

---

## Quick Start (Cloudflare Pages)

### 1. Build

```bash
npm install
npm run build
```

Output is in `dist/`.

### 2. Configure Cloudflare Pages

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18 or 20 |

### 3. Deploy

Push to your connected Git repository. Cloudflare Pages builds automatically.

---

## Required Headers

These headers are configured in `public/_headers` and copied to `dist/` during build.

### Cross-Origin Isolation (Required)

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
```

**Why needed:** OpenSCAD WASM uses SharedArrayBuffer for performance. Without these headers, `window.crossOriginIsolated` is `false` and WASM fails.

### Security Headers (Recommended)

> **Note:** The values below are **recommended** for production. The actual deployed configuration in `public/_headers` may differ—for example, CSP may be in report-only mode during burn-in. Always check `public/_headers` for current values.

**Recommended (fully enforced):**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

**Current deployed (`public/_headers`):**

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; ...
```

The CSP is intentionally in **Report-Only mode** during the burn-in period to identify violations without breaking functionality. `X-Frame-Options: SAMEORIGIN` allows same-origin iframe embedding (vs `DENY` which blocks all). See `public/_headers` comments for phased rollout plan.

### SPA Routing

`public/_redirects`:

```
/*    /index.html   200
```

Ensures client-side routing works on page refresh.

---

## Alternative Hosting Platforms

### Netlify

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Resource-Policy = "cross-origin"
```

### Vercel

Create `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Resource-Policy", "value": "cross-origin" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/((?!assets).*)", "destination": "/index.html" }
  ]
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    root /var/www/openscad-forge/dist;
    index index.html;

    # Cross-Origin Isolation
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache WASM files
    location ~* \.wasm$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Apache

`.htaccess`:

```apache
<IfModule mod_headers.c>
    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "require-corp"
    Header set Cross-Origin-Resource-Policy "cross-origin"
    Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "DENY"
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

---

## Deployment Verification

### Essential Checks

After deploying, verify:

1. **Cross-Origin Isolation**
   ```javascript
   // In browser console
   window.crossOriginIsolated // should be true
   ```

2. **WASM Loading**
   - Load an example model
   - Adjust a parameter
   - Verify preview updates

3. **Export Functionality**
   - Generate STL
   - Download completes successfully

4. **Security Headers**
   - Visit [securityheaders.com](https://securityheaders.com)
   - Enter your URL
   - Target: Grade A or better

### Automated Health Check

```bash
# Check cross-origin headers
curl -I https://your-domain.com/ | grep -i "cross-origin"

# Check WASM is accessible
curl -I https://your-domain.com/wasm/openscad-official/openscad.wasm

# Check redirect works
curl -I https://your-domain.com/some-path
```

---

## Caching Strategy

### Recommended Cache Headers

| Asset Type | Cache Duration | Notes |
|------------|----------------|-------|
| HTML | no-cache | Always fetch fresh |
| JS/CSS (hashed) | 1 year | Immutable with hash |
| WASM | 1 year | Large, rarely changes |
| Fonts | 1 year | Immutable |
| Images | 1 week | May update |

Cloudflare Pages handles this automatically. For other platforms, configure explicitly.

---

## Environment Configuration

### Environment Variables

None required. The application is entirely client-side.

### Feature Flags

Control features via URL parameters in development:

```
https://your-domain.com/?flag_expert_mode=true
https://your-domain.com/?flag_monaco_editor=false
```

For production rollouts, use the feature flag system's percentage-based rollout.

---

## Monitoring and Operations

### Health Monitoring

Set up monitoring for:

| Check | Frequency | Alert Threshold |
|-------|-----------|-----------------|
| Site availability | 1 minute | 2 consecutive failures |
| Response time | 5 minutes | P95 > 3 seconds |
| SSL certificate | Daily | < 14 days to expiry |

### Error Monitoring

Browser errors can be monitored via:

1. **Cloudflare Analytics**: Automatic for Pages deployments
2. **Custom error handler**: Implement in application if needed
3. **CSP reports**: Configure report-uri directive

### Performance Monitoring

Key metrics to track:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time to Interactive | < 3s | Lighthouse CI |
| First Contentful Paint | < 1.5s | Lighthouse CI |
| Largest Contentful Paint | < 2.5s | Lighthouse CI |
| Core Web Vitals | Pass | Google Search Console |

### Operational Runbooks

For incident response procedures, see:
- `docs/planning/operational-runbooks.md` - Detailed runbooks
- `docs/planning/incident-response.md` - Security incidents

---

## Rollback Procedures

### Cloudflare Pages

1. Go to Cloudflare Dashboard → Pages → Your Project
2. Click "Deployments"
3. Find the last known-good deployment
4. Click "..." → "Rollback to this deployment"

### Git-based Rollback

```bash
# Find the last good commit
git log --oneline

# Revert to it
git revert HEAD~n..HEAD  # or specific commits
git push origin main

# Or force rollback (destructive)
git reset --hard <good-commit>
git push --force origin main
```

### Emergency: Static File Rollback

Keep a ZIP of the last known-good `dist/` folder. In emergency:

1. Extract the backup
2. Upload directly to CDN or hosting
3. Bypass CI/CD if needed

---

## Troubleshooting Deployment

### `window.crossOriginIsolated === false`

**Cause:** Headers not being applied.

**Fix:**
1. Check `_headers` file exists in `dist/`
2. Verify hosting platform is processing headers file
3. Check for conflicting headers in CDN/proxy

### 404 on Page Refresh

**Cause:** SPA routing not configured.

**Fix:**
1. Check `_redirects` file exists in `dist/`
2. Verify rewrite rules are working
3. Test: `curl -I https://your-domain.com/some-path` should return 200

### WASM Fails to Load

**Cause:** Missing files or CORS issues.

**Fix:**
1. Verify WASM files exist: `ls dist/wasm/openscad-official/`
2. Check CORS headers on WASM response
3. Check console for specific error message

### CSP Violations

**Cause:** Security policy blocking resources.

**Fix:**
1. Check browser console for CSP errors
2. Review `Content-Security-Policy` header
3. Add necessary directives for blocked resources
4. Test with `Content-Security-Policy-Report-Only` first

---

## Related Documentation- [Security Admin Guide](./SECURITY_ADMIN_GUIDE.md) - Security configuration details
- [Testing](./TESTING.md) - Pre-deployment testing
- [Troubleshooting](./TROUBLESHOOTING.md) - Developer troubleshooting