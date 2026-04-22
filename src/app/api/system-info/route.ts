import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { sanitizeIp } from '@/lib/sanitize';
import { getSshCredentials, sshExecSimple } from '@/lib/ssh';

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

    const probeIp = targetIp ? sanitizeIp(targetIp) : clientIp;

    if (probeIp && probeIp.startsWith('17.')) {
      const { passwords } = getSshCredentials();
      for (const password of passwords) {
        try {
          const output = sshExecSimple(
            probeIp,
            'CONSOLE_USER=$(stat -f%Su /dev/console); HOSTNAME=$(scutil --get ComputerName); echo __RESULT__:$CONSOLE_USER\\|$HOSTNAME',
            password,
            15000
          );
          const match = output.match(/__RESULT__:(.+)\|(.+)/);
          if (match) {
            remoteUsername = match[1].trim();
            remoteHostname = match[2].trim();
          }
          break;
        } catch { continue; }
      }
    }

    return NextResponse.json({ clientIp, serverHostname, serverUsername, remoteUsername, remoteHostname });
  } catch {
    return NextResponse.json({ clientIp: '127.0.0.1', serverHostname: 'unknown', serverUsername: 'unknown' });
  }
}
