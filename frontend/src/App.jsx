import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  MessageSquare, User, Shield, Stethoscope, 
  Send, Users, Activity, Flame, Clock, 
  CheckCircle, AlertOctagon, XCircle, LogOut,
  ChevronRight, Lock, Calendar, RefreshCw, Volume2
} from 'lucide-react';

const BACKEND_URL = import.meta.env.DEV
  ? 'http://localhost:5000'
  : (window.location.origin.includes('vercel.app')
      ? 'https://hospital-automation-nc4h.onrender.com'
      : window.location.origin);

// Global Socket Instance
const socket = io(BACKEND_URL);

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

function AppContent() {
  const [staffToken, setStaffToken] = useState(localStorage.getItem('staffToken') || '');
  const [staffUser, setStaffUser] = useState(() => {
    try {
      const u = localStorage.getItem('staffUser');
      return u && u !== 'undefined' ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  });
  const [doctorToken, setDoctorToken] = useState(localStorage.getItem('doctorToken') || '');
  const [doctorUser, setDoctorUser] = useState(() => {
    try {
      const u = localStorage.getItem('doctorUser');
      return u && u !== 'undefined' ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  });
  const [labToken, setLabToken] = useState(localStorage.getItem('labToken') || '');
  const [labUser, setLabUser] = useState(() => {
    try {
      const u = localStorage.getItem('labUser');
      return u && u !== 'undefined' ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  });

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Global socket setup
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to socket server:', socket.id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleStaffLogout = () => {
    localStorage.removeItem('staffToken');
    localStorage.removeItem('staffUser');
    setStaffToken('');
    setStaffUser(null);
    navigate('/staff/login');
  };

  const handleDoctorLogout = () => {
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('doctorUser');
    setDoctorToken('');
    setDoctorUser(null);
    navigate('/doctor/login');
  };

  const handleLabLogout = () => {
    localStorage.removeItem('labToken');
    localStorage.removeItem('labUser');
    setLabToken('');
    setLabUser(null);
    navigate('/lab/login');
  };

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] flex flex-col font-sans transition-colors duration-200">
      {/* Floating Demo Navigation Bar */}
      <div className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/60 px-4 py-2.5 flex items-center justify-between z-50 shadow-lg shadow-black/5">
        <div className="flex items-center space-x-2">
          <div className="bg-orange-600 p-1.5 rounded-lg shadow-sm shadow-orange-500/20">
            <Activity className="h-5 w-5 text-white animate-pulse" />
          </div>
          <span className="font-extrabold tracking-tight text-lg text-[var(--text-color)]">CareSync <span className="text-xs text-orange-500 font-semibold">DEMO</span></span>
        </div>
        
        <div className="flex items-center space-x-2 text-xs md:text-sm">
          {/* Light/Dark Toggle Button */}
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-color)] hover:bg-[var(--border-color)]/25 transition-colors flex items-center justify-center mr-2 active:scale-95 duration-100"
            title="Toggle Theme Mode"
          >
            {theme === 'light' ? (
              <span className="material-symbols-outlined text-[18px]">dark_mode</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">light_mode</span>
            )}
          </button>

          <button 
            onClick={() => navigate('/')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname === '/' ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Patient Portal</span>
          </button>
          
          <button 
            onClick={() => navigate(staffToken ? '/staff/dashboard' : '/staff/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/staff') ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Staff Dashboard</span>
          </button>
          
          <button 
            onClick={() => navigate(doctorToken ? '/doctor/dashboard' : '/doctor/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/doctor') ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <Stethoscope className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Doctor Console</span>
          </button>

          <button 
            onClick={() => navigate(labToken ? '/lab/dashboard' : '/lab/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/lab') ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">science</span>
            <span className="hidden sm:inline-block">Lab Console</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Routes>
          <Route path="/" element={<HospitalHub />} />
          <Route path="/hospital/:hospitalId" element={<PatientPortal />} />
          <Route 
            path="/staff/login" 
            element={
              staffToken ? (
                <Navigate to="/staff/dashboard" replace />
              ) : (
                <StaffLogin 
                  setStaffToken={setStaffToken} 
                  setStaffUser={setStaffUser} 
                  onSuccess={() => navigate('/staff/dashboard')} 
                />
              )
            } 
          />
          <Route 
            path="/staff/dashboard" 
            element={
              staffToken ? (
                <StaffDashboard 
                  staffToken={staffToken} 
                  staffUser={staffUser} 
                  onLogout={handleStaffLogout} 
                />
              ) : (
                <Navigate to="/staff/login" replace />
              )
            } 
          />
          <Route 
            path="/doctor/login" 
            element={
              doctorToken ? (
                <Navigate to="/doctor/dashboard" replace />
              ) : (
                <DoctorLogin 
                  setDoctorToken={setDoctorToken} 
                  setDoctorUser={setDoctorUser} 
                  onSuccess={() => navigate('/doctor/dashboard')} 
                />
              )
            } 
          />
          <Route 
            path="/doctor/dashboard" 
            element={
              doctorToken ? (
                <DoctorDashboard 
                  doctorToken={doctorToken} 
                  doctorUser={doctorUser} 
                  onLogout={handleDoctorLogout} 
                />
              ) : (
                <Navigate to="/doctor/login" replace />
              )
            } 
          />
          <Route 
            path="/lab/login" 
            element={
              labToken ? (
                <Navigate to="/lab/dashboard" replace />
              ) : (
                <LabLogin 
                  setLabToken={setLabToken} 
                  setLabUser={setLabUser} 
                  onSuccess={() => navigate('/lab/dashboard')} 
                />
              )
            } 
          />
          <Route 
            path="/lab/dashboard" 
            element={
              labToken ? (
                <LabDashboard 
                  labToken={labToken} 
                  labUser={labUser} 
                  onLogout={handleLabLogout} 
                />
              ) : (
                <Navigate to="/lab/login" replace />
              )
            } 
          />
          <Route path="/track/:tokenId" element={<PatientLiveTracker />} />
          <Route path="/prescription/:tokenId" element={<DigitalPrescriptionViewer />} />
          <Route path="/public-display" element={<PublicTVDisplay />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

/* ==========================================================================
   HOSPITAL DIRECTORY HUB: B2B SAAS SELECTION DIRECTORY
   ========================================================================== */
function HospitalHub() {
  const [hospitals, setHospitals] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('All');
  const [userCoords, setUserCoords] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals`)
      .then(res => res.json())
      .then(data => {
        setHospitals(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching hospitals:', err);
        setLoading(false);
      });
  }, []);

  // Haversine formula to calculate distance in km between two lat/lng coordinates
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleFindNearMe = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLoading(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserCoords({ lat: latitude, lng: longitude });
        setGeoLoading(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setGeoError('Location access denied or unavailable.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Get unique list of cities
  const cities = ['All', ...new Set(hospitals.map(h => h.city).filter(Boolean))];

  // Process sorting, city filtering, and searching
  let processedHospitals = hospitals.map(h => {
    if (userCoords && h.coordinates) {
      const distance = calculateDistance(userCoords.lat, userCoords.lng, h.coordinates.lat, h.coordinates.lng);
      return { ...h, distance };
    }
    return h;
  });

  // Filter by selected city
  if (selectedCity !== 'All') {
    processedHospitals = processedHospitals.filter(h => h.city === selectedCity);
  }

  // Filter by search query
  const filteredHospitals = processedHospitals.filter(h => 
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (h.city && h.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Sort by distance if user location is active
  if (userCoords) {
    filteredHospitals.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-orange-600/10 via-[var(--bg-color)] to-[var(--bg-color)] py-16 px-6 sm:px-12 text-center border-b border-[var(--border-color)]/25">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 bg-orange-600/10 text-orange-600 dark:text-orange-400 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 animate-pulse">
            <span className="material-symbols-outlined text-[14px]">hub</span>
            <span>CareSync Multi-Hospital Network</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Smart Waiting Lines for <br />
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">Modern Healthcare</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-[var(--text-secondary)] font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
            Eliminate long physical queues, check real-time estimated cabin wait times, and register walk-in or virtual appointments instantly. Select a partner hospital below to begin booking your token.
          </p>

          {/* Search Bar & Location Trigger */}
          <div className="max-w-xl mx-auto flex items-center justify-center">
            <div className="flex-1 relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-amber-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-300"></div>
              <div className="relative bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-2xl flex items-center px-4 py-2.5 shadow-lg shadow-black/5">
                <span className="material-symbols-outlined text-zinc-400 mr-3 text-[22px]">search</span>
                <input 
                  type="text" 
                  placeholder="Search hospital by name, department, or city..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-sm font-semibold focus:ring-0 text-[var(--text-color)] placeholder-zinc-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-1 rounded-full hover:bg-[var(--border-color)]/25 flex items-center">
                    <span className="material-symbols-outlined text-[16px] text-zinc-400">close</span>
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={handleFindNearMe}
              disabled={geoLoading}
              className={`ml-3 flex items-center justify-center p-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:text-orange-600 transition-all active:scale-95 duration-100 disabled:opacity-50 shadow-md ${
                userCoords ? 'text-orange-600 border-orange-500/40 bg-orange-600/5' : ''
              }`}
              title="Find hospitals near me"
            >
              <span className={`material-symbols-outlined text-[20px] ${geoLoading ? 'animate-spin' : ''}`}>
                {geoLoading ? 'refresh' : 'my_location'}
              </span>
            </button>
          </div>

          {geoError && (
            <p className="text-xs text-rose-500 font-bold mt-3 animate-bounce">{geoError}</p>
          )}
          {userCoords && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-3">
              📍 Location access granted. Sorting directory by nearest hospitals first!
            </p>
          )}

          {/* City Filter Row */}
          {!loading && hospitals.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 max-w-xl mx-auto justify-center mt-6">
              {cities.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 duration-100 ${
                    selectedCity === city
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-500/10'
                      : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/25'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Directory Grid */}
      <div className="max-w-[1280px] mx-auto py-12 px-6 sm:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-black">Partner Hospital Directory</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">Select a facility to check waiting queues</p>
          </div>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest bg-[var(--border-color)]/20 px-3 py-1 rounded-full">
            {filteredHospitals.length} Found
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <span className="material-symbols-outlined text-[48px] text-orange-600 animate-spin">refresh</span>
            <p className="text-sm font-bold text-[var(--text-secondary)]">Loading partner hospitals...</p>
          </div>
        ) : filteredHospitals.length === 0 ? (
          <div className="text-center py-20 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]/30 p-8 shadow-sm">
            <span className="material-symbols-outlined text-[54px] text-zinc-300 dark:text-zinc-700 mb-3">clinical_trial</span>
            <h3 className="text-lg font-black mb-1">No Hospitals Found</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">We couldn't find any hospitals matching "{searchQuery}". Try adjusting your keywords or search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredHospitals.map(h => (
              <div 
                key={h.id} 
                onClick={() => navigate(`/hospital/${h.id}`)}
                className="group cursor-pointer bg-[var(--card-bg)] border border-[var(--border-color)]/40 hover:border-orange-500/40 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1 transition-all duration-300 flex flex-col relative min-w-0"
              >
                {/* Cover Image */}
                <div className="h-48 w-full overflow-hidden relative bg-zinc-800">
                  <img 
                    src={h.coverImage} 
                    alt={h.name} 
                    className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                  
                  {/* Status Badges */}
                  <span className="absolute top-4 right-4 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                    <span>Active Queue</span>
                  </span>

                  {/* Proximity Distance Badge */}
                  {h.distance !== undefined && (
                    <span className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1">
                      <span className="material-symbols-outlined text-[12px] text-orange-400">near_me</span>
                      <span>{h.distance.toFixed(1)} km away</span>
                    </span>
                  )}

                  {/* City Label Badge */}
                  {h.city && (
                    <span className="absolute bottom-4 left-4 text-white text-[10px] font-black uppercase tracking-wider bg-orange-600 px-2.5 py-0.5 rounded shadow-sm">
                      {h.city}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-xl font-extrabold group-hover:text-orange-500 transition duration-150 mb-2 leading-tight">
                    {h.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed mb-4 line-clamp-2">
                    {h.description}
                  </p>
                  
                  {/* Stats & Metadata */}
                  <div className="grid grid-cols-2 gap-3 mb-6 bg-[var(--bg-color)] rounded-xl p-3 border border-[var(--border-color)]/20 text-xs font-semibold text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-zinc-400">location_on</span>
                      <span className="truncate">{h.address.split(',')[0]}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-zinc-400">call</span>
                      <span className="truncate">{h.phone}</span>
                    </div>
                  </div>

                  {/* CTA Footer */}
                  <div className="mt-auto pt-4 border-t border-[var(--border-color)]/30 flex justify-between items-center">
                    <div className="flex items-center space-x-2 text-xs font-black text-emerald-600 dark:text-emerald-400">
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>WhatsApp Available</span>
                    </div>
                    <button 
                      className="bg-orange-600 group-hover:bg-orange-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl flex items-center space-x-1 shadow-md shadow-orange-500/10 active:scale-95 duration-100 transition-all"
                    >
                      <span>Enter Portal</span>
                      <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition duration-150">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trust & Guarantee Section */}
      <div className="bg-[var(--card-bg)] border-t border-[var(--border-color)]/30 py-12 px-6 sm:px-8 text-center text-xs text-[var(--text-secondary)] font-semibold">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex justify-center space-x-6 text-[var(--text-color)] mb-2">
            <div className="flex items-center space-x-1">
              <span className="material-symbols-outlined text-orange-600 text-[18px]">verified_user</span>
              <span>HIPAA Compliant</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="material-symbols-outlined text-orange-600 text-[18px]">security</span>
              <span>End-to-End Encrypted</span>
            </div>
          </div>
          <p>
            CareSync is a registered healthcare SaaS queue management provider. By joining any queue, you agree to our Terms of Service and Privacy Policy. Patient information is strictly handled in accordance with medical standards.
          </p>
          <p className="text-[10px] text-zinc-400">
            &copy; 2026 CareSync Technologies Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PATIENT PORTAL: CHAT-FIRST WIDGET & LIVE TOKEN VIEW
   ========================================================================== */
function PatientPortal() {
  const { hospitalId } = useParams();
  const [whatsappNumber, setWhatsappNumber] = useState('+1 (415) 523-8886');
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [loadingHosp, setLoadingHosp] = useState(true);
  const navigate = useNavigate();

  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Welcome to the CareSync AI Assistant! 🏥' },
    { sender: 'bot', text: "I can help you book an appointment, check live queues, or trigger emergency tokens. Send a message like 'Hi' or 'Hello' to begin!" }
  ]);
  const [options, setOptions] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substr(2, 9));
  const [myToken, setMyToken] = useState(null);
  const [calledAlert, setCalledAlert] = useState(null);

  const [waitTimes, setWaitTimes] = useState({
    'Emergency': 15,
    'General Practice': 15,
    'Pediatrics': 10
  });

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load hospital information dynamically
  useEffect(() => {
    const hospId = hospitalId || 'general-hospital';
    setLoadingHosp(true);
    fetch(`${BACKEND_URL}/api/v1/chat/hospital/${hospId}`)
      .then(res => res.json())
      .then(data => {
        setHospitalInfo(data);
        if (data.whatsappNumber) {
          setWhatsappNumber(data.whatsappNumber);
        }
        setLoadingHosp(false);
      })
      .catch(err => {
        console.error('Error loading hospital config:', err);
        setLoadingHosp(false);
      });
  }, [hospitalId]);

  useEffect(() => {
    // Send a silent init message to get the initial language options
    const hospId = hospitalId || 'general-hospital';
    fetch(`${BACKEND_URL}/api/v1/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: 'hi', hospitalId: hospId })
    })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Status ${res.status}`);
      }
      return data;
    })
    .then(data => {
      if (data.options) {
        setOptions(data.options);
      }
    })
    .catch(err => {
      console.error('Error auto-initializing chat options:', err);
      setMessages(prev => [...prev, { sender: 'bot', text: `⚠️ Startup notice: ${err.message}` }]);
    });
  }, [sessionId, hospitalId]);

  const loadWaitTimes = async () => {
    try {
      const hospId = hospitalId || 'general-hospital';
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/queues/public-status?hospitalId=${hospId}`);
      if (res.ok) {
        const data = await res.json();
        setWaitTimes(prev => ({ 
          ...prev, 
          'Emergency': data.Emergency ?? prev.Emergency,
          'General Practice': data['General Practice'] ?? prev['General Practice'],
          'Pediatrics': data.Pediatrics ?? prev.Pediatrics
        }));
        if (data.whatsappNumber) {
          setWhatsappNumber(data.whatsappNumber);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Token Live Queue Events
  useEffect(() => {
    loadWaitTimes();
    
    const handleQueueUpdated = () => {
      loadWaitTimes();
      if (!myToken) return;
      
      fetch(`${BACKEND_URL}/api/v1/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: myToken.tokenNumber })
      })
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          setMyToken(prev => ({
            ...prev,
            estimatedWaitTime: data.token.estimatedWaitTime
          }));
        }
      });
    };

    socket.on('queue-updated', handleQueueUpdated);

    if (!myToken) return;

    socket.emit('join-room', `patient:${myToken.id}`);

    const handleTokenCalled = (data) => {
      if (data.status === 'Active') {
        setCalledAlert(`Please proceed to ${data.roomName || 'Cabin A'}`);
        speakAnnouncement(myToken.tokenNumber, data.roomName || 'Cabin A');
        setMyToken(prev => ({ ...prev, status: 'Active' }));
      } else if (data.status === 'Completed') {
        setCalledAlert(null);
        setMyToken(prev => ({ ...prev, status: 'Completed' }));
      } else if (data.status === 'Absent') {
        setCalledAlert(null);
        setMyToken(prev => ({ ...prev, status: 'Absent' }));
      } else if (data.status === 'Waiting') {
        setMyToken(prev => ({ ...prev, status: 'Waiting' }));
      }
    };

    const handleQueueReset = () => {
      setMyToken(null);
      setCalledAlert(null);
      loadWaitTimes();
      setMessages(prev => [...prev, { sender: 'bot', text: '🏥 Midnight maintenance completed. All active queue tokens have been archived.' }]);
    };

    socket.on('token-called', handleTokenCalled);
    socket.on('queue-reset', handleQueueReset);

    return () => {
      socket.off('token-called', handleTokenCalled);
      socket.off('queue-reset', handleQueueReset);
      socket.off('queue-updated', handleQueueUpdated);
    };
  }, [myToken]);

  const speakAnnouncement = (tokenNum, cabin) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `Attention please. Token Number ${tokenNum.replace('-', ' ')}, please proceed to ${cabin}.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text }]);
    setInputText('');

    try {
      const hospId = hospitalId || 'general-hospital';
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, hospitalId: hospId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Server returned status ${res.status}`);
      }

      if (data.messages) {
        data.messages.forEach(msg => {
          setMessages(prev => [...prev, { sender: 'bot', text: msg.text }]);
        });
      }

      if (data.options) {
        setOptions(data.options);
      } else {
        setOptions([]);
      }

      if (data.token) {
        setMyToken({
          id: data.token.id,
          tokenNumber: data.token.tokenNumber,
          estimatedWaitTime: data.token.estimatedWaitTime,
          status: 'Waiting'
        });
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { sender: 'bot', text: `⚠️ Error: ${err.message || 'Make sure backend is running.'}` }]);
    }
  };

  if (loadingHosp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4">
        <span className="material-symbols-outlined text-[48px] text-orange-600 animate-spin">refresh</span>
        <p className="text-sm font-bold text-[var(--text-secondary)]">Loading white-labeled portal...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex w-full max-w-[1440px] mx-auto h-[calc(100vh-62px)] overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200 min-w-0">
      {/* Left Sidebar: Hospital Info & Wait Times */}
      <aside className="hidden lg:flex flex-col w-80 bg-[var(--card-bg)] border-r border-[var(--border-color)]/30 p-6 overflow-y-auto no-scrollbar shadow-[inset_-10px_0_20px_rgba(0,0,0,0.01)] relative z-10">
        <div className="mb-6">
          {/* Back to Hub Button */}
          <button 
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center space-x-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)]/25 active:scale-95 duration-100 text-[var(--text-secondary)] hover:text-[var(--text-color)] border border-[var(--border-color)]/30 rounded-xl py-2 px-3 mb-4 font-bold text-xs transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Change Hospital</span>
          </button>

          <div className="w-full h-32 rounded-xl bg-zinc-800 mb-4 overflow-hidden relative shadow-sm">
            <div 
              className="bg-cover bg-center w-full h-full absolute inset-0 opacity-80" 
              style={{ backgroundImage: `url('${hospitalInfo?.coverImage || 'https://lh3.googleusercontent.com/aida-public/AB6AXuA1x4Ta8X_Leb2KfTzTMhRKsT439crOzzOgCCfSQH3UNSJlkdZTlRZT13ai7p8kN9f7_vHvbO7z2snijUJmc30zd6loDlIMh8Uth9PitBK4Q9fgbf17IwSVaxF8O9WHyaQvTAvo-ILHCBdZnJT8Yhu4iOlLxRG6irdb1Gnl_7dsWd1s1hLWea_09I6kOuw8kjUH9psbS4v-OXZXFH7mVJ9A8DwUUtxXqxAK0RcJIlWbR2K3O1vo3ZCrbqgnr5Egw0jJOTNYtRgR1lFx'}')` }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent"></div>
            <h3 className="absolute bottom-4 left-4 text-white font-bold text-lg leading-tight">
              {hospitalInfo?.name || 'General Hospital'}<br/>
              <span className="text-xs text-white/80 font-normal">Active Campus</span>
            </h3>
          </div>
          <div className="space-y-3 text-xs text-[var(--text-secondary)] font-semibold">
            <div className="flex items-start space-x-2">
              <span className="material-symbols-outlined text-[16px] text-zinc-400">location_on</span>
              <p>{hospitalInfo?.address || '123 Healthcare Blvd, Medical District'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[16px] text-zinc-400">call</span>
              <p>{hospitalInfo?.phone || '+1 (555) 123-4567'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[16px] text-emerald-500">schedule</span>
              <p className="text-emerald-600 dark:text-emerald-400 font-bold">Open Now • 24/7 ER</p>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-[var(--border-color)]/50 mb-6"></div>

        <div className="mb-6">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-4">Current Wait Times</h4>
          
          {/* Emergency Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 mb-2.5 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-rose-500 text-[18px]">local_hospital</span>
              <span className="text-sm font-bold text-[var(--text-color)]">Emergency</span>
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded">
              {waitTimes['Emergency']} mins
            </span>
          </div>

          {/* GP Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 mb-2.5 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">medical_services</span>
              <span className="text-sm font-bold text-[var(--text-color)]">General Practice</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
              {waitTimes['General Practice'] || waitTimes['General Medicine'] || 15} mins
            </span>
          </div>

          {/* Pediatrics Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">child_care</span>
              <span className="text-sm font-bold text-[var(--text-color)]">Pediatrics</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
              {waitTimes['Pediatrics'] || 10} mins
            </span>
          </div>
        </div>

        {/* WhatsApp Integration Info Panel */}
        <div className="mb-6 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 relative overflow-hidden shadow-sm">
          <div className="flex items-center space-x-2.5 mb-2.5">
            <div className="bg-emerald-600 text-white p-1.5 rounded-lg shrink-0 flex items-center justify-center">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.739-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.528 2.01 14.069.993 11.5.993c-5.44 0-9.865 4.369-9.87 9.799a9.71 9.71 0 001.44 4.793l-.995 3.633 3.738-.97c1.558.89 3.11 1.34 4.734 1.34h.015zm9.525-6.938c-.287-.143-1.697-.837-1.959-.933-.261-.096-.451-.143-.64.143-.19.286-.735.933-.9 1.127-.166.19-.332.214-.618.071-.286-.143-1.21-.445-2.305-1.42-.853-.76-1.428-1.7-1.595-1.986-.167-.286-.018-.44.125-.581.129-.127.287-.333.43-.5.143-.167.19-.286.286-.476.095-.19.048-.357-.024-.5-.071-.143-.64-1.543-.877-2.11-.23-.559-.483-.483-.66-.492-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.369-.268.297-1.023 1.002-1.023 2.444 0 1.442 1.049 2.839 1.192 3.03.143.19 2.064 3.15 5.002 4.425.699.303 1.244.484 1.67.62.703.223 1.344.192 1.85.117.564-.084 1.697-.693 1.936-1.362.239-.668.239-1.24.167-1.362-.072-.122-.268-.195-.554-.338z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">WhatsApp Assistant</h4>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">Book & check status on chat</p>
            </div>
          </div>
          <div className="bg-[var(--card-bg)] dark:bg-black/30 rounded-lg p-3 border border-emerald-500/10 flex flex-col items-center">
            <div className="bg-white p-2 rounded-lg mb-2 shadow-sm border border-zinc-100 flex items-center justify-center">
              <svg className="w-20 h-20 text-zinc-800" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="7" height="7" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
                <rect x="3" y="3" width="3" height="3" fill="white" />
                <rect x="21" y="1" width="7" height="7" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
                <rect x="23" y="3" width="3" height="3" fill="white" />
                <rect x="1" y="21" width="7" height="7" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
                <rect x="3" y="23" width="3" height="3" fill="white" />
                
                <rect x="9" y="2" width="2" height="2" fill="currentColor" />
                <rect x="13" y="1" width="3" height="2" fill="currentColor" />
                <rect x="17" y="3" width="2" height="3" fill="currentColor" />
                <rect x="10" y="6" width="3" height="2" fill="currentColor" />
                
                <rect x="2" y="9" width="3" height="2" fill="currentColor" />
                <rect x="6" y="11" width="2" height="3" fill="currentColor" />
                <rect x="1" y="15" width="2" height="2" fill="currentColor" />
                <rect x="4" y="17" width="3" height="2" fill="currentColor" />
                
                <rect x="22" y="9" width="2" height="3" fill="currentColor" />
                <rect x="25" y="13" width="3" height="2" fill="currentColor" />
                <rect x="21" y="16" width="2" height="3" fill="currentColor" />
                <rect x="26" y="17" width="2" height="2" fill="currentColor" />

                <rect x="9" y="10" width="3" height="3" fill="currentColor" />
                <rect x="13" y="9" width="2" height="2" fill="currentColor" />
                <rect x="16" y="11" width="4" height="2" fill="currentColor" />
                <rect x="11" y="14" width="2" height="4" fill="currentColor" />
                <rect x="15" y="15" width="3" height="3" fill="currentColor" />

                <rect x="9" y="21" width="2" height="3" fill="currentColor" />
                <rect x="13" y="23" width="3" height="2" fill="currentColor" />
                <rect x="17" y="21" width="2" height="4" fill="currentColor" />
                
                <rect x="21" y="21" width="3" height="2" fill="currentColor" />
                <rect x="25" y="23" width="3" height="3" fill="currentColor" />
              </svg>
            </div>
            <p className="text-[10px] font-bold text-center text-[var(--text-color)] mb-1">
              Send <span className="text-emerald-600 dark:text-emerald-400 font-extrabold font-mono">"Hi"</span> to
            </p>
            <p className="text-xs font-black text-center text-emerald-600 dark:text-emerald-400 font-mono tracking-wide mb-2.5 select-all">
              {whatsappNumber}
            </p>
            <a 
              href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=hi`}
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 duration-100 text-white text-xs font-extrabold py-2 px-3 rounded-lg text-center shadow-md shadow-emerald-500/10 flex items-center justify-center space-x-1.5 transition-all"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.739-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.528 2.01 14.069.993 11.5.993c-5.44 0-9.865 4.369-9.87 9.799a9.71 9.71 0 001.44 4.793l-.995 3.633 3.738-.97c1.558.89 3.11 1.34 4.734 1.34h.015zm9.525-6.938c-.287-.143-1.697-.837-1.959-.933-.261-.096-.451-.143-.64.143-.19.286-.735.933-.9 1.127-.166.19-.332.214-.618.071-.286-.143-1.21-.445-2.305-1.42-.853-.76-1.428-1.7-1.595-1.986-.167-.286-.018-.44.125-.581.129-.127.287-.333.43-.5.143-.167.19-.286.286-.476.095-.19.048-.357-.024-.5-.071-.143-.64-1.543-.877-2.11-.23-.559-.483-.483-.66-.492-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.369-.268.297-1.023 1.002-1.023 2.444 0 1.442 1.049 2.839 1.192 3.03.143.19 2.064 3.15 5.002 4.425.699.303 1.244.484 1.67.62.703.223 1.344.192 1.85.117.564-.084 1.697-.693 1.936-1.362.239-.668.239-1.24.167-1.362-.072-.122-.268-.195-.554-.338z"/>
              </svg>
              <span>Chat on WhatsApp</span>
            </a>
          </div>
        </div>

        <div className="mt-auto bg-[var(--primary-color)]/5 dark:bg-white/5 p-4 rounded-xl border border-[var(--primary-color)]/10">
          <div className="flex items-start space-x-3">
            <span className="material-symbols-outlined text-[var(--primary-color)] text-[24px] shrink-0">verified_user</span>
            <div>
              <h5 className="text-xs font-bold text-[var(--primary-color)] dark:text-zinc-300 mb-1">Secure & Privacy Guaranteed</h5>
              <p className="text-[10px] text-[var(--text-secondary)] font-medium leading-relaxed">
                Your medical information is end-to-end encrypted and fully HIPAA compliant.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Center Chat Area */}
      <section className="flex-1 flex flex-col bg-[var(--bg-color)] relative z-0 min-w-0">
        {/* Chat Header */}
        <header className="px-6 py-4 border-b border-[var(--border-color)]/50 flex items-center justify-between sticky top-0 z-20 bg-[var(--card-bg)]/80 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            {/* Back button for mobile */}
            <button 
              onClick={() => navigate('/')}
              className="lg:hidden p-1.5 rounded-lg border border-[var(--border-color)]/30 bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-color)] flex items-center justify-center active:scale-95 duration-100 mr-1 shadow-sm"
              title="Change Hospital"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[22px]">smart_toy</span>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--card-bg)] animate-pulse"></span>
            </div>
            <div>
              <h2 className="font-extrabold text-sm md:text-base text-[var(--text-color)]">{hospitalInfo?.name || 'CareSync Assistant'}</h2>
              <p className="text-[10px] text-[var(--text-secondary)] font-semibold flex items-center">
                <span className="material-symbols-outlined text-[12px] text-amber-500 mr-0.5">bolt</span>
                AI-Powered Triage & Booking
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-[var(--border-color)]/30 text-[var(--text-secondary)] px-2 py-0.5 rounded-full">Active Status</span>
          </div>
        </header>

        {/* Mobile Token Banner */}
        {myToken && (
          <div className="lg:hidden px-6 py-3.5 bg-gradient-to-r from-[var(--secondary-color)] to-[var(--primary-container)] text-white flex justify-between items-center shadow-md relative z-10 border-b border-white/10">
            <div>
              <p className="text-[9px] text-white/80 uppercase tracking-widest font-extrabold mb-0.5">Active Ticket</p>
              <h4 className="text-sm font-black text-white">Token {myToken.tokenNumber} • Cabin A</h4>
            </div>
            <div className="flex items-center space-x-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-md">
              <span className="material-symbols-outlined text-white text-[15px]">hourglass_empty</span>
              <span className="text-xs font-black text-white">{myToken.estimatedWaitTime} mins wait</span>
            </div>
          </div>
        )}

        {/* Mobile WhatsApp Info Banner */}
        <div className="lg:hidden px-6 py-2.5 bg-emerald-500/10 dark:bg-emerald-500/5 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs font-semibold relative z-10">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400 shrink-0">chat</span>
            <span>Book/Track on WhatsApp: <span className="font-bold font-mono">{whatsappNumber}</span></span>
          </div>
          <a 
            href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=hi`}
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 duration-100 text-white text-[10px] font-black px-2.5 py-1 rounded-md flex items-center space-x-1"
          >
            <span>Chat</span>
            <span className="material-symbols-outlined text-[10px]">open_in_new</span>
          </a>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 chat-container bg-gradient-to-br from-[var(--bg-color)] via-[var(--bg-color)] to-[var(--border-color)]/5">
          {/* Time Separator */}
          <div className="flex justify-center my-4">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--card-bg)] px-3 py-1 rounded-full border border-[var(--border-color)]/30 shadow-sm">
              Today, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {messages.map((msg, i) => {
            const isBot = msg.sender === 'bot';
            
            // Wait! Does this message contain booking details to render doctor cards or token cards?
            const isSelectDoctorPrompt = msg.text.includes("Select an available doctor to book your token:") || msg.text.includes("टोकन बुक करने के लिए उपलब्ध डॉक्टर का चयन करें:");
            
            return (
              <div key={i} className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} message-enter`}>
                <div className={`flex items-start space-x-2.5 max-w-[85%] md:max-w-[75%] ${isBot ? '' : 'flex-row-reverse space-x-reverse'}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm border ${
                    isBot 
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border-[var(--primary-color)]/20' 
                      : 'bg-[var(--card-bg)] text-[var(--primary-color)] border-[var(--border-color)]'
                  }`}>
                    <span className="material-symbols-outlined text-[16px]">
                      {isBot ? 'smart_toy' : 'person'}
                    </span>
                  </div>

                  <div className="flex flex-col space-y-1">
                    {/* Message Bubble */}
                    <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                      isBot 
                        ? 'bg-[var(--card-bg)] text-[var(--text-color)] border border-[var(--border-color)]/30 rounded-tl-none' 
                        : 'bg-[var(--secondary-color)] text-white rounded-tr-none'
                    }`}>
                      <p className="whitespace-pre-wrap font-medium">{msg.text}</p>
                    </div>

                    {/* Meta timestamp */}
                    <span className="text-[9px] text-[var(--text-secondary)] px-1">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Rich Triage Component: Doctor Bento Cards (If select doctor prompt) */}
                {isBot && isSelectDoctorPrompt && options.length > 0 && (
                  <div className="flex overflow-x-auto gap-4 mt-3 ml-0 sm:ml-10 w-full max-w-[500px] no-scrollbar pb-2 shrink-0">
                    {options.map((opt, idx) => {
                      // Parse Doctor Name and Dept
                      const parts = opt.match(/(Dr\.\s+[^\(]+)\s*\(([^\)]+)\)/);
                      const docName = parts ? parts[1].trim() : opt;
                      const docDept = parts ? parts[2].trim() : 'General Practice';
                      
                      // Alternate colors/images for Dr. Sarah Smith & Dr. James Chen
                      const isSarah = docName.toLowerCase().includes('sarah') || idx % 2 === 0;
                      const imageUrl = isSarah 
                        ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWdRlyEiC2Yx0HWgBSOach1egGcQ0IkKHDKXiKW95RHy3l-ZXQzsKhEAACSuq7LLYYYXPqx19hTAtvRNbRFPiF1dFioOaElurSxNksTJJp8UUTrgGOSBjZ6UY0RBLaNP2I2bjLyVD1Owse2cXuKTyp9Z5bNIwSTp8vM3fyy1dQfm8PHbYKXCDfUC_1IzepbJC7ByV-s4jkJQht1CncmvPAVtCo2eQDPjp8Eqn9wUxEMbXyMmhBcQLvpR0HL8CHTq3fHlK3pTgo4NyX'
                        : 'https://lh3.googleusercontent.com/aida-public/AB6AXuBr7a9IwJ3lVwmiEIptsdjdBnkbqAq5y-oH7FGBDywOkQbEyKCpD5eqUJXGzZI8Sldi_VWAmtMDivwX3GBC7v4iGEam3qMA_cYxaFUo9OK9XAPj2knsB0UpcTz67MZV2MNojcCs30U58z1NBROK_R73S5k2pHk5I3J_VatiyypolMqf1A0fsLbjXqoN8Nl0-9GpZRISI3rxF1pIQwFCB1DIOLj26MIYOMDzj4P8JlhIo83exsG_D1jLKaZLV51cokSPWqrEXCTLy90N';
 
                      return (
                        <div 
                          key={idx}
                          onClick={() => handleSendMessage(opt)}
                          className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]/40 p-4 shadow-[var(--card-shadow)] flex flex-col justify-between hover:shadow-md transition-all cursor-pointer relative overflow-hidden group border-l-4 border-l-[var(--secondary-color)] active:scale-[0.98] duration-100 w-56 shrink-0"
                        >
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-200 border border-[var(--border-color)]/20 shrink-0">
                              <img className="w-full h-full object-cover" src={imageUrl} alt={docName} />
                            </div>
                            <div>
                              <h4 className="font-bold text-xs text-[var(--text-color)] group-hover:text-[var(--secondary-color)] transition-colors">{docName}</h4>
                              <p className="text-[10px] text-[var(--text-secondary)] font-medium">{docDept}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center space-x-0.5">
                              <span className="material-symbols-outlined text-amber-500 text-[14px]">star</span>
                              <span className="text-[10px] font-bold text-[var(--text-color)]">{isSarah ? '4.9' : '4.8'}</span>
                            </div>
                            <span className="text-[9px] font-bold bg-[var(--primary-color)]/10 text-[var(--primary-color)] dark:text-zinc-300 px-2 py-0.5 rounded flex items-center">
                              <span className="material-symbols-outlined text-[10px] mr-1">schedule</span>
                              Next: 10:15 AM
                            </span>
                          </div>
                          <button className="w-full py-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--primary-color)] font-bold text-[10px] rounded-lg border border-[var(--border-color)]/30 transition-colors">
                            Select Doctor
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          <div ref={chatEndRef} />
        </div>

        {/* Floating Calling Notifications Overlay */}
        {calledAlert && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-sm px-4">
            <div className="bg-emerald-600 dark:bg-emerald-700 text-white p-4 rounded-xl shadow-lg border border-emerald-500 flex items-center space-x-3.5 animate-bounce">
              <span className="material-symbols-outlined text-[28px] animate-pulse">volume_up</span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-250">Your Token is Called!</p>
                <p className="text-sm font-extrabold">{calledAlert}</p>
              </div>
            </div>
          </div>
        )}

        {/* Input Footer */}
        <div className="p-4 bg-[var(--card-bg)] border-t border-[var(--border-color)]/30 relative z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.01)]">
          {/* Quick Replies Options */}
          {options.length > 0 && !options[0].startsWith('Dr.') && (
            <div className="flex flex-col gap-2 mb-3">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(opt)}
                  className="w-full text-left px-4 py-2.5 rounded-xl border border-[var(--border-color)]/60 font-bold text-xs text-[var(--primary-color)] bg-[var(--card-bg)] hover:bg-[var(--border-color)]/25 transition-all shadow-sm active:scale-95 duration-100 flex items-center justify-between"
                >
                  <span>{opt}</span>
                  <span className="material-symbols-outlined text-[16px] text-[var(--primary-color)]/50">chevron_right</span>
                </button>
              ))}
            </div>
          )}

          {/* Chat text box */}
          <div className="flex items-end space-x-2 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-1.5 focus-within:border-[var(--secondary-color)] focus-within:ring-1 focus-within:ring-[var(--secondary-color)] transition-all">
            <button className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary-color)] rounded-full transition-colors shrink-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <textarea 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && options.length === 0) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={1}
              disabled={options.length > 0}
              placeholder={options.length > 0 ? "Select an option from the list above..." : "Type a message..."}
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] py-2 font-medium text-sm text-[var(--text-color)] placeholder-[var(--text-secondary)]/50 outline-none disabled:opacity-60 disabled:cursor-not-allowed no-scrollbar"
            />
            <button 
              disabled={options.length > 0}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary-color)] rounded-full transition-colors shrink-0 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">mic</span>
            </button>
            <button 
              onClick={() => handleSendMessage()}
              disabled={options.length > 0}
              className="p-2 bg-[var(--primary-color)] text-[var(--primary-text)] hover:bg-[var(--primary-container)] rounded-xl transition-colors shrink-0 shadow-sm flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
          <div className="text-center mt-2.5">
            <span className="text-[10px] text-[var(--text-secondary)]/60 font-semibold leading-none">
              CareSync AI Triage helper. Verify critical diagnosis details.
            </span>
          </div>
        </div>
      </section>

      {/* Right Token Card Details Sidebar */}
      <aside className="hidden lg:flex flex-col w-80 bg-[var(--bg-color)] p-6 border-l border-[var(--border-color)]/30 space-y-5 shadow-inner">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Active Patient Token</h3>
        
        {myToken ? (
          <div className="bg-gradient-to-br from-[var(--secondary-color)] to-[var(--primary-container)] text-white rounded-2xl p-5 shadow-lg relative overflow-hidden border border-white/10 w-full">
            {/* Glass decoration layer */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-[9px] text-white/70 uppercase tracking-widest font-bold mb-1">Queue Token</p>
                  <h3 className="text-4xl font-extrabold text-white leading-none">{myToken.tokenNumber}</h3>
                </div>
                <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md text-white">
                  <span className="material-symbols-outlined text-[26px]">qr_code_2</span>
                </div>
              </div>

              <div className="space-y-2.5 mb-6 border-t border-white/20 pt-4 text-xs font-semibold">
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Department</span>
                  <span className="text-white text-right font-bold">General Practice</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Cabin Room</span>
                  <span className="text-white text-right font-bold">Cabin A</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/80">Queue Status</span>
                  <span className="bg-emerald-550/80 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                    {myToken.status}
                  </span>
                </div>
              </div>

              <div className="bg-white/10 rounded-xl p-3.5 flex items-center justify-between border border-white/10 backdrop-blur-md">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-white text-[18px]">hourglass_empty</span>
                  <span className="text-xs text-white/95">Est. Wait Time</span>
                </div>
                <span className="text-lg font-extrabold text-white">{myToken.estimatedWaitTime} mins</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/40">
            <span className="material-symbols-outlined text-[36px] text-[var(--text-secondary)]/40 mb-3">calendar_month</span>
            <p className="text-sm text-[var(--text-color)] font-bold">No Active Queue Token</p>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 max-w-[200px] leading-relaxed font-semibold">
              Complete the chat triage form to book an appointment and obtain a real-time status token.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ==========================================================================
   STAFF LOGIN COMPONENT
   ========================================================================== */
function StaffLogin({ setStaffToken, setStaffUser, onSuccess }) {
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-8 shadow-[var(--card-shadow)] relative overflow-hidden">
        <div className="flex items-center space-x-2 mb-6">
          <div className="bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-lg text-indigo-500">
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
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold cursor-pointer"
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
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
              required
            />
          </div>
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-[var(--text-color)] font-bold"
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

/* ==========================================================================
   STAFF DASHBOARD COMPONENT
   ========================================================================== */
function StaffDashboard({ staffToken, staffUser, onLogout }) {
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
                      ? 'bg-[var(--secondary-color)]/10 text-[var(--secondary-color)] border border-[var(--secondary-color)]/20' 
                      : 'hover:bg-[var(--border-color)]/20 text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[var(--secondary-color)]' : 'text-[var(--text-secondary)]'}`}>
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
                  ? 'bg-[var(--secondary-color)] text-white shadow-sm' 
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
          
          {/* TAB 1: HEALIGHT-STYLE DASHBOARD OVERVIEW */}
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
                      <div className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-orange-500"></span><span className="text-[var(--text-secondary)]">Treatment</span></div>
                      <div className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span><span className="text-[var(--text-secondary)]">Recovered</span></div>
                    </div>
                  </div>

                  {/* SVG Line Chart */}
                  <div className="h-64 w-full relative pt-4">
                    <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                      {/* Grid lines */}
                      <line x1="0" y1="50" x2="500" y2="50" stroke="#f5f5f4" strokeWidth="1" />
                      <line x1="0" y1="100" x2="500" y2="100" stroke="#f5f5f4" strokeWidth="1" />
                      <line x1="0" y1="150" x2="500" y2="150" stroke="#f5f5f4" strokeWidth="1" />

                      {/* Under treatment line (orange) */}
                      <path 
                        d="M 10 130 Q 90 90 170 120 T 330 70 T 490 110" 
                        fill="none" 
                        stroke="#ea580c" 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                      />
                      {/* Recovered line (green) */}
                      <path 
                        d="M 10 170 Q 90 140 170 160 T 330 130 T 490 120" 
                        fill="none" 
                        stroke="#059669" 
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
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
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
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">Gender</label>
                      <select
                        value={walkGender}
                        onChange={(e) => setWalkGender(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
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
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">Assign Doctor</label>
                    <select
                      value={walkDoctorId}
                      onChange={(e) => setWalkDoctorId(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold"
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
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-[var(--text-color)] font-bold resize-none"
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
                    className="w-full bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-[var(--secondary-color)]/10 transition-all flex items-center justify-center space-x-2"
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
                                      ? 'animate-flashing-crimson border-rose-500/40 bg-rose-500/5' 
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
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] focus:border-[var(--secondary-color)] rounded-xl px-4 py-2 outline-none text-xs text-[var(--text-color)] font-semibold"
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
                  className="bg-[var(--secondary-color)] hover:bg-[var(--secondary-color)]/90 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
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

          {/* TAB 4: RE-VISIT REMINDERS LOGS */}
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

/* ==========================================================================
   DOCTOR LOGIN COMPONENT
   ========================================================================== */
function DoctorLogin({ setDoctorToken, setDoctorUser, onSuccess }) {
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

/* ==========================================================================
   DOCTOR DASHBOARD COMPONENT
   ========================================================================== */
function DoctorDashboard({ doctorToken, doctorUser, onLogout }) {
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

                    {/* Chatbot conversation log wrapper */}
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

/* ==========================================================================
   LAB LOGIN COMPONENT
   ========================================================================== */
function LabLogin({ setLabToken, setLabUser, onSuccess }) {
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

/* ==========================================================================
   LAB DASHBOARD COMPONENT
   ========================================================================== */
function LabDashboard({ labToken, labUser, onLogout }) {
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
            <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wider mt-0.5">Lab Assistant</p>
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
                    <span className="bg-teal-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
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

/* ==========================================================================
   PATIENT LIVE TRACKER COMPONENT (URL: /track/:tokenId)
   ========================================================================== */
function PatientLiveTracker() {
  const { tokenId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTracker = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/token/${tokenId}`);
      const d = await res.json();
      if (res.ok) {
        setData(d);
      } else {
        setError(d.message || 'Token details not found');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracker();

    socket.emit('join-room', 'queue:global');
    const handleUpdate = () => {
      loadTracker();
    };
    socket.on('queue-updated', handleUpdate);

    return () => {
      socket.off('queue-updated', handleUpdate);
    };
  }, [tokenId]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-[var(--text-secondary)] font-bold text-sm">Synchronizing queue tracker...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-rose-500 font-bold text-sm border border-rose-500/20 bg-rose-500/5 px-4 py-3 rounded-xl">{error || 'Tracker failed'}</div>
      </div>
    );
  }

  const { token, position } = data;
  const inCabin = position === 0;
  const positionText = inCabin 
    ? 'Please proceed inside' 
    : position > 0 
      ? `${position - 1} patient(s) ahead of you` 
      : 'Checkup complete';

  return (
    <div className="flex-grow flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 shadow-[var(--card-shadow)] relative overflow-hidden text-[var(--text-color)]">
        
        {/* Hospital Branding Header */}
        <div className="flex justify-between items-center pb-4 border-b border-[var(--border-color)]/30 mb-6">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-orange-650 text-[22px]">health_and_safety</span>
            <span className="font-extrabold text-sm tracking-tight text-left">CareSync Live Tracker</span>
          </div>
          <span className="bg-emerald-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Live Connection</span>
        </div>

        {/* Big Ticket Token Box */}
        <div className="bg-gradient-to-br from-[var(--secondary-color)] to-[var(--primary-container)] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-white/10 text-center mb-6">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
          <p className="text-[9px] text-white/70 uppercase tracking-widest font-bold mb-1 relative z-10">Active Ticket</p>
          <h2 className="text-5xl font-black relative z-10 leading-none">{token.tokenNumber}</h2>
          
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-around text-xs font-semibold relative z-10">
            <div>
              <p className="text-white/60 text-[9px]">Cabin Room</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.currentRoom || 'Cabin A'}</p>
            </div>
            <div>
              <p className="text-white/60 text-[9px]">Consultant</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.name}</p>
            </div>
          </div>
        </div>

        {/* Live Wait Status Card */}
        <div className="space-y-4">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center space-x-3 text-left">
              <span className={`material-symbols-outlined text-[26px] ${inCabin ? 'text-emerald-500 animate-pulse' : 'text-orange-500'}`}>
                {inCabin ? 'check_circle' : 'hourglass_empty'}
              </span>
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold">Queue Position</p>
                <p className="text-sm font-extrabold text-[var(--text-color)] mt-0.5">{positionText}</p>
              </div>
            </div>
            {!inCabin && position > 0 && (
              <span className="text-lg font-black text-orange-650 shrink-0">{token.estimatedWaitTime} <span className="text-[9px] font-medium text-[var(--text-secondary)]">mins</span></span>
            )}
          </div>

          <div className="text-center">
            <p className="text-[10px] text-[var(--text-secondary)] font-bold">Please wait in the reception lounge until called.</p>
            <p className="text-[9px] text-[var(--text-secondary)]/50 mt-1">Refreshes automatically when the queue updates.</p>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ==========================================================================
   DIGITAL PRESCRIPTION VIEWER (URL: /prescription/:tokenId)
   ========================================================================== */
