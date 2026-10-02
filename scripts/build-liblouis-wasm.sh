#!/usr/bin/env bash
#
# Build liblouis to WebAssembly for the braille tools.
#
# The braille tools translate with liblouis. The only builds npm offers date
# from 2017, so Forge compiles a current release itself, the way it compiles
# Potrace: this script fetches one pinned release tarball, refuses to continue
# unless its checksum matches, builds it twice from that one tarball, and
# writes a README beside the result recording the source, the checksum, the
# compiler and the flags. Anyone can run it and get the same wasm.
#
# The two builds:
#   native   a lou_translate for this machine. It is not shipped. It is the
#            reference the wasm has to agree with, cell for cell.
#   wasm     the library compiled with Emscripten, which is what ships.
# They come from separate copies of the source so their object files can
# never mix.
#
# It needs emcc on PATH, and a C compiler and make for the native build.
# Nothing installs them for you; the repeatable way to run this is the "Build
# liblouis wasm" workflow in .github/workflows, which sets up emsdk, runs this
# script, and uploads the output as an artifact.
#
#   ./scripts/build-liblouis-wasm.sh
#
# Output:
#   vendor/liblouis/liblouis.mjs          the loader, which has to be importable
#                                         as a module (see build-potrace-wasm.sh
#                                         for why it does not live in public/)
#   public/wasm/liblouis/liblouis.wasm    the binary, at a stable unhashed URL,
#   ...{README.txt,COPYING.LESSER.liblouis}  with the license and the recipe
#   build/liblouis/native/liblouis-<v>/   the native lou_translate and the
#                                         release's tables, for the checks

set -euo pipefail

LIBLOUIS_VERSION="3.39.0"
LIBLOUIS_TARBALL="liblouis-${LIBLOUIS_VERSION}.tar.gz"
LIBLOUIS_URL="https://github.com/liblouis/liblouis/releases/download/v${LIBLOUIS_VERSION}/${LIBLOUIS_TARBALL}"
# Measured from the downloaded tarball, 2026-10-01; it equals the digest
# GitHub lists for the release asset. If this stops matching, the build stops:
# a changed checksum means the source is not the source this project reviewed.
LIBLOUIS_SHA256="629fa8cb0dfd9ad457c5bf47a42f0953b673e62c8ad6b1d03ddc4e2bd20008f1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/build/liblouis"
SRC_NAME="liblouis-${LIBLOUIS_VERSION}"
NATIVE_SRC="${WORK}/native/${SRC_NAME}"
WASM_SRC="${WORK}/wasm/${SRC_NAME}"
OUT="${ROOT}/public/wasm/liblouis"
LOADER_OUT="${ROOT}/vendor/liblouis"

for tool in emcc emconfigure emmake cc make node; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} is not on PATH." >&2
    echo "Run the 'Build liblouis wasm' GitHub Actions workflow instead, or" >&2
    echo "activate an emsdk environment and install a C compiler, make and Node." >&2
    exit 1
  fi
done

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

mkdir -p "${WORK}" "${OUT}" "${LOADER_OUT}"

# ── 1. Fetch and verify ──────────────────────────────────────────────────────
if [ ! -f "${WORK}/${LIBLOUIS_TARBALL}" ]; then
  echo "Downloading ${LIBLOUIS_URL}"
  curl -fsSL --retry 3 -o "${WORK}/${LIBLOUIS_TARBALL}" "${LIBLOUIS_URL}"
fi

ACTUAL_SHA="$(sha256_of "${WORK}/${LIBLOUIS_TARBALL}")"
if [ "${ACTUAL_SHA}" != "${LIBLOUIS_SHA256}" ]; then
  echo "Checksum mismatch for ${LIBLOUIS_TARBALL}" >&2
  echo "  expected ${LIBLOUIS_SHA256}" >&2
  echo "  got      ${ACTUAL_SHA}" >&2
  rm -f "${WORK}/${LIBLOUIS_TARBALL}"
  exit 1
fi
echo "sha256 ${ACTUAL_SHA} matches the pinned value."

rm -rf "${WORK}/native" "${WORK}/wasm"
mkdir -p "${WORK}/native" "${WORK}/wasm"
tar -xzf "${WORK}/${LIBLOUIS_TARBALL}" -C "${WORK}/native"
tar -xzf "${WORK}/${LIBLOUIS_TARBALL}" -C "${WORK}/wasm"

# The upstream license text travels with the wasm, unmodified.
cp "${NATIVE_SRC}/COPYING.LESSER" "${OUT}/COPYING.LESSER.liblouis"

