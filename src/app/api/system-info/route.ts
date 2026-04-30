import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { sanitizeIp } from '@/lib/sanitize';
import { sshFetchUserInfo } from '@/lib/ssh';
import { findUserByIp, upsertUser } from '@/lib/db';

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
    let sshError: string | undefined;
    let sshMethod: string | undefined;

    const probeIp = targetIp ? sanitizeIp(targetIp) : null;

    if (probeIp && probeIp.startsWith('17.')) {
      const result = sshFetchUserInfo(probeIp);
      sshMethod = result.method;
      if (result.success) {
        remoteUsername = result.username;
        remoteHostname = result.hostname;
      } else {
        sshError = result.error;
      }
    }

    // Detect the connecting user's identity from their client IP
    let clientUsername = serverUsername;
    let clientHostname = serverHostname;

    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1';

    if (!isLocal && clientIp.startsWith('17.')) {
      const dbUser = findUserByIp(clientIp);
      if (dbUser && dbUser.username) {
        clientUsername = dbUser.username;
        clientHostname = dbUser.hostname || clientHostname;
      } else {
        const clientSsh = sshFetchUserInfo(clientIp);
        if (clientSsh.success && clientSsh.username) {
          clientUsername = clientSsh.username;
          clientHostname = clientSsh.hostname || clientHostname;
          upsertUser({ username: clientSsh.username, hostname: clientSsh.hostname, vpnIp: clientIp });
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
      sshError,
      sshMethod,
    });
  } catch {
    return NextResponse.json({ clientIp: '127.0.0.1', serverHostname: 'unknown', serverUsername: 'unknown', clientUsername: 'unknown', clientHostname: 'unknown' });
  }
}
