import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { Activity, ShieldAlert, ArrowLeft } from 'lucide-react';
import WhatsAppTester from './WhatsAppTester';

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
  const [logoUrl, setLogoUrl] = useState('');
  const [galleryImagesStr, setGalleryImagesStr] = useState('');
  const [doctorCount, setDoctorCount] = useState(1);
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

  // Tab & account registration states
  const [activeTab, setActiveTab] = useState('hospital'); // 'hospital' or 'accounts'
  const [accountType, setAccountType] = useState('doctor'); // 'doctor', 'staff', 'lab'
  const [hospitalList, setHospitalList] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');

  // Additional Account States
  const [addName, setAddName] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addCounterNumber, setAddCounterNumber] = useState('Reception Counter 1');
  const [addEmail, setAddEmail] = useState('');
  const [addDepartment, setAddDepartment] = useState('General Medicine');
  const [addRoom, setAddRoom] = useState('Cabin 101');
  const [addSpecialization, setAddSpecialization] = useState('General Consultation');
  const [addAverageCheckupTime, setAddAverageCheckupTime] = useState(10);

  // Edit Hospital States
  const [editHospId, setEditHospId] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('Hospital');
  const [editCity, setEditCity] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editCoverImage, setEditCoverImage] = useState('');
  const [editGalleryImagesStr, setEditGalleryImagesStr] = useState('');
  const [editDoctorCount, setEditDoctorCount] = useState(1);
  const [editDescription, setEditDescription] = useState('');
  const [editWelcomeMessage, setEditWelcomeMessage] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('#0d9488');
  const [editSecondaryColor, setEditSecondaryColor] = useState('#0f172a');

  // Clinic Specializations & Custom Services
  const [clinicSubtype, setClinicSubtype] = useState('General');
  const [customServices, setCustomServices] = useState([
    { title: 'General Checkup', description: 'Comprehensive routine medical examination and health check.', icon: 'local_hospital' }
  ]);
  const [features, setFeatures] = useState([
    'Skilled & Professional Team', 'Advanced Health Diagnostics', 'Convenient Real-time Queues'
  ]);

  const [editClinicSubtype, setEditClinicSubtype] = useState('General');
  const [editCustomServices, setEditCustomServices] = useState([]);
  const [editFeatures, setEditFeatures] = useState([]);

  // Sub-facility and Directory filter states
  const [parentHospital, setParentHospital] = useState('');
  const [hasInternalLab, setHasInternalLab] = useState(true);
  const [hasInternalPharmacy, setHasInternalPharmacy] = useState(true);

  const [editParentHospital, setEditParentHospital] = useState('');
  const [editHasInternalLab, setEditHasInternalLab] = useState(true);
  const [editHasInternalPharmacy, setEditHasInternalPharmacy] = useState(true);

  const [facilityFilterType, setFacilityFilterType] = useState('All');
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');

  const [facilityPersonnel, setFacilityPersonnel] = useState({ doctors: [], staff: [], labAssistants: [], patients: [] });
  const [personnelLoading, setPersonnelLoading] = useState(false);

  const fetchFacilityPersonnel = async (hId) => {
    if (!hId) return;
    setPersonnelLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/facility-data/${hId}`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      if (res.ok) {
        const data = await res.json();
        setFacilityPersonnel(data);
      }
    } catch (err) {
      console.error('Error fetching facility personnel:', err);
    } finally {
      setPersonnelLoading(false);
    }
  };

  const handleDeleteDoctor = async (docId) => {
    if (!window.confirm('Delete this doctor account permanently?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/doctor/${docId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Doctor deleted successfully!');
        fetchFacilityPersonnel(editHospId);
      } else {
        setError(data.message || 'Failed to delete doctor');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!window.confirm('Delete this staff account permanently?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/staff/${staffId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Staff member deleted successfully!');
        fetchFacilityPersonnel(editHospId);
      } else {
        setError(data.message || 'Failed to delete staff member');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteLab = async (labId) => {
    if (!window.confirm('Delete this lab assistant account permanently?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/lab-assistant/${labId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Lab assistant deleted successfully!');
        fetchFacilityPersonnel(editHospId);
      } else {
        setError(data.message || 'Failed to delete lab assistant');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePatient = async (patId) => {
    if (!window.confirm('Delete this patient record permanently?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/patient/${patId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Patient record deleted successfully!');
        fetchFacilityPersonnel(editHospId);
      } else {
        setError(data.message || 'Failed to delete patient record');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSelectHospitalToEdit = (selectedId) => {
    setEditHospId(selectedId);
    fetchFacilityPersonnel(selectedId);
    const hosp = hospitalList.find(h => h.id === selectedId);
    if (hosp) {
      setEditName(hosp.name);
      setEditType(hosp.type || 'Hospital');
      setEditCity(hosp.city || '');
      setEditLat(hosp.coordinates?.lat || 28.6139);
      setEditLng(hosp.coordinates?.lng || 77.2090);
      setEditAddress(hosp.address || '');
      setEditPhone(hosp.phone || '');
      setEditWhatsapp(hosp.whatsappNumber || '');
      setEditDoctorCount(hosp.doctorCount || 1);
      setEditDescription(hosp.description || '');
      setEditLogoUrl(hosp.logoUrl || '');
      setEditCoverImage(hosp.coverImage || '');
      setEditGalleryImagesStr(hosp.galleryImages ? hosp.galleryImages.join(', ') : '');
      setEditPrimaryColor(hosp.primaryColor || '#0284c7');
      setEditSecondaryColor(hosp.secondaryColor || '#0369a1');
      setEditWelcomeMessage(hosp.welcomeMessage || '');
      setEditClinicSubtype(hosp.clinicSubtype || 'General');
      setEditCustomServices(hosp.customServices || []);
      setEditFeatures(hosp.features || []);
      setEditParentHospital(hosp.parentHospital || '');
      setEditHasInternalLab(hosp.hasInternalLab !== undefined ? hosp.hasInternalLab : true);
      setEditHasInternalPharmacy(hosp.hasInternalPharmacy !== undefined ? hosp.hasInternalPharmacy : true);
    }
  };

  const handleDeleteHospital = async (hospIdToDelete) => {
    if (!window.confirm(`Are you sure you want to permanently delete facility '${hospIdToDelete}' and all its doctors, staff, and queues? This action cannot be undone.`)) {
      return;
    }
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospital/${hospIdToDelete}`, {
        method: 'DELETE',
        headers: { 
          'X-Admin-Secret': adminSecret
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete hospital');
      }
      setSuccessMsg(data.message);
      setEditHospId('');
      fetchHospitals();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!window.confirm('Are you sure you want to PERMANENTLY CLEAR ALL DEMO DATA (all sample hospitals, doctors, staff, queues, and tokens)? This action cannot be undone.')) {
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/clear-demo-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to clear demo data');
      }
      setSuccessMsg(data.message);
      setEditHospId('');
      fetchHospitals();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'edit' && hospitalList.length > 0) {
      if (!editHospId) {
        handleSelectHospitalToEdit(hospitalList[0].id);
      }
    }
  }, [activeTab, hospitalList, editHospId]);

  // Submission helpers
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchHospitals = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/hospitals`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setHospitalList(data);
        if (data.length > 0) {
          setSelectedHospital(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching hospitals:', err);
    }
  };

  useEffect(() => {
    if (authorized) {
      fetchHospitals();
    }
  }, [authorized]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid Admin Secret Passcode.');
      }
      setAuthorized(true);
      setAuthError('');
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setAuthError('Unable to connect to the server. Please ensure the backend is running on ' + BACKEND_URL + ' or check your network connection.');
      } else {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
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

    const parsedGalleryImages = galleryImagesStr
      ? galleryImagesStr.split(',').map(s => s.trim()).filter(Boolean)
      : (coverImage ? [coverImage] : []);

    const payload = {
      id: hospId,
      name,
      slug: hospId,
      address,
      phone,
      whatsappNumber,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      logoUrl: logoUrl || '',
      galleryImages: parsedGalleryImages,
      doctorCount: parseInt(doctorCount) || 1,
      description,
      city,
      coordinates: {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      },
      type,
      parentHospital: parentHospital || null,
      hasInternalLab,
      hasInternalPharmacy,
      clinicSubtype,
      customServices,
      features,
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
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to onboard hospital');
      }

      setSuccessMsg(data.message);
      fetchHospitals(); // Refresh hospital list for the other tab
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setError('Unable to connect to the server. Please ensure the backend is running on ' + BACKEND_URL + ' or check your network connection.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAccount = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    let url = '';
    let payload = {
      hospital: selectedHospital,
      name: addName
    };

    if (accountType === 'staff') {
      url = `${BACKEND_URL}/api/v1/auth/super-admin/register-staff`;
      payload.username = addUsername;
      payload.password = addPassword;
      payload.counterNumber = addCounterNumber;
    } else if (accountType === 'doctor') {
      url = `${BACKEND_URL}/api/v1/auth/super-admin/register-doctor`;
      payload.email = addEmail;
      payload.password = addPassword;
      payload.department = addDepartment;
      payload.currentRoom = addRoom;
      payload.specialization = addSpecialization;
      payload.averageCheckupTime = addAverageCheckupTime;
    } else if (accountType === 'lab') {
      url = `${BACKEND_URL}/api/v1/auth/super-admin/register-lab`;
      payload.username = addUsername;
      payload.password = addPassword;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Failed to register ${accountType}`);
      }

      setSuccessMsg(data.message);
      // Reset form fields
      setAddName('');
      setAddUsername('');
      setAddPassword('');
      setAddEmail('');
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

  const handleUpdateHospital = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const parsedEditGalleryImages = editGalleryImagesStr
      ? editGalleryImagesStr.split(',').map(s => s.trim()).filter(Boolean)
      : (editCoverImage ? [editCoverImage] : []);

    const payload = {
      name: editName,
      slug: editHospId,
      address: editAddress,
      phone: editPhone,
      whatsappNumber: editWhatsapp,
      coverImage: editCoverImage,
      logoUrl: editLogoUrl,
      galleryImages: parsedEditGalleryImages,
      doctorCount: parseInt(editDoctorCount) || 1,
      description: editDescription,
      city: editCity,
      coordinates: {
        lat: parseFloat(editLat),
        lng: parseFloat(editLng)
      },
      type: editType,
      parentHospital: editParentHospital || null,
      hasInternalLab: editHasInternalLab,
      hasInternalPharmacy: editHasInternalPharmacy,
      heroImage: editCoverImage,
      primaryColor: editPrimaryColor,
      secondaryColor: editSecondaryColor,
      welcomeMessage: editWelcomeMessage,
      clinicSubtype: editClinicSubtype,
      customServices: editCustomServices,
      features: editFeatures
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospital/${editHospId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update hospital profile');
      }

      setSuccessMsg(data.message);
      fetchHospitals(); // Refresh list to get updated details
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

  const filteredHospitals = hospitalList.filter(h => {
    const matchesSearch = !facilitySearchQuery || 
      h.name.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
      h.city.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
      h.id.toLowerCase().includes(facilitySearchQuery.toLowerCase());
    
    if (facilityFilterType === 'All') return matchesSearch;
    return matchesSearch && h.type === facilityFilterType;
  });

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

        {/* Master Facility Quick Selector & Multi-Tenancy Directory Bar */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-5 shadow-sm space-y-4 text-left">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-color)]/20 pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--primary-color)]">domain_add</span>
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-color)]">
                  Master Multi-Facility Directory ({hospitalList.length} Registered)
                </h3>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                Select any registered hospital, clinic, lab or medical store from the list below to instantly edit or manage accounts.
              </p>
            </div>

            {/* Quick Top Dropdown Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap">Select to Edit:</span>
              <select
                value={editHospId}
                onChange={e => {
                  handleSelectHospitalToEdit(e.target.value);
                  setActiveTab('edit');
                }}
                className="bg-[var(--bg-color)] border border-[var(--primary-color)]/60 text-[var(--primary-color)] font-extrabold rounded-xl px-3 py-1.5 outline-none text-xs cursor-pointer shadow-sm"
              >
                <option value="">-- Choose Facility --</option>
                {hospitalList.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.type || 'Hospital'} - {h.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Pills & Live Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['All', 'Hospital', 'Clinic', 'Lab', 'Medical', 'Government Hospital', 'Government Lab'].map(ft => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFacilityFilterType(ft)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    facilityFilterType === ft
                      ? 'bg-[var(--primary-color)] text-white shadow-sm'
                      : 'bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                  }`}
                >
                  {ft}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="🔍 Search facility by name or city..."
              value={facilitySearchQuery}
              onChange={e => setFacilitySearchQuery(e.target.value)}
              className="w-full md:w-64 bg-[var(--bg-color)] border border-[var(--border-color)]/60 rounded-xl px-3 py-1.5 text-xs text-[var(--text-color)] font-semibold outline-none focus:border-[var(--primary-color)]"
            />
          </div>

          {/* Facility Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1 max-h-56 overflow-y-auto no-scrollbar">
            {filteredHospitals.length === 0 ? (
              <p className="col-span-full text-xs text-[var(--text-secondary)] font-semibold py-4 text-center">
                No matching facilities found.
              </p>
            ) : (
              filteredHospitals.map(h => (
                <div 
                  key={h.id} 
                  className={`p-3 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                    editHospId === h.id 
                      ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5 shadow-md'
                      : 'border-[var(--border-color)]/40 bg-[var(--bg-color)] hover:border-[var(--primary-color)]/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-[var(--primary-color)]/10 text-[var(--primary-color)] text-[9px] font-black rounded-md uppercase tracking-wider">
                        {h.type || 'Hospital'}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text-secondary)]">
                        👨‍⚕️ {h.doctorCount || 1} Dr(s)
                      </span>
                    </div>

                    <h4 className="font-extrabold text-xs text-[var(--text-color)] mt-1.5 line-clamp-1">
                      {h.name}
                    </h4>
                    <p className="text-[10px] text-[var(--text-secondary)] font-semibold">
                      📍 {h.city} • ID: <span className="font-mono text-[var(--primary-color)]">{h.id}</span>
                    </p>

                    {h.parentHospital && (
                      <p className="text-[9px] text-[var(--tertiary-color)] font-bold mt-1">
                        🔗 Parent: {h.parentHospital}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 mt-3 pt-2 border-t border-[var(--border-color)]/20">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectHospitalToEdit(h.id);
                        setActiveTab('edit');
                      }}
                      className="flex-1 py-1 bg-[var(--primary-color)] hover:bg-[var(--primary-color)]/90 text-white rounded-lg text-[10px] font-black transition-all text-center"
                    >
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHospital(h.id);
                        setActiveTab('accounts');
                      }}
                      className="px-2 py-1 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-color)] hover:bg-[var(--border-color)]/20 rounded-lg text-[10px] font-black transition-all"
                    >
                      + Accs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHospital(h.id)}
                      className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-[10px] transition-all"
                      title="Delete Facility"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex space-x-2 border-b border-[var(--border-color)]/30 pb-1">
          <button
            onClick={() => { setActiveTab('hospital'); setError(''); setSuccessMsg(''); }}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'hospital'
                ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
            }`}
          >
            Onboard New Hospital
          </button>
          <button
            onClick={() => { setActiveTab('accounts'); setError(''); setSuccessMsg(''); }}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'accounts'
                ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
            }`}
          >
            Register More Accounts
          </button>
          <button
            onClick={() => { setActiveTab('edit'); setError(''); setSuccessMsg(''); }}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'edit'
                ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
            }`}
          >
            Edit Facilities
          </button>
          <button
            onClick={() => { setActiveTab('whatsapp'); setError(''); setSuccessMsg(''); }}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center space-x-1 ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">chat</span>
            <span>WhatsApp API Tester</span>
          </button>
          
          <button
            type="button"
            onClick={handleClearDemoData}
            className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center space-x-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 ml-auto"
            title="Wipe all demo sample data to start with clean manual entry"
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            <span>Wipe Demo Data</span>
          </button>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 md:p-8 shadow-[var(--card-shadow)] space-y-8">
          
          <div className="border-b border-[var(--border-color)]/30 pb-4">
            <h2 className="text-2xl font-black tracking-tight">
              {activeTab === 'hospital' ? 'Onboard Medical Facility' : activeTab === 'accounts' ? 'Register Additional Accounts' : 'Edit Medical Facility Profile'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">
              {activeTab === 'hospital' 
                ? 'Register a new hospital, clinic, lab or government health dispensary to the B2B SaaS directory.'
                : activeTab === 'accounts'
                ? 'Register more doctors, receptionists, or lab assistants to an existing medical facility.'
                : 'Modify and customize addresses, cover banners, logos, messages, and theme colors of a registered facility.'
              }
            </p>
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
              <h3 className="text-lg font-black text-[var(--tertiary-color)]">
                {activeTab === 'hospital' ? 'Onboarding Completed!' : 'Registration Successful!'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium max-w-sm mx-auto">
                {successMsg}
              </p>
              <div className="pt-4 flex justify-center space-x-3 text-xs">
                <button
                  onClick={() => {
                    setSuccessMsg('');
                    if (activeTab === 'hospital') {
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
                    }
                  }}
                  className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--border-color)]/25 rounded-xl font-black transition-all"
                >
                  {activeTab === 'hospital' ? 'Onboard Another' : 'Register Another'}
                </button>
                {activeTab === 'hospital' && (
                  <button
                    onClick={() => navigate(`/hospital/${hospId}`)}
                    className="px-4 py-2 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white rounded-xl font-black transition-all transition-all-custom shadow-md"
                  >
                    Visit Patient Portal
                  </button>
                )}
              </div>
            </div>
          ) : activeTab === 'hospital' ? (
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

                <div className={`grid grid-cols-1 ${type === 'Clinic' || type === 'Medical' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
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
                      <option>Government Hospital</option>
                      <option>Government Lab</option>
                      <option>Government</option>
                    </select>
                  </div>
                  {type === 'Clinic' && (
                    <div>
                      <label className="block mb-1">Clinic Subtype *</label>
                      <select
                        value={clinicSubtype}
                        onChange={e => setClinicSubtype(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="Dental">Dental Clinic</option>
                        <option value="Eye">Eye Clinic</option>
                        <option value="Ortho">Bone & Ortho Clinic</option>
                        <option value="General">General Clinic</option>
                      </select>
                    </div>
                  )}
                  {type === 'Medical' && (
                    <div>
                      <label className="block mb-1">Medical Subtype *</label>
                      <select
                        value={clinicSubtype}
                        onChange={e => setClinicSubtype(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="Pharmacy">General Pharmacy</option>
                        <option value="Homeopathy">Homeopathic Store</option>
                        <option value="Ayurvedic">Ayurvedic Store</option>
                        <option value="Surgical">Surgical Supply Store</option>
                        <option value="General">General Medical Store</option>
                      </select>
                    </div>
                  )}
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <div>
                    <label className="block mb-1">Total Doctors Count *</label>
                    <input
                      type="number"
                      min="1"
                      value={doctorCount}
                      onChange={e => setDoctorCount(e.target.value)}
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Logo Image URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/logo.png"
                      value={logoUrl}
                      onChange={e => setLogoUrl(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
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
                    <label className="block mb-1">Gallery Image URLs (Comma Separated)</label>
                    <input
                      type="text"
                      placeholder="https://img1.com, https://img2.com"
                      value={galleryImagesStr}
                      onChange={e => setGalleryImagesStr(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30">
                  <div>
                    <label className="block mb-1 font-bold text-[var(--text-color)]">Parent Hospital (If Sub-facility)</label>
                    <select
                      value={parentHospital}
                      onChange={e => setParentHospital(e.target.value)}
                      className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                    >
                      <option value="">-- None (Standalone Facility) --</option>
                      {hospitalList.filter(h => h.type === 'Hospital' || h.type === 'Government Hospital').map(h => (
                        <option key={h.id} value={h.id}>{h.name} ({h.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center space-x-2 pt-4 md:pt-6">
                    <input
                      type="checkbox"
                      id="hasInternalLab"
                      checked={hasInternalLab}
                      onChange={e => setHasInternalLab(e.target.checked)}
                      className="w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer"
                    />
                    <label htmlFor="hasInternalLab" className="text-xs font-bold text-[var(--text-color)] cursor-pointer">
                      Has Internal Pathology Lab
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 pt-4 md:pt-6">
                    <input
                      type="checkbox"
                      id="hasInternalPharmacy"
                      checked={hasInternalPharmacy}
                      onChange={e => setHasInternalPharmacy(e.target.checked)}
                      className="w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer"
                    />
                    <label htmlFor="hasInternalPharmacy" className="text-xs font-bold text-[var(--text-color)] cursor-pointer">
                      Has Internal Pharmacy Store
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION A.5: Landing Page custom content */}
              <div className="space-y-4 bg-[var(--bg-color)]/20 p-5 rounded-2xl border border-[var(--border-color)]/30">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">style</span>
                  <span>1b. Custom Landing Page Services & Features</span>
                </h3>

                {/* Services List */}
                <div className="space-y-3 bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">Landing Page Services & Specialties</span>
                    <button
                      type="button"
                      onClick={() => setCustomServices(prev => [...prev, { title: '', description: '', icon: 'local_hospital' }])}
                      className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                    >
                      + Add Service
                    </button>
                  </div>
                  {customServices.map((srv, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-[var(--border-color)]/20 pb-3 last:border-b-0 last:pb-0">
                      <div className="md:col-span-3">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Service Title</label>
                        <input
                          type="text"
                          value={srv.title}
                          placeholder="e.g. Cosmetic Dentistry"
                          onChange={e => {
                            const val = e.target.value;
                            setCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, title: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                      </div>
                      <div className="md:col-span-5">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Description</label>
                        <input
                          type="text"
                          value={srv.description}
                          placeholder="e.g. Veneers, bonding, and teeth whitening treatments."
                          onChange={e => {
                            const val = e.target.value;
                            setCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, description: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Material Icon Name</label>
                        <select
                          value={srv.icon}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, icon: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2 py-1.5 outline-none text-xs text-[var(--text-color)] font-bold cursor-pointer"
                        >
                          <option value="local_hospital">Hospital (default)</option>
                          <option value="biotech">Lab biotech</option>
                          <option value="dentistry">Dentistry (tooth)</option>
                          <option value="visibility">Ophthalmology (eye)</option>
                          <option value="bone">Bone & Ortho (orthopedics)</option>
                          <option value="bloodtype">Blood draws</option>
                          <option value="settings_accessibility">Pediatrics/General</option>
                          <option value="medical_services">Medical Kit</option>
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => setCustomServices(prev => prev.filter((_, i) => i !== idx))}
                          className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg flex items-center justify-center transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Features List */}
                <div className="space-y-3 bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">Clinic Features (Why Choose Us)</span>
                    <button
                      type="button"
                      onClick={() => setFeatures(prev => [...prev, ''])}
                      className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                    >
                      + Add Feature
                    </button>
                  </div>
                  {features.map((feat, idx) => (
                    <div key={idx} className="flex items-center space-x-2.5">
                      <input
                        type="text"
                        value={feat}
                        placeholder="e.g. State-of-the-Art Dental Technology"
                        onChange={e => {
                          const val = e.target.value;
                          setFeatures(prev => prev.map((f, i) => i === idx ? val : f));
                        }}
                        className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setFeatures(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  ))}
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
          ) : activeTab === 'accounts' ? (
            <form onSubmit={handleRegisterAccount} className="space-y-8 text-xs font-bold text-[var(--text-secondary)]">
              {/* Select Existing Hospital */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">domain</span>
                  <span>1. Select Medical Facility</span>
                </h3>
                <div>
                  <label className="block mb-1">Select Hospital/Clinic *</label>
                  {hospitalList.length === 0 ? (
                    <p className="text-xs text-rose-500 font-semibold">No hospitals registered yet. Please onboard a hospital first.</p>
                  ) : (
                    <select
                      value={selectedHospital}
                      onChange={e => setSelectedHospital(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      required
                    >
                      {hospitalList.map(h => (
                        <option key={h.id} value={h.id}>{h.name} ({h.city})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Select Account Type */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">manage_accounts</span>
                  <span>2. Account Type & Role</span>
                </h3>
                <div className="flex space-x-3">
                  {[
                    { type: 'doctor', label: 'Doctor', icon: 'stethoscope' },
                    { type: 'staff', label: 'Receptionist / Staff', icon: 'verified_user' },
                    { type: 'lab', label: 'Lab Assistant', icon: 'science' }
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setAccountType(item.type)}
                      className={`px-4 py-2 border rounded-xl flex items-center space-x-2 transition-all ${
                        accountType === item.type
                          ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]/10'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Form Fields */}
              {accountType === 'doctor' && (
                <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                  <h3 className="text-sm font-black text-[var(--text-color)]">Doctor Profile Setup</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-1">Doctor Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. David Miller"
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Doctor Email (Login ID) *</label>
                      <input
                        type="email"
                        placeholder="david.miller@hospital.com"
                        value={addEmail}
                        onChange={e => setAddEmail(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Doctor Password *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={addPassword}
                        onChange={e => setAddPassword(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-1">Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Cardiology"
                        value={addDepartment}
                        onChange={e => setAddDepartment(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Consultation Cabin Room</label>
                      <input
                        type="text"
                        placeholder="e.g. Cabin 101"
                        value={addRoom}
                        onChange={e => setAddRoom(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Specialization</label>
                      <input
                        type="text"
                        placeholder="e.g. Heart Failure"
                        value={addSpecialization}
                        onChange={e => setAddSpecialization(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {accountType === 'staff' && (
                <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                  <h3 className="text-sm font-black text-[var(--text-color)]">Receptionist / Staff Profile Setup</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-1">Staff Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. David Jones"
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Username (Login ID) *</label>
                      <input
                        type="text"
                        placeholder="e.g. city_staff"
                        value={addUsername}
                        onChange={e => setAddUsername(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Password *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={addPassword}
                        onChange={e => setAddPassword(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1">Counter Room Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Reception Counter 1"
                      value={addCounterNumber}
                      onChange={e => setAddCounterNumber(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                </div>
              )}

              {accountType === 'lab' && (
                <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                  <h3 className="text-sm font-black text-[var(--text-color)]">Lab Assistant Profile Setup</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-1">Lab Assistant Name</label>
                      <input
                        type="text"
                        placeholder="e.g. City Lab Specialist"
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Lab Assistant Username *</label>
                      <input
                        type="text"
                        placeholder="e.g. city_lab"
                        value={addUsername}
                        onChange={e => setAddUsername(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Password *</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={addPassword}
                        onChange={e => setAddPassword(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || hospitalList.length === 0}
                className="w-full py-4 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black text-sm rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/15 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? <span>Configuring clinical database & files...</span> : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">publish</span>
                    <span>Register Account</span>
                  </>
                )}
              </button>
            </form>
          ) : activeTab === 'edit' ? (
            <form onSubmit={handleUpdateHospital} className="space-y-8 text-xs font-bold text-[var(--text-secondary)]">
              {/* Select Hospital to Edit */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">domain</span>
                  <span>1. Select Medical Facility to Modify</span>
                </h3>
                <div>
                  <label className="block mb-1">Select Hospital/Clinic *</label>
                  {hospitalList.length === 0 ? (
                    <p className="text-xs text-rose-500 font-semibold">No hospitals registered yet.</p>
                  ) : (
                    <select
                      value={editHospId}
                      onChange={e => handleSelectHospitalToEdit(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      required
                    >
                      {hospitalList.map(h => (
                        <option key={h.id} value={h.id}>{h.name} ({h.city})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Edit Core Profile */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">edit</span>
                  <span>2. Core Information & Settings</span>
                </h3>

                <div className={`grid grid-cols-1 ${editType === 'Clinic' || editType === 'Medical' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                  <div>
                    <label className="block mb-1">Service Name *</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Service Type *</label>
                    <select
                      value={editType}
                      onChange={e => setEditType(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                    >
                      <option>Hospital</option>
                      <option>Clinic</option>
                      <option>Medical</option>
                      <option>Lab</option>
                      <option>Government Hospital</option>
                      <option>Government Lab</option>
                      <option>Government</option>
                    </select>
                  </div>
                  {editType === 'Clinic' && (
                    <div>
                      <label className="block mb-1">Clinic Subtype *</label>
                      <select
                        value={editClinicSubtype}
                        onChange={e => setEditClinicSubtype(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="Dental">Dental Clinic</option>
                        <option value="Eye">Eye Clinic</option>
                        <option value="Ortho">Bone & Ortho Clinic</option>
                        <option value="General">General Clinic</option>
                      </select>
                    </div>
                  )}
                  {editType === 'Medical' && (
                    <div>
                      <label className="block mb-1">Medical Subtype *</label>
                      <select
                        value={editClinicSubtype}
                        onChange={e => setEditClinicSubtype(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="Pharmacy">General Pharmacy</option>
                        <option value="Homeopathy">Homeopathic Store</option>
                        <option value="Ayurvedic">Ayurvedic Store</option>
                        <option value="Surgical">Surgical Supply Store</option>
                        <option value="General">General Medical Store</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">City Location *</label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={e => setEditCity(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Latitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editLat}
                      onChange={e => setEditLat(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Longitude *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editLng}
                      onChange={e => setEditLng(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Phone Number *</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">WhatsApp Booking Number *</label>
                    <input
                      type="text"
                      value={editWhatsapp}
                      onChange={e => setEditWhatsapp(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Total Doctors Count *</label>
                    <input
                      type="number"
                      min="1"
                      value={editDoctorCount}
                      onChange={e => setEditDoctorCount(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Address *</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    required
                  />
                </div>
              </div>

              {/* Edit Branding */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">palette</span>
                  <span>3. Dynamic Custom Branding (White-Labeling)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-1">Logo URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/logo.png"
                      value={editLogoUrl}
                      onChange={e => setEditLogoUrl(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Cover / Hero Image URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={editCoverImage}
                      onChange={e => setEditCoverImage(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Gallery Image URLs (Comma Separated)</label>
                    <input
                      type="text"
                      placeholder="https://img1.com, https://img2.com"
                      value={editGalleryImagesStr}
                      onChange={e => setEditGalleryImagesStr(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30">
                  <div>
                    <label className="block mb-1 font-bold text-[var(--text-color)]">Parent Hospital (If Sub-facility)</label>
                    <select
                      value={editParentHospital}
                      onChange={e => setEditParentHospital(e.target.value)}
                      className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                    >
                      <option value="">-- None (Standalone Facility) --</option>
                      {hospitalList.filter(h => (h.type === 'Hospital' || h.type === 'Government Hospital') && h.id !== editHospId).map(h => (
                        <option key={h.id} value={h.id}>{h.name} ({h.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center space-x-2 pt-4 md:pt-6">
                    <input
                      type="checkbox"
                      id="editHasInternalLab"
                      checked={editHasInternalLab}
                      onChange={e => setEditHasInternalLab(e.target.checked)}
                      className="w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer"
                    />
                    <label htmlFor="editHasInternalLab" className="text-xs font-bold text-[var(--text-color)] cursor-pointer">
                      Has Internal Pathology Lab
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 pt-4 md:pt-6">
                    <input
                      type="checkbox"
                      id="editHasInternalPharmacy"
                      checked={editHasInternalPharmacy}
                      onChange={e => setEditHasInternalPharmacy(e.target.checked)}
                      className="w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer"
                    />
                    <label htmlFor="editHasInternalPharmacy" className="text-xs font-bold text-[var(--text-color)] cursor-pointer">
                      Has Internal Pharmacy Store
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Custom Welcome / Announcement Message (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Free checkups this Sunday! Or Welcome to St. Jude!"
                    value={editWelcomeMessage}
                    onChange={e => setEditWelcomeMessage(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                  />
                </div>

                <div>
                  <label className="block mb-1">Short Description *</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    required
                  />
                </div>

                {/* Edit Specialties List */}
                <div className="space-y-3 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">Edit Landing Page Services & Specialties</span>
                    <button
                      type="button"
                      onClick={() => setEditCustomServices(prev => [...prev, { title: '', description: '', icon: 'local_hospital' }])}
                      className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                    >
                      + Add Service
                    </button>
                  </div>
                  {editCustomServices.map((srv, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-[var(--border-color)]/20 pb-3 last:border-b-0 last:pb-0">
                      <div className="md:col-span-3">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Service Title</label>
                        <input
                          type="text"
                          value={srv.title}
                          placeholder="e.g. Orthodontics"
                          onChange={e => {
                            const val = e.target.value;
                            setEditCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, title: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                      </div>
                      <div className="md:col-span-5">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Description</label>
                        <input
                          type="text"
                          value={srv.description}
                          placeholder="e.g. Straighten teeth with advanced braces & aligners."
                          onChange={e => {
                            const val = e.target.value;
                            setEditCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, description: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block mb-0.5 text-[9px] uppercase font-bold text-[var(--text-secondary)]">Material Icon Name</label>
                        <select
                          value={srv.icon}
                          onChange={e => {
                            const val = e.target.value;
                            setEditCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, icon: val } : s));
                          }}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2 py-1.5 outline-none text-xs text-[var(--text-color)] font-bold cursor-pointer"
                        >
                          <option value="local_hospital">Hospital (default)</option>
                          <option value="biotech">Lab biotech</option>
                          <option value="dentistry">Dentistry (tooth)</option>
                          <option value="visibility">Ophthalmology (eye)</option>
                          <option value="bone">Bone & Ortho (orthopedics)</option>
                          <option value="bloodtype">Blood draws</option>
                          <option value="settings_accessibility">Pediatrics/General</option>
                          <option value="medical_services">Medical Kit</option>
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => setEditCustomServices(prev => prev.filter((_, i) => i !== idx))}
                          className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg flex items-center justify-center transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Edit Features List */}
                <div className="space-y-3 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">Edit Clinic Features (Why Choose Us)</span>
                    <button
                      type="button"
                      onClick={() => setEditFeatures(prev => [...prev, ''])}
                      className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                    >
                      + Add Feature
                    </button>
                  </div>
                  {editFeatures.map((feat, idx) => (
                    <div key={idx} className="flex items-center space-x-2.5">
                      <input
                        type="text"
                        value={feat}
                        placeholder="e.g. Skilled Orthopedic Surgeons"
                        onChange={e => {
                          const val = e.target.value;
                          setEditFeatures(prev => prev.map((f, i) => i === idx ? val : f));
                        }}
                        className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setEditFeatures(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 flex items-center justify-between">
                    <div>
                      <label className="block font-bold mb-0.5">Primary Theme Color</label>
                      <span className="text-[10px] text-[var(--text-secondary)]">Click color box to adjust</span>
                    </div>
                    <input
                      type="color"
                      value={editPrimaryColor}
                      onChange={e => setEditPrimaryColor(e.target.value)}
                      className="w-12 h-10 border-none bg-transparent cursor-pointer rounded-lg outline-none"
                    />
                  </div>
                  <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 flex items-center justify-between">
                    <div>
                      <label className="block font-bold mb-0.5">Secondary Theme Color</label>
                      <span className="text-[10px] text-[var(--text-secondary)]">Click color box to adjust</span>
                    </div>
                    <input
                      type="color"
                      value={editSecondaryColor}
                      onChange={e => setEditSecondaryColor(e.target.value)}
                      className="w-12 h-10 border-none bg-transparent cursor-pointer rounded-lg outline-none"
                    />
                  </div>
                </div>
              </div>

                {/* Super Admin Facility Personnel & Patient Management Console */}
                <div className="space-y-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm text-left">
                  <div className="flex justify-between items-center border-b border-[var(--border-color)]/20 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-color)] flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[var(--primary-color)]">badge</span>
                      <span>5. Facility Registered Personnel & Patients</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => fetchFacilityPersonnel(editHospId)}
                      className="px-2.5 py-1 bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-lg text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-color)] flex items-center space-x-1"
                    >
                      <span className={`material-symbols-outlined text-[14px] ${personnelLoading ? 'animate-spin' : ''}`}>refresh</span>
                      <span>Reload Personnel</span>
                    </button>
                  </div>

                  {personnelLoading ? (
                    <p className="text-xs font-bold text-zinc-400 py-4 text-center">Loading registered personnel & patients...</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Doctors List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[10px] font-black uppercase text-[var(--primary-color)] tracking-wider">Registered Doctors ({facilityPersonnel.doctors.length})</span>
                        {facilityPersonnel.doctors.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No doctors registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.doctors.map(d => (
                              <div key={d._id} className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs">
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{d.name}</p>
                                  <p className="text-[10px] text-[var(--text-secondary)]">{d.department} • {d.currentRoom || 'Cabin'} ({d.availabilityStatus})</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDoctor(d._id)}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  title="Delete Doctor"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Staff List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[10px] font-black uppercase text-[var(--secondary-color)] tracking-wider">Registered Staff ({facilityPersonnel.staff.length})</span>
                        {facilityPersonnel.staff.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No staff registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.staff.map(s => (
                              <div key={s._id} className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs">
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{s.name}</p>
                                  <p className="text-[10px] text-[var(--text-secondary)]">{s.username} • {s.counterNumber}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStaff(s._id)}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  title="Delete Staff"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Lab Assistants List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Registered Lab Assistants ({facilityPersonnel.labAssistants.length})</span>
                        {facilityPersonnel.labAssistants.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No lab assistants registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.labAssistants.map(l => (
                              <div key={l._id} className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs">
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{l.name}</p>
                                  <p className="text-[10px] text-[var(--text-secondary)]">{l.username}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLab(l._id)}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  title="Delete Lab Assistant"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Registered Patients List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Registered Patients ({facilityPersonnel.patients.length})</span>
                        {facilityPersonnel.patients.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No patients registered in this facility.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.patients.map(p => (
                              <div key={p._id} className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs">
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{p.name}</p>
                                  <p className="text-[10px] text-[var(--text-secondary)]">{p.phone} • {p.age}y ({p.gender}) • {p.visitCount} visits</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePatient(p._id)}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  title="Delete Patient Record"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                <button
                  type="submit"
                  disabled={loading || hospitalList.length === 0}
                  className="flex-1 py-4 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black text-sm rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/15 flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? <span>Applying customizations...</span> : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span>
                      <span>Save Brand Customizations</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={loading || hospitalList.length === 0 || !editHospId}
                  onClick={() => handleDeleteHospital(editHospId)}
                  className="px-6 py-4 bg-rose-500 hover:bg-rose-600 text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-rose-500/15 flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                  <span>Delete Facility</span>
                </button>
              </div>
            </form>
          ) : activeTab === 'whatsapp' ? (
            <WhatsAppTester
              initialPhone={editWhatsapp || '+14155238886'}
              defaultHospId={editHospId || 'general-hospital'}
            />
          ) : null}

        </div>
      </div>
    </div>
  );
}
