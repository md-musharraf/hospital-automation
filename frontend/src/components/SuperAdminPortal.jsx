import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { Activity, ShieldAlert, ArrowLeft } from 'lucide-react';

export default function SuperAdminPortal() {
  const navigate = useNavigate();

  // Secret passcode to restrict dynamic registration
  const [adminSecret, setAdminSecret] = useState('supersecret123');
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');

  // Hospital states
  const [hospId, setHospId] = useState('');
  const [name, setName] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState('28.6139');
  const [lng, setLng] = useState('77.2090');
  const [type, setType] = useState('Hospital');

  // Staff credentials
  const [staffName, setStaffName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [counterNumber, setCounterNumber] = useState('Reception Counter 1');

  // Doctor credentials
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPassword, setDocPassword] = useState('');
  const [docDepartment, setDocDepartment] = useState('General Medicine');
  const [docRoom, setDocRoom] = useState('Cabin 101');

  // Lab tech credentials
  const [labName, setLabName] = useState('');
  const [labUsername, setLabUsername] = useState('');
  const [labPassword, setLabPassword] = useState('');

  // Submission helpers
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleVerify = (e) => {
    e.preventDefault();
    if (adminSecret === 'supersecret123' || adminSecret === 'admin') {
      setAuthorized(true);
      setAuthError('');
    } else {
      setAuthError('Invalid Admin Secret Passcode.');
    }
  };

  const handleAutoSlug = (val) => {
    setName(val);
    const slugified = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setHospId(slugified);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const payload = {
      id: hospId,
      name,
      slug: hospId,
      address,
      phone,
      whatsappNumber,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      description,
      city,
      coordinates: {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      },
      type,
      staffName,
      staffUsername,
      staffPassword,
      counterNumber,
      docName,
      docEmail,
      docPassword,
      docDepartment,
      docRoom,
      labName,
      labUsername,
      labPassword
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/register-hospital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to onboard hospital');
      }

      setSuccessMsg(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!authorized) {
    return (
      <div className="flex-grow flex items-center justify-center p-4 bg-[var(--bg-color)]">
        <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-8 shadow-[var(--card-shadow)] relative text-left">
          <div className="flex items-center space-x-2.5 mb-6">
            <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 p-2 rounded-lg text-[var(--primary-color)]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">Super Admin Entrance</h2>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-lg font-semibold flex items-center space-x-2 animate-bounce">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4 text-xs font-bold text-[var(--text-secondary)]">
            <div>
              <label className="block text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Admin Secret Passcode</label>
              <input
                type="password"
                placeholder="Enter supersecret123 to verify..."
                value={adminSecret}
                onChange={e => setAdminSecret(e.target.value)}
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-sm text-[var(--text-color)] font-bold transition-all"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[var(--text-color)] text-[var(--bg-color)] font-black text-sm rounded-xl transition-all shadow-md active:scale-98 duration-100"
            >
              Verify Credentials
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-[var(--bg-color)] py-8 px-4 sm:px-6 lg:px-8 overflow-y-auto max-h-[calc(100vh-62px)] text-left no-scrollbar">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation back and header */}
        <div className="flex justify-between items-center">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 border border-[var(--border-color)] rounded-xl text-xs font-bold hover:bg-[var(--border-color)]/20 transition-all text-[var(--text-secondary)] hover:text-[var(--text-color)]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Hub Directory</span>
          </button>
          <div className="inline-flex items-center space-x-2 bg-[var(--tertiary-color)]/10 border border-[var(--tertiary-color)]/20 text-[var(--tertiary-color)] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            <span>Super Admin Engine</span>
          </div>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 md:p-8 shadow-[var(--card-shadow)] space-y-8">
          
          <div className="border-b border-[var(--border-color)]/30 pb-4">
            <h2 className="text-2xl font-black tracking-tight">Onboard Medical Facility</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">Register a new hospital, clinic, lab or government health dispensary to the B2B SaaS directory.</p>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl font-bold flex items-center space-x-2 animate-bounce">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {successMsg ? (
            <div className="p-8 bg-[var(--tertiary-color)]/10 border border-[var(--tertiary-color)]/20 rounded-2xl text-center space-y-4">
              <span className="material-symbols-outlined text-[48px] text-[var(--tertiary-color)] animate-bounce">check_circle</span>
              <h3 className="text-lg font-black text-[var(--tertiary-color)]">Onboarding Completed!</h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium max-w-sm mx-auto">
                {successMsg} The new clinic's landing page, chatbot database, and isolated admin dashboards are live.
              </p>
              <div className="pt-4 flex justify-center space-x-3 text-xs">
                <button
                  onClick={() => {
                    setSuccessMsg('');
                    setName('');
                    setHospId('');
                    setAddress('');
                    setPhone('');
                    setWhatsappNumber('');
                    setDescription('');
                    setStaffUsername('');
                    setStaffPassword('');
                    setDocEmail('');
                    setDocPassword('');
                    setLabUsername('');
                    setLabPassword('');
                  }}
                  className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--border-color)]/25 rounded-xl font-black transition-all"
                >
                  Onboard Another
                </button>
                <button
                  onClick={() => navigate(`/hospital/${hospId}`)}
                  className="px-4 py-2 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white rounded-xl font-black transition-all transition-all-custom shadow-md"
                >
                  Visit Patient Portal
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-8 text-xs font-bold text-[var(--text-secondary)]">
              
              {/* SECTION A: Hospital Configuration */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">domain</span>
                  <span>1. Facility Core Profile</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1">Service Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. City Health Clinic"
                      value={name}
                      onChange={e => handleAutoSlug(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Unique Slug ID (Auto-Generated) *</label>
                    <input
                      type="text"
                      placeholder="e.g. city-health-clinic"
                      value={hospId}
                      onChange={e => setHospId(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Service Type *</label>
                    <select
                      value={type}
                      onChange={e => setType(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                    >
                      <option>Hospital</option>
                      <option>Clinic</option>
                      <option>Medical</option>
                      <option>Lab</option>
                      <option>Government</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">City Location *</label>
                    <input
                      type="text"
                      placeholder="e.g. Delhi"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1">Latitude *</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={lat}
                        onChange={e => setLat(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Longitude *</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={lng}
                        onChange={e => setLng(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1">Phone Number *</label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">WhatsApp Booking Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. +14155238886"
                      value={whatsappNumber}
                      onChange={e => setWhatsappNumber(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Address *</label>
                  <input
                    type="text"
                    placeholder="e.g. Sector 15, Near Central Park"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1">Cover Image URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={coverImage}
                      onChange={e => setCoverImage(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Short Description *</label>
                    <input
                      type="text"
                      placeholder="e.g. Public clinical service dispensary providing basic triage."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* SECTION B: Staff Onboarding */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">verified_user</span>
                  <span>2. Receptionist / Staff Account Setup</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Staff Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. David Jones"
                      value={staffName}
                      onChange={e => setStaffName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Username (Isolated Tenant Login) *</label>
                    <input
                      type="text"
                      placeholder="e.g. city_staff"
                      value={staffUsername}
                      onChange={e => setStaffUsername(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Staff Password *</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={staffPassword}
                      onChange={e => setStaffPassword(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Counter Room Name</label>
                  <input
                    type="text"
                    value={counterNumber}
                    onChange={e => setCounterNumber(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                  />
                </div>
              </div>

              {/* SECTION C: Doctor Onboarding */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">stethoscope</span>
                  <span>3. Initial Medical Officer / Doctor Setup</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Doctor Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. David Miller"
                      value={docName}
                      onChange={e => setDocName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Doctor Email (Tenant Login) *</label>
                    <input
                      type="email"
                      placeholder="e.g. david.miller@hospital.com"
                      value={docEmail}
                      onChange={e => setDocEmail(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Doctor Password *</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={docPassword}
                      onChange={e => setDocPassword(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1">Department</label>
                    <input
                      type="text"
                      placeholder="e.g. Cardiology"
                      value={docDepartment}
                      onChange={e => setDocDepartment(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Consultation Cabin Room</label>
                    <input
                      type="text"
                      placeholder="e.g. Cabin 101"
                      value={docRoom}
                      onChange={e => setDocRoom(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION D: Lab Tech Onboarding */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">science</span>
                  <span>4. Clinical Laboratory assistant Account Setup</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Lab Assistant Name</label>
                    <input
                      type="text"
                      placeholder="e.g. City Lab Specialist"
                      value={labName}
                      onChange={e => setLabName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Lab Assistant Username *</label>
                    <input
                      type="text"
                      placeholder="e.g. city_lab"
                      value={labUsername}
                      onChange={e => setLabUsername(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Lab Password *</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={labPassword}
                      onChange={e => setLabPassword(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black text-sm rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/15 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? <span>Configuring clinical database & files...</span> : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">publish</span>
                    <span>Launch & Deploy Portal</span>
                  </>
                )}
              </button>

            </form>
          )}

        </div>
      </div>
    </div>
  );
}
