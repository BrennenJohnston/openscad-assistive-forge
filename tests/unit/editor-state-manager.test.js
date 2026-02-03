/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EditorStateManager,
  getEditorStateManager,
  resetEditorStateManager,
} from '../../src/js/editor-state-manager.js';

describe('EditorStateManager', () => {
  let stateManager;

  beforeEach(() => {
    resetEditorStateManager();
    stateManager = new EditorStateManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty source', () => {
      expect(stateManager.getSource()).toBe('');
    });

    it('should initialize with empty parameters', () => {
      expect(stateManager.getParameters()).toEqual({});
    });

    it('should initialize with default cursor position', () => {
      expect(stateManager.cursor).toEqual({ line: 1, column: 1 });
    });

    it('should initialize as not dirty', () => {
      expect(stateManager.getIsDirty()).toBe(false);
    });

    it('should initialize with no errors', () => {
      expect(stateManager.getErrors()).toEqual([]);
    });
  });

  describe('setSource / getSource', () => {
    it('should set and get source code', () => {
      stateManager.setSource('cube([10, 10, 10]);');

      expect(stateManager.getSource()).toBe('cube([10, 10, 10]);');
    });

    it('should mark as dirty by default', () => {
      stateManager.setSource('cube([10, 10, 10]);');

      expect(stateManager.getIsDirty()).toBe(true);
    });

    it('should not mark dirty when option is false', () => {
      stateManager.setSource('cube([10, 10, 10]);', { markDirty: false });

      expect(stateManager.getIsDirty()).toBe(false);
    });

    it('should not mark dirty when source unchanged', () => {
      stateManager.setSource('cube([10, 10, 10]);');
      stateManager.markClean();
      stateManager.setSource('cube([10, 10, 10]);');

      expect(stateManager.getIsDirty()).toBe(false);
    });
  });

  describe('setParameters / getParameters', () => {
    it('should set and get parameters', () => {
      const params = { width: 10, height: 20 };
      stateManager.setParameters(params);

      expect(stateManager.getParameters()).toEqual(params);
    });

    it('should return a copy of parameters', () => {
      const params = { width: 10 };
      stateManager.setParameters(params);

      const result = stateManager.getParameters();
      result.width = 999;

      expect(stateManager.getParameters().width).toBe(10);
    });
  });

  describe('updateParameter', () => {
    it('should update a single parameter', () => {
      stateManager.setParameters({ width: 10, height: 20 });
      stateManager.updateParameter('width', 50);

      expect(stateManager.getParameters().width).toBe(50);
      expect(stateManager.getParameters().height).toBe(20);
    });

    it('should add new parameter if not exists', () => {
      stateManager.updateParameter('depth', 30);

      expect(stateManager.getParameters().depth).toBe(30);
    });
  });

  describe('markDirty / markClean / getIsDirty', () => {
    it('should mark as dirty', () => {
      stateManager.markDirty();

      expect(stateManager.getIsDirty()).toBe(true);
    });

    it('should mark as clean', () => {
      stateManager.markDirty();
      stateManager.markClean();

      expect(stateManager.getIsDirty()).toBe(false);
    });
  });

  describe('setErrors / getErrors', () => {
    it('should set and get errors', () => {
      const errors = [
        { line: 5, message: 'Syntax error' },
        { line: 10, message: 'Unknown function' },
      ];
      stateManager.setErrors(errors);

      expect(stateManager.getErrors()).toEqual(errors);
    });

    it('should return a copy of errors', () => {
      const errors = [{ line: 5, message: 'Test' }];
      stateManager.setErrors(errors);

      const result = stateManager.getErrors();
      result.push({ line: 10, message: 'New error' });

      expect(stateManager.getErrors()).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on source change', () => {
      const subscriber = vi.fn();
      stateManager.subscribe(subscriber);

      stateManager.setSource('test');

      expect(subscriber).toHaveBeenCalled();
    });

    it('should notify subscribers on parameter change', () => {
      const subscriber = vi.fn();
      stateManager.subscribe(subscriber);

      stateManager.updateParameter('width', 10);

      expect(subscriber).toHaveBeenCalled();
    });

    it('should notify subscribers on dirty state change', () => {
      const subscriber = vi.fn();
      stateManager.subscribe(subscriber);

      stateManager.markDirty();

      expect(subscriber).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const subscriber = vi.fn();
      const unsubscribe = stateManager.subscribe(subscriber);

      unsubscribe();
      stateManager.setSource('test');

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn(() => {
        throw new Error('Test error');
      });
      const goodSubscriber = vi.fn();

      stateManager.subscribe(errorSubscriber);
      stateManager.subscribe(goodSubscriber);

      expect(() => stateManager.setSource('test')).not.toThrow();
      expect(goodSubscriber).toHaveBeenCalled();
    });
  });

  describe('compareParameters', () => {
    it('should detect added parameters', () => {
      const oldParams = { width: 10 };
      const newParams = { width: 10, height: 20 };

      const result = stateManager.compareParameters(oldParams, newParams);

      expect(result.added).toEqual(['height']);
      expect(result.structuralChange).toBe(true);
    });

    it('should detect removed parameters', () => {
      const oldParams = { width: 10, height: 20 };
      const newParams = { width: 10 };

      const result = stateManager.compareParameters(oldParams, newParams);

      expect(result.removed).toEqual(['height']);
      expect(result.structuralChange).toBe(true);
    });

    it('should detect changed parameters', () => {
      const oldParams = { width: 10 };
      const newParams = { width: 50 };

      const result = stateManager.compareParameters(oldParams, newParams);

      expect(result.changed).toEqual(['width']);
      expect(result.structuralChange).toBe(false);
    });

    it('should return no changes for identical params', () => {
      const params = { width: 10, height: 20 };

      const result = stateManager.compareParameters(params, params);

      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.changed).toEqual([]);
      expect(result.structuralChange).toBe(false);
    });
  });

  describe('injectParameterValue', () => {
    it('should inject numeric parameter value', () => {
      stateManager.setSource('width = 10; // [0:100]');
      const result = stateManager.injectParameterValue('width', 50);

      expect(result).toBe(true);
      expect(stateManager.getSource()).toBe('width = 50; // [0:100]');
    });

    it('should inject string parameter value', () => {
      stateManager.setSource('name = "test"; // text');
      stateManager.injectParameterValue('name', 'hello');

      expect(stateManager.getSource()).toBe('name = "hello"; // text');
    });

    it('should inject vector parameter value', () => {
      stateManager.setSource('size = [1, 2, 3];');
      stateManager.injectParameterValue('size', [10, 20, 30]);

      expect(stateManager.getSource()).toBe('size = [10, 20, 30];');
    });

    it('should inject boolean value', () => {
      stateManager.setSource('enabled = true;');
      stateManager.injectParameterValue('enabled', false);

      expect(stateManager.getSource()).toBe('enabled = false;');
    });

    it('should inject yes/no value as boolean', () => {
      stateManager.setSource('show = true;');
      stateManager.injectParameterValue('show', 'no');

      expect(stateManager.getSource()).toBe('show = false;');
    });

    it('should return false when parameter not found', () => {
      stateManager.setSource('width = 10;');
      const result = stateManager.injectParameterValue('height', 20);

      expect(result).toBe(false);
    });

    it('should preserve comment after value', () => {
      stateManager.setSource('width = 10; // Width in mm');
      stateManager.injectParameterValue('width', 25);

      expect(stateManager.getSource()).toBe('width = 25; // Width in mm');
    });
  });

  describe('position conversion', () => {
    beforeEach(() => {
      stateManager.setSource('line1\nline2\nline3');
    });

    it('should convert offset to position', () => {
      // 'line1\nline2\nline3'
      // Offset 0 = line 1, col 1
      // Offset 6 = line 2, col 1 (after 'line1\n')
      const pos = stateManager._offsetToPosition(6);
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(1);
    });

    it('should convert position to offset', () => {
      const offset = stateManager._positionToOffset({ line: 2, column: 1 });
      expect(offset).toBe(6);
    });

    it('should handle position at end of line', () => {
      // Line 1 is 'line1' (5 chars) + newline
      const offset = stateManager._positionToOffset({ line: 1, column: 6 });
      expect(offset).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      stateManager.setSource('test code');
      stateManager.setParameters({ width: 10 });
      stateManager.markDirty();
      stateManager.setErrors([{ line: 1, message: 'Error' }]);

      stateManager.reset();

      expect(stateManager.getSource()).toBe('');
      expect(stateManager.getParameters()).toEqual({});
      expect(stateManager.getIsDirty()).toBe(false);
      expect(stateManager.getErrors()).toEqual([]);
      expect(stateManager.cursor).toEqual({ line: 1, column: 1 });
    });
  });

  describe('singleton', () => {
    it('should return same instance with getEditorStateManager', () => {
      const instance1 = getEditorStateManager();
      const instance2 = getEditorStateManager();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getEditorStateManager();
      resetEditorStateManager();
      const instance2 = getEditorStateManager();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('captureState / restoreState', () => {
    let mockTextarea;

    beforeEach(() => {
      mockTextarea = document.createElement('textarea');
      mockTextarea.value = 'test code';
      mockTextarea.selectionStart = 5;
      mockTextarea.selectionEnd = 5;
      document.body.appendChild(mockTextarea);

      stateManager.setTextareaElement(mockTextarea);
    });

    afterEach(() => {
      mockTextarea.remove();
    });

    it('should capture state from textarea', () => {
      stateManager.captureState('expert');

      expect(stateManager.source).toBe('test code');
    });

    it('should restore state to textarea', () => {
      stateManager.setSource('new code');
      stateManager.cursor = { line: 1, column: 1 };

      stateManager.restoreState('expert');

      expect(mockTextarea.value).toBe('new code');
    });
  });
});
