import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';

export function LabLogin({ setLabToken, setLabUser, onSuccess }) {
  const [username, setUsername] = useState('lab_assistant');
  const [password, setPassword] = useState('password123');
  const [hospitals, setHospitals] = useState([
    { id: 'general-hospital', name: 'CareSync General Hospital' },
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-8 shadow-[var(--card-shadow)] relative overflow-hidden">
        <div className="flex items-center space-x-2 mb-6">
          <div className="bg-teal-500/10 border border-teal-500/20 p-2 rounded-lg text-teal-500">
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
            className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 flex items-center justify-center space-x-2 active:scale-[0.98]"
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
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchPendingTests = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/queues/pending-tests`, {
        headers: {
          'Authorization': `Bearer ${labToken}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setTokens(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingTests();

    // Join Socket Room
    socket.emit('join-room', 'queue:global');
    socket.on('queue-updated', () => {
      fetchPendingTests();
    });

    return () => {
      socket.off('queue-updated');
    };
  }, []);

  const handleCompleteTest = async (tokenId, testName) => {
    try {
      const testRemarks = remarks[`${tokenId}-${testName}`] || 'Completed successfully.';
      const res = await fetch(`${BACKEND_URL}/api/v1/lab/tests/${tokenId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${labToken}`
        },
        body: JSON.stringify({ testName, remarks: testRemarks })
      });
      const data = await res.json();
      if (res.ok) {
        fetchPendingTests();
        if (selectedToken && selectedToken._id === tokenId) {
          // Refresh details in card
          const updatedToken = data.token;
          const pending = updatedToken.labTests.filter(t => t.status === 'Pending');
          if (pending.length === 0) {
            setSelectedToken(null);
          } else {
            setSelectedToken(updatedToken);
          }
        }
      } else {
        alert(data.message || 'Error completing test');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-grow flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Left panel: list of patient tokens with pending lab tests */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0 text-left">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{labUser?.name}</h3>
            <p className="text-[10px] text-teal-650 font-bold uppercase tracking-wider mt-0.5">Lab Assistant</p>
          </div>
          <button 
            onClick={onLogout}
            className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-extrabold rounded-lg hover:bg-rose-500 hover:text-white transition-all shrink-0 active:scale-95 duration-100"
          >
            Logout
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Patients Queue ({tokens.length})</h4>
          {loading ? (
            <div className="text-xs text-[var(--text-secondary)] italic">Loading active test orders...</div>
          ) : tokens.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]/50 italic py-4">No pending lab test requests.</div>
          ) : (
            <div className="space-y-2">
              {tokens.map(tok => {
                const pendingCount = tok.labTests.filter(t => t.status === 'Pending').length;
                return (
                  <div
                    key={tok._id}
                    onClick={() => setSelectedToken(tok)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                      selectedToken?._id === tok._id
                        ? 'bg-teal-500/10 border-teal-500 text-[var(--text-color)] shadow-sm'
                        : 'bg-[var(--card-bg)] border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/10'
                    }`}
                  >
                    <div>
                      <p className="font-extrabold text-xs">{tok.tokenNumber}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{tok.patient?.name}</p>
                    </div>
                    <span className="bg-teal-650 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {pendingCount} Test{pendingCount > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right workstation pane */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)] text-left">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Lab Testing Station</h3>

        {selectedToken ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-[var(--border-color)]/30">
              <div>
                <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Active Patient under Test</span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-1">{selectedToken.patient?.name}</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                  Age: {selectedToken.patient?.age} | Gender: {selectedToken.patient?.gender} | Phone: {selectedToken.patient?.phone}
                </p>
              </div>
              <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-4 py-2 text-center shrink-0">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Token Number</span>
                <p className="text-xl font-black text-teal-600">{selectedToken.tokenNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[var(--text-color)]">Requested Diagnoses / Clinical Tests</h4>
              <div className="space-y-3">
                {selectedToken.labTests.filter(t => t.status === 'Pending').map(test => (
                  <div key={test.testName} className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-teal-600 text-[20px]">science</span>
                      <span className="font-bold text-sm">{test.testName}</span>
                    </div>
                    <div className="flex-1 max-w-md flex items-center space-x-3">
                      <input
                        type="text"
                        placeholder="Enter results / remarks..."
                        value={remarks[`${selectedToken._id}-${test.testName}`] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRemarks(prev => ({ ...prev, [`${selectedToken._id}-${test.testName}`]: val }));
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-xs text-[var(--text-color)] outline-none focus:ring-1 focus:ring-teal-500 transition-all font-semibold"
                      />
                      <button
                        onClick={() => handleCompleteTest(selectedToken._id, test.testName)}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 duration-100 whitespace-nowrap"
                      >
                        Submit Results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
