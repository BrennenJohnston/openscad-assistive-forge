/**
 * The game controller's sticks and triggers: which way they move the view,
 * and how fast, per second rather than per frame.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GamepadController,
  presetAssignments,
  INPUT_REPEAT_DELAY_S,
  INPUT_REPEAT_S,
} from '../../src/js/gamepad-controller.js';

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
    controller.setAssignments(presetAssignments('camera', 'xbox'));
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

  it('zooms with the triggers in the Camera preset, the default; Y and X do not, and in the Menus preset they do', () => {
    pad.buttons[7] = { pressed: true, touched: true, value: 1 };
    const zoomIn = step(controller, pad, 1).find(
      (e) => e.name === 'camera:zoom'
    );
    expect(zoomIn?.delta).toBeGreaterThan(0);
    pad.buttons[7] = { pressed: false, touched: false, value: 0 };
    pad.buttons[3] = { pressed: true, touched: true, value: 1 };
    expect(
      step(controller, pad, 1).find((e) => e.name === 'camera:zoom')
    ).toBeUndefined();
    pad.buttons[3] = { pressed: false, touched: false, value: 0 };

    controller.setAssignments(presetAssignments('menus', 'xbox'));
    pad.buttons[3] = { pressed: true, touched: true, value: 1 };
    const menusIn = step(controller, pad, 1).find(
      (e) => e.name === 'camera:zoom'
    );
    expect(menusIn?.delta).toBeGreaterThan(0);
    pad.buttons[3] = { pressed: false, touched: false, value: 0 };
    pad.buttons[2] = { pressed: true, touched: true, value: 1 };
    const menusOut = step(controller, pad, 1).find(
      (e) => e.name === 'camera:zoom'
    );
    expect(menusOut?.delta).toBeLessThan(0);
    pad.buttons[2] = { pressed: false, touched: false, value: 0 };
    pad.buttons[7] = { pressed: true, touched: true, value: 1 };
    expect(
      step(controller, pad, 1).find((e) => e.name === 'camera:zoom')
    ).toBeUndefined();
  });
});

describe('the controller tells its inputs', () => {
  let pad;
  let controller;
  let heard;

  beforeEach(() => {
    pad = stubPad();
    controller = new GamepadController();
    controller.state.gamepadIndex = 0;
    heard = [];
    controller.on('input', ({ name, repeat }) =>
      heard.push(repeat ? `${name} again` : name)
    );
  });

  afterEach(() => {
    controller.destroy();
  });

  const poll = (seconds) => {
    controller.state.update(pad);
    controller._processInput(seconds);
  };
  const press = (index, value = 1) => {
    pad.buttons[index] = { pressed: value > 0.5, touched: true, value };
  };
  const release = (index) => {
    pad.buttons[index] = { pressed: false, touched: false, value: 0 };
  };

  it("a press is told once by the button's name, then again only while it is held", () => {
    press(5);
    poll(0.016);
    poll(0.016);
    expect(heard).toEqual(['rb']);
    release(5);
    poll(0.016);
    press(5);
    poll(0.016);
    expect(heard).toEqual(['rb', 'rb']);
  });

  it('a trigger pulled is a press too', () => {
    press(6, 0.9);
    poll(0.016);
    expect(heard).toEqual(['lt']);
  });

  it('a stick pushed past halfway is a press of that direction', () => {
    pad.axes = [0, 0.3, 0, 0];
    poll(0.016);
    expect(heard).toEqual([]);
    pad.axes = [0, 0.7, 0, 0];
    poll(0.016);
    expect(heard).toEqual(['ls-down']);
  });

  it('a held input repeats after a wait, as a held key does', () => {
    press(13);
    poll(0.016);
    expect(heard).toEqual(['down']);
    // Steps of 50 ms up to just short of the wait: no repeat yet.
    const steps = Math.floor((INPUT_REPEAT_DELAY_S - 0.01) / 0.05);
    for (let i = 0; i < steps; i++) poll(0.05);
    expect(heard).toEqual(['down']);
    poll(0.05);
    expect(heard).toEqual(['down', 'down again']);
    const more = Math.ceil(INPUT_REPEAT_S / 0.05);
    for (let i = 0; i < more; i++) poll(0.05);
    expect(heard).toEqual(['down', 'down again', 'down again']);
    release(13);
    for (let i = 0; i < 20; i++) poll(0.05);
    expect(heard).toHaveLength(3);
  });
});
