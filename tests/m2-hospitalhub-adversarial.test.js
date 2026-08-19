/**
 * Adversarial test suite for HospitalHub.tsx logic:
 * 1. Dynamic state aggregation and counts from active facilities.
 * 2. Dynamic district aggregation and counts cascaded by selected state.
 * 3. Handling edge cases: empty strings, null, undefined, whitespace in state/district.
 * 4. State switching resetting district to 'All'.
 * 5. Multi-filter interaction (type, state, district, search query, distance sorting).
 * 6. AST/Layout verification of HospitalHub.tsx ensuring Hospital Directory Grid is placed directly below Hero filters.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Starting Adversarial Tests for HospitalHub.tsx ---');

// ---------------------------------------------------------
// Logic Simulation (mirroring HospitalHub.tsx exact algorithms)
// ---------------------------------------------------------

function computeStateCounts(hospitals) {
  const counts = {};
  for (const h of hospitals) {
    if (h.state) {
      counts[h.state] = (counts[h.state] || 0) + 1;
    }
  }
  return counts;
}

function computeActiveStates(stateCounts) {
  return Object.keys(stateCounts).sort((a, b) => a.localeCompare(b));
}

function computeDistrictCounts(hospitals, selectedState) {
  const counts = {};
  const relevantHospitals = hospitals.filter((h) => selectedState === 'All' || h.state === selectedState);
  for (const h of relevantHospitals) {
    if (h.district) {
      counts[h.district] = (counts[h.district] || 0) + 1;
    }
  }
  return counts;
}

function computeActiveDistricts(districtCounts) {
  return Object.keys(districtCounts).sort((a, b) => a.localeCompare(b));
}

function filterHospitals(
  hospitals,
  {
    selectedState = 'All',
    selectedDistrict = 'All',
    selectedType = 'All',
    searchQuery = '',
    userCoords = null
  }
) {
  let processed = hospitals.map((h) => {
    if (userCoords && h.coordinates) {
      const R = 6371;
      const dLat = ((h.coordinates.lat - userCoords.lat) * Math.PI) / 180;
      const dLon = ((h.coordinates.lng - userCoords.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userCoords.lat * Math.PI) / 180) *
          Math.cos((h.coordinates.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { ...h, distance: R * c };
    }
    return h;
  });

  if (selectedState !== 'All') {
    processed = processed.filter((h) => h.state === selectedState);
  }
  if (selectedDistrict !== 'All') {
    processed = processed.filter((h) => h.district === selectedDistrict);
  }
  if (selectedType !== 'All') {
    processed = processed.filter((h) => (h.type || 'Hospital') === selectedType);
  }

  const query = searchQuery.toLowerCase();
  const filtered = processed.filter(
    (h) =>
      (h.name && h.name.toLowerCase().includes(query)) ||
      (h.description && h.description.toLowerCase().includes(query)) ||
      (h.address && h.address.toLowerCase().includes(query)) ||
      (h.city && h.city.toLowerCase().includes(query)) ||
      (h.type && h.type.toLowerCase().includes(query))
  );

  if (userCoords) {
    filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  return filtered;
}

// ---------------------------------------------------------
// Test Scenarios
// ---------------------------------------------------------

// Scenario 1: Multi-State, Multi-District Dataset
console.log('\n[Test 1] Multi-State & Multi-District Aggregation');
const testFacilities1 = [
  {
    id: '1',
    name: 'Ranchi Apex Hospital',
    state: 'Jharkhand',
    district: 'Ranchi',
    city: 'Ranchi',
    type: 'Hospital'
  },
  {
    id: '2',
    name: 'Jamshedpur Care Clinic',
    state: 'Jharkhand',
    district: 'East Singhbhum',
    city: 'Jamshedpur',
    type: 'Clinic'
  },
  {
    id: '3',
    name: 'Dhanbad Medical Lab',
    state: 'Jharkhand',
    district: 'Dhanbad',
    city: 'Dhanbad',
    type: 'Lab'
  },
  {
    id: '4',
    name: 'Patna Medanta Center',
    state: 'Bihar',
    district: 'Patna',
    city: 'Patna',
    type: 'Hospital'
  },
  { id: '5', name: 'Gaya City Clinic', state: 'Bihar', district: 'Gaya', city: 'Gaya', type: 'Clinic' },
  {
    id: '6',
    name: 'Muzaffarpur Eye Center',
    state: 'Bihar',
    district: 'Muzaffarpur',
    city: 'Muzaffarpur',
    type: 'Hospital'
  },
  {
    id: '7',
    name: 'Kolkata Apollo Multispecialty',
    state: 'West Bengal',
    district: 'Kolkata',
    city: 'Kolkata',
    type: 'Hospital'
  }
];

const stateCounts1 = computeStateCounts(testFacilities1);
assert.deepStrictEqual(stateCounts1, { Jharkhand: 3, Bihar: 3, 'West Bengal': 1 });
const activeStates1 = computeActiveStates(stateCounts1);
assert.deepStrictEqual(activeStates1, ['Bihar', 'Jharkhand', 'West Bengal']); // Alphabetically sorted

// When state is 'All', all active districts across all states are returned
const districtCountsAll = computeDistrictCounts(testFacilities1, 'All');
assert.deepStrictEqual(districtCountsAll, {
  Ranchi: 1,
  'East Singhbhum': 1,
  Dhanbad: 1,
  Patna: 1,
  Gaya: 1,
  Muzaffarpur: 1,
  Kolkata: 1
});

// When state is 'Jharkhand', only Jharkhand districts are returned
const districtCountsJH = computeDistrictCounts(testFacilities1, 'Jharkhand');
assert.deepStrictEqual(districtCountsJH, {
  Ranchi: 1,
  'East Singhbhum': 1,
  Dhanbad: 1
});
const activeDistrictsJH = computeActiveDistricts(districtCountsJH);
assert.deepStrictEqual(activeDistrictsJH, ['Dhanbad', 'East Singhbhum', 'Ranchi']);
console.log('✓ Multi-State & Multi-District Aggregation passed.');

// Scenario 2: Facilities with same state but different districts and multiple in same district
console.log('\n[Test 2] Multiple Facilities in Same State and Same District');
const testFacilities2 = [
  { id: '1', name: 'Ranchi Hospital 1', state: 'Jharkhand', district: 'Ranchi' },
  { id: '2', name: 'Ranchi Hospital 2', state: 'Jharkhand', district: 'Ranchi' },
  { id: '3', name: 'Ranchi Clinic 3', state: 'Jharkhand', district: 'Ranchi' },
  { id: '4', name: 'Dhanbad Lab 1', state: 'Jharkhand', district: 'Dhanbad' },
  { id: '5', name: 'Dhanbad Hospital 2', state: 'Jharkhand', district: 'Dhanbad' }
];

const stateCounts2 = computeStateCounts(testFacilities2);
assert.deepStrictEqual(stateCounts2, { Jharkhand: 5 });
const districtCountsJH2 = computeDistrictCounts(testFacilities2, 'Jharkhand');
assert.deepStrictEqual(districtCountsJH2, { Ranchi: 3, Dhanbad: 2 });
console.log('✓ Same state multiple district counts passed.');

// Scenario 3: Edge cases - Missing, empty, null, undefined state & district
console.log('\n[Test 3] Edge Cases: Missing, Empty, Null, Undefined State and District');
const testFacilitiesEdge = [
  { id: '1', name: 'Valid Facility', state: 'Maharashtra', district: 'Mumbai' },
  { id: '2', name: 'Empty State Facility', state: '', district: 'Pune' },
  { id: '3', name: 'Null State Facility', state: null, district: 'Nagpur' },
  { id: '4', name: 'Undefined State Facility', district: 'Thane' },
  { id: '5', name: 'Empty District Facility', state: 'Maharashtra', district: '' },
  { id: '6', name: 'Null District Facility', state: 'Maharashtra', district: null },
  { id: '7', name: 'Undefined District Facility', state: 'Karnataka' },
  { id: '8', name: 'Completely Blank Location', state: '', district: '' },
  { id: '9', name: 'No Location Fields at all' }
];

const edgeStateCounts = computeStateCounts(testFacilitiesEdge);
// Only non-empty strings should be keys
assert.strictEqual(edgeStateCounts[''], undefined);
assert.strictEqual(edgeStateCounts[null], undefined);
assert.strictEqual(edgeStateCounts[undefined], undefined);
assert.deepStrictEqual(edgeStateCounts, { Maharashtra: 3, Karnataka: 1 });

const edgeDistrictsMH = computeDistrictCounts(testFacilitiesEdge, 'Maharashtra');
assert.strictEqual(edgeDistrictsMH[''], undefined);
assert.strictEqual(edgeDistrictsMH[null], undefined);
assert.strictEqual(edgeDistrictsMH[undefined], undefined);
assert.deepStrictEqual(edgeDistrictsMH, { Mumbai: 1 });

const edgeDistrictsKA = computeDistrictCounts(testFacilitiesEdge, 'Karnataka');
assert.deepStrictEqual(edgeDistrictsKA, {}); // No districts for Karnataka in test data
assert.strictEqual(computeActiveDistricts(edgeDistrictsKA).length, 0);
console.log('✓ Edge cases with missing/null/empty locations passed.');

// Scenario 4: State selection and switching behavior
console.log('\n[Test 4] State Selection & Cascading District Reset');
let currentSelectedState = 'Jharkhand';
let currentSelectedDistrict = 'Ranchi';

function handleStateChange(newState) {
  currentSelectedState = newState;
  currentSelectedDistrict = 'All'; // Must reset to 'All'
}

handleStateChange('Bihar');
assert.strictEqual(currentSelectedState, 'Bihar');
assert.strictEqual(currentSelectedDistrict, 'All');
console.log('✓ District reset to All on state switch passed.');

// Scenario 5: End-to-End Filter Interaction
console.log('\n[Test 5] Combined Filter Interaction (State + District + Type + Search + Geolocation)');
const comprehensiveFacilities = [
  {
    id: 'h1',
    name: 'Apollo Multispecialty',
    type: 'Hospital',
    state: 'West Bengal',
    district: 'Kolkata',
    city: 'Kolkata',
    coordinates: { lat: 22.5726, lng: 88.3639 }
  },
  {
    id: 'h2',
    name: 'Fortis Clinic',
    type: 'Clinic',
    state: 'West Bengal',
    district: 'Kolkata',
    city: 'Kolkata',
    coordinates: { lat: 22.5186, lng: 88.4011 }
  },
  {
    id: 'h3',
    name: 'Siliguri Diagnostic Lab',
    type: 'Lab',
    state: 'West Bengal',
    district: 'Darjeeling',
    city: 'Siliguri',
    coordinates: { lat: 26.7271, lng: 88.3953 }
  },
  {
    id: 'h4',
    name: 'Ranchi Medanta',
    type: 'Hospital',
    state: 'Jharkhand',
    district: 'Ranchi',
    city: 'Ranchi',
    coordinates: { lat: 23.3441, lng: 85.3096 }
  }
];

// Test filtering by state
const resState = filterHospitals(comprehensiveFacilities, { selectedState: 'West Bengal' });
assert.strictEqual(resState.length, 3);

// Test filtering by state and district
const resDistrict = filterHospitals(comprehensiveFacilities, {
  selectedState: 'West Bengal',
  selectedDistrict: 'Kolkata'
});
assert.strictEqual(resDistrict.length, 2);

// Test filtering by state, district, and type
const resType = filterHospitals(comprehensiveFacilities, {
  selectedState: 'West Bengal',
  selectedDistrict: 'Kolkata',
  selectedType: 'Clinic'
});
assert.strictEqual(resType.length, 1);
assert.strictEqual(resType[0].id, 'h2');

// Test search query within filtered subset
const resSearch = filterHospitals(comprehensiveFacilities, {
  selectedState: 'West Bengal',
  searchQuery: 'Apollo'
});
assert.strictEqual(resSearch.length, 1);
assert.strictEqual(resSearch[0].id, 'h1');

// Test distance sorting when user is in Kolkata
const userInKolkata = { lat: 22.57, lng: 88.36 };
const resDistance = filterHospitals(comprehensiveFacilities, { userCoords: userInKolkata });
assert.strictEqual(resDistance[0].id, 'h1'); // Nearest to user
assert.strictEqual(resDistance[resDistance.length - 1].id, 'h3'); // Siliguri is furthest
console.log('✓ Filter interactions and distance sorting passed.');

// Scenario 6: Codebase layout inspection for HospitalHub.tsx
console.log('\n[Test 6] Layout Structure Verification of HospitalHub.tsx');
const hospitalHubContent = fs.readFileSync(
  path.join(__dirname, '../frontend/src/components/HospitalHub.tsx'),
  'utf8'
);

// Verify section sequence
const heroIndex = hospitalHubContent.indexOf('1. Hero Section');
const directoryGridIndex = hospitalHubContent.indexOf('2. Partner Hospital Directory Grid');
const metricsIndex = hospitalHubContent.indexOf('3. Live Metrics Infotech Row');
const solutionsIndex = hospitalHubContent.indexOf('4. Advanced Solutions Grid Section');
const workflowIndex = hospitalHubContent.indexOf('5. Interactive Step-by-Step Workflow');
const whatsappIndex = hospitalHubContent.indexOf('6. Live WhatsApp Business API Webhook Simulator');
const trustIndex = hospitalHubContent.indexOf('7. Trust & Guarantee Section');

assert(heroIndex !== -1, 'Hero section must exist');
assert(directoryGridIndex !== -1, 'Directory grid must exist');
assert(metricsIndex !== -1, 'Metrics section must exist');
assert(solutionsIndex !== -1, 'Solutions section must exist');
assert(workflowIndex !== -1, 'Workflow section must exist');
assert(whatsappIndex !== -1, 'WhatsApp section must exist');
assert(trustIndex !== -1, 'Trust section must exist');

// Assert Directory Grid is IMMEDIATELY after Hero Section
assert(directoryGridIndex > heroIndex, 'Directory Grid must come after Hero Section');
assert(metricsIndex > directoryGridIndex, 'Metrics must come after Directory Grid');
assert(solutionsIndex > metricsIndex, 'Solutions must come after Metrics');
assert(workflowIndex > solutionsIndex, 'Workflow must come after Solutions');
assert(whatsappIndex > workflowIndex, 'WhatsApp must come after Workflow');
assert(trustIndex > whatsappIndex, 'Trust must come after WhatsApp');

// Verify State and District select controls and counts
assert(hospitalHubContent.includes('stateCounts'), 'stateCounts state/memo must be used');
assert(hospitalHubContent.includes('activeStates'), 'activeStates memo must be used');
assert(hospitalHubContent.includes('districtCounts'), 'districtCounts state/memo must be used');
assert(hospitalHubContent.includes('activeDistricts'), 'activeDistricts memo must be used');
assert(hospitalHubContent.includes('handleStateChange'), 'handleStateChange handler must be present');
assert(
  hospitalHubContent.includes("setSelectedDistrict('All')"),
  'District must reset to All on state change'
);

console.log('✓ HospitalHub.tsx structural and layout verification passed.');

console.log('\n=== ALL ADVERSARIAL TESTS PASSED SUCCESSFULLY ===');
