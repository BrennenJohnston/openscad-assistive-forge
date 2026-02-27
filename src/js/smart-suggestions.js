/**
 * Smart Suggestions
 *
 * Runs after analysis completes and generates inline hints/suggestions based
 * on the detected archetype, intent, and features.  Suggestions are rendered
 * as dismissible cards either between the component review and feature review
 * steps, or as inline hints on feature cards.
 *
 * Public API:
 *   generateSuggestions(form)  → SuggestionSet
 *   renderSuggestions(set, containerId)  → void
 *
 * @license GPL-3.0-or-later
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Suggestion
 * @property {'info'|'warning'|'tip'} kind
 * @property {string} title
 * @property {string} body
 * @property {string|null} paramTarget  - param name this hint relates to, or null
 */

/**
 * @typedef {Object} SuggestionSet
 * @property {Suggestion[]} items
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Archetypes that benefit from a wall_thickness parameter being exposed. */
const SHELL_ARCHETYPES = new Set(['shell', 'box_enclosure', 'rotational']);

/** Features that should almost always be kept parametric. */
const ALWAYS_PARAMETRIC_FEATURES = new Set(['circular_hole', 'rectangular_slot']);

/** Parameters that should almost always be locked. */
const USUALLY_LOCKED_PARAMS = new Set(['eps', 'fn', '$fn', '$fs', '$fa']);

// ── Core logic ─────────────────────────────────────────────────────────────

/**
 * Generate suggestions from a ProjectForm dict.
 *
 * @param {object} form  - ProjectForm as a plain JS object (from Python _to_dict())
 * @returns {SuggestionSet}
 */
export function generateSuggestions(form) {
  const items = [];
  const archetype = form?.project?.archetype ?? 'flat_plate';
  const intent = form?.intent ?? {};
  const features = form?.features ?? [];
  const components = form?.components ?? [];
  const mfg = intent.manufacturing_method ?? 'fdm';
  const a11y = intent.accessibility_needs ?? [];

  // ── Archetype-based suggestions ──────────────────────────────────────────

  if (archetype === 'flat_plate') {
    items.push({
      kind: 'info',
      title: 'Flat plate detected',
      body: 'The analyzer identified this as a flat plate/panel. '
        + 'body_thickness and any hole diameters are the most useful parameters to expose.',
      paramTarget: 'body_thickness',
    });
  } else if (archetype === 'rotational') {
    items.push({
      kind: 'info',
      title: 'Rotational part detected',
      body: 'This part appears rotationally symmetric. Consider exposing outer_radius, '
        + 'inner_radius (if hollow), and height as key parameters.',
      paramTarget: null,
    });
  } else if (archetype === 'shell') {
    items.push({
      kind: 'tip',
      title: 'Thin-walled shell',
      body: 'wall_thickness is the most impactful parameter for shell-type parts. '
        + 'Ensure it has a sensible minimum (≥ 1.2 mm for FDM).',
      paramTarget: 'wall_thickness',
    });
  } else if (archetype === 'box_enclosure') {
    items.push({
      kind: 'tip',
      title: 'Box enclosure detected',
      body: 'Expose box_width, box_depth, box_height, and wall_thickness. '
        + 'Consider locking the corner fillet radius if it doesn\'t need adjustment.',
      paramTarget: null,
    });
  } else if (archetype === 'organic') {
    items.push({
      kind: 'warning',
      title: 'Organic / complex shape',
      body: 'Complex organic shapes may not simplify cleanly into parametric primitives. '
        + 'Review the generated hull approximation carefully.',
      paramTarget: null,
    });
  }

  // ── Manufacturing-specific suggestions ───────────────────────────────────

  if (mfg === 'fdm') {
    items.push({
      kind: 'tip',
      title: 'FDM printing tip',
      body: 'For FDM: add 0.2–0.4 mm clearance to hole diameters (shrinkage). '
        + 'Keep wall_thickness ≥ 1.2 mm (2 perimeters at 0.6 mm line width).',
      paramTarget: null,
    });
    // Check if any holes are very small
    const smallHoles = features.filter(
      (f) => f.feature_type === 'circular_hole' && (f.params?.diameter ?? 10) < 2.0
    );
    if (smallHoles.length > 0) {
      items.push({
        kind: 'warning',
        title: `${smallHoles.length} small hole(s) detected`,
        body: `Holes under 2 mm (${smallHoles.map((f) => f.name).join(', ')}) may not `
          + 'print reliably on FDM printers. Consider increasing the minimum diameter.',
        paramTarget: null,
      });
    }
  } else if (mfg === 'sla') {
    items.push({
      kind: 'tip',
      title: 'SLA/resin printing tip',
      body: 'SLA allows finer detail. Expose fillet_radius with a lower minimum (0.2 mm). '
        + 'Set hole clearance to 0.1–0.15 mm.',
      paramTarget: null,
    });
  } else if (mfg === 'laser_cut') {
    items.push({
      kind: 'info',
      title: 'Laser-cut profile',
      body: 'For laser cutting, expose material_thickness as a primary parameter. '
        + 'Lock any parameters that are constrained by your kerf width.',
      paramTarget: null,
    });
  }

  // ── Accessibility-based suggestions ──────────────────────────────────────

  if (a11y.includes('reduced_grip')) {
    items.push({
      kind: 'tip',
      title: 'Reduced-grip accessibility',
      body: 'For reduced-grip users: expose grip_diameter (25–50 mm), '
        + 'wall_thickness (3–8 mm for padding), and fillet_radius (2–5 mm) as key parameters.',
      paramTarget: null,
    });
  }

  if (a11y.includes('visual_impairment')) {
    items.push({
      kind: 'tip',
      title: 'Visual impairment accessibility',
      body: 'Consider exposing tactile indicator sizes (5–15 mm) and button_size (15–30 mm) '
        + 'to help visually impaired users customise by feel.',
      paramTarget: null,
    });
  }

  // ── Feature-level suggestions ────────────────────────────────────────────

  const paramFeatures = features.filter((f) =>
    ALWAYS_PARAMETRIC_FEATURES.has(f.feature_type)
  );
  if (paramFeatures.length > 0) {
    items.push({
      kind: 'tip',
      title: `${paramFeatures.length} feature(s) recommended for parametric control`,
      body: paramFeatures
        .map((f) => `• ${f.name ?? f.feature_type}: expose ${_featureKeyParam(f)}`)
        .join('\n'),
      paramTarget: null,
    });
  }

  // Suggest locking eps
  items.push({
    kind: 'tip',
    title: 'Lock eps',
    body: 'The eps (Boolean clearance) parameter should be locked — it is a technical '
      + 'constant and not meant for end-user adjustment.',
    paramTarget: 'eps',
  });

  return { items };
}