# --enable-ucs4 makes a character 32 bits wide, so no Unicode character has to
# be split before liblouis sees it. --without-yaml leaves out a test-only
# library that configure would otherwise add to every link when it finds one.
CONFIGURE_FLAGS=(--enable-ucs4 --disable-shared --without-yaml)
# Emscripten's programs run in a JavaScript engine, not on this machine, so
# configure has to be told that the wasm build is a cross build.
WASM_CONFIGURE_FLAGS=("${CONFIGURE_FLAGS[@]}" --host=wasm32-unknown-emscripten)

# ── 2. Native reference ──────────────────────────────────────────────────────
# lou_translate links the library, the tools' own gnulib and a small check
# library; the first two are built in their directories before the tool.
(
  cd "${NATIVE_SRC}"
  ./configure "${CONFIGURE_FLAGS[@]}"
  make -C gnulib
  make -C liblouis
  make -C tools/gnulib
  make -C tools lou_translate
)
NATIVE_TOOL="${NATIVE_SRC}/tools/lou_translate"
# --version begins with the tool's own path; only its name is kept, so the
# README reads the same whichever machine built it.
NATIVE_VERSION="$("${NATIVE_TOOL}" --version | head -1 | sed 's#^.*/##')"
echo "Native reference: ${NATIVE_VERSION}"

# ── 3. WebAssembly ───────────────────────────────────────────────────────────
(
  cd "${WASM_SRC}"
  emconfigure ./configure "${WASM_CONFIGURE_FLAGS[@]}"
  emmake make -C gnulib
  emmake make -C liblouis
)

# The library's own link line adds gnulib's convenience library; libtool also
# folds it into liblouis.a, so the second archive only fills what the first
# does not.
LINK_INPUTS=("${WASM_SRC}/liblouis/.libs/liblouis.a")
if [ -f "${WASM_SRC}/gnulib/.libs/libgnu.a" ]; then
  LINK_INPUTS+=("${WASM_SRC}/gnulib/.libs/libgnu.a")
fi

# The same settings as the Potrace build, for the same reasons (a module
# worker imports it, the deployed CSP forbids eval, tests load the shipped
# file in Node), except that liblouis reads its tables through a file system,
# so the file system stays in. liblouis also compiles a table with several
# 8 KB character buffers on the stack, nesting a frame for every table it
# includes, and Emscripten's default 64 KB stack faults on the English
# tables; 5 MB is the stack Emscripten gave every module before it made the
# default smaller.
EMCC_FLAGS=(
  -O2
  --no-entry
  -s STACK_SIZE=5242880
  -s MODULARIZE=1
  -s EXPORT_ES6=1
  -s EXPORT_NAME=createLiblouis
  -s ENVIRONMENT=web,worker,node
  -s DYNAMIC_EXECUTION=0
  -s ALLOW_MEMORY_GROWTH=1
  -s INVOKE_RUN=0
  -s ASSERTIONS=0
  -s EXPORTED_FUNCTIONS=_lou_version,_lou_charSize,_lou_translate,_lou_backTranslateString,_lou_checkTable,_lou_free,_malloc,_free
  -s EXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAPU32,HEAP32,UTF8ToString,stringToUTF8,lengthBytesUTF8
)

echo "Linking with $(emcc --version | head -1)"
emcc "${LINK_INPUTS[@]}" "${EMCC_FLAGS[@]}" -o "${LOADER_OUT}/liblouis.mjs"
mv "${LOADER_OUT}/liblouis.wasm" "${OUT}/liblouis.wasm"

