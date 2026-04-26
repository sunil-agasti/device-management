'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { motion } from 'framer-motion';

interface CleanupResult {
  success: boolean;
  message: string;
  expiredFixed?: number;
  orphanedUsers?: number;
  duplicatesRemoved?: number;
  staleLogsArchived?: number;
  totalFixed?: number;
}

const tasks = [
  {
    icon: '1',
    title: 'Fix Stuck "Granted" Entries',
    description: 'Scans all access logs for entries still marked as "GRANTED" whose timer has already expired. Updates their status to "EXPIRED" so the logs accurately reflect reality.',
    example: 'e.g. Server restarted mid-session, so the revoke timer was lost but access was already removed on the target machine.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: '2',
    title: 'Detect Incomplete User Profiles',
    description: 'Finds users in the database who are missing their Employee ID or Apple Email. These fields are mandatory and may be missing if the user was auto-created via SSH probe but never completed their profile.',
    example: 'e.g. SSH detected username "abhishek" from IP, but the user never entered their employee ID.',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  {
    icon: '3',
    title: 'Remove Duplicate Logs',
    description: 'Identifies and removes duplicate log entries caused by double-clicks, network retries, or browser refreshes that triggered the same request twice.',
    example: 'e.g. Two identical "GRANTED" entries for the same user, hostname, and timestamp.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: '4',
    title: 'Archive Old Logs (90+ days)',
    description: 'Moves log entries older than 90 days from the active database to an archive file. Keeps the active logs fast and small while preserving historical data for auditing.',
    example: 'Active logs stay in admin_logs.json, archived logs move to archive_admin_logs.json.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
];

export default function CleanupPage() {
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  useEffect(() => {
    fetch('/api/system-info').then(r => r.json()).then(setSystemInfo).catch(() => {});
  }, []);

  const runCleanup = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/cleanup', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, message: 'Cleanup failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#1d1d1f]">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Portal
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 dark:from-orange-500/20 dark:to-amber-500/20 border border-orange-200/50 dark:border-orange-500/30">
            <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Cleanup Utility</h1>
          </div>
        </div>

        {/* What it does */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1">What does this do?</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            The Cleanup Utility performs automated database maintenance. It scans all access logs and user records to fix inconsistencies that can build up over time. Run it periodically to keep your data accurate.
          </p>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.title} className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700/50">
                <div className={`w-9 h-9 rounded-lg ${task.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`text-sm font-bold ${task.color}`}>{task.icon}</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{task.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{task.description}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{task.example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 text-center">
          <button onClick={runCleanup} disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-amber-700 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/25 inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running Cleanup...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Run Cleanup
              </>
            )}
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">Safe to run anytime. Does not delete active sessions or valid records.</p>
        </div>

        {/* Results */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border overflow-hidden ${result.success
              ? 'bg-green-50 dark:bg-green-500/5 border-green-200 dark:border-green-500/30'
              : 'bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/30'
            }`}
          >
            <div className="p-5 flex items-center gap-3">
              {result.success ? (
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
              )}
              <p className={`text-sm font-medium ${result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {result.message}
              </p>
            </div>

            {result.success && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700/50">
                <div className="bg-white dark:bg-slate-800/80 p-4 text-center">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{result.expiredFixed || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Expired Fixed</p>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-4 text-center">
                  <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{result.orphanedUsers || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Incomplete Users</p>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-4 text-center">
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{result.duplicatesRemoved || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Duplicates Removed</p>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-4 text-center">
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{result.staleLogsArchived || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Logs Archived</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
