import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  renderParameterUI,
  setLimitsUnlocked,
  areLimitsUnlocked,
  getAllDefaults,
  getDefaultValue,
  resetParameter,
  updateDependentParameters,
  setGalleryOptions,
  clearGalleryOptions,
  appendUserSvgToGallery,
  getSvgPrepMetadata,
  setSvgPrepMetadata,
  clearSvgPrepMetadata,
  isAspectCompanionParam,
  findLayerParams,
  findSilhouetteParams,
  findPlateParams,
  isLayerCompanionParam,
} from '../../src/js/ui-generator.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEnabled } from '../../src/js/feature-flags.js';
import {
  analyzeSvg,
  prepareSvg,
  measureSvgAspect,
} from '../../src/js/svg-preparer.js';

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

vi.mock('../../src/js/svg-preparer.js', () => ({
  prepareSvg: vi.fn((svg) => svg),
  needsPreparation: vi.fn(() => false),
  measureSvgAspect: vi.fn(() => 1),
  parseSvgElements: vi.fn(() => []),
  classifyElements: vi.fn((els) => els),
  flattenLayers: vi.fn(() => []),
  flattenSilhouette: vi.fn(() => null),
  LAYER_EMIT_CAP: 3,
  analyzeSvg: vi.fn(() => ({
    status: 'ready',
    recommendation: 'pass_through',
    elements: [],
    warnings: [],
  })),
}));

const buildParams = ({ groups = null, params = [] }) => {
  const resolvedGroups = groups || [
    { id: 'General', label: 'General', order: 0 },
  ];
  const parameters = {};
  params.forEach((param, index) => {
    const groupId = param.group || resolvedGroups[0].id;
    parameters[param.name] = {
      order: index,
      group: groupId,
      description: '',
      ...param,
    };
  });
  return { groups: resolvedGroups, parameters };
};

