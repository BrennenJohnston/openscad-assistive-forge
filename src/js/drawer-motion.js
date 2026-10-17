/**
 * Drawers that move like drawers, in the Alt View's look.
 *
 * The look gives its drawers a pace (variant.css: --alt-drawer-open,
 * --alt-drawer-close, --alt-drawer-ease). Without one, outside the look or
 * when a person has asked for less motion, nothing here moves and a drawer
 * changes at once, as it always has.
 *
 * A drawer slides out from the edge it lives behind, its controls riding in
 * it. The edge is a clip that follows the slide: the part of the drawer still
 * behind the edge is not drawn, so a drawer never shows over the bar or the
 * row it comes out of, and the markup needs no wrapper. The room the layout
 * gives a drawer grows and shrinks with it, so the preview beside it gives
 * way as the drawer comes out instead of jumping before or after, and no
 * empty gap waits for the drawer to arrive. At the end of its way out it
 * meets its stop and settles back a little, as a drawer on rails does.
 *
 * Opening, the caller lays the drawer out open first and the slide plays
 * over that. Closing, the drawer keeps its open layout while it slides away,
 * and `whenClosed` lays it out closed once the slide has ended; a press that
 * turns the drawer round first cancels that.
 * @license GPL-3.0-or-later
 */

/** How far back from its stop a drawer settles, as a share of its travel. */
const SETTLE = 0.02;

/** @typedef {'left'|'right'|'top'|'bottom'} DrawerEdge */

/**
 * @typedef {Object} DrawerPart
 * @property {HTMLElement|null|undefined} el
 * @property {'drawer'|'rider'|'held'|'space'} [role] - `drawer` (the
 *   default) moves and is not drawn past the edge; `rider` moves with it and
 *   is drawn whole (a grip on its edge, a tint behind it, a panel's children
 *   inside the panel that clips them); `held` only keeps its open size (a
 *   panel's children laid out from the edge that moves already ride it);
 *   `space` stays put and is the drawer's room in the layout, sized with
 *   the drawer
 * @property {Object<string, number[]>} [props] - a space's sizes in px by
 *   style property, closed then open, e.g. `{ width: [36, 508] }`
 * @property {Object<string, string>} [hold] - styles a moving part keeps
 *   while it moves (its open width, so its contents do not reflow)
 */

/** The slides under way, by element: all the parts of one drawer share one list. */
const running = new WeakMap();

/**
 * Each moving element's part as its slide began: a drawer turned round in
 * mid-slide keeps those sizes, since a box measured mid-slide reports the
 * size the slide has given it, not its own.
 */
const begun = new WeakMap();

const across = (from) => from === 'left' || from === 'right';
const round = (px) => Math.round(px * 100) / 100;
const moves = (part) => ['drawer', 'rider'].includes(part.role ?? 'drawer');

/**
 * @param {CSSStyleDeclaration} style
 * @param {string} name
 * @returns {number} ms, 0 when unset
 */
function readMs(style, name) {
  const value = style.getPropertyValue(name).trim();
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}

/**
 * The look's pace for its drawers, or null when they do not move.
 * @returns {{open: number, close: number, ease: string}|null}
 */
export function drawerPace() {
  if (document.visibilityState === 'hidden') return null;
  const style = getComputedStyle(document.documentElement);
  const open = readMs(style, '--alt-drawer-open');
  const close = readMs(style, '--alt-drawer-close');
  if (!(open > 0 && close > 0)) return null;
  const ease = style.getPropertyValue('--alt-drawer-ease').trim();
  return { open, close, ease: ease || 'ease-out' };
}

/**
 * Where a part is when its drawer has come `p` of its way out (0 behind the
 * edge, 1 open): a moving part shifted back toward the edge by the rest of
 * its travel (a drawer also cut where the edge is), a space sized between
 * its closed and open sizes.
 * @param {DrawerPart} part
 * @param {DrawerEdge} from
 * @param {number} travel - px
 * @param {number} p
 * @returns {Object<string, string>}
 */
export function poseAt(part, from, travel, p) {
  if (part.role === 'held') return { ...part.hold };
  if (!moves(part)) {
    const pose = {};
    for (const [prop, [closed, open]] of Object.entries(part.props ?? {})) {
      pose[prop] = `${round(closed + (open - closed) * p)}px`;
    }
    return pose;
  }
  const back = round((1 - p) * travel);
  const sign = from === 'left' || from === 'top' ? -1 : 1;
  const pose = {
    ...part.hold,
    transform: `translate${across(from) ? 'X' : 'Y'}(${sign * back}px)`,
  };
  if ((part.role ?? 'drawer') === 'drawer') {
    const cut = { top: 0, right: 0, bottom: 0, left: 0 };
    cut[from] = back;
    pose.clipPath = `inset(${cut.top}px ${cut.right}px ${cut.bottom}px ${cut.left}px)`;
  }
  return pose;
}

/**
 * The keyframes from `fromP` to `toP`. A drawer coming all the way out
 * reaches its stop at four fifths of the time, settles back, and comes to
 * rest.
 */
function keyframesFor(part, from, travel, fromP, toP, ease) {
  const at = (p) => poseAt(part, from, travel, p);
  if (toP === 1) {
    return [
      { ...at(fromP), offset: 0, easing: ease },
      { ...at(1), offset: 0.8, easing: 'ease-out' },
      { ...at(1 - SETTLE), offset: 0.9, easing: 'ease-in-out' },
      { ...at(1), offset: 1 },
    ];
  }
  return [
    { ...at(fromP), offset: 0, easing: ease },
    { ...at(toP), offset: 1 },
  ];
}

