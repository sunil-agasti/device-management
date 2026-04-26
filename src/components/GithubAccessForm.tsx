'use client';

import { useState, useEffect, useRef } from 'react';
import ProgressTracker, { Step } from './ProgressTracker';
import AccessLogs from './AccessLogs';
import { motion } from 'framer-motion';
import { secureFetch } from '@/lib/fetchClient';

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

export default function GithubAccessForm({ initialData, requestedBy }: Props) {
  const [form, setForm] = useState({
    employeeId: initialData?.employeeId || '',
    email: initialData?.email || '',
    hostname: initialData?.hostname || '',
    vpnIp: initialData?.vpnIp || '',
    username: initialData?.username || '',
    duration: initialData?.duration || 30,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepLogs, setStepLogs] = useState<Record<string, string>>({});
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshError, setSshError] = useState('');

  const formRef = useRef(form);
  useEffect(() => {
    if (initialData) {
      const updated = { ...formRef.current, ...initialData };
      formRef.current = updated;
      setForm(updated);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIpBlur = async () => {
    if (!form.vpnIp.startsWith('17.')) return;
    setSshLoading(true);
    setSshError('');
    try {
      // SSH probe to get username and hostname from target machine
      const sysRes = await fetch(`/api/system-info?ip=${form.vpnIp}`);
      const sysData = await sysRes.json();
      if (sysData.remoteUsername) {
        setForm(prev => ({
          ...prev,
          username: sysData.remoteUsername || prev.username,
          hostname: sysData.remoteHostname || prev.hostname,
        }));

        // Then check DB for employee ID and email
        const userRes = await fetch(`/api/user?username=${sysData.remoteUsername}`);
        const userData = await userRes.json();
        if (userData.found && userData.user) {
          setForm(prev => ({
            ...prev,
            employeeId: userData.user.employeeId || prev.employeeId,
            email: userData.user.email || prev.email,
          }));
        }
        return;
      }

      // Fallback: check DB by IP
      const res = await fetch(`/api/user?ip=${form.vpnIp}`);
      const data = await res.json();
      if (data.found && data.user) {
        setForm(prev => ({
          ...prev,
          username: data.user.username || prev.username,
          hostname: data.user.hostname || prev.hostname,
          employeeId: data.user.employeeId || prev.employeeId,
          email: data.user.email || prev.email,
        }));
      } else {
        setSshError(`Unable to connect to ${form.vpnIp}. Verify the device is online and SSH credentials are correct.`);
      }
    } catch {
      setSshError(`Connection failed to ${form.vpnIp}. Check VPN IP and try again.`);
    } finally {
      setSshLoading(false);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.vpnIp.startsWith('17.')) errs.vpnIp = 'Must start with 17. (Apple VPN)';
    if (!form.employeeId || !/^\d+$/.test(form.employeeId)) errs.employeeId = 'Numeric ID required';
    if (!form.email.endsWith('@apple.com')) errs.email = 'Must be @apple.com';
    if (form.duration < 5 || form.duration > 180) errs.duration = '5-180 minutes';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setMessage(null);
    setStepLogs({});
    setExpandedStep(null);

    const progressSteps: Step[] = [
      { id: 'unblock', label: 'Unblocking GitHub', status: 'active' },
      { id: 'jamf', label: 'Running JAMF Commands', status: 'pending' },
      { id: 'schedule', label: 'Scheduling auto-revoke', status: 'pending' },
    ];
    setSteps([...progressSteps]);

    try {
      const res = await secureFetch('/api/github-access', {
        method: 'POST',
        body: JSON.stringify({ ...form, requestedBy }),
      });
      const data = await res.json();

      if (data.steps) {
        const logs: Record<string, string> = {};
        const updatedSteps = progressSteps.map(step => {
          const apiStep = data.steps.find((s: { id: string }) => s.id === step.id);
          if (apiStep) {
            logs[step.id] = apiStep.log || '';
            return { ...step, status: apiStep.success ? 'completed' as const : 'error' as const };
          }
          return { ...step, status: data.success ? 'completed' as const : 'pending' as const };
        });
        if (data.steps.find((s: { id: string }) => s.id === 'notify')) {
          const notify = data.steps.find((s: { id: string }) => s.id === 'notify');
          logs['notify'] = notify.log || '';
        }
        setStepLogs(logs);
        setSteps(updatedSteps);
      }

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to grant access' });
      } else {
        setMessage({ type: 'success', text: data.message });
        setLogRefreshKey(prev => prev + 1);
        setForm({ employeeId: '', email: '', hostname: '', vpnIp: '', username: '', duration: 30 });
        setSshError('');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Request failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (name: string) =>
    `w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-700/50 border ${
      errors[name] ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600'
    } text-[#1d1d1f] dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm shadow-sm`;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] dark:text-slate-300 mb-1.5">TCS Employee ID * <span className="text-xs text-slate-400 font-normal">(from DB, editable)</span></label>
            <input type="text" inputMode="numeric" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value.replace(/\D/g, '')})} placeholder="e.g. 1255389" className={fieldClass('employeeId')} />
            {errors.employeeId && <p className="mt-1 text-xs text-red-500">{errors.employeeId}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] dark:text-slate-300 mb-1.5">Apple Email * <span className="text-xs text-slate-400 font-normal">(from DB, editable)</span></label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="name@apple.com" className={fieldClass('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] dark:text-slate-300 mb-1.5">Hostname <span className="text-xs text-blue-500 font-normal">(via SSH)</span></label>
            <input type="text" value={form.hostname} readOnly placeholder="Auto-populated from VPN IP" className={`${fieldClass('hostname')} bg-slate-100 dark:bg-slate-700/70 cursor-not-allowed`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] dark:text-slate-300 mb-1.5">VPN IP *</label>
            <input type="text" value={form.vpnIp} onChange={e => setForm({...form, vpnIp: e.target.value})} onBlur={handleIpBlur} placeholder="17.x.x.x" className={fieldClass('vpnIp')} />
            {errors.vpnIp && <p className="mt-1 text-xs text-red-500">{errors.vpnIp}</p>}
            {sshError && <p className="mt-1 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/30">{sshError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1d1d1f] dark:text-slate-300 mb-1.5">Access Duration (minutes) *</label>
            <input type="text" inputMode="numeric" value={form.duration} onChange={e => setForm({...form, duration: e.target.value === '' ? '' as unknown as number : parseInt(e.target.value) || 0})} className={fieldClass('duration')} />
            <p className="mt-1 text-xs text-slate-400">Default: 30 min. Max: 180 min (3 hours)</p>
            {errors.duration && <p className="mt-1 text-xs text-red-500">{errors.duration}</p>}
          </div>
        </div>

        <div className="mt-4 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">Requested By:</span> {requestedBy}
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <button type="submit" disabled={loading || sshLoading}
            className="px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 flex items-center gap-2"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            )}
            Grant GitHub Access
          </button>
        </div>
      </form>

      {steps.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
        >
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 text-center">
            {loading ? 'Processing Request...' : 'Request Complete'}
          </h3>
          <ProgressTracker steps={steps} />
          {requestedBy.includes('sunilkumaragasti') && (
          <div className="mt-4 space-y-1.5">
            {steps.map(step => (
              <div key={step.id} className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  {step.status === 'active' && <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />}
                  {step.status === 'completed' && <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  {step.status === 'error' && <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>}
                  {step.status === 'pending' && <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />}
                  <span className={`font-medium ${step.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{step.label}</span>
                  <svg className={`w-3 h-3 ml-auto text-slate-400 transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                {expandedStep === step.id && (
                  <div className="bg-slate-900 dark:bg-black px-3 py-2 font-mono text-[11px] text-green-400 whitespace-pre-wrap max-h-40 overflow-y-auto border-t border-slate-200 dark:border-slate-700">
                    {step.status === 'active' && <span className="text-blue-400 animate-pulse">Executing...</span>}
                    {step.status === 'pending' && <span className="text-slate-500">Waiting...</span>}
                    {stepLogs[step.id] && <span className={step.status === 'error' ? 'text-red-400' : ''}>{stepLogs[step.id]}</span>}
                    {step.status === 'completed' && !stepLogs[step.id] && <span className="text-green-400">Done</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
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

      <AccessLogs type="github" key={logRefreshKey} />
    </div>
  );
}
