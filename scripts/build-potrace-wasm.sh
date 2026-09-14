#!/usr/bin/env bash
#
# Build Potrace to WebAssembly for the picture tracer.
#
# Forge does not take a pre-built binary for this. Potrace is GPL software and
# the app that ships it has to be able to say exactly what went in: this script
# fetches one pinned tarball, refuses to continue unless its checksum matches,
# compiles four core source files plus Forge's own glue, and writes a README
# beside the result recording every one of those facts. Anyone can run it and
# get the same wasm.
#
# It needs emcc on PATH. Nothing installs it for you; the repeatable way to run
# this is the "Build Potrace wasm" workflow in .github/workflows, which sets up
# emsdk, runs this script, and uploads the output as an artifact.
#
#   ./scripts/build-potrace-wasm.sh
#
# Output: public/wasm/potrace/{potrace.mjs,potrace.wasm,README.txt}

set -euo pipefail

POTRACE_VERSION="1.16"
POTRACE_TARBALL="potrace-${POTRACE_VERSION}.tar.gz"
POTRACE_URL="https://potrace.sourceforge.net/download/${POTRACE_VERSION}/${POTRACE_TARBALL}"
# Measured from the downloaded tarball, 2026-09-13. If this stops matching, the
# build stops: a changed checksum means the source is not the source this
# project reviewed and licensed, and that is never something to wave through.
POTRACE_SHA256="be8248a17dedd6ccbaab2fcc45835bb0502d062e40fbded3bc56028ce5eb7acc"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/build/potrace"
SRC="${WORK}/potrace-${POTRACE_VERSION}/src"
OUT="${ROOT}/public/wasm/potrace"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc is not on PATH." >&2
  echo "Run the 'Build Potrace wasm' GitHub Actions workflow instead, or" >&2
  echo "activate an emsdk environment first." >&2
  exit 1
fi

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

mkdir -p "${WORK}" "${OUT}"

# ── 1. Fetch and verify ──────────────────────────────────────────────────────
if [ ! -f "${WORK}/${POTRACE_TARBALL}" ]; then
  echo "Downloading ${POTRACE_URL}"
  curl -fsSL --retry 3 -o "${WORK}/${POTRACE_TARBALL}" "${POTRACE_URL}"
fi

ACTUAL_SHA="$(sha256_of "${WORK}/${POTRACE_TARBALL}")"
if [ "${ACTUAL_SHA}" != "${POTRACE_SHA256}" ]; then
  echo "Checksum mismatch for ${POTRACE_TARBALL}" >&2
  echo "  expected ${POTRACE_SHA256}" >&2
  echo "  got      ${ACTUAL_SHA}" >&2
  rm -f "${WORK}/${POTRACE_TARBALL}"
  exit 1
fi
echo "sha256 ${ACTUAL_SHA} matches the pinned value."

rm -rf "${WORK}/potrace-${POTRACE_VERSION}"
tar -xzf "${WORK}/${POTRACE_TARBALL}" -C "${WORK}"

# The upstream licence text travels with the wasm, unmodified.
cp "${WORK}/potrace-${POTRACE_VERSION}/COPYING" "${OUT}/COPYING.potrace"

# ── 2. The one thing autotools would have supplied ───────────────────────────
# Potrace's sources read config.h only for HAVE_CONFIG_H. Of everything
# ./configure would define, the core library reads exactly two: VERSION, for
# potrace_version(), and HAVE_INTTYPES_H. Running the full autotools dance
# inside emscripten to learn that is not worth it, so this states both.
cat > "${SRC}/config.h" <<'CONFIG_H'
/* Written by scripts/build-potrace-wasm.sh. Not upstream. */
#define VERSION "1.16"
#define HAVE_INTTYPES_H 1
CONFIG_H

cp "${ROOT}/scripts/potrace-glue.c" "${SRC}/forge-glue.c"

