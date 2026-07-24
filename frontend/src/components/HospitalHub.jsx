import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { getFacilityTheme } from '../theme/facilityThemes';
import useScrollReveal from '../hooks/useScrollReveal';
import HeroTelemetry from './HeroTelemetry';
import DeferUntilVisible from './DeferUntilVisible';

// Heavy, below-the-fold demo widget — code-split so it never weighs down the
// landing page's initial bundle; it streams in only when the user scrolls to it.
const WhatsAppTester = React.lazy(() => import('./WhatsAppTester'));

export default function HospitalHub() {
  const [hospitals, setHospitals] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [userCoords, setUserCoords] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  // Location cascade: choose State → District → facility.
  const states = ['All', ...Array.from(new Set(hospitals.map(h => h.state).filter(Boolean))).sort()];
  // Districts depend on the chosen state (all districts when state = 'All').
  const districts = ['All', ...Array.from(new Set(
    hospitals
      .filter(h => selectedState === 'All' || h.state === selectedState)
      .map(h => h.district)
      .filter(Boolean)
  )).sort()];

  // When the state changes, a previously-picked district may no longer belong to
  // it — snap the district back to 'All' so the list never shows an empty result
  // from a stale pairing.
  const handleStateChange = (st) => {
    setSelectedState(st);
    setSelectedDistrict('All');
  };

  // Process sorting, city filtering, and searching
  let processedHospitals = hospitals.map(h => {
    if (userCoords && h.coordinates) {
      const distance = calculateDistance(userCoords.lat, userCoords.lng, h.coordinates.lat, h.coordinates.lng);
      return { ...h, distance };
    }
    return h;
  });

  // Filter by selected state, then district
  if (selectedState !== 'All') {
    processedHospitals = processedHospitals.filter(h => h.state === selectedState);
  }
  if (selectedDistrict !== 'All') {
    processedHospitals = processedHospitals.filter(h => h.district === selectedDistrict);
  }

  // Filter by selected facility type
  if (selectedType !== 'All') {
    processedHospitals = processedHospitals.filter(h => (h.type || 'Hospital') === selectedType);
  }

  // Filter by search query
  const filteredHospitals = processedHospitals.filter(h =>
    (h.name && h.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (h.description && h.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (h.address && h.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (h.city && h.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (h.type && h.type.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Sort by distance if user location is active
  if (userCoords) {
    filteredHospitals.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  const facilityTypes = ['All', 'Hospital', 'Clinic', 'Medical', 'Lab', 'Government Hospital', 'Government Lab'];

  // Animate sections/cards in as they scroll into view (re-scan after data loads).
  useScrollReveal([loading, filteredHospitals.length, selectedType, selectedState, selectedDistrict]);

  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200 no-scrollbar">
      
      {/* 1. Hero Section (Split-Screen SaaS Layout) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[var(--primary-color)]/10 via-[var(--bg-color)] to-[var(--bg-color)] py-12 md:py-20 px-6 sm:px-12 border-b border-[var(--border-color)]/25">
        {/* Ambient animated gradient blobs for depth */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[var(--primary-color)]/20 blur-3xl animate-float-slow"></div>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 w-[28rem] h-[28rem] rounded-full bg-[var(--tertiary-color)]/15 blur-3xl animate-float-slow" style={{ animationDelay: '3s' }}></div>

        <div className="relative max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center text-left">

          {/* Left Column: Core Copy & Tools */}
          <div className="lg:col-span-7 space-y-6">
            <div className="animate-fade-in-up inline-flex items-center space-x-2 bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 text-[var(--primary-color)] px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[var(--primary-color)] animate-ping"></span>
              <span className="material-symbols-outlined text-[15px]">clinical_notes</span>
              <span>CareSync Multi-Facility Healthcare Engine</span>
            </div>

            <h1 className="animate-fade-in-up delay-100 text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-none">
              Smart Waiting Lines <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-[var(--primary-color)] to-[var(--tertiary-color)] bg-clip-text text-transparent">For Modern Healthcare</span>
            </h1>

            <p className="animate-fade-in-up delay-200 text-sm sm:text-base md:text-md text-[var(--text-secondary)] font-medium leading-relaxed max-w-xl">
              Eliminate physical waiting lines, check live cabin statuses, and experience real-time AI-powered triage across Hospitals, Clinics, Labs & Medical Stores. Select a partner facility below to book instantly.
            </p>

            {/* Combined Search & Locator Widget */}
            <div className="animate-fade-in-up delay-300 flex items-center max-w-xl bg-[var(--card-bg)] border border-[var(--border-color)]/70 rounded-2xl p-2 shadow-lg shadow-black/5 relative group focus-within:border-[var(--primary-color)] transition-all duration-300">
              <div className="flex-1 flex items-center px-2">
                <span className="material-symbols-outlined text-zinc-400 mr-2.5 text-[22px]">search</span>
                <input 
                  type="text" 
                  placeholder="Search facility by name, type, department, or city..." 
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
                title="Find facilities near me"
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

            {/* Filters Pills (Type & Region) */}
            {!loading && hospitals.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Facility Type:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {facilityTypes.map(ftype => (
                      <button
                         key={ftype}
                         onClick={() => setSelectedType(ftype)}
                         className={`px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 duration-100 ${
                           selectedType === ftype
                             ? 'bg-[var(--tertiary-color)] text-white shadow-md shadow-[var(--tertiary-color)]/20'
                             : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/25'
                         }`}
                      >
                        {ftype}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location cascade: pick your State, then District */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Find by Location:</span>
                  <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                    <div className="flex-1 relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[var(--primary-color)] pointer-events-none">public</span>
                      <select
                        value={selectedState}
                        onChange={e => handleStateChange(e.target.value)}
                        className="w-full appearance-none bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold text-[var(--text-color)] outline-none focus:border-[var(--primary-color)] transition-colors cursor-pointer"
                      >
                        {states.map(st => (
                          <option key={st} value={st}>{st === 'All' ? 'All States' : st}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-zinc-400 pointer-events-none">expand_more</span>
                    </div>

                    <div className="flex-1 relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[var(--tertiary-color)] pointer-events-none">location_city</span>
                      <select
                        value={selectedDistrict}
                        onChange={e => setSelectedDistrict(e.target.value)}
                        disabled={districts.length <= 1}
                        className="w-full appearance-none bg-[var(--card-bg)] border border-[var(--border-color)]/60 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold text-[var(--text-color)] outline-none focus:border-[var(--primary-color)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {districts.map(d => (
                          <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-zinc-400 pointer-events-none">expand_more</span>
                    </div>

                    {(selectedState !== 'All' || selectedDistrict !== 'All') && (
                      <button
                        onClick={() => { setSelectedState('All'); setSelectedDistrict('All'); }}
                        className="shrink-0 px-3 py-2.5 rounded-xl text-xs font-bold bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-[var(--text-secondary)] hover:bg-[var(--border-color)]/25 transition-colors flex items-center justify-center gap-1 active:scale-95 duration-100"
                        title="Clear location filter"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                        <span className="hidden sm:inline">Clear</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Interactive SaaS Telemetry Preview (isolated + memoized for perf) */}
          <HeroTelemetry />

        </div>
      </section>

      {/* 2. Live Metrics Infotech Row */}
      <section className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/25 py-8 px-6 sm:px-12 relative z-10 shadow-sm shadow-black/5">
        <div className="reveal max-w-[1280px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
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
        <div className="reveal text-center max-w-xl mx-auto mb-12 space-y-2">
          <span className="text-[10px] uppercase font-black text-[var(--primary-color)] tracking-widest bg-[var(--primary-color)]/10 px-3 py-1 rounded-full">Modular Technology</span>
          <h2 className="text-3xl font-black text-[var(--text-color)]">Healthcare Infotech Modules</h2>
          <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">Our advanced SaaS queue ecosystem is powered by unified clinics integration, AI patient support, and multi-tenant admin consoles.</p>
        </div>
 
        <div className="reveal grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
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
          <div className="reveal text-center mb-12 space-y-2">
            <h2 className="text-3xl font-black text-[var(--text-color)]">The Patient Journey</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold">How CareSync streamlines queue bookings in three fast steps.</p>
          </div>

          <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-8 relative">
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

      {/* 4.5 Live WhatsApp Business API Webhook Simulator */}
      <section className="py-12 px-6 sm:px-12 max-w-[1280px] mx-auto text-left">
        <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
          <span className="text-[10px] uppercase font-black text-emerald-500 tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Omnichannel Integration</span>
          <h2 className="text-3xl font-black text-[var(--text-color)]">Live WhatsApp Chatbot Engine</h2>
          <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">
            Test how any WhatsApp Business number acts as an AI booking assistant, symptom triager, and digital prescription dispenser.
          </p>
        </div>

        <DeferUntilVisible minHeight={420} fallback={
          <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]/30">
            <span className="material-symbols-outlined text-[36px] text-[var(--primary-color)] animate-spin">refresh</span>
            <p className="text-xs font-bold text-[var(--text-secondary)]">Loading live chatbot engine…</p>
          </div>
        }>
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]/30">
              <span className="material-symbols-outlined text-[36px] text-[var(--primary-color)] animate-spin">refresh</span>
              <p className="text-xs font-bold text-[var(--text-secondary)]">Loading live chatbot engine…</p>
            </div>
          }>
            <WhatsAppTester initialPhone="+14155238886" defaultHospId="general-hospital" />
          </Suspense>
        </DeferUntilVisible>
      </section>

      {/* 5. Partner Hospital Directory Grid */}
      <div className="max-w-[1280px] mx-auto py-16 px-6 sm:px-8">
        <div className="flex justify-between items-center mb-8 text-left">
          <div>
            <h2 className="text-xl sm:text-2xl font-black">Partner Hospital & Facility Directory</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">Select any hospital, clinic, lab, or medical store to check waiting queues</p>
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
          <div className="text-center py-20 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]/30 p-8 shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center mx-auto mb-2">
              <span className="material-symbols-outlined text-[36px]">domain_disabled</span>
            </div>
            <div>
              <h3 className="text-lg font-black mb-1 text-[var(--text-color)]">No Healthcare Facilities Found</h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium max-w-md mx-auto">
                {searchQuery
                  ? `No facilities matching "${searchQuery}". Try clearing search filters.`
                  : (selectedState !== 'All' || selectedDistrict !== 'All')
                    ? `No facilities found in ${selectedDistrict !== 'All' ? selectedDistrict + ', ' : ''}${selectedState !== 'All' ? selectedState : 'this area'}. Try another location or clear the filter.`
                    : `No registered healthcare facilities in the directory yet. Use the Super Admin Dashboard to register your first hospital, clinic, diagnostic lab, or pharmacy!`}
              </p>
            </div>
            <button
              onClick={() => navigate('/super-admin')}
              className="px-5 py-2.5 bg-[var(--primary-color)] text-[var(--primary-text)] font-extrabold text-xs rounded-xl hover:opacity-90 transition-all shadow-md inline-flex items-center space-x-1.5 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">add_business</span>
              <span>Register First Facility (Super Admin)</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {filteredHospitals.map(h => {
              const cardTheme = getFacilityTheme(h.type);
              return (
              <div
                key={h.id}
                onClick={() => navigate(`/hospital/${h.id}`)}
                style={{ '--facility-ring': cardTheme.ring, '--primary-color': cardTheme.primary, '--primary-text': '#ffffff' }}
                className="reveal card-hover group cursor-pointer bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl overflow-hidden shadow-sm flex flex-col relative min-w-0"
              >
                {/* Themed top accent bar */}
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${cardTheme.primary}, ${cardTheme.accent})` }} />
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
                  <div className="absolute top-4 right-4 flex flex-col items-end space-y-1.5">
                    <span className="text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1" style={{ background: cardTheme.primary }}>
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                      <span>Active Queue</span>
                    </span>
                    <span className="backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded shadow-sm border border-white/10 flex items-center space-x-1" style={{ background: `${cardTheme.secondary}cc` }}>
                      <span className="material-symbols-outlined text-[12px]">{cardTheme.icon}</span>
                      <span>{h.type || 'Hospital'}</span>
                    </span>
                  </div>

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
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-xl font-extrabold group-hover:text-[var(--primary-color)] transition duration-150 leading-tight">
                      {h.name}
                    </h3>
                  </div>

                  {/* Sub-facility / Parent hospital indicator */}
                  {h.parentHospital && (
                    <p className="text-[10px] font-extrabold text-[var(--primary-color)] bg-[var(--primary-color)]/10 px-2 py-0.5 rounded w-max mb-2">
                      Sub-facility of: {h.parentHospital}
                    </p>
                  )}

                  <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed mb-4 line-clamp-2">
                    {h.description}
                  </p>
                  
                  {/* Stats & Features */}
                  <div className="grid grid-cols-2 gap-3 mb-4 bg-[var(--bg-color)] rounded-xl p-3 border border-[var(--border-color)]/20 text-xs font-semibold text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-zinc-400">location_on</span>
                      <span className="truncate">{h.address ? h.address.split(',')[0] : h.city}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-zinc-400">call</span>
                      <span className="truncate">{h.phone}</span>
                    </div>
                  </div>

                  {/* Feature Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-6 text-[10px] font-bold">
                    {h.hasInternalLab && (
                      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                        ✓ Pathology Lab Included
                      </span>
                    )}
                    {h.hasInternalPharmacy && (
                      <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                        ✓ Pharmacy Store Included
                      </span>
                    )}
                    <span className="bg-[var(--bg-color)] text-[var(--text-secondary)] px-2 py-0.5 rounded border border-[var(--border-color)]/30">
                      {h.doctorCount || 4} Doctors Sync
                    </span>
                  </div>

                  {/* CTA Footer */}
                  <div className="mt-auto pt-4 border-t border-[var(--border-color)]/30 flex justify-between items-center">
                    <div className="flex items-center space-x-2 text-xs font-black text-emerald-600 dark:text-emerald-400">
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>WhatsApp Enabled</span>
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
              );
            })}
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
