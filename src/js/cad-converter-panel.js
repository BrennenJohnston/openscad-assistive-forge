/**
 * CAD-to-Parametric Converter Panel
 *
 * Multi-step wizard that drives the forge_cad analysis pipeline from the browser.
 * Talks to the Pyodide worker via PyodideBridge.
 *
 * Steps:
 *   1. upload      – user selects CAD files
 *   2. analyzing   – Pyodide init + pipeline run
 *   3. components  – user reviews detected components
 *   4. features    – user reviews detected features
 *   5. generate    – generate .scad and load into forge editor
 *
 * Public API (called by main.js):
 *   init(onScadLoaded)  – wire up DOM events; onScadLoaded(scadCode, filename)
 *                         is called when the user clicks "Generate & Load"
 *
 * @license GPL-3.0-or-later
 */

import { getSharedBridge } from './pyodide-bridge.js';

// ── Constants ──────────────────────────────────────────────────────────────

const COMPONENT_ROLES = [
  'base_solid',
  'pocket_fill',
  'additive',
  'subtractive',
  'variant',
  'unknown',
];

const FEATURE_TYPES = [
  'circular_hole',
  'rectangular_slot',
  'notch',
  't_slot',
  'polygon',
  'chamfer',
  'fillet',
  'unknown',
];

