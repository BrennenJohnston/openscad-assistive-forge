/**
 * The Q-45a reconciliation rule, tested without a browser.
 *
 * U-30: every render passed `-D` for every parameter in a schema parsed once
 * at load, so editing a default in the code changed the source the worker
 * compiled but not the value that overrode it. These pin the rule that
 * replaced it: user-modified values survive a code edit and are the only ones
 * passed as `-D`; untouched values follow the code.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  collectUserModifiedKeys,
  collectWithheldDefineKeys,
  isEngineVariable,
  parameterValuesEqual,
  reconcileParameters,
} from '../../src/js/parameter-reconciler.js';

/** Minimal extractParameters()-shaped schema. */
const schemaOf = (defaults) => ({
  groups: [],
  parameters: Object.fromEntries(
    Object.entries(defaults).map(([name, def]) => [
      name,
      { name, default: def, type: typeof def === 'number' ? 'number' : 'string' },
    ])
  ),
});

describe('parameterValuesEqual', () => {
  it('treats the string a control hands back as equal to the schema number', () => {
    expect(parameterValuesEqual('10', 10)).toBe(true);
    expect(parameterValuesEqual(10, '10')).toBe(true);
  });

  it('still separates genuinely different values', () => {
    expect(parameterValuesEqual('10', 40)).toBe(false);
    expect(parameterValuesEqual(false, true)).toBe(false);
  });

  it('compares vectors and file objects structurally', () => {
    expect(parameterValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(parameterValuesEqual([1, 2], [1, 3])).toBe(false);
    expect(parameterValuesEqual(null, null)).toBe(true);
    expect(parameterValuesEqual(null, 0)).toBe(false);
  });
});

describe('collectUserModifiedKeys', () => {
  it('reports nothing for a freshly loaded file', () => {
    const values = { size: 10, label: 'a' };
    expect([...collectUserModifiedKeys(values, { ...values })]).toEqual([]);
  });

  it('reports only the control the user moved', () => {
    const modified = collectUserModifiedKeys(
      { size: 33, label: 'a' },
      { size: 10, label: 'a' }
    );
    expect([...modified]).toEqual(['size']);
  });

  it('counts a value with no recorded default as the user’s', () => {
    // Withholding it would silently change the model.
    expect([...collectUserModifiedKeys({ stray: 5 }, {})]).toEqual(['stray']);
  });
});

describe('collectWithheldDefineKeys', () => {
  it('withholds every untouched parameter so the code’s own defaults apply', () => {
    const withheld = collectWithheldDefineKeys({
      parameters: { size: 10, depth: 4 },
      defaults: { size: 10, depth: 4 },
      schemaNames: ['size', 'depth'],
    });
    expect([...withheld].sort()).toEqual(['depth', 'size']);
  });

  it('passes a user-set parameter through as -D', () => {
    const withheld = collectWithheldDefineKeys({
      parameters: { size: 33, depth: 4 },
      defaults: { size: 10, depth: 4 },
      schemaNames: ['size', 'depth'],
    });
    expect([...withheld]).toEqual(['depth']);
  });

  it('never withholds an engine variable', () => {
    // $fn is capped by the quality preset before a preview runs; dropping it
    // would hand the preview the model's full-resolution value.
    expect(isEngineVariable('$fn')).toBe(true);
    const withheld = collectWithheldDefineKeys({
      parameters: { $fn: 16, size: 10 },
      defaults: { $fn: 16, size: 10 },
      schemaNames: ['$fn', 'size'],
    });
    expect([...withheld]).toEqual(['size']);
  });
});

describe('reconcileParameters', () => {
  it('moves an untouched parameter to the edited code’s default', () => {
    // The exact U-30 case: size = 10 becomes size = 40 in the editor.
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ size: 40 }),
      parameters: { size: 10 },
      defaults: { size: 10 },
    });
    expect(result.ok).toBe(true);
    expect(result.parameters.size).toBe(40);
    expect(result.defaults.size).toBe(40);
    expect(result.changed).toBe(true);
  });

  it('keeps a value the user set when the code default moves under it', () => {
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ size: 44 }),
      parameters: { size: 33 },
      defaults: { size: 10 },
    });
    expect(result.parameters.size).toBe(33);
    expect(result.defaults.size).toBe(44);
    expect(result.retained).toEqual(['size']);
    // Still user-modified afterwards, so it still passes as -D.
    expect([
      ...collectUserModifiedKeys(result.parameters, result.defaults),
    ]).toEqual(['size']);
  });

  it('adds a parameter the code gained', () => {
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ size: 10, height: 7 }),
      parameters: { size: 10 },
      defaults: { size: 10 },
    });
    expect(result.added).toEqual(['height']);
    expect(result.parameters).toEqual({ size: 10, height: 7 });
  });

  it('retires a parameter the code lost, leaving no stale -D behind', () => {
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ width: 12 }),
      parameters: { size: 10 },
      defaults: { size: 10 },
    });
    expect(result.removed).toEqual(['size']);
    expect(result.added).toEqual(['width']);
    expect(result.parameters).toEqual({ width: 12 });
    expect(
      collectWithheldDefineKeys({
        parameters: result.parameters,
        defaults: result.defaults,
        schemaNames: Object.keys(result.parameters),
      }).has('size')
    ).toBe(false);
  });

  it('gives a user value back if the parameter it belonged to returns', () => {
    const gone = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ width: 12 }),
      parameters: { size: 33 },
      defaults: { size: 10 },
    });
    expect(gone.retiredValues).toEqual({ size: 33 });

    const back = reconcileParameters({
      previousSchema: schemaOf({ width: 12 }),
      nextSchema: schemaOf({ width: 12, size: 10 }),
      parameters: gone.parameters,
      defaults: gone.defaults,
      retiredValues: gone.retiredValues,
    });
    expect(back.parameters.size).toBe(33);
    expect(back.retiredValues).toEqual({});
  });

  it('refuses to retire the whole panel when the buffer will not parse', () => {
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: { groups: [], parameters: {} },
      parameters: { size: 33 },
      defaults: { size: 10 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-parse');
    expect(result.parameters).toEqual({ size: 33 });
    expect(result.changed).toBe(false);
  });

  it('reports no change when the code did not move', () => {
    const result = reconcileParameters({
      previousSchema: schemaOf({ size: 10 }),
      nextSchema: schemaOf({ size: 10 }),
      parameters: { size: 33 },
      defaults: { size: 10 },
    });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
  });
});
