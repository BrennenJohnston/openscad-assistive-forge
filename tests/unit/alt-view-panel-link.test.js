/**
 * The Features Guide's Alt View tab links to We Go Places, the game that
 * began here, at its own site. The link opens a new tab in the Forge's
 * pattern (noopener, and a screen-reader suffix that says so), and it stands
 * only inside the panel the Alt View unlock reveals.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..');
const ADDRESS = 'https://we-go-places.pages.dev/';

function panel() {
  document.documentElement.innerHTML = readFileSync(
    resolvePath(root, 'index.html'),
    'utf-8'
  );
  return document.getElementById('featuresPanelAltView');
}

describe("the Alt View tab's link to We Go Places", () => {
  it('opens the site in a new tab, by the pattern of the other new-tab links', () => {
    const link = panel().querySelector(`a[href="${ADDRESS}"]`);
    expect(link, `a link to ${ADDRESS} in the Alt View panel`).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    const rel = (link.getAttribute('rel') || '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('tells a screen reader that it opens a new tab', () => {
    const link = panel().querySelector(`a[href="${ADDRESS}"]`);
    const name = link.textContent.replace(/\s+/g, ' ').trim();
    expect(name).toBe('Open We Go Places (opens in new tab)');
    const suffix = link.querySelector('.sr-only');
    expect(suffix, 'the suffix is screen-reader-only').not.toBeNull();
    expect(suffix.textContent.replace(/\s+/g, ' ').trim()).toBe(
      '(opens in new tab)'
    );
  });

  it('stands under its own heading, inside the panel the unlock reveals', () => {
    const p = panel();
    expect(p.hasAttribute('data-hfm-gated')).toBe(true);
    const heading = [...p.querySelectorAll('h4')].find(
      (h) => h.textContent.trim() === 'We Go Places'
    );
    expect(heading, 'the heading "We Go Places"').toBeTruthy();
    const paragraph = heading.nextElementSibling;
    expect(paragraph.tagName).toBe('P');
    expect(paragraph.querySelector(`a[href="${ADDRESS}"]`)).not.toBeNull();
    // Nowhere else in the page: one door, where the unlock reveals it.
    expect(document.querySelectorAll(`a[href="${ADDRESS}"]`).length).toBe(1);
  });
});
