import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { sanitizeIp } from '@/lib/sanitize';
import { sshFetchUserInfo } from '@/lib/ssh';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetIp = searchParams.get('ip');

    const forwarded = req.headers.get('x-forwarded-for');
    const rawIp = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
    const clientIp = sanitizeIp(rawIp) || '127.0.0.1';

    let serverHostname = 'unknown';
    let serverUsername = 'unknown';
    try {
      serverHostname = execSync('scutil --get ComputerName 2>/dev/null || hostname', { encoding: 'utf-8' }).trim();
      serverUsername = execSync('whoami', { encoding: 'utf-8' }).trim();
    } catch { /* ignore */ }

    let remoteUsername: string | undefined;
    let remoteHostname: string | undefined;

    const probeIp = targetIp ? sanitizeIp(targetIp) : null;

    if (probeIp && probeIp.startsWith('17.')) {
      const result = sshFetchUserInfo(probeIp);
      if (result.success) {
        remoteUsername = result.username;
        remoteHostname = result.hostname;
      }
    }

    return NextResponse.json({ clientIp, serverHostname, serverUsername, remoteUsername, remoteHostname });
  } catch {
    return NextResponse.json({ clientIp: '127.0.0.1', serverHostname: 'unknown', serverUsername: 'unknown' });
  }
}
