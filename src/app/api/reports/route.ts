import { NextRequest, NextResponse } from 'next/server';
import { getAllLogs, getAdminLogs, getGithubLogs, getUsers } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'all';

    const adminLogs = getAdminLogs();
    const githubLogs = getGithubLogs();
    const allLogs = getAllLogs();
    const users = getUsers();

    const now = new Date();
    const filterByPeriod = (logs: typeof allLogs) => {
      if (period === 'all') return logs;
      const cutoff = new Date();
      if (period === 'today') cutoff.setHours(0, 0, 0, 0);
      else if (period === 'week') cutoff.setDate(now.getDate() - 7);
      else if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
      else if (period === 'quarter') cutoff.setMonth(now.getMonth() - 3);
      else if (period === 'year') cutoff.setFullYear(now.getFullYear() - 1);
      return logs.filter(l => new Date(l.grantedAt) >= cutoff);
    };

    const filteredAdmin = filterByPeriod(adminLogs);
    const filteredGithub = filterByPeriod(githubLogs);
    const filteredAll = filterByPeriod(allLogs);

    const countByStatus = (logs: typeof allLogs) => ({
      total: logs.length,
      granted: logs.filter(l => l.status === 'GRANTED').length,
      revoked: logs.filter(l => l.status === 'REVOKED').length,
      expired: logs.filter(l => l.status === 'EXPIRED').length,
      failed: logs.filter(l => l.status === 'FAILED').length,
    });

    const monthlyBreakdown = () => {
      const months: Record<string, { admin: number; github: number; total: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        months[key] = { admin: 0, github: 0, total: 0 };
      }
      allLogs.forEach(l => {
        const d = new Date(l.grantedAt);
        const key = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        if (months[key]) {
          months[key].total++;
          if (l.type === 'admin') months[key].admin++;
          else months[key].github++;
        }
      });
      return Object.entries(months).map(([month, data]) => ({ month, ...data }));
    };

    const topRequesters = () => {
      const map: Record<string, number> = {};
      filteredAll.forEach(l => {
        const key = l.requestedBy || 'Unknown';
        map[key] = (map[key] || 0) + 1;
      });
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
    };

    const topUsers = () => {
      const map: Record<string, { count: number; username: string; hostname: string }> = {};
      filteredAll.forEach(l => {
        const key = l.username || l.hostname || 'Unknown';
        if (!map[key]) map[key] = { count: 0, username: l.username, hostname: l.hostname };
        map[key].count++;
      });
      return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
    };

    const deviceBreakdown = () => {
      const map: Record<string, number> = { Mac: 0, iPhone: 0, iPad: 0, Unknown: 0 };
      filteredAll.forEach(l => {
        const d = (l as { device?: string }).device || 'Unknown';
        map[d] = (map[d] || 0) + 1;
      });
      return map;
    };

    const avgDuration = () => {
      if (filteredAll.length === 0) return 0;
      const sum = filteredAll.reduce((acc, l) => acc + l.duration, 0);
      return Math.round(sum / filteredAll.length);
    };

    const successRate = () => {
      if (filteredAll.length === 0) return 100;
      const failed = filteredAll.filter(l => l.status === 'FAILED').length;
      return Math.round(((filteredAll.length - failed) / filteredAll.length) * 100);
    };

    return NextResponse.json({
      summary: {
        totalRequests: filteredAll.length,
        totalUsers: users.length,
        activeNow: allLogs.filter(l => l.status === 'GRANTED').length,
        avgDuration: avgDuration(),
        successRate: successRate(),
      },
      admin: countByStatus(filteredAdmin),
      github: countByStatus(filteredGithub),
      combined: countByStatus(filteredAll),
      monthly: monthlyBreakdown(),
      topRequesters: topRequesters(),
      topUsers: topUsers(),
      devices: deviceBreakdown(),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate report: ' + String(err) }, { status: 500 });
  }
}
