import React, { useState, useEffect, Suspense } from 'react';
import io from 'socket.io-client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useSearchParams
} from 'react-router-dom';
import { MessageSquare, Shield, Activity } from 'lucide-react';

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

// The realtime link every dashboard depends on.
//
// This used to be `io(url, { transports: ['websocket'] })` with no reconnection
// settings, which fails badly in a hospital: if the socket ever dropped — server
// restart, wifi blip, a laptop waking from sleep — the dashboards kept rendering
// the last data they had and quietly stopped updating. A queue board that looks
// live but is ten minutes stale is worse than one that says it is offline.
//
//  - polling fallback: some hospital networks/proxies block raw WebSockets.
//  - unlimited retries: a dashboard left on overnight must recover by itself.
export const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 8000
});

// Lazy load components
const MarketingHome = React.lazy(() => import('./components/MarketingHome'));
const HospitalHub = React.lazy(() => import('./components/HospitalHub'));
const UnifiedLogin = React.lazy(() => import('./components/UnifiedLogin'));
const FacilityLanding = React.lazy(() => import('./components/FacilityLanding'));
const PatientPortal = React.lazy(() => import('./components/PatientPortal'));
const PatientLiveTracker = React.lazy(() => import('./components/PatientLiveTracker'));
const DigitalPrescriptionViewer = React.lazy(() => import('./components/DigitalPrescriptionViewer'));
const PublicTVDisplay = React.lazy(() => import('./components/PublicTVDisplay'));
const SuperAdminPortal = React.lazy(() => import('./components/SuperAdminPortal'));

// The one staff-facing surface. It lazy-loads the four dashboards itself as
// rooms, so signing in no longer pulls four bundles for the three consoles this
// facility is not currently standing in.
const FacilityConsole = React.lazy(() => import('./components/FacilityConsole'));

const LoadingFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4 min-h-[400px]">
    <span className="material-symbols-outlined text-[48px] text-[var(--primary-color)] animate-spin">
      refresh
    </span>
    <p className="text-sm font-bold text-[var(--text-secondary)]">Loading session...</p>
  </div>
);

/**
 * The old per-role paths, kept alive.
 *
 * `/staff/login`, `/doctor/dashboard` and the rest were four separate consoles
 * with four separate accounts. There is one facility login and one console now,
 * so they all land in the same place — carrying the `?facility=` hint through,
 * because a facility's landing page links its own staff that way and printed
 * cards and bookmarks still point at the old URLs.
 *
 * Redirecting beats deleting: the alternative is a 404 for someone who has been
 * typing the same address for a year.
 */
