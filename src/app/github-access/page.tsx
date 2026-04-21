'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import GithubAccessForm from '@/components/GithubAccessForm';

export default function GithubAccessPage() {
  const searchParams = useSearchParams();
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [requestedBy, setRequestedBy] = useState('');

  useEffect(() => {
    fetch('/api/system-info')
      .then(r => r.json())
      .then(data => {
        setSystemInfo(data);
        setRequestedBy(`${data.serverUsername} (${data.serverHostname})`);
      })
      .catch(() => setRequestedBy('system'));
  }, []);

  const initialData = {
    vpnIp: searchParams.get('vpnIp') || '',
    username: searchParams.get('username') || '',
    hostname: searchParams.get('hostname') || '',
    employeeId: searchParams.get('employeeId') || '',
    email: searchParams.get('email') || '',
    duration: parseInt(searchParams.get('duration') || '30'),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Portal
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20 border border-violet-200/50 dark:border-violet-500/30">
            <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Temporary GitHub Access Request</h1>
          </div>
        </div>

        <GithubAccessForm initialData={initialData} requestedBy={requestedBy} />
      </main>
    </div>
  );
}
