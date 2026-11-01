/**
 * The numbered steps of a map type: a beginner sees one step at a time.
 *
 * A `nav` named Steps lists the steps in order; a step already reached is a
 * button that returns to it, the current one carries `aria-current="step"`,
 * a step not reached yet is plain text. A heading says "Step n of total:
 * name" and takes focus when the step changes, so a screen reader reads it
 * once (no live region). One section per step holds that step's controls;
 * only the current one shows. Back and Next end the step; Next waits until
 * the step's need is met and says why beside it.
 *
 * Keyboard only, no gestures: Tab reaches the list's buttons, the step's
 * controls, Back and Next; Enter or Space presses them.
 *
 * @license GPL-3.0-or-later
 */

export const STEP_STRINGS = Object.freeze({
  navLabel: 'Steps',
  /** A11Y: the heading a screen reader reads on each step. */
  heading: (n, total, name) => `Step ${n} of ${total}: ${name}`,
  back: 'Back',
  next: 'Next',
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build the steps.
 *
 * @param {object} args
 * @param {string} args.id - the wrapper's id; the parts take it as a prefix
 * @param {string[]} args.names - the steps' names, in order
 * @param {(index: number) => string|null} [args.need] - why Next waits on a
 *   step, or null when it may go on
 * @param {(index: number) => void} [args.onShow] - a step was shown
 * @param {() => void} [args.onBackFromFirst] - Back on the first step (the
 *   type chooser); without it Back hides there
 * @returns {{ el: HTMLElement, sections: HTMLElement[], show: (index: number, options?: {focus?: boolean}) => void, index: () => number, refresh: () => void }}
 */
export function createSteps({
  id,
  names,
  need = () => null,
  onShow = () => {},
  onBackFromFirst = null,
}) {
  const S = STEP_STRINGS;
  const wrap = el('div', 'tactile-map-steps');
  wrap.id = id;

  const nav = el('nav', 'tactile-map-steps-nav');
  nav.setAttribute('aria-label', S.navLabel);
  const list = el('ol', 'tactile-map-steps-list');
  nav.appendChild(list);
  wrap.appendChild(nav);

  const heading = el('h3', 'tactile-map-step-heading');
  heading.id = `${id}-heading`;
  heading.tabIndex = -1;
  wrap.appendChild(heading);

  const body = el('div', 'tactile-map-step-body');
  const sections = names.map((name, i) => {
    const section = el('section', 'tactile-map-step');
    section.id = `${id}-step-${i + 1}`;
    section.setAttribute('aria-labelledby', heading.id);
    section.hidden = true;
    body.appendChild(section);
    return section;
  });
  wrap.appendChild(body);

  const actions = el('div', 'braille-translate-row tactile-map-step-actions');
  const back = el('button', 'btn btn-secondary braille-translate-btn', S.back);
  back.type = 'button';
  back.id = `${id}-back`;
  const next = el('button', 'btn btn-primary braille-translate-btn', S.next);
  next.type = 'button';
  next.id = `${id}-next`;
  const reason = el('span', 'braille-panel-help tactile-map-step-reason');
  reason.id = `${id}-reason`;
  actions.appendChild(back);
  actions.appendChild(next);
  actions.appendChild(reason);
  wrap.appendChild(actions);

  let current = 0;
  let reached = 0;

  function renderList() {
    list.replaceChildren(
      ...names.map((name, i) => {
        const li = el('li', 'tactile-map-steps-item');
        if (i <= reached) {
          const go = el('button', 'tactile-map-step-link', name);
          go.type = 'button';
          if (i === current) go.setAttribute('aria-current', 'step');
          go.addEventListener('click', () => show(i));
          li.appendChild(go);
        } else {
          li.appendChild(el('span', 'tactile-map-step-later', name));
        }
        return li;
      })
    );
  }

  /** Next's state and its reason, from the current step's need. */
  function refresh() {
    const last = current === names.length - 1;
    next.hidden = last;
    back.hidden = current === 0 && !onBackFromFirst;
    const why = last ? null : need(current);
    next.disabled = Boolean(why);
    reason.textContent = why || '';
    if (why) next.setAttribute('aria-describedby', reason.id);
    else next.removeAttribute('aria-describedby');
  }

  function show(index, { focus = true } = {}) {
    current = Math.max(0, Math.min(names.length - 1, index));
    reached = Math.max(reached, current);
    sections.forEach((s, i) => {
      s.hidden = i !== current;
    });
    heading.textContent = S.heading(current + 1, names.length, names[current]);
    renderList();
    refresh();
    onShow(current);
    if (focus) heading.focus();
  }

  back.addEventListener('click', () => {
    if (current === 0) onBackFromFirst?.();
    else show(current - 1);
  });
  next.addEventListener('click', () => {
    if (!next.disabled) show(current + 1);
  });

  show(0, { focus: false });

  return {
    el: wrap,
    sections,
    show,
    index: () => current,
    refresh,
  };
}
