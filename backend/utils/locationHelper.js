// Location fallback helper.
//
// The location-based discovery flow (State → District → facility) needs a state
// and district for every facility. New facilities store them explicitly, but
// older records only ever captured a `city`. Rather than force a data migration,
// we derive a sensible state/district from the city for anything missing, so the
// filter works for existing production data too.

// Minimal city → state map for the cities the app actually seeds/uses. Extend as
// new cities are onboarded. Keys are lowercased for case-insensitive matching.
const CITY_TO_STATE = {
  'delhi': 'Delhi',
  'new delhi': 'Delhi',
  'mumbai': 'Maharashtra',
  'pune': 'Maharashtra',
  'nagpur': 'Maharashtra',
  'kolkata': 'West Bengal',
  'howrah': 'West Bengal',
  'bengaluru': 'Karnataka',
  'bangalore': 'Karnataka',
  'chennai': 'Tamil Nadu',
  'hyderabad': 'Telangana',
  'ahmedabad': 'Gujarat',
  'surat': 'Gujarat',
  'jaipur': 'Rajasthan',
  'lucknow': 'Uttar Pradesh',
  'kanpur': 'Uttar Pradesh',
  'noida': 'Uttar Pradesh',
  'patna': 'Bihar',
  'bhopal': 'Madhya Pradesh',
  'indore': 'Madhya Pradesh',
  'chandigarh': 'Chandigarh',
  'kochi': 'Kerala',
  'thiruvananthapuram': 'Kerala',
};

/**
 * Returns { state, district } for a facility, preferring its explicitly-stored
 * values and falling back to a city-derived guess. District falls back to the
 * city itself (the city IS the district for most practical filtering); state
 * falls back to the city map, then to the city name, then to 'Other'.
 */
function resolveLocation({ state, district, city } = {}) {
  const cleanCity = (city || '').trim();
  const derivedState = CITY_TO_STATE[cleanCity.toLowerCase()] || '';
  return {
    state: (state && state.trim()) || derivedState || cleanCity || 'Other',
    district: (district && district.trim()) || cleanCity || 'Other',
  };
}

module.exports = { resolveLocation, CITY_TO_STATE };
