import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BACKEND_URL, socket } from '../App';
import { getFacilityTheme, themeVars, patternDataUri } from '../theme/facilityThemes';
import useScrollReveal from '../hooks/useScrollReveal';

export default function PatientPortal() {
  const { hospitalId } = useParams();
  const [whatsappNumber, setWhatsappNumber] = useState('+1 (415) 523-8886');
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [loadingHosp, setLoadingHosp] = useState(true);
  const navigate = useNavigate();

  // Translation Dictionaries (Feature 7)
  const [currentLang, setCurrentLang] = useState('en');
  const [voiceEnabled, setVoiceEnabled] = useState(true); // Feature 6
  const [travelWarning, setTravelWarning] = useState(''); // Feature 9

  const translations = {
    en: {
      changeHospital: 'Change Hospital',
      activeCampus: 'Active Campus',
      diagnosticLab: 'Diagnostic Lab',
      activeClinic: 'Active Clinic',
      medicalCenter: 'Medical Center',
      governmentDispensary: 'Government Dispensary',
      openNow: 'Open Now • 24/7 ER',
      waitTimes: 'Current Wait Times',
      labWaitTimes: 'Lab Counter Wait Times',
      gp: 'General Practice',
      peds: 'Pediatrics',
      er: 'Emergency',
      mins: 'mins',
      waTitle: 'WhatsApp Assistant',
      waSub: 'Book & check status on chat',
      waSend: 'Send "Hi" to',
      chatBtn: 'Chat',
      secureMsg: 'Secure & Privacy Guaranteed',
      secureSub: 'Your medical information is end-to-end encrypted and fully HIPAA compliant.',
      activeToken: 'Active Patient Token',
      tokenLabel: 'Queue Token',
      department: 'Department',
      cabin: 'Cabin Room',
      status: 'Queue Status',
      estWait: 'Est. Wait Time',
      noActiveToken: 'No Active Queue Token',
      noActiveSub: 'Complete the chat triage form to book an appointment and obtain a real-time status token.',
      voiceAlert: 'Voice Alerts',
      delayToken: 'Delay Token',
      delayNotice: 'Move your token 3 spots back',
      directionBtn: 'Get Directions',
      travelNotice: 'Estimated Travel Warning',
      travelMsg: 'Please start travel soon to reach your appointment on time.',
      absent: 'Absent',
      waiting: 'Waiting',
      completed: 'Completed',
      active: 'Active'
    },
    hi: {
      changeHospital: 'अस्पताल बदलें',
      activeCampus: 'सक्रिय परिसर',
      diagnosticLab: 'डायग्नोस्टिक लैब',
      activeClinic: 'सक्रिय क्लिनिक',
      medicalCenter: 'चिकित्सा केंद्र',
      governmentDispensary: 'सरकारी औषधालय',
      openNow: 'खुला है • 24/7 आपातकालीन',
      waitTimes: 'वर्तमान प्रतीक्षा समय',
      labWaitTimes: 'लैब काउंटर प्रतीक्षा समय',
      gp: 'सामान्य चिकित्सा (GP)',
      peds: 'बाल रोग विशेषज्ञ',
      er: 'आपातकालीन (ER)',
      mins: 'मिनट',
      waTitle: 'व्हाट्सएप सहायक',
      waSub: 'चैट पर बुक करें और स्थिति जांचें',
      waSend: '"Hi" भेजें',
      chatBtn: 'चैट करें',
      secureMsg: 'सुरक्षित और गोपनीयता की गारंटी',
      secureSub: 'आपकी चिकित्सा जानकारी एंड-टू-एंड एन्क्रिप्टेड है और पूरी तरह से HIPAA आज्ञाकारी है।',
      activeToken: 'सक्रिय रोगी टोकन',
      tokenLabel: 'कतार टोकन',
      department: 'विभाग',
      cabin: 'केबिन कक्ष',
      status: 'कतार की स्थिति',
      estWait: 'संभावित प्रतीक्षा समय',
      noActiveToken: 'कोई सक्रिय टोकन नहीं',
      noActiveSub: 'अपॉइंटमेंट बुक करने और रीयल-टाइम टोकन प्राप्त करने के लिए चैट ट्राइएज फॉर्म पूरा करें।',
      voiceAlert: 'वॉइस अलर्ट',
      delayToken: 'टोकन विलंब करें',
      delayNotice: 'अपने टोकन को 3 स्थान पीछे खिसकाएं',
      directionBtn: 'दिशा-निर्देश प्राप्त करें',
      travelNotice: 'अनुमानित यात्रा चेतावनी',
      travelMsg: 'कृपया अपने अपॉइंटमेंट पर समय पर पहुंचने के लिए जल्द ही यात्रा शुरू करें।',
      absent: 'अनुपस्थित',
      waiting: 'प्रतीक्षा कर रहा है',
      completed: 'पूरा हो गया',
      active: 'सक्रिय'
    },
    bn: {
      changeHospital: 'হাসপাতাল পরিবর্তন',
      activeCampus: 'সক্রিয় ক্যাম্পাস',
      diagnosticLab: 'ডায়াগনস্টিক ল্যাব',
      activeClinic: 'সক্রিয় ক্লিনিক',
      medicalCenter: 'মেডিকেল সেন্টার',
      governmentDispensary: 'সরকারি ডিসপেনসারি',
      openNow: 'খোলা আছে • ২৪/৭ ইমার্জেন্সি',
      waitTimes: 'বর্তমান অপেক্ষার সময়',
      labWaitTimes: 'ল্যাব কাউন্টার অপেক্ষার সময়',
      gp: 'জেনারেল প্র্যাকটিস (GP)',
      peds: 'শিশু রোগ বিশেষজ্ঞ',
      er: 'জরুরী বিভাগ (ER)',
      mins: 'মিনিট',
      waTitle: 'হোয়াটসঅ্যাপ অ্যাসিস্ট্যান্ট',
      waSub: 'চ্যাটে বুকিং ও স্ট্যাটাস চেক করুন',
      waSend: '"Hi" পাঠান',
      chatBtn: 'চ্যাট',
      secureMsg: 'সুরক্ষিত ও গোপনীয়তার নিশ্চয়তা',
      secureSub: 'আপনার চিকিৎসা তথ্য এন্ড-টু-এন্ড এনক্রিপ্ট করা এবং সম্পূর্ণরূপে HIPAA অনুগত।',
      activeToken: 'সক্রিয় পেশেন্ট টোকেন',
      tokenLabel: 'কিউ টোকেন',
      department: 'বিভাগ',
      cabin: 'কেবিন রুম',
      status: 'কিউ স্ট্যাটাস',
      estWait: 'সম্ভাব্য অপেক্ষার সময়',
      noActiveToken: 'কোনো সক্রিয় টোকেন নেই',
      noActiveSub: 'অ্যাপয়েন্টমেন্ট বুক করতে এবং রিয়েল-টাইম টোকেন পেতে চ্যাট ট্রায়াজ ফর্মটি পূরণ করুন।',
      voiceAlert: 'ভয়েস অ্যালার্ট',
      delayToken: 'টোকেন বিলম্ব করুন',
      delayNotice: 'আপনার টোকেনটি ৩ ধাপ পিছিয়ে দিন',
      directionBtn: 'মানচিত্র দেখুন',
      travelNotice: 'ভ্রমণ সতর্কতা',
      travelMsg: 'অনুগ্রহ করে অ্যাপয়েন্টমেন্টের সময়মতো পৌঁছানোর জন্য শীঘ্রই যাত্রা শুরু করুন।',
      absent: 'অনুপস্থিত',
      waiting: 'অপেক্ষমাণ',
      completed: 'সম্পন্ন',
      active: 'সক্রিয়'
    }
  };

  const t = (key) => translations[currentLang]?.[key] || translations['en'][key] || key;

  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Welcome to the CareSync AI Assistant! 🏥' },
    { sender: 'bot', text: "I can help you book an appointment, check live queues, or trigger emergency tokens. Send a message like 'Hi' or 'Hello' to begin!" }
  ]);
  const [options, setOptions] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substr(2, 9));
  const [myToken, setMyToken] = useState(null);
  const [calledAlert, setCalledAlert] = useState(null);
  const [doctorList, setDoctorList] = useState([]);
  const [showChatMode, setShowChatMode] = useState(false);

  const [waitTimes, setWaitTimes] = useState({
    'Emergency': 15,
    'General Practice': 15,
    'Pediatrics': 10
  });

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load hospital information & doctors list dynamically
  useEffect(() => {
    const hospId = hospitalId || 'general-hospital';
    setLoadingHosp(true);

    // Fetch Hospital Info
    fetch(`${BACKEND_URL}/api/v1/chat/hospital/${hospId}`)
      .then(res => res.json())
      .then(data => {
        setHospitalInfo(data);
        if (data.whatsappNumber) {
          setWhatsappNumber(data.whatsappNumber);
        }
        if (data.welcomeMessage) {
          setMessages([
            { sender: 'bot', text: `Welcome to ${data.name}! 🏥` },
            { sender: 'bot', text: data.welcomeMessage },
            { sender: 'bot', text: "I can help you book an appointment, check live queues, or trigger emergency tokens. Send a message like 'Hi' or 'Hello' to begin!" }
          ]);
        }
      })
      .catch(err => console.error('Error loading hospital config:', err));

    // Fetch Hospital Doctors
    fetch(`${BACKEND_URL}/api/v1/chat/hospital/${hospId}/doctors`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDoctorList(data);
        }
        setLoadingHosp(false);
      })
      .catch(err => {
        console.error('Error loading doctors list:', err);
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
      .then(res => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(data => {
        if (data.token) {
          setMyToken(prev => ({
            ...prev,
            estimatedWaitTime: data.token.estimatedWaitTime
          }));
        }
      })
      .catch(err => console.error('Queue update fetch error:', err));
    };

    socket.on('queue-updated', handleQueueUpdated);

    // These listeners only make sense once a token exists, but we must not
    // `return` early here — that would skip registering the cleanup function
    // below and leak the `queue-updated` listener above on every re-run of
    // this effect (e.g. every time currentLang/voiceEnabled changes while
    // myToken is still null, before a token is booked).
    let handleTokenCalled = null;
    let handleQueueReset = null;

    if (myToken) {
      socket.emit('join-room', `patient:${myToken.id}`);

      handleTokenCalled = (data) => {
        if (data.status === 'Active') {
          setCalledAlert(`Please proceed to ${data.roomName || 'Cabin A'}`);
          if (voiceEnabled) {
            speakAnnouncement(myToken.tokenNumber, data.roomName || 'Cabin A');
          }
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

      handleQueueReset = () => {
        setMyToken(null);
        setCalledAlert(null);
        loadWaitTimes();
        setMessages(prev => [...prev, { sender: 'bot', text: '🏥 Midnight maintenance completed. All active queue tokens have been archived.' }]);
      };

      socket.on('token-called', handleTokenCalled);
      socket.on('queue-reset', handleQueueReset);
    }

    return () => {
      if (handleTokenCalled) socket.off('token-called', handleTokenCalled);
      if (handleQueueReset) socket.off('queue-reset', handleQueueReset);
      socket.off('queue-updated', handleQueueUpdated);
    };
  }, [myToken, voiceEnabled, currentLang]);

  const handleDelayToken = async () => {
    if (!myToken?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/token/delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: myToken.id })
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [
          ...prev, 
          { sender: 'bot', text: currentLang === 'hi' ? '✅ आपका टोकन 3 स्थान पीछे कर दिया गया है।' : currentLang === 'bn' ? '✅ আপনার টোকেন ৩ ধাপ পিছিয়ে দেওয়া হয়েছে।' : '✅ Your token has been delayed by 3 places.' }
        ]);
      } else {
        alert(data.message || 'Failed to delay token');
      }
    } catch (e) {
      console.error('Error delaying token:', e);
    }
  };

  const speakAnnouncement = (tokenNum, cabin) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      let text = '';
      let lang = 'en-US';
      const cleanTokenNum = tokenNum.replace('-', ' ');

      if (currentLang === 'hi') {
        text = `कृपया ध्यान दें। टोकन नंबर ${cleanTokenNum}, कृपया ${cabin} में जाएँ।`;
        lang = 'hi-IN';
      } else if (currentLang === 'bn') {
        text = `দয়া করে শুনুন। টোকেন নাম্বার ${cleanTokenNum}, দয়া করে ${cabin} এ যান।`;
        lang = 'bn-IN';
      } else {
        text = `Attention please. Token Number ${cleanTokenNum}, please proceed to ${cabin}.`;
        lang = 'en-US';
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
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
        setMyToken(data.token);
        setMessages(prev => [...prev, { 
          sender: 'bot', 
          text: `🎉 Appointment confirmed! Your live Queue Token is ${data.token.tokenNumber}. Estimated waiting time: ${data.token.estimatedWaitTime} minutes.` 
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { sender: 'bot', text: `⚠️ Error: ${err.message || 'Make sure backend is running.'}` }]);
      setOptions(['Hi', 'Book New Appointment / Generate Token']);
    }
  };

  // Geolocation & Travel Time Warning (Feature 9)
  useEffect(() => {
    if (!myToken || myToken.status !== 'Waiting' || !hospitalInfo?.coordinates) {
      setTravelWarning('');
      return;
    }

    const calculateTravelTime = (userLat, userLng) => {
      const hospLat = hospitalInfo.coordinates.lat;
      const hospLng = hospitalInfo.coordinates.lng;

      if (!hospLat || !hospLng) return;

      // Simple distance calculation (Euclidean approximation is fast and sufficient for local areas)
      const dy = hospLat - userLat;
      const dx = (hospLng - userLng) * Math.cos((hospLat * Math.PI) / 180);
      const distanceKm = Math.sqrt(dx * dx + dy * dy) * 111.32; // 1 degree lat = ~111.32km

      // Assume 25 km/h local traffic speed + 3 mins parking buffer
      const travelMins = Math.round((distanceKm / 25) * 60) + 3;

      if (myToken.estimatedWaitTime <= travelMins + 5) {
        if (currentLang === 'hi') {
          setTravelWarning(`⚠️ यात्रा चेतावनी: आपके स्थान से पहुँचने में लगभग ${travelMins} मिनट लगेंगे। आपका संभावित प्रतीक्षा समय ${myToken.estimatedWaitTime} मिनट है। कृपया समय पर पहुँचने के लिए जल्द ही निकलें।`);
        } else if (currentLang === 'bn') {
          setTravelWarning(`⚠️ ভ্রমণ সতর্কতা: আপনার স্থান থেকে পৌঁছাতে প্রায় ${travelMins} মিনিট লাগবে। আপনার সম্ভাব্য কিউ সময় ${myToken.estimatedWaitTime} মিনিট। অনুগ্রহ করে এখনই রওনা হোন।`);
        } else {
          setTravelWarning(`⚠️ Travel Alert: It takes approx ${travelMins} mins to travel from your current location. Your estimated wait is ${myToken.estimatedWaitTime} mins. Please start traveling now to reach on time.`);
        }
      } else {
        setTravelWarning('');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          calculateTravelTime(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          // Fallback to a mock location (e.g. 5km away from hospital for demo purposes)
          const mockUserLat = hospitalInfo.coordinates.lat + 0.035;
          const mockUserLng = hospitalInfo.coordinates.lng - 0.025;
          calculateTravelTime(mockUserLat, mockUserLng);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      // Browser doesn't support geolocation, fallback to mock distance
      const mockUserLat = hospitalInfo.coordinates.lat + 0.035;
      const mockUserLng = hospitalInfo.coordinates.lng - 0.025;
      calculateTravelTime(mockUserLat, mockUserLng);
    }
  }, [myToken, hospitalInfo, currentLang]);

  // Reveal sections on scroll; re-scan when facility loads or view mode flips.
  useScrollReveal([hospitalInfo?.id, showChatMode, doctorList.length]);

  if (loadingHosp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4">
        <span className="material-symbols-outlined text-[48px] text-[var(--primary-color)] animate-spin">refresh</span>
        <p className="text-sm font-bold text-[var(--text-secondary)]">Loading white-labeled portal...</p>
      </div>
    );
  }

  const isLab = hospitalInfo?.type === 'Lab';
  // Resolve the facility's design identity (colour mood, gradient, icon, copy).
  // Partner white-label colours always win over category defaults.
  const theme = getFacilityTheme(hospitalInfo?.type, {
    primaryColor: hospitalInfo?.primaryColor,
    secondaryColor: hospitalInfo?.secondaryColor,
  });
  const primaryColor = theme.primary;
  const secondaryColor = theme.secondary;

  const getDeptLabel = (originalDept) => {
    const isClinic = hospitalInfo?.type === 'Clinic';
    if (isLab) {
      if (originalDept === 'Emergency') return 'Urgent Diagnostics / Special Tests';
      if (originalDept === 'General Practice') return 'Blood & Urine Collection Counter';
      if (originalDept === 'Pediatrics') return 'Radiology & X-Ray Room';
    } else if (isClinic) {
      if (originalDept === 'Emergency') return 'Urgent Walk-in Care';
      if (originalDept === 'General Practice') return 'General Consultation';
      if (originalDept === 'Pediatrics') return 'Child & Family Health';
    }
    return originalDept;
  };

  if (!showChatMode) {
    return (
      <div
        style={themeVars(theme)}
        className="flex-1 w-full bg-[var(--bg-color)] text-[var(--text-color)] overflow-y-auto min-w-0 font-sans scroll-smooth"
      >
        {/* LANDING PAGE NAV BAR */}
        <header className="sticky top-0 z-50 bg-[var(--card-bg)]/80 backdrop-blur-md border-b border-[var(--border-color)]/30 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            {hospitalInfo?.logoUrl ? (
              <img src={hospitalInfo.logoUrl} alt="Logo" className="w-9 h-9 rounded-full object-cover shadow-sm" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center ring-1 ring-[var(--primary-color)]/20">
                <span className="material-symbols-outlined text-[20px]">{theme.icon}</span>
              </div>
            )}
            <div>
              <span className="font-extrabold text-base tracking-tight text-[var(--text-color)]">{hospitalInfo?.name || 'CareSync'}</span>
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2 py-0.5 rounded-full">
                {hospitalInfo?.type || 'Hospital'}
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center space-x-8 text-xs font-black uppercase tracking-wider text-[var(--text-secondary)]">
            <a href="#home" className="hover:text-[var(--primary-color)] transition-colors">{currentLang === 'hi' ? 'मुख्य पृष्ठ' : currentLang === 'bn' ? 'হোম' : 'Home'}</a>
            <a href="#services" className="hover:text-[var(--primary-color)] transition-colors">{currentLang === 'hi' ? 'सेवाएं' : currentLang === 'bn' ? 'সেবাসমূহ' : 'Services'}</a>
            <a href="#doctors" className="hover:text-[var(--primary-color)] transition-colors">
              {isLab 
                ? (currentLang === 'hi' ? 'हमारे विशेषज्ञ' : currentLang === 'bn' ? 'আমাদের বিশেষজ্ঞ' : 'Specialists')
                : (currentLang === 'hi' ? 'हमारे डॉक्टर' : currentLang === 'bn' ? 'আমাদের ডাক্তার' : 'Doctors')
              }
            </a>
            <a href="#contact" className="hover:text-[var(--primary-color)] transition-colors">{currentLang === 'hi' ? 'সম্পর্ক' : currentLang === 'bn' ? 'যোগাযোগ' : 'Contact'}</a>
          </nav>

          <div className="flex items-center space-x-3">
            {/* Language Selector */}
            <select
              value={currentLang}
              onChange={(e) => setCurrentLang(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 focus:border-[var(--primary-color)] rounded-xl px-2.5 py-1.5 outline-none text-[10px] font-black uppercase tracking-wider text-[var(--text-color)] cursor-pointer shadow-sm"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="bn">বাংলা</option>
            </select>

            <button 
              onClick={() => setShowChatMode(true)}
              className="px-4 py-2 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 duration-100"
            >
              {currentLang === 'hi' ? 'टोकन बुक करें' : currentLang === 'bn' ? 'টোকেন বুক করুন' : 'Book Token'}
            </button>
          </div>
        </header>

        {/* HERO SECTION — facility-themed, animated */}
        <section id="home" className="relative overflow-hidden">
          {/* Animated themed gradient wash */}
          <div
            className="absolute inset-0 opacity-[0.10] dark:opacity-[0.16] animate-gradient pointer-events-none"
            style={{ backgroundImage: 'linear-gradient(120deg, var(--grad-from), var(--grad-via), var(--grad-to), var(--grad-via))' }}
          />
          {/* Ambient facility pattern */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: patternDataUri(theme.pattern, theme.primary, 0.5), backgroundRepeat: 'repeat' }}
          />
          {/* Floating decorative orbs */}
          <div className="absolute -top-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-30 animate-float-slow pointer-events-none" style={{ background: theme.primary }} />
          <div className="absolute top-10 right-0 w-80 h-80 rounded-full blur-3xl opacity-20 animate-float-slow pointer-events-none" style={{ background: theme.accent, animationDelay: '3s' }} />

          <div className="relative py-20 px-6 sm:px-12 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="animate-fade-in-up inline-flex items-center space-x-2 bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 text-[var(--primary-color)] px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                <span className="material-symbols-outlined text-[15px]">{theme.icon}</span>
                <span>{theme.heroKicker}</span>
                <span className="w-1 h-1 rounded-full bg-[var(--primary-color)]/40" />
                <span className="text-[var(--text-secondary)] normal-case tracking-normal font-bold">{theme.kind}</span>
              </div>
              <h1 className="animate-fade-in-up delay-100 text-4xl sm:text-5xl font-black text-[var(--text-color)] tracking-tight leading-[1.08]">
                {hospitalInfo?.welcomeMessage || theme.heroTitle}
              </h1>
              <p className="animate-fade-in-up delay-200 text-sm text-[var(--text-secondary)] font-semibold leading-relaxed max-w-lg">
                {hospitalInfo?.description || theme.heroSub}
              </p>

              <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => setShowChatMode(true)}
                  className="btn-sheen px-6 py-3.5 bg-[var(--primary-color)] text-[var(--primary-text)] hover:brightness-110 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[var(--primary-color)]/25 flex items-center justify-center space-x-2 active:scale-95 duration-100"
                >
                  <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                  <span>{currentLang === 'hi' ? 'चैट बुकिंग सहायक' : currentLang === 'bn' ? 'চ্যাট বুকিং অ্যাসিস্ট্যান্ট' : 'Start AI Booking'}</span>
                </button>
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=hi`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 active:scale-95 duration-100"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span>{currentLang === 'hi' ? 'व्हाट्सएप बुकिंग' : currentLang === 'bn' ? 'হোয়াটসঅ্যাপ বুকিং' : 'Book on WhatsApp'}</span>
                </a>
              </div>

              {/* Trust chips */}
              <div className="animate-fade-in-up delay-400 flex flex-wrap items-center gap-4 pt-3 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <span className="flex items-center space-x-1.5"><span className="material-symbols-outlined text-[15px] text-[var(--primary-color)]">verified_user</span><span>HIPAA Compliant</span></span>
                <span className="flex items-center space-x-1.5"><span className="material-symbols-outlined text-[15px] text-[var(--primary-color)]">bolt</span><span>Live Queue</span></span>
                <span className="flex items-center space-x-1.5"><span className="material-symbols-outlined text-[15px] text-[var(--primary-color)]">translate</span><span>Multilingual</span></span>
              </div>
            </div>

            {/* Hero Image & live waiting status dashboard */}
            <div className="animate-scale-in delay-200 relative">
              {/* Glow ring behind image */}
              <div className="absolute -inset-3 rounded-[2rem] blur-2xl opacity-30" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }} />
              <div className="relative w-full h-80 sm:h-96 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                <img
                  src={hospitalInfo?.coverImage || hospitalInfo?.heroImage || theme.heroImage}
                  alt="Facility Campus"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = theme.heroImage; }}
                />
                <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${theme.secondary}e6, ${theme.secondary}40 45%, transparent)` }} />

                {/* Floating category badge */}
                <div className="absolute top-5 left-5 flex items-center space-x-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20 text-white">
                  <span className="material-symbols-outlined text-[16px]">{theme.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-wider">{theme.label}</span>
                </div>

                {/* Floating live wait-times summary */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-white flex justify-between items-center">
                  <div>
                    <p className="text-[9px] uppercase font-bold text-white/85 tracking-wider">Live Estimated Wait</p>
                    <p className="text-sm font-black mt-1">
                      {isLab
                        ? `Urgent: ${waitTimes['Emergency']}m • Blood draw: ${waitTimes['General Practice'] || 15}m`
                        : `General: ${waitTimes['General Practice'] || 15}m • ER: ${waitTimes['Emergency']}m`
                      }
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5 bg-emerald-500/90 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES / SPECIALTIES SECTION */}
        <section id="services" className="bg-[var(--card-bg)] border-y border-[var(--border-color)]/30 py-20 px-6 sm:px-12">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="reveal text-center max-w-xl mx-auto space-y-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary-color)] font-sans">
                {hospitalInfo?.type === 'Clinic' 
                  ? `${hospitalInfo.clinicSubtype || 'General'} Clinic Care` 
                  : hospitalInfo?.type === 'Medical' 
                    ? `${hospitalInfo.clinicSubtype || 'Pharmacy'} Services` 
                    : 'Therapeutic Excellence'
                }
              </span>
              <h2 className="text-3xl font-black text-[var(--text-color)] tracking-tight font-sans">
                {hospitalInfo?.type === 'Clinic' 
                  ? (hospitalInfo.clinicSubtype === 'Dental' ? 'Complete Dental Care Under One Roof' 
                    : hospitalInfo.clinicSubtype === 'Eye' ? 'Advanced Ophthalmology Under One Roof'
                    : hospitalInfo.clinicSubtype === 'Ortho' ? 'Complete Bone & Joint Care Under One Roof'
                    : 'Focused Specialty Care Under One Roof')
                  : hospitalInfo?.type === 'Medical'
                    ? (hospitalInfo.clinicSubtype === 'Pharmacy' ? 'Your Trusted Neighborhood Pharmacy'
                      : hospitalInfo.clinicSubtype === 'Homeopathy' ? 'Safe & Natural Homeopathic Healing'
                      : hospitalInfo.clinicSubtype === 'Ayurvedic' ? 'Authentic Ayurvedic & Herbal Care'
                      : hospitalInfo.clinicSubtype === 'Surgical' ? 'Reliable Surgical & Medical Supplies'
                      : 'Quality Medicines & Wellness Supplies')
                    : 'Focused Where It Matters Most'
                }
              </h2>
              <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed font-sans">
                We provide specialized health infrastructure, customized workflows, and experienced patient care divisions.
              </p>
            </div>

            <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-6">
              {hospitalInfo?.customServices && hospitalInfo.customServices.length > 0 ? (
                hospitalInfo.customServices.map((srv, idx) => (
                  <div key={idx} className="card-hover bg-[var(--bg-color)] p-6 rounded-2xl border border-[var(--border-color)]/30 shadow-sm space-y-4">
                    <span className="material-symbols-outlined text-[32px] text-[var(--primary-color)] bg-[var(--primary-color)]/10 p-3 rounded-2xl">
                      {srv.icon || 'local_hospital'}
                    </span>
                    <h3 className="font-black text-base text-[var(--text-color)] font-sans">{srv.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold font-sans">{srv.description}</p>
                  </div>
                ))
              ) : (
                <>
                  {/* Card 1 */}
                  <div className="card-hover bg-[var(--bg-color)] p-6 rounded-2xl border border-[var(--border-color)]/30 shadow-sm space-y-4">
                    <span className="material-symbols-outlined text-[32px] text-rose-500 bg-rose-500/10 p-3 rounded-2xl">
                      {isLab ? 'biotech' : hospitalInfo?.type === 'Medical' ? 'medical_services' : 'local_hospital'}
                    </span>
                    <h3 className="font-black text-base text-[var(--text-color)] font-sans">
                      {isLab ? 'Urgent Diagnostic Care' : hospitalInfo?.type === 'Medical' ? 'Prescription Refills' : 'Emergency Medicine'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold font-sans">
                      {isLab 
                        ? 'Fast-track laboratory diagnostics and urgent diagnostic test processing with real-time digital report uploads.' 
                        : hospitalInfo?.type === 'Medical'
                          ? 'Quick prescription verification and dispensing by licensed pharmacists with automated refills.'
                          : '24/7 fully equipped Emergency Room staffed by trauma specialists and critical care experts.'
                      }
                    </p>
                  </div>

                  {/* Card 2 */}
                  <div className="card-hover bg-[var(--bg-color)] p-6 rounded-2xl border border-[var(--border-color)]/30 shadow-sm space-y-4">
                    <span className="material-symbols-outlined text-[32px] text-[var(--primary-color)] bg-[var(--primary-color)]/10 p-3 rounded-2xl">
                      {isLab ? 'bloodtype' : hospitalInfo?.type === 'Medical' ? 'biotech' : 'medical_services'}
                    </span>
                    <h3 className="font-black text-base text-[var(--text-color)] font-sans">
                      {isLab ? 'Hematology & Chemistry' : hospitalInfo?.type === 'Medical' ? 'OTC & Wellness Store' : 'General & Internal Medicine'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold font-sans">
                      {isLab 
                        ? 'Automated biochemistry analyzers, blood sample extraction counters, and full metabolic panel checkups.' 
                        : hospitalInfo?.type === 'Medical'
                          ? 'A wide array of vitamins, dietary supplements, health monitors, and daily wellness essentials.'
                          : 'Outpatient consultations, routine diagnostic checks, health evaluations, and preventative care treatments.'
                      }
                    </p>
                  </div>

                  {/* Card 3 */}
                  <div className="card-hover bg-[var(--bg-color)] p-6 rounded-2xl border border-[var(--border-color)]/30 shadow-sm space-y-4">
                    <span className="material-symbols-outlined text-[32px] text-indigo-500 bg-indigo-500/10 p-3 rounded-2xl">
                      {isLab ? 'settings_accessibility' : hospitalInfo?.type === 'Medical' ? 'settings_accessibility' : 'child_care'}
                    </span>
                    <h3 className="font-black text-base text-[var(--text-color)] font-sans">
                      {isLab ? 'Radiology & X-Ray' : hospitalInfo?.type === 'Medical' ? 'Home Delivery & Support' : 'Pediatric Medicine'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold font-sans">
                      {isLab 
                        ? 'State of the art chest x-ray scans, imaging counters, ultrasounds, and diagnostic radiologist screenings.' 
                        : hospitalInfo?.type === 'Medical'
                          ? 'Direct home delivery of medicines, elder support supplies, and orthopedic support devices.'
                          : 'Comprehensive child healthcare, newborn screenings, routine vaccinations, and pediatric diagnostics.'
                      }
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* WHY CHOOSE US SECTION (Features checklist) */}
        {hospitalInfo?.features && hospitalInfo.features.length > 0 && (
          <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center border-b border-[var(--border-color)]/30">
            {/* Left Column: List */}
            <div className="space-y-6 text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary-color)] font-sans">Why Choose Us</span>
              <h2 className="text-3xl font-black text-[var(--text-color)] tracking-tight font-sans">
                Why Choose {hospitalInfo?.name || 'Our Store'}?
              </h2>
              <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed font-sans">
                We are committed to providing premium, personalized care using the latest technology in a comfortable and relaxed environment.
              </p>
              
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                {hospitalInfo.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center space-x-3 text-xs font-bold text-[var(--text-color)] font-sans">
                    <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check_circle</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Column: Premium Banner / Illustration */}
            <div className="relative">
              <div className="w-full h-80 sm:h-96 rounded-3xl overflow-hidden shadow-2xl relative border border-[var(--border-color)]/45">
                <img 
                  src={hospitalInfo?.type === 'Clinic' && hospitalInfo.clinicSubtype === 'Dental'
                    ? 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=800&auto=format&fit=crop'
                    : hospitalInfo?.type === 'Medical'
                      ? 'https://images.unsplash.com/photo-1607619056574-7b8d304a3b6f?q=80&w=800&auto=format&fit=crop'
                      : 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=800&auto=format&fit=crop'
                  } 
                  alt="Specialist Treatment" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent"></div>
                
                {/* Overlay card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-left text-white">
                  <p className="text-[10px] uppercase font-bold text-white/90 tracking-wider font-sans">Patient First Philosophy</p>
                  <p className="text-xs font-semibold mt-1 font-sans">Our facility matches international standards in safety, hygiene, and service speed.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* REGISTERED ACTIVE DOCTORS SECTION */}
        <section id="doctors" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto space-y-12">
          <div className="reveal text-center max-w-xl mx-auto space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary-color)]">Experienced Professionals</span>
            <h2 className="text-3xl font-black text-[var(--text-color)] tracking-tight font-sans">
              {isLab ? 'Our Certified Laboratory Specialists' : 'Our Registered Medical Specialists'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">
              {isLab 
                ? 'Book direct appointments or token queues with our qualified lab technicians and consulting pathologists.'
                : 'Book live tokens with any of our certified clinical specialists or path coordinators.'
              }
            </p>
          </div>

          {doctorList.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-[var(--border-color)]/50 rounded-2xl bg-[var(--card-bg)]/40 max-w-md mx-auto">
              <span className="material-symbols-outlined text-[36px] text-[var(--text-secondary)]/40 mb-2">person_off</span>
              <p className="text-xs text-[var(--text-secondary)] font-bold">No active specialists listed on duty today.</p>
            </div>
          ) : (
            <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {doctorList.map((doc) => (
                <div
                  key={doc._id}
                  className="card-hover bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 text-center relative overflow-hidden group"
                >
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-200 border border-[var(--border-color)]/30 mx-auto mb-4">
                    <img 
                      src={doc.email.toLowerCase().includes('sarah') 
                        ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWdRlyEiC2Yx0HWgBSOach1egGcQ0IkKHDKXiKW95RHy3l-ZXQzsKhEAACSuq7LLYYYXPqx19hTAtvRNbRFPiF1dFioOaElurSxNksTJJp8UUTrgGOSBjZ6UY0RBLaNP2I2bjLyVD1Owse2cXuKTyp9Z5bNIwSTp8vM3fyy1dQfm8PHbYKXCDfUC_1IzepbJC7ByV-s4jkJQht1CncmvPAVtCo2eQDPjp8Eqn9wUxEMbXyMmhBcQLvpR0HL8CHTq3fHlK3pTgo4NyX'
                        : 'https://lh3.googleusercontent.com/aida-public/AB6AXuBr7a9IwJ3lVwmiEIptsdjdBnkbqAq5y-oH7FGBDywOkQbEyKCpD5eqUJXGzZI8Sldi_VWAmtMDivwX3GBC7v4iGEam3qMA_cYxaFUo9OK9XAPj2knsB0UpcTz67MZV2MNojcCs30U58z1NBROK_R73S5k2pHk5I3J_VatiyypolMqf1A0fsLbjXqoN8Nl0-9GpZRISI3rxF1pIQwFCB1DIOLj26MIYOMDzj4P8JlhIo83exsG_D1jLKaZLV51cokSPWqrEXCTLy90N'
                      }
                      alt={doc.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-extrabold text-sm text-[var(--text-color)] group-hover:text-[var(--primary-color)] transition-colors">{doc.name}</h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wide mt-1">{doc.department}</p>
                  
                  <div className="flex justify-center items-center space-x-1 mt-3 text-[10px] font-bold text-[var(--text-secondary)]">
                    <span className="material-symbols-outlined text-amber-500 text-[12px]">star</span>
                    <span>4.9</span>
                    <span className="mx-1.5">•</span>
                    <span>Room {doc.currentRoom || 'Cabin A'}</span>
                  </div>

                  <button 
                    onClick={() => setShowChatMode(true)}
                    className="w-full py-2 mt-4 bg-[var(--bg-color)] hover:bg-[var(--primary-color)] hover:text-white border border-[var(--border-color)]/50 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    Select & Book
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* STATS INFOGRAPHIC — themed animated gradient band */}
        <section
          className="relative overflow-hidden text-white py-16 px-6 sm:px-12 animate-gradient"
          style={{ backgroundImage: 'linear-gradient(120deg, var(--grad-to), var(--grad-from), var(--grad-via), var(--grad-from))' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: patternDataUri(theme.pattern, '#ffffff', 0.7), backgroundRepeat: 'repeat' }} />
          <div className="reveal max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center relative z-10">
            <div>
              <p className="text-4xl sm:text-5xl font-black">{theme.stat.value}</p>
              <p className="text-[10px] uppercase font-extrabold tracking-widest text-white/85 mt-2">{theme.stat.label}</p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-black">15 Min</p>
              <p className="text-[10px] uppercase font-extrabold tracking-widest text-white/85 mt-2">Avg Wait Time</p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-black">100%</p>
              <p className="text-[10px] uppercase font-extrabold tracking-widest text-white/85 mt-2">
                {isLab ? 'Digital Reports' : hospitalInfo?.type === 'Medical' ? 'Genuine Stock' : 'Verified Reviews'}
              </p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-black">{theme.stat.altValue}</p>
              <p className="text-[10px] uppercase font-extrabold tracking-widest text-white/85 mt-2">{theme.stat.altLabel}</p>
            </div>
          </div>
        </section>

        {/* CONTACT & MAP INFO */}
        <section id="contact" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="reveal space-y-6">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary-color)]">Reach Us Anytime</span>
            <h2 className="text-3xl font-black text-[var(--text-color)] tracking-tight font-sans">Location & Address Details</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">
              Drop by for immediate consultations or connect with our representatives on WhatsApp.
            </p>

            <div className="space-y-4 text-xs font-semibold text-[var(--text-secondary)]">
              <div className="flex items-start space-x-3.5">
                <span className="material-symbols-outlined text-[var(--primary-color)] text-[22px]">location_on</span>
                <div>
                  <p className="font-extrabold text-[var(--text-color)] mb-0.5">Physical Campus Address</p>
                  <p>{hospitalInfo?.address || '123 Healthcare Blvd, Medical District'}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3.5">
                <span className="material-symbols-outlined text-[var(--primary-color)] text-[22px]">call</span>
                <div>
                  <p className="font-extrabold text-[var(--text-color)] mb-0.5">Direct Hotline</p>
                  <p>{hospitalInfo?.phone || '+1 (555) 123-4567'}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3.5">
                <span className="material-symbols-outlined text-emerald-500 text-[22px]">chat</span>
                <div>
                  <p className="font-extrabold text-[var(--text-color)] mb-0.5">WhatsApp Booking</p>
                  <p className="font-mono">{whatsappNumber}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Map Redirect Mock Card */}
          <div className="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border-color)]/30 shadow-md space-y-4 text-center">
            <span className="material-symbols-outlined text-[48px] text-[var(--primary-color)]">explore</span>
            <h3 className="font-black text-lg text-[var(--text-color)]">Explore Google Maps Navigation</h3>
            <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed max-w-sm mx-auto">
              Launch navigation parameters directly inside your mobile phone maps client to guide your journey to the clinic campus.
            </p>
            {hospitalInfo?.coordinates?.lat && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${hospitalInfo.coordinates.lat},${hospitalInfo.coordinates.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-[var(--primary-color)] text-[var(--primary-text)] hover:bg-[var(--primary-container)] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-98"
              >
                <span>{t('directionBtn')}</span>
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </a>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-[var(--border-color)]/30 py-8 px-6 text-center text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider bg-[var(--card-bg)]">
          <p>© 2026 {hospitalInfo?.name || 'CareSync'} Care Portal. All Rights Reserved. Powered by CareSync SaaS Engine.</p>
        </footer>

        {/* Floating WhatsApp Action Button */}
        <a 
          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=hi`}
          target="_blank" 
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-40 bg-emerald-600 hover:bg-emerald-700 active:scale-95 duration-100 text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center transition-all animate-bounce"
          title="WhatsApp Assistant"
        >
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.739-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.528 2.01 14.069.993 11.5.993c-5.44 0-9.865 4.369-9.87 9.799a9.71 9.71 0 001.44 4.793l-.995 3.633 3.738-.97c1.558.89 3.11 1.34 4.734 1.34h.015zm9.525-6.938c-.287-.143-1.697-.837-1.959-.933-.261-.096-.451-.143-.64.143-.19.286-.735.933-.9 1.127-.166.19-.332.214-.618.071-.286-.143-1.21-.445-2.305-1.42-.853-.76-1.428-1.7-1.595-1.986-.167-.286-.018-.44.125-.581.129-.127.287-.333.43-.5.143-.167.19-.286.286-.476.095-.19.048-.357-.024-.5-.071-.143-.64-1.543-.877-2.11-.23-.559-.483-.483-.66-.492-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.369-.268.297-1.023 1.002-1.023 2.444 0 1.442 1.049 2.839 1.192 3.03.143.19 2.064 3.15 5.002 4.425.699.303 1.244.484 1.67.62.703.223 1.344.192 1.85.117.564-.084 1.697-.693 1.936-1.362.239-.668.239-1.24.167-1.362-.072-.122-.268-.195-.554-.338z"/>
          </svg>
        </a>
      </div>
    );
  }

  return (
    <div 
      style={{
        '--primary-color': primaryColor,
        '--secondary-color': secondaryColor
      }}
      className="flex-1 flex w-full max-w-[1440px] mx-auto h-[calc(100vh-62px)] overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200 min-w-0"
    >
      {/* Left Sidebar: Hospital Info & Wait Times */}
      <aside className="hidden lg:flex flex-col w-80 bg-[var(--card-bg)] border-r border-[var(--border-color)]/30 p-6 overflow-y-auto no-scrollbar shadow-[inset_-10px_0_20px_rgba(0,0,0,0.01)] relative z-10">
        <div className="mb-6">
          <button 
            onClick={() => setShowChatMode(false)}
            className="w-full flex items-center justify-center space-x-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)]/25 active:scale-95 duration-100 text-[var(--text-secondary)] hover:text-[var(--text-color)] border border-[var(--border-color)]/30 rounded-xl py-2 px-3 mb-4 font-bold text-xs transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>{t('changeHospital')}</span>
          </button>

          <div className="w-full h-32 rounded-xl bg-zinc-800 mb-4 overflow-hidden relative shadow-sm">
            <div 
              className="bg-cover bg-center w-full h-full absolute inset-0 opacity-80" 
              style={{ backgroundImage: `url('${hospitalInfo?.coverImage || hospitalInfo?.heroImage || (isLab ? 'https://images.unsplash.com/photo-1579154204601-01588f351167?q=80&w=800&auto=format&fit=crop' : 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop')}')` }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent"></div>
            <h3 className="absolute bottom-4 left-4 text-white font-bold text-lg leading-tight">
              {hospitalInfo?.name || 'General Hospital'}<br/>
              <span className="text-xs text-white/80 font-normal">
                {isLab 
                  ? t('diagnosticLab') 
                  : hospitalInfo?.type === 'Clinic' 
                  ? t('activeClinic') 
                  : hospitalInfo?.type === 'Medical'
                  ? t('medicalCenter')
                  : hospitalInfo?.type === 'Government'
                  ? t('governmentDispensary')
                  : t('activeCampus')
                }
              </span>
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
              <p className="text-emerald-600 dark:text-emerald-400 font-bold">{t('openNow')}</p>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-[var(--border-color)]/50 mb-6"></div>

        <div className="mb-6">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-4">
            {isLab ? t('labWaitTimes') : t('waitTimes')}
          </h4>
          
          {/* Emergency Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 mb-2.5 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-rose-500 text-[18px]">
                {isLab ? 'biotech' : 'local_hospital'}
              </span>
              <span className="text-sm font-bold text-[var(--text-color)]">{getDeptLabel('Emergency')}</span>
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded">
              {waitTimes['Emergency']} mins
            </span>
          </div>

          {/* GP Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 mb-2.5 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">
                {isLab ? 'bloodtype' : 'medical_services'}
              </span>
              <span className="text-sm font-bold text-[var(--text-color)]">{getDeptLabel('General Practice')}</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-550/10 px-2 py-0.5 rounded">
              {waitTimes['General Practice'] || 15} mins
            </span>
          </div>

          {/* Pediatrics Wait Time Card */}
          <div className="bg-[var(--bg-color)] rounded-lg p-3 flex justify-between items-center border border-[var(--border-color)]/30 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">
                {isLab ? 'settings_accessibility' : 'child_care'}
              </span>
              <span className="text-sm font-bold text-[var(--text-color)]">{getDeptLabel('Pediatrics')}</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-550/10 px-2 py-0.5 rounded">
              {waitTimes['Pediatrics'] || 10} mins
            </span>
          </div>
        </div>

        {/* WhatsApp Integration Info Panel */}
        <div className="mb-6 bg-emerald-550/5 dark:bg-emerald-550/10 border border-emerald-500/20 rounded-xl p-4 relative overflow-hidden shadow-sm">
          <div className="flex items-center space-x-2.5 mb-2.5">
            <div className="bg-emerald-600 text-white p-1.5 rounded-lg shrink-0 flex items-center justify-center">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.739-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.528 2.01 14.069.993 11.5.993c-5.44 0-9.865 4.369-9.87 9.799a9.71 9.71 0 001.44 4.793l-.995 3.633 3.738-.97c1.558.89 3.11 1.34 4.734 1.34h.015zm9.525-6.938c-.287-.143-1.697-.837-1.959-.933-.261-.096-.451-.143-.64.143-.19.286-.735.933-.9 1.127-.166.19-.332.214-.618.071-.286-.143-1.21-.445-2.305-1.42-.853-.76-1.428-1.7-1.595-1.986-.167-.286-.018-.44.125-.581.129-.127.287-.333.43-.5.143-.167.19-.286.286-.476.095-.19.048-.357-.024-.5-.071-.143-.64-1.543-.877-2.11-.23-.559-.483-.483-.66-.492-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.369-.268.297-1.023 1.002-1.023 2.444 0 1.442 1.049 2.839 1.192 3.03.143.19 2.064 3.15 5.002 4.425.699.303 1.244.484 1.67.62.703.223 1.344.192 1.85.117.564-.084 1.697-.693 1.936-1.362.239-.668.239-1.24.167-1.362-.072-.122-.268-.195-.554-.338z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">{t('waTitle')}</h4>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">{t('waSub')}</p>
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
              {t('waSend')} <span className="text-emerald-600 dark:text-emerald-400 font-extrabold font-mono">"Hi"</span> to
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
              <h5 className="text-xs font-bold text-[var(--primary-color)] dark:text-zinc-300 mb-1">{t('secureMsg')}</h5>
              <p className="text-[10px] text-[var(--text-secondary)] font-medium leading-relaxed">
                {t('secureSub')}
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
            <button 
              onClick={() => setShowChatMode(false)}
              className="p-1.5 rounded-lg border border-[var(--border-color)]/30 bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-color)] flex items-center justify-center active:scale-95 duration-100 mr-1 shadow-sm"
              title="Back to Hospital Website"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div className="relative">
              {hospitalInfo?.logoUrl ? (
                <img 
                  src={hospitalInfo.logoUrl} 
                  alt={`${hospitalInfo.name} Logo`} 
                  className="w-10 h-10 rounded-full object-cover shadow-sm border border-[var(--border-color)]/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[22px]">smart_toy</span>
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--tertiary-color)] rounded-full border-2 border-[var(--card-bg)] animate-pulse"></span>
            </div>
            <div>
              <h2 className="font-extrabold text-sm md:text-base text-[var(--text-color)]">{hospitalInfo?.name || 'CareSync Assistant'}</h2>
              <p className="text-[10px] text-[var(--text-secondary)] font-semibold flex items-center">
                <span className="material-symbols-outlined text-[12px] text-[var(--primary-color)] mr-0.5">bolt</span>
                {isLab 
                  ? 'AI-Powered Diagnostics & Lab Queue Triage' 
                  : hospitalInfo?.type === 'Clinic'
                  ? 'AI-Powered Clinic Triage & Booking'
                  : 'AI-Powered Triage & Booking'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={currentLang}
              onChange={(e) => setCurrentLang(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 focus:border-[var(--primary-color)] rounded-xl px-2.5 py-1.5 outline-none text-[10px] font-black uppercase tracking-wider text-[var(--text-color)] cursor-pointer shadow-sm"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="bn">বাংলা</option>
            </select>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-[var(--border-color)]/30 text-[var(--text-secondary)] px-2 py-0.5 rounded-full">Active Status</span>
          </div>
        </header>

        {/* Mobile Token Banner */}
        {myToken && (
          <div className="lg:hidden px-6 py-3.5 bg-gradient-to-r from-[var(--primary-color)] to-[var(--primary-container)] text-white flex justify-between items-center shadow-md relative z-10 border-b border-white/10">
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
        <div className="lg:hidden px-6 py-2.5 bg-emerald-550/10 dark:bg-emerald-550/5 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs font-semibold relative z-10">
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
              Today
            </span>
          </div>

          {messages.map((msg, index) => {
            const isBot = msg.sender === 'bot';
            const isSelectDoctorPrompt = msg.text.includes("Please select a Doctor") || msg.text.includes("Please select a Specialist");
            const isLastBotMessage = isBot && index === messages.findLastIndex(m => m.sender === 'bot');

            return (
              <div key={index} className="flex flex-col space-y-2">
                <div className={`flex items-end space-x-2 ${isBot ? '' : 'flex-row-reverse space-x-reverse'}`}>
                  {/* User/Bot Avatar Icon wrapper */}
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-sm shrink-0 ${
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
                        : 'bg-[var(--primary-color)] text-[var(--primary-text)] rounded-tr-none'
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
                {isLastBotMessage && isSelectDoctorPrompt && options.length > 0 && (
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
                          className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]/45 p-4 shadow-[var(--card-shadow)] flex flex-col justify-between hover:shadow-md transition-all cursor-pointer relative overflow-hidden group border-l-4 border-l-[var(--secondary-color)] active:scale-[0.98] duration-100 w-56 shrink-0"
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
                              Free Slot
                            </span>
                          </div>
                          <button className="w-full bg-[var(--primary-color)] text-[var(--primary-text)] group-hover:bg-[var(--primary-container)] group-hover:text-[var(--text-color)] py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center space-x-1">
                            <span>Select Specialist</span>
                            <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Option Buttons: Standard choice lists */}
                {isLastBotMessage && !isSelectDoctorPrompt && options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 ml-0 sm:ml-10">
                    {options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(opt)}
                        className="bg-[var(--card-bg)] hover:bg-[var(--primary-color)] text-[var(--text-color)] hover:text-[var(--primary-text)] border border-[var(--border-color)]/45 hover:border-[var(--primary-color)] px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 duration-100"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Chat text box input area */}
        <div className="p-4 border-t border-[var(--border-color)]/30 bg-[var(--card-bg)] sticky bottom-0 z-10">
          {/* Geolocation Travel Warning Display (Feature 9) */}
          {travelWarning && (
            <div className="mb-3 bg-amber-550/15 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-xl p-3 flex items-start space-x-2 text-xs font-semibold animate-pulse">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px] shrink-0">warning</span>
              <p className="leading-relaxed">{travelWarning}</p>
            </div>
          )}

          {/* Called Alert display */}
          {calledAlert && (
            <div className="mb-3 bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden">
              <div className="flex items-center space-x-3 relative z-10">
                <span className="material-symbols-outlined text-[24px] animate-bounce text-white">volume_up</span>
                <div>
                  <h4 className="text-sm font-black tracking-tight text-white uppercase">Your Token Called!</h4>
                  <p className="text-xs text-white/90 font-medium">{calledAlert}</p>
                </div>
              </div>
              <div className="flex space-x-1.5 relative z-10">
                <button 
                  onClick={() => setCalledAlert(null)}
                  className="bg-white/20 hover:bg-white/35 p-1 rounded-lg text-white font-bold text-xs transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Chat text box */}
          <div className="flex items-end space-x-2 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-1.5 focus-within:border-[var(--primary-color)] focus-within:ring-1 focus-within:ring-[var(--primary-color)] transition-all">
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
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">{t('activeToken')}</h3>
        
        {myToken ? (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[var(--secondary-color)] to-[var(--primary-container)] text-white rounded-2xl p-5 shadow-lg relative overflow-hidden border border-white/10 w-full">
              {/* Glass decoration layer */}
              <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
              <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl"></div>
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-[9px] text-white/70 uppercase tracking-widest font-bold mb-1">{t('tokenLabel')}</p>
                    <h3 className="text-4xl font-extrabold text-white leading-none">{myToken.tokenNumber}</h3>
                  </div>
                  <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-md text-white">
                    <span className="material-symbols-outlined text-[26px]">qr_code_2</span>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6 border-t border-white/20 pt-4 text-xs font-semibold">
                  <div className="flex justify-between items-center">
                    <span className="text-white/80">{t('department')}</span>
                    <span className="text-white text-right font-bold">
                      {t(myToken.department || 'gp')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/80">{t('cabin')}</span>
                    <span className="text-white text-right font-bold">Cabin A</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/80">{t('status')}</span>
                    <span className="bg-emerald-550/80 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                      {t((myToken.status || 'Waiting').toLowerCase())}
                    </span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-xl p-3.5 flex items-center justify-between border border-white/10 backdrop-blur-md">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-white text-[18px]">hourglass_empty</span>
                    <span className="text-xs text-white/95">{t('estWait')}</span>
                  </div>
                  <span className="text-lg font-extrabold text-white">{myToken.estimatedWaitTime} {t('mins')}</span>
                </div>
              </div>
            </div>

            {/* Delay & Directions Panel */}
            <div className="space-y-2.5">
              {myToken.status === 'Waiting' && (
                <button
                  onClick={handleDelayToken}
                  className="w-full flex items-center justify-center space-x-2 py-3 bg-[var(--card-bg)] hover:bg-[var(--border-color)]/25 active:scale-98 duration-100 text-[var(--primary-color)] border border-[var(--primary-color)]/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>{t('delayToken')}</span>
                </button>
              )}

              {hospitalInfo?.coordinates?.lat && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${hospitalInfo.coordinates.lat},${hospitalInfo.coordinates.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-2 py-3 bg-[var(--primary-color)] text-[var(--primary-text)] hover:bg-[var(--primary-container)] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-98 duration-100"
                >
                  <span className="material-symbols-outlined text-[16px]">directions</span>
                  <span>{t('directionBtn')}</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/40">
            <span className="material-symbols-outlined text-[36px] text-[var(--text-secondary)]/40 mb-3">calendar_month</span>
            <p className="text-sm text-[var(--text-color)] font-bold">{t('noActiveToken')}</p>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 max-w-[200px] leading-relaxed font-semibold">
              {t('noActiveSub')}
            </p>
          </div>
        )}

        {/* Voice Announcement Toggle Switch */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2.5">
            <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">volume_up</span>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-color)]">{t('voiceAlert')}</h4>
              <p className="text-[9px] text-[var(--text-secondary)] font-semibold">Announce token turns</p>
            </div>
          </div>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none shrink-0 ${
              voiceEnabled ? 'bg-[var(--primary-color)]' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                voiceEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Travel warning Alert box */}
        {travelWarning && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start space-x-3 shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[22px] shrink-0">warning</span>
            <div>
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300">{t('travelNotice')}</h4>
              <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90 font-semibold leading-relaxed mt-1">
                {travelWarning}
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
