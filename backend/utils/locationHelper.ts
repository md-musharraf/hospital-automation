import {
  getAllStates,
  getDistrictsForState,
  isValidState,
  isValidDistrict,
  normalizeLocation
} from '@careeai/shared';

// Location fallback helper.
//
// The location-based discovery flow (State → District → facility) needs a state
// and district for every facility. New facilities store them explicitly, but
// older records only ever captured a `city`. Rather than force a data migration,
// we derive a sensible state/district from the city for anything missing, so the
// filter works for existing production data too.

// Minimal city → state map for the cities the app actually seeds/uses. Extend as
// new cities are onboarded. Keys are lowercased for case-insensitive matching.
export const CITY_TO_STATE: Record<string, string> = {
  delhi: 'Delhi',
  'new delhi': 'Delhi',
  mumbai: 'Maharashtra',
  pune: 'Maharashtra',
  nagpur: 'Maharashtra',
  kolkata: 'West Bengal',
  howrah: 'West Bengal',
  bengaluru: 'Karnataka',
  bangalore: 'Karnataka',
  chennai: 'Tamil Nadu',
  hyderabad: 'Telangana',
  ahmedabad: 'Gujarat',
  surat: 'Gujarat',
  jaipur: 'Rajasthan',
  lucknow: 'Uttar Pradesh',
  kanpur: 'Uttar Pradesh',
  noida: 'Uttar Pradesh',
  patna: 'Bihar',
  bhopal: 'Madhya Pradesh',
  indore: 'Madhya Pradesh',
  chandigarh: 'Chandigarh',
  kochi: 'Kerala',
  thiruvananthapuram: 'Kerala'
};

export interface ResolvedLocation {
  state: string;
  district: string;
}

/**
 * Returns { state, district } for a facility, preferring its explicitly-stored
 * values and falling back to a city-derived guess using @careeai/shared.
 * District falls back to canonical district matching the city or the city itself;
 * state falls back to city map, canonical state resolution, then city name, then 'Other'.
 */
export function resolveLocation({
  state,
  district,
  city
}: { state?: string | null; district?: string | null; city?: string | null } = {}): ResolvedLocation {
  const cleanState = (state || '').trim();
  const cleanDistrict = (district || '').trim();
  const cleanCity = (city || '').trim();

  // If state is already provided, attempt canonical normalization
  if (cleanState) {
    const norm = normalizeLocation(cleanState, cleanDistrict || cleanCity);
    if (isValidState(norm.state)) {
      return {
        state: norm.state,
        district: norm.district || cleanDistrict || cleanCity || norm.state
      };
    }
  }

  // Fallback: derive state from city lookup map or check if city is a state
  const derivedFromMap = cleanCity ? CITY_TO_STATE[cleanCity.toLowerCase()] : '';
  const candidateState = derivedFromMap || (isValidState(cleanCity) ? cleanCity : '');

  if (candidateState) {
    const norm = normalizeLocation(candidateState, cleanDistrict || cleanCity);
    return {
      state: norm.state,
      district: norm.district || cleanDistrict || cleanCity || norm.state
    };
  }

  return {
    state: cleanState || cleanCity || 'Other',
    district: cleanDistrict || cleanCity || 'Other'
  };
}
