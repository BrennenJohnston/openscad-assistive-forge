/**
 * The conversion dialog (DP-52 P2): the markup, the names, the focus path,
 * the page made inert behind it, and the one sentence it speaks.
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createConversionDialog,
  CONVERSION_STAGE_TEXT,
} from '../../src/js/conversion-dialog.js';

describe('the conversion dialog (DP-52)', () => {
  let app;
  let trigger;

  beforeEach(() => {
    app = document.createElement('div');
    app.id = 'app';
    trigger = document.createElement('button');
    trigger.textContent = 'Start conversion';
    app.appendChild(trigger);
    document.body.appendChild(app);
    trigger.focus();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('is a dialog named by its heading, with a named bar and one Cancel button', () => {
    const d = createConversionDialog({ onCancel: vi.fn() });
    expect(d.root.getAttribute('role')).toBe('dialog');
    expect(d.root.getAttribute('aria-modal')).toBe('true');
    const title = d.root.querySelector('h2');
    expect(d.root.getAttribute('aria-labelledby')).toBe(title.id);
    expect(d.bar.tagName).toBe('PROGRESS');
    expect(d.bar.getAttribute('aria-labelledby')).toBe(title.id);
    const buttons = d.root.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Cancel');
    expect(buttons[0].getAttribute('aria-label')).toBe('Cancel the conversion');
    // Not in the document until it is needed.
    expect(d.root.isConnected).toBe(false);
    d.destroy();
  });

  it('★ open: on screen, named for the file, focus on Cancel, the page behind inert, one sentence spoken', async () => {
    const d = createConversionDialog({ onCancel: vi.fn() });
    d.open('logo.png');
    expect(d.isOpen()).toBe(true);
    expect(d.root.isConnected).toBe(true);
    expect(d.root.classList.contains('hidden')).toBe(false);
    expect(d.root.getAttribute('aria-hidden')).toBe('false');
    expect(d.root.querySelector('h2').textContent).toBe('Converting logo.png');
    // The shared trap moves focus on the next frame.
    await vi.waitFor(() => expect(document.activeElement).toBe(d.cancelButton));
    // The app root is inert: the attribute a browser reads, and the property.
    expect(app.hasAttribute('inert')).toBe(true);
    expect(app.inert).toBe(true);
    // The dialog itself is outside the inert subtree.
    expect(app.contains(d.root)).toBe(false);
    const status = d.root.querySelector('[role="status"]');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(
      'Converting logo.png. You can cancel at any time.'
    );
    // The bar starts indeterminate, and the first stage is on screen.
    expect(d.bar.hasAttribute('value')).toBe(false);
    expect(d.root.querySelector('.conversion-dialog-stage').textContent).toBe(
      CONVERSION_STAGE_TEXT.reading
    );
    d.destroy();
  });

  it('a stage moves the bar and the sentence; a stage with no count leaves the bar indeterminate', () => {
    const d = createConversionDialog({ onCancel: vi.fn() });
    d.open('logo.png');
    d.stage({ stage: 'preparing', index: 3, total: 5 });
    expect(d.bar.value).toBe(3);
    expect(d.bar.max).toBe(5);
    expect(d.root.querySelector('.conversion-dialog-stage').textContent).toBe(
      'Preparing the drawing'
    );
    d.stage({ stage: 'updating', index: 4, total: 5 });
    expect(d.root.querySelector('.conversion-dialog-stage').textContent).toBe(
      'Updating the charm'
    );
    d.stage({ stage: 'ink' });
    expect(d.bar.hasAttribute('value')).toBe(false);
    expect(d.root.querySelector('.conversion-dialog-stage').textContent).toBe(
      'Finding the ink'
    );
    d.destroy();
  });

  it('a host with no charm can name its last stage differently', () => {
    const d = createConversionDialog({
      onCancel: vi.fn(),
      stageText: { updating: 'Opening the drawing editor' },
    });
    d.open('bird.png');
    d.stage({ stage: 'updating', index: 4, total: 5 });
    expect(d.root.querySelector('.conversion-dialog-stage').textContent).toBe(
      'Opening the drawing editor'
    );
    d.destroy();
  });

  it('★ Cancel calls the host; a click on the overlay does not', () => {
    const onCancel = vi.fn();
    const d = createConversionDialog({ onCancel });
    d.open('logo.png');
    d.root.querySelector('.modal-overlay').click();
    expect(onCancel).not.toHaveBeenCalled();
    d.cancelButton.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    d.destroy();
  });

  it('★ close: the page is live again, the dialog is hidden, and focus goes back where it was', () => {
    const d = createConversionDialog({ onCancel: vi.fn() });
    d.open('logo.png');
    d.stage({ stage: 'tracing', index: 2, total: 5 });
    d.close();
    expect(d.isOpen()).toBe(false);
    expect(app.hasAttribute('inert')).toBe(false);
    expect(app.inert).toBe(false);
    expect(d.root.classList.contains('hidden')).toBe(true);
    expect(d.root.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(trigger);
    expect(d.root.querySelector('[role="status"]').textContent).toBe('');
    expect(d.bar.hasAttribute('value')).toBe(false);
    // Idempotent both ways.
    d.close();
    expect(app.hasAttribute('inert')).toBe(false);
    d.open('again.png');
    d.open('again.png');
    expect(d.root.querySelector('h2').textContent).toBe('Converting again.png');
    d.destroy();
    expect(d.root.isConnected).toBe(false);
    expect(app.hasAttribute('inert')).toBe(false);
  });

  it('a host can say where focus goes back to, for a button it has already hidden', () => {
    const d = createConversionDialog({ onCancel: vi.fn() });
    // Start was pressed, then hidden before the dialog opened: the active
    // element is the body by then, and the body is nowhere to return to.
    trigger.hidden = true;
    // A browser drops focus from an element that goes hidden; jsdom does not,
    // so the drop is made explicit here.
    trigger.blur();
    expect(document.activeElement).toBe(document.body);
    d.open('logo.png', { returnTo: trigger });
    trigger.hidden = false;
    d.close();
    expect(document.activeElement).toBe(trigger);
    d.destroy();
  });

  it('Escape does not cancel the conversion', () => {
    const onCancel = vi.fn();
    const d = createConversionDialog({ onCancel });
    d.open('logo.png');
    d.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(onCancel).not.toHaveBeenCalled();
    expect(d.isOpen()).toBe(true);
    d.destroy();
  });
});