function DigitalPrescriptionViewer() {
  const { tokenId } = useParams();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPrescription = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/token/${tokenId}`);
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      } else {
        setError(data.message || 'Prescription details not found');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescription();
  }, [tokenId]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-[var(--text-secondary)] font-bold text-sm">Retrieving prescription profile...</div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-rose-500 font-bold text-sm border border-rose-500/20 bg-rose-500/5 px-4 py-3 rounded-xl">{error || 'Prescription not found'}</div>
      </div>
    );
  }

  const { patient, doctor, prescription, labTests } = token;

  return (
    <div className="flex-grow bg-[var(--bg-color)] p-4 md:p-8 overflow-y-auto flex items-start justify-center text-left">
      <div className="w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 md:p-8 shadow-[var(--card-shadow)] relative space-y-6 text-[var(--text-color)]" id="printable-prescription">
        
        {/* Prescription Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-[var(--border-color)]/30 gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="bg-orange-600 p-2 rounded-xl text-white">
              <span className="material-symbols-outlined text-[24px]">clinical_notes</span>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {doctor?.hospital === 'pediatrics-clinic' ? 'St. Jude Pediatrics Clinic' : 'CareSync General Hospital'}
              </h2>
              <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Clinical Care & Diagnostics</p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 border border-[var(--border-color)] text-[var(--text-color)] text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 duration-100 flex items-center space-x-1.5 print:hidden"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print / Save PDF</span>
          </button>
        </div>

        {/* Patient & Doctor metadata grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[var(--bg-color)]/50 p-4 rounded-2xl border border-[var(--border-color)]/35 text-xs font-semibold">
          <div className="space-y-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold tracking-wider">Patient Details</span>
            <p className="text-sm font-extrabold text-[var(--text-color)]">{patient?.name}</p>
            <p className="text-[var(--text-secondary)]">Age: {patient?.age} yrs | Gender: {patient?.gender}</p>
            <p className="text-[var(--text-secondary)]">Phone: {patient?.phone}</p>
          </div>
          <div className="space-y-1.5 sm:text-right">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold tracking-wider">Consultant Details</span>
            <p className="text-sm font-extrabold text-[var(--text-color)]">{doctor?.name}</p>
            <p className="text-[var(--text-secondary)]">{doctor?.department} Department</p>
            <p className="text-[var(--text-secondary)]">Room: {doctor?.currentRoom || 'Cabin A'}</p>
          </div>
        </div>

        {/* Symptoms Section */}
        <div className="space-y-2">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Reported Symptoms</h4>
          <p className="text-sm font-medium leading-relaxed bg-[var(--bg-color)]/30 p-3.5 rounded-xl border border-[var(--border-color)]/30">{token.symptoms}</p>
        </div>

        {/* Prescription Table */}
        <div className="space-y-2">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Prescribed Medications</h4>
          {prescription && prescription.medicines && prescription.medicines.length > 0 ? (
            <div className="overflow-x-auto border border-[var(--border-color)]/30 rounded-xl">
              <table className="w-full text-left text-xs font-semibold border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-color)]/50 border-b border-[var(--border-color)]/30 text-[var(--text-secondary)] uppercase font-bold text-[9px] tracking-wider">
                    <th className="p-3.5">Medicine Name</th>
                    <th className="p-3.5">Dosage</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]/20">
                  {prescription.medicines.map((med, idx) => (
                    <tr key={idx} className="hover:bg-[var(--border-color)]/5 transition-colors">
                      <td className="p-3.5 font-bold text-[var(--text-color)]">{med.name}</td>
                      <td className="p-3.5 font-bold text-[var(--text-color)]">{med.dosage}</td>
                      <td className="p-3.5 text-[var(--text-secondary)]">{med.duration}</td>
                      <td className="p-3.5 text-[var(--text-secondary)]">{med.instructions || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]/50 italic py-2">No medications prescribed.</p>
          )}
        </div>

        {/* Lab Reports Section */}
        {labTests && labTests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Clinical Lab Diagnoses</h4>
            <div className="space-y-2">
              {labTests.map((test, idx) => (
                <div key={idx} className="bg-[var(--bg-color)]/30 p-3.5 rounded-xl border border-[var(--border-color)]/30 flex items-start justify-between text-xs gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-[18px] text-teal-650">science</span>
                    <div>
                      <span className="font-bold text-[var(--text-color)]">{test.testName}</span>
                      {test.status === 'Completed' && (
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Results: <span className="font-semibold text-[var(--text-color)]">{test.remarks}</span></p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${
                    test.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  }`}>
                    {test.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doctor Advice / Footer */}
        {prescription && prescription.advice && (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">Doctor's Advice</h4>
            <p className="text-sm font-medium leading-relaxed italic bg-zinc-500/5 p-3.5 rounded-xl border border-[var(--border-color)]/20">{prescription.advice}</p>
          </div>
        )}

      </div>
    </div>
  );
}

