import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../App';
import { openStoredDocument } from '../lib/storedDocument';

/**
 * One patient's whole record, opened from anywhere a doctor can see their name.
 *
 * The cabin console could only ever show the visit in front of it plus a short
 * list of past visits, and reports were visible only on the visit that ordered
 * them. So the two questions a doctor actually asks between patients — "what
 * have we treated this person for?" and "what did their last test say?" — could
 * not be answered without walking to reception for the paper file.
 *
 * Three tabs because those are three different reading modes: the summary is
 * scanned, the visit timeline is read, and the reports are compared. Reports
 * lead with the abnormal count for the same reason.
 */

const TABS = [
  { key: 'summary', label: 'Summary', icon: 'person' },
  { key: 'visits', label: 'Visits', icon: 'history' },
  { key: 'reports', label: 'Lab Reports', icon: 'science' }
];

const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

function Stat({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-[var(--text-color)]',
    warn: 'text-amber-500',
    bad: 'text-rose-500',
    good: 'text-emerald-500'
  };
  return (
    <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-xl px-3 py-2.5">
      <p className="text-[11px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">{label}</p>
      <p className={`text-lg font-black leading-tight ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export default function PatientProfileModal({ patientId, authToken, onClose }) {
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patientId) return undefined;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/doctor/patients/${patientId}/profile`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message || 'Could not open this patient record.');
        setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId, authToken]);

  // Escape closes, like every other overlay in the console.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!patientId) return null;

  const patient = profile?.patient;
  const summary = profile?.summary;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl max-w-3xl w-full shadow-2xl animate-fade-in text-[var(--text-color)] text-left max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-color)]/30 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[11px] uppercase font-extrabold text-[var(--primary-color)] tracking-wider">
              Patient Record
            </span>
            <h3 className="text-2xl font-extrabold tracking-tight truncate">
              {patient?.name || (loading ? 'Opening…' : 'Patient')}
            </h3>
            {patient && (
              <p className="text-[13px] text-[var(--text-secondary)] font-medium mt-0.5">
                {patient.age}y · {patient.gender} · {patient.phone} · with us since{' '}
                {shortDate(patient.registeredOn)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-full bg-[var(--bg-color)] border border-[var(--border-color)]/40 flex items-center justify-center hover:bg-rose-500/10 hover:text-rose-500 transition-all"
            aria-label="Close patient record"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-1 border-b border-[var(--border-color)]/30">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 text-[13px] font-bold rounded-t-lg flex items-center gap-1.5 border-b-2 transition-all ${
                tab === t.key
                  ? 'border-[var(--primary-color)] text-[var(--primary-color)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-color)]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
              <span>{t.label}</span>
              {t.key === 'reports' && summary?.totalReports ? (
                <span className="text-[11px] font-black opacity-70">({summary.totalReports})</span>
              ) : null}
              {t.key === 'visits' && summary?.totalVisits ? (
                <span className="text-[11px] font-black opacity-70">({summary.totalVisits})</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-[13px]">
          {loading && <p className="text-[var(--text-secondary)] font-medium py-6">Opening the record…</p>}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl font-bold">
              {error}
            </div>
          )}

          {!loading && !error && profile && (
            <>
              {tab === 'summary' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <Stat label="Visits" value={summary.totalVisits} />
                    <Stat label="Last seen" value={shortDate(summary.lastVisit)} />
                    <Stat
                      label="Abnormal results"
                      value={summary.abnormalReports}
                      tone={summary.abnormalReports > 0 ? 'bad' : 'good'}
                    />
                    <Stat
                      label="Missed visits"
                      value={summary.missedVisits}
                      tone={summary.missedVisits > 0 ? 'warn' : 'neutral'}
                    />
                  </div>

                  {summary.pendingReports > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-600 rounded-xl font-bold">
                      {summary.pendingReports} test{summary.pendingReports === 1 ? '' : 's'} still with the
                      lab.
                    </div>
                  )}

                  <div>
                    <h4 className="text-[12px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider mb-2">
                      Medicines this patient has been on
                    </h4>
                    {profile.medicines.length === 0 ? (
                      <p className="text-[var(--text-secondary)]/60 italic font-medium">
                        Nothing has been prescribed here yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {profile.medicines.map((m) => (
                          <div
                            key={m.name}
                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--bg-color)] border border-[var(--border-color)]/30"
                          >
                            <div className="min-w-0">
                              <span className="font-bold truncate">{m.name}</span>
                              <span className="text-[var(--text-secondary)] font-medium">
                                {m.dosage ? ` · ${m.dosage}` : ''}
                                {m.duration ? ` · ${m.duration}` : ''}
                              </span>
                            </div>
                            <span className="text-[11px] text-[var(--text-secondary)] font-bold shrink-0">
                              {shortDate(m.lastPrescribed)}
                              {m.by ? ` · ${m.by}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* The most recent abnormal values, which is what a doctor
                      scans a record for before anything else. */}
                  {profile.reports.some((r) => r.abnormal) && (
                    <div>
                      <h4 className="text-[12px] uppercase font-extrabold text-rose-500 tracking-wider mb-2">
                        Out-of-range results
                      </h4>
                      <div className="space-y-1.5">
                        {profile.reports
                          .filter((r) => r.abnormal)
                          .slice(0, 5)
                          .map((r, i) => (
                            <div
                              key={`${r.tokenNumber}-${r.testName}-${i}`}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/25"
                            >
                              <span className="font-bold truncate">{r.testName}</span>
                              <span className="text-rose-500 font-black shrink-0">
                                {r.resultValue}
                                {r.unit ? ` ${r.unit}` : ''}
                                {r.normalRange ? ` (ref ${r.normalRange})` : ''}
                              </span>
                              <span className="text-[11px] text-[var(--text-secondary)] font-bold shrink-0">
                                {shortDate(r.completedAt)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'visits' && (
                <div className="space-y-2.5">
                  {profile.visits.length === 0 ? (
                    <p className="text-[var(--text-secondary)]/60 italic font-medium">
                      No visits recorded at this facility.
                    </p>
                  ) : (
                    profile.visits.map((v) => (
                      <div
                        key={v._id}
                        className="rounded-xl border border-[var(--border-color)]/30 bg-[var(--bg-color)] p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold uppercase text-[var(--primary-color)]">
                              {v.tokenNumber}
                            </span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-black uppercase ${
                                v.status === 'Completed'
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : v.status === 'Absent'
                                    ? 'bg-zinc-500/15 text-zinc-500'
                                    : 'bg-amber-500/15 text-amber-500'
                              }`}
                            >
                              {v.status === 'Completed' ? v.journeyStage || 'Completed' : v.status}
                            </span>
                          </div>
                          <span className="text-[12px] font-bold text-[var(--text-secondary)]">
                            {shortDate(v.completedAt || v.createdAt)}
                            {v.doctor ? ` · ${v.doctor.name}` : ''}
                          </span>
                        </div>

                        <p className="font-medium">
                          <span className="font-bold text-[var(--text-secondary)]">Symptoms:</span>{' '}
                          {v.symptoms || '—'}
                        </p>

                        {v.prescription?.medicines?.length > 0 && (
                          <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                            <span className="font-bold">Prescribed:</span>{' '}
                            {v.prescription.medicines.map((m) => `${m.name} (${m.dosage})`).join(', ')}
                            {v.prescription.dispensed ? ' · dispensed' : ' · not yet dispensed'}
                          </p>
                        )}
                        {v.prescription?.advice && (
                          <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                            <span className="font-bold">Advice:</span> {v.prescription.advice}
                          </p>
                        )}

                        {v.labTests?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {v.labTests.map((t) => (
                              <span
                                key={t.testName}
                                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                  t.status !== 'Completed'
                                    ? 'bg-amber-500/15 text-amber-500'
                                    : t.abnormal
                                      ? 'bg-rose-500/15 text-rose-500'
                                      : 'bg-emerald-500/15 text-emerald-500'
                                }`}
                              >
                                {t.testName}
                                {t.status === 'Completed'
                                  ? `: ${t.resultValue || 'done'}${t.abnormal ? ' ⚠️' : ''}`
                                  : ': pending'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'reports' && (
                <div className="space-y-2">
                  {profile.reports.length === 0 ? (
                    <p className="text-[var(--text-secondary)]/60 italic font-medium">
                      No tests have been ordered for this patient here.
                    </p>
                  ) : (
                    profile.reports.map((r, i) => (
                      <div
                        key={`${r.tokenNumber}-${r.testName}-${i}`}
                        className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          r.abnormal
                            ? 'border-rose-500/40 bg-rose-500/5'
                            : 'border-[var(--border-color)]/30 bg-[var(--bg-color)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold">{r.testName}</span>
                            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                              {r.tokenNumber} · {shortDate(r.completedAt || r.orderedOn)}
                            </span>
                          </div>
                          <p
                            className={`text-[12px] font-bold mt-0.5 ${
                              r.abnormal ? 'text-rose-500' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {r.status === 'Completed'
                              ? `${r.resultValue || r.remarks || 'Completed'}${r.unit ? ` ${r.unit}` : ''}${
                                  r.normalRange ? ` (ref ${r.normalRange})` : ''
                                }${r.abnormal ? ' ⚠️ ABNORMAL' : ''}`
                              : r.status === 'Collected'
                                ? 'Sample taken — result awaited'
                                : 'Awaiting sample'}
                          </p>
                          {r.sharedWithPatientAt && (
                            <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                              Sent to the patient on {shortDate(r.sharedWithPatientAt)}
                            </p>
                          )}
                        </div>

                        {r.reportPdf && (
                          <button
                            type="button"
                            onClick={() => openStoredDocument(r.reportPdf, r.reportFileName)}
                            className="shrink-0 px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg text-[12px] flex items-center gap-1 shadow-sm transition-all"
                          >
                            <span className="material-symbols-outlined text-[14px]">description</span>
                            <span>Open report</span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
