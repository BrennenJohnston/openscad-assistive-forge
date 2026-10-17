/**
 * The phone Customizer's width and how solid it is: the bounds, what is
 * kept, the grip's keys and the Preferences setting.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CUSTOMIZER_DEFAULT_SHARE,
  CUSTOMIZER_OPACITY_DEFAULT,
  clampCustomizerOpacity,
  customizerWidthBounds,
  customizerWidthPx,
  initPhoneCustomizer,
  loadCustomizerOpacity,
  loadCustomizerShare,
} from '../../src/js/phone-customizer.js';

const WIDTH_KEY = 'openscad-forge-phone-customizer-width';
const OPACITY_KEY = 'openscad-forge-phone-customizer-opacity';

function setViewportWidth(px) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: px,
  });
}

const rootVar = (name) =>
  document.documentElement.style.getPropertyValue(name).trim();

describe('the phone Customizer width', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(412);
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stays between 280 px and the screen less a 44 px strip', () => {
    expect(customizerWidthBounds(412)).toEqual({ min: 280, max: 368 });
    // On a screen too narrow for both, the strip wins.
    expect(customizerWidthBounds(320)).toEqual({ min: 276, max: 276 });
  });

  it('opens at 75% of the width when nothing is kept, and within bounds', () => {
    expect(CUSTOMIZER_DEFAULT_SHARE).toBe(0.75);
    expect(customizerWidthPx(0.75, 412)).toBe(309);
    expect(customizerWidthPx(Number.NaN, 412)).toBe(309);
    expect(customizerWidthPx(0.1, 412)).toBe(280);
    expect(customizerWidthPx(1, 412)).toBe(368);
  });

  it('keeps the width as a share of the screen, and ignores a bad value', () => {
    expect(loadCustomizerShare()).toBe(0.75);
    localStorage.setItem(WIDTH_KEY, '0.7');
    expect(loadCustomizerShare()).toBe(0.7);
    localStorage.setItem(WIDTH_KEY, 'wide');
    expect(loadCustomizerShare()).toBe(0.75);
  });

  it("the grip's keys move it as the desktop divider's do, and the width is kept", () => {
    document.body.innerHTML =
      '<div id="paramPanel"></div><div id="customizerWidthGrip" tabindex="0"></div>';
    const panel = document.getElementById('paramPanel');
    const grip = document.getElementById('customizerWidthGrip');
    // A width kept from before, so the steps below start from 85%.
    localStorage.setItem(WIDTH_KEY, '0.85');
    initPhoneCustomizer({ panel, grip });
    expect(rootVar('--phone-customizer-width')).toBe('350px');
    expect(grip.getAttribute('aria-valuenow')).toBe('85');
    expect(grip.getAttribute('aria-valuemin')).toBe('68');
    expect(grip.getAttribute('aria-valuemax')).toBe('89');
    expect(grip.getAttribute('aria-valuetext')).toBe(
      "Customizer 85% of the screen's width"
    );

    const press = (key, shiftKey = false) =>
      grip.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
      );
    press('ArrowLeft');
    // 2% of 412 px is 8.24 px.
    expect(rootVar('--phone-customizer-width')).toBe('342px');
    expect(Number(localStorage.getItem(WIDTH_KEY))).toBeCloseTo(342 / 412, 2);
    press('ArrowLeft', true);
    expect(rootVar('--phone-customizer-width')).toBe('321px');
    press('Home');
    expect(rootVar('--phone-customizer-width')).toBe('280px');
    press('End');
    expect(rootVar('--phone-customizer-width')).toBe('368px');
    expect(grip.getAttribute('aria-valuenow')).toBe('89');

    // A key the grip does not use is left alone.
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    grip.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('how solid the phone Customizer is', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is 90% when nothing is kept, on steps of 5 from 65 to 100', () => {
    expect(CUSTOMIZER_OPACITY_DEFAULT).toBe(90);
    expect(loadCustomizerOpacity()).toBe(90);
    expect(clampCustomizerOpacity(62)).toBe(65);
    expect(clampCustomizerOpacity(87)).toBe(85);
    expect(clampCustomizerOpacity(101)).toBe(100);
    expect(clampCustomizerOpacity('solid')).toBe(90);
    localStorage.setItem(OPACITY_KEY, '40');
    expect(loadCustomizerOpacity()).toBe(65);
  });

  it('the Preferences slider sets it, shows it and keeps it', () => {
    document.body.innerHTML = `
      <div id="paramPanel"></div>
      <input type="range" id="prefsCustomizerOpacity" />
      <span id="prefsCustomizerOpacityValue"></span>`;
    initPhoneCustomizer({
      panel: document.getElementById('paramPanel'),
      grip: null,
    });
    const input = document.getElementById('prefsCustomizerOpacity');
    const value = document.getElementById('prefsCustomizerOpacityValue');
    expect(rootVar('--customizer-opacity')).toBe('90%');
    expect([input.min, input.max, input.step, input.value]).toEqual([
      '65',
      '100',
      '5',
      '90',
    ]);
    expect(value.textContent).toBe('90%');
    input.value = '70';
    input.dispatchEvent(new Event('input'));
    expect(rootVar('--customizer-opacity')).toBe('70%');
    expect(value.textContent).toBe('70%');
    expect(localStorage.getItem(OPACITY_KEY)).toBe('70');
  });
});
