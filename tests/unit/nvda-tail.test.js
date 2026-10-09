import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseNvdaLog, tailNvdaLog } from '../../scripts/nvda-tail.mjs';

// The shape NVDA writes at log level "input/output": a head line per entry
// (level, where, time), then the entry's lines.
const LOG = [
  'INFO - __main__ (07:49:50.010) - MainThread (1100):',
  'Starting NVDA version 2026.2',
  'IO - inputCore.InputManager.executeGesture (07:49:52.001) - winInputHook (5678):',
  'Input: kb(desktop):enter',
  'IO - speech.speech.speak (07:49:53.120) - MainThread (1100):',
  "Speaking [LangChangeCommand ('en_US'), 'Delete Preset', 'dialog', CancellableSpeech (still valid)]",
  'IO - speech.speech.speak (07:49:53.400) - MainThread (1100):',
  "Speaking ['Delete the preset \"Width 60\"? This cannot be undone.', EndUtteranceCommand()]",
  'IO - speech.speech.speak (07:49:53.500) - MainThread (1100):',
  "Speaking [BreakCommand(time=100), '  ']",
  'ERROR - eventHandler.executeEvent (07:49:54.000) - MainThread (1100):',
  'error executing event: gainFocus',
  'Traceback (most recent call last):',
  '',
].join('\n');

describe('parseNvdaLog', () => {
  it('keeps speech, key presses and NVDA errors, one row each', () => {
    expect(parseNvdaLog(LOG)).toEqual([
      '07:49:52.001  > kb(desktop):enter',
      '07:49:53.120  Delete Preset | dialog',
      '07:49:53.400  Delete the preset "Width 60"? This cannot be undone.',
      '07:49:54.000  [NVDA ERROR] eventHandler.executeEvent: error executing event: gainFocus',
    ]);
  });

  it('drops an entry that says nothing', () => {
    expect(parseNvdaLog(LOG).join('\n')).not.toContain('07:49:53.500');
  });
});

describe('tailNvdaLog', () => {
  it('appends only what NVDA logged since the last call, under the step label', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nvda-tail-'));
    const log = join(dir, 'nvda.log');
    const out = join(dir, 'speech.md');
    writeFileSync(log, LOG);

    expect(tailNvdaLog({ log, out, label: 'start', mark: true }).marked).toBe(
      true
    );
    appendFileSync(
      log,
      'IO - speech.speech.speak (07:50:01.000) - MainThread (1100):\n' +
        "Speaking ['Preview ready']\n"
    );
    const result = tailNvdaLog({ log, out, label: 'Step 3: preview' });

    expect(result.rows).toEqual(['07:50:01.000  Preview ready']);
    const written = readFileSync(out, 'utf8');
    expect(written).toContain('### Step 3: preview');
    expect(written).toContain('07:50:01.000  Preview ready');
    expect(written).not.toContain('Delete Preset');
  });

  it('writes "(nothing spoken)" for a quiet step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nvda-tail-'));
    const log = join(dir, 'nvda.log');
    const out = join(dir, 'speech.md');
    writeFileSync(log, LOG);
    tailNvdaLog({ log, out, label: 'start', mark: true });

    tailNvdaLog({ log, out, label: 'Step 4: nothing' });
    expect(readFileSync(out, 'utf8')).toContain('(nothing spoken)');
  });
});
