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
import { generateSuggestions, renderSuggestions } from './smart-suggestions.js';

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

// File quality tiers by extension
const FILE_QUALITY = {
  step: { tier: 'best', label: 'STEP — rich geometry, best for conversion' },
  stp:  { tier: 'best', label: 'STEP — rich geometry, best for conversion' },
  iges: { tier: 'good', label: 'IGES — good geometry (legacy B-rep format)' },
  igs:  { tier: 'good', label: 'IGES — good geometry (legacy B-rep format)' },
  '3mf': { tier: 'good', label: '3MF — mesh with metadata (better than STL)' },
  amf:  { tier: 'good', label: 'AMF — mesh with metadata (better than STL)' },
  stl:  { tier: 'ok',   label: 'STL — triangulated mesh (minimal information)' },
  obj:  { tier: 'ok',   label: 'OBJ — mesh with optional materials' },
  dxf:  { tier: 'ok',   label: 'DXF — 2D profiles' },
  svg:  { tier: 'ok',   label: 'SVG — 2D vector paths' },
};

// ── State ──────────────────────────────────────────────────────────────────

let _step = 'upload';
let _files = []; // [{ name: string, data: Uint8Array }]
let _projectForm = null; // raw dict from Python _to_dict()
let _generatedScad = null;
let _onScadLoaded = null;
let _intentData = null; // collected from intent questionnaire

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

    // Quality badge
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const quality = FILE_QUALITY[ext];
    if (quality) {
      const badge = document.createElement('span');
      badge.className = `cad-file-badge cad-file-badge--${quality.tier}`;
      badge.textContent = quality.tier === 'best' ? 'Best' : quality.tier === 'good' ? 'Good' : 'OK';
      badge.title = quality.label;
      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(size);
      li.appendChild(badge);
    } else {
      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(size);
    }

    list.appendChild(li);
  }

  list.classList.toggle('hidden', files.length === 0);

  // Update per-file validation feedback
  validateFileTypes(files);
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'stl') return '▲';
  if (ext === 'obj') return '◆';
  if (ext === 'dxf') return '◻';
  if (ext === 'step' || ext === 'stp') return '⬡';
  if (ext === 'iges' || ext === 'igs') return '⬢';
  if (ext === '3mf' || ext === 'amf') return '◈';
  if (ext === 'svg') return '⬟';
  return '📄';
}

function validateFileTypes(files) {
  const feedback = el('cadFileValidationFeedback');
  if (!feedback) return;

  if (files.length === 0) {
    feedback.classList.add('hidden');
    return;
  }

  const msgs = [];
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const quality = FILE_QUALITY[ext];
    if (quality) {
      msgs.push(`${f.name}: ${quality.label}`);
    }
  }

  if (msgs.length > 0) {
    feedback.innerHTML = msgs.map((m) => `<div class="cad-validation-msg">${escHtml(m)}</div>`).join('');
    feedback.classList.remove('hidden');
  } else {
    feedback.classList.add('hidden');
  }
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

  // Delegated event listener for parameter table inputs
  container.addEventListener('input', (e) => {
    const row = e.target.closest('.cad-param-row');
    if (!row) return;
    const featIdx = parseInt(row.dataset.featIdx, 10);
    const specIdx = parseInt(row.dataset.specIdx, 10);
    const field = e.target.dataset.field;
    if (!_projectForm?.features?.[featIdx]?.parameter_specs?.[specIdx]) return;

    const spec = _projectForm.features[featIdx].parameter_specs[specIdx];
    const numVal = parseFloat(e.target.value);
    if (field === 'value') spec.value = isNaN(numVal) ? e.target.value : numVal;
    else if (field === 'min') spec.min_val = isNaN(numVal) ? null : numVal;
    else if (field === 'step') spec.step = isNaN(numVal) ? null : numVal;
    else if (field === 'max') spec.max_val = isNaN(numVal) ? null : numVal;
    else if (field === 'locked') spec.locked = e.target.checked;
  });

  container.addEventListener('change', (e) => {
    const row = e.target.closest('.cad-param-row');
    if (!row) return;
    const featIdx = parseInt(row.dataset.featIdx, 10);
    const specIdx = parseInt(row.dataset.specIdx, 10);
    const field = e.target.dataset.field;
    if (!_projectForm?.features?.[featIdx]?.parameter_specs?.[specIdx]) return;

    const spec = _projectForm.features[featIdx].parameter_specs[specIdx];
    if (field === 'locked') spec.locked = e.target.checked;
  });
}

