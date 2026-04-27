'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ProgressTracker, { Step } from '@/components/ProgressTracker';
import { motion } from 'framer-motion';
import { secureFetch } from '@/lib/fetchClient';

interface HostnameLog {
  id: string; employeeId: string; email: string; username: string;
  oldHostname: string; newHostname: string; vpnIp: string;
  updatedAt: string; status: string; requestedBy: string;
}

export default function UpdateHostnamePage() {
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [form, setForm] = useState({ vpnIp: '', newHostname: '', employeeId: '', email: '', username: '', oldHostname: '' });
  const [loading, setLoading] = useState(false);
  const [sshLoading, setSshLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [logs, setLogs] = useState<HostnameLog[]>([]);
  const [requestedBy, setRequestedBy] = useState('Loading...');

  useEffect(() => {
    fetch('/api/system-info').then(r => r.json()).then(data => {
      setSystemInfo(data);
      const user = data.clientUsername || data.serverUsername || 'system';
      const host = data.clientHostname || data.serverHostname || '';
      setRequestedBy(host ? `${user} (${host})` : user);
    }).catch(() => setRequestedBy('system'));
  }, []);

  const fetchLogs = useCallback(() => {
    fetch('/api/hostname-logs').then(r => r.json()).then(d => setLogs(d.logs || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const lookupByIp = useCallback(async (ip: string) => {
    if (!ip.startsWith('17.')) return;
    setSshLoading(true);
    try {
      const res = await fetch(`/api/system-info?ip=${ip}`);
      const info = await res.json();
      if (info.remoteUsername) {
        setForm(prev => ({ ...prev, username: info.remoteUsername, oldHostname: info.remoteHostname || '' }));
        const userRes = await fetch(`/api/user?username=${info.remoteUsername}`);
        const userData = await userRes.json();
        if (userData.found && userData.user) {
          setForm(prev => ({
            ...prev,
            employeeId: userData.user.employeeId || prev.employeeId,
            email: userData.user.email || prev.email,
          }));
        }
      }
    } catch { /* ignore */ }
    finally { setSshLoading(false); }
  }, []);

  const handleIpBlur = () => {
    if (form.vpnIp.startsWith('17.')) lookupByIp(form.vpnIp);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.vpnIp.startsWith('17.')) errs.vpnIp = 'Must start with 17. (Apple VPN)';
    if (!form.newHostname) errs.hostname = 'Required';
    else if (!['02HW0','01HW0','34HW0','3HW0','4HW0'].some(p => form.newHostname.toUpperCase().startsWith(p)))
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
      { id: 'update', label: 'Updating hostname', status: 'active' },
      { id: 'complete', label: 'Complete', status: 'pending' },
    ];
    setSteps([...progressSteps]);

    try {
      const res = await secureFetch('/api/update-hostname', {
        method: 'POST',
        body: JSON.stringify({ ...form, requestedBy }),
      });
      const data = await res.json();

      if (!res.ok) {
        progressSteps[0].status = 'error';
        setSteps([...progressSteps]);
        setMessage({ type: 'error', text: data.error || 'Failed to update hostname' });
      } else {
        progressSteps[0].status = 'completed';
        progressSteps[1].status = 'completed';
        setSteps([...progressSteps]);
        setMessage({ type: 'success', text: data.message });
        fetchLogs();
        setTimeout(() => { setMessage(null); setSteps([]); }, 5000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (name: string) =>
    `w-full px-4 py-3 rounded-xl bg-white dark:bg-[#3d3d3f] border ${
      errors[name] ? 'border-red-400' : 'border-slate-300 dark:border-[#4d4d4f]'
    } text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-slate-500 dark:placeholder-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0076DF]/50 focus:border-[#0076DF] transition-all text-sm shadow-sm`;

  const disabledClass = `w-full px-4 py-3 rounded-xl bg-slate-200 dark:bg-[#111] border border-slate-300 dark:border-[#333] text-[#1d1d1f] dark:text-[#f5f5f7] opacity-60 cursor-not-allowed pointer-events-none text-sm`;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#0076DF] hover:text-[#005bb5] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Portal
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-[#f5f5f7] dark:bg-[#1c1c1e] border border-slate-200 dark:border-[#333]">
            <svg className="w-6 h-6 text-[#34C759]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Update Hostname</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#f5f5f7] dark:bg-[#1c1c1e] rounded-2xl border border-slate-200 dark:border-[#333] p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">Employee ID * <span className="text-xs text-[#86868b]">(from DB)</span></label>
              <input type="text" inputMode="numeric" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value.replace(/\D/g, '')})} placeholder="e.g. 1255389" className={fieldClass('employeeId')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">Apple Email * <span className="text-xs text-[#86868b]">(from DB)</span></label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="name@apple.com" className={fieldClass('email')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">VPN IP *</label>
              <input type="text" value={form.vpnIp} onChange={e => setForm({...form, vpnIp: e.target.value})} onBlur={handleIpBlur} placeholder="17.x.x.x" className={fieldClass('vpnIp')} />
              {errors.vpnIp && <p className="mt-1 text-xs text-[#FF3B30]">{errors.vpnIp}</p>}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">Current Hostname <span className="text-xs text-[#0076DF]">(via SSH)</span></label>
              <input type="text" value={form.oldHostname} readOnly placeholder="Auto-detected" className={disabledClass} />
              {sshLoading && <div className="absolute right-3 top-9 w-4 h-4 border-2 border-[#0076DF]/30 border-t-[#0076DF] rounded-full animate-spin" />}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">Username <span className="text-xs text-[#0076DF]">(via SSH)</span></label>
              <input type="text" value={form.username} readOnly placeholder="Auto-detected" className={disabledClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">New Hostname *</label>
              <input type="text" value={form.newHostname} onChange={e => {
                setForm({...form, newHostname: e.target.value});
                const val = e.target.value;
                if (val && !['02HW0','01HW0','34HW0','3HW0','4HW0'].some(p => val.toUpperCase().startsWith(p))) {
                  setErrors(prev => ({ ...prev, hostname: 'Must start with 02HW0, 01HW0, 34HW0, 3HW0, or 4HW0' }));
                } else {
                  setErrors(prev => { const { hostname, ...rest } = prev; return rest; });
                }
              }} placeholder="e.g. 02HW062504" className={fieldClass('hostname')} />
              {errors.hostname && <p className="mt-1 text-xs text-[#FF3B30]">{errors.hostname}</p>}
            </div>
          </div>

          <div className="mt-4 px-4 py-3 rounded-xl bg-white dark:bg-[#2d2d2f] border border-slate-200 dark:border-[#333]">
            <p className="text-xs text-[#86868b]"><span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Requested By:</span> {requestedBy}</p>
          </div>

          <div className="mt-6 flex justify-center">
            <button type="submit" disabled={loading || sshLoading}
              className="px-8 py-3 bg-[#0076DF] text-white font-medium rounded-xl hover:bg-[#005bb5] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
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
            className="bg-[#f5f5f7] dark:bg-[#1c1c1e] rounded-2xl border border-slate-200 dark:border-[#333] p-6"
          >
            <ProgressTracker steps={steps} />
          </motion.div>
        )}

        {message && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`p-4 rounded-xl border ${message.type === 'success'
              ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-[#34C759]'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-[#FF3B30]'
            } text-sm`}
          >{message.text}</motion.div>
        )}

        {logs.length > 0 && (
          <div className="bg-[#f5f5f7] dark:bg-[#1c1c1e] rounded-2xl border border-slate-200 dark:border-[#333] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333]">
              <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#0076DF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Recent Hostname Updates
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#2d2d2f]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">Old Hostname</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">New Hostname</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">Username</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">Updated At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">Requested By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#86868b] uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#333]">
                  {logs.slice(0, 20).map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-[#2d2d2f]">
                      <td className="px-4 py-3 font-mono text-xs">{log.oldHostname}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{log.newHostname}</td>
                      <td className="px-4 py-3 text-xs">{log.username || '-'}</td>
                      <td className="px-4 py-3 text-xs text-[#86868b]">{new Date(log.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3 text-xs text-[#86868b]">{log.requestedBy || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          log.status === 'SUCCESS' ? 'bg-green-100 text-[#34C759] dark:bg-green-500/20' : 'bg-red-100 text-[#FF3B30] dark:bg-red-500/20'
                        }`}>{log.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
