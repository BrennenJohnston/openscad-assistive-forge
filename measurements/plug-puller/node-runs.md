# The Plug Puller in Node, four builds

The "Build OpenSCAD wasm" workflow's node job renders the Plug Puller 0.13.0
(`plug-puller/Plug_Puller_SingleFile.scad` and
`plug-puller/Plug_Puller_Two_Sided_SingleFile.scad` at commit `82ddd6200e` of
the Forge repository) with
`--backend=Manifold -D '$fa=12' -D '$fs=2' --export-format=off`, on
GitHub's `ubuntu-latest` runner. Its rounded edges are `minkowski()` with a
sphere. "Fallback warnings" counts the engine's "Minkowski failed" lines: the
hull failed a CGAL assertion and the engine fell back to a slower method.

The lines below are copied from each run's log, in the repository
`BrennenJohnston/openscad-assistive-forge`.

## Upstream unchanged (the recipe's `baseline` variant)

Its web build is the official 2026.04.03 snapshot byte for byte (run
36798955316: `openscad.js` `266d025d…`, `openscad.wasm` `96ed844b…`, the
files in `OpenSCAD-2026.04.03-WebAssembly-web.zip`).

Run 36798955316 (2026-10-01):

| File | Time | Fallback warnings | Result |
|---|---|---|---|
| Plug_Puller_SingleFile | 0:00:01.215 | 0 | exit 0, Facets: 15660 |
| Plug_Puller_Two_Sided_SingleFile | 0:01:20.360 | 1 | exit 0, Facets: 82688 |

Run 36598308242 (2026-09-29):

| File | Time | Fallback warnings | Result |
|---|---|---|---|
| Plug_Puller_SingleFile | 0:00:00.974 | 0 | exit 0, Facets: 15660 |
| Plug_Puller_Two_Sided_SingleFile | 0:01:04.231 | 1 | exit 0, Facets: 82688 |

## The rounding fix alone, on OpenSCAD's build image (`round-to-nearest` before the stack change)

Run 36811140410 (2026-10-01):

| File | Time | Fallback warnings | Result |
|---|---|---|---|
| Plug_Puller_SingleFile | 0:00:01.759 | 0 | exit 0, Facets: 15670 |
| Plug_Puller_Two_Sided_SingleFile | 0:00:09.225 | 0 | exit 0, Facets: 81428 |

## The rounding fix and the 8 MiB stack, on OpenSCAD's build image (`round-to-nearest`)

Run 38080416095 (2026-10-10):

| File | Time | Fallback warnings | Result |
|---|---|---|---|
| Plug_Puller_SingleFile | 0:00:01.735 | 0 | exit 0, Facets: 15670 |
| Plug_Puller_Two_Sided_SingleFile | 0:00:09.069 | 0 | exit 0, Facets: 81428 |

## This engine (`wasm-exceptions`)

Run 39051754637 (2026-10-17), whose web build is the same bytes as `engine/`:

| File | Time | Fallback warnings | Result |
|---|---|---|---|
| Plug_Puller_SingleFile | 0:00:00.654 | 0 | exit 0, Facets: 15672 |
| Plug_Puller_Two_Sided_SingleFile | 0:00:03.299 | 0 | exit 0, Facets: 81296 |
