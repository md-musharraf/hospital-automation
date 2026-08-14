/**
 * Every role's dashboard, described as data.
 *
 * The four staff-facing portals grew separately, so each one invented its own
 * sidebar, its own header and its own idea of what a nav item looks like. A
 * receptionist who had learned one of them had learned nothing about the next.
 * This file is the fix: one description per role, one shell that renders them
 * all (`DashboardShell`), so the doctor console and the lab bench differ only
 * in the work they do — never in how you get around them.
 *
 * Adding a screen is adding an entry here. That is deliberate: the moment a nav
 * item is hand-written JSX again, the five portals start drifting apart.
 */

/**
 * `key`   — matches the portal's own active-tab state.
 * `label` — the shortest word that is still unambiguous. These are read
 *           hundreds of times a shift; nobody needs "Special Reception Desk"
 *           spelled out every time.
 * `icon`  — Material Symbols name.
 */
export const ROLE_NAV = {
  owner: {
    title: 'Owner Dashboard',
    home: 'today',
    items: [
      { key: 'today', label: 'Today', icon: 'insights' },
      { key: 'desks', label: 'Departments', icon: 'account_tree' },
      { key: 'activity', label: 'Activity', icon: 'history' }
    ]
  },
  doctor: {
    title: 'Doctor Console',
    home: 'cabin',
    items: [
      { key: 'cabin', label: 'My Cabin', icon: 'stethoscope' },
      { key: 'queue', label: 'Queue', icon: 'queue' },
      { key: 'reports', label: 'Lab Reports', icon: 'lab_profile' },
      { key: 'history', label: 'Patients', icon: 'group' }
    ]
  },
  staff: {
    title: 'Reception',
    home: 'reception',
    items: [
      { key: 'reception', label: 'Arrivals', icon: 'support_agent' },
      { key: 'monitor', label: 'Queues', icon: 'queue' },
      { key: 'billing', label: 'Billing', icon: 'payments' },
      { key: 'patients', label: 'Patients', icon: 'group' },
      { key: 'reminders', label: 'Follow-ups', icon: 'event_repeat' },
      { key: 'dashboard', label: 'Overview', icon: 'dashboard' }
    ]
  },
  lab: {
    title: 'Lab Bench',
    home: 'orders',
    items: [
      { key: 'orders', label: 'Orders', icon: 'science' },
      { key: 'results', label: 'Results', icon: 'lab_profile' },
      { key: 'history', label: 'Completed', icon: 'inventory_2' }
    ]
  },
  pharmacy: {
    title: 'Pharmacy',
    home: 'counter',
    items: [
      { key: 'counter', label: 'Counter', icon: 'local_pharmacy' },
      { key: 'stock', label: 'Stock', icon: 'inventory_2' },
      { key: 'refills', label: 'Refills', icon: 'autorenew' }
    ]
  }
};

/**
 * What each role does most often, offered as one click from anywhere.
 *
 * Deliberately short lists. A "quick action" panel with twelve buttons is a
 * second navigation menu wearing a disguise, and costs more reading than the
 * click it saves.
 */
export const ROLE_ACTIONS = {
  doctor: [
    { id: 'call-next', label: 'Call next', icon: 'group', primary: true },
    { id: 'prescribe', label: 'Prescribe', icon: 'prescriptions' },
    { id: 'order-lab', label: 'Order test', icon: 'science' }
  ],
  staff: [
    { id: 'walk-in', label: 'Walk-in', icon: 'person_add', primary: true },
    { id: 'bill', label: 'New bill', icon: 'receipt_long' },
    { id: 'find', label: 'Find patient', icon: 'search' }
  ],
  lab: [
    { id: 'collect', label: 'Collect sample', icon: 'colorize', primary: true },
    { id: 'upload', label: 'Upload result', icon: 'upload_file' }
  ],
  pharmacy: [
    { id: 'dispense', label: 'Dispense', icon: 'pill', primary: true },
    { id: 'restock', label: 'Add stock', icon: 'add_box' }
  ]
};

/** The nav description for a role, falling back to something renderable. */
export function navFor(role) {
  return ROLE_NAV[role] || { title: 'Dashboard', home: '', items: [] };
}
