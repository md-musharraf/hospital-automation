/**
 * Canonical All-India Location Dataset & Shared Validation Utilities.
 * ---------------------------------------------------------------------------
 * Provides the single source of truth for all 28 Indian States, 8 Union
 * Territories, and ~750+ official districts.
 *
 * Consumed by:
 * - Frontend (`@careeai/shared`): Cascading dropdowns, dynamic active filters.
 * - Backend (`require('@careeai/shared')`): Location validation and normalization.
 */
export type LocationType = 'state' | 'ut';
export interface StateInfo {
    name: string;
    type: LocationType;
    districts: readonly string[];
}
export declare const INDIA_LOCATIONS: Record<string, StateInfo>;
/**
 * Pre-sorted list of all 36 Indian States and Union Territories.
 */
export declare const INDIA_STATES: readonly string[];
/**
 * Returns all 36 Indian States and Union Territories in alphabetical order.
 */
export declare function getAllStates(): string[];
/**
 * Returns all official districts for a given state or Union Territory.
 * Performs case-insensitive matching on state name.
 * Returns empty array if state is invalid, empty, or unknown.
 */
export declare function getDistrictsForState(state: string | null | undefined): string[];
/**
 * Validates if the given string matches any of the 28 States or 8 UTs (case-insensitive).
 */
export declare function isValidState(state: string | null | undefined): boolean;
/**
 * Validates if the given district belongs to the specified state (case-insensitive).
 */
export declare function isValidDistrict(state: string | null | undefined, district: string | null | undefined): boolean;
/**
 * Normalizes state and district names to their official canonical casing.
 * If unrecognized, returns trimmed raw values.
 */
export declare function normalizeLocation(state?: string | null, district?: string | null): {
    state: string;
    district: string;
};
/**
 * Active Location Aggregator structures and helper.
 */
export interface ActiveLocationCount {
    name: string;
    count: number;
}
export interface ActiveLocationsResult {
    states: ActiveLocationCount[];
    districts: Record<string, ActiveLocationCount[]>;
}
/**
 * Aggregates active states and districts with facility counts from a list of hospitals.
 * Only includes states and districts that have >= 1 facility registered.
 */
export declare function getActiveLocations(hospitals: Array<{
    state?: string;
    district?: string;
    city?: string;
}>): ActiveLocationsResult;
//# sourceMappingURL=locations.d.ts.map