import React, { useState, useEffect } from 'react';
import { BACKEND_URL, socket } from '../App';

export default function PublicTVDisplay() {
  const [queues, setQueues] = useState([]);
  const [calledToken, setCalledToken] = useState(null);

  const fetchQueues = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/queues`);
      const data = await res.json();
      if (res.ok) {
        setQueues(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueues();

    socket.emit('join-room', 'queue:global');
    const handleUpdate = () => {
      fetchQueues();
    };
    socket.on('queue-updated', handleUpdate);

    // Listen for voice call announcements
    const handleTokenCalled = (payload) => {
      if (payload.status === 'Active') {
        const textToSpeak = `Token number ${payload.tokenNumber.replace('-', ' ')}, please proceed directly to ${payload.roomName || 'Cabin A'}.`;
        
        // Voice announce
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.85; // speak slightly slower for clarity
          window.speechSynthesis.speak(utterance);
        }
        
        // Trigger fullscreen visual alert
        setCalledToken({
          tokenNumber: payload.tokenNumber,
          roomName: payload.roomName || 'Cabin A'
        });
        
        setTimeout(() => {
          setCalledToken(null);
        }, 8000);
      }
    };
    socket.on('token-called', handleTokenCalled);

    return () => {
      socket.off('queue-updated', handleUpdate);
      socket.off('token-called', handleTokenCalled);
    };
  }, []);

  return (
    <div className="flex-grow bg-zinc-955 text-white p-8 flex flex-col justify-between h-[calc(100vh-62px)] relative overflow-hidden font-sans text-left">
      
      {/* Fullscreen Announcement Banner Overlay */}
      {calledToken && (
        <div className="absolute inset-0 bg-[#0891b2] flex flex-col items-center justify-center text-center p-8 z-50 animate-fade-in border-4 border-cyan-400 text-left">
          <span className="material-symbols-outlined text-[100px] text-white animate-bounce">volume_up</span>
          <h2 className="text-[12vw] font-black leading-none mt-4 text-white tracking-tight uppercase animate-pulse">{calledToken.tokenNumber}</h2>
          <p className="text-[4vw] font-extrabold mt-6 text-cyan-100 uppercase tracking-widest">Proceed to {calledToken.roomName}</p>
        </div>
      )}

      {/* Normal TV View */}
      <div className="flex-1 flex flex-col space-y-8 text-left">
        {/* Header */}
        <div className="flex justify-between items-center pb-6 border-b border-white/10">
          <div className="flex items-center space-x-3.5">
            <span className="material-symbols-outlined text-[36px] text-[#0891b2] animate-pulse">volume_up</span>
            <div>
              <h2 className="text-3xl font-black tracking-tight">CareSync Waiting Lounge</h2>
              <p className="text-xs text-zinc-400 font-extrabold uppercase tracking-widest mt-0.5">Real-time Cabin Admissions</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-zinc-305">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Live Status Monitor</p>
          </div>
        </div>

        {/* Queues grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-8">
          {queues.map(q => {
            const isConsulting = q.currentToken !== null;
            return (
              <div key={q._id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/5 rounded-full blur-2xl"></div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-zinc-400 text-[18px]">stethoscope</span>
                    <span className="text-xs text-zinc-400 font-bold uppercase tracking-wide">{q.doctor?.department}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white">
                    {q.doctor?.name}
                  </h3>
                  <p className="text-xs text-[#22d3ee] font-extrabold uppercase tracking-widest">{q.doctor?.currentRoom || 'Cabin A'}</p>
                </div>
 
                <div className="py-6 border-t border-b border-white/5 my-6 flex flex-col items-center justify-center min-h-[140px]">
                  {isConsulting ? (
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-400 uppercase font-extrabold tracking-widest">Active Patient</p>
                      <h4 className="text-6xl font-black text-[#0891b2] mt-2 tracking-tight uppercase animate-pulse">{q.currentToken.tokenNumber}</h4>
                      <p className="text-xs font-semibold text-zinc-300 mt-2 truncate max-w-[200px]">{q.currentToken.patient?.name}</p>
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500">
                      <span className="material-symbols-outlined text-[36px] text-zinc-650 mb-2">sensor_door</span>
                      <p className="text-xs font-bold text-zinc-400">Cabin is Idle</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 text-xs font-semibold">
                  <span className="text-[9px] text-zinc-400 uppercase font-extrabold tracking-widest block mb-1">Queue Status</span>
                  <div className="flex justify-between items-center bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                    <span className="text-zinc-500">Waiting Patients</span>
                    <span className="text-white font-bold">{q.activeQueue?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-955 p-2.5 rounded-xl border border-white/5">
                    <span className="text-zinc-500">Next In Line</span>
                    <span className="text-[#0891b2] font-bold">
                      {q.activeQueue && q.activeQueue[0] ? q.activeQueue[0].tokenNumber : 'None'}
                    </span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
