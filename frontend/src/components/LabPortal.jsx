import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';
import useFacilitySocket from '../hooks/useFacilitySocket';
import LiveActivityFeed from './LiveActivityFeed';

export function LabLogin({ setLabToken, setLabUser, onSuccess }) {
  const [username, setUsername] = useState('lab_assistant');
  const [password, setPassword] = useState('password123');
  const [hospitals, setHospitals] = useState([
    { id: 'general-hospital', name: 'CareeAi General Hospital' },
    { id: 'pediatrics-clinic', name: 'St. Jude Pediatrics Clinic' }
  ]);
  const [selectedHospital, setSelectedHospital] = useState('general-hospital');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setHospitals(data);
          // Keep the controlled <select> value in sync with what's actually
          // available — otherwise 'general-hospital' (the default) can be
          // sent in the login request while the dropdown visually shows a
          // different hospital, causing a confusing "Invalid credentials" error.
          setSelectedHospital(prev => data.some(h => h.id === prev) ? prev : data[0].id);
        }
      })
      .catch(err => console.error('Error fetching hospitals for lab login:', err));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/lab/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, hospital: selectedHospital })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('labToken', data.token);
      localStorage.setItem('labUser', JSON.stringify(data.user));
      setLabToken(data.token);
      setLabUser(data.user);
      onSuccess();
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setError('Unable to connect to the server. Please ensure the backend is running or check your network connection.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-8 shadow-[var(--card-shadow)] relative overflow-hidden">
        <div className="flex items-center space-x-2 mb-6">
          <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 p-2 rounded-lg text-[var(--primary-color)]">
            <span className="material-symbols-outlined">science</span>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-color)] tracking-tight">Lab Assistant Portal Login</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-lg flex items-center space-x-2">
            <span className="material-symbols-outlined text-[16px] text-rose-500">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-sm font-semibold">
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Select Hospital</label>
            <select
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 rounded-xl px-4 py-3 outline-none text-[var(--text-color)] font-bold cursor-pointer"
            >
              {hospitals.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)] focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)] focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-bold rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/10 hover:shadow-[var(--primary-color)]/20 flex items-center justify-center space-x-2 active:scale-[0.98]"
          >
            {loading ? <span>Logging in...</span> : <span>Access Lab Console</span>}
          </button>
        </form>
      </div>
    </div>
  );
}

