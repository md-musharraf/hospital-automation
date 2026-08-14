import React, { useState, useEffect, useCallback, useMemo } from 'react';
import createApi from '../lib/api';
import useFacilitySocket from '../hooks/useFacilitySocket';
import useLiveRefresh from '../hooks/useLiveRefresh';
import LiveActivityFeed from './LiveActivityFeed';
import HelpPanel from './HelpPanel';
import EmptyState from './EmptyState';
import useFacilityFromUrl from '../hooks/useFacilityFromUrl';

export function LabDashboard({ labToken, labUser, onLogout }) {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [results, setResults] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  // Which test's report is mid-upload, so the bench sees the file is still going.
  const [uploading, setUploading] = useState('');

  // Put this bench in its facility's realtime rooms so it receives lab events
  // for THIS hospital only.
  useFacilitySocket('lab', labUser?.hospital);

  const api = useMemo(() => createApi(labToken), [labToken]);

  const refresh = useCallback(async () => {
    try {
      const [pending, latestStats] = await Promise.all([
        api.get('/lab/queues/pending-tests'),
        api.get('/lab/stats')
      ]);
      setTokens(pending);
      // Keep the open worksheet in sync when the order changes underneath us.
      setSelectedToken((prev) => (prev ? pending.find((t) => t._id === prev._id) || null : null));
      setStats(latestStats);
    } catch (err) {
      if (err.isAuthError) return onLogout();
      console.error('Lab refresh failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [api, onLogout]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // `lab-updated` fires the moment a doctor orders a test. Coalesced, so the
  // burst of events one clinical action produces causes a single refetch.
  useLiveRefresh(['lab-updated', 'queue-updated', 'queue-reset'], refresh);

  const keyOf = (tokenId, testName) => `${tokenId}-${testName}`;
  const setField = (tokenId, testName, field, value) =>
    setResults((prev) => ({
      ...prev,
      [keyOf(tokenId, testName)]: { ...(prev[keyOf(tokenId, testName)] || {}), [field]: value }
    }));

  const handleCollect = async (tokenId, testName) => {
    try {
      await api.post(`/lab/tests/${tokenId}/collect`, { testName });
      setFlash(`Sample logged for ${testName}.`);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * File a report PDF against a test.
   *
   * Preferred path is object storage: the browser asks this server to sign a
   * one-object upload, PUTs the file straight to R2, and only the resulting URL
   * is stored on the test. The fallback inlines the file as a base64 data URI,
   * which is what this did for every upload before R2 existed — and is why it is
   * only a fallback. A 5MB report becomes ~6.7MB of base64 inside the token
   * document, and MongoDB stops at 16MB, so two or three reports on one patient
   * could make that record unsaveable. It stays for deployments with no R2 keys,
   * where the alternative is losing the feature outright.
   */
  const inlineAsDataUri = (tokenId, testName, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setField(tokenId, testName, 'reportPdf', e.target.result);
      setField(tokenId, testName, 'reportFileName', file.name);
      if (!results[keyOf(tokenId, testName)]?.resultValue) {
        setField(tokenId, testName, 'resultValue', 'PDF Report Attached');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = async (tokenId, testName, file) => {
    if (!file) return;
    setError('');

    if (file.type && file.type !== 'application/pdf') {
      setError(`A lab report must be a PDF — that file is a ${file.type}.`);
      return;
    }

    setUploading(keyOf(tokenId, testName));
    try {
      const ticket = await api.post('/uploads/r2/report-auth', {
        tokenId,
        fileName: file.name,
        contentType: 'application/pdf',
        size: file.size
      });

      // Only `host` is signed, so the content type is ours to set and cannot
      // cause a signature mismatch.
      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' }
      });
      if (!put.ok) throw new Error(`Storage rejected the upload (${put.status}).`);

      setField(tokenId, testName, 'reportPdf', ticket.shareUrl);
      setField(tokenId, testName, 'reportFileName', file.name);
      if (!results[keyOf(tokenId, testName)]?.resultValue) {
        setField(tokenId, testName, 'resultValue', 'PDF Report Attached');
      }
    } catch (err) {
      // 501 means this server has no R2 configured — expected, not a failure.
      if (err.status === 501) {
        inlineAsDataUri(tokenId, testName, file);
      } else {
        setError(err.message || 'Could not upload the report. Please try again.');
      }
    } finally {
      setUploading('');
    }
  };

  const handleCompleteTest = async (tokenId, testName) => {
    const entry = results[keyOf(tokenId, testName)] || {};
    try {
      const data = await api.post(`/lab/tests/${tokenId}/complete`, {
        testName,
        resultValue: entry.resultValue || (entry.reportPdf ? 'PDF Report Attached' : 'Normal'),
        unit: entry.unit || '',
        normalRange: entry.normalRange || '',
        abnormal: Boolean(entry.abnormal),
        remarks: entry.remarks || 'Completed successfully.',
        reportPdf: entry.reportPdf || '',
        reportFileName: entry.reportFileName || ''
      });
      // Tell the bench what just happened downstream — the doctor has already
      // been notified and the patient has been told to walk back.
      setFlash(
        data.allComplete
          ? 'All reports for this patient are done — the doctor has been notified and the patient told to return.'
          : `${testName} result sent to the doctor.`
      );
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="flex-grow flex flex-col md:flex-row overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Left panel: list of patient tokens with pending lab tests */}
      <div className="w-full md:w-80 max-h-[35vh] md:max-h-none bg-[var(--card-bg)] border-b md:border-b-0 md:border-r border-[var(--border-color)]/30 p-5 flex flex-col space-y-5 overflow-y-auto shadow-inner shrink-0 text-left">
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]/30">
          <div>
            <h3 className="font-extrabold text-[var(--text-color)] text-base">{labUser?.name}</h3>
            <p className="text-[12px] text-[var(--primary-color)] font-bold uppercase tracking-wider mt-0.5">
              Lab Assistant
            </p>
          </div>
          <button
            onClick={onLogout}
            className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[12px] font-extrabold rounded-lg hover:bg-rose-500 hover:text-white transition-all shrink-0 active:scale-95 duration-100"
          >
            Logout
          </button>
        </div>

        {/* Live workload — what the bench is actually carrying right now. */}
        {stats && (
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Pending',
                value: stats.pending,
                tone: stats.pending > 0 ? 'text-amber-500' : 'text-[var(--text-color)]'
              },
              {
                label: 'Urgent',
                value: stats.urgentPending,
                tone: stats.urgentPending > 0 ? 'text-rose-500' : 'text-[var(--text-color)]'
              },
              { label: 'Done today', value: stats.completedToday, tone: 'text-emerald-500' },
              { label: 'Avg TAT', value: `${stats.avgTurnaroundMins}m`, tone: 'text-[var(--primary-color)]' }
            ].map((s) => (
              <div
                key={s.label}
                className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-xl px-2.5 py-2"
              >
                <p className="text-[11px] uppercase font-bold text-[var(--text-secondary)] tracking-wide">
                  {s.label}
                </p>
                <p className={`text-lg font-black leading-none mt-0.5 ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-[13px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
            Patients Queue ({tokens.length})
          </h4>
          {loading ? (
            <div className="text-[13px] text-[var(--text-secondary)] italic">
              Loading active test orders...
            </div>
          ) : tokens.length === 0 ? (
            <EmptyState
              icon="science"
              title="No tests waiting"
              hint="When a doctor orders a test it appears here within a second — you do not need to refresh. Urgent orders show first, in red."
            />
          ) : (
            <div className="space-y-2">
              {tokens.map((tok) => {
                const outstanding = tok.labTests.filter((t) => t.status !== 'Completed');
                const isUrgent = outstanding.some((t) => t.urgency === 'Urgent');
                return (
                  <div
                    key={tok._id}
                    onClick={() => setSelectedToken(tok)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                      selectedToken?._id === tok._id
                        ? 'bg-[var(--primary-color)]/10 border-[var(--primary-color)] text-[var(--text-color)] shadow-sm'
                        : isUrgent
                          ? 'bg-rose-500/5 border-rose-500/40 hover:bg-rose-500/10'
                          : 'bg-[var(--card-bg)] border-[var(--border-color)]/30 hover:bg-[var(--border-color)]/10'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-extrabold text-[13px] flex items-center gap-1">
                        {tok.tokenNumber}
                        {isUrgent && (
                          <span className="text-[11px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black">
                            URGENT
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] font-medium mt-0.5 truncate">
                        {tok.patient?.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]/70 font-medium truncate">
                        {tok.doctor?.name || 'Doctor'}
                      </p>
                    </div>
                    <span className="bg-[var(--primary-color)] text-[var(--primary-text)] text-[11px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                      {outstanding.length} Test{outstanding.length > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* The rest of the hospital, live. */}
        <LiveActivityFeed token={labToken} title="Hospital Activity" limit={20} compact />
      </div>

      {/* Right workstation pane */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col space-y-6 bg-[var(--bg-color)] text-left">
        <h3 className="text-[13px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
          Lab Testing Station
        </h3>

        {flash && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {flash}
          </div>
        )}

        {/* A failed submission must be visible: the bench has to know the result
            did NOT reach the doctor. This used to be an alert() or a console log. */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError('')}
              className="text-[12px] font-black opacity-60 hover:opacity-100"
            >
              DISMISS
            </button>
          </div>
        )}

        <HelpPanel
          id="lab"
          title="How the lab console works"
          steps={[
            'Doctors order tests from their cabin — the patient appears in the list on the left automatically.',
            'When the patient hands over their sample, press "Log sample collected" so the doctor can see it is in progress.',
            'Enter the result value, its unit and the normal range, then press "Send to doctor".',
            'Tick "Abnormal" if the value is outside the normal range — the doctor sees it highlighted in red immediately.'
          ]}
          tip="Once every test for a patient is filed, the doctor is notified and the patient is told by WhatsApp to walk straight back to the cabin — they do not need a new token."
        />

        {selectedToken ? (
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-6 shadow-[var(--card-shadow)] space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-[var(--border-color)]/30">
              <div>
                <span className="text-[13px] font-bold text-[var(--primary-color)] uppercase tracking-wider">
                  Active Patient under Test
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-1">{selectedToken.patient?.name}</h2>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-medium">
                  Age: {selectedToken.patient?.age} | Gender: {selectedToken.patient?.gender} | Phone:{' '}
                  {selectedToken.patient?.phone}
                </p>
              </div>
              <div className="bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 rounded-2xl px-4 py-2 text-center shrink-0">
                <span className="text-[12px] text-[var(--text-secondary)] uppercase font-semibold">
                  Token Number
                </span>
                <p className="text-xl font-black text-[var(--primary-color)]">{selectedToken.tokenNumber}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-bold text-[var(--text-color)]">
                  Requested Diagnoses / Clinical Tests
                </h4>
                <span className="text-[12px] font-bold text-[var(--text-secondary)]">
                  Ordered by {selectedToken.doctor?.name || 'the doctor'}
                </span>
              </div>

              <div className="space-y-3">
                {selectedToken.labTests
                  .filter((t) => t.status !== 'Completed')
                  .map((test) => {
                    const entry = results[`${selectedToken._id}-${test.testName}`] || {};
                    return (
                      <div
                        key={test.testName}
                        className="bg-[var(--bg-color)] p-4 rounded-xl border border-[var(--border-color)]/50 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center space-x-3">
                            <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">
                              science
                            </span>
                            <span className="font-bold text-[15px]">{test.testName}</span>
                            {test.urgency === 'Urgent' && (
                              <span className="text-[11px] bg-rose-500 text-white px-2 py-0.5 rounded-full font-black">
                                URGENT
                              </span>
                            )}
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                test.status === 'Collected'
                                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {test.status === 'Collected' ? 'Sample collected' : 'Awaiting sample'}
                            </span>
                          </div>
                          {test.status === 'Pending' && (
                            <button
                              onClick={() => handleCollect(selectedToken._id, test.testName)}
                              className="px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[13px] font-bold rounded-lg hover:bg-sky-500 hover:text-white transition-all active:scale-95"
                            >
                              Log sample collected
                            </button>
                          )}
                        </div>

                        {/* Structured result: a number the doctor can act on, with the
                          reference range and an explicit out-of-range flag. */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            placeholder="Result value"
                            value={entry.resultValue || ''}
                            onChange={(e) =>
                              setField(selectedToken._id, test.testName, 'resultValue', e.target.value)
                            }
                            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-[13px] text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                          />
                          <input
                            type="text"
                            placeholder="Unit (g/dL)"
                            value={entry.unit || ''}
                            onChange={(e) =>
                              setField(selectedToken._id, test.testName, 'unit', e.target.value)
                            }
                            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-[13px] text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                          />
                          <input
                            type="text"
                            placeholder="Normal range"
                            value={entry.normalRange || ''}
                            onChange={(e) =>
                              setField(selectedToken._id, test.testName, 'normalRange', e.target.value)
                            }
                            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-[13px] text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                          />
                          <label
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer text-[13px] font-bold transition-all ${
                              entry.abnormal
                                ? 'bg-rose-500 border-rose-500 text-white'
                                : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-rose-500/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={Boolean(entry.abnormal)}
                              onChange={(e) =>
                                setField(selectedToken._id, test.testName, 'abnormal', e.target.checked)
                              }
                            />
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            Abnormal
                          </label>
                        </div>

                        {/* PDF Upload Option */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2.5 bg-[var(--bg-color)]/60 rounded-xl border border-[var(--border-color)]/40 text-[13px]">
                          <label
                            className={`flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white font-bold rounded-lg transition-all shrink-0 ${
                              uploading === keyOf(selectedToken._id, test.testName)
                                ? 'opacity-60 cursor-wait'
                                : 'hover:bg-teal-500 cursor-pointer'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {uploading === keyOf(selectedToken._id, test.testName)
                                ? 'hourglass_top'
                                : 'picture_as_pdf'}
                            </span>
                            <span>
                              {uploading === keyOf(selectedToken._id, test.testName)
                                ? 'Uploading…'
                                : entry.reportFileName
                                  ? 'Change PDF Report'
                                  : 'Attach PDF Test Report'}
                            </span>
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={uploading === keyOf(selectedToken._id, test.testName)}
                              onChange={(e) =>
                                handlePdfUpload(selectedToken._id, test.testName, e.target.files[0])
                              }
                            />
                          </label>
                          {entry.reportFileName && (
                            <span className="text-[13px] font-extrabold text-teal-600 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20 truncate max-w-xs">
                              📄 {entry.reportFileName}
                            </span>
                          )}
                          {test.reportPdf && !entry.reportPdf && (
                            <a
                              href={test.reportPdf}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] font-extrabold text-sky-600 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 underline"
                            >
                              📄 View Existing PDF Report
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            placeholder="Remarks for the doctor (optional)"
                            value={entry.remarks || ''}
                            onChange={(e) =>
                              setField(selectedToken._id, test.testName, 'remarks', e.target.value)
                            }
                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] text-[13px] text-[var(--text-color)] outline-none focus:ring-1 focus:ring-[var(--primary-color)] font-semibold"
                          />
                          <button
                            onClick={() => handleCompleteTest(selectedToken._id, test.testName)}
                            className="px-4 py-2 bg-[var(--tertiary-color)] hover:bg-[var(--tertiary-color)]/90 text-white text-[13px] font-bold rounded-lg shadow-sm transition-all active:scale-95 duration-100 whitespace-nowrap"
                          >
                            Send to doctor
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Reports already filed for this patient. */}
              {selectedToken.labTests.some((t) => t.status === 'Completed') && (
                <div className="pt-3 border-t border-[var(--border-color)]/30 space-y-2">
                  <h5 className="text-[13px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">
                    Filed reports
                  </h5>
                  {selectedToken.labTests
                    .filter((t) => t.status === 'Completed')
                    .map((t) => (
                      <div
                        key={t.testName}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[13px] ${
                          t.abnormal
                            ? 'border-rose-500/40 bg-rose-500/5'
                            : 'border-[var(--border-color)]/40 bg-[var(--bg-color)]'
                        }`}
                      >
                        <span className="font-bold">{t.testName}</span>
                        <span
                          className={`font-semibold ${t.abnormal ? 'text-rose-500' : 'text-[var(--text-secondary)]'}`}
                        >
                          {t.resultValue || t.remarks}
                          {t.unit ? ` ${t.unit}` : ''}
                          {t.normalRange ? ` (ref ${t.normalRange})` : ''}
                          {t.abnormal ? ' ⚠️' : ''}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[var(--text-secondary)]/50 border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/20">
            <span className="material-symbols-outlined text-[48px] mb-3 text-[var(--text-secondary)]/30">
              science
            </span>
            <p className="text-[15px] font-bold text-[var(--text-color)]">Pick a patient</p>
            <p className="text-[13px] text-[var(--text-secondary)] max-w-xs mt-1.5 font-medium">
              Tap a patient in the list on the left to log their sample and enter results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
