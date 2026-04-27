'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
  id: string;
  type: string;
  hostname: string;
  username: string;
  vpnIp: string;
  grantedAt: string;
  duration: number;
  status: string;
  requestedBy?: string;
  scheduledRevokeAt?: string;
}

export default function ActivityFeed() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tick, setTick] = useState(Date.now());

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setLogs((data.logs || []).slice(0, 10));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    const i = setInterval(() => { fetchLogs(); setTick(Date.now()); }, 15000);
    return () => clearInterval(i);
  }, [fetchLogs]);

  if (logs.length === 0) return null;

  const getTimeInfo = (log: LogEntry) => {
    const expiry = new Date(log.grantedAt).getTime() + log.duration * 60000;
    const remaining = expiry - tick;
    if (log.status === 'REVOKED') return { text: 'Revoked', color: 'text-[#FF9500]', icon: '🔒' };
    if (log.status === 'FAILED') return { text: 'Failed', color: 'text-[#FF3B30]', icon: '⚠️' };
    if (log.status === 'EXPIRED') return { text: 'Expired', color: 'text-[#86868b]', icon: '⏰' };
    if (remaining <= 0) return { text: 'Expiring...', color: 'text-[#FF9500]', icon: '⏰' };
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return { text: `${mins}m ${secs}s left`, color: 'text-[#34C759]', icon: '✅' };
  };

  const getTypeLabel = (type: string) => {
    if (type === 'admin') return { label: 'Admin Access', bg: 'bg-[#0076DF]/10', text: 'text-[#0076DF]' };
    if (type === 'github') return { label: 'GitHub Access', bg: 'bg-[#AF52DE]/10', text: 'text-[#AF52DE]' };
    return { label: type, bg: 'bg-slate-100', text: 'text-slate-500' };
  };

  const active = logs.filter(l => l.status === 'GRANTED');
  const recent = logs.filter(l => l.status !== 'GRANTED').slice(0, 5);

  return (
    <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200 dark:border-[#333] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#333] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
          Activity
        </h3>
        <span className="text-[10px] text-[#86868b]">{logs.length} recent</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-[#333]">
        <AnimatePresence>
          {active.length > 0 && active.map(log => {
            const time = getTimeInfo(log);
            const type = getTypeLabel(log.type);
            const action = log.type === 'admin' ? 'admin access' : 'GitHub access';
            return (
              <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-[#2c2c2e] transition-colors"
              >
                <span className="text-lg">{time.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                      <strong>{log.requestedBy?.split(' (')[0] || 'System'}</strong> granted {action} to <strong>{log.username}</strong>
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${type.bg} ${type.text}`}>{type.label}</span>
                  </div>
                  <span className="text-[11px] text-[#86868b]">{log.hostname} · {log.vpnIp} · {log.duration}m</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-semibold ${time.color}`}>{time.text}</div>
                </div>
              </motion.div>
            );
          })}
          {recent.map(log => {
            const time = getTimeInfo(log);
            const type = getTypeLabel(log.type);
            const action = log.type === 'admin' ? 'admin access' : 'GitHub access';
            const verb = log.status === 'REVOKED' ? 'revoked' : log.status === 'FAILED' ? 'failed to grant' : 'granted';
            return (
              <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-[#2c2c2e] transition-colors opacity-70"
              >
                <span className="text-lg">{time.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                      <strong>{log.requestedBy?.split(' (')[0] || 'System'}</strong> {verb} {action} for <strong>{log.username}</strong>
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${type.bg} ${type.text}`}>{type.label}</span>
                  </div>
                  <span className="text-[11px] text-[#86868b]">{log.hostname} · {new Date(log.grantedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className={`text-xs font-semibold ${time.color} flex-shrink-0`}>{time.text}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
