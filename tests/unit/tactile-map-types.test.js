/**
 * The Tactile Map Designer's map types: three purposes, each with a name, a
 * sentence and its numbered steps, and the link that asks for one.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  MAP_TYPES,
  MAP_TYPE_QUESTION,
  mapType,
  typeFromUrl,
} from '../../src/js/tactile-map/map-types.js';

describe('the map types', () => {
  it('are a place map, a route map and a map from a drawing, in that order', () => {
    expect(MAP_TYPES.map((t) => t.key)).toEqual(['place', 'route', 'drawing']);
    expect(MAP_TYPES.map((t) => t.name)).toEqual([
      'A place map',
      'A route map',
      'A map from your drawing',
    ]);
    expect(MAP_TYPE_QUESTION).toBe('What map do you want to make?');
  });

  it('each says what it is for in one sentence', () => {
    expect(mapType('place').sentence).toBe(
      'The ground around one address, to learn an area before you go: a block, a campus, the streets around a stop.'
    );
    expect(mapType('route').sentence).toBe(
      'From one place to another on foot, with the turns, crossings and steps on the way.'
    );
    expect(mapType('drawing').sentence).toBe(
      'A floor plan, a station drawing, a DXF or a traced photo you already have, with your own classes.'
    );
  });

  it('each has five steps, the last one Check and print', () => {
    for (const t of MAP_TYPES) {
      expect(t.steps).toHaveLength(5);
      expect(t.steps[4]).toBe('Check and print');
    }
    expect(mapType('place').steps).toEqual([
      'Where',
      'How much ground',
      'What to show',
      'Make the map',
      'Check and print',
    ]);
    expect(mapType('route').steps[0]).toBe('From and To');
    expect(mapType('route').steps[1]).toBe('How you walk');
    expect(mapType('drawing').steps[0]).toBe('Choose the drawing');
  });

  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(MAP_TYPES)).toBe(true);
    expect(Object.isFrozen(MAP_TYPES[0])).toBe(true);
    expect(Object.isFrozen(MAP_TYPES[0].steps)).toBe(true);
  });
});

describe('typeFromUrl', () => {
  it('reads the type a link asks for', () => {
    expect(typeFromUrl('?example=tactile-map&type=route')).toBe('route');
    expect(typeFromUrl('?type=place&example=tactile-map')).toBe('place');
    expect(typeFromUrl('?example=tactile-map&type=drawing')).toBe('drawing');
  });

  it('says null for no type, an unknown one, or nothing at all', () => {
    expect(typeFromUrl('?example=tactile-map')).toBeNull();
    expect(typeFromUrl('?example=tactile-map&type=bus')).toBeNull();
    expect(typeFromUrl('')).toBeNull();
    expect(typeFromUrl(undefined)).toBeNull();
  });
});
