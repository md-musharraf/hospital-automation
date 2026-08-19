# E2E Test Infra: Hospital Management Location Discovery & Super Admin Controls

## Test Philosophy
- Opaque-box, requirement-driven testing ensuring patient discovery and admin onboarding meet all functional and edge-case contracts.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + System Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | All-India 28 States & 8 UTs Dataset | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 2 | Cascading State -> District Resolution | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 3 | Instant Hospital Results Placement | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Dynamic Active-Location Aggregation & Badges | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | Super Admin Onboarding Location Controls | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 6 | Super Admin Edit Facility Profile Cascading & PUT | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 7 | Legacy Hospital Location Fallback & Resolution | ORIGINAL_REQUEST §R2, §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Custom zero-dependency test runner in `tests/helpers/assert.js` executed via `node tests/locations.test.js`.
- Pass/Fail semantics: Exit code 0 on success, non-zero exit code with diagnostic logs on assertion failure.
- Directory Layout:
  - `tests/locations.test.js`: Core location dataset, cascading, filter aggregation, and route persistence tests.
  - Root `package.json`: Integrated in `npm test` script.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Super Admin onboards a new facility in Jharkhand (Ranchi) -> verify instant presence in backend DB and active count appearance in public discovery | F1, F2, F5, F4 | High |
| 2 | Super Admin updates an existing legacy Delhi facility to Maharashtra (Pune) -> verify state/district persisted in DB and public filters update counts | F2, F6, F7, F4 | High |
| 3 | Patient on `/facilities` selects active state (e.g. Maharashtra) -> district dropdown immediately narrows to active districts, hospital cards immediately reflect | F3, F4, F2 | Medium |
| 4 | Edge case: Unknown/empty state query handling -> graceful fallback without crash | F1, F2, F7 | Low |
| 5 | Complete dataset validation -> 36 administrative divisions, >750 districts, zero duplicate state/district pairs | F1, F2 | Medium |
