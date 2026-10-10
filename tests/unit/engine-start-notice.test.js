import { describe, expect, it } from 'vitest';
import { engineStartFailureNotice } from '../../src/js/engine-start-notice.js';

describe('the engine start failure notice', () => {
  it('says a kept copy is the likely cause, and where to delete it, when the engine file failed its check', () => {
    const notice = engineStartFailureNotice('ENGINE_COPY_MISMATCH');
    expect(notice.message).toMatch(/kept an older or damaged copy/);
    expect(notice.suggestion).toMatch(/cached images and files/);
    expect(notice.suggestion).toMatch(/Clear Cache button cannot reach/);
  });

  it('points to the cached files after a reload for any other start failure', () => {
    const notice = engineStartFailureNotice('INIT_FAILED');
    expect(notice.suggestion).toMatch(/^Reload the page\./);
    expect(notice.suggestion).toMatch(/cached images and files/);
    expect(engineStartFailureNotice()).toEqual(notice);
  });

  it('uses no em dash', () => {
    for (const code of ['ENGINE_COPY_MISMATCH', 'INIT_FAILED']) {
      const { message, suggestion } = engineStartFailureNotice(code);
      expect(`${message} ${suggestion}`).not.toContain('\u2014');
    }
  });
});
