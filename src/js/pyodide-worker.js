/**
 * Pyodide Web Worker
 *
 * Runs the forge_cad Python pipeline entirely in-browser via Pyodide (Python-in-WASM).
 * Communicates with the main thread via structured message-passing.
 *
 * Message API (incoming):
 *   { action: 'init' }
 *     → Loads Pyodide, installs packages, imports forge_cad modules.
 *       Reply: { type: 'init_complete' } | { type: 'error', stage: 'init', message }
 *
 *   { action: 'analyze', files: [{ name, data: Uint8Array }], projectName: string }
 *     → Mounts files to Pyodide FS, runs pipeline stages 0-6, returns ProjectForm JSON.
 *       Progress replies: { type: 'progress', stage: string, message: string }
 *       Reply: { type: 'analyze_complete', form: object } | { type: 'error', stage: 'analyze', message }
 *
 *   { action: 'generate', form: object }
 *     → Runs ScadEmitter.emit() on the provided (user-edited) ProjectForm JSON.
 *       Reply: { type: 'generate_complete', scad: string } | { type: 'error', stage: 'generate', message }
 *
 * @license GPL-3.0-or-later
 */

/* global importScripts */

const PYODIDE_VERSION = '0.29.3';
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// Packages to install via micropip (numpy/scipy/pyyaml are pre-built in Pyodide)
const MICROPIP_PACKAGES = ['trimesh', 'ezdxf', 'solidpython2'];

// Virtual filesystem mount point for uploaded files
const VFS_INPUT_DIR = '/input';

let pyodide = null;
let isInitialised = false;

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function loadPyodideEnv() {
  // Load pyodide.js from CDN into the worker scope
  importScripts(`${PYODIDE_BASE_URL}pyodide.js`);

  // loadPyodide is injected by the above script into the global scope
  // eslint-disable-next-line no-undef
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE_URL });

  postMessage({ type: 'progress', stage: 'init', message: 'Pyodide loaded, installing packages…' });

  await pyodide.loadPackage(['numpy', 'scipy', 'pyyaml', 'micropip']);

  postMessage({ type: 'progress', stage: 'init', message: 'Installing trimesh, ezdxf, solidpython2…' });

  await pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(MICROPIP_PACKAGES)})
`);

  postMessage({ type: 'progress', stage: 'init', message: 'Mounting forge_cad package…' });

  // Mount the forge_cad Python package from our static assets
  await mountForgeCad();

  postMessage({ type: 'progress', stage: 'init', message: 'Importing forge_cad modules…' });

  // Pre-import the modules we'll use to catch errors early
  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/forge_cad_pkg')

from forge_cad.analyzer.loader import FileLoader
from forge_cad.analyzer.z_profile import ZProfileExtractor
from forge_cad.analyzer.variant_diff import VariantDiffer
from forge_cad.analyzer.topology import TopologyClassifier
from forge_cad.analyzer.feature_detect import FeatureDetector
from forge_cad.analyzer.boundary_detect import BoundaryDetector
from forge_cad.forms.project_form import ProjectForm, ComponentEntry, FeatureEntry, FileEntry
from forge_cad.generator.scad_emitter import ScadEmitter
import json
`);

  isInitialised = true;
}

async function mountForgeCad() {
  // Fetch the package index listing (generated at build time)
  const indexResp = await fetch('/python/forge_cad_index.json');
  if (!indexResp.ok) {
    throw new Error(`Could not fetch forge_cad package index: ${indexResp.status}`);
  }
  const index = await indexResp.json();

  // Create base directory
  pyodide.FS.mkdir('/forge_cad_pkg');
  pyodide.FS.mkdir('/forge_cad_pkg/forge_cad');

  // Fetch and write each file
  for (const filePath of index.files) {
    const url = `/python/${filePath}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[PyodideWorker] Could not fetch ${url}: ${resp.status}, skipping`);
      continue;
    }
    const content = await resp.text();

    // Ensure parent directories exist
    const parts = filePath.split('/');
    let currentPath = '/forge_cad_pkg';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += '/' + parts[i];
      try {
        pyodide.FS.mkdir(currentPath);
      } catch {
        // Directory already exists
      }
    }

    pyodide.FS.writeFile(`/forge_cad_pkg/${filePath}`, content);
  }
}

// ── File mounting ──────────────────────────────────────────────────────────

