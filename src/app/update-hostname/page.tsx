'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ProgressTracker, { Step } from '@/components/ProgressTracker';
import { motion } from 'framer-motion';
import { secureFetch } from '@/lib/fetchClient';

export default function UpdateHostnamePage() {
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [vpnIp, setVpnIp] = useState('');
  const [newHostname, setNewHostname] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    fetch('/api/system-info').then(r => r.json()).then(setSystemInfo).catch(() => {});
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!vpnIp.startsWith('17.')) errs.vpnIp = 'Must start with 17. (Apple VPN)';
    if (!newHostname) errs.hostname = 'Required';
    else if (!['02HW0','01HW0','34HW0','3HW0','4HW0'].some(p => newHostname.toUpperCase().startsWith(p)))
      errs.hostname = 'Must start with 02HW0, 01HW0, 34HW0, 3HW0, or 4HW0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setMessage(null);

    const progressSteps: Step[] = [
      { id: 'connect', label: 'Getting current hostname', status: 'active' },
      { id: 'update', label: 'Updating hostname', status: 'pending' },
      { id: 'jamf', label: 'Running JAMF Commands', status: 'pending' },
      { id: 'complete', label: 'Completing update', status: 'pending' },
    ];
    setSteps([...progressSteps]);

    const advance = (idx: number, error = false) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          progressSteps[idx].status = error ? 'error' : 'completed';
          if (idx + 1 < progressSteps.length && !error) progressSteps[idx + 1].status = 'active';
          setSteps([...progressSteps]);
          resolve();
        }, 800 + Math.random() * 400);
      });
    };

    try {
      await advance(0);

      const res = await secureFetch('/api/update-hostname', {
        method: 'POST',
        body: JSON.stringify({ vpnIp, newHostname }),
      });
      const data = await res.json();

      if (!res.ok) {
        await advance(1, true);
        setMessage({ type: 'error', text: data.error || 'Failed to update hostname' });
      } else {
        await advance(1);
        await advance(2);
        await advance(3);
        setMessage({ type: 'success', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (name: string) =>
    `w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border ${
      errors[name] ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'
    } text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Portal
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 border border-emerald-200/50 dark:border-emerald-500/30">
            <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Update Hostname</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">VPN IP *</label>
            <input type="text" value={vpnIp} onChange={e => setVpnIp(e.target.value)} placeholder="17.x.x.x" className={fieldClass('vpnIp')} />
            {errors.vpnIp && <p className="mt-1 text-xs text-red-500">{errors.vpnIp}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Hostname *</label>
            <input type="text" value={newHostname} onChange={e => setNewHostname(e.target.value)} placeholder="e.g. 02HW062504" className={fieldClass('hostname')} />
            {errors.hostname && <p className="mt-1 text-xs text-red-500">{errors.hostname}</p>}
          </div>
          <div className="flex justify-center">
            <button type="submit" disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
              Update Hostname
            </button>
          </div>
        </form>

        {steps.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 text-center">Processing Request...</h3>
            <ProgressTracker steps={steps} />
          </motion.div>
        )}

        {message && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`p-4 rounded-xl border ${message.type === 'success'
              ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
            } text-sm`}
          >{message.text}</motion.div>
        )}
      </main>
    </div>
  );
}
