/**
 * The data checks are written ahead of time (scripts/build-validators.mjs)
 * and committed. This writes them again from today's schemas and compares,
 * so a schema changed without writing the checks again fails here.
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  generateValidatorsSource,
  VALIDATORS_PATH,
} from '../../scripts/build-validators.mjs';

describe('the written data checks', () => {
  it('are what the schemas write today', async () => {
    const committed = readFileSync(VALIDATORS_PATH, 'utf8').replace(
      /\r\n/g,
      '\n'
    );
    expect(await generateValidatorsSource()).toBe(committed);
  });

  it('compile no code at run time', () => {
    const committed = readFileSync(VALIDATORS_PATH, 'utf8');
    expect(committed).not.toMatch(/new Function\(|[^.\w$]eval\(|require\(/);
  });
});