function buildFeatureCard(feat, idx) {
  const card = document.createElement('article');
  card.className = 'cad-review-card cad-feature-card';
  card.dataset.featureIdx = idx;

  const enabled = feat.enabled_by_default !== false;

  // Ensure parameter_specs exist; auto-generate from params if needed
  if (!feat.parameter_specs || feat.parameter_specs.length === 0) {
    feat.parameter_specs = autoParamSpecs(feat);
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].parameter_specs = feat.parameter_specs;
    }
  }

  card.innerHTML = `
    <div class="cad-card-header">
      <div class="cad-card-title-group">
        <label class="cad-card-label" for="feat-name-${idx}">Name</label>
        <input
          type="text"
          id="feat-name-${idx}"
          class="cad-text-input cad-card-name-input"
          value="${escHtml(feat.name ?? '')}"
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
        <select id="feat-type-${idx}" class="cad-select" aria-label="Feature type">
          ${FEATURE_TYPES.map(
            (t) => `<option value="${t}" ${t === feat.feature_type ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
      <div class="cad-card-field">
        <span class="cad-card-label">Detected from</span>
        <span class="cad-card-value">${escHtml(feat.detected_from ?? '—')}</span>
      </div>
    </div>
    ${feat.parameter_specs.length > 0 ? buildParamTable(feat.parameter_specs, idx) : ''}
  `;

  // Sync edits back to form dict
  card.querySelector(`#feat-name-${idx}`).addEventListener('input', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].human_name = e.target.value;
    }
  });
  card.querySelector(`#feat-type-${idx}`).addEventListener('change', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].feature_type = e.target.value;
    }
  });
  card.querySelector(`#feat-enable-${idx}`).addEventListener('change', (e) => {
    if (_projectForm?.features?.[idx]) {
      _projectForm.features[idx].enabled_by_default = e.target.checked;
      _projectForm.features[idx].confirmed = e.target.checked;
    }
  });

  // Set initial confirmed state
  if (_projectForm?.features?.[idx]) {
    _projectForm.features[idx].confirmed = enabled;
  }

  return card;
}

/**
 * Build an editable parameter table for a feature card.
 *
 * @param {object[]} specs - array of ParameterSpec dicts
 * @param {number} featIdx - feature index in _projectForm
 * @returns {string} HTML string
 */
