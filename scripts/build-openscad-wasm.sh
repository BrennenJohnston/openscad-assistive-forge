#!/usr/bin/env bash
#
# Build OpenSCAD's WebAssembly engine from one pinned upstream commit.
#
# Forge ships this engine in public/wasm/openscad-official/, and OpenSCAD is
# GPL software: the app has to be able to say exactly what went into it. This
# script checks out one pinned OpenSCAD commit, builds it inside OpenSCAD's own
# build image pinned by digest, with the snapshot settings OpenSCAD uses, and
# writes BUILD-INFO.txt beside the result recording every one of those facts.
#
# The build runs at the paths OpenSCAD's own CI builds at (/root/project for
# the source, /root/build for the output). The compiler writes source paths
# into the engine's assertion messages, so any other path gives different
# bytes for the same code.
#
# The "round-to-nearest" variant makes one change to upstream: it adds
# CGAL_ALWAYS_ROUND_TO_NEAREST beside the CGAL_DISABLE_ROUNDING_MATH_CHECK
# that OpenSCAD's CMakeLists.txt already sets for Emscripten. WebAssembly can
# only round to nearest, so without it CGAL's interval arithmetic, which
# expects to set upward rounding, is unsound in the browser: minkowski() hulls
# fail CGAL assertions and fall back to a far slower method. "baseline" builds
# upstream unchanged, for comparison.
#
# It needs git and Docker. The repeatable way to run it is the "Build OpenSCAD
# wasm" workflow in .github/workflows, which uploads the output as an
# artifact. The output never goes into public/wasm/ on its own: replacing the
# vendored engine is a separate, reviewed change.
#
#   VARIANT=round-to-nearest WASM_TYPE=web ./scripts/build-openscad-wasm.sh
#
# Output: build/openscad-wasm/<variant>-<wasm type>/
#   openscad.js, openscad.wasm (web only; the node build is one file)
#   BUILD-INFO.txt

set -euo pipefail

# The commit behind the 2026.04.03 snapshot Forge vendors, so the only
# difference from today's engine is the variant's change.
OPENSCAD_COMMIT="${OPENSCAD_COMMIT:-98d891340e6007524e69f399162016f9b22584ff}"
OPENSCAD_VERSION="${OPENSCAD_VERSION:-2026.04.03}"
# openscad/wasm-base-release, the image OpenSCAD's snapshot builds use, pinned
# by digest (measured 2026-09-28: emcc 4.0.10) so "reproducible" is a fact.
IMAGE="${IMAGE:-openscad/wasm-base-release@sha256:f73d33d5f2fd4c7ae4d3aaacb1e2e2deb193b878b38bb80c8235c933ac340c66}"
VARIANT="${VARIANT:-round-to-nearest}"
WASM_TYPE="${WASM_TYPE:-web}"
# A measurement build may set the engine's stack in bytes. Emscripten's
# default is 64 KiB; OpenSCAD's recursion guard assumes 8 MiB on Emscripten.
STACK_SIZE="${STACK_SIZE:-}"
if [ -n "$STACK_SIZE" ] && ! [[ "$STACK_SIZE" =~ ^[0-9]+$ ]]; then
  echo "STACK_SIZE must be a number of bytes, not '$STACK_SIZE'" >&2
  exit 1
fi

case "$VARIANT" in round-to-nearest|baseline) ;; *)
  echo "VARIANT must be round-to-nearest or baseline, not '$VARIANT'" >&2; exit 1 ;;
esac
case "$WASM_TYPE" in web|node) ;; *)
  echo "WASM_TYPE must be web or node, not '$WASM_TYPE'" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/build/openscad-wasm"
SRC="${WORK}/openscad"
BUILD="${WORK}/cmake-build"
OUT="${WORK}/${VARIANT}-${WASM_TYPE}"
FPU_H=/emsdk/upstream/emscripten/cache/sysroot/include/CGAL/FPU.h

mkdir -p "$WORK" "$BUILD"
if [ ! -d "$SRC/.git" ]; then
  git clone --quiet https://github.com/openscad/openscad.git "$SRC"
fi
git -C "$SRC" fetch --quiet origin "$OPENSCAD_COMMIT"
git -C "$SRC" checkout --quiet --force "$OPENSCAD_COMMIT"
git -C "$SRC" clean --quiet -fdx
git -C "$SRC" submodule update --quiet --init --recursive --force

