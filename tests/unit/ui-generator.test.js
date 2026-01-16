import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderParameterUI } from '../../src/js/ui-generator.js'

const buildParams = ({ groups = null, params = [] }) => {
  const resolvedGroups = groups || [{ id: 'General', label: 'General', order: 0 }]
  const parameters = {}
  params.forEach((param, index) => {
    const groupId = param.group || resolvedGroups[0].id
    parameters[param.name] = {
      order: index,
      group: groupId,
      description: '',
      ...param
    }
  })
  return { groups: resolvedGroups, parameters }
}

describe('UI Generator', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (container?.parentNode) {
      document.body.removeChild(container)
    }
  })

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
            uiType: 'slider'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const slider = container.querySelector('input[type="range"]')
      const output = container.querySelector('.slider-value')
      expect(slider).toBeTruthy()
      expect(slider.min).toBe('10')
      expect(slider.max).toBe('100')
      expect(slider.value).toBe('50')
      expect(output?.textContent).toBe('50')
    })

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
            uiType: 'slider'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const slider = container.querySelector('input[type="range"]')
      slider.value = 70
      slider.dispatchEvent(new Event('input'))

      expect(onChange).toHaveBeenCalled()
      expect(onChange.mock.calls[0][0]).toEqual({ height: 70 })
    })

    it('renders a number input when uiType is input and type is number', () => {
      const schema = buildParams({
        groups: [{ id: 'Settings', label: 'Settings', order: 0 }],
        params: [
          {
            name: 'count',
            type: 'number',
            default: 5,
            uiType: 'input'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const input = container.querySelector('input[type="number"]')
      expect(input).toBeTruthy()
      expect(input.value).toBe('5')
    })
  })

  describe('Text Parameters', () => {
    it('renders a text input when uiType is input and type is string', () => {
      const schema = buildParams({
        groups: [{ id: 'Text', label: 'Text', order: 0 }],
        params: [
          {
            name: 'label',
            type: 'string',
            default: 'Hello',
            uiType: 'input'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const input = container.querySelector('input[type="text"]')
      expect(input).toBeTruthy()
      expect(input.value).toBe('Hello')
    })

    it('updates values when text input changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'message',
            type: 'string',
            default: 'test',
            uiType: 'input'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const input = container.querySelector('input[type="text"]')
      input.value = 'new message'
      input.dispatchEvent(new Event('change'))

      expect(onChange).toHaveBeenCalled()
      expect(onChange.mock.calls[0][0]).toEqual({ message: 'new message' })
    })
  })

  describe('Enum Parameters', () => {
    it('renders a select dropdown for uiType select', () => {
      const schema = buildParams({
        params: [
          {
            name: 'shape',
            type: 'string',
            default: 'circle',
            enum: ['circle', 'square', 'triangle'],
            uiType: 'select'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const select = container.querySelector('select')
      expect(select).toBeTruthy()
      expect(select.value).toBe('circle')
      expect(select.options.length).toBe(3)
    })

    it('calls onChange when dropdown value changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'shape',
            type: 'string',
            default: 'circle',
            enum: ['circle', 'square'],
            uiType: 'select'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const select = container.querySelector('select')
      select.value = 'square'
      select.dispatchEvent(new Event('change'))

      expect(onChange).toHaveBeenCalled()
      expect(onChange.mock.calls[0][0]).toEqual({ shape: 'square' })
    })
  })

  describe('Toggle Parameters', () => {
    it('renders a toggle switch for uiType toggle', () => {
      const schema = buildParams({
        params: [
          {
            name: 'enabled',
            type: 'string',
            default: 'yes',
            enum: ['yes', 'no'],
            uiType: 'toggle'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const checkbox = container.querySelector('input[type="checkbox"]')
      expect(checkbox).toBeTruthy()
      expect(checkbox.checked).toBe(true)
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
    })

    it('updates values when toggle changes', () => {
      const schema = buildParams({
        params: [
          {
            name: 'enabled',
            type: 'string',
            default: 'no',
            enum: ['yes', 'no'],
            uiType: 'toggle'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const checkbox = container.querySelector('input[type="checkbox"]')
      checkbox.checked = true
      checkbox.dispatchEvent(new Event('change'))

      expect(onChange).toHaveBeenCalled()
      expect(onChange.mock.calls[0][0]).toEqual({ enabled: 'yes' })
    })
  })

  describe('Color and File Parameters', () => {
    it('renders a color picker when uiType is color', () => {
      const schema = buildParams({
        params: [
          {
            name: 'color',
            type: 'color',
            default: '#FF0000',
            uiType: 'color'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const colorInput = container.querySelector('input[type="color"]')
      expect(colorInput).toBeTruthy()
      expect(colorInput.value.toLowerCase()).toBe('#ff0000')
    })

    it('renders a file upload control when uiType is file', () => {
      const schema = buildParams({
        params: [
          {
            name: 'logo',
            type: 'file',
            default: '',
            uiType: 'file',
            acceptedExtensions: ['png', 'jpg']
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const fileInput = container.querySelector('input[type="file"]')
      expect(fileInput).toBeTruthy()
      expect(fileInput.accept).toBe('.png,.jpg')
    })
  })

  describe('Groups and Labels', () => {
    it('creates collapsible groups with correct labels', () => {
      const schema = buildParams({
        groups: [
          { id: 'GroupA', label: 'Group A', order: 0 },
          { id: 'GroupB', label: 'Group B', order: 1 }
        ],
        params: [
          { name: 'param1', type: 'number', default: 10, uiType: 'input', group: 'GroupA' },
          { name: 'param2', type: 'string', default: 'test', uiType: 'input', group: 'GroupB' }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const groups = container.querySelectorAll('details.param-group')
      const summaries = container.querySelectorAll('summary')
      expect(groups.length).toBe(2)
      expect(summaries[0].textContent).toBe('Group A')
      expect(summaries[1].textContent).toBe('Group B')
    })

    it('skips groups with no parameters', () => {
      const schema = buildParams({
        groups: [
          { id: 'Empty', label: 'Empty Group', order: 0 },
          { id: 'Filled', label: 'Filled Group', order: 1 }
        ],
        params: [
          { name: 'param', type: 'number', default: 2, uiType: 'input', group: 'Filled' }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const summaries = Array.from(container.querySelectorAll('summary')).map(el => el.textContent)
      expect(summaries).toEqual(['Filled Group'])
    })

    it('does not render parameters for groups not listed', () => {
      const schema = buildParams({
        groups: [{ id: 'Visible', label: 'Visible', order: 0 }],
        params: [
          { name: 'visible_param', type: 'number', default: 10, uiType: 'input', group: 'Visible' },
          { name: 'hidden_param', type: 'number', default: 99, uiType: 'input', group: 'Hidden' }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      expect(container.textContent).toContain('visible param')
      expect(container.textContent).not.toContain('hidden param')
    })

    it('formats parameter names by replacing underscores with spaces', () => {
      const schema = buildParams({
        params: [
          {
            name: 'palm_loop_height',
            type: 'number',
            default: 30,
            uiType: 'input'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const label = container.querySelector('label')
      expect(label.textContent).toContain('palm loop height')
    })
  })

  describe('Accessibility and Defaults', () => {
    it('sets aria-label for sliders with current value', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 0,
            maximum: 100,
            uiType: 'slider'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const slider = container.querySelector('input[type="range"]')
      expect(slider.getAttribute('aria-label')).toContain('width: 50')
    })

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
            description: 'The width of the object'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, {})

      const helpButton = container.querySelector('.param-help-button')
      expect(helpButton).toBeTruthy()
      expect(helpButton.getAttribute('aria-label')).toContain('Help for width')
    })

    it('uses initial values instead of defaults when provided', () => {
      const schema = buildParams({
        params: [
          {
            name: 'width',
            type: 'number',
            default: 50,
            minimum: 0,
            maximum: 100,
            uiType: 'slider'
          },
          {
            name: 'name',
            type: 'string',
            default: 'default',
            uiType: 'input'
          }
        ]
      })
      const onChange = vi.fn()

      renderParameterUI(schema, container, onChange, { width: 75, name: 'custom' })

      const slider = container.querySelector('input[type="range"]')
      const textInput = container.querySelector('input[type="text"]')
      expect(slider.value).toBe('75')
      expect(textInput.value).toBe('custom')
    })
  })
})
