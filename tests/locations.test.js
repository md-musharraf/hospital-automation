/**
 * Comprehensive E2E & Hardening Test Suite for All-India Location Discovery,
 * Cascading Controls, and Backend Persistence.
 * ---------------------------------------------------------------------------
 * Deliberately dependency-free using tests/helpers/assert.js.
 *
 * Tier 1: Feature Coverage & Dataset Integrity
 * Tier 2: Boundary & Corner Cases (Whitespace, Casing, Nulls, Pincodes, Coords)
 * Tier 3: Cross-Feature & Dynamic Active-Location Filtering (HospitalHub.tsx)
 * Tier 4: Real-World Application Scenarios & Persistence (Super Admin Onboarding, Edit, Legacy Fallbacks)
 */

const path = require('path');
const { section, check, report } = require('./helpers/assert');

// 1. Shared Package Exports & Canonical Dataset
const {
  INDIA_LOCATIONS,
  INDIA_STATES,
  getAllStates,
  getDistrictsForState,
  isValidState,
  isValidDistrict,
  normalizeLocation,
  getActiveLocations
} = require(path.resolve(__dirname, '..', 'shared', 'dist'));

// 2. Backend Location Helper Utilities
const { CITY_TO_STATE, resolveLocation, checkLocationInput } = require(
  path.resolve(__dirname, '..', 'backend', 'dist', 'utils', 'locationHelper')
);

