'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Dashboard from '@/components/Dashboard';
import AIPromptBar from '@/components/AIPromptBar';
import ExpiryWarning from '@/components/ExpiryWarning';
import AccessLogs from '@/components/AccessLogs';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [aiResult, setAiResult] = useState<{ action: string; message: string; user?: Record<string, string>; found?: boolean; suggestions?: string[] } | null>(null);

  useEffect(() => {
    fetch('/api/system-info')
      .then(r => r.json())
      .then(setSystemInfo)
      .catch(() => {});
  }, []);

  const handleAIResult = (result: { action: string; message: string; formData?: Record<string, unknown>; user?: Record<string, unknown>; found?: boolean; suggestions?: string[] }) => {
    setAiResult(result as { action: string; message: string; user?: Record<string, string>; found?: boolean; suggestions?: string[] });

    if (result.action === 'hostname') {
      router.push('/update-hostname');
    } else if (result.action === 'cleanup') {
      router.push('/cleanup');
    }
  };

  const requestedBy = systemInfo?.serverUsername
    ? `${systemInfo.serverUsername} (${systemInfo.serverHostname || ''})`
    : 'system';

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#1d1d1f]">
      <Navbar systemInfo={systemInfo} />
      <ExpiryWarning />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 py-4">
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 dark:from-blue-400 dark:via-violet-400 dark:to-purple-400 bg-clip-text text-transparent">
              AI-Powered Admin Portal
            </span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm">
            Manage MacBook access, grant permissions, and run diagnostics with natural language commands
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <AIPromptBar onResult={handleAIResult} requestedBy={requestedBy} />
        </motion.div>

        {aiResult && aiResult.action === 'search' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Search Result</h3>
            {aiResult.found && aiResult.user ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(aiResult.user).map(([key, value]) => (
                  <div key={key} className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
                    <p className="text-xs text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5">{String(value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No user found. Try a different search term.</p>
            )}
          </motion.div>
        )}

        {aiResult && aiResult.action === 'unknown' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/30 p-4"
          >
            <p className="text-sm text-amber-700 dark:text-amber-400">{aiResult.message}</p>
            {aiResult.suggestions && (
              <div className="mt-2 flex flex-wrap gap-2">
                {aiResult.suggestions.map((s, i) => (
                  <code key={i} className="px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-500/20 text-xs text-amber-800 dark:text-amber-300">{s}</code>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Dashboard />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <AccessLogs />
        </motion.div>
      </main>

      <footer className="text-center py-6 text-xs text-slate-400 dark:text-slate-600">
        TCS Admin Portal &middot; Secure MacBook Management & Access Control
      </footer>
    </div>
  );
}