describe('UI Generator', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container?.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Number Parameters', () => {
    it('renders a slider control when uiType is slider', () => {
      const schema = buildParams({
        groups: [{ id: 'Dimensions', label: 'Dimensions', order: 0 }],
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 10,
            maximum: 100,
            step: 1,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      const spinbox = container.querySelector('.slider-spinbox');
      expect(slider).toBeTruthy();
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('100');
      expect(slider.value).toBe('50');
      // Value is now in editable spinbox instead of read-only output
      expect(spinbox).toBeTruthy();
      expect(spinbox.value).toBe('50');
    });

    it('calls onChange with updated values when slider changes', () => {
      const schema = buildParams({
        groups: [{ id: 'Dimensions', label: 'Dimensions', order: 0 }],
        params: [
          {
            name: 'height',
            type: 'number',
            default: 40,
            minimum: 10,
            maximum: 80,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      slider.value = 70;
      slider.dispatchEvent(new Event('input'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ height: 70 });
    });

    it('spinbox step is independent from slider step for integer ranges', () => {
      // Item 10 desktop parity: [0:50:10000] slider steps by 50, spinbox must step by 1
      const schema = buildParams({
        groups: [{ id: 'Dimensions', label: 'Dimensions', order: 0 }],
        params: [
          {
            name: 'width',
            type: 'integer',
            default: 5000,
            minimum: 0,
            maximum: 10000,
            step: 50,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      const spinbox = container.querySelector('.slider-spinbox');
      expect(slider).toBeTruthy();
      expect(spinbox).toBeTruthy();
      // Slider step should be the annotation step (50)
      expect(slider.step).toBe('50');
      // Spinbox step must be 1 for integers (desktop OpenSCAD parity)
      expect(spinbox.step).toBe('1');
    });

    it('spinbox step is "any" for float ranges', () => {
      // Item 10 desktop parity: float spinbox accepts precise decimal input
      const schema = buildParams({
        groups: [{ id: 'Settings', label: 'Settings', order: 0 }],
        params: [
          {
            name: 'tolerance',
            type: 'number',
            default: 2.5,
            minimum: 0,
            maximum: 10,
            step: 0.5,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      const spinbox = container.querySelector('.slider-spinbox');
      expect(slider).toBeTruthy();
      expect(spinbox).toBeTruthy();
      // Slider step should be the annotation step (0.5)
      expect(slider.step).toBe('0.5');
      // Spinbox step must be "any" for floats (accepts precise values like 3.14)
      expect(spinbox.step).toBe('any');
    });

    it('spinbox has correct inputmode for integers and floats', () => {
      const schema = buildParams({
        groups: [{ id: 'Dims', label: 'Dims', order: 0 }],
        params: [
          {
            name: 'int_param',
            type: 'integer',
            default: 50,
            minimum: 0,
            maximum: 100,
            step: 10,
            uiType: 'slider',
          },
          {
            name: 'float_param',
            type: 'number',
            default: 1.5,
            minimum: 0,
            maximum: 5,
            step: 0.1,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const spinboxes = container.querySelectorAll('.slider-spinbox');
      expect(spinboxes.length).toBe(2);
      // Integer should use numeric inputmode
      expect(spinboxes[0].getAttribute('inputmode')).toBe('numeric');
      // Float should use decimal inputmode
      expect(spinboxes[1].getAttribute('inputmode')).toBe('decimal');
    });

    it('spinbox accepts arbitrary typed values not constrained by slider step', () => {
      // The core Item 10 bug: typing 1234 into a [0:50:10000] spinbox must work
      const schema = buildParams({
        groups: [{ id: 'Dims', label: 'Dims', order: 0 }],
        params: [
          {
            name: 'length',
            type: 'integer',
            default: 5000,
            minimum: 0,
            maximum: 10000,
            step: 50,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const spinbox = container.querySelector('.slider-spinbox');
      expect(spinbox).toBeTruthy();
      // Simulate typing an arbitrary value
      spinbox.value = '1234';
      spinbox.dispatchEvent(new Event('change', { bubbles: true }));
      // onChange should receive the exact typed value, not rounded to step 50
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ length: 1234 });
    });

    it('renders a number input when uiType is input and type is number', () => {
      const schema = buildParams({
        groups: [{ id: 'Settings', label: 'Settings', order: 0 }],
        params: [
          {
            name: 'count',
            type: 'number',
            default: 5,
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const input = container.querySelector('input[type="number"]');
      expect(input).toBeTruthy();
      expect(input.value).toBe('5');
    });
  });

  describe('Text Parameters', () => {
    it('renders a text input when uiType is input and type is string', () => {
      const schema = buildParams({
        groups: [{ id: 'Text', label: 'Text', order: 0 }],
        params: [
          {
            name: 'label',
            type: 'string',
            default: 'Hello',
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const input = container.querySelector('input[type="text"]');
      expect(input).toBeTruthy();
      expect(input.value).toBe('Hello');
    });

    it('updates values when text input changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'message',
            type: 'string',
            default: 'test',
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const input = container.querySelector('input[type="text"]');
      input.value = 'new message';
      input.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ message: 'new message' });
    });
  });

  describe('Enum Parameters', () => {
    it('renders a select dropdown for uiType select', () => {
      const schema = buildParams({
        params: [
          {
            name: 'shape',
            type: 'string',
            default: 'circle',
            enum: ['circle', 'square', 'triangle'],
            uiType: 'select',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const select = container.querySelector('select');
      expect(select).toBeTruthy();
      expect(select.value).toBe('circle');
      expect(select.options.length).toBe(3);
    });

    it('calls onChange when dropdown value changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'shape',
            type: 'string',
            default: 'circle',
            enum: ['circle', 'square'],
            uiType: 'select',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const select = container.querySelector('select');
      select.value = 'square';
      select.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ shape: 'square' });
    });
  });

  describe('Toggle Parameters', () => {
    it('renders a toggle switch for uiType toggle', () => {
      const schema = buildParams({
        params: [
          {
            name: 'enabled',
            type: 'string',
            default: 'yes',
            enum: ['yes', 'no'],
            uiType: 'toggle',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(true);
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
    });

    it('updates values when toggle changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'enabled',
            type: 'string',
            default: 'no',
            enum: ['yes', 'no'],
            uiType: 'toggle',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const checkbox = container.querySelector('input[type="checkbox"]');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ enabled: 'yes' });
    });

    it('renders toggle for boolean type parameters (true/false)', () => {
      const schema = buildParams({
        params: [
          {
            name: 'rounded',
            type: 'boolean',
            default: true,
            uiType: 'toggle',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(true);
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
    });

    it('returns true/false strings for boolean type toggles', () => {
      const schema = buildParams({
        params: [
          {
            name: 'rounded',
            type: 'boolean',
            default: true,
            uiType: 'toggle',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const checkbox = container.querySelector('input[type="checkbox"]');
      // Toggle off (was true, now false)
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ rounded: 'false' });
    });

    it('handles boolean default value of false', () => {
      const schema = buildParams({
        params: [
          {
            name: 'solid',
            type: 'boolean',
            default: false,
            uiType: 'toggle',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(false);
      expect(checkbox.getAttribute('aria-checked')).toBe('false');

      // Toggle on
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toEqual({ solid: 'true' });
    });
  });

  describe('Color and File Parameters', () => {
    it('renders a color picker when uiType is color', () => {
      const schema = buildParams({
        params: [
          {
            name: 'color',
            type: 'color',
            default: '#FF0000',
            uiType: 'color',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const colorInput = container.querySelector('input[type="color"]');
      expect(colorInput).toBeTruthy();
      expect(colorInput.value.toLowerCase()).toBe('#ff0000');
    });

    it('renders a file upload control when uiType is file', () => {
      const schema = buildParams({
        params: [
          {
            name: 'logo',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['png', 'jpg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeTruthy();
      expect(fileInput.accept).toBe('.png,.jpg');
    });
  });

  describe('Groups and Labels', () => {
    it('creates collapsible groups with correct labels', () => {
      const schema = buildParams({
        groups: [
          { id: 'GroupA', label: 'Group A', order: 0 },
          { id: 'GroupB', label: 'Group B', order: 1 },
        ],
        params: [
          {
            name: 'param1',
            type: 'number',
            default: 10,
            uiType: 'input',
            group: 'GroupA',
          },
          {
            name: 'param2',
            type: 'string',
            default: 'test',
            uiType: 'input',
            group: 'GroupB',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const groups = container.querySelectorAll('details.param-group');
      const summaries = container.querySelectorAll('summary');
      expect(groups.length).toBe(2);
      expect(
        summaries[0].querySelector('.param-group-label')?.textContent ??
          summaries[0].textContent.replace(/✕$/, '')
      ).toBe('Group A');
      expect(
        summaries[1].querySelector('.param-group-label')?.textContent ??
          summaries[1].textContent.replace(/✕$/, '')
      ).toBe('Group B');
    });

    it('skips groups with no parameters', () => {
      const schema = buildParams({
        groups: [
          { id: 'Empty', label: 'Empty Group', order: 0 },
          { id: 'Filled', label: 'Filled Group', order: 1 },
        ],
        params: [
          {
            name: 'param',
            type: 'number',
            default: 2,
            uiType: 'input',
            group: 'Filled',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const summaries = Array.from(container.querySelectorAll('summary')).map(
        (el) =>
          el.querySelector('.param-group-label')?.textContent ??
          el.textContent.replace(/✕$/, '')
      );
      expect(summaries).toEqual(['Filled Group']);
    });

    it('does not render parameters for groups not listed', () => {
      const schema = buildParams({
        groups: [{ id: 'Visible', label: 'Visible', order: 0 }],
        params: [
          {
            name: 'visible_param',
            type: 'number',
            default: 10,
            uiType: 'input',
            group: 'Visible',
          },
          {
            name: 'hidden_param',
            type: 'number',
            default: 99,
            uiType: 'input',
            group: 'Hidden',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      expect(container.textContent).toContain('visible param');
      expect(container.textContent).not.toContain('hidden param');
    });

    it('formats parameter names by replacing underscores with spaces', () => {
      const schema = buildParams({
        params: [
          {
            name: 'palm_loop_height',
            type: 'number',
            default: 30,
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const label = container.querySelector('label');
      expect(label.textContent).toContain('palm loop height');
    });
  });

  describe('Accessibility and Defaults', () => {
    it('sets aria-label for sliders', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 0,
            maximum: 100,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      // Slider aria-label contains parameter name
      expect(slider.getAttribute('aria-label')).toContain('width');
      expect(slider.getAttribute('aria-label')).toContain('slider');
      // Current value is in aria-valuenow attribute
      expect(slider.getAttribute('aria-valuenow')).toBe('50');
    });

    it('includes help tooltips when descriptions are provided', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 0,
            maximum: 100,
            uiType: 'slider',
            description: 'The width of the object',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const helpButton = container.querySelector('.param-help-button');
      expect(helpButton).toBeTruthy();
      expect(helpButton.getAttribute('aria-label')).toContain('Help for width');
    });

    it('uses initial values instead of defaults when provided', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 0,
            maximum: 100,
            uiType: 'slider',
          },
          {
            name: 'name',
            type: 'string',
            default: 'default',
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {
        width: 75,
        name: 'custom',
      });

      const slider = container.querySelector('input[type="range"]');
      const textInput = container.querySelector('input[type="text"]');
      expect(slider.value).toBe('75');
      expect(textInput.value).toBe('custom');
    });
  });

  describe('Limits Management', () => {
    it('tracks unlock state via setLimitsUnlocked and areLimitsUnlocked', () => {
      // Initially should be false (reset state)
      setLimitsUnlocked(false);
      expect(areLimitsUnlocked()).toBe(false);

      setLimitsUnlocked(true);
      expect(areLimitsUnlocked()).toBe(true);

      setLimitsUnlocked(false);
      expect(areLimitsUnlocked()).toBe(false);
    });

    it('unlocks slider limits when setLimitsUnlocked(true) is called', () => {
      const schema = buildParams({
        params: [
          {
            name: 'value',
            type: 'number',
            default: 50,
            minimum: 10,
            maximum: 100,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('100');

      setLimitsUnlocked(true);

      // Limits should be expanded
      expect(parseFloat(slider.min)).toBeLessThan(10);
      expect(parseFloat(slider.max)).toBeGreaterThan(100);

      setLimitsUnlocked(false);

      // Limits should be restored
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('100');
    });

    it('clamps slider value when limits are restored', () => {
      const schema = buildParams({
        params: [
          {
            name: 'test_value',
            type: 'number',
            default: 50,
            minimum: 10,
            maximum: 100,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const slider = container.querySelector('input[type="range"]');

      // Unlock and set value outside normal range
      setLimitsUnlocked(true);
      slider.value = 150;

      // Now restore limits - value should be clamped
      setLimitsUnlocked(false);
      expect(parseFloat(slider.value)).toBeLessThanOrEqual(100);
    });

    it('unlocks number input limits when setLimitsUnlocked(true) is called', () => {
      const schema = buildParams({
        params: [
          {
            name: 'count',
            type: 'number',
            default: 5,
            minimum: 1,
            maximum: 10,
            uiType: 'input',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const numberInput = container.querySelector('input[type="number"]');
      expect(numberInput.min).toBe('1');
      expect(numberInput.max).toBe('10');

      setLimitsUnlocked(true);

      // Min/max should be removed
      expect(numberInput.hasAttribute('min')).toBe(false);
      expect(numberInput.hasAttribute('max')).toBe(false);

      setLimitsUnlocked(false);

      // Limits should be restored
      expect(numberInput.min).toBe('1');
      expect(numberInput.max).toBe('10');
    });
  });

  describe('Default Values', () => {
    it('stores and retrieves default values via getAllDefaults and getDefaultValue', () => {
      const schema = buildParams({
        params: [
          { name: 'width', type: 'number', default: 100, uiType: 'input' },
          { name: 'label', type: 'string', default: 'test', uiType: 'input' },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const defaults = getAllDefaults();
      expect(defaults.width).toBe(100);
      expect(defaults.label).toBe('test');

      expect(getDefaultValue('width')).toBe(100);
      expect(getDefaultValue('label')).toBe('test');
      expect(getDefaultValue('nonexistent')).toBeUndefined();
    });
  });

  describe('Parameter Reset', () => {
    it('resets a slider parameter to its default value', () => {
      const schema = buildParams({
        params: [
          {
            name: 'height',
            type: 'number',
            default: 25,
            minimum: 0,
            maximum: 50,
            uiType: 'slider',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, { height: 40 });

      const slider = container.querySelector('input[type="range"]');
      expect(slider.value).toBe('40');

      const result = resetParameter('height', onChange);

      expect(result).toBe(25);
      expect(slider.value).toBe('25');
    });

    it('resets a select parameter to its default value', () => {
      const schema = buildParams({
        params: [
          {
            name: 'shape',
            type: 'string',
            default: 'circle',
            enum: ['circle', 'square', 'triangle'],
            uiType: 'select',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, { shape: 'square' });

      const select = container.querySelector('select');
      expect(select.value).toBe('square');

      resetParameter('shape', onChange);

      expect(select.value).toBe('circle');
    });

    it('returns undefined when resetting non-existent parameter', () => {
      const schema = buildParams({
        params: [
          { name: 'width', type: 'number', default: 50, uiType: 'input' },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const result = resetParameter('nonexistent', onChange);
      expect(result).toBeUndefined();
    });
  });

  describe('Dependent Parameters', () => {
    it('updates dependent parameter visibility when parent changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'mode',
            type: 'string',
            default: 'simple',
            enum: ['simple', 'advanced'],
            uiType: 'select',
          },
          {
            name: 'detail_level',
            type: 'number',
            default: 5,
            minimum: 1,
            maximum: 10,
            uiType: 'slider',
            dependency: {
              parameter: 'mode',
              operator: '==',
              value: 'advanced',
            },
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const detailControl = container.querySelector(
        '[data-param-name="detail_level"]'
      );

      // Initially hidden (mode is 'simple') - uses .hidden class per UI_STANDARDS.md
      expect(detailControl.classList.contains('hidden')).toBe(true);

      // Change mode to advanced
      updateDependentParameters('mode', 'advanced');

      // Should now be visible
      expect(detailControl.classList.contains('hidden')).toBe(false);
    });

    it('handles != operator in dependencies', () => {
      const schema = buildParams({
        params: [
          {
            name: 'type',
            type: 'string',
            default: 'basic',
            enum: ['basic', 'none'],
            uiType: 'select',
          },
          {
            name: 'options',
            type: 'number',
            default: 3,
            uiType: 'input',
            dependency: { parameter: 'type', operator: '!=', value: 'none' },
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const optionsControl = container.querySelector(
        '[data-param-name="options"]'
      );

      // Initially visible (type != none) - no .hidden class
      expect(optionsControl.classList.contains('hidden')).toBe(false);

      // Change type to 'none'
      updateDependentParameters('type', 'none');

      // Should now be hidden - uses .hidden class per UI_STANDARDS.md
      expect(optionsControl.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Unit Display', () => {
    it('displays unit suffix in slider when parameter has unit', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 10,
            maximum: 100,
            uiType: 'slider',
            unit: 'mm',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      // Value is in the editable spinbox input
      const spinbox = container.querySelector('.slider-spinbox');
      expect(spinbox).toBeTruthy();
      expect(spinbox.value).toBe('50');
      // Unit is displayed as a separate label
      const unitLabel = container.querySelector('.slider-unit');
      expect(unitLabel).toBeTruthy();
      expect(unitLabel.textContent).toBe('mm');
    });

    it('displays degree symbol for angle parameters', () => {
      const schema = buildParams({
        params: [
          {
            name: 'rotation_angle',
            type: 'number',
            default: 45,
            minimum: 0,
            maximum: 360,
            uiType: 'slider',
            unit: '°',
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      // Value is in the editable spinbox input
      const spinbox = container.querySelector('.slider-spinbox');
      expect(spinbox).toBeTruthy();
      expect(spinbox.value).toBe('45');
      // Unit (degree symbol) is displayed as a separate label
      const unitLabel = container.querySelector('.slider-unit');
      expect(unitLabel).toBeTruthy();
      expect(unitLabel.textContent).toBe('°');
    });
  });

  describe('SVG Gallery Picker', () => {
    afterEach(() => {
      clearGalleryOptions();
    });

    it('renders gallery when galleryOptions are registered for a file param', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
        { file: 'star.svg', label: 'Star', url: '/examples/star.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg', 'png', 'jpg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const gallery = container.querySelector('.svg-gallery');
      expect(gallery).toBeTruthy();

      const listbox = gallery.querySelector('[role="listbox"]');
      expect(listbox).toBeTruthy();

      const options = gallery.querySelectorAll('[role="option"]');
      expect(options.length).toBe(2);
      expect(options[0].title).toBe('Heart');
      expect(options[1].title).toBe('Star');
    });

    it('does not render gallery when no galleryOptions are registered', () => {
      const schema = buildParams({
        params: [
          {
            name: 'logo_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const gallery = container.querySelector('.svg-gallery');
      expect(gallery).toBeFalsy();
    });

    it('gallery options have accessible labels and thumbnails', () => {
      setGalleryOptions('design_file', [
        { file: 'flower.svg', label: 'Flower', url: '/examples/flower.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const option = container.querySelector('[role="option"]');
      expect(option).toBeTruthy();
      expect(option.getAttribute('aria-selected')).toBe('false');

      const thumb = option.querySelector('img');
      expect(thumb).toBeTruthy();
      expect(thumb.alt).toBe('Flower');
      expect(thumb.src).toContain('/examples/flower.svg');

      const label = option.querySelector('.svg-gallery-label');
      expect(label).toBeTruthy();
      expect(label.textContent).toBe('Flower');
    });

    it('gallery listbox has proper ARIA attributes', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).toBeTruthy();
      expect(listbox.getAttribute('aria-labelledby')).toBe(
        'gallery-heading-design_file'
      );
      expect(listbox.getAttribute('tabindex')).toBe('0');

      const heading = container.querySelector('#gallery-heading-design_file');
      expect(heading).toBeTruthy();
      expect(heading.textContent).toBe('Choose a design');
    });

    it('clearGalleryOptions removes gallery on re-render', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});
      expect(container.querySelector('.svg-gallery')).toBeTruthy();

      clearGalleryOptions();
      renderParameterUI(schema, container, onChange, {});
      expect(container.querySelector('.svg-gallery')).toBeFalsy();
    });

    it('gallery options support keyboard navigation', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
        { file: 'star.svg', label: 'Star', url: '/examples/star.svg' },
        { file: 'moon.svg', label: 'Moon', url: '/examples/moon.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).toBeTruthy();

      // Navigate right
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
      const options = container.querySelectorAll('[role="option"]');
      expect(options[0].getAttribute('aria-selected')).toBe('true');

      // Navigate right again
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
      expect(options[0].getAttribute('aria-selected')).toBe('false');
      expect(options[1].getAttribute('aria-selected')).toBe('true');

      // Navigate to end
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      );
      expect(options[2].getAttribute('aria-selected')).toBe('true');

      // Navigate to home
      listbox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      );
      expect(options[0].getAttribute('aria-selected')).toBe('true');
    });

    it('appendUserSvgToGallery creates exactly one "Your uploads" heading for multiple uploads', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      appendUserSvgToGallery('design_file', {
        file: 'upload1.svg',
        label: 'Upload 1',
        url: '/uploads/upload1.svg',
        userUpload: true,
      });
      appendUserSvgToGallery('design_file', {
        file: 'upload2.svg',
        label: 'Upload 2',
        url: '/uploads/upload2.svg',
        userUpload: true,
      });
      appendUserSvgToGallery('design_file', {
        file: 'upload3.svg',
        label: 'Upload 3',
        url: '/uploads/upload3.svg',
        userUpload: true,
      });

      const gallery = container.querySelector('.svg-gallery');
      const headings = gallery.querySelectorAll('.svg-gallery-user-heading');
      expect(headings.length).toBe(1);
      expect(headings[0].textContent).toBe('Your uploads');

      const userListboxes = gallery.querySelectorAll(
        '.svg-gallery-user-listbox'
      );
      expect(userListboxes.length).toBe(1);

      const userOptions = userListboxes[0].querySelectorAll('[role="option"]');
      expect(userOptions.length).toBe(3);
    });

    it('appendUserSvgToGallery deduplicates by file name and userUpload flag', () => {
      setGalleryOptions('design_file', [
        { file: 'heart.svg', label: 'Heart', url: '/examples/heart.svg' },
      ]);

      const schema = buildParams({
        params: [
          {
            name: 'design_file',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['svg'],
          },
        ],
      });
      const onChange = vi.fn();

      renderParameterUI(schema, container, onChange, {});

      const svgOpt = {
        file: 'upload1.svg',
        label: 'Upload 1',
        url: '/uploads/upload1.svg',
        userUpload: true,
      };
      appendUserSvgToGallery('design_file', svgOpt);
      appendUserSvgToGallery('design_file', svgOpt);

      const userListbox = container.querySelector('.svg-gallery-user-listbox');
      const userOptions = userListbox.querySelectorAll('[role="option"]');
      expect(userOptions.length).toBe(1);
    });
  });

  // ── Phase 4a — SVG preparation integration ─────────────────────────────

  describe('SVG preparation editor integration', () => {
    const svgFileSchema = buildParams({
      params: [
        {
          name: 'svg_file',
          type: 'file',
          default: '',
          uiType: 'file',
          acceptedExtensions: ['svg'],
        },
      ],
    });

    const nonSvgFileSchema = buildParams({
      params: [
        {
          name: 'stl_file',
          type: 'file',
          default: '',
          uiType: 'file',
          acceptedExtensions: ['stl'],
        },
      ],
    });

    it('SVG file control contains a status card element', () => {
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const statusCard = container.querySelector('.svg-prep-status');
      expect(statusCard).toBeTruthy();
    });

    it('status card is hidden by default', () => {
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const statusCard = container.querySelector('.svg-prep-status');
      expect(statusCard.style.display).toBe('none');
    });

    it('status card has proper ARIA attributes', () => {
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const statusCard = container.querySelector('.svg-prep-status');
      expect(statusCard.getAttribute('role')).toBe('status');
      expect(statusCard.getAttribute('aria-live')).toBe('polite');
    });

    it('SVG file control contains a workspace container', () => {
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const wsContainer = container.querySelector(
        '.svg-prep-workspace-container'
      );
      expect(wsContainer).toBeTruthy();
    });

    it('SUPERSEDED by DP-19: the editor is built when it is opened, not when the control is', () => {
      // It used to be built eagerly into a container inside this control. It
      // lives in the PREVIEW AREA now and is built on the first "Open the
      // drawing editor", so a person who never opens it never pays for it.
      // What the old case was really pinning - that the editor exists, is a
      // region, and starts hidden - is pinned on the surface itself in
      // tests/unit/drawing-editor.test.js.
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});
      expect(container.querySelector('.svg-prep-workspace-container')).toBeTruthy();
      expect(container.querySelector('.svg-prep-workspace')).toBeNull();
    });

    it('non-SVG file control does not include a workspace container', () => {
      const onChange = vi.fn();
      renderParameterUI(nonSvgFileSchema, container, onChange, {});

      const wsContainer = container.querySelector(
        '.svg-prep-workspace-container'
      );
      expect(wsContainer).toBeFalsy();
    });

    it('status card is present even for non-SVG file controls', () => {
      const onChange = vi.fn();
      renderParameterUI(nonSvgFileSchema, container, onChange, {});

      const statusCard = container.querySelector('.svg-prep-status');
      expect(statusCard).toBeTruthy();
      expect(statusCard.style.display).toBe('none');
    });

    it('old Prepare SVG button is removed (Phase 4b)', () => {
      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const prepBtn = container.querySelector('.file-prepare-svg-button');
      expect(prepBtn).toBeNull();
    });
  });

  // ── Phase 5 — SVG prep metadata persistence ──────────────────────────

  describe('SVG prep metadata storage', () => {
    afterEach(() => {
      clearSvgPrepMetadata();
    });

    it('getSvgPrepMetadata returns null for unknown file', () => {
      expect(getSvgPrepMetadata('unknown.svg')).toBeNull();
    });

    it('setSvgPrepMetadata stores and retrieves metadata', () => {
      const meta = {
        rawSvg: '<svg></svg>',
        preparedSvg: '<svg>prep</svg>',
        prepOverrides: ['foreground', 'hole'],
        prepAnalysis: { elementCount: 2 },
      };
      setSvgPrepMetadata('test.svg', meta);
      expect(getSvgPrepMetadata('test.svg')).toEqual(meta);
    });

    it('setSvgPrepMetadata with null clears metadata', () => {
      setSvgPrepMetadata('test.svg', { rawSvg: '<svg/>' });
      setSvgPrepMetadata('test.svg', null);
      expect(getSvgPrepMetadata('test.svg')).toBeNull();
    });

    it('clearSvgPrepMetadata removes all entries', () => {
      setSvgPrepMetadata('a.svg', { rawSvg: 'a' });
      setSvgPrepMetadata('b.svg', { rawSvg: 'b' });
      clearSvgPrepMetadata();
      expect(getSvgPrepMetadata('a.svg')).toBeNull();
      expect(getSvgPrepMetadata('b.svg')).toBeNull();
    });

    it('clearGalleryOptions also clears SVG prep metadata', () => {
      setSvgPrepMetadata('test.svg', { rawSvg: '<svg/>' });
      clearGalleryOptions();
      expect(getSvgPrepMetadata('test.svg')).toBeNull();
    });

    it('metadata entries are independent per filename', () => {
      const meta1 = { rawSvg: '<svg>1</svg>', preparedSvg: null };
      const meta2 = { rawSvg: '<svg>2</svg>', preparedSvg: '<svg>2p</svg>' };
      setSvgPrepMetadata('one.svg', meta1);
      setSvgPrepMetadata('two.svg', meta2);

      expect(getSvgPrepMetadata('one.svg')).toEqual(meta1);
      expect(getSvgPrepMetadata('two.svg')).toEqual(meta2);

      setSvgPrepMetadata('one.svg', null);
      expect(getSvgPrepMetadata('one.svg')).toBeNull();
      expect(getSvgPrepMetadata('two.svg')).toEqual(meta2);
    });

    it('overwriting metadata replaces the previous entry', () => {
      setSvgPrepMetadata('test.svg', { rawSvg: 'old' });
      setSvgPrepMetadata('test.svg', {
        rawSvg: 'new',
        prepOverrides: ['ignore'],
      });

      const stored = getSvgPrepMetadata('test.svg');
      expect(stored.rawSvg).toBe('new');
      expect(stored.prepOverrides).toEqual(['ignore']);
    });
  });

  describe('Edit button in needs_review and unsupported status cards', () => {
    const svgFileSchema = buildParams({
      params: [
        {
          name: 'design_file',
          type: 'file',
          default: '',
          uiType: 'file',
          acceptedExtensions: ['svg'],
        },
      ],
    });

    beforeEach(() => {
      vi.mocked(isEnabled).mockReturnValue(true);
      vi.mocked(prepareSvg).mockImplementation((svg) => svg);
    });

    afterEach(() => {
      vi.mocked(isEnabled).mockReturnValue(false);
      vi.mocked(analyzeSvg).mockReset();
      vi.mocked(prepareSvg).mockReset();
    });

    async function uploadSvg(
      fileInput,
      svgContent = '<svg><path/><circle/></svg>'
    ) {
      const file = new File([svgContent], 'test.svg', {
        type: 'image/svg+xml',
      });
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    it('shows Edit button for needs_review status', async () => {
      vi.mocked(analyzeSvg).mockReturnValue({
        status: 'needs_review',
        recommendation: 'needs_review',
        elements: [{ type: 'path' }, { type: 'circle' }],
        warnings: [],
      });

      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const fileInput = container.querySelector('input[type="file"]');
      await uploadSvg(fileInput);

      const statusCard = container.querySelector('.svg-prep-status');
      const editBtn = statusCard.querySelector('.svg-prep-edit-btn');
      expect(editBtn).toBeTruthy();
      expect(editBtn.getAttribute('aria-label')).toBe(
        'Open the drawing editor'
      );
      // REVISED at DP-19: "Edit" did not say what it opened, and on a
      // stencil tile what it opens is the whole task.
      expect(editBtn.textContent).toBe('Open the drawing editor');

      const badge = statusCard.querySelector('.svg-prep-status-badge');
      expect(badge.dataset.level).toBe('review');
    });

    it('shows Edit button for unsupported status', async () => {
      vi.mocked(analyzeSvg).mockReturnValue({
        status: 'unsupported',
        recommendation: 'unsupported',
        elements: [{ type: 'text' }],
        warnings: ['Contains text elements'],
      });

      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const fileInput = container.querySelector('input[type="file"]');
      await uploadSvg(fileInput);

      const statusCard = container.querySelector('.svg-prep-status');
      const editBtn = statusCard.querySelector('.svg-prep-edit-btn');
      expect(editBtn).toBeTruthy();
      expect(editBtn.getAttribute('aria-label')).toBe(
        'Open the drawing editor'
      );

      const warnings = statusCard.querySelector('.svg-prep-status-warnings');
      expect(warnings).toBeTruthy();
      expect(warnings.textContent).toContain('Contains text elements');
    });

    it('Edit button has semantic button element with correct attributes', async () => {
      vi.mocked(analyzeSvg).mockReturnValue({
        status: 'needs_review',
        recommendation: 'needs_review',
        elements: [{ type: 'path' }],
        warnings: [],
      });

      const onChange = vi.fn();
      renderParameterUI(svgFileSchema, container, onChange, {});

      const fileInput = container.querySelector('input[type="file"]');
      await uploadSvg(fileInput);

      const editBtn = container.querySelector('.svg-prep-edit-btn');
      expect(editBtn.tagName).toBe('BUTTON');
      expect(editBtn.type).toBe('button');
      expect(editBtn.classList.contains('btn')).toBe(true);
      expect(editBtn.classList.contains('btn-ghost')).toBe(true);
    });
  });
});

import {
  setCustomizerFileId,
  getOpenGroupIdsFromDOM,
} from '../../src/js/ui-generator.js';

describe('UI Generator — F5 group collapse defaults', () => {
  let container;
  const threeGroupSchema = () => ({
    groups: [
      { id: 'Tablet', label: 'Tablet', order: 0 },
      { id: 'Grid Info', label: 'Grid Info', order: 1 },
      { id: 'Mounting', label: 'Mounting', order: 2 },
    ],
    parameters: {
      width: {
        name: 'width',
        order: 0,
        group: 'Tablet',
        type: 'number',
        default: 100,
        uiType: 'input',
      },
      cell_size: {
        name: 'cell_size',
        order: 0,
        group: 'Grid Info',
        type: 'number',
        default: 24,
        uiType: 'input',
      },
      mount_kind: {
        name: 'mount_kind',
        order: 0,
        group: 'Mounting',
        type: 'string',
        default: 'velcro',
        uiType: 'input',
      },
    },
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    setCustomizerFileId(null);
  });

  afterEach(() => {
    if (container?.parentNode) document.body.removeChild(container);
    setCustomizerFileId(null);
    localStorage.clear();
  });

  it('collapses every group on a fresh render with no stored state', () => {
    renderParameterUI(threeGroupSchema(), container, vi.fn(), {});
    const details = container.querySelectorAll('details.param-group');
    expect(details.length).toBe(3);
    details.forEach((d) => expect(d.open).toBe(false));
  });

  it('renders only the explicit openGroupIds when provided', () => {
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        openGroupIds: new Set(['Grid Info']),
      }
    );
    const byGroup = Array.from(
      container.querySelectorAll('details.param-group')
    ).reduce((acc, d) => {
      acc[d.dataset.groupId] = d.open;
      return acc;
    }, {});
    expect(byGroup).toEqual({
      Tablet: false,
      'Grid Info': true,
      Mounting: false,
    });
  });

  it('treats an explicit empty Set as "all collapsed"', () => {
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        openGroupIds: new Set(),
      }
    );
    container
      .querySelectorAll('details.param-group')
      .forEach((d) => expect(d.open).toBe(false));
  });

  it('uses stored state when useStoredState is true and a fileId is active', () => {
    setCustomizerFileId('keyguard.scad');
    localStorage.setItem(
      'openscad-forge-customizer-groups-keyguard.scad',
      JSON.stringify({ open: ['Tablet', 'Mounting'] })
    );
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        useStoredState: true,
      }
    );
    const open = getOpenGroupIdsFromDOM(container);
    expect([...open].sort()).toEqual(['Mounting', 'Tablet']);
  });

  it('falls back to all-collapsed when useStoredState is true but nothing is stored', () => {
    setCustomizerFileId('keyguard.scad');
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        useStoredState: true,
      }
    );
    container
      .querySelectorAll('details.param-group')
      .forEach((d) => expect(d.open).toBe(false));
  });

  it('preserves the current DOM open state on a re-render with no options', () => {
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        openGroupIds: new Set(['Grid Info']),
      }
    );
    expect(getOpenGroupIdsFromDOM(container).has('Grid Info')).toBe(true);

    renderParameterUI(threeGroupSchema(), container, vi.fn(), {});
    expect([...getOpenGroupIdsFromDOM(container)]).toEqual(['Grid Info']);
  });

  it('persists user toggles to localStorage when a fileId is active', () => {
    setCustomizerFileId('keyguard.scad');
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        useStoredState: true,
      }
    );

    const tablet = container.querySelector(
      'details.param-group[data-group-id="Tablet"]'
    );
    tablet.open = true;
    tablet.dispatchEvent(new Event('toggle'));

    const raw = localStorage.getItem(
      'openscad-forge-customizer-groups-keyguard.scad'
    );
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw).open).toEqual(['Tablet']);
  });

  it('does not persist toggles when no fileId is active', () => {
    setCustomizerFileId(null);
    renderParameterUI(threeGroupSchema(), container, vi.fn(), {});
    const tablet = container.querySelector(
      'details.param-group[data-group-id="Tablet"]'
    );
    tablet.open = true;
    tablet.dispatchEvent(new Event('toggle'));
    expect(localStorage.length).toBe(0);
  });

  it('forwards toggles to the optional onGroupToggle callback', () => {
    const cb = vi.fn();
    renderParameterUI(
      threeGroupSchema(),
      container,
      vi.fn(),
      {},
      {
        onGroupToggle: cb,
      }
    );
    const tablet = container.querySelector(
      'details.param-group[data-group-id="Tablet"]'
    );
    tablet.open = true;
    tablet.dispatchEvent(new Event('toggle'));
    expect(cb).toHaveBeenCalledWith('Tablet', true);
  });

  it('getOpenGroupIdsFromDOM returns an empty set on a null container', () => {
    expect(getOpenGroupIdsFromDOM(null).size).toBe(0);
  });
});

describe('Aspect companion parameters', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container?.parentNode) document.body.removeChild(container);
    vi.mocked(measureSvgAspect).mockReset();
  });

  const schema = () =>
    buildParams({
      params: [
        {
          name: 'design_file',
          type: 'file',
          default: '',
          uiType: 'file',
          acceptedExtensions: ['svg', 'png', 'jpg'],
        },
        {
          name: 'design_file_aspect',
          type: 'number',
          default: 1,
          uiType: 'input',
        },
        { name: 'design_scale', type: 'number', default: 100, uiType: 'input' },
      ],
    });

  async function uploadFile(fileInput, name, content, type) {
    const file = new File([content], name, { type });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  it('isAspectCompanionParam recognizes only real companions', () => {
    const { parameters } = schema();
    expect(isAspectCompanionParam('design_file_aspect', parameters)).toBe(true);
    expect(isAspectCompanionParam('design_scale', parameters)).toBe(false);
    expect(isAspectCompanionParam('orphan_aspect', parameters)).toBe(false);
  });

  it('renders no control for the companion but keeps its value', () => {
    const onChange = vi.fn();
    const values = renderParameterUI(schema(), container, onChange, {});
    expect(values.design_file_aspect).toBe(1);
    expect(container.querySelector('#param-design_file_aspect')).toBeFalsy();
    expect(container.querySelector('#param-design_scale')).toBeTruthy();
  });

  it('uploading an SVG commits the file and its measured aspect in ONE snapshot', async () => {
    vi.mocked(measureSvgAspect).mockReturnValue(2.5);
    const onChange = vi.fn();
    renderParameterUI(schema(), container, onChange, {});

    const fileInput = container.querySelector('input[type="file"]');
    await uploadFile(
      fileInput,
      'wide.svg',
      '<svg><rect width="10" height="4"/></svg>',
      'image/svg+xml'
    );

    const last = onChange.mock.calls.at(-1)[0];
    expect(last.design_file).toMatchObject({ name: 'wide.svg' });
    expect(last.design_file_aspect).toBe(2.5);
    // No snapshot may pair the new file with a stale aspect
    for (const call of onChange.mock.calls) {
      const v = call[0];
      if (v.design_file && typeof v.design_file === 'object') {
        expect(v.design_file_aspect).toBe(2.5);
      }
    }
  });

  it('clearing the file resets the companion to its declared default', async () => {
    vi.mocked(measureSvgAspect).mockReturnValue(3);
    const onChange = vi.fn();
    renderParameterUI(schema(), container, onChange, {});

    const fileInput = container.querySelector('input[type="file"]');
    await uploadFile(
      fileInput,
      'tall.svg',
      '<svg><rect width="4" height="12"/></svg>',
      'image/svg+xml'
    );
    expect(onChange.mock.calls.at(-1)[0].design_file_aspect).toBe(3);

    container.querySelector('.file-clear-button').click();
    const cleared = onChange.mock.calls.at(-1)[0];
    expect(cleared.design_file).toBeNull();
    expect(cleared.design_file_aspect).toBe(1);
  });

  it('an unmeasurable design falls back to the declared default', async () => {
    vi.mocked(measureSvgAspect).mockReturnValue(null);
    const onChange = vi.fn();
    renderParameterUI(schema(), container, onChange, {});

    const fileInput = container.querySelector('input[type="file"]');
    await uploadFile(fileInput, 'odd.svg', '<svg></svg>', 'image/svg+xml');
    expect(onChange.mock.calls.at(-1)[0].design_file_aspect).toBe(1);
  });

  it('a file param without a companion never calls the measurer', async () => {
    const bare = buildParams({
      params: [
        {
          name: 'logo_file',
          type: 'file',
          default: '',
          uiType: 'file',
          acceptedExtensions: ['svg'],
        },
      ],
    });
    const onChange = vi.fn();
    renderParameterUI(bare, container, onChange, {});

    const fileInput = container.querySelector('input[type="file"]');
    await uploadFile(
      fileInput,
      'plain.svg',
      '<svg><circle r="5"/></svg>',
      'image/svg+xml'
    );
    expect(vi.mocked(measureSvgAspect)).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)[0].logo_file).toMatchObject({
      name: 'plain.svg',
    });
  });
});

// ── DP-7 P3: per-layer companions through every emit path ────────────────────

describe('per-layer design companions (DP-7)', () => {
  const fileParam = (name) => ({
    name,
    uiType: 'file',
    type: 'string',
    default: '',
    group: 'General',
  });
  const numParam = (name) => ({
    name,
    uiType: 'number',
    type: 'number',
    default: 1,
    group: 'General',
  });

  describe('findLayerParams', () => {
    it('finds the layer files a layered tile declares', () => {
      const parameters = {
        design_file: fileParam('design_file'),
        design_layer_1: fileParam('design_layer_1'),
        design_layer_1_aspect: numParam('design_layer_1_aspect'),
        design_layer_2: fileParam('design_layer_2'),
        design_layer_2_aspect: numParam('design_layer_2_aspect'),
      };
      const found = findLayerParams(parameters.design_file, parameters);
      expect(found.map((f) => f.file.name)).toEqual([
        'design_layer_1',
        'design_layer_2',
      ]);
      expect(found[0].aspect.name).toBe('design_layer_1_aspect');
      expect(found[1].layer).toBe(2);
    });

    it('finds nothing for an ordinary tile, so nothing below it ever runs', () => {
      const parameters = { design_file: fileParam('design_file') };
      expect(findLayerParams(parameters.design_file, parameters)).toEqual([]);
    });

    it('stops at the first gap rather than skipping one', () => {
      // design_layer_2 without design_layer_1 is a malformed model, and
      // guessing which pass the person meant would build the wrong stack.
      const parameters = {
        design_file: fileParam('design_file'),
        design_layer_2: fileParam('design_layer_2'),
      };
      expect(findLayerParams(parameters.design_file, parameters)).toEqual([]);
    });

    it('never looks past the cap of three', () => {
      const parameters = { design_file: fileParam('design_file') };
      for (let n = 1; n <= 5; n++) {
        parameters[`design_layer_${n}`] = fileParam(`design_layer_${n}`);
      }
      expect(findLayerParams(parameters.design_file, parameters)).toHaveLength(
        3
      );
    });

    it('survives a missing parameter table', () => {
      expect(findLayerParams(null, {})).toEqual([]);
      expect(findLayerParams(fileParam('design_file'), null)).toEqual([]);
    });
  });

  describe('isLayerCompanionParam', () => {
    const parameters = {
      design_file: fileParam('design_file'),
      design_layer_1: fileParam('design_layer_1'),
      design_layer_1_aspect: numParam('design_layer_1_aspect'),
      wall_thickness: numParam('wall_thickness'),
    };

    it('recognises a layer file and its aspect', () => {
      expect(isLayerCompanionParam('design_layer_1', parameters)).toBe(true);
      expect(isLayerCompanionParam('design_layer_1_aspect', parameters)).toBe(
        true
      );
    });

    it('leaves ordinary parameters alone', () => {
      expect(isLayerCompanionParam('wall_thickness', parameters)).toBe(false);
      expect(isLayerCompanionParam('design_file', parameters)).toBe(false);
      // No design_file to hang off: not a companion, just a name.
      expect(isLayerCompanionParam('other_layer_1', parameters)).toBe(false);
    });
  });

  describe('the outline companion (DP-11)', () => {
    it('is found when a model can take its shape from the design', () => {
      const parameters = {
        design_file: fileParam('design_file'),
        design_silhouette: fileParam('design_silhouette'),
        design_silhouette_aspect: numParam('design_silhouette_aspect'),
      };
      const found = findSilhouetteParams(parameters.design_file, parameters);
      expect(found.file.name).toBe('design_silhouette');
      expect(found.aspect.name).toBe('design_silhouette_aspect');
    });

    it('is absent for a model that cannot', () => {
      const parameters = { design_file: fileParam('design_file') };
      expect(
        findSilhouetteParams(parameters.design_file, parameters)
      ).toBeNull();
      expect(findSilhouetteParams(null, null)).toBeNull();
    });

    it('gets a value but NO control, like the other companions', () => {
      const params = buildParams({
        params: [
          fileParam('design_file'),
          fileParam('design_silhouette'),
          numParam('design_silhouette_aspect'),
        ],
      });
      const el = document.createElement('div');
      document.body.appendChild(el);
      renderParameterUI(params, el, vi.fn(), {});
      expect(el.querySelector('#param-design_file')).toBeTruthy();
      expect(el.querySelector('#param-design_silhouette')).toBeNull();
      expect(el.querySelector('#param-design_silhouette_aspect')).toBeNull();
      el.remove();
    });
  });

  describe('the stencil plates (DP-12)', () => {
    it('are found when a tile builds them', () => {
      const parameters = {
        design_file: fileParam('design_file'),
        stencil_plate_1: fileParam('stencil_plate_1'),
        stencil_plate_2: fileParam('stencil_plate_2'),
        stencil_plate_3: fileParam('stencil_plate_3'),
      };
      expect(findPlateParams(parameters).map((p) => p.plate)).toEqual([
        1, 2, 3,
      ]);
    });

    it('stop at the first gap rather than skipping one', () => {
      const parameters = {
        stencil_plate_1: fileParam('stencil_plate_1'),
        stencil_plate_3: fileParam('stencil_plate_3'),
      };
      expect(findPlateParams(parameters)).toHaveLength(1);
    });

    it('are absent for an ordinary tile', () => {
      expect(
        findPlateParams({ design_file: fileParam('design_file') })
      ).toEqual([]);
      expect(findPlateParams(null)).toEqual([]);
    });

    it('get a value but NO control: the app writes them', () => {
      const params = buildParams({
        params: [
          fileParam('design_file'),
          fileParam('stencil_plate_1'),
          fileParam('stencil_plate_2'),
        ],
      });
      const el = document.createElement('div');
      document.body.appendChild(el);
      renderParameterUI(params, el, vi.fn(), {});
      expect(el.querySelector('#param-design_file')).toBeTruthy();
      expect(el.querySelector('#param-stencil_plate_1')).toBeNull();
      expect(el.querySelector('#param-stencil_plate_2')).toBeNull();
      el.remove();
    });
  });

  describe('the six emit paths', () => {
    it('every one of them goes through the SINGLE funnel', () => {
      // The six paths are upload, raster trace, editor Apply, editor Keep,
      // gallery pick, and clear-to-default. Rather than testing six sites and
      // hoping a seventh is never added, this pins the STRUCTURE that makes
      // all of them correct: the file control reports a value in exactly one
      // place, and that place attaches the aspect and the layer companions in
      // the same state update (D-108's law).
      const source = readFileSync(
        resolve(process.cwd(), 'src/js/ui-generator.js'),
        'utf8'
      );
      const start = source.indexOf('function createFileControl(');
      expect(start).toBeGreaterThan(-1);
      const end = source.indexOf('\nfunction ', start + 10);
      const body = source.slice(start, end === -1 ? source.length : end);

      const direct = body.match(/onChange\(\s*param\.name/g) || [];
      expect(direct).toHaveLength(1);

      const emitStart = body.indexOf('function emitFileValue(');
      const emitEnd = body.indexOf('\n  }', emitStart);
      const emitBody = body.slice(emitStart, emitEnd);
      expect(emitBody).toContain('onChange(param.name');
      expect(emitBody).toContain('buildLayerCompanions');

      // And the six callers really are six.
      const calls = body.match(/emitFileValue\(/g) || [];
      expect(calls.length).toBeGreaterThanOrEqual(7); // 6 calls + the definition
    });
  });

  describe('in the rendered UI', () => {
    it('gives layer companions a value but NO control', () => {
      const params = buildParams({
        params: [
          fileParam('design_file'),
          numParam('design_file_aspect'),
          fileParam('design_layer_1'),
          numParam('design_layer_1_aspect'),
        ],
      });
      const el = document.createElement('div');
      document.body.appendChild(el);
      renderParameterUI(params, el, vi.fn(), {});

      expect(el.querySelector('#param-design_file')).toBeTruthy();
      expect(el.querySelector('#param-design_layer_1')).toBeNull();
      expect(el.querySelector('#param-design_layer_1_aspect')).toBeNull();
      el.remove();
    });
  });
});
