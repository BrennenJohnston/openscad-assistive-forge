/**
 * Notices about the parameters on screen, that stay until they are read.
 *
 * WHY THIS EXISTS. When a shared link carries a value the model does not allow,
 * Forge adjusts it and says so. That sentence used to be unreachable - the
 * "Ready, N parameters loaded" line overwrote it in the same tick (D-98) - and
 * once that was fixed it was still a STATUS: measured, it stood for about
 * 660 ms before the render replaced it. Someone who looked up late never
 * learned their number had been changed, and the number is the whole point of
 * the link they were sent.
 *
 * So this is a notice, not a status. It names each parameter, what the link
 * asked for and what it became, and it stays on screen until dismissed.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Turn one sanitizer adjustment into a sentence a person can act on.
 *
 * The sanitizer's own record is a reason code plus the numbers; nobody should
 * have to read `{reason: 'max', maximum: 100}` to find out their 999 became a
 * 100.
 *
 * @param {string} name - Parameter name
 * @param {Object} adjustment - From sanitizeUrlParams
 * @param {*} applied - The value actually in use now, when there is one
 * @returns {string}
 */
export function adjustmentSentence(name, adjustment, applied) {
  const asked = adjustment?.value;
  switch (adjustment?.reason) {
    case 'unknown-param':
      return `${name} is not a parameter of this design, so it was ignored.`;
    case 'enum':
      return (
        `${name} was set to ${JSON.stringify(asked)}, which is not one of ` +
        `its choices, so the design's own value was kept.`
      );
    case 'min':
      return (
        `${name} was set to ${asked}, below the lowest allowed value. ` +
        `It is now ${applied ?? adjustment.minimum}.`
      );
    case 'max':
      return (
        `${name} was set to ${asked}, above the highest allowed value. ` +
        `It is now ${applied ?? adjustment.maximum}.`
      );
    default:
      return `${name} was adjusted to fit what this design allows.`;
  }
}

/**
 * Build the notice's sentences from a whole adjustment record.
 *
 * @param {Object} adjustments - name -> adjustment, from sanitizeUrlParams
 * @param {Object} [appliedValues] - The values now in use
 * @returns {{title: string, lines: string[]}|null} null when nothing changed
 */
export function describeAdjustments(adjustments, appliedValues = {}) {
  const names = Object.keys(adjustments || {});
  if (names.length === 0) return null;
  return {
    title:
      names.length === 1
        ? 'One value in this link was changed to fit the design'
        : `${names.length} values in this link were changed to fit the design`,
    lines: names.map((name) =>
      adjustmentSentence(name, adjustments[name], appliedValues[name])
    ),
  };
}

/**
 * Create the notice area.
 *
 * @param {HTMLElement} container - Where notices are rendered
 * @param {Object} [deps]
 * @param {Function} [deps.announce] - Speak a sentence
 * @returns {{show: Function, clear: Function}}
 */
export function createParameterNotices(container, { announce } = {}) {
  function clear() {
    if (!container) return;
    container.replaceChildren();
    container.hidden = true;
  }

  /**
   * Show a dismissible notice. Replaces any notice already showing: two
   * link-adjustment notices at once would mean the older one is about a
   * project that is no longer loaded.
   *
   * @param {{title: string, lines: string[]}} notice
   */
  function show(notice) {
    if (!container || !notice) return;
    clear();

    const box = document.createElement('div');
    box.className = 'parameter-notice';
    // Not role="alert": that interrupts, and this is information about
    // something that has already happened. The container is a polite live
    // region, which announces it once without cutting anything off.
    box.setAttribute('data-notice', 'url-adjustments');

    const heading = document.createElement('p');
    heading.className = 'parameter-notice-title';
    heading.textContent = notice.title;

    const list = document.createElement('ul');
    list.className = 'parameter-notice-list';
    for (const line of notice.lines) {
      const item = document.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn btn-sm btn-ghost parameter-notice-dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.setAttribute(
      'aria-label',
      'Dismiss the notice about changed values'
    );
    dismiss.addEventListener('click', () => {
      clear();
      if (typeof announce === 'function') {
        announce('Notice dismissed.');
      }
    });

    box.append(heading, list, dismiss);
    container.appendChild(box);
    container.hidden = false;

    if (typeof announce === 'function') {
      announce([notice.title, ...notice.lines].join(' '));
    }
  }

  return { show, clear };
}
