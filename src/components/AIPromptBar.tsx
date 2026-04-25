'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  buttons?: { label: string; value: string; variant?: 'primary' | 'danger' }[];
  loading?: boolean;
}

interface AIPromptBarProps {
  onResult: (result: {
    action: string;
    formData?: Record<string, unknown>;
    message: string;
    found?: boolean;
    user?: Record<string, unknown>;
    suggestions?: string[];
  }) => void;
  requestedBy?: string;
}

type ConvoState =
  | { step: 'idle' }
  | { step: 'checking_ip'; action: string; ip: string; duration: number }
  | { step: 'need_employee_id'; action: string; ip: string; duration: number; username: string; hostname: string; email: string }
  | { step: 'need_email'; action: string; ip: string; duration: number; username: string; hostname: string; employeeId: string }
  | { step: 'confirm'; action: string; ip: string; duration: number; username: string; hostname: string; employeeId: string; email: string }
  | { step: 'need_ip_for_hostname'; newHostname: string }
  | { step: 'need_new_hostname'; ip: string; currentHostname: string; username: string }
  | { step: 'confirm_hostname'; ip: string; currentHostname: string; newHostname: string; username: string }
  | { step: 'executing'; action: string }
  | { step: 'done' };

function msgId() { return Math.random().toString(36).slice(2); }

