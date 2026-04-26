'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AccessLogs from '@/components/AccessLogs';

export default function LogsPage() {
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();

  useEffect(() => {
    fetch('/api/system-info').then(r => r.json()).then(setSystemInfo).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-black">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#0076DF] hover:text-[#005bb5] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Portal
          </Link>
          <h1 className="text-2xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Access Logs</h1>
        </div>
        <AccessLogs />
      </main>
    </div>
  );
}
