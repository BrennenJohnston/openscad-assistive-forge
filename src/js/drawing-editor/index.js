/**
 * The drawing editor, where the preview lives.
 *
 * The owner's complaint about the old one was structural rather than cosmetic:
 * it was a block nested inside the customizer's file control, a long flat list
 * with no shape to it, and the preview was a before-and-after pair. So this is
 * a SURFACE. It takes the whole preview area - the biggest thing on the page,
 * and on a phone the only thing - the way the 2D preview does, with a toolbar
 * across the top, the drawing in the middle, and a side panel of collapsible
 * sections beside it.
 *
 * ★ WHAT THIS IS NOT: a rewrite of the editing itself. The table, the roles,
 * the layer column, the delete-and-undo keyed by original index, the tiers,
 * the manual render, the announcements and the persistence are all
 * `svg-preparer-workspace.js`, which is 2,100 lines with 3,200 lines of tests
 * on it, and it is MOUNTED here rather than re-derived. Deriving it again
 * would have spent the round's remaining time re-earning behaviour the owner
 * already has, and the way to lose a pinned behaviour is to write it twice.
 * The surface is new; what happens inside it is the tested thing.
 * To reverse: build the table into this file and delete the mount.
 *
 * ★ THE CUSTOMIZER STAYS REACHABLE. Focus is trapped only when the editor is
 * opened from the no-model door, where there is nothing behind it to reach.
 * Opened over the preview, a person can Tab straight out into the parameters,
 * which is the owner's "way out" and the reason the surface is a region rather
 * than a dialog.
 *
 * @license GPL-3.0-or-later
 */

import { createSvgPrepWorkspace } from '../svg-preparer-workspace.js';
import { EDITOR_STRINGS as S } from './strings.js';

/**
 * Build the editor surface and mount the workspace inside it.
 *
 * @param {object} args
 * @param {HTMLElement} args.surfaceEl - The element the surface owns
 * @param {Function} [args.onOpen] - Called when the surface takes the area
 * @param {Function} [args.onClose] - Called when it gives the area back
 * @param {Function} [args.announce] - Polite live-region announcer
 * @returns {object} The workspace's own contract, plus the surface's
 */
