# KI-012 Parameter Dropout Fix — Verification Protocol

> **Purpose:** Confirm that UI edits no longer drop preset-only ("non-schema
> tail") parameters from `state.parameters` and the captured `-D` args.
>
> **Date:** 2026-04-04
> **Prerequisite:** Code changes from `fix_parameter_dropout` plan (todos
> `seed-current-values`, `keep-full-snapshots`, `fix-queue-edit-callsite`)
> are applied.

---

## Quick verification (single console command)

After completing Step 3 below, run:

```js
__forgeDebug.verifyParameterPreservation()
```

This checks `state.parameters` against the schema and the known LWFL
tail parameters. A passing result looks like:

```
[VerifyParams] === Parameter Preservation Check ===
  State parameter count: 47      (or similar — more than schema count)
  Schema parameter count: 31     (visible in customizer)
  Non-schema (tail) keys preserved: 16
    add_rounded_corners_for_strength, approx_dovetail_width, ...
  LWFL tail params preserved: 16/16
  Define args (-D flags): 47
  RESULT: PASS — non-schema keys survived
```

If it says `FAIL — dropout detected`, the fix is not working.

---

## Full step-by-step procedure

### Step 1 — Start clean

1. Run the dev server: `pixi run dev` (or `npm run dev`).
2. Open the app in a browser. Open DevTools console (F12).
3. Verify no debug toggles are active:

   ```js
   __forgeDebug.getToggles()
   // Expected: csgBypass: false, sourceOverrides: false, desktopQuality: false
   ```

### Step 2 — Load the LWFL preset

1. Upload the full stakeholder keyguard project folder.
2. Select the **"iPad 7,8,9 - Fintie - LWFL"** preset from the dropdown.
3. Wait for parameters to populate and any auto-preview to complete.

### Step 3 — Baseline check (before any edits)

Run the preservation check immediately after preset load:

```js
__forgeDebug.verifyParameterPreservation()
```

Record the output. The non-schema tail should already be present (all 16 LWFL
tail params preserved). This confirms the preset loaded the full parameter set.

### Step 4 — Change an unrelated visible parameter

Change a parameter that should NOT affect Bug A or Bug B. Good candidates:

- `text_label` — change the text string
- `corner_radius` — adjust a numeric slider
- Any visible parameter other than `expose_home_button` or
  `expose_upper_message_bar`

Wait for the auto-preview debounce (~800ms) and render to complete.

### Step 5 — Post-edit check

Run the preservation check again:

```js
__forgeDebug.verifyParameterPreservation()
```

**Pass criteria:**

- `RESULT: PASS` is shown
- `LWFL tail params preserved: 16/16`
- `Define args (-D flags)` count is the same as in Step 3
- `Non-schema (tail) keys preserved` count is the same as in Step 3

**Fail criteria:**

- `RESULT: FAIL` is shown
- Any LWFL tail params appear in the `DROPPED` list
- Define arg count decreased after the edit

### Step 6 — Optional: capture and verify ZIP

For extra confidence, run a full capture after the UI edit:

```js
await __forgeDebug.captureWasmInputs()
```

Extract the ZIP and check `metadata.json`:

- `parameters` object should include all 16 tail params
- `diagnostics.defineArgs` should include `-D` entries for all tail params

---

## Recording results

| Step | State param count | Schema count | Non-schema tail | LWFL tail preserved | -D flags | Result |
|------|-------------------|-------------|-----------------|---------------------|----------|--------|
| 3 (baseline) | _____ | _____ | _____ | ___/16 | _____ | PASS / FAIL |
| 5 (post-edit) | _____ | _____ | _____ | ___/16 | _____ | PASS / FAIL |

---

## Interpreting results

- **Both PASS:** The dropout fix is working. Proceed to `retest-bug-a-b`.
- **Step 3 FAIL:** The preset didn't load the tail params. This is a different
  issue (preset loading, not UI dropout).
- **Step 3 PASS, Step 5 FAIL:** The dropout bug is still present despite the
  code changes. Re-examine `renderParameterUI()` seeding logic.
