/**
 * The Save prompt as it opens: focus moves into it once, onto the project's
 * name, so a screen reader names the dialog once. Two moves in the same
 * moment (the close button, then the name) had NVDA say the dialog's name
 * twice before the field.
 *
 * @license GPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSavedProjectsUI } from '../../src/js/saved-projects-ui.js';

describe('the Save prompt', () => {
  let moves;
  const record = (e) => moves.push(e.target);

  afterEach(() => {
    document.removeEventListener('focusin', record, true);
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('moves focus into itself once, onto the name, and is named once', () => {
    // Drawn, as in a browser: the focus trap only lands on a control with a
    // box, and this test page lays nothing out.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    const ui = initSavedProjectsUI({
      showConfirmDialog: vi.fn(),
      showProcessingOverlay: vi.fn(),
      handleFile: vi.fn(),
      updateStatus: vi.fn(),
      updateCompanionSaveButton: vi.fn(),
      downloadSingleProject: vi.fn(),
      setCurrentSavedProjectId: vi.fn(),
    });
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    moves = [];
    document.addEventListener('focusin', record, true);

    ui.showSaveProjectPrompt({
      uploadedFile: { name: 'box.scad', content: 'cube(1);' },
    });

    const dialog = document.querySelector('.save-project-modal');
    const name = document.getElementById('saveProjectName');
    expect(moves.filter((el) => dialog.contains(el))).toEqual([name]);
    expect(document.activeElement).toBe(name);
    expect(dialog.getAttribute('aria-labelledby')).toBe('saveProjectTitle');
    expect(dialog.hasAttribute('aria-label')).toBe(false);
    expect(dialog.hasAttribute('title')).toBe(false);
  });
});
