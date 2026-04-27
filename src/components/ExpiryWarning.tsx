'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExpiringAccess {
  id: string;
  username: string;
  hostname: string;
  type: string;
  minutesLeft: number;
}

export default function ExpiryWarning() {
  const [warnings, setWarnings] = useState<ExpiringAccess[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        const expiring = (data.logs || [])
          .filter((l: { status: string; grantedAt: string; duration: number }) => {
            if (l.status !== 'GRANTED') return false;
            const expiry = new Date(l.grantedAt).getTime() + l.duration * 60 * 1000;
            const remaining = (expiry - Date.now()) / 60000;
            return remaining > 0 && remaining <= 5;
          })
          .map((l: { id: string; username: string; hostname: string; type: string; grantedAt: string; duration: number }) => ({
            id: l.id,
            username: l.username,
            hostname: l.hostname,
            type: l.type,
            minutesLeft: Math.ceil((new Date(l.grantedAt).getTime() + l.duration * 60 * 1000 - Date.now()) / 60000),
          }));
        setWarnings(expiring);
      } catch { /* ignore */ }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  const visible = warnings.filter(w => !dismissed.has(w.id));

  const dismissOne = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  };

  const dismissAll = () => {
    setDismissed(prev => {
      const next = new Set(prev);
      visible.forEach(w => next.add(w.id));
      return next;
    });
    setExpanded(false);
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[100] max-w-sm">
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2.5 px-4 py-3 bg-[#FF9500] text-white rounded-xl shadow-lg shadow-[#FF9500]/30 hover:bg-[#E68600] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-sm font-semibold">
              {visible.length} access{visible.length > 1 ? 'es' : ''} expiring soon
            </span>
            <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200 dark:border-[#333] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#FF9500] text-white">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {visible.length} Expiring
              </span>
              <div className="flex items-center gap-1">
                <button onClick={dismissAll} className="text-[10px] px-2 py-0.5 rounded bg-white/20 hover:bg-white/30">Dismiss All</button>
                <button onClick={() => setExpanded(false)} className="p-0.5 rounded hover:bg-white/20">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-[#333]">
              {visible.map(w => (
                <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-[#2d2d2f]"
                >
                  <div className="w-8 h-8 rounded-full bg-[#FF9500]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#FF9500]">{w.minutesLeft}m</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                      {w.type === 'admin' ? 'Admin' : 'GitHub'} — {w.username}
                    </p>
                    <p className="text-[10px] text-[#86868b]">{w.hostname}</p>
                  </div>
                  <button onClick={() => dismissOne(w.id)} className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