function buildParamTable(specs, featIdx) {
  const rows = specs.map((spec, j) => {
    const val   = spec.value  ?? '';
    const min   = spec.min   ?? spec.min_val ?? '';
    const step  = spec.step  ?? '';
    const max   = spec.max   ?? spec.max_val ?? '';
    const locked = spec.locked ? 'checked' : '';
    return `
      <tr class="cad-param-row" data-feat-idx="${featIdx}" data-spec-idx="${j}">
        <td class="cad-param-name">
          <label class="sr-only" for="spec-${featIdx}-${j}-val">${escHtml(spec.name)}</label>
          <span class="cad-param-name-text">${escHtml(spec.name)}</span>
        </td>
        <td>
          <label class="sr-only" for="spec-${featIdx}-${j}-val">Value</label>
          <input id="spec-${featIdx}-${j}-val" type="number" class="cad-param-input" data-field="value"
            value="${escHtml(String(val))}" step="any" aria-label="${escHtml(spec.name)} value" />
        </td>
        <td>
          <label class="sr-only" for="spec-${featIdx}-${j}-min">Min</label>
          <input id="spec-${featIdx}-${j}-min" type="number" class="cad-param-input" data-field="min"
            value="${escHtml(String(min))}" step="any" aria-label="${escHtml(spec.name)} minimum" />
        </td>
        <td>
          <label class="sr-only" for="spec-${featIdx}-${j}-step">Step</label>
          <input id="spec-${featIdx}-${j}-step" type="number" class="cad-param-input" data-field="step"
            value="${escHtml(String(step))}" step="any" aria-label="${escHtml(spec.name)} step" />
        </td>
        <td>
          <label class="sr-only" for="spec-${featIdx}-${j}-max">Max</label>
          <input id="spec-${featIdx}-${j}-max" type="number" class="cad-param-input" data-field="max"
            value="${escHtml(String(max))}" step="any" aria-label="${escHtml(spec.name)} maximum" />
        </td>
        <td class="cad-param-lock-cell">
          <label class="cad-param-lock" for="spec-${featIdx}-${j}-lock"
            title="Lock this parameter (suppresses Customizer range annotation)">
            <input id="spec-${featIdx}-${j}-lock" type="checkbox" class="cad-param-lock-input"
              data-field="locked" ${locked}
              aria-label="Lock parameter ${escHtml(spec.name)}" />
            <span class="cad-param-lock-icon" aria-hidden="true">🔒</span>
          </label>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="cad-param-table-wrap">
      <table class="cad-param-table" aria-label="Parameter ranges">
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            <th scope="col">Value</th>
            <th scope="col">Min</th>
            <th scope="col">Step</th>
            <th scope="col">Max</th>
            <th scope="col">Lock</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Auto-generate ParameterSpec dicts from a feature's detected params.
 * Mirrors the Python _auto_param_specs logic on the JS side.
 *
 * @param {object} feat  - feature dict
 * @returns {object[]}   - array of ParameterSpec-like objects
 */
function autoParamSpecs(feat) {
  const specs = [];
  const p = feat.params ?? {};
  const ftype = feat.feature_type ?? '';
  const safeName = (feat.name ?? ftype).toLowerCase().replace(/[^a-z0-9_]/g, '_');

  if (ftype === 'circular_hole') {
    const d = p.diameter ?? 10;
    specs.push({
      name: `${safeName}_diameter`,
      value: round2(d),
      type: 'number',
      min: 1.0,
      step: 0.5,
      max: round2(d * 2),
      description: `Diameter of ${feat.name ?? feat.feature_type}`,
      locked: false,
    });
  } else if (ftype === 'rectangular_slot') {
    const w = p.width ?? 10;
    const h = p.height ?? 10;
    specs.push({
      name: `${safeName}_width`,
      value: round2(w),
      type: 'number',
      min: 1.0,
      step: 0.5,
      max: round2(w * 2),
      description: `Width of ${feat.name ?? feat.feature_type}`,
      locked: false,
    });
    specs.push({
      name: `${safeName}_height`,
      value: round2(h),
      type: 'number',
      min: 1.0,
      step: 0.5,
      max: round2(h * 2),
      description: `Height of ${feat.name ?? feat.feature_type}`,
      locked: false,
    });
  } else if (ftype === 'fillet') {
    const r = p.radius ?? 1.0;
    specs.push({
      name: `${safeName}_radius`,
      value: round2(r),
      type: 'number',
      min: 0.5,
      step: 0.5,
      max: round2(Math.max(r * 3, 5.0)),
      description: `Radius of ${feat.name ?? feat.feature_type}`,
      locked: false,
    });
  } else if (ftype === 'chamfer') {
    const s = p.size ?? 1.0;
    specs.push({
      name: `${safeName}_size`,
      value: round2(s),
      type: 'number',
      min: 0.1,
      step: 0.1,
      max: round2(Math.max(s * 3, 3.0)),
      description: `Size of ${feat.name ?? feat.feature_type}`,
      locked: false,
    });
  }

  return specs;
}

function round2(v) {
  return Math.round(v * 100) / 100;
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

    const form = await bridge.analyze(_files, projectName, onProgress, _intentData);

    // Mark remaining stages as done
    STAGE_KEYS.slice(1).forEach((key) => setProgressStageState(key, 'done'));

    _projectForm = form;
    renderComponentCards(form);
    renderFeatureCards(form);

    // Phase 4C: render smart suggestions
    const suggestions = generateSuggestions(form);
    renderSuggestions(suggestions, 'cadSuggestionsContainer');

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
  const validateBtn = el('cadValidateBtn');
  const validateResult = el('cadValidateResult');

  generateProgress?.classList.remove('hidden');
  generateError?.classList.add('hidden');
  validateResult?.classList.add('hidden');
  downloadScadBtn?.classList.add('hidden');
  downloadYamlBtn?.classList.add('hidden');
  validateBtn?.classList.add('hidden');
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
    validateBtn?.classList.remove('hidden');

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

/**
 * Phase 4D: Validate the generated SCAD by sending it through the existing
 * OpenSCAD WASM renderer and reporting the outcome.
 */
async function validateScad() {
  const validateResult = el('cadValidateResult');
  const validateBtn = el('cadValidateBtn');

  if (!_generatedScad || !validateResult) return;

  validateResult.className = 'cad-validate-result cad-validate-result--pending';
  validateResult.textContent = 'Validating…';
  validateResult.classList.remove('hidden');
  if (validateBtn) validateBtn.disabled = true;
  announce('Validating generated SCAD code…');

  try {
    // Use the existing OpenSCAD WASM renderer already present in this app.
    // The renderer module exposes renderScad(code) → { ok, error }
    const rendererModule = await import('./openscad-renderer.js').catch(() => null);
    if (!rendererModule?.renderScad) {
      throw new Error(
        'OpenSCAD WASM renderer not available in this build. '
        + 'Download the .scad file and validate locally with OpenSCAD.'
      );
    }

    const result = await rendererModule.renderScad(_generatedScad);

    if (result.ok) {
      validateResult.className = 'cad-validate-result cad-validate-result--pass';
      validateResult.textContent = '✓ SCAD compiled successfully — geometry is valid.';
      announce('Validation passed. SCAD is valid.');
    } else {
      validateResult.className = 'cad-validate-result cad-validate-result--fail';
      validateResult.textContent = `✗ Compilation error: ${result.error ?? 'unknown error'}`;
      announce(`Validation failed: ${result.error}`);
    }
  } catch (err) {
    validateResult.className = 'cad-validate-result cad-validate-result--warn';
    validateResult.textContent = `⚠ Could not validate: ${err.message ?? String(err)}`;
    announce('Validation could not complete.');
  } finally {
    if (validateBtn) validateBtn.disabled = false;
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

// ── Intent data collection ─────────────────────────────────────────────────

/**
 * Collect intent questionnaire data from the cadStep-intent DOM.
 *
 * @returns {{ object_category, manufacturing_method, adjustable_dimensions, target_use, accessibility_needs }}
 */
function collectIntentData() {
  const radio = (name) => {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked?.value ?? null;
  };
  const checks = (name) =>
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
      .map((i) => i.value);

  return {
    object_category: radio('intentCategory') ?? 'custom',
    manufacturing_method: radio('intentMfg') ?? 'fdm',
    adjustable_dimensions: checks('intentDims').length > 0 ? checks('intentDims') : ['all'],
    target_use: el('intentTargetUse')?.value.trim() ?? '',
    accessibility_needs: checks('intentA11y').filter((v) => v !== 'none'),
  };
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

  el('cadAnalyzeBtn')?.addEventListener('click', () => {
    if (_files.length === 0) return;
    setStepActive('intent');
    // Focus first field in intent step
    setTimeout(() => {
      const firstRadio = document.querySelector('#cadStep-intent input[type="radio"]');
      firstRadio?.focus();
    }, 50);
  });

  // ── Step 2: Intent questionnaire ──────────────────────────────────────
  el('cadIntentBackBtn')?.addEventListener('click', () => setStepActive('upload'));
  el('cadIntentNextBtn')?.addEventListener('click', async () => {
    _intentData = collectIntentData();
    await runAnalysis();
  });

  // ── Step 3: Analyzing – retry ─────────────────────────────────────────
  el('cadProgressRetryBtn')?.addEventListener('click', async () => {
    if (_files.length > 0) await runAnalysis();
    else setStepActive('upload');
  });

  // ── Step 4: Components ────────────────────────────────────────────────
  el('cadComponentsBackBtn')?.addEventListener('click', () => setStepActive('intent'));
  el('cadComponentsNextBtn')?.addEventListener('click', () => {
    setStepActive('features');
    announce('Showing feature review. Enable or disable detected features.');
  });

  // ── Step 5: Features ──────────────────────────────────────────────────
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

  // ── Step 6: Generate ──────────────────────────────────────────────────
  el('cadGenerateBackBtn')?.addEventListener('click', () => setStepActive('features'));
  el('cadGenerateBtn')?.addEventListener('click', () => runGenerate());
  el('cadValidateBtn')?.addEventListener('click', () => validateScad());

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
  _intentData = null;
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
