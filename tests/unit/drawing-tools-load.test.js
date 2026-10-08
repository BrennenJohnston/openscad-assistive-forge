/**
 * When the drawing tools cannot load.
 *
 * The drawing geometry loads on demand (svg-geometry.js), so it can fail to
 * arrive: offline before it was ever cached, or in a tab left open across a
 * site update. Then choosing a file says so in plain words, with a next
 * step, and the browser's technical message stays in the console. And the
 * background starts (when a picture control appears, and the hole check on
 * every parameter change of a design-shaped charm) never reach the app's
 * unhandled-rejection handler, whose "An unexpected error occurred." would
 * arrive before the person has done anything.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderParameterUI } from '../../src/js/ui-generator.js';
import { announceChange } from '../../src/js/announcer.js';

// One of the geometry modules fails to load, as a chunk does offline.
vi.mock('../../src/js/hole-placement.js', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('../../src/js/announcer.js', () => ({
  announceChange: vi.fn(),
  announceImmediate: vi.fn(),
}));

const NOT_LOADED =
  'The drawing tools did not load. Check your connection, then choose the file again.';

function schemaWith(params) {
  const parameters = {};
  params.forEach((param, index) => {
    parameters[param.name] = {
      order: index,
      group: 'Design',
      description: '',
      ...param,
    };
  });
  return {
    groups: [{ id: 'Design', label: 'Design', order: 0 }],
    parameters,
  };
}

const pictureParam = {
  name: 'design_file',
  type: 'file',
  default: '',
  uiType: 'file',
  acceptedExtensions: ['svg', 'png'],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('when the drawing tools cannot load', () => {
  let container;
  let unhandled;
  const onUnhandled = (reason) => unhandled.push(reason);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(announceChange).mockClear();
  });

  afterEach(async () => {
    await settle();
    process.off('unhandledRejection', onUnhandled);
    container.remove();
    vi.restoreAllMocks();
  });

  it('a picture control appearing says nothing yet', async () => {
    renderParameterUI(schemaWith([pictureParam]), container, vi.fn(), {});
    await settle();
    expect(unhandled).toEqual([]);
    expect(announceChange).not.toHaveBeenCalled();
  });

  it('choosing a file says so in plain words, with a next step', async () => {
    renderParameterUI(schemaWith([pictureParam]), container, vi.fn(), {});
    const input = container.querySelector('input[type="file"]');
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await settle();

    const info = container.querySelector('.file-info');
    expect(info.textContent).toBe(NOT_LOADED);
    expect(info.classList.contains('file-info--error')).toBe(true);
    expect(announceChange).toHaveBeenCalledWith(NOT_LOADED);
    expect(unhandled).toEqual([]);
  });

  it('a charm parameter change leaves the hole check undone, quietly', async () => {
    const schema = schemaWith([
      {
        name: 'design_silhouette',
        type: 'file',
        default: '',
        uiType: 'file',
        acceptedExtensions: ['svg'],
      },
      {
        name: 'charm_width',
        type: 'number',
        default: 30,
        minimum: 10,
        maximum: 60,
        step: 1,
        uiType: 'slider',
      },
    ]);
    const onChange = vi.fn();
    renderParameterUI(schema, container, onChange, {});
    const slider = container.querySelector('input[type="range"]');
    slider.value = '31';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(onChange).toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(announceChange).not.toHaveBeenCalled();
  });
});
