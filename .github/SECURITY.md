# Security policy

## Supported versions

This repository does not currently publish long-term-supported patch lines. Security fixes are released on the `main` branch and included in the next tagged release.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Preferred reporting paths:

1. **GitHub Security Advisories** (recommended if enabled for this repo):
   - Go to the repository page → **Security** → **Advisories** → **New draft security advisory**
2. If advisories are not available, contact the maintainers privately (for example via a maintainer email listed in the repository hosting UI).

Include:

- A clear description of the issue and impact
- Steps to reproduce (or a PoC if safe)
- Affected browsers/versions (if relevant)
- Any logs/screenshots that help confirm the issue

## Scope notes (web + WASM)

This project:

- Runs OpenSCAD via **WASM** in the browser
- Executes user-provided `.scad` content client-side
- Uses a **Web Worker** for the OpenSCAD runtime

Security reports related to sandbox escape, cross-origin isolation, supply-chain risk, or unsafe handling of user-controlled inputs are all in-scope.