(async () => {
  // =========================================================================
  // TIER 1: FEATURE COVERAGE & DATASET INTEGRITY
  // =========================================================================
  section('Tier 1: Feature Coverage — All-India Dataset Structure & Integrity');

  check(
    'INDIA_LOCATIONS is defined and is an object',
    INDIA_LOCATIONS && typeof INDIA_LOCATIONS === 'object'
  );
  check('INDIA_STATES is defined and is an array', Array.isArray(INDIA_STATES));

  const allStateKeys = Object.keys(INDIA_LOCATIONS);
  check('INDIA_LOCATIONS contains exactly 36 administrative entities', allStateKeys.length === 36, {
    count: allStateKeys.length
  });
  check('INDIA_STATES length matches 36 entities', INDIA_STATES.length === 36, {
    count: INDIA_STATES.length
  });

  const stateEntries = Object.entries(INDIA_LOCATIONS);
  const statesOnly = stateEntries.filter(([_, info]) => info.type === 'state');
  const utsOnly = stateEntries.filter(([_, info]) => info.type === 'ut');

  check('Dataset contains exactly 28 States', statesOnly.length === 28, {
    foundStates: statesOnly.length
  });
  check('Dataset contains exactly 8 Union Territories', utsOnly.length === 8, {
    foundUTs: utsOnly.length
  });

  let totalDistrictsCount = 0;
  let allDistrictsValid = true;
  let zeroDistrictsFound = false;
  let duplicateDistrictsInState = false;

  for (const [stName, info] of stateEntries) {
    if (!info.name || info.name !== stName) allDistrictsValid = false;
    if (!Array.isArray(info.districts) || info.districts.length === 0) zeroDistrictsFound = true;
    const uniqueDistricts = new Set(info.districts);
    if (uniqueDistricts.size !== info.districts.length) duplicateDistrictsInState = true;
    totalDistrictsCount += info.districts.length;
  }

  check('Every state entry has consistent name, type, and valid districts array', allDistrictsValid);
  check('Every state and UT has at least 1 district', !zeroDistrictsFound);
  check('No state contains duplicate districts within itself', !duplicateDistrictsInState);
  check('Total official districts across all 36 entities is >= 750', totalDistrictsCount >= 750, {
    totalDistrictsCount
  });

  section('Tier 1: Feature Coverage — Core API Functions');

  const retrievedStates = getAllStates();
  check(
    'getAllStates() returns an array with 36 states',
    Array.isArray(retrievedStates) && retrievedStates.length === 36
  );

  // Check alphabetical sorting of getAllStates()
  const isAlphabetical = retrievedStates.every(
    (val, i, arr) => i === 0 || arr[i - 1].localeCompare(val) <= 0
  );
  check('getAllStates() is sorted alphabetically', isAlphabetical, retrievedStates);

  // Check immutability / non-aliasing of getAllStates()
  retrievedStates.push('FakeState');
  check(
    'Modifying getAllStates() return value does not mutate internal dataset',
    getAllStates().length === 36
  );

  // Check getDistrictsForState() across various States and UTs
  const maharashtraDists = getDistrictsForState('Maharashtra');
  check('getDistrictsForState("Maharashtra") returns 36 districts', maharashtraDists.length === 36, {
    count: maharashtraDists.length
  });
  check(
    'getDistrictsForState("Maharashtra") includes Pune and Mumbai City',
    maharashtraDists.includes('Pune') &&
      maharashtraDists.includes('Mumbai City') &&
      maharashtraDists.includes('Nagpur')
  );

  const delhiDists = getDistrictsForState('Delhi');
  check('getDistrictsForState("Delhi") returns 11 districts', delhiDists.length === 11, {
    count: delhiDists.length
  });
  check(
    'getDistrictsForState("Delhi") includes New Delhi, Central Delhi, and South Delhi',
    delhiDists.includes('New Delhi') &&
      delhiDists.includes('Central Delhi') &&
      delhiDists.includes('South Delhi')
  );

  const jharkhandDists = getDistrictsForState('Jharkhand');
  check('getDistrictsForState("Jharkhand") returns 24 districts', jharkhandDists.length === 24, {
    count: jharkhandDists.length
  });
  check(
    'getDistrictsForState("Jharkhand") includes Ranchi, Dhanbad, and Bokaro',
    jharkhandDists.includes('Ranchi') &&
      jharkhandDists.includes('Dhanbad') &&
      jharkhandDists.includes('Bokaro')
  );

  const goaDists = getDistrictsForState('Goa');
  check(
    'getDistrictsForState("Goa") returns 2 districts (North Goa, South Goa)',
    goaDists.length === 2 && goaDists.includes('North Goa') && goaDists.includes('South Goa')
  );

  const ladakhDists = getDistrictsForState('Ladakh');
  check(
    'getDistrictsForState("Ladakh") returns 2 districts (Kargil, Leh)',
    ladakhDists.length === 2 && ladakhDists.includes('Kargil') && ladakhDists.includes('Leh')
  );

  // Check isValidState()
  check('isValidState("Bihar") is true', isValidState('Bihar') === true);
  check('isValidState("Puducherry") is true', isValidState('Puducherry') === true);
  check('isValidState("California") is false', isValidState('California') === false);
  check('isValidState("London") is false', isValidState('London') === false);

  // Check isValidDistrict()
  check('isValidDistrict("Jharkhand", "Ranchi") is true', isValidDistrict('Jharkhand', 'Ranchi') === true);
  check('isValidDistrict("Maharashtra", "Pune") is true', isValidDistrict('Maharashtra', 'Pune') === true);
  check(
    'isValidDistrict("Jharkhand", "Pune") is false (cross-state mismatch)',
    isValidDistrict('Jharkhand', 'Pune') === false
  );
  check('isValidDistrict("Delhi", "Chennai") is false', isValidDistrict('Delhi', 'Chennai') === false);

  // Check normalizeLocation()
  const norm1 = normalizeLocation('bihar', 'patna');
  check(
    'normalizeLocation("bihar", "patna") normalizes to canonical casing',
    norm1.state === 'Bihar' && norm1.district === 'Patna',
    norm1
  );

  const norm2 = normalizeLocation('delhi', 'new delhi');
  check(
    'normalizeLocation("delhi", "new delhi") normalizes to canonical casing',
    norm2.state === 'Delhi' && norm2.district === 'New Delhi',
    norm2
  );

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================
  section('Tier 2: Boundary & Corner Cases — Input Robustness & Formatting');

  // Null, undefined, and non-string inputs
  check('isValidState(null) is false without crashing', isValidState(null) === false);
  check('isValidState(undefined) is false without crashing', isValidState(undefined) === false);
  check('isValidState("") is false', isValidState('') === false);
  check('isValidState("   ") is false', isValidState('   ') === false);
  check('isValidState(12345) is false', isValidState(12345) === false);
  check('isValidState({}) is false', isValidState({}) === false);

  check(
    'getDistrictsForState(null) returns []',
    Array.isArray(getDistrictsForState(null)) && getDistrictsForState(null).length === 0
  );
  check(
    'getDistrictsForState(undefined) returns []',
    Array.isArray(getDistrictsForState(undefined)) && getDistrictsForState(undefined).length === 0
  );
  check(
    'getDistrictsForState("") returns []',
    Array.isArray(getDistrictsForState('')) && getDistrictsForState('').length === 0
  );
  check(
    'getDistrictsForState("   ") returns []',
    Array.isArray(getDistrictsForState('   ')) && getDistrictsForState('   ').length === 0
  );
  check(
    'getDistrictsForState("Atlantis") returns []',
    Array.isArray(getDistrictsForState('Atlantis')) && getDistrictsForState('Atlantis').length === 0
  );
  check(
    'getDistrictsForState(999) returns []',
    Array.isArray(getDistrictsForState(999)) && getDistrictsForState(999).length === 0
  );

  check('isValidDistrict(null, null) is false', isValidDistrict(null, null) === false);
  check('isValidDistrict("Delhi", null) is false', isValidDistrict('Delhi', null) === false);
  check('isValidDistrict(null, "New Delhi") is false', isValidDistrict(null, 'New Delhi') === false);
  check('isValidDistrict("", "") is false', isValidDistrict('', '') === false);
  check('isValidDistrict("   ", "   ") is false', isValidDistrict('   ', '   ') === false);
  check(
    'isValidDistrict("Maharashtra", "UnknownDistrictXYZ") is false',
    isValidDistrict('Maharashtra', 'UnknownDistrictXYZ') === false
  );
  check(
    'isValidDistrict("UnknownStateXYZ", "Pune") is false',
    isValidDistrict('UnknownStateXYZ', 'Pune') === false
  );

  // Case-insensitivity & whitespace trimming
  check('isValidState with uppercase "JHARKHAND" is true', isValidState('JHARKHAND') === true);
  check(
    'isValidState with mixed case and leading/trailing whitespace "  dElHi  " is true',
    isValidState('  dElHi  ') === true
  );
  check(
    'isValidState with UT "andaman and nicobar islands" is true',
    isValidState('andaman and nicobar islands') === true
  );

  check(
    'isValidDistrict with mixed case and whitespace "  jHaRkHaNd  ", "  rAnChI  " is true',
    isValidDistrict('  jHaRkHaNd  ', '  rAnChI  ') === true
  );
  check(
    'isValidDistrict with uppercase "TAMIL NADU", "CHENNAI" is true',
    isValidDistrict('TAMIL NADU', 'CHENNAI') === true
  );
  check(
    'isValidDistrict with lowercase "karnataka", "bengaluru urban" is true',
    isValidDistrict('karnataka', 'bengaluru urban') === true
  );

  // normalizeLocation boundary behavior
  check(
    'normalizeLocation(null, null) returns empty strings',
    JSON.stringify(normalizeLocation(null, null)) === JSON.stringify({ state: '', district: '' })
  );
  check(
    'normalizeLocation(undefined, undefined) returns empty strings',
    JSON.stringify(normalizeLocation(undefined, undefined)) === JSON.stringify({ state: '', district: '' })
  );
  check(
    'normalizeLocation("  ", "  ") returns empty strings',
    JSON.stringify(normalizeLocation('  ', '  ')) === JSON.stringify({ state: '', district: '' })
  );
  check(
    'normalizeLocation with unknown state preserves trimmed input',
    JSON.stringify(normalizeLocation('  CustomState  ', '  CustomDistrict  ')) ===
      JSON.stringify({ state: 'CustomState', district: 'CustomDistrict' })
  );
  check(
    'normalizeLocation with valid state but unknown district normalizes state and preserves district',
    JSON.stringify(normalizeLocation('  kerala  ', '  SpecialMedicalZone  ')) ===
      JSON.stringify({ state: 'Kerala', district: 'SpecialMedicalZone' })
  );

  // Coordinate and Pincode validation helper checks
  section('Tier 2: Boundary & Corner Cases — Coordinates & Pincode Handling');

  const defaultCoords = { lat: 28.6139, lng: 77.209 }; // Standard Delhi fallback coordinates
  const sanitizeCoords = (c) => {
    const lat = parseFloat(c && c.lat);
    const lng = parseFloat(c && c.lng);
    return {
      lat: !isNaN(lat) ? lat : defaultCoords.lat,
      lng: !isNaN(lng) ? lng : defaultCoords.lng
    };
  };

  check(
    'Valid coordinates are preserved',
    JSON.stringify(sanitizeCoords({ lat: 19.076, lng: 72.8777 })) ===
      JSON.stringify({ lat: 19.076, lng: 72.8777 })
  );
  check(
    'Missing coordinates fall back to defaults',
    JSON.stringify(sanitizeCoords(null)) === JSON.stringify(defaultCoords)
  );
  check(
    'Corrupt coordinates fall back to defaults',
    JSON.stringify(sanitizeCoords({ lat: 'not-a-number', lng: null })) === JSON.stringify(defaultCoords)
  );

  const cleanPincode = (p) => (p && typeof p === 'string' ? p.trim() : '');
  check('Clean pincode removes outer whitespace', cleanPincode('  110001  ') === '110001');
  check('Null pincode returns empty string', cleanPincode(null) === '');
  check('Undefined pincode returns empty string', cleanPincode(undefined) === '');

  // =========================================================================
  // TIER 3: CROSS-FEATURE & ACTIVE-LOCATION FILTERING (HospitalHub.tsx)
  // =========================================================================
  section('Tier 3: Cross-Feature — Dynamic Active Location Aggregation');

  const testHospitals = [
    {
      id: 'h1',
      name: 'Patna Central Hospital',
      state: 'Bihar',
      district: 'Patna',
      city: 'Patna',
      type: 'Hospital'
    },
    {
      id: 'h2',
      name: 'Patna Children Clinic',
      state: 'Bihar',
      district: 'Patna',
      city: 'Patna',
      type: 'Clinic'
    },
    { id: 'h3', name: 'Gaya Diagnostics', state: 'Bihar', district: 'Gaya', city: 'Gaya', type: 'Lab' },
    {
      id: 'h4',
      name: 'Ranchi Super Specialty',
      state: 'Jharkhand',
      district: 'Ranchi',
      city: 'Ranchi',
      type: 'Hospital'
    },
    {
      id: 'h5',
      name: 'Dhanbad Medical Center',
      state: 'Jharkhand',
      district: 'Dhanbad',
      city: 'Dhanbad',
      type: 'Hospital'
    },
    {
      id: 'h6',
      name: 'Mumbai City Care',
      state: 'Maharashtra',
      district: 'Mumbai City',
      city: 'Mumbai',
      type: 'Hospital'
    },
    {
      id: 'h7',
      name: 'New Delhi Health Post',
      state: 'Delhi',
      district: 'New Delhi',
      city: 'New Delhi',
      type: 'Hospital'
    }
  ];

  const activeResult = getActiveLocations(testHospitals);

  check(
    'getActiveLocations returns states and districts objects',
    Array.isArray(activeResult.states) && typeof activeResult.districts === 'object'
  );

  check(
    'Exactly 4 active states are extracted (only states with >=1 facility)',
    activeResult.states.length === 4,
    { count: activeResult.states.length, states: activeResult.states }
  );

  const stateCountsMap = Object.fromEntries(activeResult.states.map((s) => [s.name, s.count]));
  check('Bihar has count 3', stateCountsMap['Bihar'] === 3, stateCountsMap);
  check('Jharkhand has count 2', stateCountsMap['Jharkhand'] === 2, stateCountsMap);
  check('Maharashtra has count 1', stateCountsMap['Maharashtra'] === 1, stateCountsMap);
  check('Delhi has count 1', stateCountsMap['Delhi'] === 1, stateCountsMap);
  check(
    'States with zero facilities (e.g. Goa, Kerala) are not in active states',
    stateCountsMap['Goa'] === undefined && stateCountsMap['Kerala'] === undefined
  );

  // Check active districts under Bihar
  const biharActiveDistricts = activeResult.districts['Bihar'] || [];
  const biharDistMap = Object.fromEntries(biharActiveDistricts.map((d) => [d.name, d.count]));
  check(
    'Bihar active districts include Patna (2) and Gaya (1)',
    biharDistMap['Patna'] === 2 && biharDistMap['Gaya'] === 1,
    biharDistMap
  );
  check(
    'Bihar active districts exclude empty districts (e.g. Muzaffarpur, Bhagalpur)',
    biharDistMap['Muzaffarpur'] === undefined && biharDistMap['Bhagalpur'] === undefined
  );

  // Check active districts under Jharkhand
  const jhActiveDistricts = activeResult.districts['Jharkhand'] || [];
  const jhDistMap = Object.fromEntries(jhActiveDistricts.map((d) => [d.name, d.count]));
  check(
    'Jharkhand active districts include Ranchi (1) and Dhanbad (1)',
    jhDistMap['Ranchi'] === 1 && jhDistMap['Dhanbad'] === 1,
    jhDistMap
  );

  section('Tier 3: Cross-Feature — HospitalHub District Narrowing & State Switching');

  // Simulation of HospitalHub.tsx reactive filtering algorithm
  function simulateHospitalHubFilter(
    hospitals,
    { selectedState, selectedDistrict, selectedType = 'All', searchQuery = '' }
  ) {
    let list = [...hospitals];
    if (selectedState !== 'All') {
      list = list.filter((h) => h.state === selectedState);
    }
    if (selectedDistrict !== 'All') {
      list = list.filter((h) => h.district === selectedDistrict);
    }
    if (selectedType !== 'All') {
      list = list.filter((h) => (h.type || 'Hospital') === selectedType);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) =>
          (h.name && h.name.toLowerCase().includes(q)) ||
          (h.city && h.city.toLowerCase().includes(q)) ||
          (h.district && h.district.toLowerCase().includes(q))
      );
    }
    return list;
  }

  // 1. All States, All Districts
  const allResults = simulateHospitalHubFilter(testHospitals, {
    selectedState: 'All',
    selectedDistrict: 'All'
  });
  check('Selecting "All" States returns all 7 facilities', allResults.length === 7);

  // 2. Select State: Bihar -> returns 3 hospitals
  const biharResults = simulateHospitalHubFilter(testHospitals, {
    selectedState: 'Bihar',
    selectedDistrict: 'All'
  });
  check('Selecting State "Bihar" narrows list to 3 Bihar facilities', biharResults.length === 3);

  // 3. Select District: Patna within Bihar -> returns 2 hospitals
  const patnaResults = simulateHospitalHubFilter(testHospitals, {
    selectedState: 'Bihar',
    selectedDistrict: 'Patna'
  });
  check(
    'Selecting District "Patna" within Bihar narrows list to 2 Patna facilities',
    patnaResults.length === 2
  );

  // 4. State switching resets district to 'All'
  let stateState = 'Bihar';
  let districtState = 'Patna';
  function handleStateChange(newState) {
    stateState = newState;
    districtState = 'All'; // Crucial invariant: never leave stale district from previous state
  }
  handleStateChange('Jharkhand');
  check(
    'Switching state to Jharkhand resets selectedDistrict to "All"',
    districtState === 'All' && stateState === 'Jharkhand'
  );

  const jhResultsAfterSwitch = simulateHospitalHubFilter(testHospitals, {
    selectedState: stateState,
    selectedDistrict: districtState
  });
  check(
    'Filtering after state switch produces 2 Jharkhand facilities with no stale district filtering',
    jhResultsAfterSwitch.length === 2
  );

  // 5. Combined Location + Facility Type filtering
  const biharLabs = simulateHospitalHubFilter(testHospitals, {
    selectedState: 'Bihar',
    selectedDistrict: 'All',
    selectedType: 'Lab'
  });
  check(
    'Filtering by State "Bihar" + Type "Lab" returns exactly 1 facility (Gaya Diagnostics)',
    biharLabs.length === 1 && biharLabs[0].name === 'Gaya Diagnostics'
  );

  // 6. Resilience on empty or null inputs
  check(
    'getActiveLocations([]) returns empty arrays without error',
    JSON.stringify(getActiveLocations([])) === JSON.stringify({ states: [], districts: {} })
  );
  check(
    'getActiveLocations(null) returns empty arrays without error',
    JSON.stringify(getActiveLocations(null)) === JSON.stringify({ states: [], districts: {} })
  );

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS & PERSISTENCE
  // =========================================================================
  section('Tier 4: Real-World Scenarios — Super Admin Onboarding & Backend Normalization');

  // Scenario 1: Super Admin onboards a new facility in Jharkhand (Ranchi)
  const newHospitalPayload = {
    id: 'ranchi-apex-hospital',
    name: 'Ranchi Apex Hospital',
    slug: 'ranchi-apex-hospital',
    type: 'Hospital',
    state: '  jharkhand  ',
    district: '  ranchi  ',
    city: 'Ranchi',
    address: 'Circular Road, Lalpur',
    pincode: '834001',
    coordinates: { lat: 23.37, lng: 85.33 },
    phone: '+919876543210',
    whatsappNumber: '+919876543210',
    password: 'SecurePassword123!'
  };

  // Simulating backend auth.ts normalization logic on registration
  const normOnboarding = normalizeLocation(newHospitalPayload.state, newHospitalPayload.district);
  const persistedHospital = {
    ...newHospitalPayload,
    state: normOnboarding.state || newHospitalPayload.state.trim(),
    district: normOnboarding.district || newHospitalPayload.district.trim()
  };

  check(
    'Onboarding normalizes state to canonical "Jharkhand"',
    persistedHospital.state === 'Jharkhand',
    persistedHospital
  );
  check(
    'Onboarding normalizes district to canonical "Ranchi"',
    persistedHospital.district === 'Ranchi',
    persistedHospital
  );

  // Propagate to active discovery dataset
  const updatedHospitalList = [...testHospitals, persistedHospital];
  const postOnboardActive = getActiveLocations(updatedHospitalList);
  const postOnboardJharkhand = postOnboardActive.states.find((s) => s.name === 'Jharkhand');
  check(
    'Newly onboarded facility dynamically updates Jharkhand count from 2 to 3',
    postOnboardJharkhand && postOnboardJharkhand.count === 3,
    postOnboardJharkhand
  );

  section('Tier 4: Real-World Scenarios — Super Admin Facility Profile Edit Flow');

  // Scenario 2: Super Admin edits existing facility location from Delhi to Maharashtra (Pune)
  const existingDelhiHospital = {
    id: 'capital-care',
    name: 'Capital Care Hospital',
    state: 'Delhi',
    district: 'New Delhi',
    city: 'New Delhi'
  };

  const editPayload = {
    state: '  maharashtra  ',
    district: '  pune  ',
    city: 'Pune',
    address: 'FC Road, Shivajinagar'
  };

  // Backend PUT route update simulation
  const normEdit = normalizeLocation(
    editPayload.state !== undefined ? editPayload.state : existingDelhiHospital.state,
    editPayload.district !== undefined ? editPayload.district : existingDelhiHospital.district
  );
  const updatedHospital = {
    ...existingDelhiHospital,
    state: normEdit.state,
    district: normEdit.district,
    city: editPayload.city,
    address: editPayload.address
  };

  check(
    'Profile edit correctly updates and canonicalizes state to "Maharashtra"',
    updatedHospital.state === 'Maharashtra',
    updatedHospital
  );
  check(
    'Profile edit correctly updates and canonicalizes district to "Pune"',
    updatedHospital.district === 'Pune',
    updatedHospital
  );

  // Scenario 3: Legacy DB Records & resolveLocation Fallback Compatibility
  section('Tier 4: Real-World Scenarios — Legacy Location Fallback Resolution');

  // 1. Record with full state & district explicitly provided
  const r1 = resolveLocation({ state: 'Karnataka', district: 'Bengaluru Urban', city: 'Bengaluru' });
  check(
    'Explicit valid state/district is preserved',
    r1.state === 'Karnataka' && r1.district === 'Bengaluru Urban',
    r1
  );

  // 2. Legacy record with only city: 'Delhi'
  const r2 = resolveLocation({ city: 'Delhi' });
  check('Legacy record with city "Delhi" resolves state to "Delhi"', r2.state === 'Delhi', r2);

  // 3. Legacy record with city: 'Mumbai'
  const r3 = resolveLocation({ city: 'Mumbai' });
  check('Legacy record with city "Mumbai" derives state "Maharashtra"', r3.state === 'Maharashtra', r3);

  // 4. Legacy record with city: 'Bangalore'
  const r4 = resolveLocation({ city: 'Bangalore' });
  check('Legacy record with city "Bangalore" derives state "Karnataka"', r4.state === 'Karnataka', r4);

  // 5. Legacy record with city: 'Patna'
  const r5 = resolveLocation({ city: 'Patna' });
  check('Legacy record with city "Patna" derives state "Bihar"', r5.state === 'Bihar', r5);

  // 6. Legacy record with city: 'Kolkata'
  const r6 = resolveLocation({ city: 'Kolkata' });
  check('Legacy record with city "Kolkata" derives state "West Bengal"', r6.state === 'West Bengal', r6);

  // 7. Legacy record with city: 'Hyderabad'
  const r7 = resolveLocation({ city: 'Hyderabad' });
  check('Legacy record with city "Hyderabad" derives state "Telangana"', r7.state === 'Telangana', r7);

  // 8. Legacy record with city: 'Ahmedabad'
  const r8 = resolveLocation({ city: 'Ahmedabad' });
  check('Legacy record with city "Ahmedabad" derives state "Gujarat"', r8.state === 'Gujarat', r8);

  // 9. Legacy record with city: 'Jaipur'
  const r9 = resolveLocation({ city: 'Jaipur' });
  check('Legacy record with city "Jaipur" derives state "Rajasthan"', r9.state === 'Rajasthan', r9);

  // 10. Legacy record with city: 'Kochi'
  const r10 = resolveLocation({ city: 'Kochi' });
  check('Legacy record with city "Kochi" derives state "Kerala"', r10.state === 'Kerala', r10);

  // 11. Legacy record with unmapped city name
  const r11 = resolveLocation({ city: 'UnknownTownship' });
  check(
    'Legacy record with unmapped city falls back to city name or Other',
    r11.state === 'UnknownTownship' || r11.state === 'Other',
    r11
  );

  // 12. Empty record fallback
  const r12 = resolveLocation({});
  check(
    'Empty location record returns fallback "Other"',
    r12.state === 'Other' && r12.district === 'Other',
    r12
  );

  // Check CITY_TO_STATE dictionary integrity
  check(
    'CITY_TO_STATE lookup table covers at least 20 common Indian metropolitan cities',
    Object.keys(CITY_TO_STATE).length >= 20,
    { cityCount: Object.keys(CITY_TO_STATE).length }
  );

  // Scenario 4: Super Admin Edit Modal Pre-selection Fallback Algorithm
  section('Tier 4: Real-World Scenarios — Super Admin Edit Modal Pre-selection');

  function simulateEditModalPreselection(hosp) {
    const resolved = normalizeLocation(hosp.state || hosp.city, hosp.district || hosp.city);
    const chosenState =
      hosp.state && isValidState(hosp.state)
        ? hosp.state
        : isValidState(resolved.state)
          ? resolved.state
          : 'Delhi';
    const dists = getDistrictsForState(chosenState);
    const chosenDistrict =
      hosp.district && isValidDistrict(chosenState, hosp.district)
        ? hosp.district
        : isValidDistrict(chosenState, resolved.district)
          ? resolved.district
          : dists[0] || '';
    return { chosenState, chosenDistrict };
  }

  // Preselection for a full modern record
  const pres1 = simulateEditModalPreselection({ state: 'Jharkhand', district: 'Ranchi', city: 'Ranchi' });
  check(
    'Preselection for complete record selects exact state and district',
    pres1.chosenState === 'Jharkhand' && pres1.chosenDistrict === 'Ranchi',
    pres1
  );

  // Preselection for a legacy record with only city 'Delhi'
  const pres2 = simulateEditModalPreselection({ city: 'Delhi' });
  check(
    'Preselection for legacy Delhi record selects state "Delhi" and valid district',
    pres2.chosenState === 'Delhi' && isValidDistrict('Delhi', pres2.chosenDistrict),
    pres2
  );

  // Preselection for a legacy record with unknown/empty location
  const pres3 = simulateEditModalPreselection({});
  check(
    'Preselection for empty record falls back safely to default state "Delhi" and valid district',
    pres3.chosenState === 'Delhi' && isValidDistrict('Delhi', pres3.chosenDistrict),
    pres3
  );

  // =========================================================================
  // TIER 5: SERVER-SIDE WRITE GATE (checkLocationInput)
  // =========================================================================
  section('Tier 5: Server-Side Write Gate — rejecting locations the filters cannot survive');

  // The portal's cascading dropdowns mean a browser never sends a bad state.
  // A direct API call does, and the public State -> District filters are built
  // from whatever facilities have stored — so an unrecognised value becomes a
  // phantom filter entry that no admin screen can remove.
  const badState = checkLocationInput('Jharkhandd', 'Ranchi');
  check(
    'Misspelt state is rejected rather than stored verbatim',
    badState.ok === false && badState.state === '' && /not a recognised/i.test(badState.message || ''),
    badState
  );

  const wrongDistrict = checkLocationInput('Bihar', 'Ranchi');
  check(
    'District belonging to another state is rejected',
    wrongDistrict.ok === false && /not a district of Bihar/i.test(wrongDistrict.message || ''),
    wrongDistrict
  );

  const orphanDistrict = checkLocationInput('', 'Ranchi');
  check(
    'District without a state is rejected (unreachable from the discovery flow)',
    orphanDistrict.ok === false && /requires the State/i.test(orphanDistrict.message || ''),
    orphanDistrict
  );

  const emptyPair = checkLocationInput('', '');
  check(
    'Empty location is allowed — the city-derived fallback still applies',
    emptyPair.ok === true && emptyPair.state === '' && emptyPair.district === '',
    emptyPair
  );

  const stateOnly = checkLocationInput('  jHaRkHaNd  ', '');
  check(
    'State alone is allowed and returned in canonical casing',
    stateOnly.ok === true && stateOnly.state === 'Jharkhand' && stateOnly.district === '',
    stateOnly
  );

  const messyPair = checkLocationInput('  jharkhand ', '  rAnChI  ');
  check(
    'Valid pair is normalised to canonical casing before storage',
    messyPair.ok === true && messyPair.state === 'Jharkhand' && messyPair.district === 'Ranchi',
    messyPair
  );

  // Injection-shaped input is not special-cased anywhere; it simply is not a
  // state, and the gate is what keeps it out of the stored filter vocabulary.
  const injection = checkLocationInput({ $ne: null }, 'Ranchi');
  check('Non-string state (NoSQL operator object) is rejected', injection.ok === false, injection);

  const xss = checkLocationInput('<script>alert(1)</script>', '');
  check('Script-tag state is rejected', xss.ok === false, xss);

  // The PUT handler validates the pair using stored values for whatever the
  // request omits, so a legacy record with no location can be fixed one field
  // at a time — but cannot be left half-set to something inconsistent.
  const legacyFixup = checkLocationInput('West Bengal', '');
  check(
    'Legacy record with no stored district accepts a state-only correction',
    legacyFixup.ok === true && legacyFixup.state === 'West Bengal',
    legacyFixup
  );

  const strandedDistrict = checkLocationInput('Bihar', 'Howrah');
  check(
    'Changing state while a stored district belongs elsewhere is refused',
    strandedDistrict.ok === false,
    strandedDistrict
  );

  // Summary Report
  report();
})();
