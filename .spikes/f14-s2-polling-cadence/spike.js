// F14 Spike S2 — polling-cadence cost envelope.
//
// Walks a user-picked folder, collects up to MAX_WATCHED file handles,
// then runs a setInterval loop that calls .getFile().lastModified on
// every handle on each tick. Tracks ms/poll, polls/sec, and detects
// when an external editor saves any of the watched files. Polling is
// paused automatically when the page is hidden, and the cadence
// adapts when the battery is low or prefers-reduced-motion is set.
// See README.md for the test plan and pass/fail criteria.

const MAX_WATCHED = 50;
const ROLLING_WINDOW = 20; // last N polls used for "avg ms / poll"

const $ = (id) => document.getElementById(id);
const fsaSupported = 'showDirectoryPicker' in self;

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
  console.log(`[s2] ${msg}`);
}

$('status-fsa').textContent = fsaSupported ? 'yes' : 'NO — bailing';
$('status-prm').textContent = matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches
  ? 'yes'
  : 'no';

if (!fsaSupported) {
  for (const id of ['pick-btn', 'start-btn', 'stop-btn']) $(id).disabled = true;
}

/** @type {Array<{path: string, handle: FileSystemFileHandle, lastModified: number}>} */
let watched = [];
let pollTimer = null;
let lastTickAt = 0;
let pollMsBuffer = [];
let pollCount = 0;
let pollWindowStartedAt = 0;
let lowBatterySimulated = false;
let batteryStatus = null; // populated by getBattery() if available

function selectedInterval() {
  const v = document.querySelector('input[name=interval]:checked')?.value;
  return Math.max(50, parseInt(v, 10) || 1000);
}

function effectiveInterval() {
  let interval = selectedInterval();
  if (!$('adaptive-toggle').checked) return interval;

  const prm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowBattery =
    lowBatterySimulated ||
    (batteryStatus &&
      !batteryStatus.charging &&
      batteryStatus.level != null &&
      batteryStatus.level <= 0.2);

  if (prm) interval *= 2;
  if (lowBattery) interval *= 2;
  return interval;
}

function refreshStatus() {
  $('status-vis').textContent = document.hidden ? 'hidden' : 'visible';
  $('status-effective').textContent = `${effectiveInterval()} ms`;
  $('status-count').textContent = String(watched.length);
}

async function pickFolder() {
  try {
    const dir = await self.showDirectoryPicker({ mode: 'read' });
    watched = [];
    for await (const [name, child] of dir.entries()) {
      if (watched.length >= MAX_WATCHED) break;
      if (child.kind === 'file') {
        try {
          const file = await child.getFile();
          watched.push({
            path: name,
            handle: child,
            lastModified: file.lastModified,
          });
        } catch (err) {
          log(`  could not read ${name}: ${err?.message ?? err}`, 'warn');
        }
      }
    }
    $('status-folder').textContent = dir.name;
    refreshStatus();
    if (watched.length === 0) {
      log('Folder is empty (no files at the top level).', 'warn');
    } else {
      log(`Picked "${dir.name}" — watching ${watched.length} file(s).`, 'ok');
    }
    $('start-btn').disabled = watched.length === 0;
  } catch (err) {
    if (err?.name === 'AbortError') log('Pick cancelled.', 'warn');
    else log(`Pick failed: ${err?.message ?? err}`, 'error');
  }
}

async function pollOnce() {
  if (watched.length === 0) return;
  const t0 = performance.now();
  for (const entry of watched) {
    try {
      const file = await entry.handle.getFile();
      const m = file.lastModified;
      if (m !== entry.lastModified) {
        log(`change detected: ${entry.path} (Δ${m - entry.lastModified} ms)`, 'ok');
        entry.lastModified = m;
      }
    } catch (err) {
      // File may have been deleted / renamed; surface but keep polling.
      log(`  ${entry.path}: ${err?.message ?? err}`, 'warn');
    }
  }
  const t1 = performance.now();
  const dt = t1 - t0;
  pollMsBuffer.push(dt);
  if (pollMsBuffer.length > ROLLING_WINDOW) pollMsBuffer.shift();
  pollCount++;

  const avg =
    pollMsBuffer.reduce((a, b) => a + b, 0) / pollMsBuffer.length;
  $('status-msper').textContent = avg.toFixed(2);

  // polls/sec rolling window
  const now = performance.now();
  if (pollWindowStartedAt === 0) pollWindowStartedAt = now;
  const elapsedSec = (now - pollWindowStartedAt) / 1000;
  if (elapsedSec >= 1) {
    $('status-rate').textContent = (pollCount / elapsedSec).toFixed(2);
    pollCount = 0;
    pollWindowStartedAt = now;
  }
  lastTickAt = now;
}