// Map stage keys from worker progress messages to list items
const STAGE_KEYS = ['init', 'stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'stage6'];

// ── State ──────────────────────────────────────────────────────────────────

let _step = 'upload';
let _files = []; // [{ name: string, data: Uint8Array }]
let _projectForm = null; // raw dict from Python _to_dict()
let _generatedScad = null;
let _onScadLoaded = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

function announce(msg) {
  const status = el('cadConverterStatus');
  if (status) status.textContent = msg;
}

function setStepActive(stepId) {
  _step = stepId;

  // Hide all wizard step panels
  document.querySelectorAll('.cad-wizard-step-panel').forEach((panel) => {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  });

  // Show target panel
  const target = el(`cadStep-${stepId}`);
  if (target) {
    target.classList.remove('hidden');
    target.removeAttribute('aria-hidden');
  }

  // Update breadcrumb
  document.querySelectorAll('.cad-step').forEach((item) => {
    const active = item.dataset.step === stepId;
    item.classList.toggle('active', active);
    if (active) {
      item.setAttribute('aria-current', 'step');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

function setProgressStageState(stage, state) {
  const item = document.querySelector(`.cad-progress-item[data-stage="${stage}"]`);
  if (!item) return;
  item.classList.remove('pending', 'running', 'done', 'error');
  item.classList.add(state);
}

// ── File handling ──────────────────────────────────────────────────────────

async function readFilesAsBuffers(fileList) {
  const results = [];
  for (const file of fileList) {
    const buffer = await file.arrayBuffer();
    results.push({ name: file.name, data: new Uint8Array(buffer) });
  }
  return results;
}

function renderFileList(files) {
  const list = el('cadFileList');
  if (!list) return;

  list.innerHTML = '';
  for (const f of files) {
    const li = document.createElement('li');
    li.className = 'cad-file-item';

    const icon = document.createElement('span');
    icon.className = 'cad-file-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = getFileIcon(f.name);

    const name = document.createElement('span');
    name.className = 'cad-file-name';
    name.textContent = f.name;

    const size = document.createElement('span');
    size.className = 'cad-file-size';
    size.textContent = formatBytes(f.data.byteLength);

    li.appendChild(icon);
    li.appendChild(name);
    li.appendChild(size);
    list.appendChild(li);
  }

  list.classList.toggle('hidden', files.length === 0);
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'stl') return '▲';
  if (ext === 'obj') return '◆';
  if (ext === 'dxf') return '◻';
  return '📄';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component review rendering ─────────────────────────────────────────────

function renderComponentCards(form) {
  const container = el('cadComponentCards');
  const summary = el('cadComponentsSummary');
  if (!container) return;
  container.innerHTML = '';

  const components = form.components ?? [];
  const files = form.files_detected ?? [];

  if (summary) {
    summary.innerHTML = `
      <div class="cad-summary-item">
        <dt>Files loaded</dt>
        <dd>${files.length}</dd>
      </div>
      <div class="cad-summary-item">
        <dt>Components found</dt>
        <dd>${components.length}</dd>
      </div>
      <div class="cad-summary-item">
        <dt>Z-levels</dt>
        <dd>${(form.z_levels ?? []).map((v) => v.toFixed(2)).join(', ') || '—'}</dd>
      </div>
    `;
  }

  if (components.length === 0) {
    container.innerHTML =
      '<p class="cad-empty-msg">No components detected. The files may be empty or unsupported.</p>';
    return;
  }

  components.forEach((comp, idx) => {
    const card = buildComponentCard(comp, idx);
    container.appendChild(card);
  });
}

function buildComponentCard(comp, idx) {
  const card = document.createElement('article');
  card.className = 'cad-review-card';
  card.dataset.componentIdx = idx;

  const zRange = comp.z_range ?? [0, 0];

  card.innerHTML = `
    <div class="cad-card-header">
      <div class="cad-card-title-group">
        <label class="cad-card-label" for="comp-name-${idx}">Name</label>
        <input
          type="text"
          id="comp-name-${idx}"
          class="cad-text-input cad-card-name-input"
          value="${escHtml(comp.name ?? '')}"
          data-field="name"
          aria-label="Component name"
        />
      </div>
      <button
        type="button"
        class="btn btn-sm btn-ghost cad-card-delete-btn"
        aria-label="Remove component ${escHtml(comp.name ?? '')}"
        data-idx="${idx}"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        </svg>
      </button>
    </div>
    <div class="cad-card-body">
      <div class="cad-card-field">
        <label class="cad-card-label" for="comp-role-${idx}">Role</label>
        <select id="comp-role-${idx}" class="cad-select" data-field="role" aria-label="Component role">
          ${COMPONENT_ROLES.map(
            (r) => `<option value="${r}" ${r === comp.role ? 'selected' : ''}>${r}</option>`
          ).join('')}
        </select>
      </div>
      <div class="cad-card-field">
        <span class="cad-card-label">Z-range</span>
        <span class="cad-card-value">${zRange[0]?.toFixed(2)} – ${zRange[1]?.toFixed(2)} mm</span>
      </div>
      <div class="cad-card-field">
        <span class="cad-card-label">Source file</span>
        <span class="cad-card-value cad-card-source">${escHtml(comp.source_file ?? '—')}</span>
      </div>
    </div>
  `;

  // Sync edits back to form dict immediately
  card.querySelector(`#comp-name-${idx}`).addEventListener('input', (e) => {
    if (_projectForm?.components?.[idx]) {
      _projectForm.components[idx].human_name = e.target.value;
    }
  });
  card.querySelector(`#comp-role-${idx}`).addEventListener('change', (e) => {
    if (_projectForm?.components?.[idx]) {
      _projectForm.components[idx].human_role = e.target.value;
    }
  });
  card.querySelector('.cad-card-delete-btn').addEventListener('click', () => {
    if (_projectForm?.components?.[idx]) {
      _projectForm.components[idx].name = `_deleted_${idx}`;
    }
    card.classList.add('cad-card--deleted');
    card.setAttribute('aria-hidden', 'true');
    announce(`Removed component ${idx + 1}`);
  });

  return card;
}

// ── Feature review rendering ───────────────────────────────────────────────

function renderFeatureCards(form) {
  const container = el('cadFeatureCards');
  const noMsg = el('cadNoFeaturesMsg');
  if (!container) return;
  container.innerHTML = '';

  const features = form.features ?? [];

  if (noMsg) {
    noMsg.classList.toggle('hidden', features.length > 0);
  }

  features.forEach((feat, idx) => {
    const card = buildFeatureCard(feat, idx);
    container.appendChild(card);
  });
}

function buildFeatureCard(feat, idx) {
  const card = document.createElement('article');
  card.className = 'cad-review-card cad-feature-card';
  card.dataset.featureIdx = idx;

  const params = feat.params ?? {};
  const paramsText = Object.entries(params)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join(', ');

  const enabled = feat.enabled_by_default !== false;

  card.innerHTML = `
    <div class="cad-card-header">
      <div class="cad-card-title-group">
        <label class="cad-card-label" for="feat-name-${idx}">Name</label>
        <input
          type="text"
          id="feat-name-${idx}"
          class="cad-text-input cad-card-name-input"
          value="${escHtml(feat.name ?? '')}"
          data-field="name"
          aria-label="Feature name"
        />
      </div>
      <label class="cad-toggle" for="feat-enable-${idx}" title="Enable this feature in the generated code">
        <input
          type="checkbox"
          id="feat-enable-${idx}"
          class="cad-toggle-input"
          ${enabled ? 'checked' : ''}
          aria-label="Enable feature ${escHtml(feat.name ?? '')}"
        />
        <span class="cad-toggle-track" aria-hidden="true"></span>
        <span class="cad-toggle-label">Include</span>
      </label>
    </div>
    <div class="cad-card-body">
      <div class="cad-card-field">
        <label class="cad-card-label" for="feat-type-${idx}">Type</label>
        <select id="feat-type-${idx}" class="cad-select" data-field="feature_type" aria-label="Feature type">
          ${FEATURE_TYPES.map(
            (t) => `<option value="${t}" ${t === feat.feature_type ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
      <div class="cad-card-field">
        <span class="cad-card-label">Detected from</span>
        <span class="cad-card-value">${escHtml(feat.detected_from ?? '—')}</span>
      </div>
      ${
        paramsText
          ? `<div class="cad-card-field">
               <span class="cad-card-label">Parameters</span>
               <span class="cad-card-value cad-card-params">${escHtml(paramsText)}</span>
             </div>`
          : ''
      }
    </div>
  `;

  // Sync edits back to form dict
  card.querySelector(`#feat-name-${idx}`).addEventListener('input', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].human_name = e.target.value;
    }
  });
  card.querySelector(`#feat-type-${idx}`).addEventListener('change', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].type = e.target.value;
    }
  });
  card.querySelector(`#feat-enable-${idx}`).addEventListener('change', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].enabled_by_default = e.target.checked;
      // Mark as confirmed only if enabled
      _projectForm.features[idx].confirmed = e.target.checked;
    }
  });

  // Set initial confirmed state
  if (_projectForm?.features?.[idx]) {
    _projectForm.features[idx].confirmed = enabled;
  }

  return card;
}

