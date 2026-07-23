import React, { useState, useEffect, memo } from 'react';

// Self-contained live "telemetry dashboard" preview for the hero.
//
// PERF: this panel ticks a clock every second and rotates a paging call every
// few seconds. Keeping that state HERE — in a memoized leaf component — means
// only this small panel re-renders on each tick, instead of re-rendering the
// entire HospitalHub (hero, metrics, the whole facility directory grid) 60×/min.
function HeroTelemetry() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [call, setCall] = useState({ token: 'GP-08', cabin: 'Cabin A' });

  useEffect(() => {
    const calls = [
      { token: 'GP-08', cabin: 'Cabin A' },
      { token: 'EM-03', cabin: 'Cabin C (ER)' },
      { token: 'PD-05', cabin: 'Cabin B' },
      { token: 'GP-09', cabin: 'Cabin A' },
      { token: 'EM-04', cabin: 'Cabin C (ER)' }
    ];
    const rotate = setInterval(() => {
      setCall(calls[Math.floor(Math.random() * calls.length)]);
    }, 4000);
    const clock = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(clock);
    };
  }, []);

  return (
    <div className="animate-fade-in-up delay-300 lg:col-span-5 relative w-full h-[380px] bg-gradient-to-tr from-zinc-950 to-zinc-900 rounded-3xl p-6 shadow-2xl border border-white/5 overflow-hidden flex flex-col justify-between text-white text-xs select-none">
      {/* Background grid line decoration */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>

      {/* Telemetry Header */}
      <div className="flex justify-between items-center border-b border-white/10 pb-3 relative z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
          <span className="font-extrabold tracking-wider uppercase text-[10px] text-zinc-400">CareSync Telemetry Dashboard</span>
        </div>
        <span className="font-mono text-zinc-400 text-[10px] bg-white/5 px-2 py-0.5 rounded">{time}</span>
      </div>

      {/* Telemetry Core Grid Layout */}
      <div className="grid grid-cols-2 gap-4 my-4 relative z-10 flex-1">
        {/* Call Out screen */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] uppercase font-bold text-zinc-400">Current Paging call</span>
            <h4 className="text-3xl font-black text-[var(--primary-color)] tracking-tight mt-1 animate-pulse">{call.token}</h4>
          </div>
          <div>
            <p className="text-[10px] text-zinc-300 font-bold">Proceed To:</p>
            <p className="text-xs text-white font-extrabold flex items-center space-x-1">
              <span className="material-symbols-outlined text-[14px] text-[var(--primary-color)]">sensor_door</span>
              <span>{call.cabin}</span>
            </p>
          </div>
        </div>

        {/* Wait Time graph simulation */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] uppercase font-bold text-zinc-400">Queue wait efficiency</span>
            <p className="text-xl font-black text-emerald-400 mt-1">-42% Wait</p>
          </div>
          <div className="h-16 w-full">
            <svg viewBox="0 0 100 40" className="w-full h-full">
              <path d="M0,35 Q20,15 40,30 T80,10 T100,5" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <path d="M0,35 Q20,15 40,30 T80,10 T100,5 L100,40 L0,40 Z" fill="url(#gradient-telemetry)" opacity="0.1" />
              <defs>
                <linearGradient id="gradient-telemetry" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Active Cabins listing inside preview */}
      <div className="space-y-2 border-t border-white/10 pt-3 relative z-10">
        <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider block">Live Cabin Telemetry status</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: 'Dr. Sarah Jenkins', room: 'Cabin A', status: 'Consulting', color: 'bg-emerald-500' },
            { name: 'Dr. Robert Chen', room: 'Cabin B', status: 'Calling', color: 'bg-[var(--primary-color)]' },
            { name: 'Dr. Emily Taylor', room: 'Cabin C', status: 'Surgery', color: 'bg-rose-500' }
          ].map((cab, idx) => (
            <div key={idx} className="bg-white/5 border border-white/5 p-2 rounded-xl text-[9px] font-semibold space-y-1">
              <p className="text-white truncate font-bold">{cab.name}</p>
              <div className="flex items-center justify-between text-zinc-400">
                <span>{cab.room}</span>
                <div className="flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${cab.color}`}></span>
                  <span>{cab.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(HeroTelemetry);
