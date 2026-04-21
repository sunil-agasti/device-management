'use client';

import { useState, useEffect, useCallback } from 'react';
import ProgressTracker, { Step } from './ProgressTracker';
import AccessLogs from './AccessLogs';
import { motion } from 'framer-motion';

interface Props {
  initialData?: {
    vpnIp?: string;
    username?: string;
    hostname?: string;
    employeeId?: string;
    email?: string;
    duration?: number;
  };
  requestedBy: string;
}

export default function AdminAccessForm({ initialData, requestedBy }: Props) {
  const [form, setForm] = useState({
    employeeId: initialData?.employeeId || '',
    email: initialData?.email || '',
    hostname: initialData?.hostname || '',
    vpnIp: initialData?.vpnIp || '',
    username: initialData?.username || '',
    duration: initialData?.duration || 60,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [autoPopulated, setAutoPopulated] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  useEffect(() => {
    if (initialData) {
      setForm(prev => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const lookupByIp = useCallback(async (ip: string) => {
    if (!ip.startsWith('17.') || autoPopulated) return;
    try {
      const res = await fetch(`/api/system-info?ip=${ip}`);
      const info = await res.json();
      if (info.remoteUsername) {
        setForm(prev => ({ ...prev, username: info.remoteUsername, hostname: info.remoteHostname || prev.hostname }));

        const userRes = await fetch(`/api/user?username=${info.remoteUsername}`);
        const userData = await userRes.json();
        if (userData.found && userData.user) {
          setForm(prev => ({
            ...prev,
            employeeId: userData.user.employeeId || prev.employeeId,
            email: userData.user.email || prev.email,
          }));
        }
        setAutoPopulated(true);
      }
    } catch { /* ignore */ }
  }, [autoPopulated]);

  const handleIpBlur = () => {
    if (form.vpnIp.startsWith('17.')) lookupByIp(form.vpnIp);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.vpnIp.startsWith('17.')) errs.vpnIp = 'Must start with 17. (Apple VPN)';
    if (!form.hostname) errs.hostname = 'Required';
    else if (!['02HW0','01HW0','34HW0','3HW0','4HW0'].some(p => form.hostname.toUpperCase().startsWith(p)))
      errs.hostname = 'Invalid prefix. Must start with 02HW0, 01HW0, 34HW0, 3HW0, or 4HW0';
    if (!form.employeeId || !/^\d+$/.test(form.employeeId)) errs.employeeId = 'Numeric ID required';
    if (!form.email.endsWith('@apple.com')) errs.email = 'Must be @apple.com';
    if (!form.username) errs.username = 'Required';
    if (form.duration < 5 || form.duration > 180) errs.duration = '5-180 minutes';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setMessage(null);

    const progressSteps: Step[] = [
      { id: 'verify', label: 'Verifying hostname', status: 'active' },
      { id: 'user', label: 'Checking user exists', status: 'pending' },
      { id: 'grant', label: 'Granting admin access', status: 'pending' },
      { id: 'jamf-manage', label: 'JAMF Manage', status: 'pending' },
      { id: 'jamf-policy', label: 'JAMF Policy', status: 'pending' },
      { id: 'jamf-recon', label: 'JAMF Recon', status: 'pending' },
      { id: 'schedule', label: 'Scheduling auto-revoke', status: 'pending' },
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
      await advance(1);

      const res = await fetch('/api/admin-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, requestedBy }),
      });
      const data = await res.json();

      if (!res.ok) {
        await advance(2, true);
        setMessage({ type: 'error', text: data.error || 'Failed to grant access' });
      } else {
        await advance(2);
        await advance(3);
        await advance(4);
        await advance(5);
        await advance(6);
        setMessage({ type: 'success', text: data.message });
        setLogRefreshKey(prev => prev + 1);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Request failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (name: string) =>
    `w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border ${
      errors[name] ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-600'
    } text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm`;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">TCS Employee ID *</label>
            <input type="text" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} placeholder="e.g. 1255389" className={fieldClass('employeeId')} />
            {errors.employeeId && <p className="mt-1 text-xs text-red-500">{errors.employeeId}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Apple Email *</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="name@apple.com" className={fieldClass('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Hostname *</label>
            <input type="text" value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} placeholder="e.g. 02HW062504" className={fieldClass('hostname')} />
            {errors.hostname && <p className="mt-1 text-xs text-red-500">{errors.hostname}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">VPN IP *</label>
            <input type="text" value={form.vpnIp} onChange={e => setForm({...form, vpnIp: e.target.value})} onBlur={handleIpBlur} placeholder="17.x.x.x" className={fieldClass('vpnIp')} />
            {errors.vpnIp && <p className="mt-1 text-xs text-red-500">{errors.vpnIp}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Username to Promote *</label>
            <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="Console username" className={fieldClass('username')} />
            {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Access Duration (minutes) *</label>
            <input type="text" inputMode="numeric" value={form.duration} onChange={e => setForm({...form, duration: e.target.value === '' ? '' as unknown as number : parseInt(e.target.value) || 0})} className={fieldClass('duration')} />
            <p className="mt-1 text-xs text-slate-400">Default: 60 min. Max: 180 min (3 hours)</p>
            {errors.duration && <p className="mt-1 text-xs text-red-500">{errors.duration}</p>}
          </div>
        </div>

        <div className="mt-4 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">Requested By:</span> {requestedBy}
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <button type="submit" disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center gap-2"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            )}
            Request Admin Access
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
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className={`p-4 rounded-xl border ${message.type === 'success'
            ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <p className="text-sm">{message.text}</p>
          </div>
        </motion.div>
      )}

      <AccessLogs type="admin" key={logRefreshKey} />
    </div>
  );
}