// ── Analysis orchestration ─────────────────────────────────────────────────

async function runAnalysis() {
  setStepActive('analyzing');
  announce('Analyzing CAD files. This may take up to 30 seconds on the first run.');

  // Reset progress items
  STAGE_KEYS.forEach((key) => setProgressStageState(key, 'pending'));

  const progressError = el('cadProgressError');
  progressError?.classList.add('hidden');

  let currentStage = 'init';
  setProgressStageState('init', 'running');

  const bridge = getSharedBridge();

  const onProgress = (stage, message) => {
    // Mark previous stage as done
    if (currentStage !== stage) {
      setProgressStageState(currentStage, 'done');
      currentStage = stage;
      setProgressStageState(stage, 'running');
    }
    announce(message);

    const desc = el('cadAnalyzingDesc');
    if (desc) desc.textContent = message;
  };

  try {
    // Step 1: init Pyodide
    await bridge.init(onProgress);
    setProgressStageState('init', 'done');

    // Step 2: analyze files
    const projectName =
      el('cadProjectName')?.value.trim() ||
      (_files[0]?.name.replace(/\.[^.]+$/, '') ?? 'untitled');

    currentStage = 'stage0';
    setProgressStageState('stage0', 'running');

    const form = await bridge.analyze(_files, projectName, onProgress);

    // Mark remaining stages as done
    STAGE_KEYS.slice(1).forEach((key) => setProgressStageState(key, 'done'));

    _projectForm = form;
    renderComponentCards(form);
    renderFeatureCards(form);
    setStepActive('components');
    announce('Analysis complete. Please review the detected components.');

  } catch (err) {
    setProgressStageState(currentStage, 'error');
    const errorText = el('cadProgressErrorText');
    if (errorText) errorText.textContent = err.message ?? String(err);
    progressError?.classList.remove('hidden');
    announce(`Analysis failed: ${err.message}`);
    console.error('[CadConverterPanel] Analysis error:', err);
  }
}