# ── 4. Smoke check: the shipped files, loaded the way a test would ──────────
# Beyond the version, the module has to compile the two tables the app offers:
# a build can report the right version and still fault on a real table.
SMOKE_LINE="$(node --input-type=module -e "
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [loader, wasm, tables] = process.argv.slice(1);
const { default: createLiblouis } = await import(pathToFileURL(loader).href);
const mod = await createLiblouis({ locateFile: () => wasm });
mod.FS.mkdir('/tables');
for (const name of readdirSync(tables)) {
  const file = path.join(tables, name);
  if (statSync(file).isFile()) mod.FS.writeFile('/tables/' + name, readFileSync(file));
}
const compiles = (table) => {
  const list = '/tables/unicode.dis,/tables/' + table;
  const size = mod.lengthBytesUTF8(list) + 1;
  const ptr = mod._malloc(size);
  mod.stringToUTF8(list, ptr, size);
  try {
    return mod._lou_checkTable(ptr) === 1 ? 'yes' : 'no';
  } catch (error) {
    console.error(table + ': ' + error.message);
    return 'fault';
  } finally {
    mod._free(ptr);
  }
};
console.log('SMOKE ' + mod.UTF8ToString(mod._lou_version()) + ' ' + mod._lou_charSize() + ' ' + compiles('en-ueb-g1.ctb') + ' ' + compiles('en-ueb-g2.ctb'));
" "${LOADER_OUT}/liblouis.mjs" "${OUT}/liblouis.wasm" "${WASM_SRC}/tables" | grep '^SMOKE ' || true)"
read -r _ LOU_VERSION LOU_CHARSIZE G1_COMPILES G2_COMPILES <<< "${SMOKE_LINE:-SMOKE none none none none}"
echo "Built module: lou_version ${LOU_VERSION}, lou_charSize ${LOU_CHARSIZE}, en-ueb-g1.ctb compiles: ${G1_COMPILES}, en-ueb-g2.ctb compiles: ${G2_COMPILES}"
if [ "${LOU_VERSION}" != "${LIBLOUIS_VERSION}" ] || [ "${LOU_CHARSIZE}" != "4" ] ||
  [ "${G1_COMPILES}" != "yes" ] || [ "${G2_COMPILES}" != "yes" ]; then
  echo "The built module must report ${LIBLOUIS_VERSION} and a character size of 4, and compile both tables." >&2
  exit 1
fi

# ── 5. Measure and record ────────────────────────────────────────────────────
size_of() { wc -c < "$1" | tr -d ' '; }
gzip_size_of() { gzip -9 -c "$1" | wc -c | tr -d ' '; }

WASM_RAW="$(size_of "${OUT}/liblouis.wasm")"
WASM_GZ="$(gzip_size_of "${OUT}/liblouis.wasm")"
JS_RAW="$(size_of "${LOADER_OUT}/liblouis.mjs")"
JS_GZ="$(gzip_size_of "${LOADER_OUT}/liblouis.mjs")"
EMCC_VERSION="$(emcc --version | head -1)"
LINK_RECORDED="${LINK_INPUTS[*]//${WASM_SRC}\//}"

cat > "${OUT}/README.txt" <<README
liblouis, compiled to WebAssembly for OpenSCAD Assistive Forge.

Everything in this folder is build output, and so is vendor/liblouis/liblouis.mjs
beside it. Do not edit any of it by hand: rerun scripts/build-liblouis-wasm.sh,
or the "Build liblouis wasm" GitHub Actions workflow, and commit what comes out.

The loader lives apart from the binary because it is JavaScript and a bundler
has to treat it as code, while the binary keeps a stable address so the
checksum below can be checked against the file actually served.

Source
  ${LIBLOUIS_URL}
  sha256 ${LIBLOUIS_SHA256}
  liblouis ${LIBLOUIS_VERSION}, compiled unmodified
  Configured with: ${WASM_CONFIGURE_FLAGS[*]}
  Linked from: ${LINK_RECORDED}

License
  The liblouis library and its translation tables: GNU Lesser General Public
  License, version 2.1 or (at your option) any later version, as granted in
  the upstream README and in each table's header. The full text is beside this
  file as COPYING.LESSER.liblouis. The liblouis command line tools are
  GPL-3.0-or-later, and none of them is shipped. Forge is GPL-3.0-or-later,
  which that grant permits.

Built with
  ${EMCC_VERSION}
  ${EMCC_FLAGS[*]}

Checked when built
  lou_version() ${LOU_VERSION}, lou_charSize() ${LOU_CHARSIZE}
  en-ueb-g1.ctb compiles: ${G1_COMPILES}, en-ueb-g2.ctb compiles: ${G2_COMPILES}
  The native build of the same tarball reports: ${NATIVE_VERSION}

Size, as built
  public/wasm/liblouis/liblouis.wasm  ${WASM_RAW} bytes raw, ${WASM_GZ} gzipped
  vendor/liblouis/liblouis.mjs        ${JS_RAW} bytes raw, ${JS_GZ} gzipped

Getting the source
  The tarball above is the complete corresponding source for the liblouis
  part of this build. Every release is also published at
  https://github.com/liblouis/liblouis/releases, and the project will supply
  a copy on request.
README

echo
echo "Built:"
echo "  ${OUT}/liblouis.wasm        ${WASM_RAW} bytes raw, ${WASM_GZ} gzipped"
echo "  ${LOADER_OUT}/liblouis.mjs  ${JS_RAW} bytes raw, ${JS_GZ} gzipped"
echo "  ${NATIVE_TOOL}  (reference, not shipped)"
