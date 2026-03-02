/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonacoEditor } from '../../src/js/monaco-editor.js';

describe('MonacoEditor', () => {
  let monacoEditor;
  let mockInternalEditor;

  beforeEach(() => {
    monacoEditor = new MonacoEditor({ container: document.createElement('div') });

    // Provide a mock of the underlying monaco IStandaloneCodeEditor
    mockInternalEditor = {
      getAction: vi.fn(),
      trigger: vi.fn(),
      getValue: vi.fn(() => ''),
      setValue: vi.fn(),
      dispose: vi.fn(),
    };
    monacoEditor.editor = mockInternalEditor;
  });

  describe('getAction', () => {
    it('delegates to this.editor.getAction with the provided actionId', () => {
      const fakeAction = { run: vi.fn() };
      mockInternalEditor.getAction.mockReturnValue(fakeAction);

      const result = monacoEditor.getAction('actions.find');

      expect(mockInternalEditor.getAction).toHaveBeenCalledWith('actions.find');
      expect(result).toBe(fakeAction);
    });

    it('returns null when the action is not registered', () => {
      mockInternalEditor.getAction.mockReturnValue(null);

      const result = monacoEditor.getAction('unknown.action');

      expect(result).toBeNull();
    });

    it('returns null when the internal editor has not been initialised', () => {
      monacoEditor.editor = null;

      const result = monacoEditor.getAction('actions.find');

      expect(result).toBeNull();
    });
  });

  describe('trigger', () => {
    it('delegates to this.editor.trigger with all arguments', () => {
      monacoEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null);

      expect(mockInternalEditor.trigger).toHaveBeenCalledWith(
        'keyboard',
        'editor.action.clipboardCutAction',
        null
      );
    });

    it('does not throw when the internal editor has not been initialised', () => {
      monacoEditor.editor = null;

      expect(() =>
        monacoEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null)
      ).not.toThrow();
    });
  });
});
