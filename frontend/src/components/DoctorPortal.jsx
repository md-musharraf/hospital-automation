import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';
import InternalChatBox from './InternalChatBox';

export function DoctorLogin({ setDoctorToken, setDoctorUser, onSuccess }) {
  const [email, setEmail] = useState('sarah.jenkins@hospital.com');
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
      .catch(err => console.error('Error fetching hospitals for doctor login:', err));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, hospital: selectedHospital })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('doctorToken', data.token);
      localStorage.setItem('doctorUser', JSON.stringify(data.user));
      setDoctorToken(data.token);
      setDoctorUser(data.user);
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
          <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-amber-500">
            <span className="material-symbols-outlined">stethoscope</span>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-color)] tracking-tight">Doctor Console Login</h2>
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
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-amber-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold cursor-pointer"
            >
              {hospitals.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-amber-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
              required
            />
          </div>
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-amber-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--text-color)] text-[var(--bg-color)] font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? <span>Connecting...</span> : (
              <>
                <span className="material-symbols-outlined text-[16px]">lock</span>
                <span>Log In to Cabin</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[var(--border-color)]/30 pt-4 text-center">
          <p className="text-xs text-[var(--text-secondary)]">Secure clinical terminal access.</p>
        </div>
      </div>
    </div>
  );
}

