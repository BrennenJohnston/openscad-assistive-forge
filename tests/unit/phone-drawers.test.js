/**
 * One drawer at a time on a phone: closing the others answers with their
 * closes, so an opener can wait for them before it measures anything the
 * closes still move.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  closeOtherPhoneDrawers,
  closePhoneDrawer,
  registerPhoneDrawer,
} from '../../src/js/phone-drawers.js';

function setViewportWidth(px) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: px,
  });
}

/** A drawer whose close ends when the test says so, as a slide does. */
function fakeDrawer({ open }) {
  let finish;
  const drawer = {
    open,
    closed: 0,
    isOpen: () => drawer.open,
    close() {
      drawer.open = false;
      drawer.closed += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    finish: () => finish?.(true),
  };
  return drawer;
}

describe('one drawer at a time on a phone', () => {
  let a;
  let b;
  let c;

  beforeEach(() => {
    setViewportWidth(412);
    a = fakeDrawer({ open: true });
    b = fakeDrawer({ open: false });
    c = fakeDrawer({ open: true });
    registerPhoneDrawer('a', a);
    registerPhoneDrawer('b', b);
    registerPhoneDrawer('c', c);
  });

  afterEach(() => {
    // The registry is a module's own: leave every drawer closed.
    a.open = b.open = c.open = false;
  });

  it('closes every other open drawer and answers when their closes have ended', async () => {
    const done = closeOtherPhoneDrawers('b');
    expect(done).toBeInstanceOf(Promise);
    expect(a.closed).toBe(1);
    expect(c.closed).toBe(1);
    expect(b.closed).toBe(0);

    let answered = false;
    done.then(() => {
      answered = true;
    });
    await Promise.resolve();
    expect(answered).toBe(false);
    a.finish();
    await Promise.resolve();
    expect(answered).toBe(false);
    c.finish();
    await done;
    expect(answered).toBe(true);
  });

  it('answers at once when nothing else is open', async () => {
    a.open = false;
    c.open = false;
    const done = closeOtherPhoneDrawers('b');
    expect(await done).toEqual([]);
    expect(a.closed).toBe(0);
  });

  it('does nothing on a desktop window, and still answers', async () => {
    setViewportWidth(1024);
    expect(await closeOtherPhoneDrawers('b')).toEqual([]);
    expect(a.open).toBe(true);
    expect(a.closed).toBe(0);
  });

  it('closes one named drawer when it is open', () => {
    closePhoneDrawer('c');
    expect(c.closed).toBe(1);
    closePhoneDrawer('b');
    expect(b.closed).toBe(0);
  });
});
