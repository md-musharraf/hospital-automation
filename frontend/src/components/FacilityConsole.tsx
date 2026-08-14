import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';
import { FacilitySessionContext, roomsFor } from './dashboard/facilitySession';
import useFacilityBranding from '../hooks/useFacilityBranding';

/**
 * One console per facility.
 *
 * A hospital signs in once and lands here. The owner view, reception, the
 * consultation cabins, the lab bench and the pharmacy counter are rooms inside
 * this one console — reached by switching rooms instead of by signing out and
 * back in with a different account.
 *
 * Which unit rooms exist is not a choice made here. It comes from the scopes the API
 * put in the token, which come from the facility's own module map: a pathology
 * lab sees a lab and a front desk, a district hospital sees all four. The server
 * enforces the identical list, so a room can never appear that its endpoints
 * would then refuse.
 *
 * The cabins are the one room that needs a second question — *which* doctor —
 * because a cabin's queue belongs to a person. That is answered by picking from
 * this facility's own roster, not by a password.
 */

const OwnerDashboard = React.lazy(() =>
  import('./OwnerDashboard').then((m) => ({ default: m.OwnerDashboard }))
);
const StaffDashboard = React.lazy(() => import('./StaffPortal').then((m) => ({ default: m.StaffDashboard })));
const DoctorDashboard = React.lazy(() =>
  import('./DoctorPortal').then((m) => ({ default: m.DoctorDashboard }))
);
const LabDashboard = React.lazy(() => import('./LabPortal').then((m) => ({ default: m.LabDashboard })));
const PharmacyDashboard = React.lazy(() =>
  import('./PharmacyPortal').then((m) => ({ default: m.PharmacyDashboard }))
);

const RoomFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4 min-h-[400px]">
    <Icon name="refresh" className="text-[48px] text-[var(--primary-color)] animate-spin" />
    <p className="text-sm font-bold text-[var(--text-secondary)]">Opening…</p>
  </div>
);

/**
 * Choose the cabin before the cabin opens.
 *
 * Deliberately a full screen rather than a dropdown in a corner. Everything the
 * doctor console then does — calling the next token, prescribing, ordering a
 * test — is attributed to whoever is picked here, and a patient's prescription
 * carrying the wrong doctor's name is not a small mistake. A screen that has to
 * be answered is worth the one extra click.
 */
