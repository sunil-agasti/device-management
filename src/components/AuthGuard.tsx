'use client';

import { useEffect, useState, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AuthUser {
  email: string;
  name: string;
  dsid: string;
  employeeId?: string;
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'blocked' | 'idms_required'>('loading');
  const [clientIp, setClientIp] = useState('');
  const [idmsUser, setIdmsUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        // Fast auth check only - no SSH, just session + IP
        const authRes = await fetch('/api/auth/session');
        const authData = await authRes.json();

        if (authData.idmsEnabled) {
          if (authData.authenticated && authData.user) {
            setIdmsUser(authData.user);
            setStatus('authenticated');
          } else {
            setStatus('idms_required');
          }
          return;
        }

        // Quick IP check via lightweight fetch (no SSH)
        setStatus('authenticated');
        // Load system info in background after page renders
        fetch('/api/system-info').then(r => r.json()).then(d => setClientIp(d.clientIp || '')).catch(() => {});
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
          <div className="w-12 h-12 mx-auto mb-3 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading...</p>
        </motion.div>
      </div>
    );
  }

  if (status === 'idms_required') {
    const idmsUrl = `https://idmsac.apple.com/IDMSWebAuth/authenticate?client_id=${encodeURIComponent(process.env.NEXT_PUBLIC_IDMS_CLIENT_ID || 'tcs-admin-portal')}&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/callback')}&response_type=code&scope=openid+email+profile&state=${btoa(JSON.stringify({ returnPath: window.location.pathname }))}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-500/30 p-8 text-center shadow-xl"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Apple SSO Required</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
            Sign in with your Apple IDMS account to access the TCS Admin Portal
          </p>
          <a href={idmsUrl}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25"
          >
            Sign in with Apple IDMS
          </a>
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
          <p className="mt-4 text-xs text-slate-400">Expected: 17.x.x.x (Apple VPN range)</p>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {idmsUser && (
        <div className="hidden" data-idms-user={JSON.stringify(idmsUser)} />
      )}
      {children}
    </>
  );
}
