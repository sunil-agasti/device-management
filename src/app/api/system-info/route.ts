import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { sanitizeIp } from '@/lib/sanitize';
import { getSshCredentials, getSshpassPath, getSshOpts } from '@/lib/ssh';

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
      const { user, passwords } = getSshCredentials();
      const sshpass = getSshpassPath();
      const sshOpts = getSshOpts();
      for (const password of passwords) {
        try {
          const escapedPass = password.replace(/'/g, "'\\''");
          const output = execSync(
            `${sshpass} -p '${escapedPass}' ssh ${sshOpts} ${user}@${probeIp} "CONSOLE_USER=\\$(stat -f%Su /dev/console); HOSTNAME=\\$(scutil --get ComputerName); echo \\$CONSOLE_USER|\\$HOSTNAME"`,
            { encoding: 'utf-8', timeout: 15000 }
          ).trim();
          const lastLine = output.split('\n').pop() || '';
          const parts = lastLine.split('|');
          if (parts.length === 2 && parts[0] && parts[1]) {
            remoteUsername = parts[0].trim();
            remoteHostname = parts[1].trim();
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
