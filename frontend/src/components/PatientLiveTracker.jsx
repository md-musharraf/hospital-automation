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

  useEffect(() => {
    loadTracker();

    // The shared socket may have given up earlier (e.g. the backend was
    // restarting); a tracker showing a frozen queue position is worse than one
    // that reconnects itself.
    if (!socket.connected) socket.connect();
    socket.emit('join-room', 'queue:global');
    // The patient's own room receives targeted journey updates (sent to the lab,
    // reports ready, medicines dispensed) without a page refresh.
    socket.emit('join-room', `patient:${tokenId}`);
    const handleUpdate = () => {
      loadTracker();
    };
    socket.on('queue-updated', handleUpdate);
    socket.on('journey-updated', handleUpdate);

    return () => {
      socket.off('queue-updated', handleUpdate);
      socket.off('journey-updated', handleUpdate);
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

  const { token, position, journey } = data;
  const inCabin = position === 0;
  // The visit as the patient experiences it. Before this they only saw a queue
  // position and had no idea they were meant to go to the lab or the pharmacy.
  const JOURNEY_STEPS = [
    'Waiting',
    'In Consultation',
    'Lab Pending',
    'Lab Complete',
    'Pharmacy Pending',
    'Dispensed'
  ];
  const stepLabels = {
    Waiting: 'In queue',
    'In Consultation': 'With doctor',
    'Lab Pending': 'Lab tests',
    'Lab Complete': 'Reports ready',
    'Pharmacy Pending': 'Pharmacy',
    Dispensed: 'Done'
  };
  const currentStage = journey?.stage || 'Waiting';
  // Steps that don't apply to this visit (no tests / no medicines) are skipped.
  const relevantSteps = JOURNEY_STEPS.filter((s) => {
    if (s === 'Lab Pending' || s === 'Lab Complete')
      return (journey?.labPending || 0) + (journey?.labReady || 0) > 0;
    if (s === 'Pharmacy Pending' || s === 'Dispensed') return journey?.medicinesReady;
    return true;
  });
  const currentIdx = relevantSteps.indexOf(currentStage);
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
          <span className="bg-[var(--tertiary-color)] text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Live Connection
          </span>
        </div>

        {/* Big Ticket Token Box */}
        <div className="bg-gradient-to-br from-[var(--primary-color)] to-[var(--primary-container)] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-white/10 text-center mb-6">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]"></div>
          <p className="text-[9px] text-white/70 uppercase tracking-widest font-bold mb-1 relative z-10">
            Active Ticket
          </p>
          <h2 className="text-5xl font-black relative z-10 leading-none">{token.tokenNumber}</h2>

          <div className="mt-4 pt-4 border-t border-white/10 flex justify-around text-xs font-semibold relative z-10">
            <div>
              <p className="text-white/65 text-[9px]">Cabin Room</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.currentRoom || 'Cabin A'}</p>
            </div>
            <div>
              <p className="text-white/65 text-[9px]">Consultant</p>
              <p className="text-white font-bold mt-0.5">{token.doctor?.name}</p>
            </div>
          </div>
        </div>

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
                        className={`text-[8px] font-bold text-center leading-tight ${
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
              <p className="text-[10px] font-bold text-rose-500 text-center">
                ⚠️ One of your results is outside the normal range — please show it to your doctor.
              </p>
            )}
          </div>
        )}

        {/* Live Wait Status Card */}
        <div className="space-y-4">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center space-x-3 text-left">
              <span
                className={`material-symbols-outlined text-[26px] ${inCabin ? 'text-[var(--tertiary-color)] animate-pulse' : 'text-[var(--primary-color)]'}`}
              >
                {inCabin ? 'check_circle' : 'hourglass_empty'}
              </span>
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase font-extrabold">
                  Queue Position
                </p>
                <p className="text-sm font-extrabold text-[var(--text-color)] mt-0.5">{positionText}</p>
              </div>
            </div>
            {!inCabin && position > 0 && (
              <span className="text-lg font-black text-[var(--primary-color)] shrink-0">
                {token.estimatedWaitTime}{' '}
                <span className="text-[9px] font-medium text-[var(--text-secondary)]">mins</span>
              </span>
            )}
          </div>

          <div className="text-center">
            <p className="text-[10px] text-[var(--text-secondary)] font-bold">
              Please wait in the reception lounge until called.
            </p>
            <p className="text-[9px] text-[var(--text-secondary)]/50 mt-1">
              Refreshes automatically when the queue updates.
            </p>
          </div>

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
