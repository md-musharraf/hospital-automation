import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BACKEND_URL, socket } from '../App';

export default function PatientPortal() {
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
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-550 rounded-full border-2 border-[var(--card-bg)] animate-pulse"></span>
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
