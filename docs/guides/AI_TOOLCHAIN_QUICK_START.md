# AI toolchain quick start

Your agent or pipeline hands work to the app: a model to open, parameters
to set, a drawing to edit, a file to get back. This page is the on-ramp;
everything it points at is verifiable in this repository.

## Point your tool at Forge

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

A tool that makes drawings sends one the same way. Host the PNG, SVG or
DXF anywhere the CSP allows and compose:

```text
https://openscad-assistive-forge.pages.dev/?example=logo-plate&drawing=https%3A%2F%2Fraw.githubusercontent.com%2Fyou%2Frepo%2Fmain%2Flogo.png
```

The Logo Plate opens with the drawing already in it, converted, and the
drawing editor open on it. The person edits what they want, applies, sees
the plate with their edits, and exports the STL or the edited drawing.
`FORGE_HANDOFF_CONTRACT.md` section 2.5 has the rules.
