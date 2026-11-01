/**
 * The numbered steps of a map type: a list of the steps in a nav, a heading
 * that says which step of how many, one section shown at a time, Back and
 * Next, and Next held until the step's need is met, with the reason beside
 * it.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSteps, STEP_STRINGS } from '../../src/js/tactile-map/steps.js';

const NAMES = [
  'Where',
  'How much ground',
  'What to show',
  'Make the map',
  'Check and print',
];

function mount(options = {}) {
  const steps = createSteps({ id: 'mapSteps', names: NAMES, ...options });
  document.body.appendChild(steps.el);
  return steps;
}

const q = (sel) => document.querySelector(sel);
const back = () => q('#mapSteps-back');
const next = () => q('#mapSteps-next');
const heading = () => q('#mapSteps-heading');
const items = () => [...document.querySelectorAll('#mapSteps nav li')];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createSteps', () => {
  it('lists the steps in a nav named Steps, the first current, and heads the step with its number', () => {
    const steps = mount();
    const nav = q('#mapSteps nav');
    expect(nav.getAttribute('aria-label')).toBe('Steps');
    expect(nav.querySelector('ol')).toBeTruthy();
    expect(items().map((li) => li.textContent)).toEqual(NAMES);
    expect(items()[0].querySelector('[aria-current="step"]')).toBeTruthy();
    // A step not reached yet is text, not a control.
    expect(items()[2].querySelector('button')).toBeNull();
    expect(heading().tagName).toBe('H3');
    expect(heading().textContent).toBe('Step 1 of 5: Where');
    expect(heading().getAttribute('tabindex')).toBe('-1');
    expect(heading().getAttribute('aria-live')).toBeNull();
    expect(steps.sections).toHaveLength(5);
    expect(steps.sections.map((s) => s.hidden)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(STEP_STRINGS.heading(2, 5, 'How much ground')).toBe(
      'Step 2 of 5: How much ground'
    );
  });

  it('holds Next until the step is ready, with the reason beside it, and lets it go when the need is met', () => {
    let picked = false;
    const steps = mount({
      need: (i) => (i === 0 && !picked ? 'Pick a place first.' : null),
    });
    expect(next().disabled).toBe(true);
    const reason = q('#mapSteps-reason');
    expect(reason.textContent).toBe('Pick a place first.');
    expect(next().getAttribute('aria-describedby')).toBe('mapSteps-reason');
    picked = true;
    steps.refresh();
    expect(next().disabled).toBe(false);
    expect(reason.textContent).toBe('');
    expect(next().hasAttribute('aria-describedby')).toBe(false);
  });

  it('moves on with Next, focusing the heading so it is read once, and says each step when shown', () => {
    const onShow = vi.fn();
    mount({ onShow });
    expect(onShow).toHaveBeenCalledWith(0);
    next().click();
    expect(heading().textContent).toBe('Step 2 of 5: How much ground');
    expect(document.activeElement).toBe(heading());
    expect(onShow).toHaveBeenLastCalledWith(1);
    expect(items()[1].querySelector('[aria-current="step"]')).toBeTruthy();
    expect(items()[0].querySelector('[aria-current]')).toBeNull();
  });

  it('goes back with Back, keeping what was entered in the step before', () => {
    const steps = mount();
    const input = document.createElement('input');
    steps.sections[0].appendChild(input);
    input.value = '3800 E Stevens Way NE';
    next().click();
    back().click();
    expect(heading().textContent).toBe('Step 1 of 5: Where');
    expect(steps.sections[0].hidden).toBe(false);
    expect(input.value).toBe('3800 E Stevens Way NE');
  });

  it('jumps to a step already reached from the list, by its button', () => {
    const steps = mount();
    next().click();
    next().click();
    expect(steps.index()).toBe(2);
    const first = items()[0].querySelector('button');
    expect(first.textContent).toBe('Where');
    first.click();
    expect(steps.index()).toBe(0);
    expect(document.activeElement).toBe(heading());
    // Steps reached stay reachable.
    expect(items()[2].querySelector('button')).toBeTruthy();
  });

  it('hides Back on the first step unless there is somewhere to go back to, and Next on the last', () => {
    const steps = mount();
    expect(back().hidden).toBe(true);
    steps.show(4);
    expect(next().hidden).toBe(true);
    expect(back().hidden).toBe(false);

    document.body.innerHTML = '';
    const onBackFromFirst = vi.fn();
    mount({ onBackFromFirst });
    expect(back().hidden).toBe(false);
    back().click();
    expect(onBackFromFirst).toHaveBeenCalled();
  });

  it('hands focus to the heading before a control it held is hidden or rebuilt, so focus never falls to the page', () => {
    mount();
    // Each control that has focus when it goes: Next on the way to the last
    // step (it hides there), and a step's button in the list (rebuilt).
    const focusedWhenHidden = [];
    const hiddenSetter = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'hidden'
    );
    Object.defineProperty(next(), 'hidden', {
      configurable: true,
      get() {
        return hiddenSetter.get.call(this);
      },
      set(value) {
        if (value && document.activeElement === this)
          focusedWhenHidden.push('Next');
        hiddenSetter.set.call(this, value);
      },
    });
    for (let i = 0; i < 4; i += 1) {
      next().focus();
      next().click();
    }
    expect(heading().textContent).toBe('Step 5 of 5: Check and print');
    expect(next().hidden).toBe(true);
    expect(focusedWhenHidden).toEqual([]);
    expect(document.activeElement).toBe(heading());

    const firstStep = items()[0].querySelector('button');
    firstStep.focus();
    // It loses focus by a blur while still in the page, not by removal.
    const blurred = [];
    firstStep.addEventListener('blur', () =>
      blurred.push(firstStep.isConnected)
    );
    firstStep.click();
    expect(heading().textContent).toBe('Step 1 of 5: Where');
    expect(firstStep.isConnected).toBe(false);
    expect(blurred).toEqual([true]);
    expect(document.activeElement).toBe(heading());
  });

  it('gives Back and Next the app button classes, so they meet the touch floor', () => {
    mount();
    expect(back().type).toBe('button');
    expect(next().type).toBe('button');
    expect(back().classList.contains('btn')).toBe(true);
    expect(next().classList.contains('btn-primary')).toBe(true);
    expect(back().textContent).toBe('Back');
    expect(next().textContent).toBe('Next');
  });
});
