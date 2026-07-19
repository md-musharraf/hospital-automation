import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { BACKEND_URL } from '../App';

export default function HospitalHub() {
  const [hospitals, setHospitals] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('All');
  const [userCoords, setUserCoords] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // State to simulate real-time live telemetry dashboard activity
  const [telemetryTime, setTelemetryTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [telemetryToken, setTelemetryToken] = useState('GP-08');
  const [telemetryCabin, setTelemetryCabin] = useState('Cabin A');

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals`)
      .then(res => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(data => {
        setHospitals(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching hospitals:', err);
        setLoading(false);
      });

    // Rotate simulated token in the hero dashboard preview
    const intervalToken = setInterval(() => {
      const tokens = ['GP-08', 'EM-03', 'PD-05', 'GP-09', 'EM-04'];
      const cabins = ['Cabin A', 'Cabin C (ER)', 'Cabin B', 'Cabin A', 'Cabin C (ER)'];
      const randomIndex = Math.floor(Math.random() * tokens.length);
      setTelemetryToken(tokens[randomIndex]);
      setTelemetryCabin(cabins[randomIndex]);
    }, 4000);

    // Update telemetry clock
    const intervalClock = setInterval(() => {
      setTelemetryTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);

    return () => {
      clearInterval(intervalToken);
      clearInterval(intervalClock);
    };
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
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200 no-scrollbar">
      
      {/* 1. Hero Section (Split-Screen SaaS Layout) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[var(--primary-color)]/10 via-[var(--bg-color)] to-[var(--bg-color)] py-12 md:py-20 px-6 sm:px-12 border-b border-[var(--border-color)]/25">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center text-left">
          
          {/* Left Column: Core Copy & Tools */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center space-x-2 bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 text-[var(--primary-color)] px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
              <span className="material-symbols-outlined text-[15px]">clinical_notes</span>
              <span>CareSync Medical Solution Infotech</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-none">
              Smart Waiting Lines <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-[var(--primary-color)] to-[var(--tertiary-color)] bg-clip-text text-transparent">For Modern Hospitals</span>
            </h1>
            
            <p className="text-sm sm:text-base md:text-md text-[var(--text-secondary)] font-medium leading-relaxed max-w-xl">
              Eliminate physical waiting lines, check live cabin statuses, and experience real-time AI-powered triage. Select a partner hospital below to book your appointment instantly.
            </p>

            {/* Combined Search & Locator Widget */}
            <div className="flex items-center max-w-xl bg-[var(--card-bg)] border border-[var(--border-color)]/70 rounded-2xl p-2 shadow-lg shadow-black/5 relative group focus-within:border-[var(--primary-color)] transition-all duration-300">
              <div className="flex-1 flex items-center px-2">
                <span className="material-symbols-outlined text-zinc-400 mr-2.5 text-[22px]">search</span>
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
 
              {/* Geolocator trigger */}
              <button
                onClick={handleFindNearMe}
                disabled={geoLoading}
                className={`flex items-center justify-center p-2.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--primary-color)] hover:text-[var(--primary-text)] transition-all active:scale-95 duration-100 disabled:opacity-50 border border-[var(--border-color)]/30 text-[var(--text-secondary)] ${
                  userCoords ? 'text-[var(--primary-color)] border-[var(--primary-color)]/40 bg-[var(--primary-color)]/5' : ''
                }`}
                title="Find hospitals near me"
              >
                <span className={`material-symbols-outlined text-[18px] ${geoLoading ? 'animate-spin' : ''}`}>
                  {geoLoading ? 'refresh' : 'my_location'}
                </span>
              </button>
            </div>

            {geoError && (
              <p className="text-xs text-rose-500 font-bold animate-bounce">{geoError}</p>
            )}
            {userCoords && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                <span>Proximity sorting active. Directory displaying nearest clinics first.</span>
              </p>
            )}

            {/* City Filters Pills */}
            {!loading && hospitals.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Filter By Region:</span>
                <div className="flex flex-wrap gap-2">
                  {cities.map(city => (
                    <button
                       key={city}
                       onClick={() => setSelectedCity(city)}
                       className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 duration-100 ${
                         selectedCity === city
                           ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md shadow-[var(--primary-color)]/10'
                           : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/25'
                       }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Interactive SaaS Telemetry Preview Dashboard */}
          <div className="lg:col-span-5 relative w-full h-[380px] bg-gradient-to-tr from-zinc-950 to-zinc-900 rounded-3xl p-6 shadow-2xl border border-white/5 overflow-hidden flex flex-col justify-between text-white text-xs select-none">
            {/* Background grid line decoration */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
            
            {/* Telemetry Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-3 relative z-10">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
                <span className="font-extrabold tracking-wider uppercase text-[10px] text-zinc-400">CareSync Telemetry Dashboard</span>
              </div>
              <span className="font-mono text-zinc-400 text-[10px] bg-white/5 px-2 py-0.5 rounded">{telemetryTime}</span>
            </div>

            {/* Telemetry Core Grid Layout */}
            <div className="grid grid-cols-2 gap-4 my-4 relative z-10 flex-1">
              {/* Call Out screen */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] uppercase font-bold text-zinc-400">Current Paging call</span>
                  <h4 className="text-3xl font-black text-[var(--primary-color)] tracking-tight mt-1 animate-pulse">{telemetryToken}</h4>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-300 font-bold">Proceed To:</p>
                  <p className="text-xs text-white font-extrabold flex items-center space-x-1">
                    <span className="material-symbols-outlined text-[14px] text-[var(--primary-color)]">sensor_door</span>
                    <span>{telemetryCabin}</span>
                  </p>
                </div>
              </div>

              {/* Wait Time graph simulation */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] uppercase font-bold text-zinc-400">Queue wait efficiency</span>
                  <p className="text-xl font-black text-emerald-400 mt-1">-42% Wait</p>
                </div>
                {/* SVG Graph representation */}
                <div className="h-16 w-full">
                  <svg viewBox="0 0 100 40" className="w-full h-full">
                    <path 
                      d="M0,35 Q20,15 40,30 T80,10 T100,5" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="2" 
                      strokeLinecap="round"
                    />
                    <path 
                      d="M0,35 Q20,15 40,30 T80,10 T100,5 L100,40 L0,40 Z" 
                      fill="url(#gradient-telemetry)" 
                      opacity="0.1"
                    />
                    <defs>
                      <linearGradient id="gradient-telemetry" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Active Cabins listing inside preview */}
            <div className="space-y-2 border-t border-white/10 pt-3 relative z-10">
              <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider block">Live Cabin Telemetry status</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'Dr. Sarah Jenkins', room: 'Cabin A', status: 'Consulting', color: 'bg-emerald-500' },
                  { name: 'Dr. Robert Chen', room: 'Cabin B', status: 'Calling', color: 'bg-[var(--primary-color)]' },
                  { name: 'Dr. Emily Taylor', room: 'Cabin C', status: 'Surgery', color: 'bg-rose-500' }
                ].map((cab, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/5 p-2 rounded-xl text-[9px] font-semibold space-y-1">
                    <p className="text-white truncate font-bold">{cab.name}</p>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>{cab.room}</span>
                      <div className="flex items-center space-x-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${cab.color}`}></span>
                        <span>{cab.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 2. Live Metrics Infotech Row */}
      <section className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/25 py-8 px-6 sm:px-12 relative z-10 shadow-sm shadow-black/5">
        <div className="max-w-[1280px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '-42%', label: 'Lounge Wait Time', icon: 'schedule', color: 'text-[var(--primary-color)]' },
            { value: '99.8%', label: 'Dispatch Accuracy', icon: 'verified', color: 'text-[var(--tertiary-color)]' },
            { value: '12K+', label: 'SMS Reminders Sent', icon: 'sms', color: 'text-[var(--primary-color)]' },
            { value: '150+', label: 'Connected Clinics', icon: 'local_hospital', color: 'text-[var(--tertiary-color)]' }
          ].map((stat, idx) => (
            <div key={idx} className="space-y-1.5 p-3 rounded-2xl bg-[var(--bg-color)]/30 border border-[var(--border-color)]/20 shadow-sm flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full bg-[var(--bg-color)] border border-[var(--border-color)]/40 flex items-center justify-center ${stat.color} mb-1 shadow-inner`}>
                <span className="material-symbols-outlined text-[20px]">{stat.icon}</span>
              </div>
              <p className="text-2xl md:text-3xl font-black text-[var(--text-color)] leading-none">{stat.value}</p>
              <p className="text-[10px] md:text-xs text-[var(--text-secondary)] font-bold">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Advanced Solutions Grid Section */}
      <section className="py-16 px-6 sm:px-12 max-w-[1280px] mx-auto text-left">
        <div className="text-center max-w-xl mx-auto mb-12 space-y-2">
          <span className="text-[10px] uppercase font-black text-[var(--primary-color)] tracking-widest bg-[var(--primary-color)]/10 px-3 py-1 rounded-full">Modular Technology</span>
          <h2 className="text-3xl font-black text-[var(--text-color)]">Healthcare Infotech Modules</h2>
          <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">Our advanced SaaS queue ecosystem is powered by unified clinics integration, AI patient support, and multi-tenant admin consoles.</p>
        </div>
 
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { title: 'Live Queue Telemetry', desc: 'Real-time dashboard visualization for waiting halls. Includes TV audio paging, ABSENT skips, and cabin check-in updates.', icon: 'tv', color: 'bg-[var(--primary-color)]/10 border-[var(--primary-color)]/20 text-[var(--primary-color)]' },
            { title: 'AI Symptom Triage', desc: 'Symptom-checking chatbot routes bookings instantly to appropriate doctors, reducing consultation overhead and queue lengths.', icon: 'smart_toy', color: 'bg-[var(--tertiary-color)]/10 border-[var(--tertiary-color)]/20 text-[var(--tertiary-color)]' },
            { title: 'B2B Multi-Tenant Dashboard', desc: 'Separate, scoped panels for Doctors, Staff, and Lab tech assistants. Complete credential isolation guarantees patient privacy.', icon: 'shield', color: 'bg-[var(--primary-color)]/15 border-[var(--primary-color)]/20 text-[var(--text-color)]' },
            { title: 'Smart SMS Follow-ups', desc: 'Autonomous revisit-triggering engine that automates SMS logs to recover checkups, reminding patients scheduled for followups.', icon: 'sms', color: 'bg-[var(--tertiary-color)]/15 border-[var(--tertiary-color)]/20 text-[var(--tertiary-text)]' }
          ].map((sol, idx) => (
            <div key={idx} className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div className="space-y-4">
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${sol.color} shadow-sm`}>
                  <span className="material-symbols-outlined text-[24px]">{sol.icon}</span>
                </div>
                <h4 className="font-extrabold text-sm text-[var(--text-color)] leading-tight">{sol.title}</h4>
                <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">{sol.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Interactive Step-by-Step Workflow ("How it Works") */}
      <section className="py-12 bg-[var(--card-bg)] border-t border-b border-[var(--border-color)]/25 px-6 sm:px-12">
        <div className="max-w-[1280px] mx-auto text-left">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-3xl font-black text-[var(--text-color)]">The Patient Journey</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold">How CareSync streamlines queue bookings in three fast steps.</p>
          </div>
 
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Timeline connectors (visible on desktop) */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-[var(--primary-color)] via-[var(--secondary-color)] to-[var(--tertiary-color)] z-0"></div>
 
            {[
              { step: '01', title: 'Select Clinical Facility', desc: 'Filter clinics by city or run GPS locator to discover nearest facilities with active wait times.', icon: 'location_on', color: 'bg-[var(--primary-color)]' },
              { step: '02', title: 'Complete AI Triage Chat', desc: 'Interact with the hospital chatbot to input details, describe symptoms, and get doctor routing.', icon: 'chat', color: 'bg-[var(--secondary-color)]' },
              { step: '03', title: 'Obtain Live Wait Token', desc: 'Get your live queue ticket on WhatsApp or browser. Follow real-time lounge TV announcements.', icon: 'qr_code_2', color: 'bg-[var(--tertiary-color)]' }
            ].map((flow, idx) => (
              <div key={idx} className="relative z-10 flex flex-col items-center text-center space-y-4 max-w-sm mx-auto">
                <div className={`w-16 h-16 rounded-full ${flow.color} text-white flex items-center justify-center font-black text-xl shadow-lg border-4 border-[var(--card-bg)]`}>
                  <span className="material-symbols-outlined text-[26px]">{flow.icon}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--primary-color)] tracking-wider">Step {flow.step}</span>
                  <h4 className="font-extrabold text-sm text-[var(--text-color)] mt-1 mb-2">{flow.title}</h4>
                  <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed max-w-xs">{flow.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Partner Hospital Directory Grid */}
      <div className="max-w-[1280px] mx-auto py-16 px-6 sm:px-8">
        <div className="flex justify-between items-center mb-8 text-left">
          <div>
            <h2 className="text-xl sm:text-2xl font-black">Partner Hospital Directory</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">Select a facility to check waiting queues</p>
          </div>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest bg-[var(--border-color)]/20 px-3 py-1 rounded-full shrink-0">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {filteredHospitals.map(h => (
              <div 
                key={h.id} 
                onClick={() => navigate(`/hospital/${h.id}`)}
                className="group cursor-pointer bg-[var(--card-bg)] border border-[var(--border-color)]/40 hover:border-[var(--primary-color)]/40 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1 transition-all duration-300 flex flex-col relative min-w-0"
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
                  <span className="absolute top-4 right-4 bg-[var(--tertiary-color)] text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                    <span>Active Queue</span>
                  </span>

                  {/* Proximity Distance Badge */}
                  {h.distance !== undefined && (
                    <span className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1">
                      <span className="material-symbols-outlined text-[12px] text-[var(--primary-color)]">near_me</span>
                      <span>{h.distance.toFixed(1)} km away</span>
                    </span>
                  )}

                  {/* City Label Badge */}
                  {h.city && (
                    <span className="absolute bottom-4 left-4 text-[var(--primary-text)] text-[10px] font-black uppercase tracking-wider bg-[var(--primary-color)] px-2.5 py-0.5 rounded shadow-sm">
                      {h.city}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-xl font-extrabold group-hover:text-[var(--primary-color)] transition duration-150 mb-2 leading-tight">
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
                      className="bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] text-xs font-extrabold px-4 py-2 rounded-xl flex items-center space-x-1 shadow-md shadow-[var(--primary-color)]/10 active:scale-95 duration-100 transition-all transition-all-custom"
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

      {/* 6. Trust & Guarantee Section */}
      <div className="bg-[var(--card-bg)] border-t border-[var(--border-color)]/30 py-12 px-6 sm:px-8 text-center text-xs text-[var(--text-secondary)] font-semibold">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex justify-center space-x-6 text-[var(--text-color)] mb-2">
            <div className="flex items-center space-x-1">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">verified_user</span>
              <span>HIPAA Compliant</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="material-symbols-outlined text-[var(--primary-color)] text-[18px]">security</span>
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
