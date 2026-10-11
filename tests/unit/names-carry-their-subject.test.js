/**
 * A button's name says what it is and which thing it acts on. The Keyboard
 * Shortcuts dialog named every key "Change shortcut for ..." and never the
 * key; a saved project card named its buttons "Load", "Edit", "Delete" with
 * no project, so a screen reader heard the same three words card after card.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateShortcutsEditorHTML,
  keyboardConfig,
} from '../../src/js/keyboard-config.js';
import { projectCardActionsHTML } from '../../src/js/saved-projects-ui.js';

describe('the Keyboard Shortcuts editor', () => {
  beforeEach(() => {
    localStorage.clear();
    keyboardConfig.resetAll?.();
  });

  it('names each key button by its key, with the action as its description', () => {
    const host = document.createElement('div');
    host.innerHTML = generateShortcutsEditorHTML();
    const row = host.querySelector('.shortcut-item[data-action="render"]');
    const button = row.querySelector('.shortcut-key-btn');
    const key = button.querySelector('kbd').textContent.trim();
    expect(key).not.toBe('');
    expect(button.getAttribute('aria-label')).toBeNull();
    const by = button.getAttribute('aria-describedby');
    expect(by).toBeTruthy();
    expect(host.querySelector(`#${by}`).textContent).toBe(
      'Change shortcut for Render model (full quality)'
    );
  });
});

describe('a saved project card', () => {
  const project = {
    id: 'p1',
    name: 'Simple box',
    originalName: 'simple_box.scad',
    kind: 'scad',
    updatedAt: Date.now(),
    files: [],
  };

  it('names each button with the project', () => {
    const host = document.createElement('div');
    host.innerHTML = projectCardActionsHTML(project, {
      isZip: true,
      isFolderLink: false,
    });
    const names = [...host.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label')
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'Load Simple box',
        'Edit Simple box',
        'Delete Simple box',
        'Files for Simple box',
      ])
    );
  });
});
