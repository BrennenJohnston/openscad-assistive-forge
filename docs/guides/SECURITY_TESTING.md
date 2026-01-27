# Security Testing

How to test the security fixes in the codebase and verify ongoing security.

## Recent fixes (2026-01-27)

### XSS in ZIP file tree

File paths from ZIP archives were inserted into HTML without escaping. A malicious filename like `<img src=x onerror=alert('XSS')>.scad` could inject JavaScript.

Fixed in `src/js/zip-handler.js` and `src/js/html-utils.js`.

To test: create a ZIP with a malicious filename, upload it, verify the filename displays as escaped text (not executed).

### Service worker message validation

Service worker message handlers lacked validation. Fixed by adding allowlisted message types in `src/js/sw-manager.js` and `src/js/storage-manager.js`.

To test: in the browser console, send an invalid message type:

```javascript
navigator.serviceWorker.controller?.postMessage({ type: 'INVALID_TYPE' })
```

It should log a warning and be ignored.

### Path traversal in ZIP extraction

ZIP extraction didn't validate file paths, allowing paths like `../../etc/passwd`. Fixed in `src/js/zip-handler.js`.

To test: create a ZIP with malicious paths, upload it, verify the paths are rejected with console warnings.

## Manual testing

### XSS prevention

Test file uploads and text fields with:
- `<script>alert('XSS')</script>`
- `<img src=x onerror=alert('XSS')>`
- `javascript:alert('XSS')`

Everything should display as escaped text, not execute.

### Path traversal

Test ZIP uploads with paths like:
- `../../../etc/passwd`
- `/absolute/path`
- `path\\with\\backslashes`

Malicious paths should be skipped with console warnings.

### Message validation

Test service worker messages in the browser console. Invalid types should log warnings.

## Automated testing

```bash
npm run test:run    # includes security-related unit tests
npm run lint        # catches some security patterns
npm run test:e2e    # validates full workflows
```

Related test files:
- `tests/unit/zip-handler.test.js`
- `tests/unit/validation-schemas.test.js`
- `tests/unit/comparison-view.test.js` (HTML escaping)

## Dependency auditing

```bash
npm audit
npm audit fix
```

Run this periodically to catch vulnerable dependencies.

## Reporting security issues

Don't create a public GitHub issue. Email the maintainer directly (see `SECURITY.md`). Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if you have one
