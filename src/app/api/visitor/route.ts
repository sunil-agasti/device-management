import { NextRequest, NextResponse } from 'next/server';
import { addVisitorLog, getVisitorLogs, findUserByIp } from '@/lib/db';
import { sanitizeIp } from '@/lib/sanitize';

export async function POST(req: NextRequest) {
  try {
    const { page } = await req.json();
    const forwarded = req.headers.get('x-forwarded-for');
    const rawIp = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
    const ip = sanitizeIp(rawIp) || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || '';

    let username = '';
    let hostname = '';
    const dbUser = findUserByIp(ip);
    if (dbUser) {
      username = dbUser.username || '';
      hostname = dbUser.hostname || '';
    }

    addVisitorLog({
      ip, username, hostname,
      page: page || '/',
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
