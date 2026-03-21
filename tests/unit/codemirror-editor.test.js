/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeMirrorEditor } from '../../src/js/codemirror-editor.js';

describe('CodeMirrorEditor', () => {
  let container;
  let editor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (editor) {
      editor.dispose();
      editor = null;
    }
    container.remove();
  });

  function createEditor(overrides = {}) {
    editor = new CodeMirrorEditor({
      container,
      onChange: vi.fn(),
      onSave: vi.fn(),
      onRun: vi.fn(),
      announce: vi.fn(),
      ...overrides,
    });
    return editor;
  }

  describe('constructor', () => {
    it('should store container and callbacks', () => {
      const onChange = vi.fn();
      const onSave = vi.fn();
      const ed = createEditor({ onChange, onSave });

      expect(ed.container).toBe(container);
      expect(ed.onChange).toBe(onChange);
      expect(ed.onSave).toBe(onSave);
    });

    it('should default callbacks to no-ops', () => {
      editor = new CodeMirrorEditor({ container });
      expect(typeof editor.onChange).toBe('function');
      expect(typeof editor.onSave).toBe('function');
      expect(typeof editor.onRun).toBe('function');
      expect(typeof editor.announce).toBe('function');
    });
  });

  describe('initialize()', () => {
    it('should create the CM6 editor inside the container', () => {
      createEditor();
      editor.initialize();

      const cmEditor = container.querySelector('.cm-editor');
      expect(cmEditor).not.toBeNull();
    });

    it('should set aria-label on the content element', () => {
      createEditor();
      editor.initialize();

      const cmContent = container.querySelector('.cm-content');
      expect(cmContent).not.toBeNull();
      expect(cmContent.getAttribute('aria-label')).toBe('OpenSCAD code editor');
    });

    it('should be idempotent (calling twice does not duplicate)', () => {
      createEditor();
      editor.initialize();
      editor.initialize();

      const editors = container.querySelectorAll('.cm-editor');
      expect(editors.length).toBe(1);
    });
  });

  describe('getValue() / setValue()', () => {
    it('should round-trip a value', () => {
      createEditor();
      editor.initialize();

      editor.setValue('cube([10, 10, 10]);');
      expect(editor.getValue()).toBe('cube([10, 10, 10]);');
    });

    it('should return empty string before initialization', () => {
      createEditor();
      expect(editor.getValue()).toBe('');
    });

    it('should handle multiline content', () => {
      createEditor();
      editor.initialize();

      const code = 'module box(size) {\n  cube(size);\n}';
      editor.setValue(code);
      expect(editor.getValue()).toBe(code);
    });

    it('should fire onChange when setValue is called', () => {
      const onChange = vi.fn();
      createEditor({ onChange });
      editor.initialize();

      editor.setValue('sphere(5);');
      expect(onChange).toHaveBeenCalledWith('sphere(5);');
    });
  });

  describe('getSelection() / setSelection()', () => {
    it('should return default selection before init', () => {
      createEditor();
      expect(editor.getSelection()).toEqual({ start: 0, end: 0 });
    });

    it('should set and get a selection range', () => {
      createEditor();
      editor.initialize();
      editor.setValue('cube([10, 10, 10]);');

      editor.setSelection(5, 17);
      const sel = editor.getSelection();
      expect(sel.start).toBe(5);
      expect(sel.end).toBe(17);
    });
  });

  describe('setCursorPosition()', () => {
    it('should position cursor at given line and column', () => {
      createEditor();
      editor.initialize();
      editor.setValue('line1\nline2\nline3');

      editor.setCursorPosition(2, 3);
      const sel = editor.getSelection();
      // Line 2 starts at offset 6 ('line1\n'), col 3 → offset 8
      expect(sel.start).toBe(8);
      expect(sel.end).toBe(8);
    });

    it('should clamp to valid range', () => {
      createEditor();
      editor.initialize();
      editor.setValue('ab');

      editor.setCursorPosition(999, 999);
      const sel = editor.getSelection();
      expect(sel.start).toBe(2);
    });
  });

  describe('setErrorLines() / clearErrors()', () => {
    it('should accept error lines without throwing', () => {
      createEditor();
      editor.initialize();
      editor.setValue('line1\nline2\nline3');

      expect(() => editor.setErrorLines([2, 3])).not.toThrow();
    });

    it('should clear errors without throwing', () => {
      createEditor();
      editor.initialize();
      editor.setValue('line1\nline2');

      editor.setErrorLines([1]);
      expect(() => editor.clearErrors()).not.toThrow();
    });

    it('should ignore out-of-range line numbers', () => {
      createEditor();
      editor.initialize();
      editor.setValue('one line');

      expect(() => editor.setErrorLines([0, 5, 100])).not.toThrow();
    });
  });

  describe('getAction()', () => {
    it('should return null (Monaco compat shim)', () => {
      createEditor();
      expect(editor.getAction()).toBeNull();
    });
  });

  describe('focus()', () => {
    it('should not throw before initialization', () => {
      createEditor();
      expect(() => editor.focus()).not.toThrow();
    });

    it('should not throw after initialization', () => {
      createEditor();
      editor.initialize();
      expect(() => editor.focus()).not.toThrow();
    });
  });

  describe('scrollToLine()', () => {
    it('should not throw on valid line', () => {
      createEditor();
      editor.initialize();
      editor.setValue('a\nb\nc\nd\ne');

      expect(() => editor.scrollToLine(3)).not.toThrow();
    });

    it('should clamp out-of-range lines', () => {
      createEditor();
      editor.initialize();
      editor.setValue('a\nb');

      expect(() => editor.scrollToLine(999)).not.toThrow();
    });
  });

  describe('dispose()', () => {
    it('should remove the editor from DOM', () => {
      createEditor();
      editor.initialize();
      expect(container.querySelector('.cm-editor')).not.toBeNull();

      editor.dispose();
      expect(container.querySelector('.cm-editor')).toBeNull();
    });

    it('should be safe to call twice', () => {
      createEditor();
      editor.initialize();

      editor.dispose();
      expect(() => editor.dispose()).not.toThrow();
    });

    it('should return empty string from getValue after dispose', () => {
      createEditor();
      editor.initialize();
      editor.setValue('hello');
      editor.dispose();

      expect(editor.getValue()).toBe('');
    });
  });
});
