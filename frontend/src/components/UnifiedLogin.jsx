import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

/**
 * One door into the whole system.
 *
 * A facility we onboard gets a single address to hand its people: pick who you
 * are, sign in, and your own console opens. There used to be four separate
 * login pages, so onboarding a hospital meant telling reception one URL, the
 * doctors another, and the lab a third — and anyone who guessed wrong got
 * "invalid credentials" from a form that could never have worked for them.
 *
 * The four per-role routes still exist and redirect here with the role already
 * chosen, so printed cards and old bookmarks keep working.
 */

/** What each role signs in with, and where they land. */
const ROLES = [
  {
    key: 'staff',
    label: 'Reception',
    icon: 'support_agent',
    endpoint: 'staff',
    idField: 'username',
    idLabel: 'Username',
    idType: 'text',
    home: '/staff/dashboard',
    blurb: 'Front desk, walk-ins, billing'
  },
  {
    key: 'doctor',
    label: 'Doctor',
    icon: 'stethoscope',
    endpoint: 'doctor',
    idField: 'email',
    idLabel: 'Email',
    idType: 'email',
    home: '/doctor/dashboard',
    blurb: 'Your cabin and queue'
  },
  {
    key: 'lab',
    label: 'Lab',
    icon: 'science',
    endpoint: 'lab',
    idField: 'username',
    idLabel: 'Username',
    idType: 'text',
    home: '/lab/dashboard',
    blurb: 'Samples and reports'
  },
  {
    key: 'pharmacy',
    label: 'Pharmacy',
    icon: 'local_pharmacy',
    endpoint: 'pharmacy',
    idField: 'username',
    idLabel: 'Username',
    idType: 'text',
    home: '/pharmacy/dashboard',
    blurb: 'Counter and stock'
  }
];

export default function UnifiedLogin({ onAuthenticated }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [facilities, setFacilities] = useState([]);
  const [facility, setFacility] = useState(params.get('facility') || '');
  const [role, setRole] = useState(
    ROLES.some((r) => r.key === params.get('role')) ? params.get('role') : 'staff'
  );
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const active = ROLES.find((r) => r.key === role) || ROLES[0];

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !data.length) return;
        setFacilities(data);
        // The `?facility=` hint comes from a URL, which anyone can type. It is
        // honoured only if it names a facility that actually exists; otherwise
        // fall back to the first real one rather than posting a bogus tenant.
        setFacility((prev) => (data.some((h) => h.id === prev) ? prev : data[0].id));
      })
      .catch(() => setError('Could not reach the server. Check your connection and try again.'));
  }, []);

  // Switching role clears the identifier: a username typed for the lab is never
  // the right value for the doctor form, and leaving it there invites a failed
  // attempt against a rate-limited endpoint.
  const chooseRole = (key) => {
    setRole(key);
    setIdentifier('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/${active.endpoint}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [active.idField]: identifier, password, hospital: facility })
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.message || 'Sign in failed');

      onAuthenticated(role, data.token, data.user);
      navigate(active.home);
    } catch (err) {
      setError(err.name === 'TypeError' ? 'Could not reach the server. Check your connection.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const facilityName = (facilities.find((f) => f.id === facility) || {}).name;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-color)] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-[var(--text-secondary)]">
          <span className="w-9 h-9 rounded-xl bg-[var(--primary-color)] text-white flex items-center justify-center">
            <Icon name="health_and_safety" className="text-[21px]" />
          </span>
          <span className="text-[19px] font-black text-[var(--text-color)]">CareeAi</span>
        </Link>

        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-6 md:p-7 shadow-xl">
          <h1 className="text-[22px] font-black text-[var(--text-color)]">Sign in</h1>
          <p className="text-[13px] font-semibold text-[var(--text-secondary)] mt-1">
            {facilityName ? `Signing in to ${facilityName}` : 'Choose your facility and role'}
          </p>

          {error && (
            <div className="mt-4 px-3.5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[13px] font-bold flex items-start gap-2">
              <Icon name="error" className="text-[18px] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5">
                Facility
              </label>
              <select
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)] cursor-pointer"
              >
                {facilities.length === 0 && <option>Loading…</option>}
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5">
                I am
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => {
                  const selected = r.key === role;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => chooseRole(r.key)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                        selected
                          ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--primary-color)]'
                          : 'bg-[var(--bg-color)] border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:border-[var(--primary-color)]/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon name={r.icon} className="text-[19px]" />
                        <span className="text-[14px] font-black">{r.label}</span>
                      </span>
                      <span className="block text-[11px] font-semibold opacity-80 mt-0.5">{r.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5">
                {active.idLabel}
              </label>
              <input
                type={active.idType}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)]"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !facility}
              className="w-full bg-[var(--primary-color)] text-white font-black py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-[var(--primary-color)]/20"
            >
              {loading ? (
                'Signing in…'
              ) : (
                <>
                  <Icon name="login" className="text-[20px]" />
                  Open my {active.label.toLowerCase()} console
                </>
              )}
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-[var(--border-color)]/30 text-[12px] font-semibold text-[var(--text-secondary)] text-center">
            Authorised staff only. All actions are logged.
          </p>
        </div>

        <p className="mt-5 text-center text-[13px] font-semibold text-[var(--text-secondary)]">
          Looking to book an appointment?{' '}
          <Link to="/facilities" className="font-black text-[var(--primary-color)] hover:underline">
            Find your facility
          </Link>
        </p>
      </div>
    </div>
  );
}
