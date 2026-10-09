/**
 * The companion file tree must be a valid list.
 *
 * With axe scoped to #projectFilesControls, a tree that nests other roles
 * in the list fails:
 *
 *   aria-required-children (critical) on #projectFilesList
 *   "Element has children which are not allowed: nav[aria-label], [role=list]"
 *
 * index.html declares #projectFilesList a role="list". A renderer that
 * writes a <nav> breadcrumb bar and a second role="list" wrapper into it,
 * with the folder rows carrying role="button" inside that wrapper, breaks
 * it: a list may own only listitems, so none of those three are allowed
 * children.
 *
 * The e2e axe scan of the panel is the end-to-end proof, but it needs a real
 * multi-file project and so needs WASM, which is why every companion spec
 * skips in CI. This test asserts the same structure through the renderer's own
 * exported entry point, in jsdom, so the required Unit Tests job can fail if
 * the structure regresses.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { stateManager } from '../../src/js/state.js';
import {
  detectRequiredCompanionFiles,
  initCompanionFilesController,
} from '../../src/js/companion-files-controller.js';

/** Mirror of the companion panel in index.html, ids kept verbatim. */
const PANEL_HTML = `
  <div class="project-files-controls hidden" id="projectFilesControls"
       role="region" aria-label="Companion files for this design">
    <details class="project-files-details" open>
      <summary class="project-files-summary">
        <span class="forge-disclosure-title">Companion Files</span>
        <span class="project-files-badge" id="projectFilesBadge">0</span>
      </summary>
      <div class="project-files-content">
        <p class="project-files-help" id="projectFilesHelp">help</p>
        <div class="companion-empty-state" id="companionEmptyState"></div>
        <div class="project-files-warning hidden" id="projectFilesWarning" role="alert">
          <span class="warning-text" id="projectFilesWarningText"></span>
        </div>
        <div class="project-files-breadcrumbs" id="projectFilesBreadcrumbs"></div>
        <div class="project-files-list" id="projectFilesList" role="list"
             aria-label="Companion files"></div>
        <button type="button" id="companionSaveBtn" class="hidden"></button>
      </div>
    </details>
  </div>
`;

const FILES = new Map([
  ['main.scad', 'include <utils/helpers.scad>\ncube(10);'],
  ['utils/helpers.scad', 'module rounded_cube() { cube(1); }'],
  ['modules/lid.scad', 'module lid() { cube(1); }'],
  ['notes.txt', 'plain text companion'],
]);

/** Roles a list may own. Anything else is an aria-required-children failure. */
const LIST_CHILD_ROLE = 'listitem';

let controller;

const makeController = () =>
  initCompanionFilesController({
    getPreviewManager: () => null,
    getAutoPreviewController: () => null,
    overlayGridCtrl: {
      updateOverlaySourceDropdown: vi.fn(),
      loadOverlayFromProjectFile: vi.fn(),
      autoApplyScreenDimensionsFromParams: vi.fn(),
      updateOverlayUIFromConfig: vi.fn(),
    },
    updateStatus: vi.fn(),
    getCurrentSavedProjectId: () => null,
    setCanonicalProjectFiles: vi.fn(),
  });

/** The role of an element, explicit or implicit for the tags used here. */
const roleOf = (el) => el.getAttribute('role') || `(implicit:${el.tagName.toLowerCase()})`;

