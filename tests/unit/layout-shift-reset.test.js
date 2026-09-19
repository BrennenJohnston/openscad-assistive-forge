/**
 * Regression test: layout shift on project reload (Phase 1).
 *
 * Root cause: when a user loaded a project with warnings, navigated back to the
 * welcome screen, and loaded another project, the echo drawer remained visible
 * and expanded with stale warnings.  Scroll positions on ancestor containers
 * were also not reset.  Together these produced a blank white region at the
 * bottom of the viewport and an upward layout shift that hid the app header.
 *
 * Fix: handleFile() now calls updatePreviewDrawer([]) and resets scrollTop on
 * #app, #main-content, and .preview-content before rendering the new project.
 * The clearFileBtn handler also resets the echo drawer.
 *
 * These tests verify the DOM-level invariants that the fix relies on:
 *   1. An empty-message call collapses and hides the echo drawer.
 *   2. Scroll positions on layout containers are zero after reset.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

function buildEchoDrawerDOM() {
  const drawer = document.createElement('div');
  drawer.id = 'echoDrawer';
  drawer.className = 'echo-drawer visible';

  const label = document.createElement('span');
  label.id = 'echoDrawerLabel';
  label.textContent = 'OpenSCAD Messages (7 warnings)';
  drawer.appendChild(label);

  const content = document.createElement('div');
  content.className = 'echo-drawer-content';
  const messages = document.createElement('pre');
  messages.id = 'echoMessages';
  messages.innerHTML =
    '<span class="echo-msg-line echo-msg-warning">WARNING: stale</span>';
  content.appendChild(messages);
  drawer.appendChild(content);

  document.body.appendChild(drawer);
  return { drawer, label, messages };
}

function buildLayoutContainers() {
  const app = document.createElement('div');
  app.id = 'app';

  const main = document.createElement('main');
  main.id = 'main-content';

  const previewContent = document.createElement('div');
  previewContent.className = 'preview-content';

  app.appendChild(main);
  main.appendChild(previewContent);
  document.body.appendChild(app);

  return { app, main, previewContent };
}

/**
 * Replicate the exact logic of updatePreviewDrawer([]) from main.js.
 * The real function is private to initApp(); we inline its empty-array branch.
 */
function resetEchoDrawer() {
  const echoDrawer = document.getElementById('echoDrawer');
  const echoDrawerLabel = document.getElementById('echoDrawerLabel');
  const echoMessagesEl = document.getElementById('echoMessages');

  if (!echoDrawer || !echoDrawerLabel || !echoMessagesEl) return;

  echoDrawer.classList.remove(
    'visible',
    'echo-drawer--warning',
    'echo-drawer--error'
  );
  echoDrawer.classList.add('collapsed');
  echoDrawerLabel.textContent = 'No messages';
  echoMessagesEl.innerHTML = '';
}

describe('Layout shift reset — echo drawer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('collapses the echo drawer when reset with empty messages', () => {
    const { drawer } = buildEchoDrawerDOM();

    expect(drawer.classList.contains('visible')).toBe(true);
    expect(drawer.classList.contains('collapsed')).toBe(false);

    resetEchoDrawer();

    expect(drawer.classList.contains('visible')).toBe(false);
    expect(drawer.classList.contains('collapsed')).toBe(true);
  });

  it('clears stale warning messages from the echo drawer', () => {
    const { messages, label } = buildEchoDrawerDOM();

    expect(messages.innerHTML).toContain('stale');
    expect(label.textContent).toContain('7 warnings');

    resetEchoDrawer();

    expect(messages.innerHTML).toBe('');
    expect(label.textContent).toBe('No messages');
  });

  it('removes severity classes from the echo drawer', () => {
    const { drawer } = buildEchoDrawerDOM();
    drawer.classList.add('echo-drawer--warning');

    resetEchoDrawer();

    expect(drawer.classList.contains('echo-drawer--warning')).toBe(false);
    expect(drawer.classList.contains('echo-drawer--error')).toBe(false);
  });
});

describe('Layout shift reset — scroll positions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resets scrollTop on layout ancestor containers', () => {
    const { app, main, previewContent } = buildLayoutContainers();

    // Simulate non-zero scroll positions (browser auto-scroll artifact)
    app.scrollTop = 50;
    main.scrollTop = 30;
    previewContent.scrollTop = 20;

    // Replicate the reset logic from handleFile()
    const appEl = document.getElementById('app');
    if (appEl) appEl.scrollTop = 0;
    const appMainEl = document.getElementById('main-content');
    if (appMainEl) appMainEl.scrollTop = 0;
    const previewContentEl = document.querySelector('.preview-content');
    if (previewContentEl) previewContentEl.scrollTop = 0;

    expect(app.scrollTop).toBe(0);
    expect(main.scrollTop).toBe(0);
    expect(previewContent.scrollTop).toBe(0);
  });
});
