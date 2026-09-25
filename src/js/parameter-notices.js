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
 * The notice for a link that names a preset the project does not have (D-195).
 * It used to be a status line that stood about 300 ms before the render
 * replaced it, and the announcer replaced it at once: nobody learned that no
 * preset was applied.
 *
 * @param {string} name - The preset name the link asked for
 * @returns {{title: string, lines: string[], kind: string, dismissLabel: string}}
 */
export function describeMissingPreset(name) {
  return {
    kind: 'missing-preset',
    title: 'This link asks for a preset this project does not have',
    lines: [
      `There is no preset named "${name}". No preset was applied. You can choose one under Presets.`,
    ],
    dismissLabel: 'Dismiss the notice about the preset',
  };
}

/**
 * Create the notice area.
 *
 * @param {HTMLElement} container - Where notices are rendered
 * @param {Object} [deps]
 * @param {Function} [deps.announce] - Speak a sentence
 * @returns {{show: Function, add: Function, clear: Function}}
 */
export function createParameterNotices(container, { announce } = {}) {
  function clear() {
    if (!container) return;
    container.replaceChildren();
    container.hidden = true;
  }

  /**
   * Build one notice, with a Dismiss button that removes this notice alone.
   *
   * @param {{title: string, lines: string[], kind?: string, dismissLabel?: string}} notice
   * @returns {HTMLElement}
   */
  function build(notice) {
    const box = document.createElement('div');
    box.className = 'parameter-notice';
    // Not role="alert": that interrupts, and this is information about
    // something that has already happened. The container is a polite live
    // region, which announces it once without cutting anything off.
    box.setAttribute('data-notice', notice.kind || 'url-adjustments');

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
      notice.dismissLabel || 'Dismiss the notice about changed values'
    );
    dismiss.addEventListener('click', () => {
      box.remove();
      // The button took the focus away with it. When another notice is
      // still showing, the focus goes to its Dismiss button.
      const next = container.querySelector('.parameter-notice-dismiss');
      if (next) {
        next.focus();
      } else {
        container.hidden = true;
      }
      if (typeof announce === 'function') {
        announce('Notice dismissed.');
      }
    });

    box.append(heading, list, dismiss);
    return box;
  }

  function reveal(notice, box) {
    container.appendChild(box);
    container.hidden = false;
    if (typeof announce === 'function') {
      announce([notice.title, ...notice.lines].join(' '));
    }
  }

  /**
   * Show a dismissible notice. Replaces any notice already showing: two
   * link-adjustment notices at once would mean the older one is about a
   * project that is no longer loaded.
   *
   * @param {{title: string, lines: string[], kind?: string, dismissLabel?: string}} notice
   */
  function show(notice) {
    if (!container || !notice) return;
    clear();
    reveal(notice, build(notice));
  }

  /**
   * Show a notice beside the ones already showing, for a second thing the
   * same link has to say. D-195: a missing preset is found after a changed
   * value or an unknown starter setting was reported, and saying it must not
   * erase them. With nothing showing, this is show().
   *
   * @param {{title: string, lines: string[], kind?: string, dismissLabel?: string}} notice
   */
  function add(notice) {
    if (!container || !notice) return;
    if (!container.querySelector('.parameter-notice')) {
      show(notice);
      return;
    }
    reveal(notice, build(notice));
  }

  return { show, add, clear };
}