function mountInputFiles(files) {
  // Clear any previous input
  try {
    const entries = pyodide.FS.readdir(VFS_INPUT_DIR);
    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue;
      try {
        pyodide.FS.unlink(`${VFS_INPUT_DIR}/${entry}`);
      } catch {
        // Ignore removal errors
      }
    }
  } catch {
    // Directory doesn't exist yet
    pyodide.FS.mkdir(VFS_INPUT_DIR);
  }

  for (const { name, data } of files) {
    pyodide.FS.writeFile(`${VFS_INPUT_DIR}/${name}`, data);
  }
}

// ── Analysis pipeline ──────────────────────────────────────────────────────

async function runAnalysis(files, projectName) {
  mountInputFiles(files);

  const sendProgress = (stage, message) => {
    postMessage({ type: 'progress', stage, message });
  };

  sendProgress('stage0', 'Loading and scanning files…');

  const formJson = await pyodide.runPythonAsync(`
import json
from pathlib import Path
from forge_cad.analyzer.loader import FileLoader
from forge_cad.analyzer.z_profile import ZProfileExtractor
from forge_cad.analyzer.variant_diff import VariantDiffer
from forge_cad.analyzer.topology import TopologyClassifier
from forge_cad.analyzer.feature_detect import FeatureDetector
from forge_cad.analyzer.boundary_detect import BoundaryDetector
from forge_cad.forms.project_form import ProjectForm, ComponentEntry, FeatureEntry, FileEntry

source_dir = Path('${VFS_INPUT_DIR}')
project_name = ${JSON.stringify(projectName)}

# Stage 0 – Load
loader = FileLoader(source_dir)
meshes = loader.load_all()

# Stage 1 – Z-profiles
z_extractor = ZProfileExtractor(meshes)
z_profiles = z_extractor.extract()

# Stage 2 – Variant diff
differ = VariantDiffer(meshes)
variant_diffs = differ.compute()

# Stage 3 – Topology
classifier = TopologyClassifier(meshes, z_profiles, variant_diffs)
components = classifier.classify()

# Stage 4 – Feature detect
detector = FeatureDetector(meshes, z_profiles, variant_diffs)
features = detector.detect()

# Stage 6 – Boundary detect
boundary_det = BoundaryDetector(meshes, components)
boundaries = boundary_det.detect()

# Build form
form = ProjectForm.from_analysis(
    name=project_name,
    source_dir=str(source_dir),
    output_file=project_name + '.scad',
    loaded_meshes=meshes,
    z_profile_result=z_profiles,
    components=components,
    features=features,
    boundaries=boundaries,
)

# Serialise to dict then JSON
json.dumps(form._to_dict())
`);

  return JSON.parse(formJson);
}

// ── Code generation ─────────────────────────────────────────────────────────

async function runGenerate(formDict) {
  // Write the form JSON to VFS so Python can load it
  const formJson = JSON.stringify(formDict);
  pyodide.FS.writeFile('/tmp/project_form.json', formJson);

  const scadCode = await pyodide.runPythonAsync(`
import json
from forge_cad.forms.project_form import ProjectForm
from forge_cad.generator.scad_emitter import ScadEmitter

with open('/tmp/project_form.json') as f:
    data = json.load(f)

form = ProjectForm._from_dict(data)

# Mark all components + features as confirmed for emission
for c in form.components:
    c.confirmed = True
for f in form.features:
    f.confirmed = True

emitter = ScadEmitter(form)
emitter.emit()
`);

  return scadCode;
}

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { action, id } = event.data;

  try {
    if (action === 'init') {
      if (isInitialised) {
        postMessage({ type: 'init_complete', id });
        return;
      }
      await loadPyodideEnv();
      postMessage({ type: 'init_complete', id });

    } else if (action === 'analyze') {
      if (!isInitialised) {
        throw new Error('Worker not initialised. Call init first.');
      }
      const { files, projectName } = event.data;
      const form = await runAnalysis(files, projectName || 'untitled');
      postMessage({ type: 'analyze_complete', form, id });

    } else if (action === 'generate') {
      if (!isInitialised) {
        throw new Error('Worker not initialised. Call init first.');
      }
      const { form } = event.data;
      const scad = await runGenerate(form);
      postMessage({ type: 'generate_complete', scad, id });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    postMessage({
      type: 'error',
      stage: action,
      message: err.message || String(err),
      id,
    });
  }
};
