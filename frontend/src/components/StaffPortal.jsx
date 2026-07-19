import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { BACKEND_URL, socket } from '../App';
import InternalChatBox from './InternalChatBox';

export function StaffLogin({ setStaffToken, setStaffUser, onSuccess }) {
  const [username, setUsername] = useState('alice_staff');
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
      .catch(err => console.error('Error fetching hospitals for login:', err));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, hospital: selectedHospital })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('staffToken', data.token);
      localStorage.setItem('staffUser', JSON.stringify(data.user));
      setStaffToken(data.token);
      setStaffUser(data.user);
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
            <span className="material-symbols-outlined">shield</span>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-color)] tracking-tight">Staff Portal Login</h2>
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
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold cursor-pointer"
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
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
              required
            />
          </div>
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
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
                <span>Secure Log In</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[var(--border-color)]/30 pt-4 text-center">
          <p className="text-xs text-[var(--text-secondary)]">Authorized personnel only. Logs are active.</p>
        </div>
      </div>
    </div>
  );
}

export function StaffDashboard({ staffToken, staffUser, onLogout }) {
  const [queues, setQueues] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('dashboard'); // 'dashboard', 'monitor', 'patients', 'reminders'

  // Modals state
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Add/Edit Patient form fields
  const [patName, setPatName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patAge, setPatAge] = useState('');
  const [patGender, setPatGender] = useState('Male');
  const [patError, setPatError] = useState('');
  const [patSuccess, setPatSuccess] = useState('');

  // Search filter for patients
  const [patientSearch, setPatientSearch] = useState('');

  // Walk-in booking form fields
  const [walkName, setWalkName] = useState('');
  const [walkAge, setWalkAge] = useState('');
  const [walkGender, setWalkGender] = useState('Male');
  const [walkPhone, setWalkPhone] = useState('');
  const [walkDoctorId, setWalkDoctorId] = useState('');
  const [walkSymptoms, setWalkSymptoms] = useState('');
  const [walkIsEmergency, setWalkIsEmergency] = useState(false);
  const [walkError, setWalkError] = useState('');
  const [walkSuccess, setWalkSuccess] = useState('');

  // Reminders state
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [triggerLog, setTriggerLog] = useState(null);

  const loadData = async () => {
    try {
      const resQ = await fetch(`${BACKEND_URL}/api/v1/staff/queues`, {
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      if (resQ.status === 401 || resQ.status === 403) {
        onLogout();
        return;
      }
      const dataQ = await resQ.json();
      if (Array.isArray(dataQ)) {
        setQueues(dataQ);
        const fetchedDocs = dataQ.map(q => q.doctor).filter(Boolean);
        setDoctors(fetchedDocs);
        if (fetchedDocs.length > 0 && !walkDoctorId) {
          setWalkDoctorId(fetchedDocs[0]._id);
        }
      } else {
        console.error('Invalid queues data format:', dataQ);
      }

      // Fetch patients
      const resP = await fetch(`${BACKEND_URL}/api/v1/staff/patients`, {
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      if (resP.status === 401 || resP.status === 403) {
        onLogout();
        return;
      }
      const dataP = await resP.json();
      if (Array.isArray(dataP)) {
        setPatients(dataP);
      } else {
        console.error('Invalid patients data format:', dataP);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadReminders = async () => {
    setRemindersLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/reminders`, {
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      const data = await res.json();
      setReminders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setRemindersLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    socket.emit('join-room', 'queue:global');

    const handleQueueUpdated = () => {
      loadData();
      if (activeSidebarTab === 'reminders') {
        loadReminders();
      }
    };

    socket.on('queue-updated', handleQueueUpdated);
    socket.on('queue-reset', handleQueueUpdated);

    return () => {
      socket.off('queue-updated', handleQueueUpdated);
      socket.off('queue-reset', handleQueueUpdated);
    };
  }, [staffToken, activeSidebarTab]);

  const handleRegisterWalkIn = async (e) => {
    e.preventDefault();
    setWalkError('');
    setWalkSuccess('');

    if (!walkDoctorId) {
      setWalkError('Please select a doctor.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/tokens/walk-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          name: walkName,
          age: parseInt(walkAge),
          gender: walkGender,
          phone: walkPhone,
          doctorId: walkDoctorId,
          symptoms: walkSymptoms,
          tokenType: walkIsEmergency ? 'Emergency' : 'Regular'
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Booking failed');
      }

      setWalkSuccess(`Walk-in generated: Token ${data.token.tokenNumber}`);
      setWalkName('');
      setWalkAge('');
      setWalkPhone('');
      setWalkSymptoms('');
      setWalkIsEmergency(false);
      loadData();
    } catch (err) {
      setWalkError(err.message);
    }
  };

  const handleStatusChange = async (tokenId, status) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/staff/tokens/${tokenId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${staffToken}`
        },
        body: JSON.stringify({ status })
      });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmergencyOverride = async (tokenId) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/staff/tokens/${tokenId}/override`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setPatError('');
    setPatSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          name: patName,
          phone: patPhone,
          age: parseInt(patAge),
          gender: patGender
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      setPatSuccess('Patient added successfully!');
      setPatName('');
      setPatPhone('');
      setPatAge('');
      setPatGender('Male');
      loadData();
      setTimeout(() => {
        setShowAddPatientModal(false);
        setPatSuccess('');
      }, 1000);
    } catch (err) {
      setPatError(err.message);
    }
  };

  const handleEditPatient = async (e) => {
    e.preventDefault();
    setPatError('');
    setPatSuccess('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/patients/${selectedPatient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${staffToken}`
        },
        body: JSON.stringify({
          name: patName,
          phone: patPhone,
          age: parseInt(patAge),
          gender: patGender
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Update failed');
      }

      setPatSuccess('Patient details updated successfully!');
      loadData();
      setTimeout(() => {
        setShowEditPatientModal(false);
        setPatSuccess('');
        setSelectedPatient(null);
      }, 1000);
    } catch (err) {
      setPatError(err.message);
    }
  };

  const handleTriggerReminders = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/reminders/trigger`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${staffToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTriggerLog(data.sentReminders);
        loadReminders();
        setTimeout(() => setTriggerLog(null), 8000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Compute live Healight KPI stats
  const totalDocCount = Array.isArray(doctors) ? doctors.length : 0;
  const activeAppointmentsCount = Array.isArray(queues) ? queues.reduce((acc, q) => acc + (q.currentToken ? 1 : 0) + (q.activeQueue ? q.activeQueue.length : 0), 0) : 0;
  const availableRoomsCount = Array.isArray(queues) ? queues.filter(q => q.doctor?.availabilityStatus === 'Available').length : 0;
  const totalPatientsCount = Array.isArray(patients) ? patients.length : 0;

  // Extract next 4 appointments in line across all doctors
  const nextAppointments = [];
  if (Array.isArray(queues)) {
    queues.forEach(q => {
      if (q.currentToken) {
        nextAppointments.push({
          name: q.currentToken.patient?.name || 'Walk-in Patient',
          symptoms: q.currentToken.symptoms,
          time: q.currentToken.calledAt ? new Date(q.currentToken.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${q.currentToken.patient?.name || 'patient'}`
        });
      }
      if (Array.isArray(q.activeQueue)) {
        q.activeQueue.filter(Boolean).slice(0, 2).forEach((tok, idx) => {
          nextAppointments.push({
            name: tok.patient?.name || 'Waiting Patient',
            symptoms: tok.symptoms,
            time: `Wait: ${tok.estimatedWaitTime}m`,
            avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${tok.patient?.name || 'patient'}`
          });
        });
      }
    });
  }
  const recentAppointmentsList = nextAppointments.slice(0, 4);

  // Filter patients list
  const filteredPatients = Array.isArray(patients) ? patients.filter(p => 
    (p.name && p.name.toLowerCase().includes(patientSearch.toLowerCase())) || 
    (p.phone && p.phone.includes(patientSearch))
  ) : [];

  return (
    <div className="flex-1 flex overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] font-sans transition-colors duration-200">
      
      {/* 1. Left Sidebar Navigation Panel */}
      <div className="hidden md:flex w-64 bg-[var(--card-bg)] text-[var(--text-color)] flex-col justify-between shrink-0 shadow-lg border-r border-[var(--border-color)]/30">
        <div className="flex flex-col">
          {/* CareSync Sidebar Logo header */}
          <div className="p-6 border-b border-[var(--border-color)]/30 flex items-center space-x-3">
            <span className="material-symbols-outlined text-[var(--primary-color)] text-[32px]">local_hospital</span>
            <div>
              <h1 className="font-extrabold text-sm text-[var(--primary-color)] dark:text-zinc-300 leading-tight tracking-tight">CareSync Admin</h1>
              <p className="text-[10px] text-[var(--text-secondary)] font-semibold leading-none">General Hospital</p>
            </div>
          </div>

          {/* Navigation Links list */}
          <div className="p-4 space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', tab: 'dashboard' },
              { id: 'patients', label: 'Patients', icon: 'group', tab: 'patients' },
              { id: 'queues', label: 'Queues', icon: 'queue', tab: 'monitor' },
              { id: 'tokens', label: 'Tokens', icon: 'confirmation_number', tab: 'monitor' },
              { id: 'doctors', label: 'Doctors', icon: 'medical_services', tab: 'monitor' },
              { id: 'followups', label: 'Follow-ups', icon: 'event_repeat', tab: 'reminders' },
              { id: 'reports', label: 'Reports', icon: 'assessment', tab: 'dashboard' },
              { id: 'analytics', label: 'Analytics', icon: 'analytics', tab: 'dashboard' },
              { id: 'settings', label: 'Settings', icon: 'settings', tab: 'dashboard' }
            ].map(item => {
              const isActive = activeSidebarTab === item.tab;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSidebarTab(item.tab);
                    if (item.tab === 'reminders') loadReminders();
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    isActive 
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20' 
                      : 'hover:bg-[var(--border-color)]/20 text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary)]'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer with Staff Logged in info */}
        <div className="p-4 border-t border-[var(--border-color)]/30 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="bg-[var(--primary-color)] text-[var(--primary-text)] h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-inner">
              {staffUser?.name ? staffUser.name.charAt(0) : 'S'}
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-color)] leading-tight">{staffUser?.name || 'Staff'}</p>
              <p className="text-[10px] text-[var(--text-secondary)] font-semibold">Reception Desk</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="text-[var(--text-secondary)] hover:text-rose-500 p-2 hover:bg-[var(--border-color)]/20 rounded-lg transition-all flex items-center justify-center"
            title="Log Out Workspace"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>

      {/* 2. Main Workspace Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-[var(--bg-color)]">
        
        {/* Workspace Header toolbar */}
        <div className="px-8 py-4 bg-[var(--card-bg)] border-b border-[var(--border-color)]/30 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[var(--primary-color)] dark:text-zinc-300 tracking-tight capitalize">
              {activeSidebarTab === 'monitor' ? 'Queue Management Board' : activeSidebarTab === 'reminders' ? 'Follow-ups / Reminders' : activeSidebarTab + ' Workspace'}
            </h2>
            <p className="text-[10px] text-[var(--text-secondary)] font-semibold">{staffUser?.counterNumber || 'Reception Desk'}</p>
          </div>
          <div className="flex items-center space-x-3 text-xs md:text-sm">
            <button className="p-2 rounded-full hover:bg-[var(--border-color)]/30 text-[var(--text-secondary)] transition-colors flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </button>
            <button className="p-2 rounded-full hover:bg-[var(--border-color)]/30 text-[var(--text-secondary)] transition-colors flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>
            <button className="p-2 rounded-full hover:bg-[var(--border-color)]/30 text-[var(--primary-color)] font-bold transition-colors flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation tab bar */}
        <div className="md:hidden flex items-center space-x-2 overflow-x-auto px-6 py-3 bg-[var(--card-bg)] border-b border-[var(--border-color)]/30 sticky top-[62px] z-20 no-scrollbar">
          {[
            { id: 'dashboard', label: 'Overview', tab: 'dashboard' },
            { id: 'patients', label: 'Patients Directory', tab: 'patients' },
            { id: 'queues', label: 'Live Queue Monitor', tab: 'monitor' },
            { id: 'followups', label: 'SMS Reminders', tab: 'reminders' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveSidebarTab(item.tab);
                if (item.tab === 'reminders') loadReminders();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                activeSidebarTab === item.tab 
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-sm' 
                  : 'bg-[var(--bg-color)] text-[var(--text-secondary)] border border-[var(--border-color)]/30 hover:text-[var(--text-color)]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 whitespace-nowrap shrink-0 transition-all ml-auto"
          >
            Logout
          </button>
        </div>

        <div className="p-4 md:p-8 flex-1 flex flex-col">
          
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeSidebarTab === 'dashboard' && (
            <div className="space-y-8 animate-fade-in">
              
              {/* Widescreen KPI cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                  { label: "Today's Patients", count: totalPatientsCount, icon: 'groups', sub: 'Total registered in directory', color: 'text-[var(--primary-color)]', bg: 'bg-[var(--primary-color)]/10' },
                  { label: 'Waiting', count: activeAppointmentsCount, icon: 'hourglass_empty', sub: 'Live active queue volume', color: 'text-[var(--secondary-color)]', bg: 'bg-[var(--secondary-color)]/10' },
                  { label: 'Emergency', count: queues.reduce((acc, q) => acc + (q.currentToken && q.currentToken.tokenType === 'Emergency' ? 1 : 0) + (q.activeQueue ? q.activeQueue.filter(t => t && t.tokenType === 'Emergency').length : 0), 0), icon: 'emergency', sub: 'Critical SOS tokens active', color: 'text-[var(--error-color)]', bg: 'bg-[var(--error-bg)]/80' },
                  { label: 'Available Rooms', count: availableRoomsCount, icon: 'payments', sub: 'Doctor rooms active now', color: 'text-[var(--tertiary-color)]', bg: 'bg-[var(--tertiary-container)]/10' }
                ].map((kpi, idx) => (
                  <div key={idx} className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-xl p-5 shadow-[var(--card-shadow)] flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider mb-1">{kpi.label}</p>
                      <p className="text-3xl font-black text-[var(--primary-color)] dark:text-zinc-300 leading-none">{kpi.count}</p>
                    </div>
                    <div className={`w-11 h-11 rounded-full ${kpi.bg} flex items-center justify-center ${kpi.color}`}>
                      <span className="material-symbols-outlined text-[20px]">{kpi.icon}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Middle Section: Chart & Appointments Stack */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Card: Weekly Recovery SVG Line Chart */}
                <div className="lg:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
                    <div>
                      <h4 className="font-extrabold text-[var(--text-color)] text-base">Checkup Inflow Trends</h4>
                      <p className="text-xs text-[var(--text-secondary)] font-medium">Insights of daily checkup registrations and recoveries</p>
                    </div>
                    <div className="flex space-x-3 text-xs font-semibold">
                      <div className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-[var(--primary-color)]"></span><span className="text-[var(--text-secondary)]">Treatment</span></div>
                      <div className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-[var(--tertiary-color)]"></span><span className="text-[var(--text-secondary)]">Recovered</span></div>
                    </div>
                  </div>

                  {/* SVG Line Chart */}
                  <div className="h-64 w-full relative pt-4">
                    <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                      {/* Grid lines */}
                      <line x1="0" y1="50" x2="500" y2="50" stroke="#f5f5f4" strokeWidth="1" />
                      <line x1="0" y1="100" x2="500" y2="100" stroke="#f5f5f4" strokeWidth="1" />
                      <line x1="0" y1="150" x2="500" y2="150" stroke="#f5f5f4" strokeWidth="1" />

                      {/* Under treatment line (primary Calm Cyan) */}
                      <path 
                        d="M 10 130 Q 90 90 170 120 T 330 70 T 490 110" 
                        fill="none" 
                        stroke="var(--primary-color)" 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                      />
                      {/* Recovered line (tertiary Health Green) */}
                      <path 
                        d="M 10 170 Q 90 140 170 160 T 330 130 T 490 120" 
                        fill="none" 
                        stroke="var(--tertiary-color)" 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex justify-between items-end text-[9px] text-stone-400 font-bold px-1.5 pt-2">
                      <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Next Appointments list */}
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col space-y-4">
                  <div className="pb-2 border-b border-[var(--border-color)]/30">
                    <h4 className="font-extrabold text-[var(--text-color)] text-base">Next in Cabin Queue</h4>
                    <p className="text-xs text-[var(--text-secondary)] font-medium">Active and upcoming queue admissions</p>
                  </div>

                  {recentAppointmentsList.length > 0 ? (
                    <div className="divide-y divide-[var(--border-color)]/30 flex-1 flex flex-col justify-around">
                      {recentAppointmentsList.map((app, i) => (
                        <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-3">
                            <img src={app.avatar} alt="avatar" className="h-8 w-8 rounded-full bg-[var(--bg-color)] border border-[var(--border-color)]/30 shrink-0" />
                            <div>
                              <p className="font-bold text-[var(--text-color)]">{app.name}</p>
                              <p className="text-[10px] text-[var(--text-secondary)] truncate max-w-36 font-semibold">{app.symptoms}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-extrabold bg-[var(--bg-color)] border border-[var(--border-color)]/30 px-2 py-0.5 rounded text-[var(--text-color)]">{app.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[var(--text-secondary)] text-xs italic py-8 text-center flex-1 flex items-center justify-center">No active appointments in system.</div>
                  )}
                </div>

              </div>

              {/* Bottom Row: Doctor availability & Polyclinics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Doctor's availability status summary list */}
                <div className="md:col-span-2 bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)]">
                  <h4 className="font-extrabold text-[var(--text-color)] text-sm mb-4">Doctor Schedules & Availability</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {doctors.map(doc => (
                      <div key={doc._id} className="p-3 bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-[var(--text-color)]">{doc.name}</p>
                          <p className="text-[10px] text-[var(--text-secondary)] font-medium">{doc.department} | {doc.currentRoom}</p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          doc.availabilityStatus === 'Available' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                          doc.availabilityStatus === 'In Surgery' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                          'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                        }`}>
                          {doc.availabilityStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Polyclinic summary card */}
                <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] flex flex-col justify-between">
                  <div>
                    <h4 className="font-extrabold text-[var(--text-color)] text-sm mb-2">Hospital Departments</h4>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold mb-4">+35% checkup increase this week</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-lg font-black text-[var(--text-color)]">80</p>
                      <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">General</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[var(--text-color)]">50</p>
                      <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Peds</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[var(--text-color)]">40</p>
                      <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Cardio</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Intercom Row */}
              <div className="grid grid-cols-1 gap-8 max-w-2xl mt-8">
                <InternalChatBox token={staffToken} user={staffUser} role="Staff" />
              </div>

            </div>
          )}

          {/* TAB 2: ACTIVE QUEUE MONITOR & WALK-IN REGISTRATION */}
          {activeSidebarTab === 'monitor' && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden space-y-6 lg:space-y-0 lg:space-x-8 animate-fade-in no-scrollbar">
              {/* Left Form: Walk-in Registration */}
              <div className="w-full lg:w-80 bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-5 rounded-2xl shadow-[var(--card-shadow)] shrink-0 text-sm">
                <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4">Walk-in Registry</h3>

                {walkError && (
                  <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[16px] text-rose-500 shrink-0">error</span>
                    <span>{walkError}</span>
                  </div>
                )}

                {walkSuccess && (
                  <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-550 text-xs rounded-xl flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[16px] text-emerald-500 shrink-0">check_circle</span>
                    <span>{walkSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterWalkIn} className="space-y-4">
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Patient Name</label>
                    <input
                      type="text"
                      value={walkName}
                      onChange={(e) => setWalkName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">Age</label>
                      <input
                        type="number"
                        value={walkAge}
                        onChange={(e) => setWalkAge(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">Gender</label>
                      <select
                        value={walkGender}
                        onChange={(e) => setWalkGender(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={walkPhone}
                      onChange={(e) => setWalkPhone(e.target.value)}
                      placeholder="e.g. +1 555-0100"
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Assign Doctor</label>
                    <select
                      value={walkDoctorId}
                      onChange={(e) => setWalkDoctorId(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                    >
                      {doctors.map(doc => (
                        <option key={doc._id} value={doc._id}>
                          {doc.name} ({doc.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Symptoms Summary</label>
                    <textarea
                      value={walkSymptoms}
                      onChange={(e) => setWalkSymptoms(e.target.value)}
                      rows={2}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold resize-none"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-rose-500 animate-pulse text-[18px]">local_fire_department</span>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-color)]">Emergency SOS</p>
                        <p className="text-[10px] text-[var(--text-secondary)] font-medium">Bypass queue to top</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={walkIsEmergency}
                      onChange={(e) => setWalkIsEmergency(e.target.checked)}
                      className="h-4.5 w-4.5 text-rose-600 focus:ring-rose-500 border-[var(--border-color)] rounded"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-bold py-3 rounded-xl shadow-lg shadow-[var(--primary-color)]/10 transition-all transition-all-custom flex items-center justify-center space-x-2"
                  >
                    <span>Register Patient Walk-in</span>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </form>
              </div>

              {/* Right List: Live Doctor queue monitor cards */}
              <div className="flex-1 lg:overflow-y-auto space-y-6">
                {queues.length === 0 ? (
                  <div className="text-[var(--text-secondary)] text-sm italic py-8">No hospital queues initialized.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {queues.map(q => (
                      <div key={q._id} className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 flex flex-col space-y-4 shadow-[var(--card-shadow)]">
                        <div className="flex justify-between items-start pb-3 border-b border-[var(--border-color)]/30">
                          <div>
                            <h4 className="font-extrabold text-[var(--text-color)] text-base">{q.doctor?.name}</h4>
                            <p className="text-xs text-[var(--text-secondary)] font-semibold">{q.doctor?.department} | {q.doctor?.currentRoom}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            q.doctor?.availabilityStatus === 'Available' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                            q.doctor?.availabilityStatus === 'In Surgery' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                            'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}>
                            {q.doctor?.availabilityStatus}
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/30">
                          <span className="text-xs text-[var(--text-secondary)] font-bold">In Cabin checkup:</span>
                          {q.currentToken ? (
                            <span className="text-xs font-bold text-teal-650 bg-teal-500/10 px-3 py-1 rounded-lg border border-teal-500/20">
                              Token {q.currentToken.tokenNumber} ({q.currentToken.tokenType})
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]/50 italic">Idle Cabin</span>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col space-y-2">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Waiting list ({q.activeQueue?.length || 0})</span>
                          
                          {q.activeQueue && q.activeQueue.filter(Boolean).length > 0 ? (
                            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                              {q.activeQueue.filter(Boolean).map((tok, idx) => (
                                <div 
                                  key={tok._id}
                                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all bg-[var(--card-bg)] ${
                                    tok.tokenType === 'Emergency' 
                                      ? 'animate-flashing-emergency border-rose-500/40 bg-rose-500/5' 
                                      : 'border-[var(--border-color)] hover:border-[var(--text-secondary)]/30'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-extrabold text-[var(--text-color)]">{tok.tokenNumber}</span>
                                      <span className="text-[10px] text-[var(--text-secondary)] font-semibold">({tok.patient?.name})</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate max-w-44 font-semibold">Sym: {tok.symptoms}</p>
                                  </div>

                                  <div className="flex items-center space-x-1">
                                    {tok.tokenType !== 'Emergency' && (
                                      <button
                                        onClick={() => handleEmergencyOverride(tok._id)}
                                        className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 font-bold px-2 py-1 rounded transition-all text-[9px]"
                                        title="Emergency Override"
                                      >
                                        SOS
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleStatusChange(tok._id, 'Absent')}
                                      className="bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-color)] border border-[var(--border-color)] px-2 py-1 rounded transition-all text-[9px] font-bold"
                                    >
                                      Absent
                                    </button>
                                    <button
                                      onClick={() => handleStatusChange(tok._id, 'Completed')}
                                      className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-555 font-bold px-2 py-1 rounded transition-all text-[9px]"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--text-secondary)]/50 italic py-2">No patients currently waiting.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PATIENT MANAGEMENT REGISTRY */}
          {activeSidebarTab === 'patients' && (
            <div className="space-y-6 animate-fade-in text-[var(--text-color)]">
              
              {/* Toolbar search & Add Button */}
              <div className="flex justify-between items-center bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-4 rounded-xl shadow-[var(--card-shadow)]">
                <div className="relative max-w-xs w-full">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-xs text-[var(--text-color)] font-semibold"
                  />
                </div>
                
                <button
                  onClick={() => {
                    setPatName('');
                    setPatPhone('');
                    setPatAge('');
                    setPatGender('Male');
                    setPatError('');
                    setPatSuccess('');
                    setShowAddPatientModal(true);
                  }}
                  className="bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] text-xs font-bold px-4 py-2.5 rounded-xl transition-all transition-all-custom shadow-sm flex items-center space-x-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">person_add</span>
                  <span>Add New Patient</span>
                </button>
              </div>

              {/* Patients directory table card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden shadow-[var(--card-shadow)] flex-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[10px]">
                        <th className="p-4">Patient Name</th>
                        <th className="p-4">Phone Number</th>
                        <th className="p-4">Age</th>
                        <th className="p-4">Gender</th>
                        <th className="p-4 text-center">Visit Count</th>
                        <th className="p-4">Registered Date</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]/20 text-[var(--text-color)] font-medium">
                      {filteredPatients.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">No patient records match the criteria.</td>
                        </tr>
                      ) : (
                        filteredPatients.map(pat => (
                          <tr key={pat._id} className="hover:bg-[var(--border-color)]/10 transition-all">
                            <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">{pat.name}</td>
                            <td className="p-4 whitespace-nowrap font-semibold text-[var(--text-secondary)]">{pat.phone}</td>
                            <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">{pat.age} years</td>
                            <td className="p-4 whitespace-nowrap text-[var(--text-secondary)] font-semibold">{pat.gender}</td>
                            <td className="p-4 text-center font-black text-[var(--secondary-color)]">{pat.visitHistory ? pat.visitHistory.length : 1}</td>
                            <td className="p-4 whitespace-nowrap text-[var(--text-secondary)]">{new Date(pat.createdAt || Date.now()).toLocaleDateString()}</td>
                            <td className="p-4 text-right whitespace-nowrap space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedPatient(pat);
                                  setPatName(pat.name);
                                  setPatPhone(pat.phone);
                                  setPatAge(pat.age);
                                  setPatGender(pat.gender);
                                  setPatError('');
                                  setPatSuccess('');
                                  setShowEditPatientModal(true);
                                }}
                                className="bg-[var(--bg-color)] border border-[var(--border-color)] hover:border-[var(--secondary-color)] text-[var(--text-color)] font-bold px-3 py-1.5 rounded-lg transition-all text-[11px]"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SMS REMINDERS LOGS */}
          {activeSidebarTab === 'reminders' && (
            <div className="flex-1 flex flex-col space-y-6 animate-fade-in text-[var(--text-color)]">
              
              {/* Trigger controller */}
              <div className="flex justify-between items-center bg-[var(--card-bg)] border border-[var(--border-color)]/30 p-4 rounded-xl shadow-[var(--card-shadow)]">
                <div>
                  <h4 className="font-extrabold text-[var(--text-color)] text-sm">Dispatched Reminder Logs</h4>
                  <p className="text-[10px] text-[var(--text-secondary)] font-medium">Manually dispatch pending re-visit SMS notifications scheduled for today.</p>
                </div>
                <button
                  onClick={handleTriggerReminders}
                  className="bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
                >
                  <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                  <span>Trigger Pending Reminders</span>
                </button>
              </div>

              {triggerLog && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs space-y-2 text-emerald-600 animate-fade-in shadow-sm">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
                    <span className="font-bold">Reminders Dispatched Successfully! ({triggerLog.length} sent)</span>
                  </div>
                  {triggerLog.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                      {triggerLog.map((log, idx) => (
                        <div key={idx} className="bg-[var(--card-bg)] p-2 rounded border border-[var(--border-color)]/30">
                          <p className="font-bold text-[var(--text-color)]">To: {log.patientName} ({log.patientPhone}) | Doctor: {log.doctorName}</p>
                          <p className="text-[var(--text-secondary)] mt-0.5 font-medium">"{log.message}"</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium text-[var(--text-secondary)]">No pending reminders were scheduled for today or earlier.</p>
                  )}
                </div>
              )}

              {/* Reminders table grid */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden shadow-[var(--card-shadow)] flex-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 font-bold text-[var(--text-secondary)] uppercase tracking-wider text-[10px]">
                        <th className="p-4">Created</th>
                        <th className="p-4">Patient</th>
                        <th className="p-4">Doctor</th>
                        <th className="p-4">Scheduled Date</th>
                        <th className="p-4">Interval</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]/20 text-[var(--text-color)] font-medium">
                      {remindersLoading ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">Loading reminders...</td>
                        </tr>
                      ) : reminders.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-[var(--text-secondary)]/50 italic">No scheduled reminders recorded in system database.</td>
                        </tr>
                      ) : (
                        reminders.map(rem => (
                          <tr key={rem._id} className="hover:bg-[var(--border-color)]/10 transition-all">
                            <td className="p-4 whitespace-nowrap text-[var(--text-secondary)]">{new Date(rem.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 whitespace-nowrap">
                              <div className="font-bold text-[var(--text-color)]">{rem.patient?.name || 'Patient'}</div>
                              <div className="text-[10px] text-[var(--text-secondary)]">{rem.patient?.phone}</div>
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <div className="font-bold text-[var(--text-color)]">{rem.doctor?.name || 'Doctor'}</div>
                              <div className="text-[10px] text-[var(--text-secondary)]">{rem.doctor?.department}</div>
                            </td>
                            <td className="p-4 whitespace-nowrap text-[var(--text-color)] font-black">{new Date(rem.scheduledDate).toLocaleDateString()}</td>
                            <td className="p-4 whitespace-nowrap font-bold text-[var(--text-color)]">{rem.revisitDays} days</td>
                            <td className="p-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                rem.status === 'Pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                rem.status === 'Sent' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-555' :
                                'bg-rose-500/10 border-rose-500/20 text-rose-500'
                              }`}>
                                {rem.status}
                              </span>
                            </td>
                            <td className="p-4 max-w-56 truncate text-[var(--text-secondary)] font-medium" title={rem.message}>{rem.message}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 3. Add Patient Dialog Modal popup */}
      {showAddPatientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)]">
            <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2">
              <span className="material-symbols-outlined text-[var(--secondary-color)]">person_add</span>
              <span>Add Patient Record</span>
            </h3>

            {patError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl">
                {patError}
              </div>
            )}

            {patSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-555 text-xs rounded-xl">
                {patSuccess}
              </div>
            )}

            <form onSubmit={handleAddPatient} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Patient Full Name</label>
                <input
                  type="text"
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={patPhone}
                  onChange={(e) => setPatPhone(e.target.value)}
                  placeholder="e.g. +1 555-0100"
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Age</label>
                  <input
                    type="number"
                    value={patAge}
                    onChange={(e) => setPatAge(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Gender</label>
                  <select
                    value={patGender}
                    onChange={(e) => setPatGender(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 pt-2 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => setShowAddPatientModal(false)}
                  className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--border-color)]/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white rounded-xl shadow-lg shadow-[var(--secondary-color)]/10 transition-all"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Patient Dialog Modal popup */}
      {showEditPatientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)]">
            <h3 className="font-extrabold text-[var(--text-color)] text-base mb-4 flex items-center space-x-2 border-b border-[var(--border-color)]/30 pb-2">
              <span className="material-symbols-outlined text-[var(--secondary-color)]">edit</span>
              <span>Edit Patient Record</span>
            </h3>

            {patError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl">
                {patError}
              </div>
            )}

            {patSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-555 text-xs rounded-xl">
                {patSuccess}
              </div>
            )}

            <form onSubmit={handleEditPatient} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Patient Full Name</label>
                <input
                  type="text"
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={patPhone}
                  onChange={(e) => setPatPhone(e.target.value)}
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Age</label>
                  <input
                    type="number"
                    value={patAge}
                    onChange={(e) => setPatAge(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Gender</label>
                  <select
                    value={patGender}
                    onChange={(e) => setPatGender(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2.5 outline-none font-bold text-[var(--text-color)]"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 pt-2 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditPatientModal(false);
                    setSelectedPatient(null);
                  }}
                  className="flex-1 py-3 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--border-color)]/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/95 text-white rounded-xl shadow-lg shadow-[var(--secondary-color)]/10 transition-all"
                >
                  Update Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