export function LabDashboard({ labToken, labUser, onLogout }) {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [results, setResults] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');

  // Put this bench in its facility's realtime rooms so it receives lab events
  // for THIS hospital only.
  useFacilitySocket('lab', labUser?.hospital);

  const authHeaders = { Authorization: `Bearer ${labToken}` };

  const fetchPendingTests = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/queues/pending-tests`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setTokens(data);
        // Keep the open worksheet in sync when the order changes underneath us.
        setSelectedToken(prev => (prev ? data.find(t => t._id === prev._id) || null : null));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/stats`, { headers: authHeaders });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Error loading lab stats:', err);
    }
  };

  useEffect(() => {
    fetchPendingTests();
    fetchStats();

    const refresh = () => { fetchPendingTests(); fetchStats(); };
    // `lab-updated` fires when a doctor orders a test — the worklist now appears
    // instantly instead of waiting for the next generic queue refresh.
    socket.on('lab-updated', refresh);
    socket.on('queue-updated', refresh);
    socket.on('queue-reset', refresh);

    return () => {
      // Pass the same handler reference — `socket` is a shared singleton, so
      // calling socket.off('queue-updated') with no handler would deregister
      // every other component's listener for this event too.
      socket.off('lab-updated', refresh);
      socket.off('queue-updated', refresh);
      socket.off('queue-reset', refresh);
    };
  }, []);

  const keyOf = (tokenId, testName) => `${tokenId}-${testName}`;
  const setField = (tokenId, testName, field, value) =>
    setResults(prev => ({
      ...prev,
      [keyOf(tokenId, testName)]: { ...(prev[keyOf(tokenId, testName)] || {}), [field]: value }
    }));

  const handleCollect = async (tokenId, testName) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/tests/${tokenId}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ testName })
      });
      const data = await res.json();
      if (res.ok) {
        setFlash(`Sample logged for ${testName}.`);
        fetchPendingTests(); fetchStats();
      } else {
        alert(data.message || 'Error marking sample collected');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteTest = async (tokenId, testName) => {
    try {
      const entry = results[keyOf(tokenId, testName)] || {};
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/tests/${tokenId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          testName,
          resultValue: entry.resultValue || '',
          unit: entry.unit || '',
          normalRange: entry.normalRange || '',
          abnormal: Boolean(entry.abnormal),
          remarks: entry.remarks || 'Completed successfully.'
        })
      });
      const data = await res.json();
      if (res.ok) {
        // Tell the bench what just happened downstream — the doctor has already
        // been notified and the patient has been told to walk back.
        setFlash(data.allComplete
          ? `All reports for this patient are done — the doctor has been notified and the patient told to return.`
          : `${testName} result sent to the doctor.`);
        fetchPendingTests();
        fetchStats();
      } else {
        alert(data.message || 'Error completing test');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="flex-grow flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Left panel: list of patient tokens with pending lab tests */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0 text-left">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{labUser?.name}</h3>
            <p className="text-[10px] text-[var(--primary-color)] font-bold uppercase tracking-wider mt-0.5">Lab Assistant</p>
          </div>
          <button 
            onClick={onLogout}
            className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-extrabold rounded-lg hover:bg-rose-500 hover:text-white transition-all shrink-0 active:scale-95 duration-100"
          >
            Logout
          </button>
        </div>

        {/* Live workload — what the bench is actually carrying right now. */}
        {stats && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Pending', value: stats.pending, tone: stats.pending > 0 ? 'text-amber-500' : 'text-[var(--text-color)]' },
              { label: 'Urgent', value: stats.urgentPending, tone: stats.urgentPending > 0 ? 'text-rose-500' : 'text-[var(--text-color)]' },
              { label: 'Done today', value: stats.completedToday, tone: 'text-emerald-500' },
              { label: 'Avg TAT', value: `${stats.avgTurnaroundMins}m`, tone: 'text-[var(--primary-color)]' }
            ].map(s => (
              <div key={s.label} className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl px-2.5 py-2">
                <p className="text-[9px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">{s.label}</p>
                <p className={`text-lg font-black leading-none mt-0.5 ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Patients Queue ({tokens.length})</h4>
          {loading ? (
            <div className="text-xs text-[var(--text-secondary)] italic">Loading active test orders...</div>
          ) : tokens.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]/50 italic py-4">No pending lab test requests.</div>
          ) : (
            <div className="space-y-2">
              {tokens.map(tok => {
                const outstanding = tok.labTests.filter(t => t.status !== 'Completed');
                const isUrgent = outstanding.some(t => t.urgency === 'Urgent');
                return (
                  <div
                    key={tok._id}
                    onClick={() => setSelectedToken(tok)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                      selectedToken?._id === tok._id
                        ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--text-color)] shadow-sm'
                        : isUrgent
                          ? 'bg-rose-500/5 border-rose-500/40 hover:bg-rose-500/10'
                          : 'bg-[var(--card-bg)] border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/10'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-extrabold text-xs flex items-center gap-1">
                        {tok.tokenNumber}
                        {isUrgent && <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black">URGENT</span>}
                      </p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5 truncate">{tok.patient?.name}</p>
                      <p className="text-[9px] text-[var(--text-secondary)]/70 font-medium truncate">
                        {tok.doctor?.name || 'Doctor'}
                      </p>
                    </div>
                    <span className="bg-[var(--primary-color)] text-[var(--primary-text)] text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                      {outstanding.length} Test{outstanding.length > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* The rest of the hospital, live. */}
        <LiveActivityFeed token={labToken} title="Hospital Activity" limit={20} compact />
      </div>

      {/* Right workstation pane */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)] text-left">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Lab Testing Station</h3>

        {flash && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {flash}
          </div>
        )}

        {selectedToken ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-[var(--border-color)]/30">
              <div>
                <span className="text-xs font-bold text-[var(--primary-color)] uppercase tracking-wider">Active Patient under Test</span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-1">{selectedToken.patient?.name}</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                  Age: {selectedToken.patient?.age} | Gender: {selectedToken.patient?.gender} | Phone: {selectedToken.patient?.phone}
                </p>
              </div>
              <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 rounded-2xl px-4 py-2 text-center shrink-0">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Token Number</span>
                <p className="text-xl font-black text-[var(--primary-color)]">{selectedToken.tokenNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[var(--text-color)]">Requested Diagnoses / Clinical Tests</h4>
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                  Ordered by {selectedToken.doctor?.name || 'the doctor'}
                </span>
              </div>

              <div className="space-y-3">
                {selectedToken.labTests.filter(t => t.status !== 'Completed').map(test => {
                  const entry = results[`${selectedToken._id}-${test.testName}`] || {};
                  return (
                    <div key={test.testName} className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/50 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center space-x-3">
                          <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">science</span>
                          <span className="font-bold text-sm">{test.testName}</span>
                          {test.urgency === 'Urgent' && (
                            <span className="text-[9px] bg-rose-500 text-white px-2 py-0.5 rounded-full font-black">URGENT</span>
                          )}
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            test.status === 'Collected'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          }`}>
                            {test.status === 'Collected' ? 'Sample collected' : 'Awaiting sample'}
                          </span>
                        </div>
                        {test.status === 'Pending' && (
                          <button
                            onClick={() => handleCollect(selectedToken._id, test.testName)}
                            className="px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[11px] font-bold rounded-lg hover:bg-sky-500 hover:text-white transition-all active:scale-95"
                          >
                            Log sample collected
                          </button>
                        )}
                      </div>

                      {/* Structured result: a number the doctor can act on, with the
                          reference range and an explicit out-of-range flag. */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <input
                          type="text" placeholder="Result value"
                          value={entry.resultValue || ''}
                          onChange={(e) => setField(selectedToken._id, test.testName, 'resultValue', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-xs text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                        />
                        <input
                          type="text" placeholder="Unit (g/dL)"
                          value={entry.unit || ''}
                          onChange={(e) => setField(selectedToken._id, test.testName, 'unit', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-xs text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                        />
                        <input
                          type="text" placeholder="Normal range"
                          value={entry.normalRange || ''}
                          onChange={(e) => setField(selectedToken._id, test.testName, 'normalRange', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-xs text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                        />
                        <label className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer text-[11px] font-bold transition-all ${
                          entry.abnormal
                            ? 'bg-rose-500 border-rose-500 text-white'
                            : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-rose-500/50'
                        }`}>
                          <input
                            type="checkbox" className="hidden"
                            checked={Boolean(entry.abnormal)}
                            onChange={(e) => setField(selectedToken._id, test.testName, 'abnormal', e.target.checked)}
                          />
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          Abnormal
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="text" placeholder="Remarks for the doctor (optional)"
                          value={entry.remarks || ''}
                          onChange={(e) => setField(selectedToken._id, test.testName, 'remarks', e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-xs text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                        />
                        <button
                          onClick={() => handleCompleteTest(selectedToken._id, test.testName)}
                          className="px-4 py-2 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 duration-100 whitespace-nowrap"
                        >
                          Send to doctor
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reports already filed for this patient. */}
              {selectedToken.labTests.some(t => t.status === 'Completed') && (
                <div className="pt-3 border-t border-[var(--border-color)]/30 space-y-2">
                  <h5 className="text-[11px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Filed reports</h5>
                  {selectedToken.labTests.filter(t => t.status === 'Completed').map(t => (
                    <div key={t.testName} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                      t.abnormal ? 'border-rose-500/40 bg-rose-500/5' : 'border-[var(--border-color)]/40 bg-[var(--bg-color)]'
                    }`}>
                      <span className="font-bold">{t.testName}</span>
                      <span className={`font-semibold ${t.abnormal ? 'text-rose-500' : 'text-[var(--text-secondary)]'}`}>
                        {t.resultValue || t.remarks}{t.unit ? ` ${t.unit}` : ''}
                        {t.normalRange ? ` (ref ${t.normalRange})` : ''}
                        {t.abnormal ? ' ⚠️' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[var(--text-secondary)]/50 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/20">
            <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--text-secondary)]/30">science</span>
            <p className="text-sm font-bold text-[var(--text-color)]">Testing Station is Idle</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mt-1.5 font-medium">Select a patient queue ticket on the left rail to register and upload diagnostic remarks.</p>
          </div>
        )}
      </div>
    </div>
  );
}
