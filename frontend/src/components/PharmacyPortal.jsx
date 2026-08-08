import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BACKEND_URL } from '../App';
import createApi from '../lib/api';
import useFacilitySocket from '../hooks/useFacilitySocket';
import useLiveRefresh from '../hooks/useLiveRefresh';
import LiveActivityFeed from './LiveActivityFeed';

export function PharmacyLogin({ setPharmacyToken, setPharmacyUser, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hospitals, setHospitals] = useState([{ id: 'general-hospital', name: 'CareeAi General Hospital' }]);
  const [selectedHospital, setSelectedHospital] = useState('general-hospital');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/v1/chat/hospitals`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setHospitals(data);
          setSelectedHospital((prev) => (data.some((h) => h.id === prev) ? prev : data[0].id));
        }
      })
      .catch((err) => console.error('Error fetching hospitals for pharmacy login:', err));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/pharmacy/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, hospital: selectedHospital })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('pharmacyToken', data.token);
      localStorage.setItem('pharmacyUser', JSON.stringify(data.user));
      setPharmacyToken(data.token);
      setPharmacyUser(data.user);
      onSuccess();
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

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-8 shadow-[var(--card-shadow)] relative overflow-hidden">
        <div className="flex items-center space-x-2 mb-6">
          <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 p-2 rounded-lg text-[var(--primary-color)]">
            <span className="material-symbols-outlined">local_pharmacy</span>
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-color)] tracking-tight">
            Pharmacy / Medical Portal Login
          </h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-lg flex items-center space-x-2">
            <span className="material-symbols-outlined text-[16px] text-rose-500">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-sm font-semibold">
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Select Facility</label>
            <select
              value={selectedHospital}
              onChange={(e) => setSelectedHospital(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 rounded-xl px-4 py-3 outline-none text-[var(--text-color)] font-bold cursor-pointer"
            >
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)] focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)] focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] hover:text-[var(--text-color)] font-bold rounded-xl transition-all transition-all-custom shadow-lg shadow-[var(--primary-color)]/10 hover:shadow-[var(--primary-color)]/20 flex items-center justify-center space-x-2 active:scale-[0.98]"
          >
            {loading ? <span>Logging in...</span> : <span>Access Pharmacy Console</span>}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PharmacyDashboard({ pharmacyToken, pharmacyUser, onLogout }) {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'
  const [tab, setTab] = useState('dispense'); // 'dispense' | 'inventory'
  const [inventory, setInventory] = useState([]);
  const [stats, setStats] = useState(null);
  const [invQuery, setInvQuery] = useState('');
  const [newMed, setNewMed] = useState({
    name: '',
    strength: '',
    stockQty: '',
    unit: 'strip',
    reorderLevel: '10',
    expiryDate: ''
  });
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  // Facility-scoped realtime: this counter only hears its own hospital.
  useFacilitySocket('pharmacy', pharmacyUser?.hospital);

  const api = useMemo(() => createApi(pharmacyToken), [pharmacyToken]);

  const refreshPrescriptions = useCallback(async () => {
    try {
      const [rows, latestStats] = await Promise.all([
        api.get('/pharmacy/prescriptions'),
        api.get('/pharmacy/stats')
      ]);
      setTokens(rows);
      setSelectedToken((prev) => (prev ? rows.find((t) => t._id === prev._id) || prev : null));
      setStats(latestStats);
    } catch (err) {
      if (err.isAuthError) return onLogout();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, onLogout]);

  const refreshInventory = useCallback(async () => {
    try {
      const query = invQuery ? `?q=${encodeURIComponent(invQuery)}` : '';
      const [rows, latestStats] = await Promise.all([
        api.get(`/pharmacy/inventory${query}`),
        api.get('/pharmacy/stats')
      ]);
      setInventory(rows);
      setStats(latestStats);
    } catch (err) {
      if (err.isAuthError) return onLogout();
      setError(err.message);
    }
  }, [api, invQuery, onLogout]);

  useEffect(() => {
    refreshPrescriptions();
  }, [refreshPrescriptions]);

  // Debounced: retype in the search box without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(refreshInventory, 250);
    return () => clearTimeout(timer);
  }, [refreshInventory]);

  // A doctor completing a checkup pushes `pharmacy-updated` straight here, so a
  // new prescription lands on the counter the moment it is written. Coalesced so
  // the fan-out of one clinical action causes a single refetch.
  useLiveRefresh(['pharmacy-updated', 'queue-updated'], refreshPrescriptions);
  useLiveRefresh(['inventory-updated', 'stock-alert'], refreshInventory);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 7000);
    return () => clearTimeout(t);
  }, [flash]);

  const handleDispense = async (tokenId) => {
    try {
      const data = await api.post(`/pharmacy/prescriptions/${tokenId}/dispense`);
      {
        // Say plainly what was handed over and what could not be — the counter
        // has to tell the patient before they walk away.
        setFlash(
          data.shortages && data.shortages.length > 0
            ? `Dispensed, but NOT available: ${data.shortages.map((s) => s.requested).join(', ')}. The patient and doctor have been notified.`
            : `Dispensed. Stock updated: ${(data.deducted || []).map((d) => `${d.name} → ${d.remaining} left`).join(', ') || 'no tracked items'}.`
        );
        await refreshPrescriptions();
        await refreshInventory();
        setSelectedToken(data.token);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddMedicine = async (e) => {
    e.preventDefault();
    if (!newMed.name.trim()) return;
    try {
      const data = await api.post('/pharmacy/inventory', {
        ...newMed,
        stockQty: Number(newMed.stockQty) || 0,
        reorderLevel: Number(newMed.reorderLevel) || 10
      });
      setFlash(data.message);
      setNewMed({ name: '', strength: '', stockQty: '', unit: 'strip', reorderLevel: '10', expiryDate: '' });
      refreshInventory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSetStock = async (id, stockQty) => {
    try {
      await api.patch(`/pharmacy/inventory/${id}`, { stockQty: Number(stockQty) });
      refreshInventory();
    } catch (err) {
      setError(err.message);
    }
  };

  const isDispensed = (tok) => tok?.prescription?.dispensed;
  const visibleTokens = filter === 'pending' ? tokens.filter((t) => !isDispensed(t)) : tokens;

  const LEVEL_BADGE = {
    'in-stock': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    low: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    out: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    unknown: 'bg-zinc-500/15 text-zinc-500'
  };
  const LEVEL_TEXT = { 'in-stock': 'In stock', low: 'Low', out: 'OUT', unknown: 'Not listed' };

  return (
    <div className="flex-grow flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Left panel: patient prescriptions */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0 text-left">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{pharmacyUser?.name}</h3>
            <p className="text-[10px] text-[var(--primary-color)] font-bold uppercase tracking-wider mt-0.5">
              Pharmacy / Medical
            </p>
          </div>
          <button
            onClick={onLogout}
            className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-extrabold rounded-lg hover:bg-rose-500 hover:text-white transition-all shrink-0 active:scale-95 duration-100"
          >
            Logout
          </button>
        </div>

        {/* Counter workload + stock health at a glance. */}
        {stats && (
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'To dispense',
                value: stats.pending,
                tone: stats.pending > 0 ? 'text-amber-500' : 'text-[var(--text-color)]'
              },
              { label: 'Done today', value: stats.dispensedToday, tone: 'text-emerald-500' },
              {
                label: 'Out of stock',
                value: stats.outOfStock,
                tone: stats.outOfStock > 0 ? 'text-rose-500' : 'text-[var(--text-color)]'
              },
              {
                label: 'Low stock',
                value: stats.lowStock,
                tone: stats.lowStock > 0 ? 'text-amber-500' : 'text-[var(--text-color)]'
              }
            ].map((s) => (
              <div
                key={s.label}
                className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl px-2.5 py-2"
              >
                <p className="text-[9px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">
                  {s.label}
                </p>
                <p className={`text-lg font-black leading-none mt-0.5 ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          {[
            ['dispense', 'Dispensing'],
            ['inventory', 'Stock']
          ].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                tab === t
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)]'
                  : 'bg-[var(--bg-color)] text-[var(--text-secondary)] border border-[var(--border-color)]/40'
              }`}
            >
              {label}
              {t === 'inventory' && stats && stats.outOfStock + stats.lowStock > 0
                ? ` (${stats.outOfStock + stats.lowStock})`
                : ''}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {['pending', 'all'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                filter === f
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)]'
                  : 'bg-[var(--bg-color)] text-[var(--text-secondary)] border border-[var(--border-color)]/40'
              }`}
            >
              {f === 'pending' ? 'To Dispense' : 'All'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
            Prescriptions ({visibleTokens.length})
          </h4>
          {loading ? (
            <div className="text-xs text-[var(--text-secondary)] italic">Loading prescriptions...</div>
          ) : visibleTokens.length === 0 ? (
            <div className="text-xs text-[var(--text-secondary)]/50 italic py-4">
              No prescriptions to dispense.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTokens.map((tok) => (
                <div
                  key={tok._id}
                  onClick={() => setSelectedToken(tok)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                    selectedToken?._id === tok._id
                      ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--text-color)] shadow-sm'
                      : 'bg-[var(--card-bg)] border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/10'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-xs flex items-center gap-1">
                      {tok.tokenNumber}
                      {/* Warn BEFORE the patient is called forward. */}
                      {!isDispensed(tok) && tok.hasShortage && (
                        <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black">
                          SHORT
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5 truncate">
                      {tok.patient?.name}
                    </p>
                  </div>
                  {isDispensed(tok) ? (
                    <span className="bg-emerald-500/15 text-emerald-500 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                      Dispensed
                    </span>
                  ) : (
                    <span className="bg-amber-500/15 text-amber-500 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                      {tok.prescription?.medicines?.length || 0} Med
                      {(tok.prescription?.medicines?.length || 0) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <LiveActivityFeed token={pharmacyToken} title="Hospital Activity" limit={20} compact />
      </div>

      {/* Right workstation pane */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)] text-left">
        <h3 className="text-xs uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
          {tab === 'inventory' ? 'Medicine Stock' : 'Medicine Dispensing Station'}
        </h3>

        {flash && (
          <div
            className={`rounded-xl px-4 py-3 text-xs font-bold flex items-start gap-2 ${
              flash.includes('NOT available')
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {flash.includes('NOT available') ? 'warning' : 'check_circle'}
            </span>
            <span>{flash}</span>
          </div>
        )}

        {tab === 'inventory' ? (
          <div className="space-y-5">
            {/* Add or restock. Re-entering an existing name tops it up rather
                than creating a duplicate row. */}
            <form
              onSubmit={handleAddMedicine}
              className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 shadow-[var(--card-shadow)] space-y-3"
            >
              <h4 className="text-sm font-bold">Add / restock medicine</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <input
                  required
                  placeholder="Medicine name"
                  value={newMed.name}
                  onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
                <input
                  placeholder="Strength (500 mg)"
                  value={newMed.strength}
                  onChange={(e) => setNewMed({ ...newMed, strength: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Quantity"
                  value={newMed.stockQty}
                  onChange={(e) => setNewMed({ ...newMed, stockQty: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
                <input
                  placeholder="Unit (strip)"
                  value={newMed.unit}
                  onChange={(e) => setNewMed({ ...newMed, unit: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Reorder at"
                  value={newMed.reorderLevel}
                  onChange={(e) => setNewMed({ ...newMed, reorderLevel: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
                <input
                  type="date"
                  value={newMed.expiryDate}
                  onChange={(e) => setNewMed({ ...newMed, expiryDate: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--primary-color)] text-[var(--primary-text)] text-xs font-bold rounded-lg active:scale-95 transition-all"
              >
                Save to stock
              </button>
            </form>

            <input
              placeholder="Search stock…"
              value={invQuery}
              onChange={(e) => setInvQuery(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-xs font-semibold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
            />

            <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden divide-y divide-[var(--border-color)]/20">
              {inventory.length === 0 ? (
                <p className="p-6 text-xs text-[var(--text-secondary)] text-center font-medium">
                  No medicines in stock yet. Add the ones you keep at the counter so doctors can see
                  availability while prescribing.
                </p>
              ) : (
                inventory.map((m) => (
                  <div key={m._id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-sm flex items-center gap-2">
                        {m.name}
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-black ${LEVEL_BADGE[m.level]}`}
                        >
                          {LEVEL_TEXT[m.level]}
                        </span>
                        {m.expiry && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-500/15 text-rose-500">
                            {m.expiry === 'expired' ? 'EXPIRED' : 'EXPIRING'}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                        {[m.strength, m.form].filter(Boolean).join(' • ')} — {m.stockQty} {m.unit} in hand
                        (reorder at {m.reorderLevel})
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        defaultValue={m.stockQty}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== m.stockQty) handleSetStock(m._id, e.target.value);
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-bold text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                      />
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold">set count</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : selectedToken ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-[var(--border-color)]/30">
              <div>
                <span className="text-xs font-bold text-[var(--primary-color)] uppercase tracking-wider">
                  Prescription For
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-1">{selectedToken.patient?.name}</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                  Age: {selectedToken.patient?.age} | Gender: {selectedToken.patient?.gender} | Phone:{' '}
                  {selectedToken.patient?.phone}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">
                  Prescribed by: {selectedToken.doctor?.name} ({selectedToken.doctor?.department})
                </p>
              </div>
              <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 rounded-2xl px-4 py-2 text-center shrink-0">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
                  Token
                </span>
                <p className="text-xl font-black text-[var(--primary-color)]">{selectedToken.tokenNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[var(--text-color)]">Prescribed Medicines</h4>
              <div className="space-y-3">
                {(selectedToken.prescription?.medicines || []).map((med, i) => {
                  // Live availability for THIS line, computed by the server.
                  const stock = (selectedToken.stock || []).find((s) => s.requested === med.name);
                  const level = stock ? stock.level : null;
                  return (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border flex items-start space-x-3 ${
                        level === 'out' || level === 'unknown'
                          ? 'bg-rose-500/5 border-rose-500/40'
                          : 'bg-[var(--bg-color)] border-[var(--border-color)]/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">
                        pill
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm flex items-center gap-2 flex-wrap">
                          {med.name}
                          {level && (
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-black ${LEVEL_BADGE[level]}`}
                            >
                              {LEVEL_TEXT[level]}
                              {stock.stockQty ? ` • ${stock.stockQty} ${stock.unit || ''}` : ''}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                          {[med.dosage, med.duration, med.instructions].filter(Boolean).join(' • ') ||
                            'As directed'}
                        </p>
                        {level === 'unknown' && (
                          <p className="text-[10px] text-rose-500 font-bold mt-1">
                            Not in your stock list — add it under the Stock tab if you carry it.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedToken.hasShortage && !isDispensed(selectedToken) && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-xs font-bold flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>
                    Some medicines on this prescription are unavailable. Dispensing will record the shortage
                    and notify the patient and the prescribing doctor.
                  </span>
                </div>
              )}

              {selectedToken.prescription?.partialNote && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl px-4 py-3 text-xs font-bold">
                  {selectedToken.prescription.partialNote}
                </div>
              )}

              {selectedToken.prescription?.advice && (
                <div className="bg-[var(--bg-color)] p-3 rounded-xl border border-[var(--border-color)]/40 text-xs">
                  <span className="font-extrabold text-[var(--text-secondary)] uppercase tracking-wide text-[10px]">
                    Doctor's Advice
                  </span>
                  <p className="mt-1 font-medium text-[var(--text-color)]">
                    {selectedToken.prescription.advice}
                  </p>
                </div>
              )}

              {isDispensed(selectedToken) ? (
                <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl px-4 py-3 text-sm font-bold">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>
                    Dispensed
                    {selectedToken.prescription?.dispensedAt
                      ? ' on ' + new Date(selectedToken.prescription.dispensedAt).toLocaleString()
                      : ''}
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => handleDispense(selectedToken._id)}
                  className="w-full py-3 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                  <span>Mark Medicines Dispensed</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[var(--text-secondary)]/50 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/20">
            <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--text-secondary)]/30">
              local_pharmacy
            </span>
            <p className="text-sm font-bold text-[var(--text-color)]">Dispensing Station is Idle</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mt-1.5 font-medium">
              Select a patient prescription on the left rail to review medicines and mark them dispensed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
