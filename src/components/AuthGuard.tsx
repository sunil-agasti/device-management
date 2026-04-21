'use client';

import { useEffect, useState, ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'blocked'>('loading');
  const [clientIp, setClientIp] = useState('');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/system-info');
        const data = await res.json();
        setClientIp(data.clientIp || '');

        if (data.clientIp === '127.0.0.1' || data.clientIp === '::1' || data.clientIp.startsWith('17.') || data.clientIp.startsWith('192.168.') || data.clientIp.startsWith('10.')) {
          setStatus('authenticated');
        } else {
          setStatus('blocked');
        }
      } catch {
        setStatus('authenticated');
      }
    };
    check();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 text-sm">Authenticating via Apple VPN...</p>
        </motion.div>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-500/30 p-8 text-center shadow-xl"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Access Denied</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Connect to <strong>Apple VPN</strong> to access the TCS Admin Portal
          </p>
          <div className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-mono text-slate-500 dark:text-slate-400">
            Your IP: {clientIp}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Expected: 17.x.x.x (Apple VPN range)
          </p>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