export function createDrawingEditor({
  surfaceEl,
  onOpen = null,
  onClose = null,
  announce = null,
}) {
  const root = document.createElement('div');
  root.className = 'drawing-editor';

  // ── The way in and out for a keyboard, before anything else ─────────────
  const skipToTable = document.createElement('a');
  skipToTable.className = 'drawing-editor-skip';
  skipToTable.href = '#drawingEditorPanel';
  skipToTable.textContent = S.skipToRegions;

  const toolbar = document.createElement('div');
  toolbar.className = 'drawing-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', S.toolbarLabel);

  const title = document.createElement('h2');
  title.className = 'drawing-editor-title';
  title.id = 'drawingEditorTitle';
  title.textContent = S.title;

  const button = (text, action, className = 'btn btn-secondary') => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.dataset.action = action;
    el.textContent = text;
    return el;
  };

  const applyBtn = button(S.apply, 'editor-apply', 'btn btn-primary');
  const keepBtn = button(S.keepOriginal, 'editor-keep');
  const closeBtn = button(S.close, 'editor-close');
  toolbar.append(title, applyBtn, keepBtn, closeBtn);

  const body = document.createElement('div');
  body.className = 'drawing-editor-body';

  // The workspace's own DOM goes here. It brings the drawing, the table and
  // every control that edits them.
  const stage = document.createElement('div');
  stage.className = 'drawing-editor-stage';

  const panel = document.createElement('div');
  panel.className = 'drawing-editor-panel';
  panel.id = 'drawingEditorPanel';

  /**
   * One accordion section. Native `details`/`summary`, because a disclosure
   * that a browser already knows how to open is a disclosure that works with
   * a screen reader, a keyboard and a find-in-page without anybody writing
   * ARIA for it.
   */
  const section = (name, label, open = false) => {
    const details = document.createElement('details');
    details.className = 'drawing-editor-section';
    details.dataset.section = name;
    details.open = open;
    const summary = document.createElement('summary');
    summary.className = 'drawing-editor-section-summary';
    const text = document.createElement('span');
    text.className = 'drawing-editor-section-name';
    text.textContent = label;
    const count = document.createElement('span');
    count.className = 'drawing-editor-section-count';
    count.dataset.count = name;
    summary.append(text, count);
    const content = document.createElement('div');
    content.className = 'drawing-editor-section-body';
    details.append(summary, content);
    return { details, content, count };
  };

  const sections = {
    colours: section('colours', S.sectionColours),
    regions: section('regions', S.sectionRegions, true),
    plates: section('plates', S.sectionPlates),
    warnings: section('warnings', S.sectionWarnings),
  };
  for (const key of ['colours', 'regions', 'plates', 'warnings']) {
    panel.appendChild(sections[key].details);
  }

  const backToToolbar = document.createElement('a');
  backToToolbar.className = 'drawing-editor-skip';
  backToToolbar.href = '#drawingEditorTitle';
  backToToolbar.textContent = S.backToToolbar;
  panel.appendChild(backToToolbar);

  const status = document.createElement('p');
  status.className = 'drawing-editor-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  body.append(stage, panel);
  root.append(skipToTable, toolbar, body, status);
  surfaceEl.appendChild(root);

  // The workspace mounts into the stage and runs inline: no backdrop, no
  // trap, the customizer still one Tab away.
  const workspace = createSvgPrepWorkspace(stage);

  let isOpen = false;
  let callbacks = {};

  const say = (message) => {
    if (!message) return;
    status.textContent = message;
    if (typeof announce === 'function') announce(message);
  };

  /** Put a count beside a section name, or nothing when there is none. */
  const setCount = (name, n) => {
    const el = sections[name];
    if (!el) return;
    el.count.textContent = n === null || n === undefined ? '' : String(n);
  };

  const finish = (which, ...args) => {
    const fn = callbacks[which];
    close();
    if (typeof fn === 'function') fn(...args);
  };

  function open(svgString, analysis, options = {}) {
    callbacks = options.callbacks || {};
    isOpen = true;
    surfaceEl.hidden = false;
    surfaceEl.classList.remove('hidden');
    root.dataset.purpose = options.purpose === 'stencil' ? 'stencil' : 'relief';
    // The workspace resolves Apply and Keep itself; the surface only has to
    // give the area back afterwards, and it does that in `close`.
    workspace.open(svgString, analysis, {
      ...callbacks,
      onApply: (...args) => finish('onApply', ...args),
      onKeepOriginal: (...args) => finish('onKeepOriginal', ...args),
    });
    setCount('regions', analysis?.elements?.length ?? null);
    setCount('warnings', analysis?.warnings?.length || null);
    say(options.openedSentence || S.opened);
    if (typeof onOpen === 'function') onOpen(surfaceEl);
    // The title is the first thing after the skip link, so a screen reader
    // meets the name of the surface it just arrived on.
    title.setAttribute('tabindex', '-1');
    title.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    workspace.close();
    surfaceEl.hidden = true;
    surfaceEl.classList.add('hidden');
    status.textContent = '';
    if (typeof onClose === 'function') onClose(surfaceEl);
  }

  applyBtn.addEventListener('click', () => {
    // Delegated to the workspace's own Apply, so the tiers, the flatten and
    // the announcements it already does are what happens.
    const own = workspace._refs?.applyBtn;
    if (own) own.click();
  });
  keepBtn.addEventListener('click', () => {
    const own = workspace._refs?.keepBtn;
    if (own) own.click();
    else finish('onKeepOriginal');
  });
  closeBtn.addEventListener('click', () => {
    // Closing without Apply or Keep means the original stands: never silently
    // replaced by an auto-prepared version.
    finish('onKeepOriginal');
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation();
    finish('onKeepOriginal');
  });

  return {
    open,
    close,
    dismiss: () => {
      workspace.dismiss();
      close();
    },
    setCount,
    say,
    getResult: () => workspace.getResult(),
    getRoleOverrides: () => workspace.getRoleOverrides(),
    getOffsetOverrides: () => workspace.getOffsetOverrides(),
    getDeletedIndices: () => workspace.getDeletedIndices(),
    getLayerAssignments: () => workspace.getLayerAssignments(),
    destroy: () => {
      workspace.destroy();
      root.remove();
    },
    isOpen: () => isOpen,
    _root: root,
    _workspace: workspace,
    _sections: sections,
  };
}
