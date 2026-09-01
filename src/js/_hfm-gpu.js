/**
 * @license GPL-3.0-or-later
 */
// GPU glyph pick for the alternate ASCII view (CW-32).
//
// The converter's cost is not the picture, it is the arithmetic: sixteen
// luminance taps, two contrast curves and a nearest-glyph search, per cell,
// on the CPU, about 140,000 times a frame at the smallest character size.
// Measured under a 4x CPU throttle that loop is 64% of a conversion. Every
// step of it is per-cell and independent of every other cell, which is the
// definition of work a fragment shader should be doing.
//
// So this renders the scene into a texture and then draws ONE quad at
// character-grid resolution. Each fragment is one cell: it takes the same
// sixteen taps, applies the same two contrast curves, searches the same glyph
// vectors, and writes the winning glyph id into the red channel. The CPU
// reads back one small image and paints it with the existing composite path,
// unchanged.
//
// WHAT IS DELIBERATELY LEFT ON THE CPU
//   Intensity and reverse video are per-cell SELECTORS that read the cell's
//   pre-contrast brightness, so the shader writes that brightness into the
//   blue channel and the CPU keeps choosing atlases exactly as it did. The
//   paint path never learns that anything changed.
//
// EVERY FAILURE FALLS BACK, PERMANENTLY
//   No WebGL2, a missing float texture, a shader that will not compile, a
//   readback that throws: any of them disables this pass for the rest of the
//   session and the CPU path carries on. The CPU path is not a legacy branch
//   kept for tidiness - it is the only path on WebGL1, and the Firefox and
//   WebKit CI lanes exercise it on every run.
//
// The technique is the one Adam Sawicki describes for pixel-shader ASCII
// (per-cell luminance to a glyph pick on the GPU); the per-class vocabularies
// and the 6-D shape vector are this project's own, and no code was copied.

import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  GLSL3,
  Mesh,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RedFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
} from 'three';

/**
 * The tap layout, the contrast curves and the search, ported from _hfm.js.
 *
 * Every constant here has a twin in the CPU path and the two must not drift:
 *   _getSixSamplePoints      -> uInternal
 *   _getExternalSamplePoints -> uExternal
 *   _EXT_AFFECTING           -> EXT_AFFECTING below
 *   _relLum01                -> lumOf
 *   _applyDirectionalContrast/_applyCellContrast -> the two loops in main
 * A unit test pins the numbers on both sides against each other.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uScene;      // the rendered frame, at sample resolution
uniform sampler2D uGlyphs;     // glyph shape vectors, 2 texels per glyph
uniform sampler2D uClass;      // one surface class per cell, red channel
uniform sampler2D uVocab;      // per-class glyph id lists, red channel
uniform vec2 uSourceSize;      // the scene target, at FULL render resolution
uniform vec2 uSampleSize;      // the sample grid the CPU path would have read
uniform float uScale;          // sample size / source size
uniform float uBox;            // source texels per sample pixel, when whole
uniform vec2 uCellSize;        // cell size in sample texels
uniform vec2 uGridSize;        // cols, rows
uniform vec2 uInternal[6];     // internal tap offsets, cell-local, top-down
uniform vec2 uExternal[10];    // external tap offsets, cell-local, top-down
uniform float uContrastExp;
uniform float uDirContrastExp;
uniform float uInvert;
uniform float uEncodeSrgb;
uniform float uVocabWidth;
uniform float uUseClasses;
uniform float uHasClass;
uniform float uUsePalette;
uniform float uPaletteCount;
uniform float uChromaBoost;
uniform vec3 uPalette[16];
uniform float uReverseAt;
uniform float uSpaceIndex;
uniform float uSparsestNonSpace;
// CW-91: anchored glyphs, on the GPU at last. uLadder is one row per class and
// one texel per field step, holding glyph id + 1 so that 0 can keep meaning
// "this class has no ladder". The field step itself is NOT a new upload: the
// class pass has always written it into the GREEN channel of the very texture
// bound as uClass (city-class-pass.js's fragment shader, gl_FragColor.g), and
// this pass simply never read it. CW-86 believed the byte could only reach the
// CPU and forced the CPU path for anchoring, which halved the frame rate and is
// the only reason anchoring shipped off.
uniform sampler2D uLadder;
uniform float uAnchored;
uniform float uFieldLevels;
// CW-92: the authored palette family per surface class, -1 where a class has
// none. The city is achromatic - every material white or neutral grey, both
// lights white, the fog black - so there is no surface colour to read and the
// per-frame nearest-palette match was manufacturing a hue out of the last
// digit or two of a grey image. That is what flipped a whole face between two
// entries as the camera moved. See hc-palettes.js CITY_INK_FAMILY.
uniform float uInkFamily[16];
uniform float uHasInkFamily;
// CW-68 temporal hysteresis. uPrev is the PREVIOUS conversion's own output
// target, bound as a texture (the two targets ping-pong), so the memory costs
// no upload and no readback of its own: R the glyph, G the class or palette
// index, B the cell luminance, A the hold counter and the reverse flag packed
// as hold * 2 + reversed. Bands of zero, or uHasPrev of zero on the first
// frame after a reallocation, make every expression below the stateless one.
// The rules are src/js/_hfm-hysteresis.js; this is the same arithmetic in GLSL
// and the two must be changed together.
// CW-71 the palette-mode ink budget: an absolute-luminance floor below which
// the cell draws nothing, and a gate on the white entry. uWhiteIndex is -1
// when the palette has no white. The rules are src/js/_hfm-paint.js.
uniform float uInkFloor;
uniform float uWhiteLum;
uniform float uWhiteChroma;
uniform float uWhiteIndex;
uniform sampler2D uPrev;
uniform float uHasPrev;
uniform float uGlyphBand;
uniform float uReverseBand;
uniform float uHoldFrames;
// Per class: where its glyph list starts in uVocab and how long it is. Index
// 0 is the fallback used by any cell whose class has no vocabulary.
uniform vec2 uVocabSpan[16];

out vec4 fragColor;

// Which external taps bound each internal one. Flattened from _EXT_AFFECTING:
// four entries per internal point, -1 padding where a row is shorter.
const int EXT_AFFECTING[24] = int[24](
  0, 1, 2, 4,
  0, 1, 3, 5,
  2, 4, 6, -1,
  3, 5, 7, -1,
  4, 6, 8, 9,
  5, 7, 8, 9
);

/**
 * A render target receives LINEAR light; the canvas the CPU path samples has
 * been through the renderer's output encoding. Sampling the target raw makes
 * every mid tone darker than the CPU sees, and the faintest detail - the
 * dither on the road - drops below the darkest glyph and disappears
 * altogether. So the same encoding is applied here before anything reads a
 * brightness. uEncodeSrgb is 0 when the renderer is already writing encoded
 * values, which is why it is a uniform and not a constant.
 */
