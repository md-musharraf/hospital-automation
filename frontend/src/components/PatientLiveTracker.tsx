import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { BACKEND_URL, socket } from '../App';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PatientLiveTracker() {
  const { tokenId } = useParams();
  const [data, setData] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Subscription states
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  const loadTracker = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/token/${tokenId}`);
      const d = await res.json();
      if (res.ok) {
        setData(d);
      } else {
        setError(d.message || 'Token details not found');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoice = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/billing/token/${tokenId}`);
      if (res.ok) {
        const inv = await res.json();
        if (inv && !inv.message) {
          setInvoice(inv);
        }
      }
    } catch (err) {
      console.error('Error loading billing for tracker:', err);
    }
  };

  useEffect(() => {
    loadTracker();
    loadInvoice();

    // The shared socket may have given up earlier (e.g. the backend was
    // restarting); a tracker showing a frozen queue position is worse than one
    // that reconnects itself.
    if (!socket.connected) socket.connect();
    socket.emit('join-room', 'queue:global');
    // The patient's own room receives targeted journey updates (sent to the lab,
    // reports ready, medicines dispensed, billing updates) without a page refresh.
    socket.emit('join-room', `patient:${tokenId}`);
    const handleUpdate = () => {
      loadTracker();
      loadInvoice();
    };
    socket.on('queue-updated', handleUpdate);
    socket.on('journey-updated', handleUpdate);
    socket.on('billing-updated', handleUpdate);
    // Emitted into this patient's own room the moment their doctor announces a
    // delay. Without it the banner would only appear on the next queue event,
    // which for a patient sitting still on this page could be several minutes
    // after the WhatsApp telling them the same thing already arrived.
    socket.on('queue-delayed', handleUpdate);
    // "Set off now", and "you have been moved back a few places". Both change
    // what this screen should be telling the patient to DO, so both have to
    // land here as fast as the WhatsApp carrying the same news.
    socket.on('departure-alert', handleUpdate);
    socket.on('token-deferred', handleUpdate);

    return () => {
      socket.off('queue-updated', handleUpdate);
      socket.off('journey-updated', handleUpdate);
      socket.off('billing-updated', handleUpdate);
      socket.off('queue-delayed', handleUpdate);
      socket.off('departure-alert', handleUpdate);
      socket.off('token-deferred', handleUpdate);
    };
  }, [tokenId]);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setIsSubscribed(true);
          }
        });
      });
    }
  }, []);

  const handleSubscribe = async () => {
    if (!pushSupported) return;
    setSubscribing(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied. Please allow notifications in browser settings.');
        setSubscribing(false);
        return;
      }

      const keyRes = await fetch(`${BACKEND_URL}/api/v1/notifications/vapid-key`);
      const keyData = await keyRes.json();
      if (!keyRes.ok) {
        throw new Error(keyData.message || 'Failed to fetch public VAPID key');
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });

      const subRes = await fetch(`${BACKEND_URL}/api/v1/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: sub,
          tokenId,
          role: 'Patient'
        })
      });

      if (subRes.ok) {
        setIsSubscribed(true);
      } else {
        const subErr = await subRes.json();
        throw new Error(subErr.message || 'Failed to register subscription on server');
      }
    } catch (err) {
      console.error('Subscription error:', err);
      alert('Subscription failed: ' + err.message);
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-[var(--text-secondary)] font-bold text-sm">Synchronizing queue tracker...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-grow flex items-center justify-center p-6 bg-[var(--bg-color)]">
        <div className="text-rose-500 font-bold text-sm border border-rose-500/20 bg-rose-500/5 px-4 py-3 rounded-xl">
          {error || 'Tracker failed'}
        </div>
      </div>
    );
  }

  const { token, position, journey, delay } = data;
  const inCabin = position === 0;
  // The visit as the patient experiences it. Before this they only saw a queue
  // position and had no idea they were meant to go to the lab or the pharmacy.
  // 'Completed' is the last step, and it has to be here.
  //
  // Without it, a finished visit landed on a stage the rail did not contain,
  // `indexOf` returned -1, and every step rendered as not-yet-reached — so the
  // patient who had just been discharged saw a progress bar showing they had
  // not started. The end of the journey is exactly when a patient looks.
  const JOURNEY_STEPS = [
    'Waiting',
    'In Consultation',
    'Lab Pending',
    'Lab Complete',
    'Pharmacy Pending',
    'Dispensed',
    'Completed'
  ];
  const stepLabels = {
    Waiting: 'In queue',
    'In Consultation': 'With doctor',
    'Lab Pending': 'Lab tests',
    'Lab Complete': 'Reports ready',
    'Pharmacy Pending': 'Pharmacy',
    Dispensed: 'Medicines',
    Completed: 'Done'
  };
  const currentStage = journey?.stage || 'Waiting';
  // Steps that don't apply to this visit (no tests / no medicines) are skipped.
  const relevantSteps = JOURNEY_STEPS.filter((s) => {
    if (s === 'Lab Pending' || s === 'Lab Complete')
      return (journey?.labPending || 0) + (journey?.labReady || 0) > 0;
    if (s === 'Pharmacy Pending' || s === 'Dispensed') return journey?.medicinesReady;
    return true;
  });
  // 'Absent' is not on the rail either, and neither is any stage a future
  // release adds. Falling back to the last step for a finished visit beats
  // showing a patient a bar with nothing on it.
  const rawIdx = relevantSteps.indexOf(currentStage);
  const currentIdx = rawIdx >= 0 ? rawIdx : currentStage === 'Completed' ? relevantSteps.length - 1 : rawIdx;
  /** Nothing left to wait for — the queue card is replaced with a closing one. */
  const visitOver = currentStage === 'Completed';
  const positionText = inCabin
    ? 'Please proceed inside'
    : position > 0
      ? `${position - 1} patient(s) ahead of you`
      : 'Checkup complete';

  return (
    <div className="flex-grow flex items-center justify-center p-4 bg-[var(--bg-color)]">
      <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-3xl p-6 shadow-[var(--card-shadow)] relative overflow-hidden text-[var(--text-color)]">
        {/* Hospital Branding Header */}
        <div className="flex justify-between items-center pb-4 border-b border-[var(--border-color)]/30 mb-6">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[var(--primary-color)] text-[22px]">
              health_and_safety
            </span>
            <span className="font-extrabold text-sm tracking-tight text-left">CareeAi Live Tracker</span>
          </div>
          <span className="bg-[var(--tertiary-color)] text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Live Connection
          </span>
        </div>

        {/* Big Ticket Token Box */}
        <div className="bg-gradient-to-br from-[var(--primary-color)] to-[var(--primary-container)] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-white/10 text-center mb-6">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
          <p className="text-[11px] text-white/70 uppercase tracking-widest font-bold mb-1 relative z-10">
            Active Ticket
          </p>
          <h2 className="text-5xl font-black relative z-10 leading-none">{token.tokenNumber}</h2>

          <div className="mt-4 pt-4 border-t border-white/10 flex justify-around text-xs font-semibold relative z-10">
            <div>
              <p className="text-white/65 text-[11px]">Cabin Room</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.currentRoom || 'Cabin A'}</p>
            </div>
            <div>
              <p className="text-white/65 text-[11px]">Consultant</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.name}</p>
            </div>
          </div>
        </div>

        {/* The doctor is late.
         *
         * Sits directly under the ticket, above everything else on the page:
         * this is the one fact that changes what the patient does in the next
         * few minutes, and burying it below the progress rail would leave them
         * reading a stage diagram while their journey home is the real answer. */}
        {delay?.delayed && (
          <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-amber-500 text-[20px] leading-none mt-0.5">
                schedule
              </span>
              <div className="space-y-1">
                <p className="text-[13px] font-extrabold text-amber-700 dark:text-amber-400">
                  {delay.revisedStart
                    ? `${token.doctor?.name || 'Your doctor'} now starts at ${delay.revisedStart}`
                    : `${token.doctor?.name || 'Your doctor'} is running about ${delay.minutesLate} min late`}
                </p>
                <p className="text-[12px] font-medium text-amber-700/80 dark:text-amber-400/80">
                  {delay.revisedStart && delay.originalStart
                    ? `Scheduled for ${delay.originalStart} — running about ${delay.minutesLate} min late today.`
                    : 'The cabin is behind schedule today.'}
                  {delay.reason ? ` ${delay.reason}.` : ''}
                </p>
                <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400 pt-0.5">
                  Your updated turn is shown below — there is no need to wait here until then.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Visit progress — what has happened and what to do next. */}
        {journey && (
          <div className="mb-6 bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-1">
              {relevantSteps.map((s, i) => {
                const done = currentIdx >= 0 && i < currentIdx;
                const active = i === currentIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                          done
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : active
                              ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white animate-pulse'
                              : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {done ? 'check' : active ? 'radio_button_checked' : 'circle'}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold text-center leading-tight ${
                          active ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {stepLabels[s]}
                      </span>
                    </div>
                    {i < relevantSteps.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 -mt-4 ${done ? 'bg-emerald-500' : 'bg-[var(--border-color)]'}`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <p className="text-[11px] font-bold text-[var(--text-color)] leading-relaxed text-center pt-1 border-t border-[var(--border-color)]/30">
              {journey.message}
            </p>

            {journey.hasAbnormal && (
              <p className="text-[12px] font-bold text-rose-500 text-center">
                ⚠️ One of your results is outside the normal range — please show it to your doctor.
              </p>
            )}

            {/* Lab PDF Test Reports Section */}
            {Array.isArray(token.labTests) && token.labTests.some((t) => t.status === 'Completed') && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/30 space-y-2 text-left">
                <p className="text-[12px] font-black uppercase text-teal-600 tracking-wider">
                  🧪 Your Lab Test Reports (PDF)
                </p>
                <div className="space-y-1.5">
                  {token.labTests
                    .filter((t) => t.status === 'Completed')
                    .map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)]/40 text-xs"
                      >
                        <div>
                          <p className="font-bold text-[var(--text-color)]">{t.testName}</p>
                          <p className="text-[12px] text-[var(--text-secondary)]">
                            {t.resultValue || 'Completed'}
                          </p>
                        </div>
                        {t.reportPdf ? (
                          <a
                            href={t.reportPdf}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white text-[12px] font-bold rounded-lg shadow-sm flex items-center space-x-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                            <span>Download PDF</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                            Done
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Wait Status Card.
         *
         * A finished visit gets a closing card instead of a queue position. The
         * queue block was rendered unconditionally, so a patient who had been
         * discharged and had already left read "Please proceed inside" and
         * "Please wait in the reception lounge until called" underneath a
         * progress rail that said their visit was complete — three statements on
         * one screen, two of them wrong. */}
        {/* When to set off.
         *
         * The queue position tells a patient how long; it does not tell them
         * what to do, and for anyone who is not already in the building that is
         * the only question. Shown above the position because it is the line
         * they act on — and it disappears once they are inside or done. */}
        {!visitOver && data?.departure?.leaveBy && (
          <div
            className={`mb-4 rounded-2xl p-4 flex items-center space-x-3 text-left border ${
              data.departure.leaveBy === 'now' || data.departure.alerted
                ? 'bg-amber-500/10 border-amber-500/40'
                : 'bg-[var(--bg-color)] border-[var(--border-color)]/50'
            }`}
          >
            <span className="material-symbols-outlined text-[26px] text-amber-600">directions_car</span>
            <div>
              <p className="text-[12px] text-[var(--text-secondary)] uppercase font-extrabold">
                {data.departure.inTransit ? 'You should be on your way' : 'Leave home by'}
              </p>
              <p className="text-sm font-extrabold text-[var(--text-color)] mt-0.5">
                {data.departure.leaveBy === 'now' ? 'Leave now' : data.departure.leaveBy}
                <span className="font-medium text-[var(--text-secondary)]">
                  {' '}
                  · {data.departure.travelMinutes} min journey
                </span>
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                We WhatsApp you at that moment — no need to wait here.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {visitOver ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center space-x-3 text-left">
              <span className="material-symbols-outlined text-[26px] text-emerald-600">task_alt</span>
              <div>
                <p className="text-[12px] text-emerald-700 dark:text-emerald-400 uppercase font-extrabold">
                  Visit complete
                </p>
                <p className="text-sm font-extrabold text-[var(--text-color)] mt-0.5">
                  Nothing further to wait for — you can head home.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-4 flex items-center justify-between shadow-inner">
              <div className="flex items-center space-x-3 text-left">
                <span
                  className={`material-symbols-outlined text-[26px] ${inCabin ? 'text-[var(--tertiary-color)] animate-pulse' : 'text-[var(--primary-color)]'}`}
                >
                  {inCabin ? 'check_circle' : 'hourglass_empty'}
                </span>
                <div>
                  <p className="text-[12px] text-[var(--text-secondary)] uppercase font-extrabold">
                    Queue Position
                  </p>
                  <p className="text-sm font-extrabold text-[var(--text-color)] mt-0.5">{positionText}</p>
                </div>
              </div>
              {!inCabin && position > 0 && (
                <span className="text-lg font-black text-[var(--primary-color)] shrink-0">
                  {token.estimatedWaitTime}{' '}
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">mins</span>
                </span>
              )}
            </div>
          )}

          <div className="text-center">
            {!visitOver && (
              <p className="text-[12px] text-[var(--text-secondary)] font-bold">
                Please wait in the reception lounge until called.
              </p>
            )}
            <p className="text-[11px] text-[var(--text-secondary)]/50 mt-1">
              {visitOver
                ? 'Your reports and bill stay available on this page.'
                : 'Refreshes automatically when the queue updates.'}
            </p>
          </div>

          {/* Live Billing & Discharge Balance Card */}
          {invoice && (
            <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-4 space-y-3 shadow-sm text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="material-symbols-outlined text-[18px] text-teal-600">receipt_long</span>
                  <span className="text-xs font-black uppercase text-[var(--text-color)] tracking-wider">
                    Medical Bill Summary
                  </span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                    invoice.status === 'Discharged' || invoice.status === 'Paid'
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                  }`}
                >
                  {invoice.status}
                </span>
              </div>

              <div className="space-y-1 text-xs border-t border-[var(--border-color)]/30 pt-2">
                {(invoice.items || []).slice(0, 4).map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="text-[var(--text-secondary)] truncate max-w-[200px]">{it.itemName}</span>
                    <span className="font-bold text-[var(--text-color)]">₹{it.totalPrice}</span>
                  </div>
                ))}
                {(invoice.items || []).length > 4 && (
                  <p className="text-[11px] text-[var(--text-secondary)] italic">
                    + {(invoice.items || []).length - 4} more item(s) on bill
                  </p>
                )}
              </div>

              <div className="flex justify-between items-center border-t border-[var(--border-color)]/30 pt-2 text-xs font-black">
                <span className="text-[var(--text-secondary)]">Total Payable:</span>
                <span className="text-teal-600 text-sm">₹{invoice.totalAmount}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold text-[var(--text-secondary)]">
                <span>Amount Paid: ₹{invoice.amountPaid}</span>
                <span className={invoice.balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  Balance Due: ₹{invoice.balanceDue}
                </span>
              </div>

              {invoice.pdfUrl && (
                <div className="pt-2 border-t border-[var(--border-color)]/30 flex justify-end">
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-[12px] flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    <span>Download Official PDF Bill</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {pushSupported && (
            <div className="pt-4 border-t border-[var(--border-color)]/25 mt-4 text-center">
              {isSubscribed ? (
                <div className="flex items-center justify-center space-x-1.5 text-xs text-[var(--tertiary-color)] font-bold bg-[var(--tertiary-color)]/10 py-2.5 px-4 rounded-xl border border-[var(--tertiary-color)]/20 animate-fade-in">
                  <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                  <span>Push Alerts Activated!</span>
                </div>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="w-full bg-[var(--primary-color)] hover:bg-[var(--primary-container)] disabled:opacity-50 text-[var(--primary-text)] hover:text-[var(--text-color)] text-xs font-bold py-2.5 px-4 rounded-xl transition-all transition-all-custom flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 duration-100"
                >
                  <span className="material-symbols-outlined text-[16px]">notifications</span>
                  <span>{subscribing ? 'Activating Alerts...' : 'Get Background Push Alerts'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
