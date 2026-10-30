/**
 * The Tactile Map Designer's address section: a typed address or place
 * name, a Search press, and up to five places to pick from. Nothing is sent
 * until the press (Nominatim forbids autocomplete), one search a second,
 * and every sentence goes once through the announcer under the panel's
 * source, on a status line of its own.
 *
 * The geocoder is handed in (the panel loads it as a lazy chunk on the first
 * press; a test stubs it) and resolves `[{ name, lat, lon, kind }]`, or
 * rejects with a `code`: 'empty', 'rate', 'no-answer'.
 *
 * @license GPL-3.0-or-later
 */

export const ADDRESS_STRINGS = Object.freeze({
  heading: 'Map from an address',
  label: 'Address or place',
  help: 'A street address, an intersection, or the name of a place. Nothing is sent until you press Search.',
  search: 'Search',
  /** A11Y: the status line while a search runs. */
  searching: (q) => `Searching for ${q}...`,
  /** A11Y: nothing found. */
  none: (q) => `No place found for ${q}. Try adding the city or a postal code.`,
  /** A11Y: the results group's name. */
  found: 'Places found',
  /** A11Y: after a pick. */
  picked: (name) =>
    `${name} picked. Choose a radius and the landmarks, then get the map data.`,
  /** A11Y: the search did not answer. */
  noAnswer:
    'The address search did not answer. Check your connection and try again, or load an OpenStreetMap file instead.',
  /** A11Y: a second search within a second. */
  rate: 'One search a second; try again in a moment.',
  /** A11Y: nothing typed. */
  empty: 'Type an address or a place first.',
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build the section.
 *
 * @param {object} args
 * @param {(query: string) => Promise<Array<{name: string, lat: number, lon: number, kind: string}>>} args.searchPlaces
 * @param {(text: string, failed?: boolean) => void} args.say - writes the status line and announces once
 * @param {(place: {name: string, lat: number, lon: number, kind: string}) => void} args.onPlace
 * @returns {{ el: HTMLElement, refs: object, getPlace: () => object|null, destroy: () => void }}
 */
export function createAddressSection({ searchPlaces, say, onPlace }) {
  const S = ADDRESS_STRINGS;
  const section = el(
    'section',
    'braille-panel tactile-map-panel tactile-map-address'
  );
  section.id = 'tactileMapAddressSection';
  section.setAttribute('aria-labelledby', 'tactileMapAddressHeading');

  const heading = el('h2', 'braille-panel-heading', S.heading);
  heading.id = 'tactileMapAddressHeading';
  section.appendChild(heading);

  const label = el('label', 'braille-panel-label', S.label);
  label.htmlFor = 'tactileMapAddress';
  section.appendChild(label);

  const help = el('p', 'braille-panel-help', S.help);
  help.id = 'tactileMapAddressHelp';
  section.appendChild(help);

  const row = el('div', 'braille-translate-row tactile-map-address-row');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'tactileMapAddress';
  input.className = 'braille-panel-number tactile-map-address-input';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-describedby', 'tactileMapAddressHelp');
  input.enterKeyHint = 'search';
  const button = el(
    'button',
    'btn btn-primary braille-translate-btn',
    S.search
  );
  button.type = 'button';
  button.id = 'tactileMapSearch';
  row.appendChild(input);
  row.appendChild(button);
  section.appendChild(row);

  const results = el('fieldset', 'braille-panel-choice tactile-map-results');
  results.id = 'tactileMapResults';
  results.hidden = true;
  results.appendChild(el('legend', '', S.found));
  section.appendChild(results);

  const status = el('p', 'braille-panel-help');
  status.id = 'tactileMapAddressStatus';
  status.setAttribute('role', 'status');
  section.appendChild(status);

  let place = null;
  let running = false;

  function clearResults() {
    results.hidden = true;
    for (const node of [...results.children]) {
      if (node.tagName !== 'LEGEND') node.remove();
    }
  }

  function showResults(places) {
    clearResults();
    places.forEach((p, i) => {
      const line = el('div', 'braille-panel-toggle-row');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'tactileMapPlace';
      radio.id = `tactileMapPlace${i + 1}`;
      radio.value = String(i);
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        place = p;
        onPlace?.(p);
        say(S.picked(p.name));
      });
      const text = el('label', '', p.name);
      text.htmlFor = radio.id;
      line.appendChild(radio);
      line.appendChild(text);
      results.appendChild(line);
    });
    results.hidden = places.length === 0;
    status.textContent = '';
    results.querySelector('input[type="radio"]')?.focus();
  }

  async function search() {
    if (running) return;
    const q = input.value.trim();
    if (!q) {
      say(S.empty, true);
      input.focus();
      return;
    }
    running = true;
    button.disabled = true;
    say(S.searching(q));
    try {
      const places = await searchPlaces(q);
      if (!places || places.length === 0) {
        clearResults();
        place = null;
        say(S.none(q), true);
      } else {
        showResults(places);
      }
    } catch (error) {
      clearResults();
      if (error?.code === 'rate') say(S.rate, true);
      else if (error?.code === 'empty') say(S.empty, true);
      else say(S.noAnswer, true);
    } finally {
      running = false;
      button.disabled = false;
    }
  }

  button.addEventListener('click', () => {
    search();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      search();
    }
  });

  return {
    el: section,
    refs: { input, button, results, status },
    getPlace: () => place,
    destroy() {
      section.remove();
    },
  };
}
