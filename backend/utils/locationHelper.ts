import { getDistrictsForState, isValidState, isValidDistrict, normalizeLocation } from '@careeai/shared';

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

export interface LocationCheck {
  ok: boolean;
  message?: string;
  state: string;
  district: string;
}

/**
 * Gate for a facility's location before it is written.
 *
 * The Super Admin portal already constrains state and district to the canonical
 * dataset with cascading dropdowns, so the browser never sends anything else.
 * That is exactly why the server has to check too: `normalizeLocation` hands
 * back the raw trimmed string when it does not recognise a state, so a direct
 * API call storing "Jharkhandd" was persisted verbatim — and the public
 * discovery filters build their state list *from stored facilities*, so one
 * typo mints a permanent phantom entry that no admin screen can remove.
 *
 * Both fields stay optional: a facility onboarded with only a city still falls
 * back to `resolveLocation`. What is rejected is a value that is present and
 * wrong, or a district that does not belong to the state it arrived with.
 * Returns canonical casing on success so callers can store the result directly.
 */
export function checkLocationInput(stateRaw?: unknown, districtRaw?: unknown): LocationCheck {
  // Typed as `unknown` on purpose: these arrive from JSON, where the declared
  // string type is a suggestion. A `{"$ne": null}` posted here used to reach
  // .trim() and crash the handler into a 500 — the caller learns nothing and
  // the log fills with stack traces instead of one rejected request.
  const state = typeof stateRaw === 'string' ? stateRaw.trim() : '';
  const district = typeof districtRaw === 'string' ? districtRaw.trim() : '';

  if (stateRaw != null && typeof stateRaw !== 'string') {
    return { ok: false, message: 'State must be a text value.', state: '', district: '' };
  }
  if (districtRaw != null && typeof districtRaw !== 'string') {
    return { ok: false, message: 'District must be a text value.', state: '', district: '' };
  }

  if (!state && !district) {
    return { ok: true, state: '', district: '' };
  }

  if (state && !isValidState(state)) {
    return {
      ok: false,
      message: `"${state}" is not a recognised Indian State or Union Territory.`,
      state: '',
      district: ''
    };
  }

  // A district without a state cannot be checked against anything, and stored
  // on its own it is unreachable from the State -> District discovery flow.
  if (district && !state) {
    return {
      ok: false,
      message: `A district ("${district}") requires the State or Union Territory it belongs to.`,
      state: '',
      district: ''
    };
  }

  if (district && !isValidDistrict(state, district)) {
    const known = getDistrictsForState(state);
    return {
      ok: false,
      message: `"${district}" is not a district of ${normalizeLocation(state, '').state}. Expected one of ${known.length} official districts.`,
      state: '',
      district: ''
    };
  }

  const norm = normalizeLocation(state, district);
  return { ok: true, state: norm.state, district: norm.district };
}
