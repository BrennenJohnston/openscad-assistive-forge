/**
 * Tests for the welcome screen's linked-folders list (sub-plan H, phase H2).
 *
 * Everything the module touches is injected, so these run against fakes:
 * fake directory handles whose `isSameEntry` compares an id, fake project
 * records, and jsdom for the rendering half.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildLinkedFolderModel,
  renderLinkedFolders,
  createLinkedFoldersUi,
} from '../../src/js/linked-folders-ui.js';

/**
 * A handle that knows which disk folder it points at. Two handles for the
 * same folder are different objects, exactly as two IDB reads produce —
 * which is why the module must never compare by reference.
 */
function fakeHandle(name, diskId = name) {
  return {
    name,
    kind: 'directory',
    _diskId: diskId,
    isSameEntry: (other) => Promise.resolve(other?._diskId === diskId),
  };
}

function folderLink(id, name, folderRef) {
  return { id, name, kind: 'folder-link', folderRef };
}

describe('buildLinkedFolderModel (H2)', () => {
  it('returns nothing when the store is empty', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [],
      listProjects: async () => [],
    });
    expect(entries).toEqual([]);
  });

  it('lists one entry per folder-link handle, named from the handle', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: fakeHandle('switch-mount') },
        { key: 'fh-b', handle: fakeHandle('braille-tags') },
      ],
      listProjects: async () => [
        folderLink('p1', 'Switch Mount v2', 'fh-a'),
        folderLink('p2', 'braille-tags', 'fh-b'),
      ],
    });

    expect(entries.map((e) => e.name)).toEqual([
      'switch-mount',
      'braille-tags',
    ]);
    // The record was renamed in the app; the row still names the FOLDER.
    expect(entries[0].projectName).toBe('Switch Mount v2');
    expect(entries[0].projectId).toBe('p1');
    expect(entries[0].isLegacy).toBe(false);
  });

  it('hides the root slot when it duplicates a listed folder', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: fakeHandle('switch-mount', 'disk-1') },
        { key: 'root', handle: fakeHandle('switch-mount', 'disk-1') },
      ],
      listProjects: async () => [folderLink('p1', 'switch-mount', 'fh-a')],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('fh-a');
  });

  it('lists a legacy root folder that matches no folder-link record', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: fakeHandle('switch-mount', 'disk-1') },
        { key: 'root', handle: fakeHandle('old-project', 'disk-2') },
      ],
      listProjects: async () => [folderLink('p1', 'switch-mount', 'fh-a')],
    });

    expect(entries).toHaveLength(2);
    const legacy = entries.find((e) => e.key === 'root');
    expect(legacy.name).toBe('old-project');
    expect(legacy.isLegacy).toBe(true);
    expect(legacy.projectId).toBeNull();
  });

  it('marks a folder-link handle whose record is gone as legacy', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [{ key: 'fh-orphan', handle: fakeHandle('x') }],
      listProjects: async () => [],
    });
    expect(entries[0].isLegacy).toBe(true);
  });

  it('marks exactly one entry active, matched by folder not by reference', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: fakeHandle('switch-mount', 'disk-1') },
        { key: 'fh-b', handle: fakeHandle('braille-tags', 'disk-2') },
      ],
      listProjects: async () => [
        folderLink('p1', 'switch-mount', 'fh-a'),
        folderLink('p2', 'braille-tags', 'fh-b'),
      ],
      // A DIFFERENT object for the same folder as fh-b.
      getActiveHandle: () => fakeHandle('braille-tags', 'disk-2'),
    });

    expect(entries.filter((e) => e.activeState).map((e) => e.key)).toEqual([
      'fh-b',
    ]);
  });

  it('carries the sync state onto the active entry', async () => {
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: fakeHandle('switch-mount', 'disk-1') },
      ],
      listProjects: async () => [folderLink('p1', 'switch-mount', 'fh-a')],
      getActiveHandle: () => fakeHandle('switch-mount', 'disk-1'),
      getActiveState: () => 'pending-restore',
    });
    expect(entries[0].activeState).toBe('pending-restore');
  });

  it('treats a handle whose isSameEntry rejects as no match', async () => {
    const revoked = {
      name: 'revoked',
      isSameEntry: () => Promise.reject(new Error('permission revoked')),
    };
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [
        { key: 'fh-a', handle: revoked },
        { key: 'root', handle: fakeHandle('other', 'disk-9') },
      ],
      listProjects: async () => [folderLink('p1', 'revoked', 'fh-a')],
    });

    // The root could not be proven a duplicate, so it is listed.
    expect(entries.map((e) => e.key)).toEqual(['fh-a', 'root']);
    expect(entries.some((e) => e.activeState)).toBe(false);
  });

  it('still lists folders when the project store cannot be read', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = await buildLinkedFolderModel({
      listHandles: async () => [{ key: 'fh-a', handle: fakeHandle('kept') }],
      listProjects: async () => {
        throw new Error('IDB down');
      },
    });
    expect(entries.map((e) => e.name)).toEqual(['kept']);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keeps store order so rows never move as folders are used', async () => {
    const listHandles = async () => [
      { key: 'fh-1', handle: fakeHandle('first', 'd1') },
      { key: 'fh-2', handle: fakeHandle('second', 'd2') },
      { key: 'fh-3', handle: fakeHandle('third', 'd3') },
    ];
    const listProjects = async () => [
      folderLink('p1', 'first', 'fh-1'),
      folderLink('p2', 'second', 'fh-2'),
      folderLink('p3', 'third', 'fh-3'),
    ];
    const a = await buildLinkedFolderModel({ listHandles, listProjects });
    const b = await buildLinkedFolderModel({
      listHandles,
      listProjects,
      getActiveHandle: () => fakeHandle('third', 'd3'),
    });
    expect(b.map((e) => e.key)).toEqual(a.map((e) => e.key));
  });
});

