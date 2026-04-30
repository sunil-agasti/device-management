import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { addVisitorLog, getVisitorLogs, findUserByIp, upsertUser } from '@/lib/db';
import { sshFetchUserInfo } from '@/lib/ssh';
import { sanitizeIp } from '@/lib/sanitize';

export async function POST(req: NextRequest) {
  try {
    const forwarded = req.headers.get('x-forwarded-for');
    const rawIp = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
    const ip = sanitizeIp(rawIp) || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || '';

    let username = '';
    let hostname = '';

    const isLocal = ip === '127.0.0.1' || ip === '::1';

    if (isLocal) {
      try {
        username = execSync('whoami', { encoding: 'utf-8', timeout: 3000 }).trim();
        hostname = execSync('scutil --get ComputerName 2>/dev/null || hostname', { encoding: 'utf-8', timeout: 3000 }).trim();
      } catch { /* ignore */ }
    } else {
      const dbUser = findUserByIp(ip);
      if (dbUser && dbUser.username) {
        username = dbUser.username;
        hostname = dbUser.hostname || '';
      } else if (ip.startsWith('17.')) {
        const sshResult = sshFetchUserInfo(ip);
        if (sshResult.success && sshResult.username) {
          username = sshResult.username;
          hostname = sshResult.hostname || '';
          upsertUser({ username: sshResult.username, hostname: sshResult.hostname, vpnIp: ip });
        }
      }
    }

    // Deduplicate: skip if same IP visited within last 15 minutes
    const logs = getVisitorLogs();
    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
    const recentVisit = logs.find(l => l.ip === ip && new Date(l.visitedAt).getTime() > fifteenMinsAgo);
    if (recentVisit) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    addVisitorLog({
      ip,
      username: username || ip,
      hostname: hostname || 'Unknown',
      page: 'device-management-portal',
      visitedAt: new Date().toISOString(),
      userAgent: userAgent.slice(0, 200),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  const logs = getVisitorLogs();
  const today = new Date().toISOString().split('T')[0];
  const todayVisits = logs.filter(l => l.visitedAt.startsWith(today));

  const uniqueToday = new Set(todayVisits.map(l => l.ip)).size;
  const uniqueTotal = new Set(logs.map(l => l.ip)).size;

  const dailyCounts: Record<string, number> = {};
  logs.forEach(l => {
    const day = l.visitedAt.split('T')[0];
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  const topVisitors = Object.entries(
    logs.reduce((acc, l) => {
      const key = l.username || l.ip;
      acc[key] = acc[key] || { username: l.username, hostname: l.hostname, count: 0 };
      acc[key].count++;
      return acc;
    }, {} as Record<string, { username: string; hostname: string; count: number }>)
  ).map(([, v]) => v).sort((a, b) => b.count - a.count).slice(0, 10);

  return NextResponse.json({
    total: logs.length,
    todayVisits: todayVisits.length,
    uniqueToday,
    uniqueTotal,
    dailyCounts,
    topVisitors,
    recentVisitors: logs.slice(0, 20),
  });
}