/**
 * Render a SuggestionSet as dismissible cards into a container element.
 *
 * @param {SuggestionSet} set
 * @param {string} containerId
 */
export function renderSuggestions(set, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !set?.items?.length) return;

  container.innerHTML = '';

  for (const suggestion of set.items) {
    const card = _buildSuggestionCard(suggestion);
    container.appendChild(card);
  }

  container.classList.remove('hidden');
}

// ── Private helpers ────────────────────────────────────────────────────────

function _featureKeyParam(feat) {
  switch (feat.feature_type) {
    case 'circular_hole': return 'diameter';
    case 'rectangular_slot': return 'width, height';
    case 'fillet': return 'radius';
    case 'chamfer': return 'size';
    default: return 'params';
  }
}

function _buildSuggestionCard(suggestion) {
  const card = document.createElement('div');
  card.className = `cad-suggestion cad-suggestion--${suggestion.kind}`;
  card.setAttribute('role', 'status');

  const icon = suggestion.kind === 'warning' ? '⚠' : suggestion.kind === 'tip' ? '💡' : 'ℹ';

  card.innerHTML = `
    <div class="cad-suggestion-header">
      <span class="cad-suggestion-icon" aria-hidden="true">${icon}</span>
      <strong class="cad-suggestion-title">${_escHtml(suggestion.title)}</strong>
      <button
        type="button"
        class="cad-suggestion-dismiss"
        aria-label="Dismiss suggestion: ${_escHtml(suggestion.title)}"
      >×</button>
    </div>
    <p class="cad-suggestion-body">${_escHtml(suggestion.body).replace(/\n/g, '<br>')}</p>
  `;

  card.querySelector('.cad-suggestion-dismiss').addEventListener('click', () => {
    card.classList.add('cad-suggestion--dismissed');
    setTimeout(() => card.remove(), 250);
  });

  return card;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
