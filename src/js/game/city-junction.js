/**
 * Naming the corner you are about to travel to (CW-61, CW-Q58).
 *
 * The teleport dialog has to say where you would land, and for a blind
 * traveler that sentence IS the map. So it has to be true at a corner, true
 * in the middle of a block, and true where there is no street at all - and it
 * must never invent a second street to make itself sound more precise.
 *
 * ★★ THE RULES HERE WERE MEASURED, NOT REASONED. The street index was asked
 * what it says at 1,661 real crossings in Seattle and at a lattice of
 * mid-block points, and the two rules below are what the answers required.
 * The numbers are in the CW-61 release record.
 *
 * @license GPL-3.0-or-later
 */

/**
 * ★ RULE ONE: A SECOND STREET HAS TO BE CLOSE ENOUGH TO BE A CORNER.
 *
 * Measured by walking away from 120 real junctions along one of their own
 * streets and asking the index what the runner-up name was:
 *
 *   0 m from the junction   120 of 120 had a second street within 12 m
 *   5 m                     120 of 120
 *   10 m                    120 of 120
 *   15 m                     27 of 120
 *   20 m                     20 of 120
 *   30 m                     17 of 120
 *
 * The runner-up's distance tracks the offset exactly, so the cut is a cut in
 * distance and nothing else. Twelve metres is the game's existing ON_M - the
 * distance at which the HUD says you are ON a street rather than near it -
 * and it lands squarely inside that cliff. The caller passes it rather than
 * this file owning a second copy.
 *
 * ★ RULE TWO: THE SECOND NAME MUST BE A DIFFERENT STREET, NOT THE SAME ONE
 * WEARING A SUFFIX. The road graph carries "4th Avenue" and "4th Avenue
 * Cycletrack" as separate named ways a metre apart, and "Alaskan Way" and
 * "Alaskan Way South" where the naming changes. "Near 4th Avenue and 4th
 * Avenue Cycletrack" is not a corner, it is a street next to itself.
 */

const norm = (name) =>
  String(name ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

/**
 * Whether two street names are the same street.
 *
 * ★ TOKENS, NOT SUBSTRINGS, and the difference is not cosmetic. A substring
 * test calls "1st Avenue" part of "21st Avenue", because it is one - so a
 * genuine corner would lose its second street to a spelling accident. One
 * name is the same street as the other when the shorter one's WORDS are a
 * prefix of the longer one's: that catches every suffix the map actually
 * uses (a cycletrack, a bike path, a directional half) and nothing else.
 *
 * @param {string} a
 * @param {string} b
 */
export function sameStreet(a, b) {
  const ta = norm(a);
  const tb = norm(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shortT.every((word, i) => longT[i] === word);
}

/**
 * What to say about a spot, from the street index's ranked hits.
 *
 * Returns DATA, not prose: which street, whether you are on it or beside it,
 * and the cross street if there honestly is one. The sentence is the
 * controller's, beside the game's other spoken strings.
 *
 * @param {Array<{name: string, distM: number}>} hits ranked, one per name
 * @param {{onM: number, junctionM: number}} radii
 * @returns {{primary: string|null, secondary: string|null, on: boolean}}
 */
export function describeJunction(hits, { onM, junctionM }) {
  const list = Array.isArray(hits) ? hits : [];
  const primary = list[0] ?? null;
  if (!primary) return { primary: null, secondary: null, on: false };
  const secondary =
    list
      .slice(1)
      .find((h) => h.distM <= junctionM && !sameStreet(primary.name, h.name)) ??
    null;
  return {
    primary: primary.name,
    secondary: secondary ? secondary.name : null,
    on: primary.distM <= onM,
  };
}
