'use client';

import { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { motion } from 'framer-motion';

interface ReportData {
  summary: { totalRequests: number; totalUsers: number; activeNow: number; avgDuration: number; successRate: number };
  admin: { total: number; granted: number; revoked: number; expired: number; failed: number };
  github: { total: number; granted: number; revoked: number; expired: number; failed: number };
  combined: { total: number; granted: number; revoked: number; expired: number; failed: number };
  monthly: { month: string; admin: number; github: number; total: number }[];
  topRequesters: { name: string; count: number }[];
  topUsers: { username: string; hostname: string; count: number }[];
  devices: Record<string, number>;
}

const periods = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

export default function ReportsPage() {
  const [systemInfo, setSystemInfo] = useState<{ serverUsername: string; serverHostname: string; clientIp: string } | undefined>();
  const [data, setData] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/system-info').then(r => r.json()).then(setSystemInfo).catch(() => {});
  }, []);

  useEffect(() => {
    startTransition(() => setLoading(true));
    fetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const maxMonthly = data?.monthly ? Math.max(...data.monthly.map(m => m.total), 1) : 1;

  const buildReportRows = () => {
    if (!data) return [];
    const rows: string[][] = [];
    rows.push(['TCS Admin Portal - Report', '', '', '']);
    rows.push(['Period', periods.find(p => p.value === period)?.label || period, '', '']);
    rows.push(['Generated', new Date().toLocaleString(), '', '']);
    rows.push([]);
    rows.push(['Summary', '', '', '']);
    rows.push(['Total Requests', String(data.summary?.totalRequests ?? 0), '', '']);
    rows.push(['Registered Users', String(data.summary?.totalUsers ?? 0), '', '']);
    rows.push(['Active Now', String(data.summary?.activeNow ?? 0), '', '']);
    rows.push(['Avg Duration (min)', String(data.summary?.avgDuration ?? 0), '', '']);
    rows.push(['Success Rate', `${data.summary?.successRate ?? 100}%`, '', '']);
    rows.push([]);
    rows.push(['Breakdown', 'Total', 'Granted', 'Revoked', 'Expired', 'Failed']);
    rows.push(['Admin Access', String(data.admin?.total ?? 0), String(data.admin?.granted ?? 0), String(data.admin?.revoked ?? 0), String(data.admin?.expired ?? 0), String(data.admin?.failed ?? 0)]);
    rows.push(['GitHub Access', String(data.github?.total ?? 0), String(data.github?.granted ?? 0), String(data.github?.revoked ?? 0), String(data.github?.expired ?? 0), String(data.github?.failed ?? 0)]);
    rows.push([]);
    rows.push(['Monthly Trend', 'Admin', 'GitHub', 'Total']);
    (data.monthly || []).forEach(m => rows.push([m.month, String(m.admin), String(m.github), String(m.total)]));
    rows.push([]);
    rows.push(['Top Requesters', 'Count']);
    (data.topRequesters || []).forEach(r => rows.push([r.name, String(r.count)]));
    rows.push([]);
    rows.push(['Most Accessed Users', 'Hostname', 'Count']);
    (data.topUsers || []).forEach(u => rows.push([u.username, u.hostname, String(u.count)]));
    rows.push([]);
    rows.push(['Device Breakdown', 'Count']);
    Object.entries(data.devices || {}).forEach(([d, c]) => rows.push([d, String(c)]));
    return rows;
  };

  const downloadCSV = () => {
    const rows = buildReportRows();
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tcs_report_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const downloadExcel = () => {
    const rows = buildReportRows();
    const tableRows = rows.map(r => `<tr>${r.map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Report</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1">${tableRows}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tcs_report_${period}_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#1d1d1f]">
      <Navbar systemInfo={systemInfo} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Portal
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Leadership Reports</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {periods.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    period === p.value
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >{p.label}</button>
              ))}
            </div>
            {data && !loading && (
              <div className="flex gap-1.5">
                <button onClick={downloadCSV} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors flex items-center gap-1.5 border border-green-200 dark:border-green-500/30">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  CSV
                </button>
                <button onClick={downloadExcel} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors flex items-center gap-1.5 border border-blue-200 dark:border-blue-500/30">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Excel
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Generating report...</p>
          </div>
        ) : data && data.summary ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Total Requests', value: data.summary?.totalRequests ?? 0, color: 'from-blue-500 to-violet-500' },
                { label: 'Registered Users', value: data.summary?.totalUsers ?? 0, color: 'from-violet-500 to-purple-500' },
                { label: 'Active Now', value: data.summary?.activeNow ?? 0, color: 'from-green-500 to-emerald-500' },
                { label: 'Avg Duration', value: `${data.summary?.avgDuration ?? 0}m`, color: 'from-amber-500 to-orange-500' },
                { label: 'Success Rate', value: `${data.summary?.successRate ?? 100}%`, color: 'from-cyan-500 to-blue-500' },
              ].map((card, i) => (
                <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>{card.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Admin vs GitHub Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Admin Access', data: data.admin || { total: 0, granted: 0, revoked: 0, expired: 0, failed: 0 }, gradient: 'from-blue-500 to-cyan-500', icon: '\uD83D\uDD12' },
                { title: 'GitHub Access', data: data.github || { total: 0, granted: 0, revoked: 0, expired: 0, failed: 0 }, gradient: 'from-violet-500 to-purple-500', icon: '\uD83D\uDCBB' },
              ].map((section) => (
                <motion.div key={section.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
                >
                  <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <span>{section.icon}</span> {section.title}
                    <span className="ml-auto text-2xl font-bold bg-gradient-to-r from-slate-600 to-slate-400 dark:from-slate-300 dark:to-slate-500 bg-clip-text text-transparent">{section.data.total}</span>
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Granted', value: section.data.granted, color: 'bg-green-500' },
                      { label: 'Revoked', value: section.data.revoked, color: 'bg-amber-500' },
                      { label: 'Expired', value: section.data.expired, color: 'bg-slate-400' },
                      { label: 'Failed', value: section.data.failed, color: 'bg-red-500' },
                    ].map(stat => (
                      <div key={stat.label} className="text-center">
                        <div className={`w-3 h-3 rounded-full ${stat.color} mx-auto mb-1.5`} />
                        <p className="text-lg font-bold text-slate-800 dark:text-white">{stat.value}</p>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  {section.data.total > 0 && (
                    <div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex">
                      <div className="bg-green-500 h-full" style={{ width: `${(section.data.granted / section.data.total) * 100}%` }} />
                      <div className="bg-amber-500 h-full" style={{ width: `${(section.data.revoked / section.data.total) * 100}%` }} />
                      <div className="bg-slate-400 h-full" style={{ width: `${(section.data.expired / section.data.total) * 100}%` }} />
                      <div className="bg-red-500 h-full" style={{ width: `${(section.data.failed / section.data.total) * 100}%` }} />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Monthly Trend */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
            >
              <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-6">Monthly Trend (Last 12 Months)</h3>
              <div className="flex items-end gap-2 h-48">
                {(data.monthly || []).map((m, i) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '160px', justifyContent: 'flex-end' }}>
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: `${(m.admin / maxMonthly) * 100}%` }}
                        transition={{ delay: i * 0.05, duration: 0.5 }}
                        className="w-full rounded-t-sm bg-gradient-to-t from-blue-500 to-blue-400 min-h-0"
                        title={`Admin: ${m.admin}`}
                      />
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: `${(m.github / maxMonthly) * 100}%` }}
                        transition={{ delay: i * 0.05 + 0.1, duration: 0.5 }}
                        className="w-full rounded-t-sm bg-gradient-to-t from-violet-500 to-violet-400 min-h-0"
                        title={`GitHub: ${m.github}`}
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center leading-tight mt-1">{m.month.split(' ')[0]}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Admin</div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-3 h-3 rounded-sm bg-violet-500" /> GitHub</div>
              </div>
            </motion.div>

            {/* Bottom Grid: Top Users, Requesters, Devices */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Top Requesters */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
              >
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Top Requesters</h3>
                {(data.topRequesters || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {(data.topRequesters || []).map((r, i) => (
                      <div key={r.name} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{r.name}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Top Users */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
              >
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Most Accessed Users</h3>
                {(data.topUsers || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {(data.topUsers || []).map((u, i) => (
                      <div key={u.username || u.hostname} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-slate-600 dark:text-slate-300 block truncate">{u.username || '-'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{u.hostname || '-'}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">{u.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Device Breakdown */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6"
              >
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Access by Device</h3>
                <div className="space-y-3">
                  {Object.entries(data.devices || {}).map(([device, count]) => {
                    const total = Object.values(data.devices || {}).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.round((count / total) * 100);
                    const icons: Record<string, string> = { Mac: '\uD83D\uDCBB', iPhone: '\uD83D\uDCF1', iPad: '\uD83D\uDCF2', Unknown: '\uD83D\uDDA5\uFE0F' };
                    const colors: Record<string, string> = { Mac: 'bg-blue-500', iPhone: 'bg-green-500', iPad: 'bg-violet-500', Unknown: 'bg-slate-400' };
                    return (
                      <div key={device}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600 dark:text-slate-300">{icons[device]} {device}</span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-white">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
                            className={`h-full rounded-full ${colors[device] || 'bg-slate-400'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          <div className="py-20 text-center text-slate-400">Failed to load report data</div>
        )}
      </main>
    </div>
  );
}