# ── 3. Compile ───────────────────────────────────────────────────────────────
# MODULARIZE + EXPORT_ES6 so a module worker can import it; FILESYSTEM=0 drops
# a file system nothing uses; DYNAMIC_EXECUTION=0 keeps the output free of
# eval, which the deployed CSP forbids and which is not being loosened for
# this. ENVIRONMENT keeps node alongside web and worker on purpose: it costs a
# little glue, and it buys tests that run the file that actually ships instead
# of a second build nobody downloads.
EMCC_FLAGS=(
  -O3
  -DHAVE_CONFIG_H
  -I "${SRC}"
  --no-entry
  -s MODULARIZE=1
  -s EXPORT_ES6=1
  -s EXPORT_NAME=createPotrace
  -s ENVIRONMENT=web,worker,node
  -s FILESYSTEM=0
  -s DYNAMIC_EXECUTION=0
  -s ALLOW_MEMORY_GROWTH=1
  -s INVOKE_RUN=0
  -s ASSERTIONS=0
  -s EXPORTED_FUNCTIONS=_potrace_trace_to_path,_potrace_free_result,_potrace_build_version,_malloc,_free
  -s EXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString
)

echo "Compiling with $(emcc --version | head -1)"
emcc "${EMCC_FLAGS[@]}" \
  "${SRC}/potracelib.c" \
  "${SRC}/curve.c" \
  "${SRC}/trace.c" \
  "${SRC}/decompose.c" \
  "${SRC}/forge-glue.c" \
  -o "${OUT}/potrace.mjs"

# ── 4. Measure and record ────────────────────────────────────────────────────
size_of() { wc -c < "$1" | tr -d ' '; }
gzip_size_of() { gzip -9 -c "$1" | wc -c | tr -d ' '; }

WASM_RAW="$(size_of "${OUT}/potrace.wasm")"
WASM_GZ="$(gzip_size_of "${OUT}/potrace.wasm")"
JS_RAW="$(size_of "${OUT}/potrace.mjs")"
JS_GZ="$(gzip_size_of "${OUT}/potrace.mjs")"
EMCC_VERSION="$(emcc --version | head -1)"

cat > "${OUT}/README.txt" <<README
Potrace, compiled to WebAssembly for OpenSCAD Assistive Forge.

Everything in this folder is build output. Do not edit it by hand: rerun
scripts/build-potrace-wasm.sh, or the "Build Potrace wasm" GitHub Actions
workflow, and commit what comes out.

Source
  ${POTRACE_URL}
  sha256 ${POTRACE_SHA256}
  Potrace ${POTRACE_VERSION}, Copyright (C) 2001-2019 Peter Selinger
  Compiled unmodified. The only files added to the tree were a two-line
  config.h (VERSION and HAVE_INTTYPES_H, which ./configure would have written)
  and scripts/potrace-glue.c, which is Forge's own.

Licence
  GNU General Public License, version 2 or (at your option) any later version,
  as granted in the upstream README and COPYING. The full text is beside this
  file as COPYING.potrace. Forge is GPL-3.0-or-later, which that grant permits.

Compiled from
  src/potracelib.c  src/curve.c  src/trace.c  src/decompose.c
  scripts/potrace-glue.c (as forge-glue.c)

Built with
  ${EMCC_VERSION}
  ${EMCC_FLAGS[*]}

Size, as built
  potrace.wasm  ${WASM_RAW} bytes raw, ${WASM_GZ} bytes gzipped
  potrace.mjs   ${JS_RAW} bytes raw, ${JS_GZ} bytes gzipped

Getting the source
  The tarball above is the complete corresponding source for the potrace part
  of this build. It is also mirrored at https://potrace.sourceforge.net/ and
  the project will supply a copy on request.
README

echo
echo "Built into ${OUT}:"
echo "  potrace.wasm  ${WASM_RAW} bytes raw, ${WASM_GZ} gzipped"
echo "  potrace.mjs   ${JS_RAW} bytes raw, ${JS_GZ} gzipped"
