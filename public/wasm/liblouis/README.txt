liblouis, compiled to WebAssembly for OpenSCAD Assistive Forge.

Everything in this folder is build output, and so is vendor/liblouis/liblouis.mjs
beside it. Do not edit any of it by hand: rerun scripts/build-liblouis-wasm.sh,
or the "Build liblouis wasm" GitHub Actions workflow, and commit what comes out.

The loader lives apart from the binary because it is JavaScript and a bundler
has to treat it as code, while the binary keeps a stable address so the
checksum below can be checked against the file actually served.

Source
  https://github.com/liblouis/liblouis/releases/download/v3.39.0/liblouis-3.39.0.tar.gz
  sha256 629fa8cb0dfd9ad457c5bf47a42f0953b673e62c8ad6b1d03ddc4e2bd20008f1
  liblouis 3.39.0, compiled unmodified
  Configured with: --enable-ucs4 --disable-shared --without-yaml --host=wasm32-unknown-emscripten
  Linked from: liblouis/.libs/liblouis.a gnulib/.libs/libgnu.a

License
  The liblouis library and its translation tables: GNU Lesser General Public
  License, version 2.1 or (at your option) any later version, as granted in
  the upstream README and in each table's header. The full text is beside this
  file as COPYING.LESSER.liblouis. The liblouis command line tools are
  GPL-3.0-or-later, and none of them is shipped. Forge is GPL-3.0-or-later,
  which that grant permits.

Built with
  emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.9 (4e4223852a0835923411059a3929907d7df1232e)
  -O2 --no-entry -s STACK_SIZE=5242880 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createLiblouis -s ENVIRONMENT=web,worker,node -s DYNAMIC_EXECUTION=0 -s ALLOW_MEMORY_GROWTH=1 -s INVOKE_RUN=0 -s ASSERTIONS=0 -s EXPORTED_FUNCTIONS=_lou_version,_lou_charSize,_lou_translate,_lou_backTranslateString,_lou_checkTable,_lou_free,_malloc,_free -s EXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAPU32,HEAP32,UTF8ToString,stringToUTF8,lengthBytesUTF8

Checked when built
  lou_version() 3.39.0, lou_charSize() 4
  en-ueb-g1.ctb compiles: yes, en-ueb-g2.ctb compiles: yes
  The native build of the same tarball reports: lou_translate (Liblouis) 3.39.0

Size, as built
  public/wasm/liblouis/liblouis.wasm  164567 bytes raw, 64047 gzipped
  vendor/liblouis/liblouis.mjs        69526 bytes raw, 18647 gzipped

Getting the source
  The tarball above is the complete corresponding source for the liblouis
  part of this build. Every release is also published at
  https://github.com/liblouis/liblouis/releases, and the project will supply
  a copy on request.