async function runGenerate() {
  if (!_projectForm) return;

  const generateProgress = el('cadGenerateProgress');
  const generateError = el('cadGenerateError');
  const generateBtn = el('cadGenerateBtn');
  const downloadScadBtn = el('cadDownloadScadBtn');
  const downloadYamlBtn = el('cadDownloadYamlBtn');

  generateProgress?.classList.remove('hidden');
  generateError?.classList.add('hidden');
  downloadScadBtn?.classList.add('hidden');
  downloadYamlBtn?.classList.add('hidden');
  if (generateBtn) generateBtn.disabled = true;

  announce('Generating parametric OpenSCAD code…');

  const bridge = getSharedBridge();

  try {
    const scad = await bridge.generate(_projectForm);
    _generatedScad = scad;

    generateProgress?.classList.add('hidden');
    if (generateBtn) generateBtn.disabled = false;
    downloadScadBtn?.classList.remove('hidden');
    downloadYamlBtn?.classList.remove('hidden');

    const filename =
      (el('cadOutputFilename')?.value.trim() || _projectForm?.project?.name || 'output') + '.scad';

    announce('Code generated successfully. Loading into editor…');

    if (_onScadLoaded) {
      _onScadLoaded(scad, filename);
    }

  } catch (err) {
    generateProgress?.classList.add('hidden');
    if (generateBtn) generateBtn.disabled = false;

    const errorText = el('cadGenerateErrorText');
    if (errorText) errorText.textContent = err.message ?? String(err);
    generateError?.classList.remove('hidden');
    announce(`Generation failed: ${err.message}`);
    console.error('[CadConverterPanel] Generate error:', err);
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadText(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialise the converter panel.
 *
 * @param {function(scadCode: string, filename: string): void} onScadLoaded
 *   Called when generation succeeds and the user wants to load code into the editor.
 */
export function initCadConverterPanel(onScadLoaded) {
  _onScadLoaded = onScadLoaded;

  // ── Entry point: welcome screen upload zone ───────────────────────────
  const cadFileInputEntry = el('cadFileInput');
  if (cadFileInputEntry) {
    cadFileInputEntry.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        openWizardWithFiles(e.target.files);
      }
    });
  }

  const cadUploadZoneEntry = el('cadUploadZone');
  if (cadUploadZoneEntry) {
    cadUploadZoneEntry.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el('cadFileInput')?.click();
      }
    });
    setupDropZone(cadUploadZoneEntry, (files) => openWizardWithFiles(files));
  }

  // ── Back button from wizard to welcome screen ─────────────────────────
  el('cadConverterBackBtn')?.addEventListener('click', () => {
    hideWizard();
  });

  // ── Step 1: Upload ────────────────────────────────────────────────────
  const wizardFileInput = el('cadWizardFileInput');
  wizardFileInput?.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  const wizardUploadZone = el('cadWizardUploadZone');
  if (wizardUploadZone) {
    wizardUploadZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el('cadWizardFileInput')?.click();
      }
    });
    setupDropZone(wizardUploadZone, (files) => handleFilesSelected(files));
  }

  el('cadAnalyzeBtn')?.addEventListener('click', async () => {
    if (_files.length === 0) return;
    await runAnalysis();
  });

  // ── Step 2: Analyzing – retry ─────────────────────────────────────────
  el('cadProgressRetryBtn')?.addEventListener('click', async () => {
    if (_files.length > 0) await runAnalysis();
    else setStepActive('upload');
  });

  // ── Step 3: Components ────────────────────────────────────────────────
  el('cadComponentsBackBtn')?.addEventListener('click', () => setStepActive('upload'));
  el('cadComponentsNextBtn')?.addEventListener('click', () => {
    setStepActive('features');
    announce('Showing feature review. Enable or disable detected features.');
  });

  // ── Step 4: Features ──────────────────────────────────────────────────
  el('cadFeaturesBackBtn')?.addEventListener('click', () => setStepActive('components'));
  el('cadFeaturesNextBtn')?.addEventListener('click', () => {
    setStepActive('generate');
    // Pre-fill filename from project name
    const nameInput = el('cadOutputFilename');
    if (nameInput && _projectForm?.project?.name) {
      nameInput.value = _projectForm.project.name;
    }
    announce('Showing generate step. Click Generate to produce the .scad file.');
  });

  // ── Step 5: Generate ──────────────────────────────────────────────────
  el('cadGenerateBackBtn')?.addEventListener('click', () => setStepActive('features'));
  el('cadGenerateBtn')?.addEventListener('click', () => runGenerate());

  el('cadDownloadScadBtn')?.addEventListener('click', () => {
    if (!_generatedScad) return;
    const filename =
      (el('cadOutputFilename')?.value.trim() || _projectForm?.project?.name || 'output') + '.scad';
    downloadText(_generatedScad, filename, 'text/plain');
  });

  el('cadDownloadYamlBtn')?.addEventListener('click', () => {
    if (!_projectForm) return;
    const yaml = buildMinimalYaml(_projectForm);
    const name = _projectForm?.project?.name || 'project';
    downloadText(yaml, `${name}.yaml`, 'text/yaml');
  });
}

