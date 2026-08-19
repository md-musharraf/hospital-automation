import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { Activity, ShieldAlert, ArrowLeft } from 'lucide-react';
import WhatsAppTester from './WhatsAppTester';
import {
  ModuleGrid,
  DoctorProfileFields,
  blankDoctorProfile,
  doctorProfileFrom,
  LandingEditor,
  FALLBACK_MODULES,
  FALLBACK_TEMPLATES,
  blankLanding,
  landingFrom,
  modulesFrom,
  GalleryUploader
} from './FacilityProfileEditor';
import ImageUploadField, { UploadCredentialsProvider } from './ImageUploadField';
import { EmailInput } from './fields/NormalizedInput';

/**
 * Every facility's subscription on one screen, worst first.
 *
 * The server does the sorting and the state maths — this panel deliberately
 * computes nothing about expiry itself. A screen that decided independently
 * whether a facility was expired would eventually disagree with the middleware
 * that actually blocks it, and the owner would be looking at a green row for a
 * hospital whose reception cannot open a token.
 */
function LicensePanel({ adminSecret }) {
  const [data, setData] = useState({ facilities: [], plans: {}, graceDays: 7 });
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const headers = { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret };

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/licenses`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const json = await res.json();
      if (res.ok) setData(json);
      else setError(json.message || 'Could not load licences');
    } catch (err) {
      setError('Could not reach the server');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSecret]);

  const grant = async (id, plan) => {
    setBusy(id);
    setError('');
    setNote('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospital/${id}/license`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ plan })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not grant that term');
      setNote(json.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const setStatus = async (id, suspend) => {
    setBusy(id);
    setError('');
    setNote('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospital/${id}/license/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ suspend })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not change that facility');
      setNote(json.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const remindNow = async () => {
    setBusy('sweep');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/licenses/remind`, {
        method: 'POST',
        headers
      });
      const json = await res.json();
      setNote(json.message || 'Reminders sent');
    } catch (err) {
      setError('Could not send reminders');
    } finally {
      setBusy('');
    }
  };

  const TONE = {
    expired: 'bg-rose-500/10 border-rose-500/40 text-rose-500',
    suspended: 'bg-rose-500/10 border-rose-500/40 text-rose-500',
    grace: 'bg-orange-500/10 border-orange-500/40 text-orange-500',
    expiring: 'bg-amber-500/10 border-amber-500/40 text-amber-600',
    active: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
    none: 'bg-[var(--border-color)]/20 border-[var(--border-color)]/40 text-[var(--text-secondary)]'
  };

  const LABEL = {
    expired: 'SERVICES OFF',
    suspended: 'SUSPENDED',
    grace: 'IN GRACE',
    expiring: 'ENDING SOON',
    active: 'ACTIVE',
    none: 'NO LICENCE SET'
  };

  const planKeys = Object.keys(data.plans || {});

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-black text-[var(--text-color)]">Facility licences</h3>
          <p className="text-[13px] font-semibold text-[var(--text-secondary)] mt-1 max-w-2xl">
            A term runs out, the consoles keep working for {data.graceDays} more days with a warning on every
            screen, and only then do they stop. Renewing extends from the current expiry, so renewing early
            never costs a facility the days it already paid for.
          </p>
        </div>
        <button
          type="button"
          onClick={remindNow}
          disabled={busy === 'sweep'}
          className="px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)]/40 text-[12px] font-black text-[var(--text-color)] hover:border-[var(--primary-color)] disabled:opacity-50"
        >
          Send renewal reminders now
        </button>
      </div>

      {error && (
        <div className="px-3.5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] font-bold">
          {error}
        </div>
      )}
      {note && (
        <div className="px-3.5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] font-bold">
          {note}
        </div>
      )}

      <div className="space-y-3">
        {(data.facilities || []).map((f) => (
          <div
            key={f.id}
            className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/30 space-y-3"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-[var(--text-color)]">{f.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-black tracking-wider ${TONE[f.stage]}`}
                  >
                    {LABEL[f.stage]}
                  </span>
                </div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] mt-0.5">
                  {f.city} · {f.type} · {f.planLabel || 'no plan'}
                  {f.expiresAt ? ` · until ${new Date(f.expiresAt).toLocaleDateString()}` : ''}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">{f.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setStatus(f.id, f.stage !== 'suspended')}
                disabled={busy === f.id}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all disabled:opacity-50 ${
                  f.stage === 'suspended'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                }`}
              >
                {f.stage === 'suspended' ? 'Restore' : 'Suspend'}
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                Grant / extend:
              </span>
              {planKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => grant(f.id, key)}
                  disabled={busy === f.id}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-[12px] font-black text-[var(--text-color)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-all disabled:opacity-50"
                >
                  {data.plans[key].label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {(data.facilities || []).length === 0 && (
          <p className="text-[13px] font-semibold text-[var(--text-secondary)] italic">
            No facilities registered yet.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What each kind of facility IS, and which login accounts it needs.
 *
 * `requires` / `offers` mirror FACILITY_TYPE_RULES in backend/routes/auth.js and
 * are refreshed from `GET /super-admin/facility-types` once the panel unlocks, so
 * the form can never offer a shape the API then rejects. A pathology lab has no
 * OPD doctors and a medical store has no lab bench — hiding those sections is
 * what stops half-configured tenants being created.
 */
const FACILITY_TYPES = [
  {
    name: 'Hospital',
    icon: 'local_hospital',
    blurb: 'Multi-department OPD with its own lab and pharmacy.',
    requires: ['staff'],
    offers: ['staff', 'doctors', 'lab', 'pharmacy']
  },
  {
    name: 'Clinic',
    icon: 'medical_services',
    blurb: 'One or a few doctors, usually a single specialty.',
    requires: ['doctors'],
    offers: ['staff', 'doctors', 'lab', 'pharmacy']
  },
  {
    name: 'Medical',
    icon: 'local_pharmacy',
    blurb: 'Medical store / pharmacy counter — dispensing only.',
    requires: ['pharmacy'],
    offers: ['staff', 'pharmacy']
  },
  {
    name: 'Lab',
    icon: 'science',
    blurb: 'Diagnostic / pathology lab — samples and reports.',
    requires: ['lab'],
    offers: ['staff', 'lab']
  },
  {
    name: 'Government Hospital',
    icon: 'account_balance',
    blurb: 'Government OPD — same units as a hospital.',
    requires: ['staff'],
    offers: ['staff', 'doctors', 'lab', 'pharmacy']
  },
  {
    name: 'Government Lab',
    icon: 'biotech',
    blurb: 'Government diagnostic lab.',
    requires: ['lab'],
    offers: ['staff', 'lab']
  },
  {
    name: 'Government',
    icon: 'apartment',
    blurb: 'Other government health facility.',
    requires: ['staff'],
    offers: ['staff', 'doctors', 'lab', 'pharmacy']
  }
];

/** Employment shape of a doctor at the facility (Doctor.doctorType). */
const DOCTOR_TYPES = [
  'Consultant',
  'Visiting',
  'Resident',
  'Surgeon',
  'Emergency Officer',
  'General Physician'
];

/**
 * The departments smart triage actually recognises (utils/triageHelper.js). A
 * doctor filed under anything else still works, but symptom auto-routing can
 * only fall back to General Medicine for them — so these are offered first.
 */
const KNOWN_DEPARTMENTS = [
  'General Medicine',
  'Cardiology',
  'Pediatrics',
  'Orthopedics',
  'Dermatology',
  'ENT',
  'Ophthalmology',
  'Gynecology',
  'Neurology',
  'Gastroenterology',
  'Dental',
  'Psychiatry'
];

/** Which departments to suggest first for a given clinic subtype. */
const SUBTYPE_DEPARTMENTS = {
  Dental: ['Dental'],
  Eye: ['Ophthalmology'],
  Ortho: ['Orthopedics'],
  General: ['General Medicine']
};

const SECTION_LABEL = {
  staff: 'reception',
  doctors: 'doctor',
  lab: 'lab',
  pharmacy: 'pharmacy'
};

/** [singular, plural] for the "about to create" tally. */
const SECTION_COUNT_LABEL = {
  staff: ['reception counter', 'reception counters'],
  doctors: ['doctor', 'doctors'],
  lab: ['lab account', 'lab accounts'],
  pharmacy: ['pharmacy counter', 'pharmacy counters']
};

// `loginEmail` / `password` are optional on every person.
//
// Left blank the person is a name on the roster and reaches their console
// through the shared facility password, exactly as before. Filled in they also
// get their own sign-in, which opens only their room. Onboarding usually happens
// before anyone has decided who gets an account, so these must never be required
// — a registration that stalls on eight passwords is a registration abandoned
// halfway.
const blankStaff = () => ({
  name: '',
  counterNumber: 'Reception Counter 1',
  loginEmail: '',
  password: ''
});
const blankDoctor = () => ({
  name: '',
  email: '',
  // A doctor's email already exists as their handle in the tenant, so a password
  // alone turns them into an account — no second address to type.
  password: '',
  department: 'General Medicine',
  specialization: '',
  doctorType: 'Consultant',
  currentRoom: 'Cabin 1',
  averageCheckupTime: 10,
  dailyTokenLimit: 0,
  // The half a patient reads on the landing page. All optional — every key is
  // present so the inputs stay controlled, and blanks are omitted from the
  // public page rather than rendered as empty rows.
  qualification: '',
  experienceYears: '',
  registrationNumber: '',
  consultationFee: '',
  opdDays: [],
  opdHours: '',
  languages: [],
  photoUrl: '',
  about: ''
});
const blankLab = () => ({ name: '', loginEmail: '', password: '' });
const blankPharmacy = () => ({
  name: '',
  counterNumber: 'Pharmacy Counter',
  loginEmail: '',
  password: ''
});

export default function SuperAdminPortal() {
  const navigate = useNavigate();

  // Secret passcode to restrict dynamic registration.
  //
  // Starts empty. This used to be pre-filled with the passcode that was also the
  // backend's fallback, which meant the real key to platform-wide facility
  // creation shipped inside the public JavaScript bundle — readable by anyone
  // who opened the page, whatever the server was configured with.
  const [adminSecret, setAdminSecret] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');

  // Hospital states
  const [hospId, setHospId] = useState('');
  const [name, setName] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [galleryImagesStr, setGalleryImagesStr] = useState('');
  const [doctorCount, setDoctorCount] = useState<any>(1);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [city, setCity] = useState('');
  const [regState, setRegState] = useState('');
  const [district, setDistrict] = useState('');
  const [lat, setLat] = useState('28.6139');
  const [lng, setLng] = useState('77.2090');
  const [type, setType] = useState('Hospital');

  // Personnel is onboarded as four uniform, repeatable lists — a facility rarely
  // has exactly one of anything. Previously only ONE reception account could be
  // created at registration, so a hospital running three counters had to go back
  // into the "add account" tab twice for something the admin already knew.
  const [staffRows, setStaffRows] = useState([blankStaff()]);
  const [doctorRows, setDoctorRows] = useState([blankDoctor()]);
  const [labRows, setLabRows] = useState([blankLab()]);
  const [pharmacyRows, setPharmacyRows] = useState([]);

  // Onboarding vocabulary, refreshed from the API on unlock (falls back to the
  // constants above if the call fails, so the form always renders).
  const [facilityTypes, setFacilityTypes] = useState(FACILITY_TYPES);
  const [doctorTypes, setDoctorTypes] = useState(DOCTOR_TYPES);

  /** Update one field of one row in any of the four personnel lists. */
  const patchRow = (setRows, index, field, value) =>
    setRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const fieldCls =
    'w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all';

  // Tab & account registration states
  const [activeTab, setActiveTab] = useState('hospital'); // 'hospital' or 'accounts'
  const [accountType, setAccountType] = useState('doctor'); // 'doctor', 'staff', 'lab'
  const [hospitalList, setHospitalList] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');

  // The facility's one credential, set at onboarding. Everyone at the facility
  // signs in with it; there are no per-role passwords to hand out any more.
  const [facilityPassword, setFacilityPassword] = useState('');

  // Which facilities can actually be signed into, keyed by facility id. A
  // facility onboarded before single sign-in has no credential and is therefore
  // unreachable by its own staff — invisible from every other screen, so the
  // owner console is where it has to be surfaced.
  const [credentialStatus, setCredentialStatus] = useState({});
  const [resetPasswordFor, setResetPasswordFor] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  // Adding one more person to an existing facility.
  const [addName, setAddName] = useState('');
  const [addCounterNumber, setAddCounterNumber] = useState('Reception Counter 1');
  const [addEmail, setAddEmail] = useState('');
  const [addDepartment, setAddDepartment] = useState('General Medicine');
  const [addRoom, setAddRoom] = useState('Cabin 101');
  const [addSpecialization, setAddSpecialization] = useState('General Consultation');
  const [addAverageCheckupTime, setAddAverageCheckupTime] = useState<any>(10);
  const [addDoctorType, setAddDoctorType] = useState('Consultant');
  // Public profile for the doctor being added to an existing facility, and for
  // the one currently being edited in the personnel console.
  const [addProfile, setAddProfile] = useState(blankDoctorProfile());
  const [editingDoctorId, setEditingDoctorId] = useState('');
  const [editingDoctorProfile, setEditingDoctorProfile] = useState(blankDoctorProfile());
  const [addDailyTokenLimit, setAddDailyTokenLimit] = useState<any>(0);

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
  const [editDoctorCount, setEditDoctorCount] = useState<any>(1);
  const [editDescription, setEditDescription] = useState('');
  const [editWelcomeMessage, setEditWelcomeMessage] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('#0d9488');
  const [editSecondaryColor, setEditSecondaryColor] = useState('#0f172a');

  // Clinic Specializations & Custom Services
  const [clinicSubtype, setClinicSubtype] = useState('General');
  const [customServices, setCustomServices] = useState([
    {
      title: 'General Checkup',
      description: 'Comprehensive routine medical examination and health check.',
      icon: 'local_hospital'
    }
  ]);
  const [features, setFeatures] = useState([
    'Skilled & Professional Team',
    'Advanced Health Diagnostics',
    'Convenient Real-time Queues'
  ]);

  const [editClinicSubtype, setEditClinicSubtype] = useState('General');
  const [editCustomServices, setEditCustomServices] = useState([]);
  const [editFeatures, setEditFeatures] = useState([]);

  // Sub-facility and Directory filter states
  const [parentHospital, setParentHospital] = useState('');

  const [editParentHospital, setEditParentHospital] = useState('');

  // Which units the facility runs, and what its public landing page says. Both
  // are edited through the shared <ModuleGrid> / <LandingEditor> so onboarding
  // and editing can never drift apart. The catalogue is refreshed from the API
  // on unlock; the fallbacks keep the form usable if that call fails.
  const [moduleCatalogue, setModuleCatalogue] = useState(FALLBACK_MODULES);
  const [landingTemplates, setLandingTemplates] = useState(FALLBACK_TEMPLATES);
  const [modules, setModules] = useState(() => modulesFrom(FALLBACK_MODULES, 'Hospital'));
  const [landing, setLanding] = useState(blankLanding());
  const [editModules, setEditModules] = useState({});
  const [editLanding, setEditLanding] = useState(blankLanding());

  const [facilityFilterType, setFacilityFilterType] = useState('All');
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');

  const [facilityPersonnel, setFacilityPersonnel] = useState({
    doctors: [],
    staff: [],
    labAssistants: [],
    pharmacists: [],
    patients: []
  });
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

  /**
   * Give an already-registered doctor a public profile.
   *
   * Without this, only doctors created after this feature shipped could ever
   * appear properly on the landing page — every facility already on the
   * platform would show a wall of bare names with no way to fix it.
   */
  const handleSaveDoctorProfile = async (docId) => {
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/doctor/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify(editingDoctorProfile)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update the doctor profile');
      setSuccessMsg('Doctor profile updated — it is live on the landing page.');
      setEditingDoctorId('');
      fetchFacilityPersonnel(editHospId);
    } catch (err) {
      setError(err.message);
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

  const handleDeletePharmacist = async (pharmId) => {
    if (!window.confirm('Delete this pharmacy / medical account permanently?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/pharmacist/${pharmId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Pharmacy account deleted successfully!');
        fetchFacilityPersonnel(editHospId);
      } else {
        setError(data.message || 'Failed to delete pharmacy account');
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
    const hosp = hospitalList.find((h) => h.id === selectedId);
    if (hosp) {
      setEditName(hosp.name);
      setEditType(hosp.type || 'Hospital');
      setEditCity(hosp.city || '');
      setEditLat(hosp.coordinates?.lat || 28.6139);
      setEditLng(hosp.coordinates?.lng || 77.209);
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
      // A facility onboarded before a module existed simply has no entry for it;
      // modulesFrom() merges what it stored over the current catalogue so the new
      // unit appears switched off instead of missing from the form.
      setEditModules(modulesFrom(moduleCatalogue, hosp.type || 'Hospital', hosp.modules));
      setEditLanding(landingFrom(hosp.landing));
    }
  };

  /** Same type-change reshaping as the register form, for the edit modal. */
  const handleEditTypeChange = (nextType) => {
    setEditType(nextType);
    setEditModules((prev) => modulesFrom(moduleCatalogue, nextType, prev));
  };

  const handleDeleteHospital = async (hospIdToDelete) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete facility '${hospIdToDelete}' and all its doctors, staff, and queues? This action cannot be undone.`
      )
    ) {
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
    if (
      !window.confirm(
        'Are you sure you want to PERMANENTLY CLEAR ALL DEMO DATA (all sample hospitals, doctors, staff, queues, and tokens)? This action cannot be undone.'
      )
    ) {
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
      // The admin panel's own endpoint, because this is the one screen that
      // edits the whole record — module map, landing content, colours. The
      // public list is slim on purpose so directory cards and sign-in
      // dropdowns do not download every facility's landing copy.
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospitals`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setHospitalList(data);
        if (data.length > 0) {
          setSelectedHospital(data[0].id);
        }
      }

      // Which of them can actually be signed into. A facility with no password
      // looks completely healthy on every other screen — it has a name, a page,
      // doctors — right up until its staff try to sign in and cannot.
      const credRes = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/facility-credentials`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const creds = await credRes.json();
      if (credRes.ok && creds && typeof creds === 'object') setCredentialStatus(creds);
    } catch (err) {
      console.error('Error fetching hospitals:', err);
    }
  };

  /**
   * Set or reset one facility's password.
   *
   * The only way a facility becomes signable — onboarding uses the same code
   * path on the server. Resetting takes effect for everyone at that facility on
   * their next sign-in; sessions already open keep working until they expire,
   * which beats cutting a console off mid-consultation.
   */
  const handleSetFacilityPassword = async (hospitalId) => {
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/v1/auth/super-admin/hospital/${encodeURIComponent(hospitalId)}/password`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
          body: JSON.stringify({ password: resetPassword })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not set the facility password');
      setSuccessMsg(data.message);
      setResetPassword('');
      setResetPasswordFor('');
      fetchHospitals();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      loadOnboardingVocabulary();
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setAuthError(
          'Unable to connect to the server. Please ensure the backend is running on ' +
            BACKEND_URL +
            ' or check your network connection.'
        );
      } else {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSlug = (val) => {
    setName(val);
    const slugified = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setHospId(slugified);
  };

  /** Facility types + doctor types straight from the API that validates them. */
  const loadOnboardingVocabulary = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/facility-types`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.facilityTypes) && data.facilityTypes.length) {
        // Keep the local icon/blurb for each known type; the API is the authority
        // on which accounts a type requires and offers.
        setFacilityTypes(
          data.facilityTypes.map((t) => {
            const local = FACILITY_TYPES.find((f) => f.name === t.name);
            return { icon: 'domain', blurb: '', ...local, ...t };
          })
        );
      }
      if (Array.isArray(data.doctorTypes) && data.doctorTypes.length) setDoctorTypes(data.doctorTypes);
      // The module catalogue drives the whole "what does this facility have?"
      // grid, so a unit added on the backend shows up here without a release.
      if (Array.isArray(data.modules) && data.modules.length) {
        setModuleCatalogue(data.modules);
        setModules((prev) => modulesFrom(data.modules, type, prev));
      }
      if (Array.isArray(data.landingTemplates) && data.landingTemplates.length) {
        setLandingTemplates(data.landingTemplates);
      }
    } catch (err) {
      console.error('Could not load facility type rules, using built-in defaults:', err);
    }
  };

  /** The rules for the facility type currently selected in the form. */
  const activeType = facilityTypes.find((t) => t.name === type) || facilityTypes[0];

  /**
   * Changing what you are registering re-shapes the module grid: a Clinic loses
   * the ICU-beds question a Hospital had, a Lab loses the pharmacy counter.
   * Answers to modules that survive the change are carried over, so switching
   * type by mistake does not wipe what has already been filled in.
   */
  const handleTypeChange = (nextType) => {
    setType(nextType);
    setModules((prev) => modulesFrom(moduleCatalogue, nextType, prev));
  };

  /** Is this unit switched on in the module grid? */
  const moduleOn = (key) => Boolean(modules[key] && modules[key].enabled);

  /**
   * Does this facility type use this kind of account? Lab and pharmacy accounts
   * follow the module checkbox — a clinic that sends its blood work out should
   * never be asked to create a lab login, and ticking "Pathology Lab" is what
   * makes the lab account section appear. One decision, not two that can
   * disagree.
   */
  const sectionApplies = (kind) => {
    if (!activeType || !(activeType.offers || []).includes(kind)) return false;
    // Each account section follows the module that implies it, so ticking
    // "Reception / Front Desk" is what asks for counter logins and ticking
    // "OPD / Doctor Consultation" is what asks for doctors. The module the type
    // *requires* is locked on, so a section can never disappear and leave a
    // tenant with no way in.
    const MODULE_FOR_ACCOUNT = { staff: 'staffDesk', doctors: 'opd', lab: 'lab', pharmacy: 'pharmacy' };
    const moduleKey = MODULE_FOR_ACCOUNT[kind];
    return moduleKey ? moduleOn(moduleKey) : true;
  };

  // A blank row left at the bottom of a list is not a half-filled person.
  // Nobody in these lists carries a credential any more — the facility password
  // is the only one — so a row counts as filled once it has the field that
  // identifies it: a name, or for a doctor the email that keys their cabin.
  const filledStaff = staffRows.filter((s) => s.name);
  const filledDoctors = doctorRows.filter((d) => d.email);
  const filledLabs = labRows.filter((l) => l.name);
  const filledPharmacy = pharmacyRows.filter((p) => p.name);
  const filledCount = {
    staff: sectionApplies('staff') ? filledStaff.length : 0,
    doctors: sectionApplies('doctors') ? filledDoctors.length : 0,
    lab: sectionApplies('lab') ? filledLabs.length : 0,
    pharmacy: sectionApplies('pharmacy') ? filledPharmacy.length : 0
  };
  const missingRequired = (activeType?.requires || []).filter((kind) => filledCount[kind] === 0);

  // What the owner needs to know before reading anything else on this screen.
  const signable = hospitalList.filter((h) => credentialStatus[h.id]).length;
  const locked = hospitalList.length - signable;
  const platformStats = [
    {
      label: 'Facilities',
      value: hospitalList.length,
      hint: 'onboarded on this platform'
    },
    {
      label: 'Can sign in',
      value: signable,
      hint: 'have a facility password'
    },
    {
      label: 'Locked out',
      value: locked,
      hint: locked ? 'need a password set' : 'every facility is reachable',
      alert: locked > 0
    },
    {
      label: 'Cities',
      value: new Set(hospitalList.map((h) => h.city).filter(Boolean)).size,
      hint: 'covered by the directory'
    }
  ];

  // Departments to suggest for this facility: the subtype's own first (a dental
  // clinic should not have to scroll past Cardiology), then the rest of the ones
  // smart triage recognises. Free text is still accepted.
  const departmentOptions = [
    ...(type === 'Clinic' ? SUBTYPE_DEPARTMENTS[clinicSubtype] || [] : []),
    ...KNOWN_DEPARTMENTS
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // What used to block here was "this facility type needs an account of kind
    // X". That check existed because each account was a login, so a Lab with no
    // lab account was a tenant nobody could sign into. The facility password
    // below is what makes it signable now, and a hospital is routinely onboarded
    // days before its doctors are entered — so the roster is a nudge above, not
    // a gate here.
    if (!facilityPassword) {
      setError('Set a facility password below — it is the only credential this facility will have.');
      return;
    }

    setLoading(true);

    const parsedGalleryImages = galleryImagesStr
      ? galleryImagesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : coverImage
        ? [coverImage]
        : [];

    const payload: any = {
      id: hospId,
      name,
      slug: hospId,
      address,
      phone,
      whatsappNumber,
      coverImage:
        coverImage ||
        'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      logoUrl: logoUrl || '',
      galleryImages: parsedGalleryImages,
      doctorCount: parseInt(doctorCount as any) || 1,
      description,
      city,
      state: regState,
      district,
      coordinates: {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      },
      type,
      // The one credential for this facility. Validated on the server too, and
      // there is no fallback if it is absent — a default password set at
      // onboarding is a default password forever.
      password: facilityPassword,
      parentHospital: parentHospital || null,
      // The module grid is the single source of truth for which units exist;
      // the two legacy booleans the rest of the app reads are derived from it
      // here (and again on the server) so they can never contradict it.
      modules,
      hasInternalLab: moduleOn('lab'),
      hasInternalPharmacy: moduleOn('pharmacy'),
      landing,
      clinicSubtype,
      customServices,
      features,
      // Only the sections this facility type actually offers are sent, and only
      // the rows the admin actually filled in. These are people, not accounts:
      // names, cabins and counters.
      staffMembers: sectionApplies('staff') ? filledStaff : [],
      doctors: sectionApplies('doctors') ? filledDoctors : [],
      labAssistants: sectionApplies('lab') ? filledLabs : [],
      pharmacists: sectionApplies('pharmacy') ? filledPharmacy : []
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
        setError(
          'Unable to connect to the server. Please ensure the backend is running on ' +
            BACKEND_URL +
            ' or check your network connection.'
        );
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

    // One endpoint for all four kinds. There used to be four — register-staff,
    // register-doctor, register-lab, register-pharmacist — because each created
    // a login account with its own username and password. With no personal
    // credentials left, the only difference between them is which list the
    // person joins.
    const payload: any = {
      kind: accountType,
      hospital: selectedHospital,
      name: addName
    };

    if (accountType === 'doctor') {
      payload.email = addEmail;
      payload.department = addDepartment;
      payload.currentRoom = addRoom;
      payload.specialization = addSpecialization;
      payload.averageCheckupTime = addAverageCheckupTime;
      payload.doctorType = addDoctorType;
      payload.dailyTokenLimit = addDailyTokenLimit;
      Object.assign(payload, addProfile);
    } else if (accountType === 'staff' || accountType === 'pharmacy') {
      payload.counterNumber = addCounterNumber;
    }

    const url = `${BACKEND_URL}/api/v1/auth/super-admin/facility/${encodeURIComponent(selectedHospital)}/people`;

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
      setAddEmail('');
    } catch (err) {
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setError(
          'Unable to connect to the server. Please ensure the backend is running or check your network connection.'
        );
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
      ? editGalleryImagesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : editCoverImage
        ? [editCoverImage]
        : [];

    const payload = {
      name: editName,
      slug: editHospId,
      address: editAddress,
      phone: editPhone,
      whatsappNumber: editWhatsapp,
      coverImage: editCoverImage,
      logoUrl: editLogoUrl,
      galleryImages: parsedEditGalleryImages,
      doctorCount: parseInt(editDoctorCount as any) || 1,
      description: editDescription,
      city: editCity,
      coordinates: {
        lat: parseFloat(editLat),
        lng: parseFloat(editLng)
      },
      type: editType,
      parentHospital: editParentHospital || null,
      modules: editModules,
      landing: editLanding,
      // Derived from the module grid, same as onboarding — the server re-derives
      // them too, so these two can never drift from the checkboxes.
      hasInternalLab: Boolean((editModules as any).lab && (editModules as any).lab.enabled),
      hasInternalPharmacy: Boolean((editModules as any).pharmacy && (editModules as any).pharmacy.enabled),
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
        setError(
          'Unable to connect to the server. Please ensure the backend is running or check your network connection.'
        );
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
              <label className="block text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                Admin Secret Passcode
              </label>
              <input
                type="password"
                // The placeholder used to spell the passcode out. A hint that
                // contains the secret is the secret, printed on the login screen.
                placeholder="Enter the platform admin passcode"
                autoComplete="off"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
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

  const filteredHospitals = hospitalList.filter((h) => {
    const matchesSearch =
      !facilitySearchQuery ||
      h.name.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
      h.city.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
      h.id.toLowerCase().includes(facilitySearchQuery.toLowerCase());

    if (facilityFilterType === 'All') return matchesSearch;
    return matchesSearch && h.type === facilityFilterType;
  });

  return (
    // Upload credentials, supplied once for every editor on this screen.
    // `editHospId` when a facility is open for editing, otherwise the id being
    // typed into the onboarding form — only one of the two is ever in use, and
    // the id is known before the facility is saved because the admin types it.
    <UploadCredentialsProvider value={{ adminSecret, hospitalId: editHospId || hospId, token: '' }}>
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
            <div className="inline-flex items-center space-x-2 bg-[var(--tertiary-color)]/10 border border-[var(--tertiary-color)]/20 text-[var(--tertiary-color)] px-3 py-1 rounded-full text-[12px] font-black uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              <span>Super Admin Engine</span>
            </div>
          </div>

          {/* Master Facility Quick Selector & Multi-Tenancy Directory Bar */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-5 shadow-sm space-y-4 text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-color)]/20 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-[20px] text-[var(--primary-color)]">
                    domain_add
                  </span>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-color)]">
                    Master Multi-Facility Directory ({hospitalList.length} Registered)
                  </h3>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                  Select any registered hospital, clinic, lab or medical store from the list below to
                  instantly edit or manage accounts.
                </p>
              </div>

              {/* Quick Top Dropdown Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap">
                  Select to Edit:
                </span>
                <select
                  value={editHospId}
                  onChange={(e) => {
                    handleSelectHospitalToEdit(e.target.value);
                    setActiveTab('edit');
                  }}
                  className="bg-[var(--bg-color)] border border-[var(--primary-color)]/60 text-[var(--primary-color)] font-extrabold rounded-xl px-3 py-1.5 outline-none text-xs cursor-pointer shadow-sm"
                >
                  <option value="">-- Choose Facility --</option>
                  {hospitalList.map((h) => (
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
                {['All', 'Hospital', 'Clinic', 'Lab', 'Medical', 'Government Hospital', 'Government Lab'].map(
                  (ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setFacilityFilterType(ft)}
                      className={`px-3 py-1 rounded-lg text-[12px] font-black uppercase tracking-wider transition-all ${
                        facilityFilterType === ft
                          ? 'bg-[var(--primary-color)] text-white shadow-sm'
                          : 'bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                      }`}
                    >
                      {ft}
                    </button>
                  )
                )}
              </div>

              <input
                type="text"
                placeholder="🔍 Search facility by name or city..."
                value={facilitySearchQuery}
                onChange={(e) => setFacilitySearchQuery(e.target.value)}
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
                filteredHospitals.map((h) => (
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
                        <span className="px-2 py-0.5 bg-[var(--primary-color)]/10 text-[var(--primary-color)] text-[11px] font-black rounded-md uppercase tracking-wider">
                          {h.type || 'Hospital'}
                        </span>
                        <span className="text-[12px] font-bold text-[var(--text-secondary)]">
                          👨‍⚕️ {h.doctorCount || 1} Dr(s)
                        </span>
                      </div>

                      <h4 className="font-extrabold text-xs text-[var(--text-color)] mt-1.5 line-clamp-1">
                        {h.name}
                      </h4>
                      <p className="text-[12px] text-[var(--text-secondary)] font-semibold">
                        📍 {h.city} • ID:{' '}
                        <span className="font-mono text-[var(--primary-color)]">{h.id}</span>
                      </p>

                      {h.parentHospital && (
                        <p className="text-[11px] text-[var(--tertiary-color)] font-bold mt-1">
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
                        className="flex-1 py-1 bg-[var(--primary-color)] hover:bg-[var(--primary-color)]/90 text-white rounded-lg text-[12px] font-black transition-all text-center"
                      >
                        Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHospital(h.id);
                          setActiveTab('accounts');
                        }}
                        className="px-2 py-1 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-color)] hover:bg-[var(--border-color)]/20 rounded-lg text-[12px] font-black transition-all"
                      >
                        + Accs
                      </button>
                      {/* The facility's generated public website, one click away —
                        the fastest way to see what a profile edit actually did. */}
                      <a
                        href={`/h/${h.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--primary-color)] rounded-lg transition-all flex items-center"
                        title="Open public landing page"
                      >
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteHospital(h.id)}
                        className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-[12px] transition-all"
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
              onClick={() => {
                setActiveTab('hospital');
                setError('');
                setSuccessMsg('');
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'hospital'
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
              }`}
            >
              Onboard New Hospital
            </button>
            <button
              onClick={() => {
                setActiveTab('accounts');
                setError('');
                setSuccessMsg('');
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'accounts'
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
              }`}
            >
              Register More Accounts
            </button>
            <button
              onClick={() => {
                setActiveTab('edit');
                setError('');
                setSuccessMsg('');
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'edit'
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
              }`}
            >
              Edit Facilities
            </button>
            <button
              onClick={() => {
                setActiveTab('licenses');
                setError('');
                setSuccessMsg('');
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'licenses'
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--border-color)]/20'
              }`}
            >
              Licences
            </button>
            <button
              onClick={() => {
                setActiveTab('whatsapp');
                setError('');
                setSuccessMsg('');
              }}
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

          {/* The platform at a glance.
              Facility count alone says nothing about whether the platform is
              working. The number that matters is how many facilities can
              actually be signed into — a facility without a password is fully
              onboarded and completely unusable, and that gap is invisible on
              every other screen. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {platformStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border p-4 ${
                  stat.alert
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-[var(--border-color)]/30 bg-[var(--card-bg)]'
                }`}
              >
                <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-secondary)]">
                  {stat.label}
                </p>
                <p
                  className={`text-2xl font-black mt-1 ${
                    stat.alert ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-color)]'
                  }`}
                >
                  {stat.value}
                </p>
                <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">{stat.hint}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 md:p-8 shadow-[var(--card-shadow)] space-y-8">
            <div className="border-b border-[var(--border-color)]/30 pb-4">
              <h2 className="text-2xl font-black tracking-tight">
                {activeTab === 'hospital'
                  ? 'Onboard Medical Facility'
                  : activeTab === 'accounts'
                    ? 'Register Additional Accounts'
                    : 'Edit Medical Facility Profile'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] font-semibold mt-1">
                {activeTab === 'hospital'
                  ? 'Register a new hospital, clinic, lab or government health dispensary to the B2B SaaS directory.'
                  : activeTab === 'accounts'
                    ? 'Register more doctors, receptionists, or lab assistants to an existing medical facility.'
                    : 'Modify and customize addresses, cover banners, logos, messages, and theme colors of a registered facility.'}
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
                <span className="material-symbols-outlined text-[48px] text-[var(--tertiary-color)] animate-bounce">
                  check_circle
                </span>
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
                        // Credentials must never carry over to the next facility —
                        // reset the personnel lists to a single empty row each.
                        setStaffRows([blankStaff()]);
                        setDoctorRows([blankDoctor()]);
                        setLabRows([blankLab()]);
                        setPharmacyRows([]);
                        // Landing copy is facility-specific — carrying the last
                        // hospital's headline into the next one is worse than blank.
                        setLanding(blankLanding());
                        setModules(modulesFrom(moduleCatalogue, type));
                      }
                    }}
                    className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--border-color)]/25 rounded-xl font-black transition-all"
                  >
                    {activeTab === 'hospital' ? 'Onboard Another' : 'Register Another'}
                  </button>
                  {activeTab === 'hospital' && (
                    <>
                      <button
                        onClick={() => navigate(`/h/${hospId}`)}
                        className="px-4 py-2 bg-[var(--primary-color)] hover:opacity-90 text-white rounded-xl font-black transition-all shadow-md"
                      >
                        View Landing Page
                      </button>
                      <button
                        onClick={() => navigate(`/hospital/${hospId}`)}
                        className="px-4 py-2 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white rounded-xl font-black transition-all transition-all-custom shadow-md"
                      >
                        Visit Patient Portal
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : activeTab === 'hospital' ? (
              <form
                onSubmit={handleRegister}
                className="space-y-8 text-xs font-bold text-[var(--text-secondary)]"
              >
                {/* SECTION A: Hospital Configuration */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      domain
                    </span>
                    <span>1. Facility Core Profile</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1">Service Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. City Health Clinic"
                        value={name}
                        onChange={(e) => handleAutoSlug(e.target.value)}
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
                        onChange={(e) => setHospId(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* WHAT KIND of facility this is — the first real decision, and the
                    one that decides which accounts the rest of this form asks for. */}
                  <div>
                    <label className="block mb-2">What are you registering? *</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {facilityTypes.map((ft) => {
                        const selected = type === ft.name;
                        return (
                          <button
                            key={ft.name}
                            type="button"
                            onClick={() => handleTypeChange(ft.name)}
                            className={`text-left p-3 rounded-xl border transition-all ${
                              selected
                                ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] shadow-sm'
                                : 'bg-[var(--bg-color)] border-[var(--border-color)]/50 hover:border-[var(--primary-color)]/50'
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined text-[20px] ${
                                selected ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary)]'
                              }`}
                            >
                              {ft.icon || 'domain'}
                            </span>
                            <p
                              className={`text-[11px] font-black mt-0.5 ${
                                selected ? 'text-[var(--primary-color)]' : 'text-[var(--text-color)]'
                              }`}
                            >
                              {ft.name}
                            </p>
                            <p className="text-[12px] text-[var(--text-secondary)] font-medium leading-tight mt-0.5">
                              {ft.blurb}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] font-semibold mt-2">
                      A {type} is set up with{' '}
                      <span className="font-black text-[var(--primary-color)]">
                        {(activeType?.offers || []).map((k) => SECTION_LABEL[k]).join(', ')}
                      </span>{' '}
                      accounts
                      {(activeType?.requires || []).length > 0 && (
                        <>
                          {' '}
                          — at least one{' '}
                          <span className="font-black">
                            {(activeType.requires || []).map((k) => SECTION_LABEL[k]).join(' and one ')}
                          </span>{' '}
                          account is required.
                        </>
                      )}
                    </p>
                  </div>

                  <div
                    className={`grid grid-cols-1 ${type === 'Clinic' || type === 'Medical' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}
                  >
                    {type === 'Clinic' && (
                      <div>
                        <label className="block mb-1">Clinic Subtype *</label>
                        <select
                          value={clinicSubtype}
                          onChange={(e) => setClinicSubtype(e.target.value)}
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
                          onChange={(e) => setClinicSubtype(e.target.value)}
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
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    {/* State & District power the patient-facing State → District facility finder */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1">State</label>
                        <input
                          type="text"
                          placeholder="e.g. Delhi"
                          value={regState}
                          onChange={(e) => setRegState(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                      <div>
                        <label className="block mb-1">District</label>
                        <input
                          type="text"
                          placeholder="e.g. New Delhi"
                          value={district}
                          onChange={(e) => setDistrict(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1">Latitude *</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={lat}
                          onChange={(e) => setLat(e.target.value)}
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
                          onChange={(e) => setLng(e.target.value)}
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
                        onChange={(e) => setPhone(e.target.value)}
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
                        onChange={(e) => setWhatsappNumber(e.target.value)}
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
                        onChange={(e) => setDoctorCount(e.target.value)}
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
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>

                  {/* Branding is uploaded here, at registration, rather than left
                      for a later visit to the profile editor. The photos are on the
                      administrator's phone, not on a web server, so a URL box is a
                      field they cannot fill — and a facility that launches on the
                      stock cover image usually keeps it. Each upload is signed for
                      this facility's folder alone, which is why the Facility ID
                      above has to exist before the picker opens. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ImageUploadField
                      label="Facility logo (optional)"
                      purpose="logo"
                      hospitalId={hospId}
                      value={logoUrl}
                      onChange={setLogoUrl}
                      hint="Square images look best. Shown in the header and on the public page."
                    />
                    <ImageUploadField
                      label="Cover image (optional)"
                      purpose="hero"
                      hospitalId={hospId}
                      value={coverImage}
                      onChange={setCoverImage}
                      hint="The wide banner at the top of the facility's public page."
                    />
                  </div>

                  <div>
                    <label className="block mb-1">Gallery photos (optional)</label>
                    <GalleryUploader
                      hospitalId={hospId}
                      value={
                        galleryImagesStr
                          ? galleryImagesStr
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : []
                      }
                      onChange={(list) => setGalleryImagesStr(list.join(', '))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30">
                    <div>
                      <label className="block mb-1 font-bold text-[var(--text-color)]">
                        Parent Hospital (If Sub-facility)
                      </label>
                      <select
                        value={parentHospital}
                        onChange={(e) => setParentHospital(e.target.value)}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="">-- None (Standalone Facility) --</option>
                        {hospitalList
                          .filter((h) => h.type === 'Hospital' || h.type === 'Government Hospital')
                          .map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} ({h.id})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 flex items-center text-[11px] font-semibold text-[var(--text-secondary)] leading-relaxed pt-2">
                      Units like the lab and pharmacy are configured in step 2 below — ticking one there is
                      what creates its login section and its card on the public page.
                    </div>
                  </div>
                </div>

                {/* SECTION A.2: What this facility actually HAS. Everything is a
                  checkbox; ticking one asks for exactly that unit's details and
                  nothing else, and lab/pharmacy also decide whether the matching
                  account section appears further down. */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      checklist
                    </span>
                    <span>2. Units &amp; Services this {type} runs</span>
                  </h3>
                  <ModuleGrid
                    catalogue={moduleCatalogue}
                    type={type}
                    value={modules}
                    onChange={setModules}
                    idPrefix="new"
                    requiredKinds={activeType?.requires || []}
                  />
                </div>

                {/* SECTION A.5: Landing Page custom content */}
                <div className="space-y-4 bg-[var(--bg-color)]/20 p-5 rounded-2xl border border-[var(--border-color)]/30">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      style
                    </span>
                    <span>3. Public landing page — {hospId ? `/h/${hospId}` : 'auto-generated'}</span>
                  </h3>

                  {/* Services List */}
                  <div className="space-y-3 bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">
                        Landing Page Services & Specialties
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomServices((prev) => [
                            ...prev,
                            { title: '', description: '', icon: 'local_hospital' }
                          ])
                        }
                        className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[12px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                      >
                        + Add Service
                      </button>
                    </div>
                    {customServices.map((srv, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-[var(--border-color)]/20 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="md:col-span-3">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Service Title
                          </label>
                          <input
                            type="text"
                            value={srv.title}
                            placeholder="e.g. Cosmetic Dentistry"
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, title: val } : s))
                              );
                            }}
                            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                            required
                          />
                        </div>
                        <div className="md:col-span-5">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Description
                          </label>
                          <input
                            type="text"
                            value={srv.description}
                            placeholder="e.g. Veneers, bonding, and teeth whitening treatments."
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, description: val } : s))
                              );
                            }}
                            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                            required
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Material Icon Name
                          </label>
                          <select
                            value={srv.icon}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, icon: val } : s))
                              );
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
                            onClick={() => setCustomServices((prev) => prev.filter((_, i) => i !== idx))}
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
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">
                        Clinic Features (Why Choose Us)
                      </span>
                      <button
                        type="button"
                        onClick={() => setFeatures((prev) => [...prev, ''])}
                        className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[12px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
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
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeatures((prev) => prev.map((f, i) => (i === idx ? val : f)));
                          }}
                          className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setFeatures((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg flex items-center justify-center transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* The rest of the generated website. Every field optional —
                    whatever is left blank the template writes for them, so this
                    whole block can be skipped and the facility still gets a
                    complete page at /h/{slug}. */}
                  <LandingEditor
                    value={landing}
                    onChange={setLanding}
                    templates={landingTemplates}
                    facilityName={name}
                  />
                </div>

                {/* SECTIONS 2-5: PERSONNEL.
                  Which of these appear is decided by the facility type chosen
                  above — a pathology lab is never asked for doctors, a medical
                  store is never asked for a lab bench. Every list is repeatable
                  because real facilities run several counters and several
                  doctors, and the admin already knows all of them at onboarding
                  time; making them come back later to the "add account" tab was
                  busywork. Blank rows are ignored on submit. */}

                {sectionApplies('staff') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                        verified_user
                      </span>
                      <span>Reception / front desk ({filledStaff.length})</span>
                      {(activeType?.requires || []).includes('staff') && (
                        <span className="text-[11px] font-black uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                      Who works the front desk. Email and password are optional — leave them blank and this
                      person signs in with the facility password; fill them in and they get their own login
                      that opens reception only.
                    </p>

                    {staffRows.map((s, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-9 gap-2 items-center">
                        <input
                          placeholder="Full name *"
                          value={s.name}
                          onChange={(e) => patchRow(setStaffRows, i, 'name', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <input
                          placeholder="Counter name"
                          value={s.counterNumber}
                          onChange={(e) => patchRow(setStaffRows, i, 'counterNumber', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <button
                          type="button"
                          title="Remove this reception account"
                          disabled={staffRows.length === 1}
                          onClick={() => setStaffRows((p) => p.filter((_, idx) => idx !== i))}
                          className="px-2.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 disabled:opacity-30 font-black text-xs"
                        >
                          ×
                        </button>
                        <input
                          type="email"
                          placeholder="Their login email (optional)"
                          value={s.loginEmail}
                          onChange={(e) => patchRow(setStaffRows, i, 'loginEmail', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <input
                          type="text"
                          placeholder="Their password (optional)"
                          value={s.password}
                          onChange={(e) => patchRow(setStaffRows, i, 'password', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <span />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStaffRows((p) => [...p, blankStaff()])}
                      className="text-[11px] font-black text-[var(--primary-color)] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span> Add another
                      reception counter
                    </button>
                  </div>
                )}

                {sectionApplies('doctors') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                        stethoscope
                      </span>
                      <span>Doctors ({filledDoctors.length})</span>
                      {(activeType?.requires || []).includes('doctors') && (
                        <span className="text-[11px] font-black uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                      Department drives symptom auto-routing, so prefer a listed one. Doctor type records what
                      this doctor is at the facility; the daily token limit caps their OPD (0 = unlimited,
                      emergencies always bypass it).
                    </p>

                    {/* Departments smart triage recognises — free text is still allowed. */}
                    <datalist id="known-departments">
                      {departmentOptions.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>

                    {doctorRows.map((d, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-[var(--border-color)]/40 bg-[var(--bg-color)]/40 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                            Doctor {i + 1}
                            {d.name ? ` — ${d.name}` : ''}
                          </span>
                          <button
                            type="button"
                            disabled={doctorRows.length === 1}
                            onClick={() => setDoctorRows((p) => p.filter((_, idx) => idx !== i))}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 disabled:opacity-30 font-black text-[12px]"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            placeholder="Full name"
                            value={d.name}
                            onChange={(e) => patchRow(setDoctorRows, i, 'name', e.target.value)}
                            className={fieldCls}
                          />
                          {/* A doctor's email is their unique handle within the
                              facility, so it is the field the whole
                              duplicate-record bug was about. Lower-cased as it
                              is typed, which means what the admin sees here is
                              exactly what the unique index will compare. */}
                          <EmailInput
                            placeholder="Email *"
                            value={d.email}
                            onChange={(email) => patchRow(setDoctorRows, i, 'email', email)}
                            className={fieldCls}
                          />
                          {/* Optional. Set it and this doctor signs in with the
                              email above and lands straight in their own cabin —
                              no roster, no chance of running a colleague's. Left
                              blank they are reached through the facility
                              password exactly as before. */}
                          <input
                            type="text"
                            placeholder="Their password (optional)"
                            value={d.password}
                            onChange={(e) => patchRow(setDoctorRows, i, 'password', e.target.value)}
                            className={fieldCls}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <label className="block mb-1 text-[12px]">Department</label>
                            <input
                              list="known-departments"
                              placeholder="e.g. Cardiology"
                              value={d.department}
                              onChange={(e) => patchRow(setDoctorRows, i, 'department', e.target.value)}
                              className={fieldCls}
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-[12px]">Doctor type</label>
                            <select
                              value={d.doctorType}
                              onChange={(e) => patchRow(setDoctorRows, i, 'doctorType', e.target.value)}
                              className={`${fieldCls} cursor-pointer font-bold`}
                            >
                              {doctorTypes.map((dt) => (
                                <option key={dt} value={dt}>
                                  {dt}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block mb-1 text-[12px]">Specialization</label>
                            <input
                              placeholder="e.g. Interventional Cardiology"
                              value={d.specialization}
                              onChange={(e) => patchRow(setDoctorRows, i, 'specialization', e.target.value)}
                              className={fieldCls}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <label className="block mb-1 text-[12px]">Cabin / room</label>
                            <input
                              placeholder="e.g. Cabin 101"
                              value={d.currentRoom}
                              onChange={(e) => patchRow(setDoctorRows, i, 'currentRoom', e.target.value)}
                              className={fieldCls}
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-[12px]">Avg. checkup (min)</label>
                            <input
                              type="number"
                              min="1"
                              value={d.averageCheckupTime}
                              onChange={(e) =>
                                patchRow(setDoctorRows, i, 'averageCheckupTime', e.target.value)
                              }
                              className={fieldCls}
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-[12px]">Daily OPD limit (0 = none)</label>
                            <input
                              type="number"
                              min="0"
                              value={d.dailyTokenLimit}
                              onChange={(e) => patchRow(setDoctorRows, i, 'dailyTokenLimit', e.target.value)}
                              className={fieldCls}
                            />
                          </div>
                        </div>

                        {/* What the PATIENT sees on the facility's landing page.
                          Four bare names give someone choosing a doctor nothing
                          to choose on; qualification, years and OPD days do.
                          All optional — blanks are omitted from the page, not
                          rendered as empty rows. */}
                        <details className="group rounded-lg border border-[var(--border-color)]/40 bg-[var(--bg-color)]/50">
                          <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer list-none">
                            <span className="material-symbols-outlined text-[15px] text-[var(--primary-color)]">
                              badge
                            </span>
                            <span className="text-[12px] font-black uppercase tracking-wider text-[var(--text-color)]">
                              Public profile (shown to patients)
                            </span>
                            <span className="material-symbols-outlined text-[16px] ml-auto text-[var(--text-secondary)] transition-transform group-open:rotate-180">
                              expand_more
                            </span>
                          </summary>
                          <div className="px-3 pb-3 pt-1 border-t border-[var(--border-color)]/25">
                            <DoctorProfileFields
                              value={d}
                              onPatch={(patch) =>
                                setDoctorRows((rows) =>
                                  rows.map((r, j) => (j === i ? { ...r, ...patch } : r))
                                )
                              }
                            />
                          </div>
                        </details>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDoctorRows((p) => [...p, blankDoctor()])}
                      className="text-[11px] font-black text-[var(--primary-color)] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span> Add another
                      doctor
                    </button>
                  </div>
                )}

                {sectionApplies('lab') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                        science
                      </span>
                      <span>Laboratory ({filledLabs.length})</span>
                      {(activeType?.requires || []).includes('lab') && (
                        <span className="text-[11px] font-black uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                      Who works the facility&apos;s own lab bench — they see the doctors&apos; test orders and
                      upload the reports.
                    </p>

                    {labRows.map((l, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
                        <input
                          placeholder="Lab assistant name *"
                          value={l.name}
                          onChange={(e) => patchRow(setLabRows, i, 'name', e.target.value)}
                          className={`${fieldCls} md:col-span-6`}
                        />
                        <button
                          type="button"
                          title="Remove this lab account"
                          disabled={labRows.length === 1}
                          onClick={() => setLabRows((p) => p.filter((_, idx) => idx !== i))}
                          className="px-2.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 disabled:opacity-30 font-black text-xs"
                        >
                          ×
                        </button>
                        <input
                          type="email"
                          placeholder="Their login email (optional)"
                          value={l.loginEmail}
                          onChange={(e) => patchRow(setLabRows, i, 'loginEmail', e.target.value)}
                          className={`${fieldCls} md:col-span-3`}
                        />
                        <input
                          type="text"
                          placeholder="Their password (optional)"
                          value={l.password}
                          onChange={(e) => patchRow(setLabRows, i, 'password', e.target.value)}
                          className={`${fieldCls} md:col-span-3`}
                        />
                        <span />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLabRows((p) => [...p, blankLab()])}
                      className="text-[11px] font-black text-[var(--primary-color)] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span> Add another
                      lab account
                    </button>
                  </div>
                )}

                {sectionApplies('pharmacy') && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                        local_pharmacy
                      </span>
                      <span>Pharmacy / medical store ({filledPharmacy.length})</span>
                      {(activeType?.requires || []).includes('pharmacy') && (
                        <span className="text-[11px] font-black uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                      One login per dispensing counter — they see the prescriptions doctors write here.
                    </p>

                    {pharmacyRows.length === 0 && (
                      <p className="text-[11px] text-[var(--text-secondary)] font-medium italic">
                        No pharmacy account yet.
                      </p>
                    )}
                    {pharmacyRows.map((p, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-9 gap-2 items-center">
                        <input
                          placeholder="Pharmacist name *"
                          value={p.name}
                          onChange={(e) => patchRow(setPharmacyRows, i, 'name', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <input
                          placeholder="Counter name"
                          value={p.counterNumber}
                          onChange={(e) => patchRow(setPharmacyRows, i, 'counterNumber', e.target.value)}
                          className={`${fieldCls} md:col-span-2`}
                        />
                        <button
                          type="button"
                          title="Remove this pharmacy account"
                          onClick={() => setPharmacyRows((prev) => prev.filter((_, idx) => idx !== i))}
                          className="px-2.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-black text-xs"
                        >
                          ×
                        </button>
                        <input
                          type="email"
                          placeholder="Their login email (optional)"
                          value={p.loginEmail}
                          onChange={(e) => patchRow(setPharmacyRows, i, 'loginEmail', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <input
                          type="text"
                          placeholder="Their password (optional)"
                          value={p.password}
                          onChange={(e) => patchRow(setPharmacyRows, i, 'password', e.target.value)}
                          className={`${fieldCls} md:col-span-4`}
                        />
                        <span />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPharmacyRows((prev) => [...prev, blankPharmacy()])}
                      className="text-[11px] font-black text-[var(--primary-color)] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span> Add a pharmacy
                      counter
                    </button>
                  </div>
                )}

                {/* Exactly what this submit is about to create, before it happens. */}
                <div className="rounded-xl border border-[var(--border-color)]/40 bg-[var(--bg-color)]/50 p-4">
                  <p className="text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                    About to create
                  </p>
                  <p className="text-xs font-bold text-[var(--text-color)] mt-1">
                    {name || 'Unnamed facility'}{' '}
                    <span className="text-[var(--text-secondary)] font-semibold">
                      ({type}
                      {(type === 'Clinic' || type === 'Medical') && clinicSubtype
                        ? ` · ${clinicSubtype}`
                        : ''}
                      {city ? ` · ${city}` : ''})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['staff', 'doctors', 'lab', 'pharmacy'].map((kind) => (
                      <span
                        key={kind}
                        className={`text-[12px] font-black px-2 py-1 rounded-lg border ${
                          filledCount[kind] > 0
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : (activeType?.requires || []).includes(kind)
                              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                              : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-color)]/40'
                        }`}
                      >
                        {filledCount[kind]} {SECTION_COUNT_LABEL[kind][filledCount[kind] === 1 ? 0 : 1]}
                      </span>
                    ))}
                  </div>
                  {missingRequired.length > 0 && (
                    <p className="text-[11px] font-bold text-rose-500 mt-2">
                      A {type} usually has at least one{' '}
                      {missingRequired.map((k) => SECTION_LABEL[k]).join(' and one ')} on its roster. You can
                      add them later.
                    </p>
                  )}
                </div>

                {/* The facility's one credential.
                    This section replaces up to eight password boxes — one per
                    reception counter, doctor, lab bench and pharmacy counter.
                    Everyone at the facility signs in with this, and what they
                    can reach is decided by the modules ticked above, not by
                    which password they were handed. */}
                <div className="space-y-3 border-t border-[var(--border-color)]/20 pt-5">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">key</span>
                    Facility password
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                    The one credential this facility signs in with. Hand it to whoever runs the desk — it
                    opens every unit switched on above. There is no default: without this the facility cannot
                    be signed into at all.
                  </p>
                  <input
                    type="password"
                    placeholder="At least 12 characters — a phrase works best"
                    value={facilityPassword}
                    onChange={(e) => setFacilityPassword(e.target.value)}
                    className={fieldCls}
                    minLength={12}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-black text-sm rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/15 flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Configuring clinical database & files...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">publish</span>
                      <span>Launch & Deploy Portal</span>
                    </>
                  )}
                </button>
              </form>
            ) : activeTab === 'accounts' ? (
              <form
                onSubmit={handleRegisterAccount}
                className="space-y-8 text-xs font-bold text-[var(--text-secondary)]"
              >
                {/* Select Existing Hospital */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      domain
                    </span>
                    <span>1. Select Medical Facility</span>
                  </h3>
                  <div>
                    <label className="block mb-1">Select Hospital/Clinic *</label>
                    {hospitalList.length === 0 ? (
                      <p className="text-xs text-rose-500 font-semibold">
                        No hospitals registered yet. Please onboard a hospital first.
                      </p>
                    ) : (
                      <select
                        value={selectedHospital}
                        onChange={(e) => setSelectedHospital(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                        required
                      >
                        {hospitalList.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.city})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Select Account Type */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      manage_accounts
                    </span>
                    <span>2. Account Type & Role</span>
                  </h3>
                  <div className="flex space-x-3">
                    {[
                      { type: 'doctor', label: 'Doctor', icon: 'stethoscope' },
                      { type: 'staff', label: 'Receptionist / Staff', icon: 'verified_user' },
                      { type: 'lab', label: 'Lab Assistant', icon: 'science' },
                      { type: 'pharmacy', label: 'Pharmacy / Medical', icon: 'local_pharmacy' }
                    ].map((item) => (
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
                          onChange={(e) => setAddName(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label className="block mb-1">Doctor Email (Login ID) *</label>
                        <EmailInput
                          placeholder="david.miller@hospital.com"
                          value={addEmail}
                          onChange={setAddEmail}
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
                          list="known-departments-add"
                          placeholder="e.g. Cardiology"
                          value={addDepartment}
                          onChange={(e) => setAddDepartment(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                        <datalist id="known-departments-add">
                          {KNOWN_DEPARTMENTS.map((d) => (
                            <option key={d} value={d} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block mb-1">Doctor Type</label>
                        <select
                          value={addDoctorType}
                          onChange={(e) => setAddDoctorType(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                        >
                          {doctorTypes.map((dt) => (
                            <option key={dt} value={dt}>
                              {dt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1">Consultation Cabin Room</label>
                        <input
                          type="text"
                          placeholder="e.g. Cabin 101"
                          value={addRoom}
                          onChange={(e) => setAddRoom(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block mb-1">Specialization</label>
                        <input
                          type="text"
                          placeholder="e.g. Heart Failure"
                          value={addSpecialization}
                          onChange={(e) => setAddSpecialization(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                      <div>
                        <label className="block mb-1">Avg. Checkup Time (min)</label>
                        <input
                          type="number"
                          min="1"
                          value={addAverageCheckupTime}
                          onChange={(e) => setAddAverageCheckupTime(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                      <div>
                        <label className="block mb-1">Daily OPD Limit (0 = unlimited)</label>
                        <input
                          type="number"
                          min="0"
                          value={addDailyTokenLimit}
                          onChange={(e) => setAddDailyTokenLimit(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        />
                      </div>
                    </div>

                    {/* Same public profile the onboarding roster asks for, so a
                      doctor added later is not a bare name on the landing page. */}
                    <div className="pt-2 border-t border-[var(--border-color)]/20 space-y-3">
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-color)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[var(--primary-color)]">
                          badge
                        </span>
                        Public profile (shown to patients)
                      </span>
                      <DoctorProfileFields
                        value={addProfile}
                        onPatch={(patch) => setAddProfile((prev) => ({ ...prev, ...patch }))}
                      />
                    </div>
                  </div>
                )}

                {accountType === 'staff' && (
                  <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                    <h3 className="text-sm font-black text-[var(--text-color)]">
                      Receptionist / Staff Profile Setup
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block mb-1">Staff Full Name</label>
                        <input
                          type="text"
                          placeholder="e.g. David Jones"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
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
                        onChange={(e) => setAddCounterNumber(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      />
                    </div>
                  </div>
                )}

                {accountType === 'lab' && (
                  <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                    <h3 className="text-sm font-black text-[var(--text-color)]">
                      Lab Assistant Profile Setup
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block mb-1">Lab Assistant Name</label>
                        <input
                          type="text"
                          placeholder="e.g. City Lab Specialist"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {accountType === 'pharmacy' && (
                  <div className="space-y-4 border-t border-[var(--border-color)]/20 pt-4">
                    <h3 className="text-sm font-black text-[var(--text-color)]">
                      Pharmacy / Medical Store Setup
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block mb-1">Pharmacist Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Store Pharmacist"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          className={fieldCls}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-1">Pharmacy Counter</label>
                        <input
                          type="text"
                          placeholder="e.g. Pharmacy Counter 1"
                          value={addCounterNumber}
                          onChange={(e) => setAddCounterNumber(e.target.value)}
                          className={fieldCls}
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
                  {loading ? (
                    <span>Configuring clinical database & files...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">publish</span>
                      <span>Register Account</span>
                    </>
                  )}
                </button>
              </form>
            ) : activeTab === 'edit' ? (
              <form
                onSubmit={handleUpdateHospital}
                className="space-y-8 text-xs font-bold text-[var(--text-secondary)]"
              >
                {/* Select Hospital to Edit */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      domain
                    </span>
                    <span>1. Select Medical Facility to Modify</span>
                  </h3>
                  <div>
                    <label className="block mb-1">Select Hospital/Clinic *</label>
                    {hospitalList.length === 0 ? (
                      <p className="text-xs text-rose-500 font-semibold">No hospitals registered yet.</p>
                    ) : (
                      <select
                        value={editHospId}
                        onChange={(e) => handleSelectHospitalToEdit(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                        required
                      >
                        {hospitalList.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.city})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* This facility's one credential.
                      A facility with no password is fully configured, has a
                      public page, and cannot be signed into by anyone who works
                      there — a state that is invisible everywhere else, so it is
                      called out here in the one place that can fix it. */}
                  {editHospId && (
                    <div
                      className={`rounded-xl border p-3.5 space-y-2.5 ${
                        credentialStatus[editHospId]
                          ? 'border-[var(--border-color)]/40 bg-[var(--bg-color)]'
                          : 'border-amber-500/40 bg-amber-500/10'
                      }`}
                    >
                      <p className="text-[12px] font-black text-[var(--text-color)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">
                          {credentialStatus[editHospId] ? 'key' : 'key_off'}
                        </span>
                        {credentialStatus[editHospId]
                          ? 'Facility password is set'
                          : 'No facility password — nobody here can sign in'}
                      </p>
                      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        {credentialStatus[editHospId]
                          ? 'One password opens every unit this facility runs. Reset it when someone leaves — the new one applies from their next sign-in.'
                          : 'Set one now. This facility has a public page and a queue, but its staff have no way in until it has a password.'}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          placeholder="New password — at least 12 characters"
                          value={resetPasswordFor === editHospId ? resetPassword : ''}
                          onChange={(e) => {
                            setResetPasswordFor(editHospId);
                            setResetPassword(e.target.value);
                          }}
                          className={`${fieldCls} flex-1`}
                        />
                        <button
                          type="button"
                          disabled={loading || resetPasswordFor !== editHospId || !resetPassword}
                          onClick={() => handleSetFacilityPassword(editHospId)}
                          className="px-4 py-2 rounded-xl bg-[var(--primary-color)] text-[var(--primary-text)] font-black text-xs disabled:opacity-40 shrink-0"
                        >
                          {credentialStatus[editHospId] ? 'Reset password' : 'Set password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit Core Profile */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      edit
                    </span>
                    <span>2. Core Information & Settings</span>
                  </h3>

                  <div
                    className={`grid grid-cols-1 ${editType === 'Clinic' || editType === 'Medical' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}
                  >
                    <div>
                      <label className="block mb-1">Service Name *</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Service Type *</label>
                      <select
                        value={editType}
                        onChange={(e) => handleEditTypeChange(e.target.value)}
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
                          onChange={(e) => setEditClinicSubtype(e.target.value)}
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
                          onChange={(e) => setEditClinicSubtype(e.target.value)}
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
                        onChange={(e) => setEditCity(e.target.value)}
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
                        onChange={(e) => setEditLat(e.target.value)}
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
                        onChange={(e) => setEditLng(e.target.value)}
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
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1">WhatsApp Booking Number *</label>
                      <input
                        type="text"
                        value={editWhatsapp}
                        onChange={(e) => setEditWhatsapp(e.target.value)}
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
                        onChange={(e) => setEditDoctorCount(e.target.value)}
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
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Edit Branding */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-[var(--text-color)] flex items-center space-x-1.5 border-b border-[var(--border-color)]/20 pb-2">
                    <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">
                      palette
                    </span>
                    <span>3. Dynamic Custom Branding (White-Labeling)</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ImageUploadField
                      label="Facility logo (optional)"
                      purpose="logo"
                      hospitalId={editHospId}
                      value={editLogoUrl}
                      onChange={setEditLogoUrl}
                      hint="Square images look best. Shown in the header and on the public page."
                    />
                    <ImageUploadField
                      label="Cover / hero image (optional)"
                      purpose="hero"
                      hospitalId={editHospId}
                      value={editCoverImage}
                      onChange={setEditCoverImage}
                      hint="The wide banner at the top of the facility's public page."
                    />
                  </div>

                  <div>
                    <label className="block mb-1">Gallery photos (optional)</label>
                    <GalleryUploader
                      hospitalId={editHospId}
                      value={
                        editGalleryImagesStr
                          ? editGalleryImagesStr
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : []
                      }
                      onChange={(list) => setEditGalleryImagesStr(list.join(', '))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30">
                    <div>
                      <label className="block mb-1 font-bold text-[var(--text-color)]">
                        Parent Hospital (If Sub-facility)
                      </label>
                      <select
                        value={editParentHospital}
                        onChange={(e) => setEditParentHospital(e.target.value)}
                        className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-bold transition-all cursor-pointer"
                      >
                        <option value="">-- None (Standalone Facility) --</option>
                        {hospitalList
                          .filter(
                            (h) =>
                              (h.type === 'Hospital' || h.type === 'Government Hospital') &&
                              h.id !== editHospId
                          )
                          .map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} ({h.id})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 flex items-center text-[11px] font-semibold text-[var(--text-secondary)] leading-relaxed pt-2">
                      Lab, pharmacy and every other unit are switched on in the Units &amp; Services grid
                      below.
                    </div>
                  </div>

                  {/* Units this facility runs — same grid as onboarding, so what
                    an admin learns once works in both places. */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[17px] text-[var(--primary-color)]">
                        checklist
                      </span>
                      <span>Units &amp; Services</span>
                    </h4>
                    <ModuleGrid
                      catalogue={moduleCatalogue}
                      type={editType}
                      value={editModules}
                      onChange={setEditModules}
                      idPrefix="edit"
                      requiredKinds={(facilityTypes.find((t) => t.name === editType) || {}).requires || []}
                    />
                  </div>

                  {/* The public landing page for this facility. */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-[var(--text-color)] flex items-center gap-1.5 border-b border-[var(--border-color)]/20 pb-2">
                      <span className="material-symbols-outlined text-[17px] text-[var(--primary-color)]">
                        style
                      </span>
                      <span>Landing page content</span>
                      <a
                        href={`/h/${editHospId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-[12px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/25 transition-colors"
                      >
                        Open /h/{editHospId}
                      </a>
                    </h4>
                    <LandingEditor
                      value={editLanding}
                      onChange={setEditLanding}
                      templates={landingTemplates}
                      facilityName={editName}
                    />
                  </div>

                  <div>
                    <label className="block mb-1">Custom Welcome / Announcement Message (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Free checkups this Sunday! Or Welcome to St. Jude!"
                      value={editWelcomeMessage}
                      onChange={(e) => setEditWelcomeMessage(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                    />
                  </div>

                  <div>
                    <label className="block mb-1">Short Description *</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs text-[var(--text-color)] font-semibold transition-all"
                      required
                    />
                  </div>

                  {/* Edit Specialties List */}
                  <div className="space-y-3 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">
                        Edit Landing Page Services & Specialties
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditCustomServices((prev) => [
                            ...prev,
                            { title: '', description: '', icon: 'local_hospital' }
                          ])
                        }
                        className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[12px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
                      >
                        + Add Service
                      </button>
                    </div>
                    {editCustomServices.map((srv, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-[var(--border-color)]/20 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="md:col-span-3">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Service Title
                          </label>
                          <input
                            type="text"
                            value={srv.title}
                            placeholder="e.g. Orthodontics"
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, title: val } : s))
                              );
                            }}
                            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                            required
                          />
                        </div>
                        <div className="md:col-span-5">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Description
                          </label>
                          <input
                            type="text"
                            value={srv.description}
                            placeholder="e.g. Straighten teeth with advanced braces & aligners."
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, description: val } : s))
                              );
                            }}
                            className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                            required
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block mb-0.5 text-[11px] uppercase font-bold text-[var(--text-secondary)]">
                            Material Icon Name
                          </label>
                          <select
                            value={srv.icon}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditCustomServices((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, icon: val } : s))
                              );
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
                            onClick={() => setEditCustomServices((prev) => prev.filter((_, i) => i !== idx))}
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
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-[var(--text-color)]">
                        Edit Clinic Features (Why Choose Us)
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditFeatures((prev) => [...prev, ''])}
                        className="px-2.5 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg text-[12px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-all"
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
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFeatures((prev) => prev.map((f, i) => (i === idx ? val : f)));
                          }}
                          className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setEditFeatures((prev) => prev.filter((_, i) => i !== idx))}
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
                        <span className="text-[12px] text-[var(--text-secondary)]">
                          Click color box to adjust
                        </span>
                      </div>
                      <input
                        type="color"
                        value={editPrimaryColor}
                        onChange={(e) => setEditPrimaryColor(e.target.value)}
                        className="w-12 h-10 border-none bg-transparent cursor-pointer rounded-lg outline-none"
                      />
                    </div>
                    <div className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 flex items-center justify-between">
                      <div>
                        <label className="block font-bold mb-0.5">Secondary Theme Color</label>
                        <span className="text-[12px] text-[var(--text-secondary)]">
                          Click color box to adjust
                        </span>
                      </div>
                      <input
                        type="color"
                        value={editSecondaryColor}
                        onChange={(e) => setEditSecondaryColor(e.target.value)}
                        className="w-12 h-10 border-none bg-transparent cursor-pointer rounded-lg outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Super Admin Facility Personnel & Patient Management Console */}
                <div className="space-y-4 bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/30 shadow-sm text-left">
                  <div className="flex justify-between items-center border-b border-[var(--border-color)]/20 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-color)] flex items-center space-x-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[var(--primary-color)]">
                        badge
                      </span>
                      <span>5. Facility Registered Personnel & Patients</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => fetchFacilityPersonnel(editHospId)}
                      className="px-2.5 py-1 bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-lg text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-color)] flex items-center space-x-1"
                    >
                      <span
                        className={`material-symbols-outlined text-[14px] ${personnelLoading ? 'animate-spin' : ''}`}
                      >
                        refresh
                      </span>
                      <span>Reload Personnel</span>
                    </button>
                  </div>

                  {personnelLoading ? (
                    <p className="text-xs font-bold text-zinc-400 py-4 text-center">
                      Loading registered personnel & patients...
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Doctors List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[12px] font-black uppercase text-[var(--primary-color)] tracking-wider">
                          Registered Doctors ({facilityPersonnel.doctors.length})
                        </span>
                        {facilityPersonnel.doctors.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No doctors registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.doctors.map((d) => (
                              <div key={d._id} className="bg-[var(--bg-color)] rounded-lg text-xs">
                                <div className="flex justify-between items-center p-2">
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-[var(--text-color)] flex items-center gap-1.5">
                                      {d.name}
                                      <span className="text-[11px] font-black uppercase tracking-wider bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-1.5 py-0.5 rounded-full">
                                        {d.doctorType || 'Consultant'}
                                      </span>
                                      {/* A doctor with no profile is a bare name on
                                        the public page — worth flagging here. */}
                                      {!d.qualification && (
                                        <span className="text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                          no profile
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[12px] text-[var(--text-secondary)]">
                                      {d.department} • {d.currentRoom || 'Cabin'} ({d.availabilityStatus})
                                      {d.dailyTokenLimit ? ` • cap ${d.dailyTokenLimit}/day` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const opening = editingDoctorId !== d._id;
                                        setEditingDoctorId(opening ? d._id : '');
                                        if (opening) setEditingDoctorProfile(doctorProfileFrom(d));
                                      }}
                                      className="p-1 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/10 rounded"
                                      title="Edit public profile"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">badge</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDoctor(d._id)}
                                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                      title="Delete Doctor"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">delete</span>
                                    </button>
                                  </div>
                                </div>

                                {editingDoctorId === d._id && (
                                  <div className="px-2 pb-2 pt-1 border-t border-[var(--border-color)]/30 space-y-2">
                                    <DoctorProfileFields
                                      value={editingDoctorProfile}
                                      onPatch={(patch) =>
                                        setEditingDoctorProfile((prev) => ({ ...prev, ...patch }))
                                      }
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveDoctorProfile(d._id)}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--primary-color)] text-white text-[12px] font-black uppercase tracking-wider"
                                      >
                                        Save profile
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingDoctorId('')}
                                        className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Staff List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[12px] font-black uppercase text-[var(--secondary-color)] tracking-wider">
                          Registered Staff ({facilityPersonnel.staff.length})
                        </span>
                        {facilityPersonnel.staff.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No staff registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.staff.map((s) => (
                              <div
                                key={s._id}
                                className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs"
                              >
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{s.name}</p>
                                  <p className="text-[12px] text-[var(--text-secondary)]">
                                    {s.username} • {s.counterNumber}
                                  </p>
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
                        <span className="text-[12px] font-black uppercase text-emerald-500 tracking-wider">
                          Registered Lab Assistants ({facilityPersonnel.labAssistants.length})
                        </span>
                        {facilityPersonnel.labAssistants.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No lab assistants registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.labAssistants.map((l) => (
                              <div
                                key={l._id}
                                className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs"
                              >
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{l.name}</p>
                                  <p className="text-[12px] text-[var(--text-secondary)]">{l.username}</p>
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

                      {/* Pharmacists List */}
                      <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--border-color)]/40 space-y-2">
                        <span className="text-[12px] font-black uppercase text-amber-500 tracking-wider">
                          Registered Pharmacy / Medical ({(facilityPersonnel.pharmacists || []).length})
                        </span>
                        {(facilityPersonnel.pharmacists || []).length === 0 ? (
                          <p className="text-[11px] text-zinc-400">No pharmacy accounts registered.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.pharmacists.map((ph) => (
                              <div
                                key={ph._id}
                                className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs"
                              >
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{ph.name}</p>
                                  <p className="text-[12px] text-[var(--text-secondary)]">
                                    {ph.username}
                                    {ph.counterNumber ? ' • ' + ph.counterNumber : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePharmacist(ph._id)}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  title="Delete Pharmacy Account"
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
                        <span className="text-[12px] font-black uppercase text-indigo-500 tracking-wider">
                          Registered Patients ({facilityPersonnel.patients.length})
                        </span>
                        {facilityPersonnel.patients.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">
                            No patients registered in this facility.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                            {facilityPersonnel.patients.map((p) => (
                              <div
                                key={p._id}
                                className="flex justify-between items-center bg-[var(--bg-color)] p-2 rounded-lg text-xs"
                              >
                                <div>
                                  <p className="font-extrabold text-[var(--text-color)]">{p.name}</p>
                                  <p className="text-[12px] text-[var(--text-secondary)]">
                                    {p.phone} • {p.age}y ({p.gender}) • {p.visitCount} visits
                                  </p>
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
                    {loading ? (
                      <span>Applying customizations...</span>
                    ) : (
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
            ) : activeTab === 'licenses' ? (
              <LicensePanel adminSecret={adminSecret} />
            ) : activeTab === 'whatsapp' ? (
              <WhatsAppTester
                initialPhone={editWhatsapp || '+14155238886'}
                defaultHospId={editHospId || 'general-hospital'}
                adminSecret={adminSecret}
              />
            ) : null}
          </div>
        </div>
      </div>
    </UploadCredentialsProvider>
  );
}
