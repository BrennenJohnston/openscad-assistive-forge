/*
 * Forge's glue around potracelib.
 *
 * Potrace is a C library that turns a bitmap into curves. This file is the only
 * thing between it and the browser: it takes the ink mask Forge's own
 * extractInk already produces, hands it to potrace, and returns SVG path data.
 *
 * Everything Forge already knows how to do - deciding what counts as ink,
 * scaling a picture down, classifying shapes - stays in JavaScript where it is
 * tested. This does one thing.
 *
 * The bitmap
 *
 * Potrace wants potrace_word-sized chunks, most significant bit leftmost, dy
 * words per row, and row 0 at the BOTTOM: its own readers flip a picture on the
 * way in (gm_flip) and its SVG backend flips it back on the way out (a negative
 * y scale). Forge hands over one byte per pixel with row 0 at the top, so this
 * does both halves of that same pair - flip in bitmap_from_bytes, flip back in
 * sb_point - and the path data that comes out is in the same coordinates
 * potrace itself would have written.
 *
 * The output
 *
 * Potrace returns a flat list of closed curves, each an outer boundary or a
 * hole inside one, and they never overlap. Concatenated into a single path and
 * filled EVEN-ODD, that list is the drawing: a hole sits inside one boundary so
 * it counts even and stays empty, and an island inside a hole counts odd and
 * fills. That is the shape the rest of Forge already works in - one `d` string
 * per drawing, even-odd - so nothing downstream has to learn a new convention.
 *
 * A segment is either CURVETO (a cubic through c[0] and c[1] to c[2]) or CORNER
 * (a line to c[1], then a line to c[2]). The curve starts at the last segment's
 * end point, which is what closes the loop. This matches svg_path() in
 * potrace's own backend_svg.c.
 *
 * @license GPL-2.0-or-later
 *
 * Potrace is Copyright (C) 2001-2019 Peter Selinger and is used here under the
 * GNU General Public License, version 2 or (at your option) any later version.
 * Forge is GPL-3.0-or-later, which that grant permits. The unmodified upstream
 * source and its checksum are named in public/wasm/potrace/README.txt.
 */

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "potracelib.h"

#define WORD_BITS (8 * sizeof(potrace_word))

/* Three decimals is about a thousandth of a pixel - far below anything a
   printed charm can express, and it keeps the path data from growing for no
   gain. */
#define COORD_DECIMALS 3

/* A string that grows, so the path data can be built without guessing its size
   first. A photograph can produce tens of thousands of segments. */
typedef struct {
  char *data;
  size_t len;
  size_t cap;
  int failed;
} strbuf;

static void sb_reserve(strbuf *sb, size_t extra) {
  if (sb->failed) return;
  if (sb->len + extra + 1 <= sb->cap) return;
  size_t want = sb->cap ? sb->cap : 4096;
  while (want < sb->len + extra + 1) want *= 2;
  char *grown = (char *)realloc(sb->data, want);
  if (!grown) {
    sb->failed = 1;
    return;
  }
  sb->data = grown;
  sb->cap = want;
}

static void sb_puts(strbuf *sb, const char *text) {
  size_t n = strlen(text);
  sb_reserve(sb, n);
  if (sb->failed) return;
  memcpy(sb->data + sb->len, text, n);
  sb->len += n;
  sb->data[sb->len] = '\0';
}

/* printf's %g switches to exponent notation on small values, which an SVG
   parser is not obliged to accept, so this formats fixed and trims the zeros
   itself. */
static void sb_num(strbuf *sb, double value) {
  char tmp[64];
  snprintf(tmp, sizeof(tmp), "%.*f", COORD_DECIMALS, value);
  char *dot = strchr(tmp, '.');
  if (dot) {
    char *end = tmp + strlen(tmp) - 1;
    while (end > dot && *end == '0') *end-- = '\0';
    if (end == dot) *end = '\0';
  }
  if (strcmp(tmp, "-0") == 0) strcpy(tmp, "0");
  sb_puts(sb, tmp);
}

static void sb_point(strbuf *sb, potrace_dpoint_t p, int height) {
  sb_num(sb, p.x);
  sb_puts(sb, " ");
  sb_num(sb, (double)height - p.y);
}

/* Pack Forge's one-byte-per-pixel mask into potrace's bitmap, putting the top
   row of the picture at the top of potrace's upside-down world. */