/**
 * Open the converter wizard and pre-populate it with files from the entry-point drop zone.
 * Called from both the welcome screen entry zone and main.js navigation.
 *
 * @param {FileList|File[]} fileList
 */
export async function openWizardWithFiles(fileList) {
  showWizard();
  setStepActive('upload');
  await handleFilesSelected(fileList);
}

/**
 * Show the converter wizard panel and hide the welcome screen.
 */
export function showWizard() {
  el('welcomeScreen')?.classList.add('hidden');
  el('mainInterface')?.classList.add('hidden');
  el('cadConverterPanel')?.classList.remove('hidden');
  el('workflowProgress')?.classList.add('hidden');
}

/**
 * Hide the converter wizard and return to the welcome screen.
 */
export function hideWizard() {
  el('cadConverterPanel')?.classList.add('hidden');
  el('welcomeScreen')?.classList.remove('hidden');
  // Reset state
  _step = 'upload';
  _files = [];
  _projectForm = null;
  _generatedScad = null;
  setStepActive('upload');
}

// ── Private helpers ────────────────────────────────────────────────────────

async function handleFilesSelected(fileList) {
  if (!fileList || fileList.length === 0) return;

  _files = await readFilesAsBuffers(Array.from(fileList));
  renderFileList(_files);

  // Show project name field
  const nameGroup = el('cadProjectNameGroup');
  if (nameGroup) nameGroup.hidden = false;

  // Default project name from first filename
  const nameInput = el('cadProjectName');
  if (nameInput && !nameInput.value && _files[0]) {
    nameInput.value = _files[0].name.replace(/\.[^.]+$/, '');
  }

  const analyzeBtn = el('cadAnalyzeBtn');
  if (analyzeBtn) analyzeBtn.disabled = false;

  announce(`${_files.length} file${_files.length === 1 ? '' : 's'} selected. Click Analyze Files to continue.`);
}

function setupDropZone(zone, onDrop) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('upload-zone--dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('upload-zone--dragover');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('upload-zone--dragover');
    const files = e.dataTransfer?.files;
    if (files?.length) onDrop(files);
  });
}

/**
 * Produce a minimal YAML representation of the ProjectForm for download.
 * (We don't bundle a proper YAML serialiser on the main thread – this is for
 * human readability only; the Python side has authoritative YAML.)
 */
function buildMinimalYaml(form) {
  const lines = ['# project.yaml (generated by OpenSCAD Assistive Forge)', ''];
  const proj = form.project ?? {};
  lines.push(`project:`);
  lines.push(`  name: ${proj.name ?? ''}`);
  lines.push(`  output_file: ${proj.output_file ?? ''}`);
  lines.push(`  eps: ${proj.eps ?? 0.01}`);
  lines.push(`  review_complete: true`);
  lines.push('');
  lines.push(`z_levels: [${(form.z_levels ?? []).join(', ')}]`);
  lines.push('');

  lines.push('components:');
  for (const c of form.components ?? []) {
    if (c.name?.startsWith('_deleted_')) continue;
    lines.push(`  - name: ${c.human_name ?? c.name}`);
    lines.push(`    role: ${c.human_role ?? c.role}`);
    lines.push(`    z_range: [${c.z_range?.join(', ') ?? '0, 0'}]`);
    lines.push(`    confirmed: true`);
  }
  lines.push('');

  lines.push('features:');
  for (const f of form.features ?? []) {
    if (!f.confirmed && f.enabled_by_default === false) continue;
    lines.push(`  - name: ${f.human_name ?? f.name}`);
    lines.push(`    type: ${f.type ?? f.feature_type}`);
    lines.push(`    confirmed: true`);
  }

  return lines.join('\n');
}
