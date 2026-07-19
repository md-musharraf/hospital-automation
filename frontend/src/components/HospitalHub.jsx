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
