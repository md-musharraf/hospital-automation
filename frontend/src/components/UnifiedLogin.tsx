import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

/**
 * One door into the whole system, with two keys that fit it.
 *
 * A facility gets a single shared password: whoever is on shift opens it and
 * every room that facility runs is inside — reception, the cabins, the lab
 * bench, the pharmacy counter. That is still here and still the default,
 * because it is the thing a three-person clinic can actually keep track of.
 *
 * A person can also be given their own email and password. That opens exactly
 * ONE room — a receptionist's session cannot reach the pharmacy API at all —
 * and for a doctor it also settles which cabin they are running, so there is no
 * roster to pick from and no way to end up working as a colleague. Bigger
 * hospitals want that; the same building's front desk may still share one
 * password. Both work at once, and neither took the other away.
 *
 * What this page deliberately does NOT do is ask which of four roles you are.
 * That grid used to exist when each role was its own account, and it was really
 * asking "which of our four passwords do you hold". A personal sign-in already
 * knows the answer from the address; a shared one gets every room the facility
 * runs. The four per-role routes still redirect here, so printed cards and old
 * bookmarks keep working.
 */
export default function UnifiedLogin({ onAuthenticated }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [facilities, setFacilities] = useState([]);
  const [facility, setFacility] = useState(params.get('facility') || '');
  const [facilityQuery, setFacilityQuery] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  // Shared facility password by default: it is what every facility has, and a
  // personal account is the exception someone has been told about.
  const [personal, setPersonal] = useState(params.get('as') === 'me');
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  // Name or city, because people say "the Gaya one" as often as they say the
  // full registered name. The currently-selected facility is always kept in the
  // list, so a search that excludes it cannot silently change what you submit.
  const q = facilityQuery.trim().toLowerCase();
  const matches = q
    ? facilities.filter(
        (f) =>
          f.id === facility ||
          (f.name || '').toLowerCase().includes(q) ||
          (f.city || '').toLowerCase().includes(q)
      )
    : facilities;

  useEffect(() => {
    // `view=picker` returns {id, name, city, type} only — 16 KB at 200
    // facilities instead of 554 KB of landing copy nobody on this page reads.
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals?view=picker`)
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsSetup(false);
    setLoading(true);
    try {
      // Two endpoints, because they answer different questions: one asks "is
      // this the facility's password", the other "who are you here". Choosing
      // client-side keeps each server handler single-purpose — a combined route
      // would have to guess which credential it was given.
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/${personal ? 'login' : 'facility/login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          personal ? { hospital: facility, email, password } : { hospital: facility, password }
        )
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        // A facility whose password was never set is not a typo — it is a thing
        // only the platform owner can fix, and saying "wrong password" would
        // send whoever is on shift round a loop they cannot get out of. Only
        // meaningful for the shared password; a personal 403 means the facility
        // stopped running that person's unit, which says so itself.
        if (res.status === 403 && !personal) setNeedsSetup(true);
        throw new Error(data.message || 'Sign in failed');
      }

      onAuthenticated(data.token, data.user, data.doctors || []);
      navigate('/console');
    } catch (err) {
      setError(err.name === 'TypeError' ? 'Could not reach the server. Check your connection.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const selected = facilities.find((f) => f.id === facility);

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
            {selected ? `Signing in to ${selected.name}` : 'Choose your facility'}
          </p>

          {error && (
            <div
              className={`mt-4 px-3.5 py-3 rounded-xl text-[13px] font-bold flex items-start gap-2 ${
                needsSetup
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Icon name={needsSetup ? 'key_off' : 'error'} className="text-[18px] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Typing beats scrolling once there are more than a screenful of
                facilities. A dropdown of two hundred hospitals is a scroll
                bar, not a choice — and the person signing in already knows
                exactly which one they work at. The `<select>` stays as the
                control underneath so keyboard and screen-reader behaviour is
                the browser's, not ours. */}
            <div>
              <label
                htmlFor="facility-select"
                className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5"
              >
                Facility
              </label>
              {facilities.length > 8 && (
                <div className="relative mb-2">
                  <Icon
                    name="search"
                    className="text-[19px] absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                  />
                  <input
                    type="text"
                    value={facilityQuery}
                    onChange={(e) => setFacilityQuery(e.target.value)}
                    placeholder="Search by name or city…"
                    className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl pl-10 pr-4 py-2.5 outline-none text-[14px] font-semibold text-[var(--text-color)]"
                  />
                </div>
              )}
              <select
                id="facility-select"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                size={facilities.length > 8 ? Math.min(5, Math.max(2, matches.length)) : undefined}
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)] cursor-pointer"
              >
                {facilities.length === 0 && <option>Loading…</option>}
                {matches.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.city ? ` — ${f.city}` : ''}
                  </option>
                ))}
              </select>
              {facilities.length > 8 && (
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] mt-1.5">
                  {matches.length === 0
                    ? 'No facility matches that search.'
                    : `${matches.length} of ${facilities.length} facilities`}
                </p>
              )}
            </div>

            {/* Which key you hold. Two buttons rather than a checkbox because
                the choice changes which fields are asked for, and a control
                that silently adds a field above itself is disorienting. */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-xl">
              {[
                { key: false, label: 'Facility password', icon: 'apartment' },
                { key: true, label: 'My own login', icon: 'person' }
              ].map((tab) => (
                <button
                  key={String(tab.key)}
                  type="button"
                  onClick={() => {
                    setPersonal(tab.key);
                    setError('');
                    setNeedsSetup(false);
                  }}
                  className={`py-2 rounded-lg text-[13px] font-black flex items-center justify-center gap-1.5 transition-all ${
                    personal === tab.key
                      ? 'bg-[var(--card-bg)] text-[var(--text-color)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <Icon name={tab.icon} className="text-[17px]" />
                  {tab.label}
                </button>
              ))}
            </div>

            {personal && (
              <div>
                <label
                  htmlFor="person-email"
                  className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5"
                >
                  Your email
                </label>
                <input
                  id="person-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@facility.in"
                  className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)]"
                  required
                />
              </div>
            )}

            <div>
              <label
                htmlFor="facility-password"
                className="block text-[12px] uppercase font-black tracking-wider text-[var(--text-secondary)] mb-1.5"
              >
                {personal ? 'Your password' : 'Facility password'}
              </label>
              <input
                id="facility-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-3 outline-none text-[14px] font-bold text-[var(--text-color)]"
                required
              />
              <p className="text-[12px] font-semibold text-[var(--text-secondary)] mt-1.5">
                {personal
                  ? 'Opens only your own console. Doctors go straight to their cabin. Ask your facility owner if you have not been given one.'
                  : 'One password for the whole facility. The owner view, reception, cabins, lab and pharmacy all open from it.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !facility || (personal && !email.trim())}
              className="w-full bg-[var(--primary-color)] text-white font-black py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-[var(--primary-color)]/20"
            >
              {loading ? (
                'Signing in…'
              ) : (
                <>
                  <Icon name="login" className="text-[20px]" />
                  Open our console
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
