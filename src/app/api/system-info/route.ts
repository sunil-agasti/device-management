import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { sanitizeIp } from '@/lib/sanitize';
import { sshFetchUserInfo } from '@/lib/ssh';
import { findUserByIp } from '@/lib/db';

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

    // Detect the connecting user's identity from their client IP
    let clientUsername = serverUsername;
    let clientHostname = serverHostname;

    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1';

    if (!isLocal && clientIp.startsWith('17.')) {
      // Try DB first (fast)
      const dbUser = findUserByIp(clientIp);
      if (dbUser && dbUser.username) {
        clientUsername = dbUser.username;
        clientHostname = dbUser.hostname || clientHostname;
      } else if (!probeIp) {
        // SSH to client IP to get their identity (only if no target probe running)
        const clientInfo = sshFetchUserInfo(clientIp);
        if (clientInfo.success) {
          clientUsername = clientInfo.username;
          clientHostname = clientInfo.hostname;
        }
      }
    }

    return NextResponse.json({
      clientIp,
      serverHostname,
      serverUsername,
      clientUsername,
      clientHostname,
      remoteUsername,
      remoteHostname,
    });
  } catch {
    return NextResponse.json({ clientIp: '127.0.0.1', serverHostname: 'unknown', serverUsername: 'unknown', clientUsername: 'unknown', clientHostname: 'unknown' });
  }
}
