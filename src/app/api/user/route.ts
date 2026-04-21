import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, findUserByEmployeeId, findUserByIp, upsertUser, getUsers } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const employeeId = searchParams.get('employeeId');
  const ip = searchParams.get('ip');

  if (username) {
    const user = findUserByUsername(username);
    return NextResponse.json({ found: !!user, user: user || null });
  }
  if (employeeId) {
    const user = findUserByEmployeeId(employeeId);
    return NextResponse.json({ found: !!user, user: user || null });
  }
  if (ip) {
    const user = findUserByIp(ip);
    return NextResponse.json({ found: !!user, user: user || null });
  }
  return NextResponse.json({ users: getUsers() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, employeeId, email, hostname, vpnIp } = body;
    if (!username) return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    const user = upsertUser({ username, employeeId, email, hostname, vpnIp });
    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ error: 'Failed to save user' }, { status: 500 });
  }
}
