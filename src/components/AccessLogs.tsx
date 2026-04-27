'use client';

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type SortKey = 'hostname' | 'username' | 'vpnIp' | 'grantedAt' | 'status' | 'requestedBy' | 'duration';
type SortDir = 'asc' | 'desc';

function SortIndicator({ active, direction }: { active: boolean; direction: SortDir }) {
  if (!active) return <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
  return (
    <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
    </svg>
  );
}

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

const PAGE_SIZE = 25;

export default function AccessLogs({ type }: { type?: 'admin' | 'github' }) {
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('grantedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [tick, setTick] = useState(() => Date.now());
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

  useEffect(() => { startTransition(() => { fetchLogs(); }); }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
      setTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount(prev => prev + PAGE_SIZE);
      },
      { rootMargin: '300px', threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sorted.length, visibleCount]);

  const resetVisibleCount = useCallback(() => { startTransition(() => setVisibleCount(PAGE_SIZE)); }, []);
  useEffect(() => { resetVisibleCount(); }, [search, sortKey, sortDir, resetVisibleCount]);

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
    const tooltip = status === 'FAILED' ? 'Revoke failed — sudo password may be incorrect or device unreachable' : undefined;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.GRANTED} ${status === 'FAILED' ? 'cursor-help' : ''}`} title={tooltip}>
        {status}
      </span>
    );
  };

  const getTimeRemaining = useCallback((log: Log) => {
    if (log.status === 'REVOKED' || log.status === 'FAILED') return null;
    const expiry = new Date(log.grantedAt).getTime() + log.duration * 60 * 1000;
    const remaining = expiry - tick;
    if (remaining <= 0) {
      const expiredAt = new Date(expiry).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `Expired at ${expiredAt}`;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (mins < 1) return `${secs}s remaining`;
    return `${mins}m ${secs}s remaining`;
  }, [tick]);

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const sortableHeaders: { key: SortKey; label: string }[] = useMemo(() => [
    { key: 'hostname', label: 'Hostname' },
    { key: 'username', label: 'Username' },
    { key: 'grantedAt', label: 'Granted' },
    { key: 'duration', label: 'Duration' },
    { key: 'requestedBy', label: 'Requested By' },
  ], []);

  return (
    <div className="bg-white dark:bg-[#2d2d2f] rounded-2xl border border-slate-200 dark:border-[#3d3d3f] overflow-hidden">
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
                      <SortIndicator active={sortKey === h.key} direction={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time Left</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Device</th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
                >
                  <span className="flex items-center gap-1">Status <SortIndicator active={sortKey === 'status'} direction={sortDir} /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              <AnimatePresence>
                {visible.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{log.hostname || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.username || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(log.grantedAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{log.duration}m</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.requestedBy || '-'}</td>
                    <td className="px-4 py-3 text-xs">
                      {log.status === 'GRANTED' ? (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">{getTimeRemaining(log)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {log.device === 'Mac' && <span title="Mac">&#128187; Mac</span>}
                      {log.device === 'iPhone' && <span title="iPhone">&#128241; iPhone</span>}
                      {log.device === 'iPad' && <span title="iPad">&#128242; iPad</span>}
                      {(!log.device || log.device === 'Unknown') && <span title="Other">&#128187; Other</span>}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {hasMore && (
            <div ref={loaderRef} className="py-3 text-center">
              <span className="text-xs text-[#86868b]">Loading... ({visible.length} of {sorted.length})</span>
            </div>
          )}

          <div className="py-3 text-center text-xs text-[#86868b] border-t border-slate-100 dark:border-[#333]">
            Showing {visible.length} of {sorted.length} records{search ? ` (filtered from ${allLogs.length})` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
