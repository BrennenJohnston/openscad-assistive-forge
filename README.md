# OpenSCAD's WebAssembly engine with three build changes

This branch holds the OpenSCAD engine that my app, [OpenSCAD Assistive Forge](https://github.com/BrennenJohnston/openscad-assistive-forge), runs in the browser. It is OpenSCAD at commit `98d891340e` (the commit behind the official 2026.04.03 snapshot) built for the web with three changes to how it is compiled and linked, and nothing changed in OpenSCAD's own C++ code. The branch has no history shared with the app: only the engine, the recipe that builds it, the exact changes as patches, the measurements behind them and a page to try it.

I made these changes with AI coding tools. I am not a C++ or Emscripten developer and I do not fully understand every part of them, so I am not proposing them anywhere. I am publishing the engine and everything I measured so that anyone working on OpenSCAD's WebAssembly build can see exactly what differs from the official build and check it for themselves.

## Contents

- [Why I built it](#why-i-built-it)
- [The changes](#the-changes)
- [How to rebuild it byte for byte](#how-to-rebuild-it-byte-for-byte)
- [How it compares with the official 2026.04.03 snapshot](#how-it-compares-with-the-official-20260403-snapshot)
- [Known issues and what would change next](#known-issues-and-what-would-change-next)
- [How to try it in a browser](#how-to-try-it-in-a-browser)
- [Licenses](#licenses)

## Why I built it

Three problems showed up in the app with the official snapshot. Each change below answers one of them. The details and the raw results are in `measurements/`.

1. **`minkowski()` fell back to a far slower method.** A model with rounded edges made by `minkowski()` with a sphere (the Plug Puller, a project of mine) printed "Minkowski failed" and took over a minute. In Node, upstream's own build took 64 and 80 seconds on its two-sided file in two runs, with one fallback each; with the rounding change alone it took 9.2 seconds with none.
2. **A model that recursed a few hundred levels deep damaged memory instead of stopping.** On a spiral model that recurses one level per segment, the build with Emscripten's default 64 KiB stack failed at 190 levels in Firefox and WebKit with memory errors, while desktop OpenSCAD 2026.01.03 rendered it (the depth table below).
3. **Chrome stopped deep models at about 110 levels.** With Emscripten's JavaScript-based exceptions, every call that can throw goes through a JavaScript wrapper, and Chrome's own script stack ran out first: the same spiral stopped at 111 levels with "Maximum call stack size exceeded", whatever the stack size.

## The changes

The first three rows are in `changes/openscad-98d89134.patch`; the stack is a linker flag the recipe passes to CMake; the last row is in `changes/openscad-wasm-dc2ff913.patch`. Line numbers are in upstream's files at the pinned commits.

| Upstream file and line | The change | Why | How it was measured | How to verify |
|---|---|---|---|---|
| OpenSCAD `CMakeLists.txt`, line 298 | `CGAL_ALWAYS_ROUND_TO_NEAREST` added beside the `CGAL_DISABLE_ROUNDING_MATH_CHECK` already set for Emscripten | WebAssembly can only round to nearest; without it, CGAL's interval arithmetic, which expects to set upward rounding, is unsound in the browser, and `minkowski()` hulls fail CGAL assertions | The Plug Puller in Node, upstream unchanged against this change (`measurements/plug-puller/node-runs.md`) | Run the workflow's node job with `baseline` and with `round-to-nearest`: the baseline prints "Minkowski failed" on the two-sided file; the workflow fails if it stops doing so |
| OpenSCAD `CMakeLists.txt`, lines 303 and 305 | `-fexceptions` becomes `-fwasm-exceptions`, for compiling and for linking | WebAssembly's own exception handling, so no call that can throw passes through a JavaScript wrapper | The spiral at depths 110 to 400 in Chromium, Firefox and WebKit, and five ordinary models, the previous build against this one (`measurements/depth/`, `measurements/speed/`) | The JavaScript wrappers are named `invoke_*`: `grep -o 'invoke_[a-z]*' engine/openscad.js \| wc -l` prints 0, and 192 for the official 2026.04.03 snapshot's `openscad.js`; a deep model renders in Chrome |
| OpenSCAD `CMakeLists.txt`, lines 308 and 327 | `-sDISABLE_EXCEPTION_CATCHING=0` removed from the link; `-sNODEJS_CATCH_EXIT` removed from the node build | The first belongs to the JavaScript way and Emscripten refuses it beside `-fwasm-exceptions`; Emscripten 6.0.5 no longer supports the second | The build fails at the link with the first; it reports the second as no longer supported | Build without removing them |
| Linking (`-DCMAKE_EXE_LINKER_FLAGS` in `scripts/build-openscad-wasm.sh`) | `-sSTACK_SIZE=8388608` (8 MiB) | Emscripten's default stack is 64 KiB, while OpenSCAD's recursion guard assumes 8 MiB (`STACKSIZE`, `CMakeLists.txt` line 279, used through `src/platform/PlatformUtils.h` line 10), so the guard never fired before the stack overran | The spiral in Firefox and WebKit with 64 KiB and with 8 MiB (`measurements/depth/`) | A deep model in Firefox: with 64 KiB it fails with a memory error; with 8 MiB it renders, or stops with a recursion error instead |
| openscad-wasm `Makefile` (commit `dc2ff913`), line 314 | The line that rewrites Boost's `-fwasm-exceptions` to `-fexceptions` removed | The libraries the engine links must use the same exception handling as the engine; the libraries in OpenSCAD's build image were compiled with `-fexceptions` and cannot be linked with `-fwasm-exceptions` | The link succeeds and the engine runs (every measurement here) | Build the libraries' image without removing it, then link |

### The toolchain is not the official one

Because the libraries had to be compiled again, this engine also differs from the official snapshot in everything around OpenSCAD's code:

| | Official 2026.04.03 snapshot | This engine |
|---|---|---|
| Build image | `openscad/wasm-base-release`, pinned in the recipe by digest `f73d33d5…` | Built by the recipe from openscad-wasm `dc2ff913` on `emscripten/emsdk:6.0.5` (digest `76a44fff…`), with `EMSCRIPTEN_FLAGS=-fwasm-exceptions -O3` |
| Emscripten | 4.0.10 | 6.0.5 |
| CGAL | 6.0.1 | 6.0.3 |
| `openscad.wasm` | 10,712,276 bytes | 9,305,090 bytes |
| `openscad.js` | 100,183 bytes | 77,044 bytes |

So the speed and depth comparisons below measure all of this together, not the three changes alone. The Plug Puller runs in Node isolate the rounding change (same image, same Emscripten); nothing here isolates the exception change from the toolchain change.

## How to rebuild it byte for byte

The recipe is `scripts/build-openscad-wasm.sh`; the workflow `.github/workflows/build-openscad-wasm.yml` runs it on GitHub's `ubuntu-latest`, uploads the result, and compares the web build with `engine/` byte for byte. They are the files the app uses, with one difference: the workflow's paths point at `engine/` here instead of the app's `public/wasm/openscad-official/`.

- **On GitHub:** run the "Build OpenSCAD wasm" workflow on this branch with the variant `wasm-exceptions` (the web job took 17 to 26 minutes in three runs; the libraries' image is built first). The web job prints "Same bytes as engine/ (a wasm-exceptions build): yes" and fails otherwise.
- **On your own machine:** with git and Docker on Linux, `VARIANT=wasm-exceptions WASM_TYPE=web ./scripts/build-openscad-wasm.sh`. The output lands in `build/openscad-wasm/wasm-exceptions-web/` with its `BUILD-INFO.txt`.

What is pinned: OpenSCAD `98d891340e6007524e69f399162016f9b22584ff`; openscad-wasm `dc2ff913b4193b1ebfef863da3f7e84f8fbc1e11`; `emscripten/emsdk:6.0.5@sha256:76a44fff907397784decc435115d07fcb9587a4f1504977f39f3745e538e3a1e`; for the other variants `openscad/wasm-base-release@sha256:f73d33d5f2fd4c7ae4d3aaacb1e2e2deb193b878b38bb80c8235c933ac340c66`; GMP 6.3.0 and MPFR 4.2.1 from `ftp.gnu.org`. The build runs at `/root/project` and `/root/build`, the paths OpenSCAD's own CI uses, because the compiler writes source paths into the engine's assertion messages.

What was reproduced, in the app's repository (`BrennenJohnston/openscad-assistive-forge`, Actions):

- Runs 39031127652 and 39038452955 (2026-10-17) built the same bytes: `openscad.js` `e1809a0baa40d8b93a6eb72df5579dfe25fd18bc266b54131622f4ca299af36d` and `openscad.wasm` `071ae3485eb934327c7d967668256a89c48cfa7cac1de9e0c8eef1675b46cd3f`, the files in `engine/`. Run 39051754637 built them a third time.
- With no changes (the `baseline` variant), the recipe gives back the official 2026.04.03 snapshot byte for byte: run 36798955316 built `openscad.js` `266d025d…` and `openscad.wasm` `96ed844b…`, the two files in `OpenSCAD-2026.04.03-WebAssembly-web.zip` from files.openscad.org.

## How it compares with the official 2026.04.03 snapshot

In the app, in headless Chromium 143 with the GPU, one run each (`measurements/official-comparison/table.md` has the three other official snapshots as well):

| Model | This engine | Official 2026.04.03 |
|---|---|---|
| A simple box (296 triangles) | 54 ms | 61 ms |
| A braille charm (29,372 triangles) | 600 ms | 1,302 ms |
| The Plug Puller, one-sided | 1,041 ms, 15,674 triangles | 1,244 ms, 15,664 triangles |
| The Plug Puller, two-sided | 10,659 ms, 81,416 triangles | not finished within the app's 90-second preview limit; "Minkowski failed" twice |
| A module that calls itself 100 times, each step moved and turned | 48 ms | stopped: Chrome's script stack ran out ("Maximum call stack size exceeded") |
| The same, 150 times | 57 ms | stopped the same way |
| `linear_extrude(2) projection(cut = true) sphere(10);` | 54 ms, 116 triangles | 53 ms, 116 triangles |
| `roof() square(20);` | unknown module | unknown module |

Against the previous build of mine (the rounding change and the 8 MiB stack on OpenSCAD's image, still with JavaScript-based exceptions), in Chromium, alternating builds, two runs each; every model gave the same triangle count on both (`measurements/speed/`):

| Model | Previous build | This engine |
|---|---|---|
| FibonacciSphere | 6.13 s, 5.54 s | 4.15 s, 4.27 s |
| CYL_bear_box | 5.83 s, 6.13 s | 4.33 s, 4.33 s |
| spinning_picture_ornament | 7.04 s, 7.01 s | 3.90 s, 3.92 s |
| MarioWorld | 2.18 s, 2.21 s | 2.03 s, 1.38 s |
| text_box | 0.45 s, 0.47 s | 0.38 s, 0.37 s |

And how deep the spiral renders (`measurements/depth/`):

| Depth | 64 KiB stack | Previous build (8 MiB stack) | This engine |
|---|---|---|---|
| 110 | renders in Chromium, Firefox and WebKit | renders in all three | not measured |
| 111 | Chromium stops ("Maximum call stack size exceeded"); Firefox and WebKit not measured | Chromium stops the same way; Firefox and WebKit render | renders in all three |
| 150 | Chromium stops; Firefox and WebKit render | Chromium stops; Firefox and WebKit render | renders in all three |
| 190 | Chromium stops; Firefox ("indirect call to null") and WebKit ("call_indirect to a signature that does not match") fail | Chromium stops; Firefox and WebKit render | renders in all three |
| 250 | not measured | Chromium stops; Firefox and WebKit render | renders in all three |
| 400 | not measured | Chromium stops; Firefox fails ("too much recursion"); WebKit renders | renders in all three, in 20 to 24 s |

Desktop OpenSCAD 2026.01.03 rendered every depth in the 64 KiB column, up to 190.

The app's own geometry check (four small models, the volume, bounding box, facet count and a hash of the mesh) gave the same results with this engine as with the first build that had the rounding change.

## Known issues and what would change next

- **The legacy exception instructions.** Firefox warns that WebAssembly's `try` instruction, which this build uses, is deprecated in favor of `try_table`. Today's browsers run both. When they drop the old form, the build needs Emscripten's setting for the newer instructions.
- **Meshes can differ slightly from the official build.** The two-sided Plug Puller came out with 81,296 facets here and 81,428 with the rounding change on OpenSCAD's image (CGAL 6.0.1, Emscripten 4.0.10); the official snapshot, falling back, gave 82,688. I have not traced which library makes the difference.
- **Chrome still sets a limit below desktop OpenSCAD's.** The module that moves and turns at each step renders 200 levels deep in Chromium and stops at 300: Chrome's script stack runs out ("Maximum call stack size exceeded") and the engine reports it as an error. The spiral, whose recursive call sits directly inside its `if` where this model's sits inside a `translate` and a `rotate` as well, renders 400.
- **`engine/INTEGRITY.json` repeats older notes.** Its `knownIssues` say `projection()` and `roof()` crash the engine; in my tests `projection()` renders on this engine and on the four official snapshots, and `roof()` is not enabled in any of these builds (unknown module).
- **What I have not tested:** Safari on a Mac or an iPhone (the WebKit numbers are Playwright's WebKit on Windows); phones; any model large enough to approach the 4 GB memory limit.
- **What would change next:** if a later official snapshot builds with the rounding change, I would compare it with this build and drop my change. The 2026.10.18 snapshot still fell back on the one-sided Plug Puller in my test (51 seconds, "Minkowski failed" twice).

## How to try it in a browser

```
node demo/serve.mjs
```

Then open `http://localhost:8080/demo/`, type a model and press Render. The page starts the engine in a worker, renders the model to a binary STL and says how many triangles it has and how long it took. The server needs only Node; it sets the two cross-origin isolation headers the app uses, but the engine runs without them, so any static server works. In Chromium, `cube(10);` gave 12 triangles.

## Licenses

- `engine/` is OpenSCAD, GPL-2.0-or-later, with the libraries openscad-wasm's recipe builds linked into it under their own licenses. Its source is OpenSCAD at the commit above, openscad-wasm at the commit above, and the two patches in `changes/`. OpenSCAD's license with its linking exception is `licenses/OpenSCAD-COPYING`; openscad-wasm's is `licenses/openscad-wasm-COPYING`.
- `changes/` modifies those two projects' files and is under their licenses.
- `scripts/`, `.github/`, `demo/` and `measurements/` are GPL-3.0-or-later, as the app is (`licenses/GPL-3.0.txt`).