export default function AIPromptBar({ onResult, requestedBy }: AIPromptBarProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [convo, setConvo] = useState<ConvoState>({ step: 'idle' });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = [
    'grant admin to 17.x.x.x for 60 minutes',
    'give github access to 17.x.x.x for 30 minutes',
    'search employee 1234567',
    'update hostname on 17.x.x.x',
    'run cleanup utility',
  ];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const addMsg = useCallback((role: 'user' | 'assistant', text: string, buttons?: Message['buttons']) => {
    setMessages(prev => [...prev, { id: msgId(), role, text, buttons }]);
  }, []);

  const addLoading = useCallback(() => {
    const id = msgId();
    setMessages(prev => [...prev, { id, role: 'assistant', text: '', loading: true }]);
    return id;
  }, []);

  const replaceMsg = useCallback((id: string, text: string, buttons?: Message['buttons']) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text, loading: false, buttons } : m));
  }, []);

  const parseCommand = (text: string) => {
    const ipMatch = text.match(/\b(17\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
    const durationMatch = text.match(/(\d+)\s*(min|minute|hour|hr)/i);
    const idMatch = text.match(/\b(\d{5,8})\b/);
    let action = 'unknown';
    if (/admin|promote|sudo|elevate/i.test(text)) action = 'admin';
    else if (/github|git|repo|unblock/i.test(text)) action = 'github';
    else if (/hostname|rename|computer/i.test(text)) action = 'hostname';
    else if (/clean|cleanup|fix|maintenance/i.test(text)) action = 'cleanup';
    else if (/search|find|lookup|check|who/i.test(text)) action = 'search';

    let duration = action === 'github' ? 30 : 60;
    if (durationMatch) {
      duration = parseInt(durationMatch[1]);
      if (/hour|hr/i.test(durationMatch[2])) duration *= 60;
    }
    return { action, ip: ipMatch?.[1] || '', duration, employeeId: idMatch?.[1] || '' };
  };

  const checkIp = useCallback(async (ip: string) => {
    try {
      const res = await fetch(`/api/system-info?ip=${ip}`);
      const info = await res.json();
      if (info.remoteUsername) {
        const userRes = await fetch(`/api/user?username=${info.remoteUsername}`);
        const userData = await userRes.json();
        return {
          success: true,
          username: info.remoteUsername,
          hostname: info.remoteHostname || '',
          employeeId: userData.user?.employeeId || '',
          email: userData.user?.email || '',
        };
      }
      return { success: false, error: info.sshError || 'Cannot reach device' };
    } catch {
      return { success: false, error: 'Connection failed' };
    }
  }, []);

  const executeAction = useCallback(async (action: string, data: { ip: string; username: string; hostname: string; employeeId: string; email: string; duration: number }) => {
    const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    const endpoint = action === 'admin' ? '/api/admin-access' : '/api/github-access';

    const loadId = addLoading();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ ...data, requestedBy: requestedBy || 'system' }),
        credentials: 'same-origin',
      });

      if (!res.body) {
        replaceMsg(loadId, 'Streaming not supported');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const stepMsgs: Record<string, string> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.step && event.status === 'active') {
              if (!stepMsgs[event.step]) {
                const sid = msgId();
                stepMsgs[event.step] = sid;
                setMessages(prev => [...prev, { id: sid, role: 'assistant', text: `⏳ ${event.label}...`, loading: true }]);
              }
            }
            if (event.step && (event.status === 'completed' || event.status === 'error')) {
              const sid = stepMsgs[event.step];
              if (sid) {
                const icon = event.success ? '✅' : '❌';
                replaceMsg(sid, `${icon} ${event.label}`);
              }
            }
            if (event.done) {
              replaceMsg(loadId, '');
              setMessages(prev => prev.filter(m => m.id !== loadId));
              if (event.success) {
                if (event.alreadyAdmin) {
                  addMsg('assistant', `ℹ️ ${event.message}`);
                } else {
                  addMsg('assistant', `🎉 ${event.message}`);
                }
              } else {
                addMsg('assistant', `❌ ${event.error || 'Failed'}`);
              }
              setConvo({ step: 'done' });
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      replaceMsg(loadId, `❌ Request failed: ${err}`);
      setConvo({ step: 'done' });
    }
  }, [addLoading, addMsg, replaceMsg, requestedBy]);

  const handleUserInput = useCallback(async (text: string) => {
    addMsg('user', text);
    setChatOpen(true);

    if (convo.step === 'need_employee_id') {
      const id = text.match(/\d{5,8}/)?.[0];
      if (!id) { addMsg('assistant', 'Please enter a valid employee ID (5-8 digits).'); return; }
      if (convo.email) {
        setConvo({ ...convo, step: 'confirm', employeeId: id, email: convo.email });
        addMsg('assistant', `Ready to ${convo.action === 'admin' ? 'grant admin access' : 'grant GitHub access'} to **${convo.username}** on **${convo.hostname}** for **${convo.duration} minutes**. What's the Apple email?`);
        setConvo({ step: 'need_email', action: convo.action, ip: convo.ip, duration: convo.duration, username: convo.username, hostname: convo.hostname, employeeId: id });
      } else {
        addMsg('assistant', `Got it. What's the Apple email for ${convo.username}?`);
        setConvo({ step: 'need_email', action: convo.action, ip: convo.ip, duration: convo.duration, username: convo.username, hostname: convo.hostname, employeeId: id });
      }
      return;
    }

    if (convo.step === 'need_email') {
      if (!text.includes('@apple.com')) { addMsg('assistant', 'Please enter a valid @apple.com email.'); return; }
      const s = { step: 'confirm' as const, action: convo.action, ip: convo.ip, duration: convo.duration, username: convo.username, hostname: convo.hostname, employeeId: convo.employeeId, email: text.trim() };
      setConvo(s);
      addMsg('assistant',
        `Ready to ${s.action === 'admin' ? 'grant admin access' : 'grant GitHub access'}:\n\n` +
        `• User: ${s.username}\n• Device: ${s.hostname}\n• IP: ${s.ip}\n• Duration: ${s.duration} minutes\n• Employee ID: ${s.employeeId}\n• Email: ${s.email}`,
        [{ label: 'Confirm', value: 'confirm', variant: 'primary' }, { label: 'Cancel', value: 'cancel', variant: 'danger' }]
      );
      return;
    }

    if (convo.step === 'confirm') {
      if (/yes|confirm|proceed|ok|go/i.test(text)) {
        setConvo({ step: 'executing', action: convo.action });
        executeAction(convo.action, { ip: convo.ip, username: convo.username, hostname: convo.hostname, employeeId: convo.employeeId, email: convo.email, duration: convo.duration });
      } else {
        addMsg('assistant', 'Cancelled. Type a new command to start over.');
        setConvo({ step: 'idle' });
      }
      return;
    }

    // Hostname conversation states
    if (convo.step === 'need_ip_for_hostname') {
      const ipMatch = text.match(/\b(17\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
      if (!ipMatch) { addMsg('assistant', 'Please enter a valid VPN IP starting with 17.'); return; }
      const loadId = addLoading();
      const result = await checkIp(ipMatch[1]);
      if (!result.success) { replaceMsg(loadId, `❌ Cannot reach ${ipMatch[1]}: ${result.error}`); setConvo({ step: 'idle' }); return; }
      replaceMsg(loadId, `Found: **${result.username}** on **${result.hostname}**`);
      addMsg('assistant', `Current hostname is **${result.hostname}**. What should the new hostname be?`);
      setConvo({ step: 'need_new_hostname', ip: ipMatch[1], currentHostname: result.hostname!, username: result.username! });
      return;
    }

    if (convo.step === 'need_new_hostname') {
      const name = text.trim();
      if (!['02HW0','01HW0','34HW0','3HW0','4HW0'].some(p => name.toUpperCase().startsWith(p))) {
        addMsg('assistant', 'Hostname must start with 02HW0, 01HW0, 34HW0, 3HW0, or 4HW0. Try again.');
        return;
      }
      setConvo({ step: 'confirm_hostname', ip: convo.ip, currentHostname: convo.currentHostname, newHostname: name, username: convo.username });
      addMsg('assistant',
        `Update hostname:\n\n• Device: ${convo.currentHostname} → **${name}**\n• User: ${convo.username}\n• IP: ${convo.ip}`,
        [{ label: 'Confirm', value: 'confirm', variant: 'primary' }, { label: 'Cancel', value: 'cancel', variant: 'danger' }]
      );
      return;
    }

    if (convo.step === 'confirm_hostname') {
      if (/yes|confirm|proceed|ok|go/i.test(text)) {
        setConvo({ step: 'executing', action: 'hostname' });
        const loadId = addLoading();
        try {
          const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
          const res = await fetch('/api/update-hostname', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfMatch?.[1] || '' },
            body: JSON.stringify({ vpnIp: convo.ip, newHostname: convo.newHostname }),
            credentials: 'same-origin',
          });
          const data = await res.json();
          replaceMsg(loadId, res.ok ? `✅ ${data.message}` : `❌ ${data.error}`);
        } catch (err) { replaceMsg(loadId, `❌ Failed: ${err}`); }
        setConvo({ step: 'done' });
      } else {
        addMsg('assistant', 'Cancelled. Type a new command to start over.');
        setConvo({ step: 'idle' });
      }
      return;
    }

    // New command
    const parsed = parseCommand(text);

    if (parsed.action === 'search') {
      const loadId = addLoading();
      try {
        const res = await fetch('/api/ai-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        const data = await res.json();
        replaceMsg(loadId, data.found && data.user
          ? `Found: ${data.user.username || '-'} | ${data.user.hostname || '-'} | ${data.user.email || '-'} | ID: ${data.user.employeeId || '-'}`
          : 'No user found. Try a different search term.');
        onResult(data);
      } catch { replaceMsg(loadId, 'Search failed.'); }
      setConvo({ step: 'idle' });
      return;
    }

    if (parsed.action === 'hostname') {
      if (!parsed.ip) {
        addMsg('assistant', "What's the VPN IP of the device to update? (must start with 17.)");
        setConvo({ step: 'need_ip_for_hostname', newHostname: '' });
        return;
      }
      const loadId = addLoading();
      const result = await checkIp(parsed.ip);
      if (!result.success) { replaceMsg(loadId, `❌ Cannot reach ${parsed.ip}: ${result.error}`); setConvo({ step: 'idle' }); return; }
      replaceMsg(loadId, `Found: **${result.username}** on **${result.hostname}**`);
      addMsg('assistant', `Current hostname is **${result.hostname}**. What should the new hostname be?`);
      setConvo({ step: 'need_new_hostname', ip: parsed.ip, currentHostname: result.hostname!, username: result.username! });
      return;
    }

    if (parsed.action === 'cleanup') {
      addMsg('assistant', 'Opening cleanup utility...');
      onResult({ action: 'cleanup', message: '' });
      setConvo({ step: 'idle' });
      return;
    }

    if (parsed.action === 'unknown') {
      addMsg('assistant', "I didn't understand that. Try:\n• grant admin to 17.x.x.x for 60 minutes\n• give github access to 17.x.x.x\n• search employee 1234567");
      setConvo({ step: 'idle' });
      return;
    }

    // Admin or GitHub action
    if (!parsed.ip) {
      addMsg('assistant', `What's the VPN IP? (must start with 17.)`);
      setConvo({ step: 'checking_ip', action: parsed.action, ip: '', duration: parsed.duration });
      return;
    }

    if (!parsed.ip.startsWith('17.')) {
      addMsg('assistant', `❌ Invalid IP: ${parsed.ip}. Must start with 17. (Apple VPN). Try again.`);
      setConvo({ step: 'idle' });
      return;
    }

    // Check IP
    setConvo({ step: 'checking_ip', action: parsed.action, ip: parsed.ip, duration: parsed.duration });
    const loadId = addLoading();
    const result = await checkIp(parsed.ip);

    if (!result.success) {
      replaceMsg(loadId, `❌ Cannot reach ${parsed.ip}: ${result.error}\n\nPlease verify the device is online and try again.`);
      setConvo({ step: 'idle' });
      return;
    }

    replaceMsg(loadId, `Found: **${result.username}** on **${result.hostname}**`);

    const data = { action: parsed.action, ip: parsed.ip, duration: parsed.duration, username: result.username!, hostname: result.hostname!, employeeId: result.employeeId || '', email: result.email || '' };

    if (!data.employeeId) {
      addMsg('assistant', `I need the employee ID for ${data.username}. What is it?`);
      setConvo({ step: 'need_employee_id', ...data });
      return;
    }

    if (!data.email) {
      addMsg('assistant', `I need the Apple email for ${data.username}. What is it?`);
      setConvo({ step: 'need_email', ...data });
      return;
    }

    // All info available — confirm
    setConvo({ step: 'confirm', ...data });
    addMsg('assistant',
      `Ready to ${data.action === 'admin' ? 'grant admin access' : 'grant GitHub access'}:\n\n` +
      `• User: ${data.username}\n• Device: ${data.hostname}\n• IP: ${data.ip}\n• Duration: ${data.duration} minutes\n• Employee ID: ${data.employeeId}\n• Email: ${data.email}`,
      [{ label: 'Confirm', value: 'confirm', variant: 'primary' }, { label: 'Cancel', value: 'cancel', variant: 'danger' }]
    );
  }, [convo, addMsg, addLoading, replaceMsg, checkIp, executeAction, onResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setShowSuggestions(false);
    handleUserInput(text);
  };

  const handleButton = (value: string) => {
    handleUserInput(value);
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity" />
          <div className="relative flex items-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="pl-5 pr-3">
              <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setShowSuggestions(e.target.value.length === 0); }}
              onFocus={() => { if (!input) setShowSuggestions(true); if (messages.length > 0) setChatOpen(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder={convo.step === 'idle' ? 'Ask AI: "grant admin to 17.233.8.2 for 60 minutes"' : 'Type your reply...'}
              className="flex-1 py-4 px-2 bg-transparent text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
            />
            <button type="submit" disabled={!input.trim()}
              className="mr-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-violet-600 text-white text-sm font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {showSuggestions && messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
          >
            <div className="px-4 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">Try these commands</div>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => { setInput(s); setShowSuggestions(false); inputRef.current?.focus(); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3"
              >
                <span className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 text-xs font-bold">{i + 1}</span>
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatOpen && messages.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mt-3 bg-white dark:bg-slate-800/95 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                AI Assistant
              </span>
              <div className="flex items-center gap-1">
                {convo.step !== 'idle' && convo.step !== 'done' && (
                  <button onClick={() => { setConvo({ step: 'idle' }); addMsg('assistant', 'Cancelled. Type a new command.'); }}
                    className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">Cancel</button>
                )}
                <button onClick={() => { setChatOpen(false); setMessages([]); setConvo({ step: 'idle' }); }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">Clear</button>
                <button onClick={() => setChatOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
              </div>
            </div>
            <div ref={chatRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-bl-md'
                  }`}>
                    {msg.loading ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <>
                        {msg.text.split('**').map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>)}
                        {msg.buttons && (
                          <div className="flex gap-2 mt-2">
                            {msg.buttons.map(btn => (
                              <button key={btn.value} onClick={() => handleButton(btn.value)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                  btn.variant === 'primary'
                                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                                    : 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400'
                                }`}
                              >{btn.label}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
