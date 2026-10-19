/**
 * A tab list as the ARIA Authoring Practices describe it: the selected tab
 * is the list's one Tab stop, Left and Right move the selection and wrap,
 * Home and End go to the ends, and a click selects. Each tab names its
 * panel with `aria-controls`; the selected tab's panel is shown, the others
 * hidden. Preferences and the Keys dialog share it.
 * @license GPL-3.0-or-later
 */

/**
 * Select one tab among `tabs`: `aria-selected`, the roving tabindex and the
 * panels follow. An unavailable tab selects like any other: its panel is
 * where its reason is written.
 * @param {HTMLElement[]} tabs
 * @param {HTMLElement} tab
 * @param {Object} [options]
 * @param {boolean} [options.focus] - move focus to the tab (default true)
 * @param {(tab: HTMLElement) => HTMLElement|null} [options.panelFor]
 */
export function selectTabIn(
  tabs,
  tab,
  {
    focus = true,
    panelFor = (t) => document.getElementById(t.getAttribute('aria-controls')),
  } = {}
) {
  if (!tab) return;
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.setAttribute('tabindex', selected ? '0' : '-1');
    t.classList.toggle('active', selected);
    const panel = panelFor(t);
    if (panel) panel.hidden = !selected;
  }
  if (focus) tab.focus();
}

/**
 * Give a tab list its keyboard and pointer behavior.
 * @param {Object} options
 * @param {HTMLElement} options.tablist - the `role="tablist"` element
 * @param {HTMLElement[]|(() => HTMLElement[])} options.tabs - in order
 * @param {(tab: HTMLElement) => HTMLElement|null} [options.panelFor]
 * @param {(tab: HTMLElement) => void} [options.onSelect] - after a tab is
 *   selected, by any means
 * @returns {{select: (tab: HTMLElement, options?: {focus?: boolean}) => void,
 *   selected: () => HTMLElement|null, tabs: () => HTMLElement[]}}
 */
export function createTabList({ tablist, tabs, panelFor, onSelect }) {
  const list = () =>
    (typeof tabs === 'function' ? tabs() : tabs).filter(Boolean);

  const select = (tab, { focus = true } = {}) => {
    if (!tab) return;
    selectTabIn(list(), tab, {
      focus,
      ...(panelFor ? { panelFor } : {}),
    });
    onSelect?.(tab);
  };

  const move = (from, by) => {
    const all = list();
    const at = all.indexOf(from);
    if (at < 0) return;
    select(all[(at + by + all.length) % all.length]);
  };

  tablist.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    const all = list();
    switch (event.key) {
      case 'ArrowRight':
        move(tab, 1);
        break;
      case 'ArrowLeft':
        move(tab, -1);
        break;
      case 'Home':
        select(all[0]);
        break;
      case 'End':
        select(all[all.length - 1]);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  return {
    select,
    selected: () =>
      list().find((t) => t.getAttribute('aria-selected') === 'true') ?? null,
    tabs: list,
  };
}