vec3 encodeOutput(vec3 c) {
  if (uEncodeSrgb < 0.5) return c;
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

/**
 * One tap, read the way the CPU path reads it.
 *
 * The CPU downscales the rendered frame to at most half size with a bilinear
 * drawImage and then point-samples THAT. So the value a tap wants is not one
 * source pixel, it is the average of the block the downscale would have
 * collapsed. Sampling the full-resolution target with linear filtering at the
 * centre of that block gives exactly the same number when the ratio is two,
 * which is every character size at or below the eight-pixel cell where the
 * scale clamps - the whole range the small-character work is about.
 *
 * Reading it this way rather than rendering at sample size is deliberate:
 * CW-31 measured that rendering smaller saves nothing here, and it costs the
 * antialiasing the downscale was quietly providing.
 *
 * Internal taps clamp to the edge of the sample grid, external taps read as
 * zero outside it - the same asymmetry the CPU has.
 */
vec3 tapAt(vec2 posTopDown, bool clampInside, out bool inside) {
  vec2 p = floor(posTopDown + 0.5);
  inside = p.x >= 0.0 && p.x < uSampleSize.x && p.y >= 0.0 && p.y < uSampleSize.y;
  if (!clampInside && !inside) return vec3(0.0);
  vec2 c = clamp(p, vec2(0.0), uSampleSize - 1.0);
  // Where that sample pixel's block sits in the full-resolution frame, and
  // then in texture coordinates - flipped, because the target's row 0 is the
  // bottom and the grid counts rows from the top.
  vec3 rgb;
  if (uBox > 1.5) {
    // The exact case, and the one the small characters live in: the sample
    // grid is half the frame, so the block is 2x2 and can be averaged
    // outright. It is averaged AFTER encoding, because that is the order the
    // CPU path does it in - drawImage averages the canvas's already-encoded
    // bytes. Encoding after averaging instead leaves about a tenth of the
    // frame on a different glyph (measured).
    ivec2 o = ivec2(int(c.x) * 2, int(c.y) * 2);
    rgb = vec3(0.0);
    for (int dy = 0; dy < 2; dy++) {
      for (int dx = 0; dx < 2; dx++) {
        int sx = min(o.x + dx, int(uSourceSize.x) - 1);
        int syTop = min(o.y + dy, int(uSourceSize.y) - 1);
        ivec2 texel = ivec2(sx, int(uSourceSize.y) - 1 - syTop);
        rgb += encodeOutput(texelFetch(uScene, texel, 0).rgb);
      }
    }
    rgb *= 0.25;
  } else {
    // Any other ratio: one linearly filtered sample at the block's centre.
    // Close, not exact, and only reached at character sizes far above the
    // floor where CW-31 measured the sampling difference to be invisible.
    vec2 srcTopDown = (c + 0.5) / uScale;
    vec2 uv = vec2(
      srcTopDown.x / uSourceSize.x,
      1.0 - srcTopDown.y / uSourceSize.y
    );
    rgb = encodeOutput(texture(uScene, uv).rgb);
  }
  return rgb;
}

/** The 0-1 brightness a tap contributes, inverted for light backgrounds. */
float tapLum(vec3 rgb) {
  float l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return clamp(uInvert > 0.5 ? 1.0 - l : l, 0.0, 1.0);
}

void main() {
  // Row 0 of the output is the bottom row of the target; the character grid
  // counts from the top.
  float col = floor(gl_FragCoord.x);
  float row = uGridSize.y - 1.0 - floor(gl_FragCoord.y);
  vec2 base = vec2(col * uCellSize.x, row * uCellSize.y);

  float v[6];
  float cellLum = 0.0;
  vec3 sumRgb = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    bool inside;
    vec3 rgb = tapAt(base + uInternal[i], true, inside);
    v[i] = tapLum(rgb);
    cellLum += v[i];
    sumRgb += rgb;
  }
  cellLum /= 6.0;

  float ext[10];
  for (int i = 0; i < 10; i++) {
    bool inside;
    ext[i] = tapLum(tapAt(base + uExternal[i], false, inside));
  }

  // Directional contrast: normalise each component to the brightest external
  // tap that bounds it, sharpen, scale back.
  for (int i = 0; i < 6; i++) {
    float maxExt = v[i];
    for (int j = 0; j < 4; j++) {
      int e = EXT_AFFECTING[i * 4 + j];
      if (e < 0) continue;
      float value = ext[e];
      if (value > maxExt) maxExt = value;
    }
    if (maxExt > v[i] && maxExt > 0.01) {
      float enhanced = pow(v[i] / maxExt, uDirContrastExp);
      v[i] = clamp(enhanced * maxExt, 0.0, 1.0);
    }
  }

  // Cell contrast: max-normalise then sharpen.
  float cellMax = 0.0;
  for (int i = 0; i < 6; i++) cellMax = max(cellMax, v[i]);
  if (cellMax > 0.0) {
    for (int i = 0; i < 6; i++) {
      v[i] = clamp(pow(v[i] / cellMax, uContrastExp) * cellMax, 0.0, 1.0);
    }
  }

  // CW-68: what this cell decided last time. Read before anything depends on
  // it so that the reverse flag, the vocabulary and the glyph all see one
  // consistent history.
  bool hasPrev = uHasPrev > 0.5;
  vec4 prev = hasPrev
    ? texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0)
    : vec4(0.0);
  float prevPacked = floor(prev.a * 255.0 + 0.5);
  bool prevReversed = mod(prevPacked, 2.0) >= 0.5;
  float prevHold = floor(prevPacked * 0.5);
  int prevGlyph = int(floor(prev.r * 255.0 + 0.5));
  float prevSecond = floor(prev.g * 255.0 + 0.5);

  // Reverse video, which the CPU applies after the contrast curves and
  // before the vocabulary: the brightest cells are painted as solid phosphor
  // with the glyph knocked out, so the cell is matched against the INVERTED
  // shape and always against the full vocabulary.
  bool reversed = (uReverseBand > 0.0 && hasPrev)
    ? (prevReversed
        ? cellLum >= uReverseAt - uReverseBand
        : cellLum >= uReverseAt + uReverseBand)
    : cellLum >= uReverseAt;
  if (reversed) {
    for (int i = 0; i < 6; i++) v[i] = 1.0 - v[i];
  }

  // Which vocabulary this cell may draw from - and, whether or not there are
  // vocabularies, which SURFACE it is, because CW-68's memory is dropped the
  // moment that changes.
  float classId = 0.0;
  int spanIndex = 0;
  if (uHasClass > 0.5) {
    classId = floor(
      texelFetch(uClass, ivec2(int(col), int(gl_FragCoord.y)), 0).r * 255.0 + 0.5
    );
    if (uUseClasses > 0.5 && !reversed) {
      spanIndex = int(classId) + 1;
      if (spanIndex > 15) spanIndex = 0;
    }
  }
  vec2 span = uVocabSpan[spanIndex];
  float start = span.x;
  float count = span.y;

  // ★★★ CW-91: THE GLYPH COMES FROM THE SURFACE, THE LIGHT STILL COMES FROM
  // THE SCREEN. The same contract the CPU path carries (_hfm.js, the anchored
  // branch), in the same order: everything decided from the lit cell above this
  // line - the reverse flag, the palette colour, the cell's luminance - stands
  // untouched, and all that changes is WHICH character carries it.
  //
  // A REVERSED CELL IS NEVER ANCHORED, exactly as on the CPU, where the reverse
  // branch returns before the anchored one is reached: a reverse cell is matched
  // against an inverted vector over the whole atlas, and a ladder step chosen
  // from the surface's own tone means nothing there.
  //
  // The field byte is step + 1; 0 means this surface has no field and the cell
  // keeps its screen pick, which is what the sky, the road and every unclassed
  // mesh read on every frame.
  float anchored = -1.0;
  if (uAnchored > 0.5 && uHasClass > 0.5 && !reversed) {
    float fieldByte = floor(
      texelFetch(uClass, ivec2(int(col), int(gl_FragCoord.y)), 0).g * 255.0 + 0.5
    );
    if (fieldByte > 0.5) {
      float step = min(fieldByte - 1.0, uFieldLevels - 1.0);
      float entry = floor(
        texelFetch(uLadder, ivec2(int(step), int(classId)), 0).r * 255.0 + 0.5
      );
      // 0 is "this class has no ladder", which is why the table holds id + 1.
      if (entry > 0.5) anchored = entry - 1.0;
    }
  }

  // Nearest glyph, searched exhaustively over that vocabulary. A class list
  // is a few dozen entries at most, which is nothing on a GPU and means no
  // quantized lookup table has to exist or be kept in step.
  int best = 0;
  float bestD = 1e9;
  if (anchored >= 0.0) {
    best = int(anchored);
  } else {
  for (int k = 0; k < 128; k++) {
    if (float(k) >= count) break;
    float slot = start + float(k);
    float gy = floor(slot / uVocabWidth);
    float gx = slot - gy * uVocabWidth;
    int glyph = int(
      floor(texelFetch(uVocab, ivec2(int(gx), int(gy)), 0).r * 255.0 + 0.5)
    );
    vec4 a = texelFetch(uGlyphs, ivec2(glyph, 0), 0);
    vec4 b = texelFetch(uGlyphs, ivec2(glyph, 1), 0);
    float d0 = v[0] - a.x;
    float d1 = v[1] - a.y;
    float d2 = v[2] - a.z;
    float d3 = v[3] - b.x;
    float d4 = v[4] - b.y;
    float d5 = v[5] - b.z;
    float d = d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5;
    if (d < bestD) {
      bestD = d;
      best = glyph;
    }
  }
  }

  // A reverse cell asks for the SPARSEST glyph it can get - the less is
  // punched out, the brighter the cell - but the painter treats space as a
  // blank, which would leave a hole exactly where the cell should be solid.
  if (reversed && best == int(uSpaceIndex)) best = int(uSparsestNonSpace);

  // CW-68: keep the previous glyph unless the new one is closer to this
  // frame's cell vector by more than the dead band. The memory is dropped
  // whenever the surface under the cell changed - its class moved, or its
  // reverse-video state flipped - because both of those also change which
  // glyphs the cell is allowed to draw, so a held glyph could be illegal as
  // well as wrong. That reset is the answer to CW-52's smearing objection.
  float hold = 0.0;
  float prevClassId = uUsePalette > 0.5
    ? floor(prevSecond / 16.0)
    : prevSecond;
  // CW-89 (D-125): and BLANK IS NEVER HELD, NOR DOES IT BLOCK INK. The CPU
  // rule is glyphWithMemory() in _hfm-hysteresis.js and this must stay the
  // same rule - if the two disagree, a cell is painted with one path's glyph
  // and the other's drive. The memory chooses between CHARACTERS; whether a
  // cell has content at all was decided before it, by the blank floor.
  // ★ AND AN ANCHORED CELL IS NEVER HELD (CW-86's contract, CW-91 on the GPU).
  // The memory exists to hide a re-roll; an anchored cell has nothing to hide,
  // and holding its glyph past the moment its surface slid to the next lattice
  // square is exactly the trail CW-84 cut. The CPU path expresses this by
  // skipping _remember entirely and writing hold 0; this is the same rule.
  bool keepable =
    hasPrev &&
    anchored < 0.0 &&
    uGlyphBand > 0.0 &&
    prevHold < uHoldFrames &&
    reversed == prevReversed &&
    best != int(uSpaceIndex) &&
    prevGlyph != int(uSpaceIndex) &&
    (uHasClass < 0.5 || prevClassId == classId);
  if (keepable && prevGlyph != best) {
    vec4 pa = texelFetch(uGlyphs, ivec2(prevGlyph, 0), 0);
    vec4 pb = texelFetch(uGlyphs, ivec2(prevGlyph, 1), 0);
    float e0 = v[0] - pa.x;
    float e1 = v[1] - pa.y;
    float e2 = v[2] - pa.z;
    float e3 = v[3] - pb.x;
    float e4 = v[4] - pb.y;
    float e5 = v[5] - pb.z;
    float prevD = e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3 + e4 * e4 + e5 * e5;
    if (prevD - bestD <= uGlyphBand) {
      best = prevGlyph;
      hold = min(prevHold + 1.0, 127.0);
    }
  }

  // Palette mode (CW-6) picks each cell's colour from its mean tint, in
  // chroma-normalised space. Ported from pickPaletteIndex; the index rides
  // in the green channel, which otherwise only carries a debug class byte.
  float second = classId;
  if (uUsePalette > 0.5) {
    vec3 mean = sumRgb / 6.0;
    float mx = max(mean.r, max(mean.g, mean.b));
    vec3 n = mx < 1e-6 ? vec3(0.0) : mean / mx;
    if (abs(uChromaBoost - 1.0) > 1e-6) n = pow(max(n, vec3(0.0)), vec3(uChromaBoost));
    // CW-71: how far from grey this cell is, in the same max-normalised
    // space the match works in. n's largest component is 1, so the smallest
    // one IS the distance from grey.
    float chroma = 1.0 - min(n.r, min(n.g, n.b));
    bool allowWhite =
      uWhiteLum <= 0.0 || (cellLum >= uWhiteLum && chroma < uWhiteChroma);
    int skipColour = allowWhite ? -1 : int(uWhiteIndex);
    int bestColour = 0;
    float bestColourD = 1e9;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= uPaletteCount) break;
      if (i == skipColour) continue;
      vec3 d = n - uPalette[i];
      float dist = dot(d, d);
      if (dist < bestColourD) {
        bestColourD = dist;
        bestColour = i;
      }
    }
    // ★★★ CW-92: THE FAMILY IS THE SURFACE'S, THE LIGHT IS THE SCREEN'S. The
    // ink budget and the white gate above are decided from the lit cell and
    // are untouched; all that changes is which entry a CLASSIFIED cell takes.
    // An unclassified cell - the sky, or anything the class pass could not
    // name - keeps the per-frame match, because it has no surface to belong
    // to. The same rule as the CPU path, which reads inkFamilies there.
    if (uHasInkFamily > 0.5 && uHasClass > 0.5) {
      float fam = uInkFamily[int(classId)];
      if (fam >= 0.0) bestColour = int(fam);
    }
    // Both in one byte: the palette index in the low nibble (at most 16
    // entries) and the surface class in the high one (at most 15). Without
    // this the memory would have no way to know a palette cell's class had
    // changed, and colour mode would smear where mono does not - measured
    // before it was fixed: 44 % of class changes kept their glyph with the
    // memory off, 87 % with it on.
    second = float(bestColour) + classId * 16.0;
  }

  // CW-71: below the floor the cell draws nothing at all, the way a mono cell
  // below the ladder's blank level does. Applied after the glyph search so the
  // memory and the class byte are still written from the real decision.
  if (uInkFloor > 0.0 && cellLum < uInkFloor) best = int(uSpaceIndex);

  // Alpha carries the memory forward: the hold counter and the reverse flag.
  // Blending is off for this material (three disables it for an opaque
  // NormalBlending material), so what is written here is what comes back.
  fragColor = vec4(
    float(best) / 255.0,
    second / 255.0,
    clamp(cellLum, 0.0, 1.0),
    (hold * 2.0 + (reversed ? 1.0 : 0.0)) / 255.0
  );
}
`;

const VERTEX_SHADER = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** How many classes uVocabSpan can carry, plus the fallback at index 0. */
export const MAX_CLASS_SPANS = 16;

/**
 * CW-91: the anchored ladders, flattened into one row per class id.
 *
 * Exported and pure for the same reason `buildVocabSpans` is: the shader
 * cannot run in the test environment, and this is the arithmetic that decides
 * which character an anchored cell draws.
 *
 * ★ EACH ENTRY IS `glyph id + 1`, so that 0 can mean "this class has no
 * ladder". A class that HAS one is perfectly entitled to a step whose answer is
 * the space, and the space is glyph 0 - storing the id raw would make those two
 * cases the same byte and every ground cell at the darkest step would fall back
 * to the screen pick instead of drawing the blank the surface asked for.
 *
 * @param {Map<number, ArrayLike<number>>|null} ladders class id -> step -> glyph
 * @param {number} levels how many steps a ladder has
 * @param {number} rows how many class rows the table carries
 * @returns {Uint8Array} `rows * levels` bytes, row-major by class id
 */
export function buildLadderTable(ladders, levels, rows = MAX_CLASS_SPANS) {
  const width = Math.max(1, levels);
  const data = new Uint8Array(width * rows);
  if (!ladders) return data;
  for (const [classId, ladder] of ladders) {
    if (!Number.isInteger(classId) || classId < 0 || classId >= rows) continue;
    if (!ladder) continue;
    for (let i = 0; i < width && i < ladder.length; i++) {
      const glyph = ladder[i];
      if (glyph >= 0 && glyph < 255) data[classId * width + i] = glyph + 1;
    }
  }
  return data;
}

/**
 * Flatten the vocabularies into one glyph-id list and the span table over it.
 *
 * Exported so the rule below can be unit-tested: the shader cannot run in the
 * test environment, and this is the arithmetic that decides which characters a
 * surface is allowed - the very thing CW-93 found the GPU path getting wrong.
 *
 * ★ A CLASS WITH NO VOCABULARY OF ITS OWN FALLS BACK TO THE FULL ATLAS. That
 * is what the CPU path does (`st.classLookups.get(cls) ?? st.lookup`) and what
 * city-class-pass.js promises in as many words: "an unclassified cell falls
 * back to the full glyph vocabulary it has always used". Without the fallback
 * such a cell reads a span of LENGTH ZERO, the shader's search loop never
 * runs, and the cell keeps the loop's initial answer - glyph 0, the space. It
 * draws nothing at all.
 *
 * Only SKY is in that position today (the vocabulary table starts at GROUND),
 * and a night sky is black, which is why it sat unseen. It stops being
 * invisible the moment the vocabularies reach palette mode, where far more of
 * the picture carries ink.
 *
 * @param {Array<{spanIndex: number, ids: ArrayLike<number>}>} vocabLists span
 *   0 first, carrying the full atlas; then one entry per class
 * @returns {{flat: number[], spans: Float32Array}} the packed ids, and
 *   `[start, length]` per span index
 */
export function buildVocabSpans(vocabLists) {
  const flat = [];
  const spans = new Float32Array(MAX_CLASS_SPANS * 2);
  for (const { spanIndex, ids } of vocabLists) {
    if (spanIndex >= MAX_CLASS_SPANS) continue;
    spans[spanIndex * 2] = flat.length;
    spans[spanIndex * 2 + 1] = ids.length;
    for (const id of ids) flat.push(id);
  }
  for (let i = 1; i < MAX_CLASS_SPANS; i++) {
    if (spans[i * 2 + 1] === 0) {
      spans[i * 2] = spans[0];
      spans[i * 2 + 1] = spans[1];
    }
  }
  return { flat, spans };
}

/**
 * Build the GPU glyph pass, or report that this machine cannot run it.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @returns {{
 *   available: boolean,
 *   reason: string,
 *   sample: (options: object) => {indices: Uint8Array, lum: Uint8Array,
 *     colors: Uint8Array, flags: Uint8Array}|null,
 *   dispose: () => void,
 * }}
 */
export function createGpuGlyphPass(renderer) {
  const gl = renderer?.getContext?.();
  const isWebGL2 =
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext;
  if (!isWebGL2) {
    return {
      available: false,
      reason: 'WebGL2 is required for the GPU glyph pass',
      sample: () => null,
      dispose: () => {},
    };
  }
  let sceneTarget = null;
  // CW-68: two pick targets, used alternately, so that the shader can read the
  // previous conversion's answers while it writes this one's. `historyValid`
  // is false until one full frame has been written into the pair, and is reset
  // by any reallocation - a stale target of the wrong size would be read as
  // somebody else's cells.
  const outTargets = [null, null];
  let outIndex = 0;
  let historyValid = false;
  let glyphTexture = null;
  let glyphKey = '';
  let vocabTexture = null;
  let vocabKey = '';
  let vocabSpans = null;
  let ladderTexture = null;
  let ladderKey = '';
  let pixels = null;
  let indices = null;
  let lumOut = null;
  let secondOut = null;
  let flagsOut = null;
  let failed = false;
  let failure = '';

  const quadScene = new Scene();
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uScene: { value: null },
      uGlyphs: { value: null },
      uClass: { value: null },
      uVocab: { value: null },
      uSourceSize: { value: [1, 1] },
      uSampleSize: { value: [1, 1] },
      uScale: { value: 0.5 },
      uBox: { value: 2 },
      uCellSize: { value: [1, 1] },
      uGridSize: { value: [1, 1] },
      // vec2 arrays reach three as FLAT float arrays, not arrays of pairs.
      uInternal: { value: new Float32Array(12) },
      uExternal: { value: new Float32Array(20) },
      uContrastExp: { value: 3.2 },
      uDirContrastExp: { value: 5.0 },
      uInvert: { value: 0 },
      uEncodeSrgb: { value: 0 },
      uVocabWidth: { value: 1 },
      uUseClasses: { value: 0 },
      uHasClass: { value: 0 },
      uUsePalette: { value: 0 },
      uPaletteCount: { value: 0 },
      uChromaBoost: { value: 1 },
      uPalette: { value: new Float32Array(48) },
      // Above every possible cell brightness, so reverse video is off unless
      // the caller sets a threshold.
      uReverseAt: { value: 2 },
      uSpaceIndex: { value: 0 },
      uSparsestNonSpace: { value: 0 },
      uVocabSpan: { value: new Float32Array(MAX_CLASS_SPANS * 2) },
      uPrev: { value: null },
      uHasPrev: { value: 0 },
      uGlyphBand: { value: 0 },
      uReverseBand: { value: 0 },
      uHoldFrames: { value: 0 },
      uInkFloor: { value: 0 },
      uWhiteLum: { value: 0 },
      uWhiteChroma: { value: 0 },
      uWhiteIndex: { value: -1 },
      uLadder: { value: null },
      uAnchored: { value: 0 },
      uFieldLevels: { value: 1 },
      uInkFamily: { value: new Float32Array(16).fill(-1) },
      uHasInkFamily: { value: 0 },
    },
  });
  quadScene.add(new Mesh(new PlaneGeometry(2, 2), material));

  const ensureSceneTarget = (width, height) => {
    if (
      sceneTarget &&
      sceneTarget.width === width &&
      sceneTarget.height === height &&
      sceneTarget.texture.colorSpace === NoColorSpace
    ) {
      return;
    }
    sceneTarget?.dispose();
    sceneTarget = new WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    // MEASURED: asking three to write this target in the canvas's colour
    // space does NOT encode it - the output transform is applied to the
    // default framebuffer only. The target holds linear light whatever this
    // says, so the shader encodes when it reads (encodeOutput). Left explicit
    // rather than removed, because the wrong answer here is invisible in code
    // and obvious on screen: every mid tone darkens and the faint dither on
    // the road drops below the darkest glyph, leaving the road empty.
    sceneTarget.texture.colorSpace = NoColorSpace;
    sceneTarget.texture.generateMipmaps = false;
    // Linear filtering IS the downscale: one sample at the centre of a 2x2
    // block returns that block's average.
    sceneTarget.texture.minFilter = LinearFilter;
    sceneTarget.texture.magFilter = LinearFilter;
  };

  const makeOutTarget = (cols, rows) => {
    const target = new WebGLRenderTarget(cols, rows, {
      depthBuffer: false,
      stencilBuffer: false,
      type: UnsignedByteType,
      format: RGBAFormat,
    });
    // The glyph id must survive the round trip as the integer it is.
    target.texture.colorSpace = NoColorSpace;
    target.texture.generateMipmaps = false;
    target.texture.minFilter = NearestFilter;
    target.texture.magFilter = NearestFilter;
    return target;
  };

  const ensureOutTarget = (cols, rows) => {
    if (
      outTargets[0] &&
      outTargets[0].width === cols &&
      outTargets[0].height === rows
    ) {
      return;
    }
    outTargets[0]?.dispose();
    outTargets[1]?.dispose();
    outTargets[0] = makeOutTarget(cols, rows);
    outTargets[1] = makeOutTarget(cols, rows);
    outIndex = 0;
    historyValid = false;
    pixels = new Uint8Array(cols * rows * 4);
    indices = new Uint8Array(cols * rows);
    lumOut = new Uint8Array(cols * rows);
    secondOut = new Uint8Array(cols * rows);
    flagsOut = new Uint8Array(cols * rows);
  };

  const ensureGlyphTexture = (glyphVectors, key) => {
    if (glyphTexture && glyphKey === key) return;
    glyphTexture?.dispose();
    const count = glyphVectors.length;
    const data = new Float32Array(count * 2 * 4);
    for (let g = 0; g < count; g++) {
      const v = glyphVectors[g];
      data[g * 4 + 0] = v[0];
      data[g * 4 + 1] = v[1];
      data[g * 4 + 2] = v[2];
      data[g * 4 + 3] = 0;
      const row = count * 4;
      data[row + g * 4 + 0] = v[3];
      data[row + g * 4 + 1] = v[4];
      data[row + g * 4 + 2] = v[5];
      data[row + g * 4 + 3] = 0;
    }
    glyphTexture = new DataTexture(data, count, 2, RGBAFormat, FloatType);
    glyphTexture.minFilter = NearestFilter;
    glyphTexture.magFilter = NearestFilter;
    glyphTexture.wrapS = ClampToEdgeWrapping;
    glyphTexture.wrapT = ClampToEdgeWrapping;
    glyphTexture.colorSpace = NoColorSpace;
    glyphTexture.generateMipmaps = false;
    glyphTexture.needsUpdate = true;
    glyphKey = key;
  };

  /**
   * Pack every vocabulary into one red-channel texture: class 0's glyph ids,
   * then class 1's, and so on, with a span table saying where each begins.
   */
  const ensureVocabTexture = (vocabLists, key) => {
    if (vocabTexture && vocabKey === key) return;
    vocabTexture?.dispose();
    const { flat, spans } = buildVocabSpans(vocabLists);
    const width = Math.max(1, Math.min(1024, flat.length));
    const height = Math.max(1, Math.ceil(flat.length / width));
    const data = new Uint8Array(width * height);
    data.set(flat.slice(0, data.length));
    vocabTexture = new DataTexture(data, width, height, RedFormat);
    vocabTexture.minFilter = NearestFilter;
    vocabTexture.magFilter = NearestFilter;
    vocabTexture.wrapS = ClampToEdgeWrapping;
    vocabTexture.wrapT = ClampToEdgeWrapping;
    vocabTexture.colorSpace = NoColorSpace;
    vocabTexture.generateMipmaps = false;
    vocabTexture.needsUpdate = true;
    vocabSpans = spans;
    material.uniforms.uVocabWidth.value = width;
    vocabKey = key;
  };

  /**
   * CW-91: the anchored ladders, as one tiny texture the shader can index.
   *
   * One ROW per class id, one TEXEL per field step, holding `glyph id + 1` so
   * that 0 stays free for "this class has no ladder" - a class with a ladder is
   * perfectly entitled to step 0 being the space, which is glyph 0.
   *
   * It is 16 x levels bytes, rebuilt only when the atlas is, and it replaces a
   * nearest-shape search over a few dozen glyphs with a single dependent read.
   *
   * @param {Map<number, Int16Array>|null} ladders class id -> step -> glyph
   * @param {number} levels
   * @param {string} key the atlas key the ladders were built from
   */
  const ensureLadderTexture = (ladders, levels, key) => {
    if (ladderTexture && ladderKey === key) return;
    ladderTexture?.dispose();
    const width = Math.max(1, levels);
    const data = buildLadderTable(ladders, width);
    ladderTexture = new DataTexture(
      data,
      width,
      MAX_CLASS_SPANS,
      RedFormat,
      UnsignedByteType
    );
    ladderTexture.minFilter = NearestFilter;
    ladderTexture.magFilter = NearestFilter;
    ladderTexture.wrapS = ClampToEdgeWrapping;
    ladderTexture.wrapT = ClampToEdgeWrapping;
    ladderTexture.colorSpace = NoColorSpace;
    ladderTexture.generateMipmaps = false;
    ladderTexture.needsUpdate = true;
    material.uniforms.uFieldLevels.value = width;
    ladderKey = key;
  };

  return {
    /** False once anything has failed, so callers stop asking. */
    get available() {
      return !failed;
    },
    reason: '',

    /**
     * Render the scene, pick every cell's glyph on the GPU, and read the
     * answer back.
     *
     * @returns {{indices: Uint8Array, lum: Uint8Array, colors: Uint8Array,
     *   flags: Uint8Array}|null} `flags` is the packed CW-68 byte, hold * 2
     *   plus the reverse-video bit. null means this pass has given up and the
     *   caller must use the CPU.
     */
    sample({
      scene,
      camera,
      cols,
      rows,
      sampleW,
      sampleH,
      cellW,
      cellH,
      internalPoints,
      externalPoints,
      glyphVectors,
      glyphKey: modelKey,
      vocabLists,
      vocabKey: listKey,
      classTexture,
      useClassVocabularies,
      paletteChroma,
      chromaBoost,
      contrastExp,
      dirContrastExp,
      invert,
      sourceW,
      sourceH,
      sceneColorSpace,
      reverseAt,
      spaceIndex,
      sparsestNonSpace,
      hysteresis,
      inkBudget,
      paletteWhiteIndex,
      ladders,
      fieldLevels,
      anchored,
      inkFamilies,
    }) {
      if (failed) return null;
      try {
        ensureSceneTarget(sourceW, sourceH);
        ensureOutTarget(cols, rows);
        ensureGlyphTexture(glyphVectors, modelKey);
        ensureVocabTexture(vocabLists, listKey);
        ensureLadderTexture(ladders ?? null, fieldLevels || 1, listKey);

        const prevTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(sceneTarget);
        renderer.clear();
        renderer.render(scene, camera);

        const u = material.uniforms;
        u.uScene.value = sceneTarget.texture;
        u.uGlyphs.value = glyphTexture;
        u.uVocab.value = vocabTexture;
        u.uClass.value = classTexture ?? glyphTexture;
        u.uHasClass.value = classTexture ? 1 : 0;
        u.uUseClasses.value =
          classTexture && useClassVocabularies !== false ? 1 : 0;
        const paletteCount = Math.min(16, paletteChroma?.length ?? 0);
        u.uUsePalette.value = paletteCount > 0 ? 1 : 0;
        u.uPaletteCount.value = paletteCount;
        u.uChromaBoost.value = chromaBoost ?? 1;
        for (let i = 0; i < paletteCount; i++) {
          u.uPalette.value[i * 3] = paletteChroma[i][0];
          u.uPalette.value[i * 3 + 1] = paletteChroma[i][1];
          u.uPalette.value[i * 3 + 2] = paletteChroma[i][2];
        }
        u.uSourceSize.value = [sourceW, sourceH];
        u.uSampleSize.value = [sampleW, sampleH];
        const scale = sampleW / sourceW;
        u.uScale.value = scale;
        // Whole-number ratios can be averaged exactly; today only 2 occurs,
        // at every character size at or below an eight-pixel cell.
        const ratio = 1 / scale;
        u.uBox.value = Math.abs(ratio - 2) < 1e-6 ? 2 : 1;
        u.uCellSize.value = [cellW, cellH];
        u.uGridSize.value = [cols, rows];
        u.uInternal.value = internalPoints;
        u.uExternal.value = externalPoints;
        u.uContrastExp.value = contrastExp;
        u.uDirContrastExp.value = dirContrastExp;
        u.uInvert.value = invert ? 1 : 0;
        u.uEncodeSrgb.value = sceneColorSpace === 'srgb' ? 1 : 0;
        u.uReverseAt.value = Number.isFinite(reverseAt) ? reverseAt : 2;
        u.uSpaceIndex.value = spaceIndex ?? 0;
        u.uSparsestNonSpace.value = sparsestNonSpace ?? 0;
        u.uVocabSpan.value = vocabSpans;
        // CW-91: anchoring needs BOTH the ladder table and a class frame to
        // read the field byte out of, so it asks for both rather than for the
        // caller's flag alone. A run that turned it on without a class texture
        // would silently measure the screen pick and report it as anchored.
        u.uLadder.value = ladderTexture;
        u.uAnchored.value = anchored && classTexture && ladders ? 1 : 0;
        // CW-92: like anchoring, this needs a class frame as well as a table -
        // a run with the table but no classes would silently measure the
        // screen pick and report it as authored.
        if (inkFamilies && classTexture) {
          const dst = u.uInkFamily.value;
          for (let i = 0; i < 16; i++) {
            dst[i] = i < inkFamilies.length ? inkFamilies[i] : -1;
          }
          u.uHasInkFamily.value = 1;
        } else {
          u.uHasInkFamily.value = 0;
        }
        // CW-68. uPrev is bound to whichever target was written last; when
        // there is nothing to read yet, any texture will do because uHasPrev
        // is zero and the shader never samples it - a null sampler would
        // still have to be bound to a unit.
        const target = outTargets[outIndex];
        const previous = outTargets[1 - outIndex];
        u.uPrev.value = previous.texture;
        u.uHasPrev.value = historyValid && hysteresis ? 1 : 0;
        u.uGlyphBand.value = hysteresis ? hysteresis.glyph : 0;
        u.uReverseBand.value = hysteresis ? hysteresis.reverse : 0;
        u.uHoldFrames.value = hysteresis ? hysteresis.holdFrames : 0;
        u.uInkFloor.value = inkBudget ? inkBudget.floor : 0;
        u.uWhiteLum.value = inkBudget ? inkBudget.whiteLum : 0;
        u.uWhiteChroma.value = inkBudget ? inkBudget.whiteChroma : 0;
        u.uWhiteIndex.value =
          inkBudget && Number.isInteger(paletteWhiteIndex)
            ? paletteWhiteIndex
            : -1;

        renderer.setRenderTarget(target);
        renderer.render(quadScene, quadCamera);
        renderer.readRenderTargetPixels(target, 0, 0, cols, rows, pixels);
        renderer.setRenderTarget(prevTarget);
        outIndex = 1 - outIndex;
        historyValid = true;

        // Rows come back bottom-up; the grid counts from the top.
        for (let y = 0; y < rows; y++) {
          const src = (rows - 1 - y) * cols * 4;
          const dst = y * cols;
          for (let x = 0; x < cols; x++) {
            indices[dst + x] = pixels[src + x * 4];
            secondOut[dst + x] = pixels[src + x * 4 + 1];
            lumOut[dst + x] = pixels[src + x * 4 + 2];
            flagsOut[dst + x] = pixels[src + x * 4 + 3];
          }
        }
        return { indices, lum: lumOut, colors: secondOut, flags: flagsOut };
      } catch (error) {
        failed = true;
        failure = String(error?.message || error);
        if (import.meta.env.DEV) {
          console.warn('[hfm-gpu] falling back to the CPU path:', failure);
        }
        return null;
      }
    },

    /**
     * CW-68: drop the frame-to-frame memory.
     *
     * Called when the atlas is rebuilt or the bands move - the glyph indices
     * in the previous target were chosen under rules, or against vectors,
     * that no longer hold. A reallocation forgets on its own.
     */
    forget() {
      historyValid = false;
    },

    /** Why the pass gave up, for the record and the DEV readout. */
    get failure() {
      return failure;
    },

    dispose() {
      sceneTarget?.dispose();
      outTargets[0]?.dispose();
      outTargets[1]?.dispose();
      glyphTexture?.dispose();
      vocabTexture?.dispose();
      ladderTexture?.dispose();
      material.dispose();
      sceneTarget = null;
      outTargets[0] = null;
      outTargets[1] = null;
      historyValid = false;
      glyphTexture = null;
      vocabTexture = null;
      ladderTexture = null;
      ladderKey = '';
    },
  };
}
