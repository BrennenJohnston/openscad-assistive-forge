// F35 Spike S1 — directory-handle persistence verification.
//
// All logic is intentionally inline here, not split into modules,
// because this file ships a *throwaway* spike artefact and we want
// reviewers to see the full behaviour at a glance. Roughly 100 LOC
// excluding JSDoc — see README.md for context.
//
// What it does:
//   1. Stores / retrieves a single FileSystemDirectoryHandle in
//      IndexedDB ("f35-spike" / "handles" / key="root").
//   2. On Restore, calls handle.queryPermission first; only calls
//      requestPermission when needed AND only inside the click event
//      so the user-gesture requirement is satisfied.
//   3. Lets the user register a tiny service worker and bump its
//      version to simulate an update — see sw.js.
//   4. Logs a timeline of every event so the run is auditable.

const DB_NAME = 'f35-spike';
const DB_STORE = 'handles';
const DB_KEY = 'root';

const $ = (id) => document.getElementById(id);
const fsaSupported = 'showDirectoryPicker' in self;
const idbSupported = 'indexedDB' in self;

function ts() {
  return new Date().toISOString().split('T')[1].replace('Z', '');
}
function log(msg, kind = '') {
  const pre = $('log');
  const line = document.createElement('span');
  if (kind) line.classList.add(`log-${kind}`);
  line.textContent = `[${ts()}] ${msg}\n`;
  pre.appendChild(line);
  pre.scrollTop = pre.scrollHeight;
  console.log(`[spike] ${msg}`);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let currentHandle = null;
async function setHandleStatus(handle) {
  currentHandle = handle;
  $('status-handle').textContent = handle ? handle.name : 'none';
  if (!handle) {
    $('status-permission').textContent = 'unknown';
    return;
  }
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    $('status-permission').textContent = perm;
  } catch (err) {
    $('status-permission').textContent = `query failed: ${err.message}`;
  }
}

$('status-fsa').textContent = fsaSupported
  ? 'yes'
  : 'NO — File System Access API missing';
$('status-idb').textContent = idbSupported ? 'yes' : 'NO — IndexedDB missing';
if (!fsaSupported || !idbSupported) {
  log('Bailing out: required API missing.', 'error');
  for (const id of [
    'pick-btn',
    'restore-btn',
    'list-btn',
    'forget-btn',
    'sw-register-btn',
    'sw-bump-btn',
  ]) {
    $(id).disabled = true;
  }
}

$('pick-btn').addEventListener('click', async () => {
  try {
    const handle = await self.showDirectoryPicker({ mode: 'readwrite' });
    await idbPut(handle);
    await setHandleStatus(handle);
    log(`Picked and stored handle: "${handle.name}"`, 'ok');
  } catch (err) {
    if (err?.name === 'AbortError') log('Pick cancelled by user.', 'warn');
    else log(`Pick failed: ${err?.name ?? ''} ${err?.message ?? err}`, 'error');
  }
});

$('restore-btn').addEventListener('click', async () => {
  try {
    const stored = await idbGet();
    if (!stored) {
      log('No stored handle in IDB. Use "Pick folder" first.', 'warn');
      return;
    }
    const queried = await stored.queryPermission({ mode: 'readwrite' });
    log(`Stored handle "${stored.name}" — queryPermission = ${queried}`);
    if (queried !== 'granted') {
      const requested = await stored.requestPermission({ mode: 'readwrite' });
      log(`requestPermission returned: ${requested}`);
      if (requested !== 'granted') {
        log('Permission denied by user.', 'warn');
        await setHandleStatus(stored);
        return;
      }
    }
    await setHandleStatus(stored);
    log('Handle restored with readwrite permission.', 'ok');
  } catch (err) {
    log(`Restore failed: ${err?.name ?? ''} ${err?.message ?? err}`, 'error');
  }
});

$('list-btn').addEventListener('click', async () => {
  if (!currentHandle) {
    log('No active handle. Pick or Restore first.', 'warn');
    return;
  }
  try {
    let count = 0;
    for await (const [name, child] of currentHandle.entries()) {
      log(`  ${child.kind === 'directory' ? '[dir]' : '[file]'} ${name}`);
      count++;
      if (count >= 25) {
        log(`  …(truncated after 25 entries)`);
        break;
      }
    }
    log(`Listed ${count} entries.`, 'ok');
  } catch (err) {
    log(`List failed: ${err?.name ?? ''} ${err?.message ?? err}`, 'error');
  }
});

$('forget-btn').addEventListener('click', async () => {
  await idbDelete();
  await setHandleStatus(null);
  log('Cleared stored handle from IDB.', 'ok');
});

async function refreshSwStatus() {
  if (!('serviceWorker' in navigator)) {
    $('status-sw').textContent = 'unsupported';
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration('./');
  if (!reg) {
    $('status-sw').textContent = 'none';
    return;
  }
  const w = reg.active || reg.waiting || reg.installing;
  $('status-sw').textContent = w
    ? `${w.state} @ ${reg.scope}`
    : `registered @ ${reg.scope}`;
}

$('sw-register-btn').addEventListener('click', async () => {
  if (!('serviceWorker' in navigator)) {
    log('serviceWorker API unavailable.', 'error');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
    });
    log(`Service worker registered. scope=${reg.scope}`, 'ok');
    await refreshSwStatus();
  } catch (err) {
    log(`SW register failed: ${err?.message ?? err}`, 'error');
  }
});

$('sw-bump-btn').addEventListener('click', async () => {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('./');
  if (!reg) {
    log('No SW registered. Use "Register SW v1" first.', 'warn');
    return;
  }
  // Re-register with a cache-busting query string so the browser
  // fetches sw.js fresh and detects a "new" service worker.
  const url = `./sw.js?cacheBust=${Date.now()}`;
  try {
    await navigator.serviceWorker.register(url, { scope: './' });
    log(`Re-registered SW with cache-bust: ${url}. Reload twice to test update flow.`, 'ok');
    await refreshSwStatus();
  } catch (err) {
    log(`SW bump failed: ${err?.message ?? err}`, 'error');
  }
});

$('copy-log-btn').addEventListener('click', async () => {
  const text = $('log').textContent;
  try {
    await navigator.clipboard.writeText(text);
    log('Log copied to clipboard.', 'ok');
  } catch (err) {
    log(`Copy failed: ${err?.message ?? err}`, 'error');
  }
});

$('clear-log-btn').addEventListener('click', () => {
  $('log').textContent = '';
});

// On load: see if we already have a handle; do NOT call
// requestPermission here (no user gesture) — only queryPermission.
(async function init() {
  log(`Spike loaded. fsa=${fsaSupported} idb=${idbSupported}`);
  if (!fsaSupported || !idbSupported) return;
  try {
    const stored = await idbGet();
    if (stored) {
      await setHandleStatus(stored);
      log(
        `Found stored handle "${stored.name}". Click "Restore handle" to re-grant permission.`,
        'ok'
      );
    }
  } catch (err) {
    log(`init: ${err?.message ?? err}`, 'error');
  }
  await refreshSwStatus();
})();
