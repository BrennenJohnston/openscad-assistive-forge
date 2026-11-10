/**
 * A panel holds the page's Generate button while its own steps come first:
 * the button reads as unavailable but keeps its place in the Tab order, and
 * a press shows the panel's note above it and says it once, instead of
 * generating.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/js/announcer.js', () => ({ announce: vi.fn() }));
import { announce } from '../../src/js/announcer.js';
import {
  holdPrimaryAction,
  releasePrimaryAction,
  primaryActionHeld,
  showHoldNote,
  hideHoldNote,
} from '../../src/js/primary-action-hold.js';

const NOTE = "Finish the map's steps first.";
const button = () => document.getElementById('primaryActionBtn');
const note = () => document.getElementById('primaryActionHoldNote');

beforeEach(() => {
  releasePrimaryAction();
  document.body.innerHTML =
    '<div class="actions-primary"><button type="button" id="primaryActionBtn" class="btn btn-primary">Generate</button></div>';
  vi.clearAllMocks();
});

describe('holding Generate', () => {
  it('marks the button unavailable but never disabled, so it keeps focus, and lets it go', () => {
    holdPrimaryAction(NOTE);
    expect(primaryActionHeld()).toBe(true);
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
    releasePrimaryAction();
    expect(primaryActionHeld()).toBe(false);
    expect(button().hasAttribute('aria-disabled')).toBe(false);
  });

  it('shows the note above the button and says it, once a press, only while held', () => {
    expect(showHoldNote()).toBe(false);
    expect(note()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    holdPrimaryAction(NOTE);
    expect(showHoldNote()).toBe(true);
    expect(note().textContent).toBe(NOTE);
    expect(note().hidden).toBe(false);
    expect(note().hasAttribute('role')).toBe(false);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(NOTE, {
      source: 'primary-action-hold',
    });
    expect(showHoldNote()).toBe(true);
    expect(document.querySelectorAll('#primaryActionHoldNote')).toHaveLength(
      1
    );
  });

  it('takes the note away when it is hidden and when the hold is let go', () => {
    holdPrimaryAction(NOTE);
    showHoldNote();
    hideHoldNote();
    expect(note()).toBeNull();
    showHoldNote();
    releasePrimaryAction();
    expect(note()).toBeNull();
  });

  it('holds a button that arrives after the hold began', () => {
    document.body.innerHTML = '';
    holdPrimaryAction(NOTE);
    document.body.innerHTML =
      '<button type="button" id="primaryActionBtn">Generate</button>';
    expect(showHoldNote()).toBe(true);
    expect(button().getAttribute('aria-disabled')).toBe('true');
  });
});