function LegacyRoleRedirect({ signedIn }) {
  const [params] = useSearchParams();
  const facility = params.get('facility');
  if (signedIn) return <Navigate to="/console" replace />;
  const query = facility ? `?${new URLSearchParams({ facility }).toString()}` : '';
  return <Navigate to={`/login${query}`} replace />;
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

/** localStorage that never throws and never returns the string "undefined". */
const readStored = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw !== 'undefined' ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

function AppContent() {
  // One facility session, where there used to be four role sessions with four
  // tokens and four user blobs in localStorage. A facility signs in once; which
  // consoles it can open is carried in the token's scopes, not in which of four
  // keys happened to be filled in.
  const [token, setToken] = useState(localStorage.getItem('facilityToken') || '');
  const [facility, setFacility] = useState(() => readStored('facilityUser'));
  const [doctors, setDoctors] = useState(() => readStored('facilityDoctors') || []);

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

  const handleAuthenticated = (nextToken, nextFacility, nextDoctors) => {
    localStorage.setItem('facilityToken', nextToken);
    localStorage.setItem('facilityUser', JSON.stringify(nextFacility));
    localStorage.setItem('facilityDoctors', JSON.stringify(nextDoctors || []));
    setToken(nextToken);
    setFacility(nextFacility);
    setDoctors(nextDoctors || []);
  };

  const handleLogout = () => {
    localStorage.removeItem('facilityToken');
    localStorage.removeItem('facilityUser');
    localStorage.removeItem('facilityDoctors');
    // The four per-role keys a session from before single sign-in would have
    // left behind. Clearing them here means one sign-out genuinely ends the
    // session rather than leaving a stale token in a key nothing reads.
    ['staff', 'doctor', 'lab', 'pharmacy'].forEach((role) => {
      localStorage.removeItem(`${role}Token`);
      localStorage.removeItem(`${role}User`);
    });
    setToken('');
    setFacility(null);
    setDoctors([]);
    navigate('/login');
  };

  /**
   * Re-read the session on load.
   *
   * A facility that had a module switched on, or a doctor added, since it last
   * signed in should see that on the next page load rather than after someone
   * thinks to sign out and back in. A rejected token means the session is over —
   * clearing it here is what stops a dead token rendering an empty console.
   */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) handleLogout();
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (cancelled || !data || !data.user) return;
        localStorage.setItem('facilityUser', JSON.stringify(data.user));
        localStorage.setItem('facilityDoctors', JSON.stringify(data.doctors || []));
        setFacility(data.user);
        setDoctors(data.doctors || []);
      })
      // A network blip on load is not a reason to sign someone out — the stored
      // session stays and the next call will surface any real problem.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The demo role-switcher is a tool for showing the product, not part of it.
  // On our own home page and the sign-in page it is the first thing a visiting
  // hospital sees, and a bar offering four consoles they cannot open makes the
  // product look like a toy. Those two pages carry their own navigation.
  const publicPage = location.pathname === '/' || location.pathname === '/login';

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] flex flex-col font-sans transition-colors duration-200">
      {publicPage ? null : (
        /* Floating Demo Navigation Bar */
        <div className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/60 px-4 py-2.5 flex items-center justify-between z-50 shadow-lg shadow-black/5 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-[var(--primary-color)] p-1.5 rounded-lg shadow-sm shadow-[var(--primary-color)]/20">
              <Activity className="h-5 w-5 text-white animate-pulse" />
            </div>
            <span className="font-extrabold tracking-tight text-lg text-[var(--text-color)]">
              CareeAi <span className="text-xs text-[var(--primary-color)] font-semibold">DEMO</span>
            </span>
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

            {/* One console, so one button. This bar used to offer four —
                Staff, Doctor, Lab, Pharmacy — because they were four separate
                logins; a visiting hospital met a row of consoles it could not
                open. Now it is the door the facility already came through. */}
            <button
              onClick={() => navigate(token ? '/console' : '/login')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 active:scale-95 duration-100 ${location.pathname.startsWith('/console') ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-lg shadow-[var(--primary-color)]/20' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline-block">{facility ? facility.name : 'Facility console'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area with Suspense for Lazy Loading */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Our own product page. The partner directory is a page in its
                own right and lives at /facilities — `/` used to be the
                directory with marketing bolted on, so a hospital arriving for
                the first time met a list of other people's clinics before
                learning what this is. */}
            <Route path="/" element={<MarketingHome />} />
            <Route path="/facilities" element={<HospitalHub />} />

            {/* One door, one console. A facility we onboard hands its people a
                single address and a single password; every unit that facility
                runs is a room inside what opens. The eight per-role paths below
                still work and redirect here, so printed cards and bookmarks
                keep working. */}
            <Route
              path="/login"
              element={
                token ? (
                  <Navigate to="/console" replace />
                ) : (
                  <UnifiedLogin onAuthenticated={handleAuthenticated} />
                )
              }
            />
            <Route
              path="/console"
              element={
                token && facility ? (
                  <FacilityConsole
                    token={token}
                    facility={facility}
                    doctors={doctors}
                    onLogout={handleLogout}
                  />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            {/* Each partner's generated public website. `/h/:id` is the front
                door we hand out; `/hospital/:id` stays the booking portal it
                links into, so existing WhatsApp links and QR codes still work. */}
            <Route path="/h/:hospitalId" element={<FacilityLanding />} />
            <Route path="/hospital/:hospitalId" element={<PatientPortal />} />

            {/* The retired per-role routes. */}
            {['staff', 'doctor', 'lab', 'pharmacy'].map((role) => (
              <React.Fragment key={role}>
                <Route path={`/${role}/login`} element={<LegacyRoleRedirect signedIn={Boolean(token)} />} />
                <Route
                  path={`/${role}/dashboard`}
                  element={<LegacyRoleRedirect signedIn={Boolean(token)} />}
                />
              </React.Fragment>
            ))}
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
