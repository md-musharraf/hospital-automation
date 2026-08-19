# Project: Hospital Management - Instant Facility Discovery, Dynamic Location Filters & Super Admin Cascading Controls

## Architecture
The system consists of three integrated layers:
1. **Shared Domain Layer (`@careeai/shared`)**: Canonical All-India dataset containing all 28 States and 8 Union Territories and their ~750+ official districts, alongside validation, normalization, and cascading helper functions. Aliased directly in frontend via Vite and compiled to CommonJS for backend consumption.
2. **Public Discovery Frontend (`HospitalHub.tsx`)**: Patient-facing facility discovery page with instant hospital cards placement directly below hero search/location controls, dynamically computing active-location dropdowns and badges (e.g. `Jharkhand (1)`) only from registered facilities.
3. **Super Admin Management Portal (`SuperAdminPortal.tsx`) & Backend (`backend/routes/auth.ts`, `backend/utils/locationHelper.ts`)**: Super Admin onboarding and facility editing interfaces with standardized cascading State -> District selectors, clean inputs for City, Address/Area, Pincode, Coordinates, and automated persistence to MongoDB/backend storage.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | All-India Location Dataset | Complete dataset of all 28 States & 8 UTs with ~750+ official districts | M1 | Survey (Explorer 3) & ORIGINAL_REQUEST R3 |
| 2 | Shared Location Helpers & Types | Helpers for `getAllStates`, `getDistrictsForState`, `isValidState`, `isValidDistrict`, `resolveLocation` | M1 | Survey (Explorer 3) & ORIGINAL_REQUEST R3 |
| 3 | Instant Hospital Results Placement | Move hospital directory grid directly beneath hero search and location filter controls on `/facilities` | M2 | Survey (Explorer 1) & ORIGINAL_REQUEST R1 |
| 4 | Dynamic Active-Location Dropdowns | Compute active states & districts with hospital counts (e.g. `Jharkhand (1)`) exclusively from registered facilities | M2 | Survey (Explorer 1) & ORIGINAL_REQUEST R2 |
| 5 | Instant Filter Updates & Zero Scrolling | Instant reaction on filter/search selection without scrolling past marketing sections | M2 | Survey (Explorer 1) & ORIGINAL_REQUEST R1 |
| 6 | Super Admin Onboarding Cascading Controls | Replace free-text state/district with standardized All-India State and cascading District selectors, plus City, Address, Pincode, Lat/Lng | M3 | Survey (Explorer 2) & ORIGINAL_REQUEST R3 |
| 7 | Super Admin Facility Profile Editor Support | Add `editState` and `editDistrict` hooks, cascading dropdowns, and include state/district in `handleUpdateHospital` PUT payload | M3 | Survey (Explorer 2) & ORIGINAL_REQUEST R3 |
| 8 | Legacy Pre-selection Fallback | Intelligent auto-resolution of state/district for legacy records opening in edit modal | M3 | Survey (Explorer 2) & ORIGINAL_REQUEST R3 |
| 9 | Location Persistence & Instant Platform Sync | Storing canonical state, district, city, pincode, coordinates and propagating updates to public discovery | M3 | Survey (Explorer 2) & ORIGINAL_REQUEST R3 |
| 10 | Automated Location Test Suite | End-to-end tests for location dataset integrity, cascading, active filters, fallbacks, and backend API routes | M4 | Survey (Explorer 3) & ORIGINAL_REQUEST AC |
| 11 | Full Suite Validation & Build | Verify zero regressions on `npm test`, `npm run typecheck`, and `npm run build` | M4 | ORIGINAL_REQUEST AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | All-India Location Dataset & Shared Utilities | `shared/src/locations.ts`, `shared/src/index.ts`, `shared/package.json` | none | DONE |
| 2 | Dynamic Active-Location Filtering & HospitalHub Layout | `frontend/src/components/HospitalHub.tsx` | M1 | DONE |
| 3 | Super Admin Portal Cascading Controls & Onboarding | `frontend/src/components/SuperAdminPortal.tsx`, `backend/routes/auth.ts`, `backend/utils/locationHelper.ts` | M1 | DONE |
| 4 | Comprehensive E2E Testing & System Verification | `tests/locations.test.js`, `package.json`, full build/test/typecheck | M1, M2, M3 | DONE |

## Interface Contracts
### `@careeai/shared` ↔ Frontend & Backend
```typescript
export interface StateInfo {
  name: string;
  type: 'state' | 'ut';
  districts: readonly string[];
}

export const INDIA_LOCATIONS: Record<string, StateInfo>;
export const INDIA_STATES: readonly string[];

export function getAllStates(): string[];
export function getDistrictsForState(state: string): string[];
export function isValidState(state: string): boolean;
export function isValidDistrict(state: string, district: string): boolean;
export function normalizeLocation(stateRaw?: string, districtRaw?: string): { state: string; district: string };
export function getActiveLocations<T extends { state?: string; district?: string }>(facilities: T[]): {
  activeStates: string[];
  activeDistricts: string[];
  stateCounts: Record<string, number>;
  districtCounts: Record<string, number>;
};
```

### `SuperAdminPortal.tsx` ↔ Backend `auth.ts`
- **POST `/api/v1/auth/super-admin/register-hospital`**: Payload includes canonical `{ state: string, district: string, city: string, address: string, pincode?: string, coordinates: { lat: number, lng: number } }`.
- **PUT `/api/v1/auth/super-admin/hospital/:id`**: Payload includes canonical `{ state: string, district: string, city: string, address: string, pincode?: string, coordinates: { lat: number, lng: number } }`.

### `GET /api/v1/chat/hospitals` ↔ `HospitalHub.tsx`
- Response items include canonical `{ id, name, slug, type, city, state, district, address, phone, coordinates: { lat, lng }, doctorCount, ... }`.

## Code Layout
- `shared/src/locations.ts`: All-India dataset (28 States, 8 UTs, ~750+ districts) and validation/cascading utilities.
- `shared/src/index.ts`: Export location helpers and constants.
- `frontend/src/components/HospitalHub.tsx`: Public discovery hub with direct grid placement below hero filters and dynamic active-location counts.
- `frontend/src/components/SuperAdminPortal.tsx`: Super Admin onboarding and edit forms with cascading State -> District selectors.
- `backend/utils/locationHelper.ts`: Backward compatibility resolver utilizing shared location utilities.
- `tests/locations.test.js`: Automated assertions for dataset integrity, cascading, active aggregation, and API persistence.
