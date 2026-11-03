/**
 * What a point on a map is, in a plain word read from its OpenStreetMap
 * tags: "Bus stop", "Entrance", "Cafe", "Clinic", "Bench". The word comes
 * before the feature's name wherever a person reads it, so a symbol says
 * what it stands for (ISO 19028 4.2.4: every tactile mark explained), and
 * it is the word a map key lists.
 *
 * Street furniture (benches, bins, racks) is told apart here: a traveler
 * does not steer by it, and the published tiers of what a map carries
 * leave it out of the first tier (Holloway and others 2019).
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

/** The railway values of a stop for trains (light rail and subway too). */
const TRAIN_RAILWAY = ['station', 'halt', 'stop', 'platform'];
const TRAIN_MODES = ['train', 'light_rail', 'subway'];

const AMENITY_WORDS = Object.freeze({
  cafe: 'Cafe',
  restaurant: 'Restaurant',
  fast_food: 'Fast food',
  bar: 'Bar',
  pub: 'Bar',
  library: 'Library',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  clinic: 'Clinic',
  doctors: 'Clinic',
  dentist: 'Dentist',
  bank: 'Bank',
  atm: 'ATM',
  post_office: 'Post office',
  toilets: 'Toilets',
  drinking_water: 'Drinking water',
  parking: 'Parking',
  bicycle_parking: 'Bike parking',
  school: 'School',
  university: 'University',
  place_of_worship: 'Place of worship',
  theatre: 'Theater',
  cinema: 'Cinema',
  police: 'Police',
  fire_station: 'Fire station',
  fuel: 'Gas station',
  bench: 'Bench',
  waste_basket: 'Trash can',
  post_box: 'Mailbox',
  vending_machine: 'Vending machine',
  telephone: 'Phone',
  bicycle_rental: 'Bike rental',
  charging_station: 'Charging station',
});

const SHOP_WORDS = Object.freeze({
  supermarket: 'Supermarket',
  convenience: 'Convenience store',
  bakery: 'Bakery',
});

const TOURISM_WORDS = Object.freeze({
  hotel: 'Hotel',
  museum: 'Museum',
  information: 'Information',
});

const HEALTHCARE_WORDS = Object.freeze({
  clinic: 'Clinic',
  doctor: 'Clinic',
  hospital: 'Hospital',
  dentist: 'Dentist',
  pharmacy: 'Pharmacy',
});

/** The amenity values that are street furniture, not places. */
export const FURNITURE_AMENITIES = Object.freeze([
  'bench',
  'waste_basket',
  'bicycle_parking',
  'vending_machine',
  'post_box',
  'telephone',
  'bicycle_rental',
  'charging_station',
]);

/** The first of several values ("cafe;bakery"), or the value. */
const firstValue = (v) => String(v).split(';')[0].trim();

/** A tag value in its own words: "boat_rental" is "Boat rental". */
function ownWords(value) {
  const words = firstValue(value).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function transitWord(t) {
  if (t.railway === 'tram_stop' || t.tram === 'yes') return 'Tram stop';
  if (
    TRAIN_RAILWAY.includes(t.railway) ||
    TRAIN_MODES.some((mode) => t[mode] === 'yes')
  ) {
    return 'Train station';
  }
  if (t.highway === 'bus_stop' || t.bus === 'yes' || t.trolleybus === 'yes') {
    return 'Bus stop';
  }
  return 'Transit stop';
}

/**
 * The plain word for a point, read from its tags, or null when nothing
 * says what it is. A stop is read first, then an entrance, then what the
 * place is.
 *
 * @param {Record<string, string>} [tags]
 * @returns {string|null}
 */
export function kindOf(tags) {
  const t = tags && typeof tags === 'object' ? tags : {};
  if (
    'public_transport' in t ||
    t.highway === 'bus_stop' ||
    t.railway === 'tram_stop' ||
    TRAIN_RAILWAY.includes(t.railway)
  ) {
    return transitWord(t);
  }
  if ('entrance' in t)
    return t.entrance === 'main' ? 'Main entrance' : 'Entrance';
  if (t.amenity !== undefined) {
    const v = firstValue(t.amenity);
    return AMENITY_WORDS[v] || ownWords(v);
  }
  if (t.leisure === 'picnic_table') return 'Picnic table';
  if (t.shop !== undefined) {
    const v = firstValue(t.shop);
    return SHOP_WORDS[v] || `Shop (${v.replace(/_/g, ' ')})`;
  }
  if (t.tourism !== undefined) {
    const v = firstValue(t.tourism);
    return TOURISM_WORDS[v] || ownWords(v);
  }
  if (t.healthcare !== undefined) {
    const v = firstValue(t.healthcare);
    return HEALTHCARE_WORDS[v] || ownWords(v);
  }
  if (t.office !== undefined) return 'Office';
  return null;
}

/**
 * Is this point street furniture (a bench, a bin, a rack, a machine)?
 *
 * @param {Record<string, string>} [tags]
 * @returns {boolean}
 */
export function isFurniture(tags) {
  const t = tags && typeof tags === 'object' ? tags : {};
  if (t.leisure === 'picnic_table') return true;
  return (
    t.amenity !== undefined &&
    FURNITURE_AMENITIES.includes(firstValue(t.amenity))
  );
}
