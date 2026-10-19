/**
 * The shared tab list: one Tab stop, arrows that wrap, Home and End, a click.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTabList } from '../../src/js/tablist.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div role="tablist" id="list">
      <button role="tab" id="t1" aria-controls="p1" aria-selected="true" tabindex="0">One</button>
      <button role="tab" id="t2" aria-controls="p2" aria-selected="false" tabindex="-1">Two</button>
      <button role="tab" id="t3" aria-controls="p3" aria-selected="false" tabindex="-1">Three</button>
    </div>
    <div role="tabpanel" id="p1">1</div>
    <div role="tabpanel" id="p2" hidden>2</div>
    <div role="tabpanel" id="p3" hidden>3</div>
  `;
});

const tab = (id) => document.getElementById(id);
const key = (target, name) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  );
const shown = () =>
  ['p1', 'p2', 'p3'].filter((id) => !document.getElementById(id).hidden);

describe('a tab list', () => {
  it('keeps one Tab stop, the selected tab, and shows its panel alone', () => {
    const tabs = createTabList({
      tablist: tab('list'),
      tabs: [tab('t1'), tab('t2'), tab('t3')],
    });
    tabs.select(tab('t2'));
    expect(['t1', 't2', 't3'].map((id) => tab(id).tabIndex)).toEqual([-1, 0, -1]);
    expect(tab('t2').getAttribute('aria-selected')).toBe('true');
    expect(shown()).toEqual(['p2']);
    expect(document.activeElement).toBe(tab('t2'));
    expect(tabs.selected()).toBe(tab('t2'));
  });

  it('Right and Left move the selection and wrap', () => {
    createTabList({ tablist: tab('list'), tabs: () => [tab('t1'), tab('t2'), tab('t3')] });
    tab('t1').focus();
    key(tab('t1'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('t3'));
    key(tab('t3'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('t1'));
    key(tab('t1'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('t2'));
    expect(shown()).toEqual(['p2']);
  });

  it('Home and End go to the ends; a click selects; the caller hears each', () => {
    const onSelect = vi.fn();
    createTabList({
      tablist: tab('list'),
      tabs: [tab('t1'), tab('t2'), tab('t3')],
      onSelect,
    });
    key(tab('t1'), 'End');
    expect(document.activeElement).toBe(tab('t3'));
    key(tab('t3'), 'Home');
    expect(document.activeElement).toBe(tab('t1'));
    tab('t2').click();
    expect(tab('t2').getAttribute('aria-selected')).toBe('true');
    expect(onSelect.mock.calls.map(([t]) => t.id)).toEqual(['t3', 't1', 't2']);
  });

  it('leaves other keys alone', () => {
    createTabList({ tablist: tab('list'), tabs: [tab('t1'), tab('t2')] });
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    tab('t1').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
