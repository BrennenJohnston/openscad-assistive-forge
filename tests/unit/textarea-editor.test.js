/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextareaEditor } from '../../src/js/textarea-editor.js';

describe('TextareaEditor', () => {
  let editor;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = new TextareaEditor({ container, onChange: () => {}, announce: () => {} });
    editor.initialize();
  });

  describe('getAction', () => {
    it('always returns null (TextareaEditor has no Monaco action registry)', () => {
      expect(editor.getAction('actions.find')).toBeNull();
      expect(editor.getAction('editor.action.commentLine')).toBeNull();
      expect(editor.getAction('unknown')).toBeNull();
    });
  });

  describe('trigger', () => {
    it('is a no-op and does not throw', () => {
      expect(() =>
        editor.trigger('keyboard', 'editor.action.clipboardCutAction', null)
      ).not.toThrow();
    });
  });

  describe('toggleComment', () => {
    it('calls the internal _toggleComment method', () => {
      const spy = vi.spyOn(editor, '_toggleComment');
      editor.setValue('// hello');
      editor.toggleComment();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('execEditCommand', () => {
    it('focuses the textarea before executing the command', () => {
      const focusSpy = vi.spyOn(editor.textarea, 'focus');
      // JSDOM does not implement execCommand; define it so we can spy on it.
      if (!document.execCommand) {
        Object.defineProperty(document, 'execCommand', {
          value: vi.fn(() => true),
          writable: true,
          configurable: true,
        });
      }
      const execCommandSpy = vi
        .spyOn(document, 'execCommand')
        .mockReturnValue(true);

      editor.execEditCommand('copy');

      expect(focusSpy).toHaveBeenCalled();
      expect(execCommandSpy).toHaveBeenCalledWith('copy');

      execCommandSpy.mockRestore();
    });

    it('does not throw when textarea is not yet initialised', () => {
      const uninitialised = new TextareaEditor({
        container: document.createElement('div'),
      });
      expect(() => uninitialised.execEditCommand('copy')).not.toThrow();
    });
  });
});