if [ "$VARIANT" = "round-to-nearest" ]; then
  if [ "$(grep -c 'PUBLIC CGAL_DISABLE_ROUNDING_MATH_CHECK)' "$SRC/CMakeLists.txt")" != "1" ]; then
    echo "The line to patch is not in CMakeLists.txt exactly once; upstream changed." >&2
    exit 1
  fi
  sed -i 's/PUBLIC CGAL_DISABLE_ROUNDING_MATH_CHECK)/PUBLIC CGAL_DISABLE_ROUNDING_MATH_CHECK CGAL_ALWAYS_ROUND_TO_NEAREST)/' \
    "$SRC/CMakeLists.txt"
  # A CGAL that does not know the macro would build without complaint and
  # without the fix. A header that is missing or has moved fails here too.
  if ! docker run --rm "$IMAGE" grep -q CGAL_ALWAYS_ROUND_TO_NEAREST "$FPU_H"; then
    echo "The build image's CGAL does not know CGAL_ALWAYS_ROUND_TO_NEAREST." >&2
    exit 1
  fi
fi

# OpenSCAD's CI gives CMake the abbreviated hash git prints for the commit,
# 8 characters here: the official engine reports "2026.04.03 (git 98d89134)".
# The full hash would be a different string in the binary.
docker run --rm -v "$SRC:/root/project" -v "$BUILD:/root/build" -w /root/project \
  -e WASM_TYPE="$WASM_TYPE" -e OPENSCAD_COMMIT="${OPENSCAD_COMMIT:0:8}" \
  -e OPENSCAD_VERSION="$OPENSCAD_VERSION" -e STACK_SIZE="$STACK_SIZE" "$IMAGE" bash -c '
    set -euo pipefail
    find /root/build -mindepth 1 -delete
    extra=()
    if [ -n "$STACK_SIZE" ]; then extra+=("-DCMAKE_EXE_LINKER_FLAGS=-sSTACK_SIZE=$STACK_SIZE"); fi
    emcmake cmake -G Ninja -B ../build . \
      -DCMAKE_BUILD_TYPE=Release \
      -DWASM_BUILD_TYPE="$WASM_TYPE" \
      -DOPENSCAD_COMMIT="$OPENSCAD_COMMIT" \
      -DOPENSCAD_VERSION="$OPENSCAD_VERSION" \
      -DSNAPSHOT=ON -DEXPERIMENTAL=ON ${extra[@]+"${extra[@]}"}
    cmake --build ../build'

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$BUILD/openscad.js" "$OUT/"
if [ "$WASM_TYPE" = "web" ]; then
  cp "$BUILD/openscad.wasm" "$OUT/"
fi

{
  echo "OpenSCAD WebAssembly engine, built by scripts/build-openscad-wasm.sh"
  echo
  echo "OpenSCAD commit:  $OPENSCAD_COMMIT"
  echo "Version string:   $OPENSCAD_VERSION"
  echo "Variant:          $VARIANT"
  echo "WASM build type:  $WASM_TYPE"
  echo "Build image:      $IMAGE"
  echo "Emscripten:       $(docker run --rm "$IMAGE" emcc --version | head -1)"
  echo "CGAL:             $(docker run --rm "$IMAGE" awk '/#define CGAL_VERSION /{print $3}' /emsdk/upstream/emscripten/cache/sysroot/include/CGAL/version.h)"
  echo "CMake settings:   -DCMAKE_BUILD_TYPE=Release -DSNAPSHOT=ON -DEXPERIMENTAL=ON"
  echo "Stack size:       ${STACK_SIZE:-Emscripten default}"
  echo "Build paths:      /root/project (source), /root/build (output)"
  echo "Commit in engine: ${OPENSCAD_COMMIT:0:8}"
  echo
  if [ "$VARIANT" = "round-to-nearest" ]; then
    echo "Change to upstream (CMakeLists.txt):"
    git -C "$SRC" diff --unified=0 -- CMakeLists.txt | grep '^[-+][^-+]'
  else
    echo "Change to upstream: none"
  fi
  echo
  echo "SHA-256:"
  (cd "$OUT" && sha256sum openscad.*)
} > "$OUT/BUILD-INFO.txt"

cat "$OUT/BUILD-INFO.txt"
