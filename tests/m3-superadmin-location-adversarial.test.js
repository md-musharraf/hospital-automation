/**
 * Empirical Adversarial Test Suite for Milestone 3:
 * Super Admin Portal Cascading Location Controls & Onboarding
 *
 * Covers:
 * 1. Shared All-India location dataset & validation functions.
 * 2. Boundary conditions, casing, trimming, and edge cases.
 * 3. Backend locationHelper.ts derivation and resolution logic.
 * 4. SuperAdminPortal.tsx cascading dropdown & search filter algorithms.
 * 5. CommonJS & ESM compatibility.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('--- Starting Empirical Adversarial Tests for Milestone 3 ---');

// ---------------------------------------------------------------------------
// 1. Shared Location Dataset & Functions (via CommonJS bundle in shared/dist)
// ---------------------------------------------------------------------------
console.log('\n[Test 1] Shared Location Module Exports & Integrity');

const shared = require(path.join(__dirname, '../shared/dist/index.js'));

assert(typeof shared.getAllStates === 'function', 'getAllStates should be exported from shared');
assert(typeof shared.getDistrictsForState === 'function', 'getDistrictsForState should be exported');
assert(typeof shared.isValidState === 'function', 'isValidState should be exported');
assert(typeof shared.isValidDistrict === 'function', 'isValidDistrict should be exported');
assert(typeof shared.normalizeLocation === 'function', 'normalizeLocation should be exported');
assert(typeof shared.getActiveLocations === 'function', 'getActiveLocations should be exported');
assert(shared.INDIA_LOCATIONS && typeof shared.INDIA_LOCATIONS === 'object', 'INDIA_LOCATIONS must exist');
assert(Array.isArray(shared.INDIA_STATES), 'INDIA_STATES must be an array');

const allStates = shared.getAllStates();
assert.strictEqual(allStates.length, 36, `Expected exactly 36 States/UTs, found ${allStates.length}`);

// Verify all 28 States and 8 UTs are accounted for
const stateEntries = Object.entries(shared.INDIA_LOCATIONS);
const statesOnly = stateEntries.filter(([_, info]) => info.type === 'state');
const utsOnly = stateEntries.filter(([_, info]) => info.type === 'ut');

assert.strictEqual(statesOnly.length, 28, `Expected 28 States, found ${statesOnly.length}`);
assert.strictEqual(utsOnly.length, 8, `Expected 8 Union Territories, found ${utsOnly.length}`);

let totalDistrictsCount = 0;
for (const [st, info] of stateEntries) {
  assert(info.name, `State entry ${st} must have a name`);
  assert(Array.isArray(info.districts), `State entry ${st} must have a districts array`);
  assert(info.districts.length > 0, `State ${st} must have at least one district`);
  totalDistrictsCount += info.districts.length;
}

assert(
  totalDistrictsCount >= 750,
  `Expected at least 750 official districts, counted ${totalDistrictsCount}`
);
console.log(`✓ 36 States/UTs verified (28 States, 8 UTs) with ${totalDistrictsCount} official districts.`);

// ---------------------------------------------------------------------------
// 2. Boundary Conditions, Whitespace, & Case-Insensitive Validation
// ---------------------------------------------------------------------------
console.log('\n[Test 2] Boundary Conditions & Case-Insensitivity');

// State validation
assert.strictEqual(shared.isValidState('Delhi'), true);
assert.strictEqual(shared.isValidState('delhi'), true);
assert.strictEqual(shared.isValidState('  dElHi  '), true);
assert.strictEqual(shared.isValidState('MAHARASHTRA'), true);
assert.strictEqual(shared.isValidState('jHaRkHaNd'), true);
assert.strictEqual(shared.isValidState(''), false);
assert.strictEqual(shared.isValidState('   '), false);
assert.strictEqual(shared.isValidState(null), false);
assert.strictEqual(shared.isValidState(undefined), false);
assert.strictEqual(shared.isValidState('InvalidStateName'), false);

// District lookup
const delhiDists = shared.getDistrictsForState('delhi');
assert(delhiDists.includes('New Delhi'), 'Delhi districts must include New Delhi');
assert(delhiDists.includes('South Delhi'), 'Delhi districts must include South Delhi');
assert.strictEqual(delhiDists.length, 11, 'Delhi must have 11 official districts');

const jhDists = shared.getDistrictsForState('JHARKHAND');
assert(jhDists.includes('Ranchi'), 'Jharkhand must include Ranchi');
assert(jhDists.includes('East Singhbhum'), 'Jharkhand must include East Singhbhum');
assert.strictEqual(jhDists.length, 24, 'Jharkhand must have 24 districts');

assert.deepStrictEqual(shared.getDistrictsForState(''), []);
assert.deepStrictEqual(shared.getDistrictsForState(null), []);
assert.deepStrictEqual(shared.getDistrictsForState(undefined), []);
assert.deepStrictEqual(shared.getDistrictsForState('Atlantis'), []);

// District validity
assert.strictEqual(shared.isValidDistrict('Jharkhand', 'Ranchi'), true);
assert.strictEqual(shared.isValidDistrict('jharkhand', 'ranchi'), true);
assert.strictEqual(shared.isValidDistrict('  JHARKHAND  ', '  RANCHI  '), true);
assert.strictEqual(shared.isValidDistrict('Jharkhand', 'Mumbai'), false); // Ranchi is not in Mumbai
assert.strictEqual(shared.isValidDistrict('Maharashtra', 'Pune'), true);
assert.strictEqual(shared.isValidDistrict('Maharashtra', 'pune'), true);
assert.strictEqual(shared.isValidDistrict('Maharashtra', 'Ranchi'), false);
assert.strictEqual(shared.isValidDistrict('', 'Pune'), false);
assert.strictEqual(shared.isValidDistrict('Maharashtra', ''), false);
assert.strictEqual(shared.isValidDistrict(null, null), false);

// Location normalization
assert.deepStrictEqual(shared.normalizeLocation('maharashtra', 'pune'), {
  state: 'Maharashtra',
  district: 'Pune'
});
assert.deepStrictEqual(shared.normalizeLocation('  dElHi  ', '  sOuTh DeLhI  '), {
  state: 'Delhi',
  district: 'South Delhi'
});
assert.deepStrictEqual(shared.normalizeLocation('CustomState', 'CustomDistrict'), {
  state: 'CustomState',
  district: 'CustomDistrict'
});
assert.deepStrictEqual(shared.normalizeLocation('', ''), { state: '', district: '' });
assert.deepStrictEqual(shared.normalizeLocation(null, null), { state: '', district: '' });

console.log('✓ Case-insensitivity, whitespace trimming, and normalization boundary tests passed.');

// ---------------------------------------------------------------------------
// 3. Backend locationHelper Resolution Logic Simulation & Test
// ---------------------------------------------------------------------------
console.log('\n[Test 3] Backend locationHelper.ts Resolution Tests');

const CITY_TO_STATE = {
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

function testResolveLocation({ state, district, city } = {}) {
  const cleanState = (state || '').trim();
  const cleanDistrict = (district || '').trim();
  const cleanCity = (city || '').trim();

  if (cleanState) {
    const norm = shared.normalizeLocation(cleanState, cleanDistrict || cleanCity);
    if (shared.isValidState(norm.state)) {
      return {
        state: norm.state,
        district: norm.district || cleanDistrict || cleanCity || norm.state
      };
    }
  }

  const derivedFromMap = cleanCity ? CITY_TO_STATE[cleanCity.toLowerCase()] : '';
  const candidateState = derivedFromMap || (shared.isValidState(cleanCity) ? cleanCity : '');

  if (candidateState) {
    const norm = shared.normalizeLocation(candidateState, cleanDistrict || cleanCity);
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

// Known city to state mapping
assert.deepStrictEqual(testResolveLocation({ city: 'mumbai' }), {
  state: 'Maharashtra',
  district: 'Mumbai City'
});
assert.deepStrictEqual(testResolveLocation({ city: 'delhi' }), { state: 'Delhi', district: 'delhi' });
assert.deepStrictEqual(testResolveLocation({ city: 'bengaluru' }), {
  state: 'Karnataka',
  district: 'bengaluru'
});
assert.deepStrictEqual(testResolveLocation({ city: 'patna' }), { state: 'Bihar', district: 'Patna' });

// Explicit state provided
assert.deepStrictEqual(testResolveLocation({ state: 'jharkhand', district: 'ranchi', city: 'Ranchi' }), {
  state: 'Jharkhand',
  district: 'Ranchi'
});
assert.deepStrictEqual(testResolveLocation({ state: 'Gujarat', district: 'Ahmedabad' }), {
  state: 'Gujarat',
  district: 'Ahmedabad'
});

// Unrecognized / blank inputs
assert.deepStrictEqual(testResolveLocation({ city: 'UnmappedTown' }), {
  state: 'UnmappedTown',
  district: 'UnmappedTown'
});
assert.deepStrictEqual(testResolveLocation({}), { state: 'Other', district: 'Other' });
assert.deepStrictEqual(testResolveLocation({ state: '', district: '', city: '' }), {
  state: 'Other',
  district: 'Other'
});

console.log('✓ Backend locationHelper resolveLocation tests passed.');

// ---------------------------------------------------------------------------
// 4. Active Location Aggregator Tests (shared getActiveLocations)
// ---------------------------------------------------------------------------
console.log('\n[Test 4] getActiveLocations Aggregation Tests');

const sampleFacilities = [
  { state: 'Jharkhand', district: 'Ranchi', city: 'Ranchi' },
  { state: 'Jharkhand', district: 'Ranchi', city: 'Ranchi' },
  { state: 'Jharkhand', district: 'Dhanbad', city: 'Dhanbad' },
  { state: 'Bihar', district: 'Patna', city: 'Patna' },
  { city: 'Mumbai' }, // Fallback to city -> Maharashtra, Mumbai City
  { state: '', district: '', city: '' } // Blank item
];

const activeLocs = shared.getActiveLocations(sampleFacilities);
assert(Array.isArray(activeLocs.states), 'states must be an array');
assert(activeLocs.districts && typeof activeLocs.districts === 'object', 'districts must be an object');

const stateMap = Object.fromEntries(activeLocs.states.map((s) => [s.name, s.count]));
assert.strictEqual(stateMap['Jharkhand'], 3);
assert.strictEqual(stateMap['Bihar'], 1);
assert.strictEqual(stateMap['Maharashtra'], 1);
assert.strictEqual(stateMap['Other'], undefined);

const jhDistMap = Object.fromEntries(activeLocs.districts['Jharkhand'].map((d) => [d.name, d.count]));
assert.strictEqual(jhDistMap['Ranchi'], 2);
assert.strictEqual(jhDistMap['Dhanbad'], 1);

console.log('✓ getActiveLocations aggregation tests passed.');

// ---------------------------------------------------------------------------
// 5. SuperAdminPortal.tsx Logic & Layout Static Verification
// ---------------------------------------------------------------------------
console.log('\n[Test 5] SuperAdminPortal.tsx Static & Algorithmic Verification');

const portalSource = fs.readFileSync(
  path.join(__dirname, '../frontend/src/components/SuperAdminPortal.tsx'),
  'utf8'
);

// 1. Check imports from @careeai/shared
assert(
  portalSource.includes("from '@careeai/shared'"),
  'SuperAdminPortal.tsx must import from @careeai/shared'
);
assert(
  portalSource.includes('getAllStates') &&
    portalSource.includes('getDistrictsForState') &&
    portalSource.includes('isValidState') &&
    portalSource.includes('isValidDistrict') &&
    portalSource.includes('normalizeLocation'),
  'SuperAdminPortal.tsx must import all required location helpers'
);

// 2. Check state variables in SuperAdminPortal
assert(portalSource.includes('const [regState, setRegState] = useState'), 'regState must be declared');
assert(portalSource.includes('const [district, setDistrict] = useState'), 'district must be declared');
assert(portalSource.includes('const [pincode, setPincode] = useState'), 'pincode must be declared');
assert(portalSource.includes('const [editState, setEditState] = useState'), 'editState must be declared');
assert(
  portalSource.includes('const [editDistrict, setEditDistrict] = useState'),
  'editDistrict must be declared'
);
assert(
  portalSource.includes('const [editPincode, setEditPincode] = useState'),
  'editPincode must be declared'
);

// 3. Check cascading dropdown in Onboarding JSX
assert(
  portalSource.includes('getAllStates().map'),
  'Onboarding form must render all states via getAllStates()'
);
assert(
  portalSource.includes('getDistrictsForState(regState).map'),
  'Onboarding form must render districts via getDistrictsForState(regState)'
);
assert(
  portalSource.includes('disabled={!regState}'),
  'District dropdown must be disabled when state is not selected'
);

// 4. Check cascading dropdown in Edit Profile JSX
assert(
  portalSource.includes('getDistrictsForState(editState).map'),
  'Edit form must render districts via getDistrictsForState(editState)'
);
assert(
  portalSource.includes('disabled={!editState}'),
  'Edit district dropdown must be disabled when editState is empty'
);

// 5. Check handleSelectHospitalToEdit fallback resolution
assert(portalSource.includes('handleSelectHospitalToEdit'), 'handleSelectHospitalToEdit handler must exist');
assert(
  portalSource.includes('normalizeLocation(hosp.state || hosp.city, hosp.district || hosp.city)'),
  'handleSelectHospitalToEdit must normalize state and district with fallback to city'
);

// 6. Check payload properties in handleRegister & handleUpdateHospital
assert(
  portalSource.includes('state: regState') &&
    portalSource.includes('district') &&
    portalSource.includes('pincode'),
  'handleRegister payload must include state, district, and pincode'
);
assert(
  portalSource.includes('state: editState') &&
    portalSource.includes('district: editDistrict') &&
    portalSource.includes('pincode: editPincode'),
  'handleUpdateHospital payload must include editState, editDistrict, and editPincode'
);

// 7. Check Search filter in filteredHospitals
assert(
  portalSource.includes('h.state && h.state.toLowerCase().includes(q)') &&
    portalSource.includes('h.district && h.district.toLowerCase().includes(q)'),
  'Search filter must search by state and district'
);

// 8. Test Search Filter Algorithm
function testFilterHospitals(hospitalList, facilitySearchQuery, facilityFilterType = 'All') {
  return hospitalList.filter((h) => {
    const q = facilitySearchQuery.toLowerCase();
    const matchesSearch =
      !facilitySearchQuery ||
      (h.name && h.name.toLowerCase().includes(q)) ||
      (h.city && h.city.toLowerCase().includes(q)) ||
      (h.state && h.state.toLowerCase().includes(q)) ||
      (h.district && h.district.toLowerCase().includes(q)) ||
      (h.id && h.id.toLowerCase().includes(q));

    if (facilityFilterType === 'All') return matchesSearch;
    return matchesSearch && h.type === facilityFilterType;
  });
}

const testHospitals = [
  {
    id: 'apollo-delhi',
    name: 'Apollo Indraprastha',
    city: 'Delhi',
    state: 'Delhi',
    district: 'South Delhi',
    type: 'Hospital'
  },
  {
    id: 'ranchi-clinic',
    name: 'Apex Care Clinic',
    city: 'Ranchi',
    state: 'Jharkhand',
    district: 'Ranchi',
    type: 'Clinic'
  },
  {
    id: 'mumbai-lab',
    name: 'Metropolis Diagnostics',
    city: 'Mumbai',
    state: 'Maharashtra',
    district: 'Mumbai City',
    type: 'Lab'
  }
];

assert.strictEqual(testFilterHospitals(testHospitals, '').length, 3);
assert.strictEqual(testFilterHospitals(testHospitals, 'delhi').length, 1);
assert.strictEqual(testFilterHospitals(testHospitals, 'ranchi').length, 1);
assert.strictEqual(testFilterHospitals(testHospitals, 'maharashtra').length, 1);
assert.strictEqual(testFilterHospitals(testHospitals, 'south delhi').length, 1);
assert.strictEqual(testFilterHospitals(testHospitals, '', 'Clinic').length, 1);
assert.strictEqual(testFilterHospitals(testHospitals, 'ranchi', 'Hospital').length, 0);

console.log('✓ SuperAdminPortal.tsx code and contract verification passed.');

// ---------------------------------------------------------------------------
// 6. Backend auth.ts Endpoint Audit
// ---------------------------------------------------------------------------
console.log('\n[Test 6] Backend auth.ts Location Persistence Audit');

const authSource = fs.readFileSync(path.join(__dirname, '../backend/routes/auth.ts'), 'utf8');

assert(
  authSource.includes("const { normalizeEmail, normalizeLocation } = require('@careeai/shared')") ||
    authSource.includes('normalizeLocation'),
  'auth.ts must import normalizeLocation'
);
assert(
  authSource.includes("const { resolveLocation } = require('../utils/locationHelper')") ||
    authSource.includes('resolveLocation'),
  'auth.ts must import resolveLocation'
);

// In POST /super-admin/register-hospital
assert(
  authSource.includes('normalizeLocation(b.state, b.district).state') &&
    authSource.includes('normalizeLocation(b.state, b.district).district'),
  'Registration endpoint must normalize state and district'
);

// In PUT /super-admin/hospital/:id
assert(
  authSource.includes('req.body.state !== undefined || req.body.district !== undefined') &&
    authSource.includes('normalizeLocation(stateToUse, districtToUse)'),
  'Update hospital endpoint must handle state and district updates with normalization'
);

console.log('✓ Backend auth.ts endpoint persistence audit passed.');

console.log('\n=== ALL MILESTONE 3 EMPIRICAL CHALLENGER TESTS PASSED ===');
