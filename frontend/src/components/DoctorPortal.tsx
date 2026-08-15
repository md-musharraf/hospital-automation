import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';
import InternalChatBox from './InternalChatBox';
import DoctorSchedulePanel from './DoctorSchedulePanel';
import useFacilitySocket from '../hooks/useFacilitySocket';
import useLiveRefresh from '../hooks/useLiveRefresh';
import HelpPanel from './HelpPanel';
import useFacilityFromUrl from '../hooks/useFacilityFromUrl';
import useFacilityBranding from '../hooks/useFacilityBranding';

export function DoctorDashboard({ doctorToken, doctorUser, onLogout }) {
  const branding = useFacilityBranding(doctorUser?.hospital);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState(doctorUser?.availabilityStatus || 'Available');
  const [dailyLimit, setDailyLimit] = useState(doctorUser?.dailyTokenLimit ?? 0);
  const [limitSaved, setLimitSaved] = useState(false);
  const [refills, setRefills] = useState([]);

  // Complete Checkup Modal states
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [revisitSelection, setRevisitSelection] = useState('none');
  const [customRevisitDays, setCustomRevisitDays] = useState('30');

  // Custom prescription and lab integrations
  const [medicines, setMedicines] = useState([
    { name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }
  ]);
  const [advice, setAdvice] = useState('');
  const [history, setHistory] = useState([]);
  const [labTestName, setLabTestName] = useState('Complete Blood Count (CBC)');
  const [customLabTest, setCustomLabTest] = useState('');
  const [labUrgency, setLabUrgency] = useState('Routine');
  const [labResults, setLabResults] = useState([]);
  const [docStats, setDocStats] = useState(null);
  const [stockInfo, setStockInfo] = useState([]);
  const [resultAlert, setResultAlert] = useState('');

  // Facility + own-doctor rooms, with an automatic re-register on reconnect.
  useFacilitySocket('doctor', doctorUser?.hospital || 'general-hospital', doctorUser?.id || doctorUser?._id);

  // Fetch patient visit history when token changes
  useEffect(() => {
    if (queue?.currentToken?.patient?._id) {
      const fetchHistory = async () => {
        try {
          const res = await fetch(
            `${BACKEND_URL}/api/v1/doctor/patients/${queue.currentToken.patient._id}/history`,
            {
              headers: { Authorization: `Bearer ${doctorToken}` }
            }
          );
          const data = await res.json();
          if (res.ok) {
            setHistory(data);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchHistory();
    } else {
      setHistory([]);
    }
  }, [queue?.currentToken?.patient?._id, doctorToken]);

  const loadQueue = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/my-queue`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.status === 401 || res.status === 403) {
        onLogout();
        return;
      }
      const data = await res.json();
      if (data && !data.message) {
        setQueue(data);
      } else {
        console.error('Invalid queue data format:', data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Patients whose reports have come back and who are waiting to be seen again.
  const loadLabResults = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/lab-results`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLabResults(data);
      }
    } catch (err) {
      console.error('Error loading lab results:', err);
    }
  };

  const loadDocStats = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/stats`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.ok) setDocStats(await res.json());
    } catch (err) {
      console.error('Error loading doctor stats:', err);
    }
  };

  // Declared alongside the other loaders — it is read during render by the
  // useLiveRefresh subscription below, so a `const` defined further down the
  // component would be in its temporal dead zone and throw on every render.
  const loadRefills = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/refills`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRefills(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markResultReviewed = async (tokenId) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/doctor/lab-results/${tokenId}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      loadLabResults();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadQueue();
    loadRefills();
    loadLabResults();
    loadDocStats();

    socket.emit('join-room', `doctor:${doctorUser?.id || doctorUser?._id}`);
    // Also join the hospital-wide room: internal chat messages (messages.js)
    // broadcast to `hospital:${hospital}`, not `doctor:${id}`, so InternalChatBox
    // needs this room to receive live updates.
    socket.emit('join-room', `hospital:${doctorUser?.hospital || 'general-hospital'}`);

    const handleQueueUpdated = () => {
      loadQueue();
      loadDocStats();
    };

    // A report landing for THIS doctor arrives as a targeted event, so the
    // "results ready" panel fills in without a refresh — this is the return path
    // that used to require the patient to re-register at reception.
    const handleResultReady = (payload) => {
      loadLabResults();
      loadDocStats();
      if (payload && payload.abnormal) {
        setResultAlert(
          `⚠️ ${payload.testName} for ${payload.tokenNumber} (${payload.patientName || 'patient'}) came back ABNORMAL: ${payload.result}`
        );
      } else if (payload && payload.allComplete) {
        setResultAlert(`🧪 All reports ready for ${payload.tokenNumber} — the patient is on their way back.`);
      }
    };

    const handleRxDispensed = (payload) => {
      if (payload && payload.shortages && payload.shortages.length > 0) {
        setResultAlert(
          `💊 Pharmacy could not supply ${payload.shortages.map((s) => s.requested).join(', ')} for ${payload.tokenNumber}. Consider an alternative.`
        );
      }
    };

    // These two carry payloads the UI shows verbatim, so they stay raw.
    socket.on('lab-result-ready', handleResultReady);
    socket.on('rx-dispensed', handleRxDispensed);

    return () => {
      socket.off('lab-result-ready', handleResultReady);
      socket.off('rx-dispensed', handleRxDispensed);
    };
  }, [doctorToken]);

  // Reload once per burst rather than once per event.
  useLiveRefresh(['queue-updated', 'queue-reset'], () => {
    loadQueue();
    loadDocStats();
  });
  useLiveRefresh(['refill-request'], loadRefills);
  useLiveRefresh(['lab-updated', 'lab-result-ready'], loadLabResults);

  // Live stock check for whatever is currently typed in the prescription form,
  // so an out-of-stock medicine is caught in the cabin, not at the counter.
  useEffect(() => {
    const names = medicines.map((m) => m.name).filter((n) => n && n.trim().length > 1);
    if (names.length === 0) {
      setStockInfo([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/v1/doctor/medicines?names=${encodeURIComponent(names.join('|'))}`,
          {
            headers: { Authorization: `Bearer ${doctorToken}` }
          }
        );
        if (res.ok) setStockInfo(await res.json());
      } catch (err) {
        console.error('Stock check failed:', err);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [medicines, doctorToken]);

  useEffect(() => {
    if (!resultAlert) return undefined;
    const t = setTimeout(() => setResultAlert(''), 12000);
    return () => clearTimeout(t);
  }, [resultAlert]);

  const handleUpdateAvailability = async (status) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ availabilityStatus: status })
      });
      if (res.ok) {
        setAvailability(status);
        loadQueue();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDecideRefill = async (id, approve) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/refills/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify({ approve })
      });
      if (res.ok) {
        setRefills((prev) => prev.filter((r) => r._id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveDailyLimit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ dailyTokenLimit: parseInt(dailyLimit) || 0 })
      });
      if (res.ok) {
        setLimitSaved(true);
        setTimeout(() => setLimitSaved(false), 2000);
        loadQueue();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCallNext = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/call-next`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message);
      }
      loadQueue();
    } catch (err) {
      console.error(err);
    }
  };

  const handleComplete = async (revisitDays = null, medicines = [], advice = '') => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ revisitDays, medicines, advice })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to complete checkup');
        return false;
      }
      loadQueue();
      return true;
    } catch (err) {
      console.error(err);
      alert('Network error: could not complete checkup');
      return false;
    }
  };

  const handleMarkAbsent = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/mark-absent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to mark patient absent');
        return;
      }
      loadQueue();
    } catch (err) {
      console.error(err);
      alert('Network error: could not mark patient absent');
    }
  };

  const handleAddBuffer = async (mins) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/add-buffer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ minutes: parseInt(mins) })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to update buffer delay');
        return;
      }
      loadQueue();
    } catch (err) {
      console.error(err);
      alert('Network error: could not update buffer delay');
    }
  };

  const handleRequestLabTest = async (e) => {
    e.preventDefault();
    const name = labTestName === 'Custom Test...' ? customLabTest : labTestName;
    if (!name) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/lab-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ testName: name, urgency: labUrgency })
      });
      if (res.ok) {
        setCustomLabTest('');
        loadQueue();
        // Confirm the hand-off actually happened — the lab bench has the order
        // and the patient has been told where to go.
        setResultAlert(
          `🧪 ${name} sent to the lab${labUrgency === 'Urgent' ? ' as URGENT' : ''}. The patient has been messaged to visit the lab counter.`
        );
      } else {
        const data = await res.json();
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      style={branding.vars}
      className="flex-1 flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200"
    >
      {/* Left Sidebar - Doctor status & Live queue list */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0">
        {/* Which facility this console belongs to. A visiting consultant may
            hold logins at two hospitals; the name they are currently signed
            into has to be visible before they write a prescription. */}
        <div
          className="-mx-5 -mt-5 px-5 py-3 flex items-center gap-2.5 border-b border-[var(--border-color)]/30"
          style={{ background: `${branding.theme.primary}0f` }}
        >
          {branding.facility?.logoUrl ? (
            <img
              src={branding.facility.logoUrl}
              alt=""
              className="w-8 h-8 rounded-lg object-cover border border-[var(--border-color)]/40 shrink-0"
            />
          ) : (
            <span
              className="material-symbols-outlined text-[24px] shrink-0"
              style={{ color: branding.theme.primary }}
            >
              {branding.theme.icon}
            </span>
          )}
          <span className="min-w-0">
            <span
              className="block text-[13px] font-black leading-tight truncate"
              style={{ color: branding.theme.primary }}
              title={branding.name}
            >
              {branding.name}
            </span>
            <span className="block text-[12px] font-semibold text-[var(--text-secondary)] truncate">
              {branding.kind} · Doctor Console
            </span>
          </span>
        </div>

        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{doctorUser?.name}</h3>
            <p className="text-[13px] text-[var(--text-secondary)] font-medium">
              {doctorUser?.department} | {doctorUser?.currentRoom}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="text-[var(--text-secondary)] hover:text-rose-500 p-2 hover:bg-[var(--border-color)]/20 rounded-lg transition-all flex items-center justify-center"
            title="Log Out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        {/* Doctor Status Selector */}
        <div className="space-y-1">
          <label className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
            Availability Status
          </label>
          <div className="grid grid-cols-3 gap-1 bg-[var(--bg-color)] p-1 rounded-xl border border-[var(--border-color)]/50 text-[13px]">
            {['Available', 'In Surgery', 'On Break'].map((status) => (
              <button
                key={status}
                onClick={() => handleUpdateAvailability(status)}
                className={`py-1.5 rounded-lg font-bold transition-all ${
                  availability === status
                    ? status === 'Available'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : status === 'In Surgery'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-amber-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                }`}
              >
                {status.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Daily OPD token limit (0 = unlimited). Once reached, new non-emergency
            bookings are refused so patients aren't sent on a wasted trip. */}
        <div className="space-y-1">
          <label className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
            Daily OPD Token Limit (0 = unlimited)
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-3 py-1.5 text-[13px] font-bold text-[var(--text-color)] outline-none focus:border-[var(--primary-color)]"
              placeholder="e.g. 50"
            />
            <button
              onClick={handleSaveDailyLimit}
              className="px-3 py-1.5 rounded-lg bg-[var(--primary-color)] text-[var(--primary-text)] text-[13px] font-bold hover:opacity-90 transition-all whitespace-nowrap"
            >
              {limitSaved ? '✓ Saved' : 'Set'}
            </button>
          </div>
        </div>

        {/* Today at a glance — the doctor's own throughput and what is pending
            on them from other departments. */}
        {docStats && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Seen', value: docStats.seenToday, tone: 'text-emerald-500' },
              { label: 'Waiting', value: docStats.waiting, tone: 'text-[var(--primary-color)]' },
              { label: 'Avg', value: `${docStats.avgConsultMins}m`, tone: 'text-[var(--text-color)]' },
              {
                label: 'At lab',
                value: docStats.awaitingLab,
                tone: docStats.awaitingLab > 0 ? 'text-sky-500' : 'text-[var(--text-color)]'
              },
              {
                label: 'Reports',
                value: docStats.resultsReady,
                tone: docStats.resultsReady > 0 ? 'text-amber-500' : 'text-[var(--text-color)]'
              },
              { label: 'No-show', value: docStats.absent, tone: 'text-rose-500' }
            ].map((s) => (
              <div
                key={s.label}
                className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-lg px-1.5 py-1.5 text-center"
              >
                <p className="text-[11px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">
                  {s.label}
                </p>
                <p className={`text-[15px] font-black leading-none mt-0.5 ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Lab reports that came back — the return path. The patient walks
            straight back to this cabin instead of re-registering at reception. */}
        {labResults.length > 0 && (
          <div className="space-y-1">
            <label className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider flex items-center gap-1">
              🧪 Reports Ready ({labResults.length})
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {labResults.map((r) => (
                <div
                  key={r._id}
                  className={`rounded-xl p-2.5 border ${
                    r.hasAbnormal
                      ? 'bg-rose-500/5 border-rose-500/40'
                      : 'bg-[var(--bg-color)] border-[var(--border-color)]/50'
                  }`}
                >
                  <p className="text-[13px] font-bold text-[var(--text-color)] flex items-center gap-1.5">
                    {r.patient?.name || 'Patient'}
                    <span className="text-[11px] text-[var(--text-secondary)]">{r.tokenNumber}</span>
                    {r.hasAbnormal && (
                      <span className="text-[11px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black">
                        ABNORMAL
                      </span>
                    )}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {(r.labTests || []).map((t) => (
                      <p
                        key={t.testName}
                        className={`text-[12px] font-semibold ${t.abnormal ? 'text-rose-500' : 'text-[var(--text-secondary)]'}`}
                      >
                        {t.testName}: {t.resultValue || t.remarks}
                        {t.unit ? ` ${t.unit}` : ''}
                        {t.normalRange ? ` (ref ${t.normalRange})` : ''}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={() => markResultReviewed(r._id)}
                    className="mt-1.5 w-full py-1 rounded-lg bg-[var(--primary-color)] text-[var(--primary-text)] text-[13px] font-bold hover:opacity-90 transition-all"
                  >
                    ✓ Mark reviewed
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Medicine Refill Requests — approve a chronic patient's repeat prescription
            in one tap; it goes straight to the pharmacy, no OPD slot used. */}
        {refills.length > 0 && (
          <div className="space-y-1">
            <label className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider flex items-center gap-1">
              💊 Medicine Refill Requests ({refills.length})
            </label>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {refills.map((r) => (
                <div
                  key={r._id}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl p-2.5"
                >
                  <p className="text-[13px] font-bold text-[var(--text-color)]">
                    {r.patient?.name || 'Patient'}
                  </p>
                  <p className="text-[12px] text-[var(--text-secondary)] mb-1">
                    {(r.medicines || [])
                      .map((m) => m.name)
                      .filter(Boolean)
                      .join(', ') || 'Previous medicines'}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDecideRefill(r._id, true)}
                      className="flex-1 py-1 rounded-lg bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-all"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleDecideRefill(r._id, false)}
                      className="flex-1 py-1 rounded-lg bg-rose-600 text-white text-[13px] font-bold hover:bg-rose-700 transition-all"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live waiting list */}
        <div className="flex-1 flex flex-col space-y-2">
          <span className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
            Waiting Patients ({queue?.activeQueue?.length || 0})
          </span>

          {loading ? (
            <div className="text-[var(--text-secondary)] text-[13px]">Loading queue list...</div>
          ) : queue?.activeQueue && queue.activeQueue.filter(Boolean).length > 0 ? (
            <div className="space-y-2">
              {queue.activeQueue.filter(Boolean).map((tok, idx) => (
                <div
                  key={tok._id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-[13px] shadow-sm bg-[var(--card-bg)] ${
                    tok.tokenType === 'Emergency'
                      ? 'animate-flashing-emergency border-rose-500/40 bg-rose-500/5'
                      : idx === 0
                        ? 'border-[var(--tertiary-color)]/40 bg-[var(--tertiary-container)]/10'
                        : 'border-[var(--border-color)]/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-[var(--text-color)]">{tok.tokenNumber}</span>
                      {idx === 0 && (
                        <span className="text-[11px] font-extrabold text-[var(--tertiary-color)] uppercase tracking-wide">
                          Up Next
                        </span>
                      )}
                      {tok.tokenType === 'Emergency' && (
                        <span className="text-[11px] font-extrabold text-rose-500 uppercase tracking-wide">
                          SOS
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] font-medium mt-0.5">
                      {tok.patient?.name} ({tok.patient?.age}y)
                    </p>
                  </div>
                  <span className="text-[12px] font-bold text-[var(--primary-color)]">
                    {tok.estimatedWaitTime}m
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-[var(--text-secondary)]/50 italic py-2">
              No patients waiting in queue.
            </div>
          )}
        </div>
      </div>

      {/* Right Core Cabin Controls & Active Patient Card */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)]">
        <h3 className="text-[13px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
          Active Cabin Workstation
          <HelpPanel
            id="doctor"
            title="How your cabin console works"
            steps={[
              'Press "Call Next Patient" — the patient is alerted by WhatsApp and the waiting-room screen shows their token.',
              'Need tests? Order them here; the lab sees the request instantly and the patient is told to go to the lab counter.',
              'Reports coming back appear under "Reports Ready" on the left, abnormal values first — the patient walks straight back to you.',
              'On "Complete Checkup" you can prescribe; each medicine shows live pharmacy stock so you can avoid one they are out of.'
            ]}
            tip="Running late? Add a buffer delay — every waiting patient's estimated time updates and reception can see why."
          />
        </h3>

        {/* Live cross-department alerts: a report landed, a value is abnormal, or
            the pharmacy could not supply something you prescribed. */}
        {resultAlert && (
          <div
            className={`rounded-xl px-4 py-3 text-[13px] font-bold flex items-start gap-2 ${
              resultAlert.includes('ABNORMAL') || resultAlert.includes('could not supply')
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400'
                : 'bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-400'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">notifications_active</span>
            <span className="flex-1">{resultAlert}</span>
            <button
              onClick={() => setResultAlert('')}
              className="text-[12px] font-black opacity-60 hover:opacity-100"
            >
              DISMISS
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-[var(--text-secondary)] text-[15px]">Loading cabin state...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Center Area: Current Patient details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active patient summary card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 relative overflow-hidden shadow-[var(--card-shadow)] text-[var(--text-color)]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-[13px] font-bold text-[var(--primary-color)] uppercase tracking-wider">
                      Currently In Cabin
                    </span>
                    <h2 className="text-3xl font-extrabold text-[var(--text-color)] tracking-tight mt-1">
                      {queue?.currentToken ? queue.currentToken.patient?.name : 'No Active Patient'}
                    </h2>
                    {queue?.currentToken && (
                      <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-1">
                        Age: {queue.currentToken.patient?.age} | Gender: {queue.currentToken.patient?.gender}{' '}
                        | Phone: {queue.currentToken.patient?.phone}
                      </p>
                    )}
                  </div>

                  {queue?.currentToken && (
                    <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 rounded-2xl px-4 py-2 text-center shrink-0">
                      <span className="text-[12px] text-[var(--text-secondary)] uppercase font-semibold">
                        Active Token
                      </span>
                      <p className="text-xl font-black text-[var(--primary-color)]">
                        {queue.currentToken.tokenNumber}
                      </p>
                    </div>
                  )}
                </div>

                {queue?.currentToken ? (
                  <div className="pt-4 border-t border-[var(--border-color)]/20 space-y-3">
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-[15px]">
                      <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                        Reported Symptoms:
                      </span>
                      <p className="text-[var(--text-color)] mt-1 font-medium">
                        {queue.currentToken.symptoms}
                      </p>
                    </div>

                    {/* Assistant Chatbot Context (History) */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-[13px]">
                      <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                        Assistant Chatbot Context (History)
                      </span>

                      <div className="mt-2 max-h-36 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                        {queue.currentToken.chatHistory && queue.currentToken.chatHistory.length > 0 ? (
                          queue.currentToken.chatHistory.map((ch, idx) => (
                            <div key={idx} className="flex flex-col space-y-0.5">
                              <span
                                className={`font-bold ${ch.sender === 'user' ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary)]'}`}
                              >
                                {ch.sender === 'user' ? 'Patient' : 'Bot'}:
                              </span>
                              <span className="text-[var(--text-color)] font-medium">{ch.message}</span>
                            </div>
                          ))
                        ) : (
                          // Fallback history
                          <div className="space-y-1 text-[var(--text-secondary)]/70 italic font-medium">
                            <p className="font-bold text-[var(--text-secondary)]">
                              Bot: <span className="font-normal">Select an option...</span>
                            </p>
                            <p className="font-bold text-[var(--primary-color)]">
                              Patient: <span className="font-normal">Book New Appointment</span>
                            </p>
                            <p className="font-bold text-[var(--text-secondary)]">
                              Bot: <span className="font-normal">Enter patient phone:</span>
                            </p>
                            <p className="font-bold text-[var(--primary-color)]">
                              Patient:{' '}
                              <span className="font-normal">{queue.currentToken.patient?.phone}</span>
                            </p>
                            <p className="font-bold text-[var(--text-secondary)]">
                              Bot: <span className="font-normal">Enter patient full name:</span>
                            </p>
                            <p className="font-bold text-[var(--primary-color)]">
                              Patient: <span className="font-normal">{queue.currentToken.patient?.name}</span>
                            </p>
                            <p className="font-bold text-[var(--text-secondary)]">
                              Bot: <span className="font-normal">Please describe symptoms:</span>
                            </p>
                            <p className="font-bold text-[var(--primary-color)]">
                              Patient: <span className="font-normal">{queue.currentToken.symptoms}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Active Lab Tests Section */}
                    {queue.currentToken.labTests && queue.currentToken.labTests.length > 0 && (
                      <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-[13px]">
                        <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                          Ordered Lab Tests & Diagnostics
                        </span>
                        <div className="mt-2 space-y-1.5">
                          {queue.currentToken.labTests.map((t, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center bg-[var(--card-bg)] p-2 rounded-lg border border-[var(--border-color)]/20"
                            >
                              <span className="font-bold text-[var(--text-color)]">{t.testName}</span>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wide border ${
                                  t.status === 'Completed'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                }`}
                              >
                                {t.status === 'Completed' ? `Completed: ${t.remarks}` : 'Pending Lab'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Order Lab Tests panel */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-[13px]">
                      <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                        Order Lab Diagnostics
                      </span>
                      <form onSubmit={handleRequestLabTest} className="mt-2 flex flex-col sm:flex-row gap-2">
                        <select
                          value={labTestName}
                          onChange={(e) => setLabTestName(e.target.value)}
                          className="flex-1 px-3 py-2 border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-color)] rounded-xl outline-none font-bold"
                        >
                          <option>Complete Blood Count (CBC)</option>
                          <option>Chest X-Ray</option>
                          <option>Electrocardiogram (ECG)</option>
                          <option>Lipid Panel</option>
                          <option>Thyroid Panel (TSH)</option>
                          <option>Custom Test...</option>
                        </select>

                        {labTestName === 'Custom Test...' && (
                          <input
                            type="text"
                            placeholder="Enter test name..."
                            value={customLabTest}
                            onChange={(e) => setCustomLabTest(e.target.value)}
                            className="flex-1 px-3 py-2 border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-color)] rounded-xl outline-none font-bold animate-fade-in"
                            required
                          />
                        )}

                        {/* Urgency drives the lab's worklist order — an urgent
                            order jumps the bench queue and is flagged in red. */}
                        <select
                          value={labUrgency}
                          onChange={(e) => setLabUrgency(e.target.value)}
                          className={`px-3 py-2 border rounded-xl outline-none font-bold ${
                            labUrgency === 'Urgent'
                              ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-color)]'
                          }`}
                        >
                          <option value="Routine">Routine</option>
                          <option value="Urgent">Urgent</option>
                        </select>

                        <button
                          type="submit"
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-sm transition-all active:scale-[0.97]"
                        >
                          Order Test
                        </button>
                      </form>

                      {/* Live status of tests already ordered for this patient. */}
                      {(queue?.currentToken?.labTests || []).length > 0 && (
                        <div className="mt-2.5 space-y-1 pt-2 border-t border-[var(--border-color)]/30">
                          {queue.currentToken.labTests.map((t) => (
                            <div key={t.testName} className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[13px] text-[var(--text-color)]">
                                {t.testName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                                    t.status === 'Completed'
                                      ? t.abnormal
                                        ? 'bg-rose-500/15 text-rose-500'
                                        : 'bg-emerald-500/15 text-emerald-500'
                                      : t.status === 'Collected'
                                        ? 'bg-sky-500/15 text-sky-500'
                                        : 'bg-amber-500/15 text-amber-500'
                                  }`}
                                >
                                  {t.status === 'Completed'
                                    ? `${t.resultValue || 'Done'}${t.unit ? ' ' + t.unit : ''}${t.abnormal ? ' ⚠️' : ''}`
                                    : t.status === 'Collected'
                                      ? 'Sample taken'
                                      : 'Awaiting sample'}
                                </span>
                                {t.reportPdf && (
                                  <a
                                    href={t.reportPdf}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-extrabold text-teal-600 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 underline hover:bg-teal-500 hover:text-white transition-all"
                                  >
                                    📄 View PDF Report
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Visit History Section */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-[13px]">
                      <span className="text-[13px] text-[var(--text-secondary)] font-bold">
                        Patient Visit History ({history.length} past visits)
                      </span>
                      {history.length === 0 ? (
                        <p className="text-[12px] text-[var(--text-secondary)]/50 italic mt-1 font-medium">
                          No past checkups registered in CareeAi directory.
                        </p>
                      ) : (
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {history.map((h, idx) => (
                            <div
                              key={idx}
                              className="bg-[var(--card-bg)] p-2.5 rounded-lg border border-[var(--border-color)]/30 space-y-1"
                            >
                              <div className="flex justify-between items-center text-[12px] text-[var(--text-secondary)]">
                                <span className="font-bold">
                                  {new Date(h.completedAt).toLocaleDateString()}
                                </span>
                                <span className="font-extrabold uppercase text-[var(--primary-color)]">
                                  {h.tokenNumber}
                                </span>
                              </div>
                              <p className="font-medium text-[var(--text-color)]">
                                <span className="font-bold text-[var(--text-secondary)] text-zinc-400">
                                  Symptoms:
                                </span>{' '}
                                {h.symptoms}
                              </p>
                              {h.prescription &&
                                h.prescription.medicines &&
                                h.prescription.medicines.length > 0 && (
                                  <div className="text-[12px] text-[var(--text-secondary)] border-t border-[var(--border-color)]/10 pt-1">
                                    <span className="font-bold text-zinc-400">Prescription:</span>{' '}
                                    {h.prescription.medicines
                                      .map((m) => `${m.name} (${m.dosage})`)
                                      .join(', ')}
                                  </div>
                                )}
                              {h.labTests && h.labTests.length > 0 && (
                                <div className="text-[12px] text-teal-650 mt-1">
                                  <span className="font-bold text-teal-650">Tests:</span>{' '}
                                  {h.labTests
                                    .map(
                                      (t) =>
                                        `${t.testName} (${t.status === 'Completed' ? t.remarks : 'Pending'})`
                                    )
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text-secondary)]/50 border border-dashed border-[var(--border-color)] rounded-xl bg-[var(--bg-color)]/30">
                    <span className="material-symbols-outlined text-[36px] mb-2 text-[var(--text-secondary)]/40">
                      groups
                    </span>
                    <p className="text-lg font-bold text-[var(--text-color)]">Cabin empty</p>
                    <p className="text-[13px] text-[var(--text-secondary)] max-w-xs mt-1 font-medium">
                      Press <span className="font-black">Call next</span> to admit the first patient waiting.
                    </p>
                  </div>
                )}
              </div>

              {/* Doctor Control buttons.
                  One word each. Every button used to carry a second line
                  restating the first ("Call Next Patient / Admit next in line"),
                  which is reading a doctor does between patients for no
                  information. Call Next is given the width because it is the
                  action pressed all day; the other two only light up once
                  somebody is actually in the cabin. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={handleCallNext}
                  className="col-span-2 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black py-5 px-6 rounded-2xl shadow-lg shadow-[var(--primary-color)]/10 hover:shadow-[var(--primary-color)]/20 transition-all transition-all-custom text-lg flex items-center justify-center gap-2.5 border border-[var(--primary-color)]/20 active:scale-95"
                >
                  <span className="material-symbols-outlined text-[26px]">group</span>
                  Call next
                </button>

                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={!queue?.currentToken}
                  className={`font-black py-5 px-4 rounded-2xl transition-all transition-all-custom text-[15px] flex items-center justify-center gap-2 border active:scale-95 ${
                    queue?.currentToken
                      ? 'bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white border-[var(--tertiary-color)]/20 shadow-lg shadow-[var(--tertiary-color)]/10 cursor-pointer'
                      : 'bg-[var(--border-color)]/10 border-[var(--border-color)]/30 text-[var(--text-secondary)]/35 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  Complete
                </button>

                <button
                  onClick={handleMarkAbsent}
                  disabled={!queue?.currentToken}
                  className={`font-black py-5 px-4 rounded-2xl transition-all text-[15px] flex items-center justify-center gap-2 border active:scale-95 ${
                    queue?.currentToken
                      ? 'bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-color)] border-[var(--border-color)] shadow-sm'
                      : 'bg-[var(--border-color)]/10 border-[var(--border-color)]/30 text-[var(--text-secondary)]/35 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">cancel</span>
                  Absent
                </button>
              </div>
            </div>

            {/* Right Pane: Buffer delays & info panel */}
            <div className="space-y-6">
              {/* Delay Management Card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 flex flex-col space-y-4 shadow-[var(--card-shadow)]">
                <div>
                  <h4 className="font-bold text-[var(--text-color)] text-[15px]">Add Buffer Delay</h4>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                    Increases estimated wait time for all waiting patients.
                  </p>
                </div>

                <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 text-center flex flex-col items-center justify-center">
                  <span className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
                    Active Buffer Delay
                  </span>
                  <p className="text-3xl font-black text-[var(--primary-color)] mt-1">
                    {queue?.bufferDelay || 0} <span className="text-[15px] font-medium">mins</span>
                  </p>
                </div>

                {/* Adjuster Buttons */}
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <button
                    onClick={() => handleAddBuffer(10)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-[var(--primary-color)]/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all transition-all-custom"
                  >
                    +10 mins
                  </button>
                  <button
                    onClick={() => handleAddBuffer(15)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-[var(--primary-color)]/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all transition-all-custom"
                  >
                    +15 mins
                  </button>
                  <button
                    onClick={() => handleAddBuffer(30)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-[var(--primary-color)]/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all transition-all-custom"
                  >
                    +30 mins
                  </button>
                  <button
                    onClick={() => handleAddBuffer(-1 * (queue?.bufferDelay || 0))}
                    disabled={!queue?.bufferDelay}
                    className={`p-2.5 rounded-xl font-bold transition-all ${
                      queue?.bufferDelay
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 shadow-sm'
                        : 'bg-[var(--bg-color)] text-[var(--text-secondary)]/30 border border-[var(--border-color)]/35 cursor-not-allowed'
                    }`}
                  >
                    Reset Delay
                  </button>
                </div>
              </div>

              {/* Sitting hours + the running-late announcement */}
              <DoctorSchedulePanel
                doctorToken={doctorToken}
                schedule={queue?.schedule}
                waitingCount={queue?.activeQueue?.length || 0}
                onSaved={loadQueue}
              />

              {/* Internal Intercom Chatbox */}
              <InternalChatBox token={doctorToken} user={doctorUser} role="Doctor" />

              {/* Informative Stats Box */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 text-[13px] text-[var(--text-secondary)] space-y-2 shadow-sm">
                <h5 className="font-bold text-[var(--text-color)]">Quick Reference</h5>
                <p>• **Emergency SOS** tokens are prioritized and pushed above regular tokens.</p>
                <p>• **Speech Synthesis** automatically announces tokens when called.</p>
                <p>• **Midnight reset** cron clears active databases daily.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Complete Checkup & Re-visit Reminder Modal Overlay */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)] max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-[var(--text-color)] text-lg mb-2">Complete Patient Checkup</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-6">
              Conclude checkup for **{queue?.currentToken?.patient?.name || 'the patient'}**. Please review
              digital prescription details below.
            </p>

            {/* Prescription Form Section */}
            <div className="space-y-4 mb-6 pb-6 border-b border-[var(--border-color)]/30 text-[13px] text-left">
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Prescribe Medications
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMedicines((prev) => [
                      ...prev,
                      { name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }
                    ])
                  }
                  className="px-2.5 py-1 bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 text-[var(--primary-color)] rounded-lg hover:bg-[var(--primary-color)] hover:text-[var(--primary-text)] transition-all transition-all-custom font-bold"
                >
                  + Add Medicine
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {medicines.map((med, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/30 relative text-left"
                  >
                    <div>
                      <label className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] font-bold mb-0.5">
                        <span>Medicine Name</span>
                        {/* Live pharmacy stock for what you are typing. Catching an
                            out-of-stock medicine here saves the patient a wasted
                            trip to the counter and a second visit. */}
                        {(() => {
                          const s = stockInfo.find((x) => x.requested === med.name);
                          if (!s || !med.name) return null;
                          const style = {
                            'in-stock': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                            low: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                            out: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
                            unknown: 'bg-zinc-500/15 text-zinc-500'
                          }[s.level];
                          const label = {
                            'in-stock': `In stock (${s.stockQty})`,
                            low: `Low (${s.stockQty} left)`,
                            out: 'OUT OF STOCK',
                            unknown: 'Not in pharmacy list'
                          }[s.level];
                          return (
                            <span className={`px-1.5 py-0.5 rounded-full font-black text-[11px] ${style}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </label>
                      <input
                        type="text"
                        placeholder="Paracetamol"
                        value={med.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines((prev) => prev.map((m, i) => (i === idx ? { ...m, name: val } : m)));
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-[13px] text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[var(--text-secondary)] font-bold mb-0.5">
                        Dosage
                      </label>
                      <input
                        type="text"
                        placeholder="1-0-1"
                        value={med.dosage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines((prev) => prev.map((m, i) => (i === idx ? { ...m, dosage: val } : m)));
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-[13px] text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[var(--text-secondary)] font-bold mb-0.5">
                        Duration
                      </label>
                      <input
                        type="text"
                        placeholder="5 days"
                        value={med.duration}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, duration: val } : m))
                          );
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-[13px] text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div className="flex items-end space-x-1.5 text-left">
                      <div className="flex-1">
                        <label className="block text-[12px] text-[var(--text-secondary)] font-bold mb-0.5">
                          Instructions
                        </label>
                        <input
                          type="text"
                          placeholder="After food"
                          value={med.instructions}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMedicines((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, instructions: val } : m))
                            );
                          }}
                          className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-[13px] text-[var(--text-color)] outline-none font-bold"
                        />
                      </div>
                      {medicines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMedicines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 rounded-lg border border-rose-500/20 transition-all shrink-0 mb-0.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[13px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 text-left">
                  Doctor's Advice & Directives
                </label>
                <textarea
                  placeholder="Drink plenty of water, avoid cold items..."
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/65 focus:border-[var(--primary-color)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text-color)] outline-none font-semibold min-h-[64px]"
                />
              </div>
            </div>

            <div className="space-y-3 mb-6 text-[15px] text-left">
              <label className="block text-[13px] font-bold text-[var(--text-secondary)] uppercase tracking-wider text-left">
                Re-visit Reminder Interval
              </label>
              <div className="grid grid-cols-2 gap-2 text-left">
                {[
                  { label: 'No Re-visit / No Reminder', value: 'none' },
                  { label: 'Today (Immediate Test)', value: '0' },
                  { label: '3 Days Re-visit', value: '3' },
                  { label: '7 Days (1 Week)', value: '7' },
                  { label: '14 Days (2 Weeks)', value: '14' },
                  { label: 'Custom Days...', value: 'custom' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRevisitSelection(opt.value)}
                    className={`p-3 rounded-xl border text-left font-bold transition-all transition-all-custom ${
                      revisitSelection === opt.value
                        ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--primary-color)] shadow-sm'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)]/60 text-[var(--text-color)] hover:bg-[var(--border-color)]/30'
                    }`}
                  >
                    <span className="block text-[13px]">{opt.label}</span>
                  </button>
                ))}
              </div>

              {revisitSelection === 'custom' && (
                <div className="mt-3 animate-fade-in text-left">
                  <label className="block text-[13px] font-bold text-[var(--text-secondary)] mb-1">
                    Enter Custom Days
                  </label>
                  <input
                    type="number"
                    value={customRevisitDays}
                    onChange={(e) => setCustomRevisitDays(e.target.value)}
                    min="1"
                    max="365"
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 text-[var(--text-color)] outline-none font-bold"
                  />
                </div>
              )}
            </div>

            <div className="flex space-x-3 text-[15px]">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setRevisitSelection('none');
                }}
                className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] font-bold hover:bg-[var(--border-color)]/20 rounded-xl transition-all transition-all-custom"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // These inputs use `required`, but since they aren't inside a
                  // <form>, HTML5 validation never fires — enforce it manually.
                  const incomplete = medicines.some(
                    (m) => !m.name.trim() || !m.dosage.trim() || !m.duration.trim()
                  );
                  if (incomplete) {
                    alert(
                      'Please fill in Medicine Name, Dosage, and Duration for every medicine (or remove the empty row).'
                    );
                    return;
                  }
                  let days = null;
                  if (revisitSelection !== 'none') {
                    days =
                      revisitSelection === 'custom'
                        ? parseInt(customRevisitDays)
                        : parseInt(revisitSelection);
                  }
                  const success = await handleComplete(days, medicines, advice);
                  if (!success) return;
                  setShowCompleteModal(false);
                  setRevisitSelection('none');
                  setMedicines([
                    { name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }
                  ]);
                  setAdvice('');
                }}
                className="flex-1 py-3 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white font-bold rounded-xl shadow-lg shadow-[var(--tertiary-color)]/10 transition-all transition-all-custom"
              >
                Complete Checkup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