function CabinPicker({ doctors, onPick, busy, error }) {
  if (!doctors.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <span className="w-14 h-14 rounded-2xl bg-[var(--border-color)]/30 text-[var(--text-secondary)] flex items-center justify-center mx-auto">
            <Icon name="stethoscope" className="text-[28px]" />
          </span>
          <h2 className="mt-4 text-[19px] font-black text-[var(--text-color)]">No doctors yet</h2>
          <p className="mt-1.5 text-[14px] font-semibold text-[var(--text-secondary)]">
            This facility runs an OPD but has no doctors on its roster. Ask the platform owner to add them
            from the owner console — they will appear here straight away.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-[22px] font-black text-[var(--text-color)]">Which cabin are you running?</h2>
        <p className="mt-1 text-[14px] font-semibold text-[var(--text-secondary)]">
          Everything you do next — calling tokens, prescribing, ordering tests — is recorded against this
          doctor.
        </p>

        {error && (
          <div className="mt-4 px-3.5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[13px] font-bold flex items-start gap-2">
            <Icon name="error" className="text-[18px] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {doctors.map((doctor) => (
            <button
              key={doctor.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(doctor)}
              className="text-left p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/50 hover:border-[var(--primary-color)] hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {doctor.photoUrl ? (
                  <img src={doctor.photoUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-xl bg-[var(--primary-color)]/12 text-[var(--primary-color)] flex items-center justify-center font-black text-[16px] shrink-0">
                    {(doctor.name || '?').replace(/^Dr\.?\s*/i, '').charAt(0)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-[15px] font-black text-[var(--text-color)] truncate">
                    {doctor.name}
                  </span>
                  <span className="block text-[12.5px] font-bold text-[var(--text-secondary)] truncate">
                    {doctor.department}
                    {doctor.currentRoom ? ` · ${doctor.currentRoom}` : ''}
                  </span>
                </span>
              </div>
              {doctor.availabilityStatus && doctor.availabilityStatus !== 'Available' && (
                <span className="mt-2.5 inline-block px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-600 dark:text-amber-400 text-[11px] font-black">
                  {doctor.availabilityStatus}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FacilityConsole({ token, facility, doctors, onLogout }) {
  const rooms = useMemo(() => roomsFor(facility?.scopes), [facility?.scopes]);
  const [activeRoom, setActiveRoom] = useState(() => (rooms[0] ? rooms[0].key : 'staff'));

  // The cabin, once one is taken: a token narrowed to one doctor plus that
  // doctor's record. Held here rather than in a room so switching to the lab and
  // back does not ask again mid-shift.
  const [cabin, setCabin] = useState(null);
  const [cabinBusy, setCabinBusy] = useState(false);
  const [cabinError, setCabinError] = useState('');
  const branding = useFacilityBranding(facility?.id);

  // If the facility's modules changed since sign-in, the room we are standing in
  // may no longer exist. Fall back rather than render a room the API will refuse.
  useEffect(() => {
    if (rooms.length && !rooms.some((r) => r.key === activeRoom)) {
      setActiveRoom(rooms[0].key);
    }
  }, [rooms, activeRoom]);

  /**
   * Take a cabin: exchange the facility token for one carrying this doctor.
   *
   * The doctor console makes its calls with an Authorization header and nothing
   * else, so putting the cabin in the token is what let it stay untouched.
   */
  const takeCabin = async (doctor) => {
    setCabinBusy(true);
    setCabinError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/facility/cabin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ doctorId: doctor.id })
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.message || 'Could not open that cabin');
      setCabin({ token: data.token, doctor: data.doctor });
    } catch (err) {
      setCabinError(
        err.name === 'TypeError' ? 'Could not reach the server. Check your connection.' : err.message
      );
    } finally {
      setCabinBusy(false);
    }
  };

  const session = useMemo(
    () => ({
      facility,
      rooms,
      activeRoom,
      onSwitchRoom: setActiveRoom,
      actingDoctor: cabin ? cabin.doctor : null,
      onLeaveCabin: () => setCabin(null)
    }),
    [facility, rooms, activeRoom, cabin]
  );

  // A facility whose token carries no rooms at all cannot happen through the
  // API — every facility gets a front desk — but a hand-edited token could, and
  // an empty console with no explanation is the worst possible answer.
  if (!rooms.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="max-w-md text-center">
          <h2 className="text-[19px] font-black text-[var(--text-color)]">Nothing switched on</h2>
          <p className="mt-1.5 text-[14px] font-semibold text-[var(--text-secondary)]">
            This facility has no units enabled, so there is nothing to open. Ask the platform owner to switch
            on at least one module.
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-5 px-4 py-2.5 rounded-xl bg-[var(--primary-color)] text-white font-black text-[14px]"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const roomUser = {
    ...facility,
    hospital: facility.id,
    name: facility.name
  };

  let room = null;
  if (activeRoom === 'owner') {
    room = <OwnerDashboard token={token} facility={roomUser} onLogout={onLogout} />;
  } else if (activeRoom === 'staff') {
    room = <StaffDashboard staffToken={token} staffUser={roomUser} onLogout={onLogout} />;
  } else if (activeRoom === 'lab') {
    room = <LabDashboard labToken={token} labUser={roomUser} onLogout={onLogout} />;
  } else if (activeRoom === 'pharmacy') {
    room = <PharmacyDashboard pharmacyToken={token} pharmacyUser={roomUser} onLogout={onLogout} />;
  } else if (activeRoom === 'doctor') {
    room = cabin ? (
      <DoctorDashboard
        // Remounting on cabin change matters: the doctor console holds a queue,
        // a part-written prescription and a lab order in local state, and
        // carrying any of that across a change of doctor would attach one
        // doctor's work to another.
        key={cabin.doctor.id}
        doctorToken={cabin.token}
        doctorUser={cabin.doctor}
        onLogout={onLogout}
      />
    ) : (
      <div style={branding.vars} className="flex-1 flex flex-col bg-[var(--bg-color)] overflow-hidden">
        <CabinPicker doctors={doctors} onPick={takeCabin} busy={cabinBusy} error={cabinError} />
      </div>
    );
  }

  return (
    <FacilitySessionContext.Provider value={session}>
      <Suspense fallback={<RoomFallback />}>{room}</Suspense>
    </FacilitySessionContext.Provider>
  );
}
