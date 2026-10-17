/**
 * The game controller's sticks and triggers: which way they move the view,
 * and how fast, per second rather than per frame.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamepadController } from '../../src/js/gamepad-controller.js';

/** A standard-mapping pad whose axes and button values a case sets. */
function stubPad() {
  const pad = {
    id: 'Test pad (STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
  };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [pad, null, null, null],
  });
  return pad;
}

/** One step of input, `seconds` long, and what it emitted. */
function step(controller, pad, seconds) {
  const events = [];
  for (const name of ['camera:rotate', 'camera:pan', 'camera:zoom']) {
    controller.on(name, (data) => events.push({ name, ...data }));
  }
  controller.state.update(pad);
  controller._processInput(seconds);
  return events;
}

describe('the controller moves the view', () => {
  let pad;
  let controller;

  beforeEach(() => {
    pad = stubPad();
    controller = new GamepadController();
    controller.state.gamepadIndex = 0;
  });

  afterEach(() => {
    controller.destroy();
  });

  it('turns the view up when the right stick is pushed up', () => {
    pad.axes = [0, 0, 0, -1];
    const [rotate] = step(controller, pad, 0.5);
    expect(rotate?.name).toBe('camera:rotate');
    expect(rotate.y).toBeGreaterThan(0);
    expect(rotate.x).toBe(0);
  });

  it('orbits 90 degrees a second at full deflection, whatever the frame rate', () => {
    pad.axes = [0, 0, 1, 0];
    const oneSecond = step(controller, pad, 1)[0];
    expect(oneSecond.x).toBeCloseTo(90, 0);
    const controller2 = new GamepadController();
    controller2.state.gamepadIndex = 0;
    // Thirty frames of a thirtieth of a second come to the same second.
    let total = 0;
    controller2.on('camera:rotate', ({ x }) => {
      total += x;
    });
    controller2.state.update(pad);
    for (let i = 0; i < 30; i++) controller2._processInput(1 / 30);
    expect(total).toBeCloseTo(90, 0);
    controller2.destroy();
  });

  it('a small push past the dead zone moves the view slowly', () => {
    pad.axes = [0, 0, 0.575, 0];
    const [rotate] = step(controller, pad, 1);
    // Halfway from the 0.15 dead zone to a full push: half the speed.
    expect(rotate.x).toBeCloseTo(45, 0);
    pad.axes = [0, 0, 0.14, 0];
    expect(step(controller, pad, 1)).toEqual([]);
  });

  it('pans with the left stick both ways, up moving the view up', () => {
    pad.axes = [1, -1, 0, 0];
    const events = step(controller, pad, 1);
    const pan = events.find((e) => e.name === 'camera:pan');
    expect(pan).toBeDefined();
    expect(pan.x).toBeGreaterThan(0);
    expect(pan.y).toBeGreaterThan(0);
    expect(events.find((e) => e.name === 'camera:zoom')).toBeUndefined();
  });

  it('zooms with the triggers, the right in and the left out, by how far each is pressed', () => {
    pad.buttons[7] = { pressed: true, touched: true, value: 1 };
    const zoomIn = step(controller, pad, 1).find(
      (e) => e.name === 'camera:zoom'
    );
    expect(zoomIn?.delta).toBeGreaterThan(0);
    pad.buttons[7] = { pressed: false, touched: false, value: 0 };
    pad.buttons[6] = { pressed: true, touched: true, value: 0.5 };
    const zoomOut = step(controller, pad, 1).find(
      (e) => e.name === 'camera:zoom'
    );
    expect(zoomOut?.delta).toBeLessThan(0);
    expect(Math.abs(zoomOut.delta)).toBeCloseTo(Math.abs(zoomIn.delta) / 2, 5);
  });
});
