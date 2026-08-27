/**
 * Map view styles (CW-60, CW-Q57).
 *
 * Four ways of drawing the same overhead map, informed by tactile-map
 * practice: one layer per finger-load, drastic simplification, landmarks
 * kept. Sources in plan section 3e - the Cartographic Journal guidelines
 * review (Wabinski/Moscicka/Touya 2022), BANA's Guidelines and Standards for
 * Tactile Graphics (2010), and the Swedish MTM production guidelines (2003).
 *
 * ★★ WHAT HIDES IS THE POINT, NOT WHAT REMAINS. A style that only recoloured
 * things would be a palette swap wearing a tactile-map argument. Every row
 * below removes something, and the release record says what each one costs
 * you as well as what it buys.
 *
 * These are TONES AND VISIBILITY ONLY. No geometry is rebuilt when the style
 * changes, so switching is free and nothing can drift out of step with the
 * street view - which is untouched by all of this.
 *
 * @license GPL-3.0-or-later
 */

/**
 * `tone` is a hex colour or null to leave the map default alone.
 * `show` false hides the layer outright.
 *
 * `wayfinding` is the only layer that is OFF by default: CW-43 parsed it and
 * nothing has ever drawn it, and drawing five thousand marks over a whole
 * city is exactly the sort of thing that turns into a carpet. It earns its
 * place in one style, where it is the subject.
 */
export const MAP_STYLES = [
  {
    id: 'standard',
    name: 'Standard',
    /** What a reader loses by choosing this one, for the record and the help. */
    hides: 'nothing',
    roads: { show: true, tone: null },
    sidewalks: { show: true, tone: null },
    buildings: { show: true, tone: null },
    greens: { show: true, tone: null },
    wayfinding: { show: false, tone: null },
  },
  {
    id: 'roads',
    name: 'Roads only',
    hides: 'buildings and parks',
    // The network, and nothing to read it against. This is the tactile
    // "network map": one layer, at the top of its own contrast range.
    roads: { show: true, tone: 0x8a8a8a },
    sidewalks: { show: true, tone: 0xb0b0b0 },
    buildings: { show: false, tone: null },
    greens: { show: false, tone: null },
    wayfinding: { show: false, tone: null },
  },
  {
    id: 'buildings',
    name: 'Buildings only',
    hides: 'the street network, down to a hairline',
    // The district map: footprints carry the shape of the place and the
    // roads survive only as the gaps between them.
    roads: { show: true, tone: 0x1e1e1e },
    sidewalks: { show: true, tone: 0x141414 },
    buildings: { show: true, tone: 0x9a9a9a },
    greens: { show: true, tone: 0x243024 },
    wayfinding: { show: false, tone: null },
  },
  {
    id: 'wayfinding',
    name: 'Wayfinding',
    hides: 'building detail, and dims the network',
    // ★ THE MISSION STYLE. CW-43's crossings, kerbs and tactile paving have
    // been in the model since it was parsed and have never been drawn. Here
    // they are the subject, and everything else is dimmed to be the ground
    // they sit on rather than competition for them.
    roads: { show: true, tone: 0x2a2a2a },
    sidewalks: { show: true, tone: 0x3a3a3a },
    buildings: { show: true, tone: 0x181818 },
    greens: { show: true, tone: 0x1b241b },
    wayfinding: { show: true, tone: null },
  },
];

/** The default, and what an unknown stored value falls back to. */
export const DEFAULT_MAP_STYLE = 'standard';

export function mapStyleById(id) {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0];
}

export function mapStyleIndex(id) {
  const i = MAP_STYLES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

/** Cycle by +1 or -1, wrapping both ways. */
export function cycleMapStyle(id, delta) {
  const n = MAP_STYLES.length;
  const i = (mapStyleIndex(id) + (delta % n) + n) % n;
  return MAP_STYLES[i].id;
}

/**
 * Wayfinding marks (CW-60), and the whole difficulty is SIZE.
 *
 * ★★ A MARK MUST BE A SCREEN SIZE, NOT A NUMBER OF METRES. Seattle has 5,355
 * wayfinding points. At the map's widest the entire city is a few hundred
 * character cells, so marks drawn at a fixed number of metres are either
 * invisible zoomed out or the size of a block zoomed in. Either way the layer
 * stops being a layer.
 *
 * ★ THE FIRST ATTEMPT GOT THIS WRONG IN A WAY WORTH KEEPING. It used a fixed
 * 2.6 m divided by the zoom, which at zoom 1 is 2.6 m - and at zoom 1 the
 * whole city is in frame, so one pixel is about four metres. The marks were
 * SUB-PIXEL and the style photographed as an empty dimmed map. The fix is the
 * family the player marker already uses: a fraction of the CITY'S OWN SPAN,
 * scaled by the zoom, so it works for a small extract and a large one alike.
 *
 * The marker uses `spanM * 0.025` and `2.2 / zoom`. A wayfinding mark is far
 * smaller because there are thousands of them rather than one.
 */
export const WAYFIND_MARK_SPAN_FRACTION = 0.0035;
/** The same clamp family the player marker uses (CW-40). */
export const WAYFIND_ZOOM_MIN = 0.6;
export const WAYFIND_ZOOM_MAX = 3.5;

export function wayfindMarkSizeM(zoom, spanM) {
  const span = Math.max(100, spanM || 0);
  const base = span * WAYFIND_MARK_SPAN_FRACTION;
  const scale = Math.min(
    WAYFIND_ZOOM_MAX,
    Math.max(WAYFIND_ZOOM_MIN, 2.2 / Math.max(0.01, zoom))
  );
  return base * scale;
}

/**
 * The three kinds, and why they are told apart by BRIGHTNESS rather than by
 * shape. At the size these marks land - one or two character cells - a
 * triangle and a square are the same cell, which is the hydrant lesson. What
 * survives that size is how bright a thing is.
 *
 * A crossing is where you cross, so it is the brightest. Tactile paving is
 * the surface that tells you so, and sits just under it. A kerb is the edge
 * itself, and is the quietest of the three because there are the most of them.
 */
export const WAYFIND_KINDS = {
  crossing: { tier: 0.95, order: 0 },
  tactile_paving: { tier: 0.78, order: 1 },
  kerb: { tier: 0.55, order: 2 },
};

export function wayfindTierOf(kind) {
  return (WAYFIND_KINDS[kind] ?? WAYFIND_KINDS.kerb).tier;
}
