import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { 
  MessageSquare, User, Shield, Stethoscope, 
  Send, Users, Activity, Flame, Clock, 
  CheckCircle, AlertOctagon, XCircle, LogOut,
  ChevronRight, Lock, Calendar, RefreshCw, Volume2
} from 'lucide-react';

const BACKEND_URL = import.meta.env.PROD ? 'https://hospital-automation-nc4h.onrender.com' : 'http://localhost:5000';

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
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Routes>
          <Route path="/" element={<PatientPortal />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

/* ==========================================================================
   PATIENT PORTAL: CHAT-FIRST WIDGET & LIVE TOKEN VIEW
   ========================================================================== */
function PatientPortal() {
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

  const loadWaitTimes = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/queues/public-status`);
      if (res.ok) {
        const data = await res.json();
        setWaitTimes(prev => ({ ...prev, ...data }));
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
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text })
      });
      const data = await res.json();

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
      setMessages(prev => [...prev, { sender: 'bot', text: 'Error contacting AI assistant. Make sure backend is running.' }]);
    }
  };

  return (
    <div className="flex-1 flex w-full max-w-[1440px] mx-auto h-[calc(100vh-62px)] overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200 min-w-0">
      {/* Left Sidebar: Hospital Info & Wait Times */}
      <aside className="hidden lg:flex flex-col w-80 bg-[var(--card-bg)] border-r border-[var(--border-color)]/30 p-6 overflow-y-auto no-scrollbar shadow-[inset_-10px_0_20px_rgba(0,0,0,0.01)] relative z-10">
        <div className="mb-6">
          <div className="w-full h-32 rounded-xl bg-zinc-800 mb-4 overflow-hidden relative shadow-sm">
            <div 
              className="bg-cover bg-center w-full h-full absolute inset-0 opacity-80" 
              style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuA1x4Ta8X_Leb2KfTzTMhRKsT439crOzzOgCCfSQH3UNSJlkdZTlRZT13ai7p8kN9f7_vHvbO7z2snijUJmc30zd6loDlIMh8Uth9PitBK4Q9fgbf17IwSVaxF8O9WHyaQvTAvo-ILHCBdZnJT8Yhu4iOlLxRG6irdb1Gnl_7dsWd1s1hLWea_09I6kOuw8kjUH9psbS4v-OXZXFH7mVJ9A8DwUUtxXqxAK0RcJIlWbR2K3O1vo3ZCrbqgnr5Egw0jJOTNYtRgR1lFx')" }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent"></div>
            <h3 className="absolute bottom-4 left-4 text-white font-bold text-lg leading-tight">
              General Hospital<br/>
              <span className="text-xs text-white/80 font-normal">Main Campus</span>
            </h3>
          </div>
          <div className="space-y-3 text-xs text-[var(--text-secondary)] font-semibold">
            <div className="flex items-start space-x-2">
              <span className="material-symbols-outlined text-[16px] text-zinc-400">location_on</span>
              <p>123 Healthcare Blvd, Medical District</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[16px] text-zinc-400">call</span>
              <p>+1 (555) 123-4567</p>
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
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[22px]">smart_toy</span>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--card-bg)] animate-pulse"></span>
            </div>
            <div>
              <h2 className="font-extrabold text-sm md:text-base text-[var(--text-color)]">CareSync Assistant</h2>
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
            const isSelectDoctorPrompt = msg.text.includes("Select an available doctor to book your token:");
            
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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

  const handleComplete = async (revisitDays = 0) => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/doctor/queue/complete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doctorToken}` 
        },
        body: JSON.stringify({ revisitDays })
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

              {/* Informative Stats Box */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 text-xs text-[var(--text-secondary)] space-y-2 shadow-sm">
                <h5 className="font-bold text-[var(--text-color)]">Quick Reference</h5>
                <p>• **Emergency SOS** tokens are automatically prioritized and pushed above regular tokens in the waiting list.</p>
                <p>• **Speech Synthesis** automatically announces tokens to patients when called.</p>
                <p>• **Midnight reset** cron clears active databases daily at 12:00 AM.</p>
              </div>

            </div>

          </div>
        )}
      </div>

      {/* Complete Checkup & Re-visit Reminder Modal Overlay */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative text-[var(--text-color)]">
            <h3 className="font-extrabold text-[var(--text-color)] text-lg mb-2">Complete Patient Checkup</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">You are concluding the checkup for **{queue?.currentToken?.patient?.name || 'the patient'}**. Would you like to schedule a re-visit reminder?</p>
            
            <div className="space-y-3 mb-6 text-sm">
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Re-visit Reminder Interval</label>
              <div className="grid grid-cols-2 gap-2">
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
                <div className="mt-3 animate-fade-in">
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
                  await handleComplete(days);
                  setShowCompleteModal(false);
                  setRevisitSelection('none');
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
