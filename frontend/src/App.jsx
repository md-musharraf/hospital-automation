import React, { useState, useEffect, Suspense } from 'react';
import io from 'socket.io-client';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { 
  MessageSquare, Shield, Stethoscope, Activity
} from 'lucide-react';

const getBackendUrl = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  const hostname = window.location.hostname;
  // If hosted on Vercel, automatically target the live Render backend
  if (hostname && hostname.includes('vercel.app')) {
    return 'https://hospital-automation-nc4h.onrender.com';
  }
  // If we are on production/deployed environment elsewhere (e.g. Render serving frontend directly)
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  return 'http://localhost:5000';
};

export const BACKEND_URL = getBackendUrl();
export const socket = io(BACKEND_URL, { transports: ['websocket'] });

// Lazy load components
const HospitalHub = React.lazy(() => import('./components/HospitalHub'));
const PatientPortal = React.lazy(() => import('./components/PatientPortal'));
const PatientLiveTracker = React.lazy(() => import('./components/PatientLiveTracker'));
const DigitalPrescriptionViewer = React.lazy(() => import('./components/DigitalPrescriptionViewer'));
const PublicTVDisplay = React.lazy(() => import('./components/PublicTVDisplay'));
const SuperAdminPortal = React.lazy(() => import('./components/SuperAdminPortal'));

// Named imports for lazy loaded modules
const StaffLogin = React.lazy(() => import('./components/StaffPortal').then(module => ({ default: module.StaffLogin })));
const StaffDashboard = React.lazy(() => import('./components/StaffPortal').then(module => ({ default: module.StaffDashboard })));
const DoctorLogin = React.lazy(() => import('./components/DoctorPortal').then(module => ({ default: module.DoctorLogin })));
const DoctorDashboard = React.lazy(() => import('./components/DoctorPortal').then(module => ({ default: module.DoctorDashboard })));
const LabLogin = React.lazy(() => import('./components/LabPortal').then(module => ({ default: module.LabLogin })));
const LabDashboard = React.lazy(() => import('./components/LabPortal').then(module => ({ default: module.LabDashboard })));

const LoadingFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4 min-h-[400px]">
    <span className="material-symbols-outlined text-[48px] text-[var(--primary-color)] animate-spin">refresh</span>
    <p className="text-sm font-bold text-[var(--text-secondary)]">Loading session...</p>
  </div>
);

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
      <div className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/60 px-4 py-2.5 flex items-center justify-between z-50 shadow-lg shadow-black/5 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="bg-[var(--primary-color)] p-1.5 rounded-lg shadow-sm shadow-[var(--primary-color)]/20">
            <Activity className="h-5 w-5 text-white animate-pulse" />
          </div>
          <span className="font-extrabold tracking-tight text-lg text-[var(--text-color)]">CareSync <span className="text-xs text-[var(--primary-color)] font-semibold">DEMO</span></span>
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
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname === '/' ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-lg shadow-[var(--primary-color)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Patient Portal</span>
          </button>
          
          <button 
            onClick={() => navigate(staffToken ? '/staff/dashboard' : '/staff/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/staff') ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-lg shadow-[var(--primary-color)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Staff Dashboard</span>
          </button>
          
          <button 
            onClick={() => navigate(doctorToken ? '/doctor/dashboard' : '/doctor/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/doctor') ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-lg shadow-[var(--primary-color)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <Stethoscope className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline-block">Doctor Console</span>
          </button>

          <button 
            onClick={() => navigate(labToken ? '/lab/dashboard' : '/lab/login')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/lab') ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-lg shadow-[var(--primary-color)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">science</span>
            <span className="hidden sm:inline-block">Lab Console</span>
          </button>
        </div>
      </div>

      {/* Main Content Area with Suspense for Lazy Loading */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
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
            <Route path="/admin" element={<SuperAdminPortal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
