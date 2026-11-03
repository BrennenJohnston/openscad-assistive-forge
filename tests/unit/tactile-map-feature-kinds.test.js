/**
 * What a point on the map is, in a plain word read from its OpenStreetMap
 * tags: a bus stop, an entrance, a cafe, a clinic. The word comes before
 * the feature's name in the editor's rows and the warnings, so a symbol is
 * never just "Landmark".
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  kindOf,
  isFurniture,
  FURNITURE_AMENITIES,
} from '../../src/js/tactile-map/feature-kinds.js';

describe('kindOf', () => {
  it.each([
    [{ highway: 'bus_stop' }, 'Bus stop'],
    [{ public_transport: 'platform', bus: 'yes' }, 'Bus stop'],
    [{ public_transport: 'stop_position', bus: 'yes' }, 'Bus stop'],
    [{ railway: 'tram_stop' }, 'Tram stop'],
    [{ public_transport: 'platform', tram: 'yes' }, 'Tram stop'],
    [{ railway: 'station' }, 'Train station'],
    [{ railway: 'halt' }, 'Train station'],
    [{ public_transport: 'platform', railway: 'platform' }, 'Train station'],
    [{ public_transport: 'stop_position', railway: 'stop' }, 'Train station'],
    [{ public_transport: 'platform' }, 'Transit stop'],
    [{ entrance: 'yes' }, 'Entrance'],
    [{ entrance: 'main' }, 'Main entrance'],
    [{ amenity: 'cafe' }, 'Cafe'],
    [{ amenity: 'restaurant' }, 'Restaurant'],
    [{ amenity: 'fast_food' }, 'Fast food'],
    [{ amenity: 'bar' }, 'Bar'],
    [{ amenity: 'pub' }, 'Bar'],
    [{ amenity: 'library' }, 'Library'],
    [{ amenity: 'pharmacy' }, 'Pharmacy'],
    [{ amenity: 'hospital' }, 'Hospital'],
    [{ amenity: 'clinic' }, 'Clinic'],
    [{ amenity: 'doctors' }, 'Clinic'],
    [{ amenity: 'dentist' }, 'Dentist'],
    [{ amenity: 'bank' }, 'Bank'],
    [{ amenity: 'atm' }, 'ATM'],
    [{ amenity: 'post_office' }, 'Post office'],
    [{ amenity: 'toilets' }, 'Toilets'],
    [{ amenity: 'drinking_water' }, 'Drinking water'],
    [{ amenity: 'parking' }, 'Parking'],
    [{ amenity: 'bicycle_parking' }, 'Bike parking'],
    [{ amenity: 'school' }, 'School'],
    [{ amenity: 'university' }, 'University'],
    [{ amenity: 'place_of_worship' }, 'Place of worship'],
    [{ amenity: 'theatre' }, 'Theater'],
    [{ amenity: 'cinema' }, 'Cinema'],
    [{ amenity: 'police' }, 'Police'],
    [{ amenity: 'fire_station' }, 'Fire station'],
    [{ amenity: 'fuel' }, 'Gas station'],
    [{ amenity: 'bench' }, 'Bench'],
    [{ amenity: 'waste_basket' }, 'Trash can'],
    [{ amenity: 'post_box' }, 'Mailbox'],
    [{ amenity: 'vending_machine' }, 'Vending machine'],
    [{ amenity: 'telephone' }, 'Phone'],
    [{ amenity: 'bicycle_rental' }, 'Bike rental'],
    [{ amenity: 'charging_station' }, 'Charging station'],
    [{ leisure: 'picnic_table' }, 'Picnic table'],
    [{ shop: 'supermarket' }, 'Supermarket'],
    [{ shop: 'convenience' }, 'Convenience store'],
    [{ shop: 'bakery' }, 'Bakery'],
    [{ shop: 'books' }, 'Shop (books)'],
    [{ tourism: 'hotel' }, 'Hotel'],
    [{ tourism: 'museum' }, 'Museum'],
    [{ tourism: 'information' }, 'Information'],
    [{ healthcare: 'clinic' }, 'Clinic'],
    [{ healthcare: 'doctor' }, 'Clinic'],
    [{ healthcare: 'hospital' }, 'Hospital'],
    [{ office: 'government' }, 'Office'],
  ])('reads %j as "%s"', (tags, word) => {
    expect(kindOf(tags)).toBe(word);
  });

  it('says an amenity it has no word for in its own words, the first of several values', () => {
    expect(kindOf({ amenity: 'boat_rental' })).toBe('Boat rental');
    expect(kindOf({ amenity: 'parking_entrance;taxi' })).toBe(
      'Parking entrance'
    );
    expect(kindOf({ healthcare: 'physiotherapist' })).toBe('Physiotherapist');
  });

  it('reads a stop before its amenity, and an entrance before a shop', () => {
    expect(kindOf({ highway: 'bus_stop', amenity: 'bench' })).toBe('Bus stop');
    expect(kindOf({ entrance: 'main', shop: 'bakery' })).toBe('Main entrance');
  });

  it('has no word for a point it cannot read', () => {
    expect(kindOf({})).toBeNull();
    expect(kindOf({ name: 'Somewhere' })).toBeNull();
    expect(kindOf(undefined)).toBeNull();
  });
});

describe('isFurniture', () => {
  it('is street furniture for the benches, bins and racks a traveler does not steer by', () => {
    for (const value of FURNITURE_AMENITIES) {
      expect(isFurniture({ amenity: value })).toBe(true);
    }
    expect(isFurniture({ leisure: 'picnic_table' })).toBe(true);
    expect(isFurniture({ amenity: 'cafe' })).toBe(false);
    expect(isFurniture({ amenity: 'toilets' })).toBe(false);
    expect(isFurniture({ shop: 'bakery' })).toBe(false);
  });
});