describe('renderLinkedFolders (H2)', () => {
  let listEl;

  beforeEach(() => {
    document.body.innerHTML = '<ul id="linkedFoldersList"></ul>';
    listEl = document.getElementById('linkedFoldersList');
  });

  function entry(overrides = {}) {
    return {
      key: 'fh-a',
      name: 'switch-mount',
      handle: fakeHandle('switch-mount'),
      projectId: 'p1',
      projectName: 'switch-mount',
      isLegacy: false,
      activeState: null,
      ...overrides,
    };
  }

  it('renders one list item per folder, showing the folder name', () => {
    renderLinkedFolders(listEl, [
      entry(),
      entry({ key: 'fh-b', name: 'braille-tags' }),
    ]);
    const items = listEl.querySelectorAll('li.linked-folder');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.linked-folder-name').textContent).toBe(
      'switch-mount'
    );
  });

  it('names each button after its own row, keeping the visible word first', () => {
    renderLinkedFolders(listEl, [entry()]);
    const open = listEl.querySelector('.linked-folder-open');
    const remove = listEl.querySelector('.linked-folder-remove');
    expect(open.textContent).toBe('Open switch-mount');
    expect(remove.textContent).toBe('Remove switch-mount');
    // Sighted users read only the short word.
    expect(open.querySelector('.sr-only').textContent).toBe(' switch-mount');
    expect(open.hasAttribute('aria-label')).toBe(false);
  });

  it('marks the connected folder with text, not colour alone', () => {
    renderLinkedFolders(listEl, [
      entry({ activeState: 'connected' }),
      entry({ key: 'fh-b', name: 'braille-tags' }),
    ]);
    const badges = listEl.querySelectorAll('.linked-folder-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('Connected');
    expect(badges[0].closest('li').dataset.folderKey).toBe('fh-a');
  });

  it('never claims a connection while permission is still to be granted', () => {
    renderLinkedFolders(listEl, [entry({ activeState: 'pending-restore' })]);
    expect(listEl.querySelector('.linked-folder-badge').textContent).toBe(
      'Needs permission'
    );

    renderLinkedFolders(listEl, [entry({ activeState: 'denied' })]);
    expect(listEl.querySelector('.linked-folder-badge').textContent).toBe(
      'Needs permission'
    );
  });

  it('shows the legacy hint only on a folder with no project card', () => {
    renderLinkedFolders(listEl, [
      entry({ isLegacy: true }),
      entry({ key: 'fh-b', name: 'braille-tags' }),
    ]);
    const hints = listEl.querySelectorAll('.linked-folder-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].textContent).toBe('No project card yet');
  });

  it('passes the clicked row to onOpen and onRemove', () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    renderLinkedFolders(
      listEl,
      [entry(), entry({ key: 'fh-b', name: 'braille-tags' })],
      { onOpen, onRemove }
    );
    listEl.querySelectorAll('.linked-folder-open')[1].click();
    listEl.querySelectorAll('.linked-folder-remove')[0].click();
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'fh-b' })
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'fh-a' })
    );
  });

  it('replaces the previous rows rather than appending', () => {
    renderLinkedFolders(listEl, [entry()]);
    renderLinkedFolders(listEl, [entry({ key: 'fh-b', name: 'other' })]);
    expect(listEl.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('createLinkedFoldersUi (H2)', () => {
  let listEl;
  let sectionEl;

  beforeEach(() => {
    document.body.innerHTML =
      '<section id="linkedFolders" hidden><ul id="linkedFoldersList"></ul></section>';
    sectionEl = document.getElementById('linkedFolders');
    listEl = document.getElementById('linkedFoldersList');
  });

  function uiWith(handles, extra = {}) {
    return createLinkedFoldersUi({
      listEl,
      sectionEl,
      listHandles: async () => handles(),
      listProjects: async () =>
        handles().map((h, i) => folderLink(`p${i}`, h.handle.name, h.key)),
      ...extra,
    });
  }

  it('hides the section when nothing is linked and shows it when something is', async () => {
    let handles = [];
    const ui = uiWith(() => handles);

    await ui.refresh();
    expect(sectionEl.hidden).toBe(true);

    handles = [{ key: 'fh-a', handle: fakeHandle('switch-mount') }];
    await ui.refresh();
    expect(sectionEl.hidden).toBe(false);
    expect(listEl.querySelectorAll('li')).toHaveLength(1);
  });

  it('leaves the list alone when the host cancels a removal', async () => {
    const handles = [
      { key: 'fh-a', handle: fakeHandle('a', 'd1') },
      { key: 'fh-b', handle: fakeHandle('b', 'd2') },
    ];
    const ui = uiWith(
      () => handles,
      { onRemove: async () => false } // user pressed Cancel
    );
    await ui.refresh();
    listEl.querySelector('.linked-folder-remove').click();
    await vi.waitFor(() =>
      expect(listEl.querySelectorAll('li')).toHaveLength(2)
    );
  });

  it('moves focus to the row that took the removed row place', async () => {
    let handles = [
      { key: 'fh-a', handle: fakeHandle('a', 'd1') },
      { key: 'fh-b', handle: fakeHandle('b', 'd2') },
    ];
    const ui = uiWith(() => handles, {
      onRemove: async (entryArg) => {
        handles = handles.filter((h) => h.key !== entryArg.key);
        return true;
      },
    });
    await ui.refresh();

    listEl.querySelector('.linked-folder-remove').click();

    await vi.waitFor(() => {
      expect(listEl.querySelectorAll('li')).toHaveLength(1);
      // Focus must not fall back to <body> after the button vanishes.
      expect(document.activeElement).toBe(
        listEl.querySelector('.linked-folder-remove')
      );
    });
  });

  it('lets only the newest refresh paint, so a slow one cannot steal focus', async () => {
    // Removing a folder starts several refreshes at once; the earliest can
    // resolve last and wipe out the row focus was just moved to.
    const handles = [
      { key: 'fh-a', handle: fakeHandle('a', 'd1') },
      { key: 'fh-b', handle: fakeHandle('b', 'd2') },
    ];
    const delays = [80, 0];
    const ui = createLinkedFoldersUi({
      listEl,
      sectionEl,
      listHandles: async () => {
        await new Promise((r) => setTimeout(r, delays.shift() ?? 0));
        return handles;
      },
      listProjects: async () =>
        handles.map((h, i) => folderLink(`p${i}`, h.handle.name, h.key)),
    });

    const slow = ui.refresh(); // started first, resolves last
    const fast = ui.refresh();
    await fast;
    const painted = listEl.querySelector('.linked-folder-remove');
    painted.focus();
    await slow;

    expect(document.activeElement).toBe(painted);
  });

  it('hands focus back to the host when the last row goes', async () => {
    let handles = [{ key: 'fh-a', handle: fakeHandle('a', 'd1') }];
    const onEmptyFocus = vi.fn();
    const ui = uiWith(() => handles, {
      onRemove: async () => {
        handles = [];
        return true;
      },
      onEmptyFocus,
    });
    await ui.refresh();

    listEl.querySelector('.linked-folder-remove').click();

    await vi.waitFor(() => {
      expect(onEmptyFocus).toHaveBeenCalledTimes(1);
      expect(sectionEl.hidden).toBe(true);
    });
  });
});
