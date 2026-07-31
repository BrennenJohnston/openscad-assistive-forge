# F14 Spike S2 — polling-cadence cost envelope

Status: **draft — pending manual run on Chrome and Edge with a real laptop.**

## Why this spike exists

F35 Phase B introduces a polling-based file-change watcher (the "auto
re-run when an external editor saves the .scad" feature, plan ID
**F14**). The watcher's polling interval is the single biggest knob
that decides whether the feature feels instant or burns battery.

The triage plan
([volkswitch_2026-05-15_feedback_triage_a7bd79c7.plan.md](../../.cursor/plans/volkswitch_2026-05-15_feedback_triage_a7bd79c7.plan.md))
gates the *default* interval for Phase B on this spike's findings:

> **Pass**: An interval ≤ 1000 ms keeps total polling cost under 1%
> CPU on a mid-range laptop with the page focused, and the watcher
> pauses when the page is hidden.
>
> **Fail**: Even at 2000 ms the cost is noticeable, or hidden-page
> detection is unreliable.

Time box: 2 hours.

This spike is intentionally **outside the Forge codebase** — it lives
in `.spikes/` so the findings can be version-controlled but the
artifact never ships in the production bundle.

## Prerequisites

S1 must have passed. If S1 was a fail (handle does not survive
reload + SW update with a single permission re-grant) then F14 is
moot until the constraint waiver is revisited. See
[`../f35-s1-directory-handle-persistence/README.md`](../f35-s1-directory-handle-persistence/README.md).

## How to run

The File System Access API requires either a TLS origin or
`localhost`. Run a tiny static server next to the spike:

```powershell
# Option 1: Python
cd .spikes/f14-s2-polling-cadence
python -m http.server 5401

# Option 2: Node
http-server -p 5401 --cors
```

Open <http://localhost:5401/> in **Chrome** (and again in **Edge** for
parity). The spike runs entirely client-side; no network calls.

Prepare a **fixture folder** of 50 small files (any content). Two
quick ways:

```powershell
# PowerShell — generate 50 empty files in a temp folder
$dir = "$env:TEMP\f14-s2-fixture"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
1..50 | ForEach-Object { Set-Content -Path "$dir\file-$_.txt" -Value "" }
explorer $dir
```

```bash
# bash / zsh
mkdir -p /tmp/f14-s2-fixture && cd /tmp/f14-s2-fixture
for i in $(seq 1 50); do : > "file-$i.txt"; done
```

## Test plan

For each browser × OS combination (Chrome / Edge × Windows / macOS),
walk through these steps:

1. **Pick fixture folder**
   - [ ] Click **Pick fixture folder**, choose the folder you just
         generated. Confirm "Watching N file(s)" reflects 50.

2. **Cadence sweep — focused, AC power**
   For each interval (250 / 500 / 1000 / 2000 ms):
   - [ ] Click the matching radio.
   - [ ] Open Chrome DevTools → **Performance** → start a 10-second
         recording (with the page focused).
   - [ ] Stop. Read **System** → **Main thread** → "Scripting" %.
         Record the value.
   - [ ] Cross-check the in-page **average ms / poll** readout —
         multiply by the polls/sec rate to sanity-check the % CPU.

3. **Cadence sweep — page hidden**
   - [ ] At each interval, switch tabs (or minimise) for 30 seconds.
   - [ ] Confirm the in-page log shows `polling paused (visibility
         change)` and the **polls/sec** counter freezes.
   - [ ] Switch back. Confirm `polling resumed` log line and the
         counter advances.

4. **Cadence sweep — battery saver**
   - [ ] Disconnect the laptop from AC; enable battery saver in the
         OS.
   - [ ] At 1000 ms, confirm the in-page **Battery** readout shows
         `discharging` and that the **adaptive cadence** UI
         (multiplier × 2 when battery ≤ 20%) kicks in once you bring
         the battery low (or click **Simulate low battery** in the
         spike for an instant override).

5. **External-edit detection**
   - [ ] At 1000 ms with the page focused, edit any one of the
         fixture files in another editor (e.g. `notepad`,
         `code`) and save.
   - [ ] Confirm the in-page log shows `change detected: file-N.txt`
         within roughly the polling interval.

## Findings

Replace placeholders after running.

### CPU envelope (focused, AC power)

| Interval | Browser | OS | % CPU (DevTools) | avg ms / poll (in-page) | Notes |
| --- | --- | --- | --- | --- | --- |
| 250 ms | Chrome | Win 11 | _e.g. 0.6%_ | _e.g. 1.3 ms_ | |
| 500 ms | Chrome | Win 11 | | | |
| 1000 ms | Chrome | Win 11 | | | |
| 2000 ms | Chrome | Win 11 | | | |
| 1000 ms | Edge | Win 11 | | | |
| 1000 ms | Chrome | macOS | | | |

### Visibility behaviour

| Browser | OS | Pauses on hidden? | Resumes on visible? | Latency to resume |
| --- | --- | --- | --- | --- |
| Chrome | Win 11 | _Y / N_ | _Y / N_ | _ms_ |
| Edge | Win 11 | | | |
| Chrome | macOS | | | |

### Battery behaviour

| Browser | OS | navigator.getBattery() supported? | Adaptive cadence engaged at ≤ 20%? |
| --- | --- | --- | --- |
| Chrome | Win 11 | _Y / N_ | _Y / N_ |

> Note: Firefox dropped the Battery Status API for privacy reasons,
> and Safari never had it. Chromium still ships it. Plan B if Battery
> Status is unavailable: degrade to a fixed `prefers-reduced-motion`
> multiplier instead.

### Recommended Phase B defaults

Fill in after running:

- Default polling interval: **____ ms**
  (Plan target: ≤ 1000 ms with < 1% CPU on mid-range laptop, focused.)
- Hidden-tab behaviour: **pause** (no polls) — confirmed Y / N.
- Battery saver multiplier: **____×** (e.g. 2× when battery ≤ 20% or
  charging = false on a known-mid-range laptop).
- `prefers-reduced-motion` multiplier: **____×** (suggest 2× as a
  conservative default — the watcher is invisible UI, not motion, but
  the OS preference correlates with "user wants the device to stay
  cool and quiet").

Decision: **PASS / FAIL** — _to be filled in_.

If PASS: those numbers become the defaults in
`src/js/folder-watcher.js` (Phase B implementation).

If FAIL: capture the per-interval CPU readings and route back to the
plan owner for re-scoping (e.g. switch to FileSystemObserver if it
ever ships, or restrict watching to just the main `.scad` file).

## Files

- `index.html` — markup
- `spike.js` — polling loop, interval picker, visibility/battery
   hooks, ms/poll metric
