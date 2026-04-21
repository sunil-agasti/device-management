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
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const visibleWarnings = warnings.filter(w => !dismissed.has(w.id));

  return (
    <AnimatePresence>
      {visibleWarnings.map(w => (
        <motion.div
          key={w.id}
          initial={{ opacity: 0, y: -50, x: 50 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: -50, x: 50 }}
          className="fixed top-20 right-4 z-[100] max-w-sm"
        >
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Access Expiring Soon</h4>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {w.type === 'admin' ? 'Admin' : 'GitHub'} access for <strong>{w.username}</strong> on {w.hostname} expires in <strong>{w.minutesLeft} min</strong>
                </p>
              </div>
              <button
                onClick={() => setDismissed(prev => new Set(prev).add(w.id))}
                className="text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
