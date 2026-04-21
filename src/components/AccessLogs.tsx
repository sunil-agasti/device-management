'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Log {
  id: string;
  type: string;
  employeeId: string;
  email: string;
  hostname: string;
  username: string;
  vpnIp: string;
  grantedAt: string;
  duration: number;
  revokedAt: string | null;
  status: string;
  requestedBy: string;
  device?: string;
}

type SortKey = 'hostname' | 'username' | 'vpnIp' | 'grantedAt' | 'status' | 'requestedBy' | 'duration';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

function ForceRevokePopover({ log, onSuccess }: { log: Log; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState(log.vpnIp);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRevoke = async () => {
    if (!ip.startsWith('17.') && ip !== '127.0.0.1') {
      setResult({ success: false, message: 'IP must start with 17.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/force-revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: log.id, type: log.type, username: log.username, vpnIp: ip }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ success: true, message: data.message || 'Revoked successfully' });
        setTimeout(() => { setOpen(false); onSuccess(); }, 1500);
      } else {
        setResult({ success: false, message: data.error || 'Revoke failed' });
      }
    } catch (err) {
      setResult({ success: false, message: 'Request failed: ' + String(err) });
    } finally {
      setLoading(false);
    }
  };

  const isExpiredGranted = log.status === 'GRANTED' &&
    (new Date(log.grantedAt).getTime() + log.duration * 60 * 1000) < Date.now();
  const isFailed = log.status === 'FAILED';

  if (!isFailed && !isExpiredGranted) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setResult(null); setIp(log.vpnIp); }}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
          isFailed
            ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30'
            : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30'
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        {isFailed ? 'Make Standard' : 'Force Revoke'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFailed ? 'bg-red-100 dark:bg-red-500/20' : 'bg-amber-100 dark:bg-amber-500/20'}`}>
                <svg className={`w-4 h-4 ${isFailed ? 'text-red-500' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {isFailed ? 'Retry: Make Standard User' : 'Force Revoke Access'}
                </p>
                <p className="text-xs text-slate-500">
                  {log.type === 'admin' ? 'Remove admin privileges' : 'Re-block GitHub access'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">User: <strong className="text-slate-700 dark:text-slate-300">{log.username || '-'}</strong> on <strong className="text-slate-700 dark:text-slate-300">{log.hostname || '-'}</strong></p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                  VPN IP (update if changed)
                </label>
                <input
                  type="text"
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  placeholder="17.x.x.x"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                {ip !== log.vpnIp && (
                  <p className="text-xs text-blue-500 mt-1">Changed from {log.vpnIp}</p>
                )}
              </div>

              <button
                onClick={handleRevoke}
                disabled={loading || !ip}
                className={`w-full py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                  isFailed
                    ? 'bg-red-500 hover:bg-red-600 text-white disabled:opacity-50'
                    : 'bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50'
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    {isFailed ? 'Make Standard Now' : 'Force Revoke Now'}
                  </>
                )}
              </button>

              {result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`p-2 rounded-lg text-xs ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                  }`}
                >
                  {result.message}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AccessLogs({ type }: { type?: 'admin' | 'github' }) {
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('grantedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const url = type ? `/api/logs?type=${type}` : '/api/logs';
      const res = await fetch(url);
      const data = await res.json();
      setAllLogs(data.logs || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [type]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, sortKey, sortDir]);

  const filtered = allLogs.filter(log => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.hostname?.toLowerCase().includes(q) ||
      log.username?.toLowerCase().includes(q) ||
      log.employeeId?.includes(q) ||
      log.email?.toLowerCase().includes(q) ||
      log.vpnIp?.includes(q) ||
      log.requestedBy?.toLowerCase().includes(q) ||
      log.status?.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';
    switch (sortKey) {
      case 'grantedAt': valA = new Date(a.grantedAt).getTime(); valB = new Date(b.grantedAt).getTime(); break;
      case 'duration': valA = a.duration; valB = b.duration; break;
      default: valA = (a[sortKey] || '').toLowerCase(); valB = (b[sortKey] || '').toLowerCase(); break;
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const downloadCSV = async () => {
    const url = type ? `/api/logs?type=${type}&format=csv` : '/api/logs?format=csv';
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `access_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      GRANTED: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200 dark:border-green-500/30',
      REVOKED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
      EXPIRED: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border-slate-200 dark:border-slate-500/30',
      FAILED: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-200 dark:border-red-500/30',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.GRANTED}`}>
        {status}
      </span>
    );
  };

  const getTimeRemaining = (log: Log) => {
    if (log.status !== 'GRANTED') return null;
    const expiry = new Date(log.grantedAt).getTime() + log.duration * 60 * 1000;
    const remaining = expiry - Date.now();
    if (remaining <= 0) return 'Expiring...';
    const mins = Math.floor(remaining / 60000);
    return `${mins}m remaining`;
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return (
      <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
    );
  };

  const sortableHeaders: { key: SortKey; label: string }[] = [
    { key: 'hostname', label: 'Hostname' },
    { key: 'username', label: 'Username' },
    { key: 'vpnIp', label: 'VPN IP' },
    { key: 'grantedAt', label: 'Granted' },
    { key: 'duration', label: 'Duration' },
  ];

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700/50">
        <h3 className="text-base font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Recent Access Logs
          {filtered.length > 0 && (
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              ({filtered.length}{search ? ` of ${allLogs.length}` : ''})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-full sm:w-52 pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <button onClick={downloadCSV} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            CSV
          </button>
          <button onClick={fetchLogs} disabled={loading} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors flex items-center gap-1.5">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Refresh
          </button>
        </div>
      </div>

      {allLogs.length === 0 && !loading ? (
        <div className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          No access logs yet
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-8 text-center text-slate-400 dark:text-slate-500">
          <p className="text-sm">No logs matching &quot;{search}&quot;</p>
          <button onClick={() => setSearch('')} className="mt-2 text-xs text-blue-500 hover:text-blue-600">Clear search</button>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-slate-800">
                {sortableHeaders.map(h => (
                  <th key={h.key}
                    onClick={() => handleSort(h.key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
                  >
                    <span className="flex items-center gap-1">
                      {h.label}
                      <SortIcon col={h.key} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time Left</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Device</th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
                >
                  <span className="flex items-center gap-1">Status <SortIcon col="status" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              <AnimatePresence>
                {visible.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={i < PAGE_SIZE ? { opacity: 0, x: -20 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i < PAGE_SIZE ? i * 0.02 : 0 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{log.hostname || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.username || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{log.vpnIp}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(log.grantedAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{log.duration}m</td>
                    <td className="px-4 py-3 text-xs">
                      {log.status === 'GRANTED' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">{getTimeRemaining(log)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {log.device === 'Mac' && <span title="Mac">&#128187; Mac</span>}
                      {log.device === 'iPhone' && <span title="iPhone">&#128241; iPhone</span>}
                      {log.device === 'iPad' && <span title="iPad">&#128242; iPad</span>}
                      {(!log.device || log.device === 'Unknown') && <span title="Unknown">&#128421; Unknown</span>}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                    <td className="px-4 py-3">
                      <ForceRevokePopover log={log} onSuccess={fetchLogs} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {hasMore && (
            <div ref={loaderRef} className="py-4 text-center">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <div className="w-4 h-4 border-2 border-slate-300/30 border-t-slate-400 rounded-full animate-spin" />
                Loading more...
              </div>
            </div>
          )}

          {!hasMore && sorted.length > PAGE_SIZE && (
            <div className="py-3 text-center text-xs text-slate-400 dark:text-slate-500">
              All {sorted.length} logs loaded
            </div>
          )}
        </div>
      )}
    </div>
  );
}
