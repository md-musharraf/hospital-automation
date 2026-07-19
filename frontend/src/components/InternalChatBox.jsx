import React, { useState, useEffect, useRef } from 'react';
import { BACKEND_URL, socket } from '../App';

export default function InternalChatBox({ token, user, role }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [receiverRole, setReceiverRole] = useState(role === 'Staff' ? 'Doctor' : 'Staff');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const loadMessages = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Since backend returns latest first, we reverse it to display chronologically
        setMessages(data.reverse());
      }
    } catch (err) {
      console.error('Error fetching internal messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();

    // Listen to real-time internal messages broadcast
    const handleInternalMsg = (msg) => {
      // Add the message if it's relevant to our role
      // A message is relevant if receiverRole matches our role, or is a broadcast, or we sent it
      const myRole = role; // 'Staff' or 'Doctor' (or 'Lab')
      if (
        msg.receiverRole === myRole || 
        msg.senderRole === myRole ||
        msg.receiverRole === 'All'
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on('internal-message-received', handleInternalMsg);

    return () => {
      socket.off('internal-message-received', handleInternalMsg);
    };
  }, [token, role]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverRole,
          content: text
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to send message');
      }
      // Note: We don't manually append here because socket broadcast 'internal-message-received' will push it to our UI
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 shadow-[var(--card-shadow)] flex flex-col h-[400px] w-full max-w-2xl">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]/30 mb-4 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="material-symbols-outlined text-[var(--primary-color)] text-[20px]">forum</span>
          <h4 className="font-extrabold text-[var(--text-color)] text-sm">Internal Hospital Intercom</h4>
        </div>
        
        {/* Recipient Role selector */}
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-[var(--text-secondary)] font-bold">To:</span>
          <select 
            value={receiverRole}
            onChange={(e) => setReceiverRole(e.target.value)}
            className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-lg px-2.5 py-1 font-bold text-xs outline-none text-[var(--text-color)]"
          >
            <option value="Staff">Staff Desk</option>
            <option value="Doctor">Doctors</option>
            <option value="Lab">Lab Station</option>
          </select>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4 no-scrollbar">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)] font-bold">
            Syncing intercom connection...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[var(--text-secondary)]/50 italic p-6">
            <span className="material-symbols-outlined text-[32px] text-zinc-350 dark:text-zinc-650 mb-2">chat_bubble</span>
            <p>Intercom is silent. Send a message to coordinate with {receiverRole === 'Staff' ? 'the Staff Desk' : receiverRole === 'Doctor' ? 'Doctors' : 'the Lab'}.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderRole === role;
            return (
              <div 
                key={idx} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[85%] rounded-xl p-3 text-xs shadow-sm ${
                  isMe 
                    ? 'bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/25 text-[var(--text-color)] rounded-tr-none' 
                    : 'bg-[var(--bg-color)] border border-[var(--border-color)]/30 text-[var(--text-color)] rounded-tl-none'
                }`}>
                  <div className="flex items-center justify-between mb-1 text-[9px] font-black text-[var(--text-secondary)] tracking-wider">
                    <span>{msg.senderName} ({msg.senderRole})</span>
                    <span className="ml-4 font-bold text-[9px]">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="font-semibold leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input box */}
      <form onSubmit={handleSendMessage} className="flex items-center space-x-2 shrink-0">
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Coordinate with ${receiverRole}...`}
          className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-4 py-2 outline-none text-xs text-[var(--text-color)] font-semibold"
        />
        <button 
          type="submit" 
          disabled={!inputText.trim()}
          className="bg-[var(--primary-color)] hover:bg-[var(--primary-container)] disabled:opacity-50 text-[var(--primary-text)] hover:text-[var(--text-color)] font-bold p-2.5 rounded-xl transition-all transition-all-custom shadow-sm flex items-center justify-center shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">send</span>
        </button>
      </form>
    </div>
  );
}