describe('#projectFilesList is a valid list', () => {
  beforeEach(() => {
    document.body.innerHTML = PANEL_HTML;
    stateManager.setState({
      uploadedFile: { name: 'main.scad', content: FILES.get('main.scad') },
      projectFiles: FILES,
      mainFilePath: 'main.scad',
    });
    controller = makeController();
  });

  it('owns only listitems at the project root', () => {
    controller.renderProjectFilesList(FILES, 'main.scad', null);

    const list = document.getElementById('projectFilesList');
    const childRoles = [...list.children].map(roleOf);

    expect(childRoles.length).toBeGreaterThan(0);
    expect(childRoles.every((r) => r === LIST_CHILD_ROLE)).toBe(true);
  });

  it('owns only listitems inside a folder, where the breadcrumb bar exists', () => {
    controller.renderProjectFilesList(FILES, 'main.scad', null);
    document.querySelector('[data-folder-enter="utils"]').click();

    const list = document.getElementById('projectFilesList');
    const childRoles = [...list.children].map(roleOf);

    expect(list.querySelector('nav')).toBeNull();
    expect(childRoles.every((r) => r === LIST_CHILD_ROLE)).toBe(true);
  });

  it('puts no second list inside the list', () => {
    controller.renderProjectFilesList(FILES, 'main.scad', null);

    const list = document.getElementById('projectFilesList');
    expect(list.querySelector('[role="list"]')).toBeNull();
  });

  it('renders the breadcrumb bar outside the list, and clears it at the root', () => {
    controller.renderProjectFilesList(FILES, 'main.scad', null);
    const crumbs = document.getElementById('projectFilesBreadcrumbs');
    expect(crumbs.querySelector('nav')).toBeNull();

    document.querySelector('[data-folder-enter="utils"]').click();
    expect(crumbs.querySelector('nav')).not.toBeNull();
    expect(
      crumbs.querySelectorAll('.file-nav-breadcrumb-btn').length
    ).toBeGreaterThanOrEqual(2);

    // Home crumb returns to the root, and the bar empties with it.
    crumbs.querySelector('.file-nav-breadcrumb-home').click();
    expect(crumbs.querySelector('nav')).toBeNull();
  });

  it('keeps folder rows keyboard-operable and named, as buttons', () => {
    controller.renderProjectFilesList(FILES, 'main.scad', null);

    const folder = document.querySelector('[data-folder-enter="utils"]');
    expect(folder.getAttribute('aria-label')).toBe('Open folder utils, 1 file');

    // A native button carries Enter/Space and focusability without a
    // tabindex/keydown pair of its own.
    expect(folder.tagName).toBe('BUTTON');
    folder.click();
    expect(
      document.querySelector('#projectFilesList [data-action="edit"]')
    ).not.toBeNull();
  });

  it('keeps the focus-return lookup working after the redraw', () => {
    // restoreFocusToFileRow re-finds button[data-action="edit"] by dataset.path
    // inside #projectFilesList. The list structure must not move those
    // buttons out of it, or focus has nowhere to return to.
    controller.renderProjectFilesList(FILES, 'main.scad', null);
    document.querySelector('[data-folder-enter="utils"]').click();

    const edit = [
      ...document.querySelectorAll('#projectFilesList button[data-action="edit"]'),
    ].find((b) => b.dataset.path === 'utils/helpers.scad');
    expect(edit).toBeTruthy();
  });
});

// A library a model uses comes from the Libraries panel, not from the
// project, so it is never a missing companion. A file of the project's own
// still is. And the badge counts companions, which the main file is not.
describe('what the Companion Files panel reports', () => {
  const warningShown = () =>
    !document.getElementById('projectFilesWarning').classList.contains('hidden');
  const warningText = () =>
    document.getElementById('projectFilesWarningText').textContent;

  function render(scad, projectFiles) {
    stateManager.setState({
      uploadedFile: { name: 'main.scad', content: scad },
      projectFiles,
      mainFilePath: 'main.scad',
    });
    controller.renderProjectFilesList(
      projectFiles,
      'main.scad',
      detectRequiredCompanionFiles(scad)
    );
  }

  beforeEach(() => {
    document.body.innerHTML = PANEL_HTML;
    controller = makeController();
  });

  it('does not call a library include missing when there are no companions', () => {
    render('use <MCAD/boxes.scad>\ncube(10);', null);
    expect(warningShown()).toBe(false);
  });

  it('does not call a library include missing beside a companion', () => {
    const scad = 'use <MCAD/boxes.scad>\ncube(10);';
    render(scad, new Map([['main.scad', scad], ['notes.txt', 'x']]));
    expect(warningShown()).toBe(false);
  });

  it('still names a missing file of the project', () => {
    render('include <parts/lid.scad>\ncube(10);', null);
    expect(warningShown()).toBe(true);
    expect(warningText()).toContain('parts/lid.scad');
  });

  it('counts the companions, not the main file', () => {
    const scad = 'cube(10);';
    render(scad, new Map([['main.scad', scad], ['notes.txt', 'x']]));
    expect(document.getElementById('projectFilesBadge').textContent).toBe('1');
  });
});
