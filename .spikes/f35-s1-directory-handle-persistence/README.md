# F35 Spike S1 — `FileSystemDirectoryHandle` persistence

Status: **draft — pending manual run on Chrome and Edge**

## Why this spike exists

The Volkswitch 2026-05-15 feedback asked for a persistent two-way sync
with a local folder on disk (plan ID **F35**, plan ID **F14** for the
file-change-detection part). The only browser surface that supports this
today is the File System Access API, and even there it depends on
`FileSystemDirectoryHandle` instances surviving:

1. A full page reload, **and**
2. A service-worker update,

with at most **one user click** per session to re-grant `readwrite`
permission. If those conditions fail, the UX is a non-starter — the user
would have to re-pick the folder every time the page reloads.

The triage plan
([volkswitch_2026-05-15_feedback_triage_a7bd79c7.plan.md](../../.cursor/plans/volkswitch_2026-05-15_feedback_triage_a7bd79c7.plan.md))
gates F35 Phase A on this spike passing.

This spike is intentionally **outside the Forge codebase** — it is a
~100 LOC throwaway page that lives in `.spikes/` so the findings can
be version-controlled but the artifact never ships in the production
bundle.

## Pass / fail criteria (verbatim from the plan)

> **Pass**: Handle round-trips. User sees at most a single-click
> permission re-grant per session, never a re-pick of the folder.
>
> **Fail**: User must reselect the folder on every reload, or the SW
> update invalidates the handle. (UX-killer for this stakeholder.)

Time box: 4 hours.

## How to run

Because the File System Access API requires a secure context AND the
Service-Worker test below requires a real origin (not `file://`), you
need a tiny static server. The simplest options:

```powershell
# Option 1: Python (works without any extra install)
cd .spikes/f35-s1-directory-handle-persistence
python -m http.server 5400

# Option 2: Node (uses npm's `http-server`, install once)
npm install -g http-server
cd .spikes/f35-s1-directory-handle-persistence
http-server -p 5400 --cors
```

Then open <http://localhost:5400/> in **Chrome** and again in **Edge**,
on **Windows** and (if available) **macOS**. Repeat the test plan
below in each browser-OS pairing and fill in the [Findings](#findings)
table.

If the spike is hosted somewhere with a real TLS cert, that works too.
File System Access does **not** work over plain `http://` from any
host other than `localhost` / `127.0.0.1`.

## Test plan

For each browser × OS combination, walk through these steps in order
and tick each box:

1. **Initial pick**
   - [ ] Click **Pick folder**, choose any folder you have read+write
         on (a sandbox folder with a few small files works best).
   - [ ] Verify the page shows the folder name and `permission =
         granted (readwrite)`.
   - [ ] Click **List files** — confirm names appear in the log.

2. **Plain reload (no SW yet)**
   - [ ] Hit <kbd>F5</kbd> / <kbd>Ctrl</kbd>+<kbd>R</kbd>.
   - [ ] On load, the page should auto-detect the persisted handle
         and show `permission = prompt` (or `granted` if the browser
         remembered).
   - [ ] Click **Restore handle** once. Expect a single permission
         prompt. After granting, the folder name should reappear and
         `permission = granted (readwrite)`.
   - [ ] Click **List files** to confirm read access still works.

3. **Service-worker round trip**
   - [ ] Click **Register SW v1**. Wait for the log line
         "service worker active (version 1)".
   - [ ] Click **Restore handle** + grant if prompted.
   - [ ] Reload the page. Confirm `Restore handle` still works with
         a single click.

4. **Service-worker update**
   - [ ] Click **Bump SW to v2** — this writes a new
         `?cacheBust=` query so the SW sees a different bytestream
         and triggers an update.
   - [ ] Reload twice (first reload activates the new SW after
         `skipWaiting`; second reload is the actual user reload).
   - [ ] Click **Restore handle**. Confirm at most **one** permission
         prompt. Confirm **Pick folder** is **not** required.

5. **Forget**
   - [ ] Click **Forget handle**. Confirm IDB is empty in DevTools →
         Application → IndexedDB → `f35-spike` → `handles`.
   - [ ] Reload — confirm the page returns to its initial empty state.

A failure in **any** of steps 2-4 (i.e. the user must re-pick the
folder, or the prompt count exceeds one per session) flips the spike
to **FAIL** and Phase A is deferred.

## Findings

Replace the placeholder rows with real observations after running.

| Browser | Version | OS | Reload survives? | SW-update survives? | Re-grant clicks per session | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome | _e.g. 132_ | Windows 11 | _Y / N_ | _Y / N_ | _0 / 1 / 2+_ | |
| Edge | | Windows 11 | | | | |
| Chrome | | macOS | | | | |
| Edge | | macOS | | | | |

Decision: **PASS / FAIL** — _to be filled in_.

If PASS: proceed to F35 Phase A.
If FAIL: capture the failure mode in detail (DevTools console + the
in-page log copy-pasted) and route back to stakeholder negotiation
(the constraint waiver may need to be revisited).

## Files

- `index.html` — markup + buttons + status panel
- `spike.js` — IDB persistence + permission flow + logging
- `sw.js` — minimal service worker; version constant lives at the top
   so it can be bumped to test SW-update behaviour
