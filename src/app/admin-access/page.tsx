'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AdminAccessForm from '@/components/AdminAccessForm';

function AdminAccessContent() {
  const searchParams = useSearchParams();
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [requestedBy, setRequestedBy] = useState('Loading...');

  useEffect(() => {
    fetch('/api/system-info')
      .then(r => r.json())
      .then(data => {
        setSystemInfo(data);
        const user = data.clientUsername || data.serverUsername || 'system';
        const host = data.clientHostname || data.serverHostname || '';
        setRequestedBy(host ? `${user} (${host})` : user);
      })
      .catch(() => setRequestedBy('system'));
  }, []);

  const initialData = {
    vpnIp: searchParams.get('vpnIp') || '',
    username: searchParams.get('username') || '',
    hostname: searchParams.get('hostname') || '',
    employeeId: searchParams.get('employeeId') || '',
    email: searchParams.get('email') || '',
    duration: parseInt(searchParams.get('duration') || '60'),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/device-management-portal" className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Portal
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20 border border-blue-200/50 dark:border-blue-500/30">
            <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Temporary Admin Access Request</h1>
          </div>
        </div>

        <AdminAccessForm initialData={initialData} requestedBy={requestedBy} />
      </main>
    </div>
  );
}

export default function AdminAccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-3 border-[#0076DF]/20 border-t-[#0076DF] rounded-full animate-spin" /></div>}>
      <AdminAccessContent />
    </Suspense>
  );
}
