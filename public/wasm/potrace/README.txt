Potrace, compiled to WebAssembly for OpenSCAD Assistive Forge.

Everything in this folder is build output. Do not edit it by hand: rerun
scripts/build-potrace-wasm.sh, or the "Build Potrace wasm" GitHub Actions
workflow, and commit what comes out.

Source
  https://potrace.sourceforge.net/download/1.16/potrace-1.16.tar.gz
  sha256 be8248a17dedd6ccbaab2fcc45835bb0502d062e40fbded3bc56028ce5eb7acc
  Potrace 1.16, Copyright (C) 2001-2019 Peter Selinger
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
  emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.9 (4e4223852a0835923411059a3929907d7df1232e)
  -O3 -DHAVE_CONFIG_H -I build/potrace/potrace-1.16/src --no-entry -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createPotrace -s ENVIRONMENT=web,worker,node -s FILESYSTEM=0 -s DYNAMIC_EXECUTION=0 -s ALLOW_MEMORY_GROWTH=1 -s INVOKE_RUN=0 -s ASSERTIONS=0 -s EXPORTED_FUNCTIONS=_potrace_trace_to_path,_potrace_free_result,_potrace_build_version,_malloc,_free -s EXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString

Size, as built
  potrace.wasm  41705 bytes raw, 18357 bytes gzipped
  potrace.mjs   8186 bytes raw, 2890 bytes gzipped

Getting the source
  The tarball above is the complete corresponding source for the potrace part
  of this build. It is also mirrored at https://potrace.sourceforge.net/ and
  the project will supply a copy on request.
