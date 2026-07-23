import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';

export function PharmacyLogin({ setPharmacyToken, setPharmacyUser, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hospitals, setHospitals] = useState([
    { id: 'general-hospital', name: 'CareSync General Hospital' }
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
          setSelectedHospital(prev => data.some(h => h.id === prev) ? prev : data[0].id);
        }
      })
      .catch(err => console.error('Error fetching hospitals for pharmacy login:', err));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/pharmacy/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, hospital: selectedHospital })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('pharmacyToken', data.token);
      localStorage.setItem('pharmacyUser', JSON.stringify(data.user));
      setPharmacyToken(data.token);
      setPharmacyUser(data.user);
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
            <span className="material-symbols-outlined">local_pharmacy</span>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-color)] tracking-tight">Pharmacy / Medical Portal Login</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-lg flex items-center space-x-2">
            <span className="material-symbols-outlined text-[16px] text-rose-500">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-sm font-semibold">
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Select Facility</label>
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
            {loading ? <span>Logging in...</span> : <span>Access Pharmacy Console</span>}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PharmacyDashboard({ pharmacyToken, pharmacyUser, onLogout }) {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'

  const fetchPrescriptions = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/pharmacy/prescriptions`, {
        headers: { 'Authorization': `Bearer ${pharmacyToken}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setTokens(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();

    socket.emit('join-room', 'queue:global');
    const handleQueueUpdated = () => fetchPrescriptions();
    socket.on('queue-updated', handleQueueUpdated);

    return () => {
      socket.off('queue-updated', handleQueueUpdated);
    };
  }, []);

  const handleDispense = async (tokenId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/pharmacy/prescriptions/${tokenId}/dispense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pharmacyToken}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        await fetchPrescriptions();
        setSelectedToken(data.token);
      } else {
        alert(data.message || 'Error dispensing prescription');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isDispensed = (tok) => tok?.prescription?.dispensed;
  const visibleTokens = filter === 'pending' ? tokens.filter(t => !isDispensed(t)) : tokens;

  return (
    <div className="flex-grow flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Left panel: patient prescriptions */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0 text-left">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{pharmacyUser?.name}</h3>
            <p className="text-[10px] text-[var(--primary-color)] font-bold uppercase tracking-wider mt-0.5">Pharmacy / Medical</p>
          </div>
          <button
            onClick={onLogout}
            className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-extrabold rounded-lg hover:bg-rose-500 hover:text-white transition-all shrink-0 active:scale-95 duration-100"
          >
            Logout
          </button>
        </div>

        <div className="flex gap-1.5">
          {['pending', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                filter === f ? 'bg-[var(--primary-color)] text-[var(--primary-text)]' : 'bg-[var(--bg-color)] text-[var(--text-secondary)] border border-[var(--border-color)]/40'
              }`}
            >
              {f === 'pending' ? 'To Dispense' : 'All'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Prescriptions ({visibleTokens.length})</h4>
          {loading ? (
            <div className="text-xs text-[var(--text-secondary)] italic">Loading prescriptions...</div>
          ) : visibleTokens.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]/50 italic py-4">No prescriptions to dispense.</div>
          ) : (
            <div className="space-y-2">
              {visibleTokens.map(tok => (
                <div
                  key={tok._id}
                  onClick={() => setSelectedToken(tok)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                    selectedToken?._id === tok._id
                      ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--text-color)] shadow-sm'
                      : 'bg-[var(--card-bg)] border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/10'
                  }`}
                >
                  <div>
                    <p className="font-extrabold text-xs">{tok.tokenNumber}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{tok.patient?.name}</p>
                  </div>
                  {isDispensed(tok) ? (
                    <span className="bg-emerald-500/15 text-emerald-500 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">Dispensed</span>
                  ) : (
                    <span className="bg-amber-500/15 text-amber-500 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {tok.prescription?.medicines?.length || 0} Med{(tok.prescription?.medicines?.length || 0) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right workstation pane */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)] text-left">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Medicine Dispensing Station</h3>

        {selectedToken ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-[var(--border-color)]/30">
              <div>
                <span className="text-xs font-bold text-[var(--primary-color)] uppercase tracking-wider">Prescription For</span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-1">{selectedToken.patient?.name}</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                  Age: {selectedToken.patient?.age} | Gender: {selectedToken.patient?.gender} | Phone: {selectedToken.patient?.phone}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">Prescribed by: {selectedToken.doctor?.name} ({selectedToken.doctor?.department})</p>
              </div>
              <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 rounded-2xl px-4 py-2 text-center shrink-0">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Token</span>
                <p className="text-xl font-black text-[var(--primary-color)]">{selectedToken.tokenNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[var(--text-color)]">Prescribed Medicines</h4>
              <div className="space-y-3">
                {(selectedToken.prescription?.medicines || []).map((med, i) => (
                  <div key={i} className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/50 flex items-start space-x-3">
                    <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">pill</span>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{med.name}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                        {[med.dosage, med.duration, med.instructions].filter(Boolean).join(' • ') || 'As directed'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {selectedToken.prescription?.advice && (
                <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/40 text-xs">
                  <span className="font-extrabold text-[var(--text-secondary)] uppercase tracking-wide text-[10px]">Doctor's Advice</span>
                  <p className="mt-1 font-medium text-[var(--text-color)]">{selectedToken.prescription.advice}</p>
                </div>
              )}

              {isDispensed(selectedToken) ? (
                <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl px-4 py-3 text-sm font-bold">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>Dispensed{selectedToken.prescription?.dispensedAt ? ' on ' + new Date(selectedToken.prescription.dispensedAt).toLocaleString() : ''}</span>
                </div>
              ) : (
                <button
                  onClick={() => handleDispense(selectedToken._id)}
                  className="w-full py-3 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                  <span>Mark Medicines Dispensed</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[var(--text-secondary)]/50 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/20">
            <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--text-secondary)]/30">local_pharmacy</span>
            <p className="text-sm font-bold text-[var(--text-color)]">Dispensing Station is Idle</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mt-1.5 font-medium">Select a patient prescription on the left rail to review medicines and mark them dispensed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
