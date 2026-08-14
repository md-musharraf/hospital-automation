import { createContext, useContext } from 'react';

/**
 * The one session everything staff-facing runs inside.
 *
 * The four dashboards each used to own their own login, their own token in
 * localStorage and their own idea of who was signed in. There is one facility
 * session now, and this context is how the shell they all render into learns
 * about it — without threading `rooms`, `scopes` and `onSwitchRoom` as props
 * through four unrelated portals that do not otherwise care.
 *
 * `null` outside a facility console, which is the normal state on the public
 * pages. Consumers must cope with that rather than assume a session.
 */
export const FacilitySessionContext = createContext(null);

export function useFacilitySession() {
  return useContext(FacilitySessionContext);
}

/**
 * The rooms a facility console can show, in the order they appear.
 *
 * Keys match the scopes the API issues (utils/facilityAuth.js), so a facility
 * that does not run a lab never sees a lab tab AND would be refused at the lab
 * endpoints — the screen and the server are reading the same list.
 */
export const ROOMS = [
  { key: 'staff', label: 'Reception', icon: 'support_agent', blurb: 'Walk-ins, queues, billing' },
  { key: 'doctor', label: 'Cabins', icon: 'stethoscope', blurb: 'Consultation and prescriptions' },
  { key: 'lab', label: 'Lab', icon: 'science', blurb: 'Samples and reports' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'local_pharmacy', blurb: 'Counter and stock' }
];

/**
 * The owner's room, which every facility has.
 *
 * Deliberately NOT in `ROOMS` and not a scope. The other four rooms map to a
 * scope because each one drives endpoints the server refuses without it; the
 * owner view only reads `/ops/overview` and `/ops/activity`, which any facility
 * token may already call. Inventing an `owner` scope would have meant a new
 * privilege level to enforce across every route guard in exchange for nothing —
 * the thing that was missing was a screen, not a permission.
 *
 * It leads because it is the only room that shows the whole building, and the
 * person opening the console at the start of the day wants the whole building
 * before they want any one desk.
 */
export const OWNER_ROOM = {
  key: 'owner',
  label: 'Owner',
  icon: 'insights',
  blurb: 'Every desk, today’s numbers, live activity'
};

/** The rooms this session may open, owner first, then ROOMS order. */
export function roomsFor(scopes) {
  const allowed = Array.isArray(scopes) ? scopes : [];
  const units = ROOMS.filter((room) => allowed.includes(room.key));
  // A token carrying no unit scopes at all is a broken token, and the console
  // says so. Handing it a lone owner room would dress that up as a working
  // session, so the owner room only appears alongside something to run.
  return units.length ? [OWNER_ROOM, ...units] : [];
}
