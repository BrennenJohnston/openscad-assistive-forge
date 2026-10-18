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

/** When a drawer coming out meets its stop, as a share of its slide's time. */
const STOP_AT = 0.8;

/** @typedef {'left'|'right'|'top'|'bottom'} DrawerEdge */

/**
 * @typedef {Object} DrawerPart
 * @property {HTMLElement|null|undefined} el
 * @property {'drawer'|'rider'|'held'|'clip'|'space'} [role] - `drawer` (the
 *   default) moves and is not drawn past the edge; `rider` moves with it and
 *   is drawn whole (a grip on its edge, a tint behind it, a panel's children
 *   inside the panel that clips them); `held` only keeps its open size (a
 *   panel's children laid out from the edge that moves already ride it);
 *   `clip` stays put and cuts what it holds at its own box while the drawer
 *   moves; `space` stays put and is the drawer's room in the layout, sized
 *   with the drawer
 * @property {Object<string, Array<number|number[]>>} [props] - a space's
 *   sizes in px by style property, closed then open, e.g. `{ width: [36,
 *   508] }`, or for a grid's tracks a list each, `{ gridTemplateRows:
 *   [[540, 0], [340, 200]] }`
 * @property {Object<string, string>} [hold] - styles a moving part keeps
 *   while it moves (its open width, so its contents do not reflow)
 */

/** The slides under way, by element: all the parts of one drawer share one list. */
const running = new WeakMap();

/**
 * @typedef {Object} DrawerMove
 * @property {number} stopAt - seconds until the drawer meets its stop on
 *   screen: out, at four fifths of its slide; shut, at its end; 0 when it
 *   changes at once
 * @property {boolean} whole - whether it goes the whole way, from shut or
 *   from open, not turned round in mid-slide
 */

/**
 * Told of each drawer that opens or closes by the name it goes by, whether
 * it slides or changes at once because less motion was asked for (the
 * look's sounds), but not of one laid out at once (`instant`).
 * @type {((name: string, open: boolean, move: DrawerMove) => void)|null}
 */
let movesHeard = null;

/**
 * @param {((name: string, open: boolean, move: DrawerMove) => void)|null} listener
 */
export function onDrawerMove(listener) {
  movesHeard = listener;
}

/**
 * A drawer that opened or closed without a slide of its own to say so.
 * @param {string|undefined} name - none: nothing is told
 * @param {boolean} open
 */
export function drawerChanged(name, open) {
  if (name) movesHeard?.(name, open, { stopAt: 0, whole: true });
}

/**
 * Each moving element's part as its slide began: a drawer turned round in
 * mid-slide keeps those sizes, since a box measured mid-slide reports the
 * size the slide has given it, not its own.
 */
const begun = new WeakMap();

const across = (from) => from === 'left' || from === 'right';
const round = (px) => Math.round(px * 100) / 100;
const moves = (part) => ['drawer', 'rider'].includes(part.role ?? 'drawer');
const lerp = (closed, open, p) => round(closed + (open - closed) * p);
const sameSizes = ([closed, open]) =>
  JSON.stringify(closed) === JSON.stringify(open);

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
  if (part.role === 'clip') return { clipPath: 'inset(0px)' };
  if (!moves(part)) {
    const pose = {};
    for (const [prop, [closed, open]] of Object.entries(part.props ?? {})) {
      pose[prop] = Array.isArray(closed)
        ? closed.map((px, i) => `${lerp(px, open[i], p)}px`).join(' ')
        : `${lerp(closed, open, p)}px`;
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
      { ...at(1), offset: STOP_AT, easing: 'ease-out' },
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
    const now = String(style[prop]).split(/\s+/).map(parseFloat);
    const at = Array.isArray(closed)
      ? closed.findIndex((px, i) => px !== open[i])
      : 0;
    const [from0, to0] = Array.isArray(closed)
      ? [closed[at], open[at]]
      : [closed, open];
    if (at >= 0 && to0 !== from0) p = (now[at] - from0) / (to0 - from0);
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
 * Stop a drawer where it is, its parts back in their own layout at once;
 * its `whenClosed` does not run.
 * @param {HTMLElement|null|undefined} el - any part of it
 */
export function cancelSlide(el) {
  if (el) stop(el);
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
 * @param {number} [options.travel] - px a moving part travels, when neither
 *   its own size nor a width or height room says (a grid track's growth)
 * @param {string} [options.name] - the drawer's name, for the look to hear
 *   it move; a room that follows a drawer has none
 * @returns {Promise<boolean>|null} null when nothing moves; else true once
 *   the slide has ended, false when another press turned it round
 */
export function slideDrawer(
  parts,
  {
    from,
    open,
    keep = 0,
    whenClosed,
    inert = [],
    instant = false,
    travel: given,
    name,
  }
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
  const travel = given ?? (lead && grows ? grows[1] - grows[0] : size - keep);
  const guide = lead ?? room;
  const fromP =
    guide && running.has(guide.el) && (!lead || travel > 0)
      ? progressOf(guide, from, travel)
      : open
        ? 0
        : 1;
  present.forEach((part) => stop(part.el));

  const still = lead
    ? travel <= 0
    : !room || Object.values(room.props ?? {}).every(sameSizes);
  const toP = open ? 1 : 0;
  const share = Math.max(0.2, Math.abs(toP - fromP));
  const pace = instant ? null : drawerPace();
  const duration = pace ? (open ? pace.open : pace.close) * share : 0;
  if (name && !instant && !still) {
    movesHeard?.(name, open, {
      stopAt: (duration * (open ? STOP_AT : 1)) / 1000,
      whole: Math.abs(toP - fromP) > 0.999,
    });
  }
  if (!pace || still) {
    if (!open) whenClosed?.();
    return null;
  }

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

/**
 * The drawers the look lays out when it comes on, by name. Each says whether
 * it is open where the page is now (a drawer the layout hides is not), where
 * it sits, so they open left to right, and how to open and close it: at
 * once or with its slide, quietly, and without remembering the change.
 * @typedef {{instant?: boolean, quiet?: boolean, remember?: boolean}} DrawerHow
 * @typedef {Object} LookDrawer
 * @property {() => boolean} isOpen
 * @property {() => HTMLElement|null} place - the element whose left edge
 *   orders it
 * @property {(how: DrawerHow) => Promise<boolean>|null|void} open
 * @property {(how: DrawerHow) => Promise<boolean>|null|void} close
 */
const lookDrawers = new Map();

/**
 * @param {string} name
 * @param {LookDrawer} drawer
 */
export function registerLookDrawer(name, drawer) {
  lookDrawers.set(name, drawer);
}

/**
 * The drawers open now, left to right.
 * @returns {string[]}
 */
export function openLookDrawers() {
  const left = (name) =>
    lookDrawers.get(name).place()?.getBoundingClientRect().left ?? 0;
  return [...lookDrawers.keys()]
    .filter((name) => lookDrawers.get(name).isOpen())
    .map((name, order) => ({ name, order, x: left(name) }))
    .sort((a, b) => a.x - b.x || a.order - b.order)
    .map(({ name }) => name);
}

/**
 * Open or close a drawer the look knows.
 * @param {string} name
 * @param {boolean} open
 * @param {DrawerHow} [how]
 * @returns {Promise<boolean>|null} the slide, or null when it changed at once
 */
export function setLookDrawer(name, open, how = {}) {
  const drawer = lookDrawers.get(name);
  if (!drawer) return null;
  return (open ? drawer.open(how) : drawer.close(how)) ?? null;
}