/* ==========================================================================
   PUBLIC TV DISPLAY COMPONENT
   ========================================================================== */
function PublicTVDisplay() {
  const [queues, setQueues] = useState([]);
  const [calledToken, setCalledToken] = useState(null);

  const fetchQueues = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/queues`);
      const data = await res.json();
      if (res.ok) {
        setQueues(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueues();

    socket.emit('join-room', 'queue:global');
    const handleUpdate = () => {
      fetchQueues();
    };
    socket.on('queue-updated', handleUpdate);

    // Listen for voice call announcements
    const handleTokenCalled = (payload) => {
      if (payload.status === 'Active') {
        const textToSpeak = `Token number ${payload.tokenNumber.replace('-', ' ')}, please proceed directly to ${payload.roomName || 'Cabin A'}.`;
        
        // Voice announce
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.85; // speak slightly slower for clarity
          window.speechSynthesis.speak(utterance);
        }
        
        // Trigger fullscreen visual alert
        setCalledToken({
          tokenNumber: payload.tokenNumber,
          roomName: payload.roomName || 'Cabin A'
        });
        
        setTimeout(() => {
          setCalledToken(null);
        }, 8000);
      }
    };
    socket.on('token-called', handleTokenCalled);

    return () => {
      socket.off('queue-updated', handleUpdate);
      socket.off('token-called', handleTokenCalled);
    };
  }, []);

  return (
    <div className="flex-grow bg-zinc-950 text-white p-8 flex flex-col justify-between h-[calc(100vh-62px)] relative overflow-hidden font-sans text-left">
      
      {/* Fullscreen Announcement Banner Overlay */}
      {calledToken && (
        <div className="absolute inset-0 bg-orange-600 flex flex-col items-center justify-center text-center p-8 z-50 animate-fade-in border-4 border-orange-500 text-left">
          <span className="material-symbols-outlined text-[100px] text-white animate-bounce">volume_up</span>
          <h2 className="text-[12vw] font-black leading-none mt-4 text-white tracking-tight uppercase animate-pulse">{calledToken.tokenNumber}</h2>
          <p className="text-[4vw] font-extrabold mt-6 text-orange-100 uppercase tracking-widest">Proceed to {calledToken.roomName}</p>
        </div>
      )}

      {/* Normal TV View */}
      <div className="flex-1 flex flex-col space-y-8 text-left">
        {/* Header */}
        <div className="flex justify-between items-center pb-6 border-b border-white/10">
          <div className="flex items-center space-x-3.5">
            <span className="material-symbols-outlined text-[36px] text-orange-500 animate-pulse">volume_up</span>
            <div>
              <h2 className="text-3xl font-black tracking-tight">CareSync Waiting Lounge</h2>
              <p className="text-xs text-zinc-400 font-extrabold uppercase tracking-widest mt-0.5">Real-time Cabin Admissions</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-zinc-300">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Live Status Monitor</p>
          </div>
        </div>

        {/* Queues grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-8">
          {queues.map(q => {
            const isConsulting = q.currentToken !== null;
            return (
              <div key={q._id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/5 rounded-full blur-2xl"></div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-zinc-400 text-[18px]">stethoscope</span>
                    <span className="text-xs text-zinc-400 font-bold uppercase tracking-wide">{q.doctor?.department}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white">{q.doctor?.name}</h3>
                  <p className="text-xs text-orange-550 font-extrabold uppercase tracking-widest">{q.doctor?.currentRoom || 'Cabin A'}</p>
                </div>

                <div className="py-6 border-t border-b border-white/5 my-6 flex flex-col items-center justify-center min-h-[140px]">
                  {isConsulting ? (
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-400 uppercase font-extrabold tracking-widest">Active Patient</p>
                      <h4 className="text-6xl font-black text-orange-500 mt-2 tracking-tight uppercase animate-pulse">{q.currentToken.tokenNumber}</h4>
                      <p className="text-xs font-semibold text-zinc-300 mt-2 truncate max-w-[200px]">{q.currentToken.patient?.name}</p>
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500">
                      <span className="material-symbols-outlined text-[36px] text-zinc-650 mb-2">sensor_door</span>
                      <p className="text-xs font-bold text-zinc-400">Cabin is Idle</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 text-xs font-semibold">
                  <span className="text-[9px] text-zinc-400 uppercase font-extrabold tracking-widest block mb-1">Queue Status</span>
                  <div className="flex justify-between items-center bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                    <span className="text-zinc-500">Waiting Patients</span>
                    <span className="text-white font-bold">{q.activeQueue?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                    <span className="text-zinc-500">Next In Line</span>
                    <span className="text-orange-500 font-bold">
                      {q.activeQueue && q.activeQueue[0] ? q.activeQueue[0].tokenNumber : 'None'}
                    </span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