function startPolling() {
  if (pollTimer || watched.length === 0) return;
  $('status-polling').textContent = 'running';
  $('start-btn').disabled = true;
  $('stop-btn').disabled = false;
  log(`Polling started @ ${effectiveInterval()} ms.`, 'ok');
  refreshStatus();
  scheduleNextTick();
}

function scheduleNextTick() {
  if (!pollTimer && document.hidden) return; // paused
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    if (document.hidden) return; // pause check
    await pollOnce();
    if ($('status-polling').textContent === 'running') scheduleNextTick();
  }, effectiveInterval());
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  $('status-polling').textContent = 'stopped';
  $('start-btn').disabled = watched.length === 0;
  $('stop-btn').disabled = true;
  log('Polling stopped.', 'ok');
}

document.addEventListener('visibilitychange', () => {
  refreshStatus();
  if (document.hidden) {
    if ($('status-polling').textContent === 'running' && pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
      log('Polling paused (visibility change).', 'warn');
    }
  } else {
    if ($('status-polling').textContent === 'running' && !pollTimer) {
      log('Polling resumed (visibility change).', 'ok');
      scheduleNextTick();
    }
  }
});

document.querySelectorAll('input[name=interval]').forEach((el) => {
  el.addEventListener('change', () => {
    refreshStatus();
    log(`Interval requested: ${selectedInterval()} ms (effective ${effectiveInterval()} ms).`);
  });
});

$('adaptive-toggle').addEventListener('change', () => {
  refreshStatus();
  log(`Adaptive cadence: ${$('adaptive-toggle').checked ? 'on' : 'off'}.`);
});

$('simulate-low-battery-btn').addEventListener('click', () => {
  lowBatterySimulated = !lowBatterySimulated;
  $('simulate-low-battery-btn').textContent = lowBatterySimulated
    ? 'Stop simulating low battery'
    : 'Simulate low battery';
  $('status-battery').textContent = lowBatterySimulated
    ? 'simulated low'
    : describeBattery(batteryStatus);
  refreshStatus();
  log(`Simulate low battery: ${lowBatterySimulated ? 'on' : 'off'}.`);
});

$('pick-btn').addEventListener('click', pickFolder);
$('start-btn').addEventListener('click', startPolling);
$('stop-btn').addEventListener('click', stopPolling);

$('reset-metrics-btn').addEventListener('click', () => {
  pollMsBuffer = [];
  pollCount = 0;
  pollWindowStartedAt = performance.now();
  $('status-msper').textContent = '—';
  $('status-rate').textContent = '—';
  log('Metrics reset.');
});

$('copy-log-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('log').textContent);
    log('Log copied to clipboard.', 'ok');
  } catch (err) {
    log(`Copy failed: ${err?.message ?? err}`, 'error');
  }
});

$('clear-log-btn').addEventListener('click', () => {
  $('log').textContent = '';
});

function describeBattery(b) {
  if (!b) return 'unsupported';
  return `${b.charging ? 'charging' : 'discharging'} @ ${Math.round((b.level ?? 0) * 100)}%`;
}

if ('getBattery' in navigator) {
  navigator
    .getBattery()
    .then((b) => {
      batteryStatus = b;
      $('status-battery').textContent = describeBattery(b);
      const update = () => {
        $('status-battery').textContent = lowBatterySimulated
          ? 'simulated low'
          : describeBattery(b);
        refreshStatus();
      };
      b.addEventListener?.('chargingchange', update);
      b.addEventListener?.('levelchange', update);
    })
    .catch(() => {
      $('status-battery').textContent = 'unsupported';
    });
} else {
  $('status-battery').textContent = 'unsupported';
}

refreshStatus();
log(`S2 spike loaded. fsa=${fsaSupported}`);
