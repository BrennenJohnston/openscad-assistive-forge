# AI toolchain quick start

Two different jobs bring an AI toolchain to this project, and they need
different doors. Door one: your agent or pipeline hands work **to** the
app — a model to open, parameters to set, a file to get back. Door two:
you're developing **on** this repository with an AI coding assistant.
This page is the on-ramp for both; everything it points at is verifiable
in this repository.

## Door one: point your tool at Forge

There is no API to integrate against, and that is the point. Forge is a
browser page; the whole interface is **a URL going in** and **a file
coming out**. Your tool composes an ordinary link, a person (or a
headless browser) opens it, and the STL comes back from the browser.

Read, in order:

1. [`docs/specs/FORGE_HANDOFF_CONTRACT.md`](../specs/FORGE_HANDOFF_CONTRACT.md)
   — the one page a pipeline tool can build against without talking to
   anybody: the URL parameters in, the files out, what is stable.
2. `/forge-capabilities.txt` on the deployed site — a machine-readable
   statement of what the deployment supports, served beside the app.
3. [`docs/specs/MANIFEST_STABILITY_CONTRACT.md`](../specs/MANIFEST_STABILITY_CONTRACT.md)
   — what each link parameter promises and for how long.

A worked example. Host a Customizer-enabled `.scad` (or a
`forge-manifest.json` describing a project) anywhere the CSP allows —
GitHub raw, GitHub/GitLab Pages, Cloudflare Pages — and compose:

```text
https://openscad-assistive-forge.pages.dev/?project=https%3A%2F%2Fraw.githubusercontent.com%2Fyou%2Frepo%2Fmain%2Fmodel.scad&preset=Large&skipWelcome=true
```

Opening that link loads the model, applies the named preset, and the
person clicks one button to download the named STL. Exports carry a
`forge-provenance.json` countersignature so the downstream end of a
pipeline can verify where a file came from.

## Door two: develop this repository with an agent

The rules an agent must follow here are short and they are real — each
one exists because of a specific failure:

- **`AGENTS.md`** (repository root) — the golden rules: protected files
  (the vendored WASM engine, the braille engine and tables, the fonts),
  the accessibility bar, the commit conventions, the quality gates.
- **`.cursor/rules/`** — the same rules in Cursor's `.mdc` format, so
  Cursor loads them automatically.
- **`CLAUDE.md`** — a pointer to `AGENTS.md` for Claude Code sessions.

The three things agents get wrong most often here, spelled out:

1. **Protected files are not yours.** The OpenSCAD WASM engine and the
   liblouis braille engine are vendored, integrity-pinned binaries.
   When something involving them breaks, the bug is in the calling
   code. Braille tables are accessibility-critical output — a wrong
   translation is worse than a crash.
2. **Accessibility is the product.** This app exists for assistive
   technology users. An agent that "cleans up" an aria attribute,
   shrinks a touch target, or hardcodes a color has broken the product
   even if every test passes. Accessibility-critical text is flagged
   for my review, never silently finalized.
3. **Verification means running it.** The unit board, the e2e suites,
   the bundle budgets — a task is done when its named check has run
   and passed with real output, not when the code looks right.

Start with `CONTRIBUTING.md` for the human conventions, then
`AGENTS.md` for the agent-specific ones.
