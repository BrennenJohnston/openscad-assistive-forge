/**
 * The Axes tab's gamepad status line (U-15b, Q-32a).
 *
 * The formatter is pure so its three claims can be pinned without a DOM:
 * unsupported browsers, no device, and a named device with the fixed dead
 * zone. A wrong claim here is the false-reason shape R-IV removed from
 * these tabs — the line must never say more than the data supports.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { formatGamepadStatus } from '../../src/js/preferences-dialog.js';

describe('formatGamepadStatus', () => {
  it('reports an unsupported browser, including when no status exists', () => {
    const unsupported = 'This browser does not offer game controller input.';
    expect(formatGamepadStatus(undefined)).toBe(unsupported);
    expect(formatGamepadStatus(null)).toBe(unsupported);
    expect(
      formatGamepadStatus({ supported: false, padName: null, deadZone: null })
    ).toBe(unsupported);
  });

  it('invites connecting when the API exists but no pad is seen', () => {
    expect(
      formatGamepadStatus({ supported: true, padName: null, deadZone: 0.15 })
    ).toBe('No controller detected. Connect one and press any button.');
  });

  it('names the detected pad and the fixed dead zone', () => {
    expect(
      formatGamepadStatus({
        supported: true,
        padName: 'Xbox Wireless Controller',
        deadZone: 0.15,
      })
    ).toBe(
      'Controller detected: Xbox Wireless Controller. The camera dead zone is fixed at 0.15.'
    );
  });

  it('omits the dead-zone sentence when no number is known', () => {
    expect(
      formatGamepadStatus({
        supported: true,
        padName: 'Generic Pad',
        deadZone: null,
      })
    ).toBe('Controller detected: Generic Pad.');
  });
});