export function DoctorDashboard({ doctorToken, doctorUser, onLogout }) {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState(doctorUser?.availabilityStatus || 'Available');

  // Complete Checkup Modal states
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [revisitSelection, setRevisitSelection] = useState('none');
  const [customRevisitDays, setCustomRevisitDays] = useState('30');
  
  // Custom prescription and lab integrations
  const [medicines, setMedicines] = useState([{ name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }]);
  const [advice, setAdvice] = useState('');
  const [history, setHistory] = useState([]);
  const [labTestName, setLabTestName] = useState('Complete Blood Count (CBC)');
  const [customLabTest, setCustomLabTest] = useState('');

  // Fetch patient visit history when token changes
  useEffect(() => {
    if (queue?.currentToken?.patient?._id) {
      const fetchHistory = async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/v1/doctor/patients/${queue.currentToken.patient._id}/history`, {
            headers: { 'Authorization': `Bearer ${doctorToken}` }
          });
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
        headers: { 'Authorization': `Bearer ${doctorToken}` }
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

  useEffect(() => {
    loadQueue();

    socket.emit('join-room', `doctor:${doctorUser?.id || doctorUser?._id}`);

    const handleQueueUpdated = () => {
      loadQueue();
    };

    socket.on('queue-updated', handleQueueUpdated);
    socket.on('queue-reset', handleQueueUpdated);

    return () => {
      socket.off('queue-updated', handleQueueUpdated);
      socket.off('queue-reset', handleQueueUpdated);
    };
  }, [doctorToken]);

  const handleUpdateAvailability = async (status) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doctorToken}`
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

  const handleCallNext = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/call-next`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${doctorToken}` }
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
      await fetch(`${BACKEND_URL}/api/v1/doctor/queue/complete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doctorToken}` 
        },
        body: JSON.stringify({ revisitDays, medicines, advice })
      });
      loadQueue();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAbsent = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/doctor/queue/mark-absent`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${doctorToken}` }
      });
      loadQueue();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBuffer = async (mins) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/doctor/queue/add-buffer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ minutes: parseInt(mins) })
      });
      loadQueue();
    } catch (err) {
      console.error(err);
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
          'Authorization': `Bearer ${doctorToken}`
        },
        body: JSON.stringify({ testName: name })
      });
      if (res.ok) {
        setCustomLabTest('');
        loadQueue();
      } else {
        const data = await res.json();
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      
      {/* Left Sidebar - Doctor status & Live queue list */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{doctorUser?.name}</h3>
            <p className="text-xs text-[var(--text-secondary)] font-medium">{doctorUser?.department} | {doctorUser?.currentRoom}</p>
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
          <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Availability Status</label>
          <div className="grid grid-cols-3 gap-1 bg-[var(--bg-color)] p-1 rounded-xl border border-[var(--border-color)]/50 text-xs">
            {['Available', 'In Surgery', 'On Break'].map(status => (
              <button
                key={status}
                onClick={() => handleUpdateAvailability(status)}
                className={`py-1.5 rounded-lg font-bold transition-all ${
                  availability === status 
                    ? status === 'Available' ? 'bg-emerald-600 text-white shadow-sm' : 
                      status === 'In Surgery' ? 'bg-rose-600 text-white shadow-sm' : 'bg-amber-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                }`}
              >
                {status.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Live waiting list */}
        <div className="flex-1 flex flex-col space-y-2">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
            Waiting Patients ({queue?.activeQueue?.length || 0})
          </span>

          {loading ? (
            <div className="text-[var(--text-secondary)] text-xs">Loading queue list...</div>
          ) : queue?.activeQueue && queue.activeQueue.filter(Boolean).length > 0 ? (
            <div className="space-y-2">
              {queue.activeQueue.filter(Boolean).map((tok, idx) => (
                <div 
                  key={tok._id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs shadow-sm bg-[var(--card-bg)] ${
                    tok.tokenType === 'Emergency' 
                      ? 'animate-flashing-crimson border-rose-500/40 bg-rose-500/5' 
                      : idx === 0 
                        ? 'border-emerald-500/40 bg-emerald-500/5' 
                        : 'border-[var(--border-color)]/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-[var(--text-color)]">{tok.tokenNumber}</span>
                      {idx === 0 && <span className="text-[9px] font-extrabold text-emerald-605 uppercase tracking-wide">Up Next</span>}
                      {tok.tokenType === 'Emergency' && <span className="text-[9px] font-extrabold text-rose-500 uppercase tracking-wide">SOS</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{tok.patient?.name} ({tok.patient?.age}y)</p>
                  </div>
                  <span className="text-[10px] font-bold text-orange-600">{tok.estimatedWaitTime}m</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--text-secondary)]/50 italic py-2">No patients waiting in queue.</div>
          )}
        </div>
      </div>

      {/* Right Core Cabin Controls & Active Patient Card */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)]">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Active Cabin Workstation</h3>

        {loading ? (
          <div className="text-[var(--text-secondary)] text-sm">Loading cabin state...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Center Area: Current Patient details */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Active patient summary card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 relative overflow-hidden shadow-[var(--card-shadow)] text-[var(--text-color)]">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Currently In Cabin</span>
                    <h2 className="text-3xl font-extrabold text-[var(--text-color)] tracking-tight mt-1">
                      {queue?.currentToken ? queue.currentToken.patient?.name : 'No Active Patient'}
                    </h2>
                    {queue?.currentToken && (
                      <p className="text-xs text-[var(--text-secondary)] font-medium mt-1">
                        Age: {queue.currentToken.patient?.age} | Gender: {queue.currentToken.patient?.gender} | Phone: {queue.currentToken.patient?.phone}
                      </p>
                    )}
                  </div>
                  
                  {queue?.currentToken && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-2 text-center shrink-0">
                      <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Active Token</span>
                      <p className="text-xl font-black text-orange-600">{queue.currentToken.tokenNumber}</p>
                    </div>
                  )}
                </div>

                {queue?.currentToken ? (
                  <div className="pt-4 border-t border-[var(--border-color)]/20 space-y-3">
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-sm">
                      <span className="text-xs text-[var(--text-secondary)] font-bold">Reported Symptoms:</span>
                      <p className="text-[var(--text-color)] mt-1 font-medium">{queue.currentToken.symptoms}</p>
                    </div>

                    {/* Assistant Chatbot Context (History) */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-xs">
                      <span className="text-xs text-[var(--text-secondary)] font-bold">Assistant Chatbot Context (History)</span>
                      
                      <div className="mt-2 max-h-36 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                        {queue.currentToken.chatHistory && queue.currentToken.chatHistory.length > 0 ? (
                          queue.currentToken.chatHistory.map((ch, idx) => (
                            <div key={idx} className="flex flex-col space-y-0.5">
                              <span className={`font-bold ${ch.sender === 'user' ? 'text-orange-600' : 'text-[var(--text-secondary)]'}`}>
                                {ch.sender === 'user' ? 'Patient' : 'Bot'}:
                              </span>
                              <span className="text-[var(--text-color)] font-medium">{ch.message}</span>
                            </div>
                          ))
                        ) : (
                          // Fallback history
                          <div className="space-y-1 text-[var(--text-secondary)]/70 italic font-medium">
                            <p className="font-bold text-[var(--text-secondary)]">Bot: <span className="font-normal">Select an option...</span></p>
                            <p className="font-bold text-orange-600">Patient: <span className="font-normal">Book New Appointment</span></p>
                            <p className="font-bold text-[var(--text-secondary)]">Bot: <span className="font-normal">Enter patient phone:</span></p>
                            <p className="font-bold text-orange-600">Patient: <span className="font-normal">{queue.currentToken.patient?.phone}</span></p>
                            <p className="font-bold text-[var(--text-secondary)]">Bot: <span className="font-normal">Enter patient full name:</span></p>
                            <p className="font-bold text-orange-600">Patient: <span className="font-normal">{queue.currentToken.patient?.name}</span></p>
                            <p className="font-bold text-[var(--text-secondary)]">Bot: <span className="font-normal">Please describe symptoms:</span></p>
                            <p className="font-bold text-orange-600">Patient: <span className="font-normal">{queue.currentToken.symptoms}</span></p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Active Lab Tests Section */}
                    {queue.currentToken.labTests && queue.currentToken.labTests.length > 0 && (
                      <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-xs">
                        <span className="text-xs text-[var(--text-secondary)] font-bold">Ordered Lab Tests & Diagnostics</span>
                        <div className="mt-2 space-y-1.5">
                          {queue.currentToken.labTests.map((t, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-[var(--card-bg)] p-2 rounded-lg border border-[var(--border-color)]/20">
                              <span className="font-bold text-[var(--text-color)]">{t.testName}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide border ${
                                t.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              }`}>
                                {t.status === 'Completed' ? `Completed: ${t.remarks}` : 'Pending Lab'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Order Lab Tests panel */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-xs">
                      <span className="text-xs text-[var(--text-secondary)] font-bold">Order Lab Diagnostics</span>
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

                        <button
                          type="submit"
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-sm transition-all active:scale-[0.97]"
                        >
                          Order Test
                        </button>
                      </form>
                    </div>

                    {/* Visit History Section */}
                    <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/50 text-xs">
                      <span className="text-xs text-[var(--text-secondary)] font-bold">Patient Visit History ({history.length} past visits)</span>
                      {history.length === 0 ? (
                        <p className="text-[10px] text-[var(--text-secondary)]/50 italic mt-1 font-medium">No past checkups registered in CareSync directory.</p>
                      ) : (
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {history.map((h, idx) => (
                            <div key={idx} className="bg-[var(--card-bg)] p-2.5 rounded-lg border border-[var(--border-color)]/30 space-y-1">
                              <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)]">
                                <span className="font-bold">{new Date(h.completedAt).toLocaleDateString()}</span>
                                <span className="font-extrabold uppercase text-orange-600">{h.tokenNumber}</span>
                              </div>
                              <p className="font-medium text-[var(--text-color)]"><span className="font-bold text-[var(--text-secondary)] text-zinc-400">Symptoms:</span> {h.symptoms}</p>
                              {h.prescription && h.prescription.medicines && h.prescription.medicines.length > 0 && (
                                <div className="text-[10px] text-[var(--text-secondary)] border-t border-[var(--border-color)]/10 pt-1">
                                  <span className="font-bold text-zinc-400">Prescription:</span> {h.prescription.medicines.map(m => `${m.name} (${m.dosage})`).join(', ')}
                                </div>
                              )}
                              {h.labTests && h.labTests.length > 0 && (
                                <div className="text-[10px] text-teal-650 mt-1">
                                  <span className="font-bold text-teal-650">Tests:</span> {h.labTests.map(t => `${t.testName} (${t.status === 'Completed' ? t.remarks : 'Pending'})`).join(', ')}
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
                    <span className="material-symbols-outlined text-[36px] mb-2 text-[var(--text-secondary)]/40">groups</span>
                    <p className="text-sm font-bold text-[var(--text-color)]">Cabin is Idle</p>
                    <p className="text-xs text-[var(--text-secondary)] max-w-xs mt-1 font-medium">Press "Call Next Patient" to admit the front-most token waiting in your queue.</p>
                  </div>
                )}
              </div>

              {/* Doctor Control buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  onClick={handleCallNext}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all text-sm flex flex-col items-center justify-center space-y-1 border border-amber-500/20"
                >
                  <span className="material-symbols-outlined text-[20px]">group</span>
                  <span>Call Next Patient</span>
                  <span className="text-[10px] text-amber-100 font-normal">Admit next in line</span>
                </button>

                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={!queue?.currentToken}
                  className={`font-bold py-4 px-6 rounded-2xl transition-all text-sm flex flex-col items-center justify-center space-y-1 border ${
                    queue?.currentToken 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/20 shadow-lg shadow-emerald-500/10 cursor-pointer' 
                      : 'bg-[var(--border-color)]/10 border-[var(--border-color)]/30 text-[var(--text-secondary)]/35 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  <span>Complete Checkup</span>
                  <span className="text-[10px] text-slate-100 font-normal">Conclude session</span>
                </button>

                <button
                  onClick={handleMarkAbsent}
                  disabled={!queue?.currentToken}
                  className={`font-bold py-4 px-6 rounded-2xl transition-all text-sm flex flex-col items-center justify-center space-y-1 border ${
                    queue?.currentToken 
                      ? 'bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-color)] border-[var(--border-color)] shadow-sm' 
                      : 'bg-[var(--border-color)]/10 border-[var(--border-color)]/30 text-[var(--text-secondary)]/35 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">cancel</span>
                  <span>Mark Patient Absent</span>
                  <span className="text-[10px] text-[var(--text-secondary)] font-normal">Skip current token</span>
                </button>
              </div>

            </div>

            {/* Right Pane: Buffer delays & info panel */}
            <div className="space-y-6">
              
              {/* Delay Management Card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 flex flex-col space-y-4 shadow-[var(--card-shadow)]">
                <div>
                  <h4 className="font-bold text-[var(--text-color)] text-sm">Add Buffer Delay</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Increases estimated wait time for all waiting patients.</p>
                </div>

                <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 text-center flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Active Buffer Delay</span>
                  <p className="text-3xl font-black text-amber-600 mt-1">{queue?.bufferDelay || 0} <span className="text-sm font-medium">mins</span></p>
                </div>

                {/* Adjuster Buttons */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button 
                    onClick={() => handleAddBuffer(10)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-amber-500/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all"
                  >
                    +10 mins
                  </button>
                  <button 
                    onClick={() => handleAddBuffer(15)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-amber-500/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all"
                  >
                    +15 mins
                  </button>
                  <button 
                    onClick={() => handleAddBuffer(30)}
                    className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] hover:border-amber-500/30 text-[var(--text-color)] p-2.5 rounded-xl font-bold transition-all"
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

              {/* Internal Intercom Chatbox */}
              <InternalChatBox token={doctorToken} user={doctorUser} role="Doctor" />

              {/* Informative Stats Box */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 text-xs text-[var(--text-secondary)] space-y-2 shadow-sm">
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
            <p className="text-xs text-[var(--text-secondary)] mb-6">Conclude checkup for **{queue?.currentToken?.patient?.name || 'the patient'}**. Please review digital prescription details below.</p>
            
            {/* Prescription Form Section */}
            <div className="space-y-4 mb-6 pb-6 border-b border-[var(--border-color)]/30 text-xs text-left">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Prescribe Medications</span>
                <button
                  type="button"
                  onClick={() => setMedicines(prev => [...prev, { name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }])}
                  className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-550 rounded-lg hover:bg-amber-500 hover:text-white transition-all font-bold"
                >
                  + Add Medicine
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {medicines.map((med, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/30 relative text-left">
                    <div>
                      <label className="block text-[10px] text-[var(--text-secondary)] font-bold mb-0.5">Medicine Name</label>
                      <input
                        type="text"
                        placeholder="Paracetamol"
                        value={med.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, name: val } : m));
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-xs text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-secondary)] font-bold mb-0.5">Dosage</label>
                      <input
                        type="text"
                        placeholder="1-0-1"
                        value={med.dosage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, dosage: val } : m));
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-xs text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-secondary)] font-bold mb-0.5">Duration</label>
                      <input
                        type="text"
                        placeholder="5 days"
                        value={med.duration}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, duration: val } : m));
                        }}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-xs text-[var(--text-color)] outline-none font-bold"
                        required
                      />
                    </div>
                    <div className="flex items-end space-x-1.5 text-left">
                      <div className="flex-1">
                        <label className="block text-[10px] text-[var(--text-secondary)] font-bold mb-0.5">Instructions</label>
                        <input
                          type="text"
                          placeholder="After food"
                          value={med.instructions}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, instructions: val } : m));
                          }}
                          className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-lg px-2 py-1 text-xs text-[var(--text-color)] outline-none font-bold"
                        />
                      </div>
                      {medicines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMedicines(prev => prev.filter((_, i) => i !== idx))}
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
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 text-left">Doctor's Advice & Directives</label>
                <textarea
                  placeholder="Drink plenty of water, avoid cold items..."
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/65 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-[var(--text-color)] outline-none font-semibold min-h-[64px]"
                />
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm text-left">
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider text-left">Re-visit Reminder Interval</label>
              <div className="grid grid-cols-2 gap-2 text-left">
                {[
                  { label: 'No Re-visit / No Reminder', value: 'none' },
                  { label: 'Today (Immediate Test)', value: '0' },
                  { label: '3 Days Re-visit', value: '3' },
                  { label: '7 Days (1 Week)', value: '7' },
                  { label: '14 Days (2 Weeks)', value: '14' },
                  { label: 'Custom Days...', value: 'custom' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRevisitSelection(opt.value)}
                    className={`p-3 rounded-xl border text-left font-bold transition-all ${
                      revisitSelection === opt.value
                        ? 'bg-amber-500/10 border-amber-500 text-amber-550 shadow-sm'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)]/60 text-[var(--text-color)] hover:bg-[var(--border-color)]/30'
                    }`}
                  >
                    <span className="block text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>

              {revisitSelection === 'custom' && (
                <div className="mt-3 animate-fade-in text-left">
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Enter Custom Days</label>
                  <input
                    type="number"
                    value={customRevisitDays}
                    onChange={(e) => setCustomRevisitDays(e.target.value)}
                    min="1"
                    max="365"
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-amber-500 rounded-xl px-4 py-2 text-[var(--text-color)] outline-none font-bold"
                  />
                </div>
              )}
            </div>

            <div className="flex space-x-3 text-sm">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setRevisitSelection('none');
                }}
                className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] font-bold hover:bg-[var(--border-color)]/20 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  let days = null;
                  if (revisitSelection !== 'none') {
                    days = revisitSelection === 'custom' ? parseInt(customRevisitDays) : parseInt(revisitSelection);
                  }
                  await handleComplete(days, medicines, advice);
                  setShowCompleteModal(false);
                  setRevisitSelection('none');
                  setMedicines([{ name: '', dosage: '1-0-1', duration: '5 days', instructions: 'After food' }]);
                  setAdvice('');
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/10 transition-all"
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