static potrace_bitmap_t *bitmap_from_bytes(const unsigned char *bytes, int w,
                                           int h) {
  if (w <= 0 || h <= 0) return NULL;
  potrace_bitmap_t *bm = (potrace_bitmap_t *)malloc(sizeof(potrace_bitmap_t));
  if (!bm) return NULL;

  int dy = (w + (int)WORD_BITS - 1) / (int)WORD_BITS;
  bm->w = w;
  bm->h = h;
  bm->dy = dy;
  bm->map = (potrace_word *)calloc((size_t)dy * (size_t)h, sizeof(potrace_word));
  if (!bm->map) {
    free(bm);
    return NULL;
  }

  for (int y = 0; y < h; y++) {
    const unsigned char *src = bytes + (size_t)y * (size_t)w;
    potrace_word *dst = bm->map + (size_t)(h - 1 - y) * (size_t)dy;
    for (int x = 0; x < w; x++) {
      if (src[x]) {
        dst[x / (int)WORD_BITS] |=
            ((potrace_word)1) << (WORD_BITS - 1 - (x % WORD_BITS));
      }
    }
  }
  return bm;
}

static void bitmap_free(potrace_bitmap_t *bm) {
  if (!bm) return;
  free(bm->map);
  free(bm);
}

static void append_curve(strbuf *sb, const potrace_curve_t *curve, int height) {
  int n = curve->n;
  if (n <= 0) return;

  sb_puts(sb, "M");
  sb_point(sb, curve->c[n - 1][2], height);

  for (int i = 0; i < n; i++) {
    if (curve->tag[i] == POTRACE_CURVETO) {
      sb_puts(sb, "C");
      sb_point(sb, curve->c[i][0], height);
      sb_puts(sb, " ");
      sb_point(sb, curve->c[i][1], height);
      sb_puts(sb, " ");
      sb_point(sb, curve->c[i][2], height);
    } else {
      /* POTRACE_CORNER: a corner is two straight lines, and c[0] is unused. */
      sb_puts(sb, "L");
      sb_point(sb, curve->c[i][1], height);
      sb_puts(sb, "L");
      sb_point(sb, curve->c[i][2], height);
    }
  }
  sb_puts(sb, "Z");
}

/**
 * Trace a mask and return SVG path data, to be filled even-odd.
 *
 * The caller owns the string and frees it with potrace_free_result. NULL means
 * the trace could not run; an empty string means it ran and found no ink, which
 * is a different answer and the caller can tell them apart.
 *
 * bytes        one byte per pixel, non-zero is ink, row 0 at the top
 * turdsize     ignore any region smaller than this many pixels (potrace: 2)
 * turnpolicy   how an ambiguous turn is resolved (potrace: 4, MINORITY)
 * alphamax     corner threshold, 0 makes every corner sharp (potrace: 1.0)
 * opttolerance curve optimisation tolerance (potrace: 0.2)
 */
EMSCRIPTEN_KEEPALIVE
char *potrace_trace_to_path(const unsigned char *bytes, int width, int height,
                            int turdsize, int turnpolicy, double alphamax,
                            double opttolerance) {
  potrace_bitmap_t *bm = bitmap_from_bytes(bytes, width, height);
  if (!bm) return NULL;

  potrace_param_t *param = potrace_param_default();
  if (!param) {
    bitmap_free(bm);
    return NULL;
  }
  param->turdsize = turdsize;
  param->turnpolicy = turnpolicy;
  param->alphamax = alphamax;
  param->opttolerance = opttolerance;

  potrace_state_t *state = potrace_trace(param, bm);
  potrace_param_free(param);
  /* potrace traces a duplicate of the bitmap, so this can go now, exactly as it
     does in potrace's own main.c. */
  bitmap_free(bm);

  if (!state || state->status != POTRACE_STATUS_OK) {
    if (state) potrace_state_free(state);
    return NULL;
  }

  strbuf sb = {NULL, 0, 0, 0};
  sb_reserve(&sb, 4096);
  if (sb.failed) {
    potrace_state_free(state);
    return NULL;
  }
  sb.data[0] = '\0';

  for (potrace_path_t *p = state->plist; p != NULL; p = p->next) {
    append_curve(&sb, &p->curve, height);
    if (sb.failed) break;
  }

  potrace_state_free(state);

  if (sb.failed) {
    free(sb.data);
    return NULL;
  }
  return sb.data;
}

/** Release a string returned by potrace_trace_to_path. */
EMSCRIPTEN_KEEPALIVE
void potrace_free_result(char *result) { free(result); }

/** The potrace this was built from, for the notice beside the wasm. */
EMSCRIPTEN_KEEPALIVE
const char *potrace_build_version(void) { return potrace_version(); }