/**
 * How far out a drawer is while it slides: from where its moving part is
 * drawn, or for a room alone, from the room's size.
 * @param {DrawerPart} part
 * @param {DrawerEdge} from
 * @param {number} travel
 * @returns {number} 0 to 1
 */
function progressOf(part, from, travel) {
  const style = getComputedStyle(part.el);
  let p = 1;
  if (moves(part)) {
    const transform = style.transform;
    if (transform && transform !== 'none') {
      const m = new DOMMatrixReadOnly(transform);
      p = 1 - Math.abs(across(from) ? m.m41 : m.m42) / travel;
    }
  } else {
    const [prop, [closed, open]] = Object.entries(part.props)[0];
    if (open !== closed)
      p = (parseFloat(style[prop]) - closed) / (open - closed);
  }
  return Math.min(1, Math.max(0, p));
}

/** Cancel the slide an element is in, with every part that moves with it. */
function stop(el) {
  const animations = running.get(el);
  if (!animations) return;
  for (const animation of animations) animation.cancel();
}

/**
 * How wide a desktop panel stays when it is closed to its strip.
 * @returns {number} px
 */
export function stripWidth() {
  const width = getComputedStyle(document.documentElement).getPropertyValue(
    '--drawer-collapsed-width'
  );
  return parseFloat(width) || 0;
}

/**
 * A desktop side panel laid out open, as a drawer: the panel is its own room,
 * from its strip to its open width, and clips its children, which keep their
 * open width. On the left the panel grows rightward and its children, laid
 * out from its left edge, ride its growing edge by shifting; on the right
 * that left edge is the growing one, and they ride it as laid out.
 * @param {HTMLElement} panel
 * @param {DrawerEdge} from
 * @returns {DrawerPart[]}
 */
export function sidePanelParts(panel, from) {
  const width = panel.offsetWidth;
  const strip = stripWidth();
  return [
    {
      el: panel,
      role: 'space',
      props: { width: [strip, width], minWidth: [strip, width] },
    },
    ...[...panel.children]
      .filter((child) => child.offsetWidth > 0)
      .map((child) => ({
        el: child,
        role: from === 'left' ? 'rider' : 'held',
        hold: { width: `${child.offsetWidth}px` },
      })),
  ];
}

/**
 * An element's box where its layout puts it, without a slide's shift.
 * @param {HTMLElement} el
 * @returns {DOMRect}
 */
export function restingRect(el) {
  const box = el.getBoundingClientRect();
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return box;
  const m = new DOMMatrixReadOnly(transform);
  return new DOMRect(box.x - m.m41, box.y - m.m42, box.width, box.height);
}

/**
 * Slide a drawer open or closed.
 * @param {DrawerPart[]} parts - the first moving part sets the distance; a
 *   room alone (only `space` parts) follows the pace with no distance
 * @param {Object} options
 * @param {DrawerEdge} options.from - the edge the drawer lives behind
 * @param {boolean} options.open - true to open (it is laid out open already)
 * @param {number} [options.keep] - px of the drawer that stay in view when it
 *   is closed (a strip with its toggle)
 * @param {() => void} [options.whenClosed] - lays the drawer out closed: at
 *   once when nothing moves, else when the slide has ended
 * @param {Array<HTMLElement|null|undefined>} [options.inert] - out of reach
 *   while the drawer slides away
 * @param {boolean} [options.instant] - change at once (the layout itself is
 *   changing under the drawer)
 * @returns {Promise<boolean>|null} null when nothing moves; else true once
 *   the slide has ended, false when another press turned it round
 */
export function slideDrawer(
  parts,
  { from, open, keep = 0, whenClosed, inert = [], instant = false }
) {
  const present = parts
    .filter((part) => part.el?.isConnected)
    .map((part) => (running.has(part.el) && begun.get(part.el)) || part);
  const lead = present.find(moves);
  const room = present.find((part) => part.role === 'space');
  const size = lead
    ? across(from)
      ? lead.el.offsetWidth
      : lead.el.offsetHeight
    : 0;
  // A drawer with a room along its way travels as far as the room grows:
  // a panel is wider than its children by its border and scrollbar.
  const grows = room?.props?.[across(from) ? 'width' : 'height'];
  const travel = lead && grows ? grows[1] - grows[0] : size - keep;
  const guide = lead ?? room;
  const fromP =
    guide && running.has(guide.el) && (!lead || travel > 0)
      ? progressOf(guide, from, travel)
      : open
        ? 0
        : 1;
  present.forEach((part) => stop(part.el));

  const pace = instant ? null : drawerPace();
  const still = lead
    ? travel <= 0
    : !room ||
      Object.values(room.props ?? {}).every(([closed, to]) => closed === to);
  if (!pace || still) {
    if (!open) whenClosed?.();
    return null;
  }

  const toP = open ? 1 : 0;
  const share = Math.max(0.2, Math.abs(toP - fromP));
  const duration = (open ? pace.open : pace.close) * share;
  const animations = present.map((part) =>
    part.el.animate(keyframesFor(part, from, travel, fromP, toP, pace.ease), {
      duration,
    })
  );
  present.forEach((part) => {
    running.set(part.el, animations);
    begun.set(part.el, part);
  });
  const reach = inert.filter(Boolean);
  if (!open) reach.forEach((el) => (el.inert = true));

  return Promise.all(animations.map((animation) => animation.finished))
    .then(
      () => {
        if (!open) whenClosed?.();
        return true;
      },
      (error) => {
        // Canceled by the next press, which takes the drawer from here.
        if (error?.name === 'AbortError') return false;
        throw error;
      }
    )
    .finally(() => {
      present.forEach((part) => {
        if (running.get(part.el) === animations) running.delete(part.el);
      });
      if (!open) reach.forEach((el) => (el.inert = false));
    });
}
