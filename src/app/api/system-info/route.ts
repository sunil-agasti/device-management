import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET(req: NextRequest) {
  try {
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';

    let serverHostname = 'unknown';
    let serverUsername = 'unknown';
    try {
      serverHostname = execSync('scutil --get ComputerName 2>/dev/null || hostname', { encoding: 'utf-8' }).trim();
      serverUsername = execSync('whoami', { encoding: 'utf-8' }).trim();
    } catch { /* ignore */ }

    let remoteUsername: string | undefined;
    let remoteHostname: string | undefined;

    if (clientIp.startsWith('17.')) {
      try {
        const output = execSync(
          `sshpass -p 'Tc\$@April2026' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 tcsadmin@${clientIp} "echo \\$(stat -f%Su /dev/console)|\\$(scutil --get ComputerName)" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 10000 }
        ).trim();
        const parts = output.split('|');
        if (parts.length === 2) {
          remoteUsername = parts[0];
          remoteHostname = parts[1];
        }
      } catch { /* SSH failed */ }
    }

    return NextResponse.json({ clientIp, serverHostname, serverUsername, remoteUsername, remoteHostname });
  } catch {
    return NextResponse.json({ clientIp: '127.0.0.1', serverHostname: 'unknown', serverUsername: 'unknown' });
  }
}
