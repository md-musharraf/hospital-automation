import React, { useState } from 'react';
import { BACKEND_URL } from '../App';

export default function WhatsAppTester({ initialPhone = '+14155238886', defaultHospId = 'general-hospital' }) {
  const [waNumber, setWaNumber] = useState(initialPhone);
  const [hospSlug, setHospSlug] = useState(defaultHospId);
  const [userMsg, setUserMsg] = useState('Hi');
  const [incomingSender, setIncomingSender] = useState('+919876543210');
  const [responseLog, setResponseLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('simulator'); // 'simulator' | 'setup_guide'

  const handleSimulateWhatsAppMessage = async (msgToSend) => {
    const messageText = msgToSend || userMsg;
    if (!messageText.trim()) return;

    setLoading(true);
    const newLogItem = {
      timestamp: new Date().toLocaleTimeString(),
      sender: incomingSender,
      request: messageText,
      status: 'sending'
    };

    setResponseLog(prev => [newLogItem, ...prev]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: `whatsapp:${incomingSender}`,
          To: `whatsapp:${waNumber}`,
          Body: messageText,
          hospitalId: hospSlug
        })
      });

      const responseText = await res.text();
      let replyMessage = responseText;

      // Extract message inside <Message>...</Message> if TwiML XML
      if (responseText.includes('<Message>') && responseText.includes('</Message>')) {
        const match = responseText.match(/<Message>([\s\S]*?)<\/Message>/);
        if (match && match[1]) {
          replyMessage = match[1].trim();
        }
      }

      setResponseLog(prev => prev.map((item, idx) => {
        if (idx === 0) {
          return {
            ...item,
            status: 'success',
            reply: replyMessage,
            rawXml: responseText
          };
        }
        return item;
      }));
    } catch (err) {
      console.error('Error testing WhatsApp webhook:', err);
      setResponseLog(prev => prev.map((item, idx) => {
        if (idx === 0) {
          return {
            ...item,
            status: 'error',
            reply: 'Failed to connect to WhatsApp webhook endpoint.'
          };
        }
        return item;
      }));
    } finally {
      setLoading(false);
      setUserMsg('');
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-3xl p-6 shadow-xl space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--border-color)]/20 pb-4 gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-sm">
            <span className="material-symbols-outlined text-[24px]">chat</span>
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--text-color)] flex items-center space-x-2">
              <span>WhatsApp Business API Simulator & Webhook Tester</span>
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold border border-emerald-500/20">Live Webhook</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5">
              Enter any WhatsApp Business Number to test instant AI chatbot responses, appointment bookings, and live queue syncing!
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex bg-[var(--bg-color)] p-1 rounded-xl border border-[var(--border-color)]/30 text-xs font-bold">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'simulator' ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            Live Simulator
          </button>
          <button
            onClick={() => setActiveTab('setup_guide')}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'setup_guide' ? 'bg-[var(--primary-color)] text-[var(--primary-text)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-color)]'}`}
          >
            Setup Guide (Twilio / Meta API)
          </button>
        </div>
      </div>

      {activeTab === 'simulator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[var(--bg-color)] p-4 rounded-2xl border border-[var(--border-color)]/30 space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--text-color)] mb-1">
                  WhatsApp Business API Number (To)
                </label>
                <input
                  type="text"
                  value={waNumber}
                  onChange={e => setWaNumber(e.target.value)}
                  placeholder="+14155238886 or +919876543210"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 text-xs font-bold outline-none text-[var(--text-color)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-color)] mb-1">
                  Simulated Incoming Patient Phone (From)
                </label>
                <input
                  type="text"
                  value={incomingSender}
                  onChange={e => setIncomingSender(e.target.value)}
                  placeholder="+919876543210"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 text-xs font-bold outline-none text-[var(--text-color)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-color)] mb-1">
                  Target Facility Slug ID
                </label>
                <input
                  type="text"
                  value={hospSlug}
                  onChange={e => setHospSlug(e.target.value)}
                  placeholder="e.g. general-hospital or city-health-clinic"
                  className="w-full bg-[var(--card-bg)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 text-xs font-bold outline-none text-[var(--text-color)]"
                />
              </div>
            </div>

            {/* Quick Test Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider">Quick Preset Prompts:</span>
              <div className="flex flex-wrap gap-1.5">
                {['Hi', '1', '2', '3', 'Status', 'Show Doctors'].map((promptText) => (
                  <button
                    key={promptText}
                    onClick={() => handleSimulateWhatsAppMessage(promptText)}
                    disabled={loading}
                    className="px-3 py-1 bg-[var(--bg-color)] hover:bg-[var(--primary-color)] hover:text-[var(--primary-text)] border border-[var(--border-color)]/40 text-xs font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    "{promptText}"
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSimulateWhatsAppMessage();
              }}
              className="flex items-center space-x-2"
            >
              <input
                type="text"
                placeholder="Type WhatsApp message (e.g. Hi or symptoms)..."
                value={userMsg}
                onChange={e => setUserMsg(e.target.value)}
                className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2.5 outline-none text-xs text-[var(--text-color)] font-semibold"
              />
              <button
                type="submit"
                disabled={loading || !userMsg.trim()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center space-x-1 shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                <span>Send</span>
                <span className="material-symbols-outlined text-[14px]">send</span>
              </button>
            </form>
          </div>

          {/* Response Console Display Column */}
          <div className="lg:col-span-7 bg-zinc-950 text-emerald-400 p-4 rounded-2xl border border-zinc-800 font-mono text-xs flex flex-col justify-between min-h-[300px] max-h-[420px] overflow-hidden select-text">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-3 text-[10px] text-zinc-400 font-sans font-bold">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>WhatsApp Webhook Response Console</span>
              </div>
              <span>POST /api/v1/chat/whatsapp</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 no-scrollbar">
              {responseLog.length === 0 ? (
                <div className="text-zinc-500 text-center py-12 font-sans text-xs">
                  <span className="material-symbols-outlined text-[36px] text-zinc-700 mb-2 block">phishing</span>
                  Click any prompt or type a message above to test the WhatsApp Webhook live!
                </div>
              ) : (
                responseLog.map((log, idx) => (
                  <div key={idx} className="bg-zinc-900/80 border border-zinc-800/80 p-3 rounded-xl space-y-2 font-sans">
                    <div className="flex justify-between text-[10px] text-zinc-400 border-b border-zinc-800/60 pb-1">
                      <span className="font-bold text-emerald-300">USER ({log.sender}): "{log.request}"</span>
                      <span>{log.timestamp}</span>
                    </div>
                    {log.status === 'sending' ? (
                      <p className="text-amber-400 font-mono text-xs animate-pulse">Waiting for Webhook response...</p>
                    ) : log.status === 'error' ? (
                      <p className="text-rose-400 font-mono text-xs">{log.reply}</p>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Bot Response (TwiML / Chatbot Engine):</span>
                        <div className="bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 p-2.5 rounded-lg text-xs font-sans whitespace-pre-wrap leading-relaxed">
                          {log.reply}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {responseLog.length > 0 && (
              <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-[10px] text-zinc-500 font-sans">
                <span>{responseLog.length} Requests Simulated</span>
                <button
                  onClick={() => setResponseLog([])}
                  className="hover:text-zinc-300 font-bold underline"
                >
                  Clear Console
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Setup Guide Tab */
        <div className="space-y-4 text-xs font-semibold text-[var(--text-secondary)] leading-relaxed">
          <div className="bg-[var(--bg-color)] p-4 rounded-2xl border border-[var(--border-color)]/30 space-y-3">
            <h4 className="text-sm font-extrabold text-[var(--text-color)] flex items-center space-x-1.5">
              <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">link</span>
              <span>1. Public Webhook Endpoint</span>
            </h4>
            <p>Configure your Twilio Sandbox or Meta WhatsApp Cloud API Callback URL to:</p>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/60 p-3 rounded-xl flex items-center justify-between font-mono text-xs text-[var(--primary-color)] font-bold">
              <span>https://hospital-automation-wine.vercel.app/api/v1/chat/whatsapp</span>
              <button
                onClick={() => navigator.clipboard.writeText('https://hospital-automation-wine.vercel.app/api/v1/chat/whatsapp')}
                className="px-2.5 py-1 bg-[var(--primary-color)] text-[var(--primary-text)] text-[10px] font-bold rounded-lg hover:opacity-90 active:scale-95"
              >
                Copy URL
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-color)] p-4 rounded-2xl border border-[var(--border-color)]/30 space-y-2">
              <h5 className="font-extrabold text-[var(--text-color)] text-xs flex items-center space-x-1">
                <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
                <span>Twilio WhatsApp Sandbox Setup</span>
              </h5>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>Go to Twilio Console &rarr; Messaging &rarr; Try WhatsApp.</li>
                <li>Set "WHEN A MESSAGE COMES IN" to <code className="bg-[var(--card-bg)] px-1 rounded font-mono text-[var(--primary-color)]">HTTP POST</code>.</li>
                <li>Paste the Webhook URL above.</li>
                <li>Send "join &lt;sandbox-code&gt;" from your phone to Twilio's WhatsApp number.</li>
              </ol>
            </div>

            <div className="bg-[var(--bg-color)] p-4 rounded-2xl border border-[var(--border-color)]/30 space-y-2">
              <h5 className="font-extrabold text-[var(--text-color)] text-xs flex items-center space-x-1">
                <span className="material-symbols-outlined text-[16px] text-blue-500">api</span>
                <span>Meta WhatsApp Cloud API Setup</span>
              </h5>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>Go to Meta Developers Console &rarr; WhatsApp &rarr; Configuration.</li>
                <li>Set Callback URL to the Webhook URL above.</li>
                <li>Add Verify Token (if required) or standard webhook path.</li>
                <li>Subscribe to <code className="bg-[var(--card-bg)] px-1 rounded font-mono text-[var(--primary-color)]">messages</code> webhook event.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
