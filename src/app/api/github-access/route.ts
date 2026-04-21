import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, email, hostname, vpnIp, username, duration = 30, requestedBy } = body;

    const checks = [validateVpnIp(vpnIp), validateEmployeeId(employeeId), validateEmail(email), validateDuration(duration)];
    for (const c of checks) {
      if (!c.valid) return NextResponse.json({ error: c.message }, { status: 400 });
    }

    upsertUser({ username, employeeId, email, hostname, vpnIp });

    const logId = crypto.randomUUID();
    addLog({
      id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'github',
    });

    const scriptPath = path.join(process.cwd(), 'scripts', 'github-access.sh');
    // GitHub script creates a LaunchDaemon on the target machine that auto-revokes locally,
    // so it works even if the user's VPN IP changes. No server-side revoke needed.
    execAsync(`bash "${scriptPath}" "${vpnIp}" "${duration * 60}"`, { timeout: 120000 }).catch(() => {});

    // 5 min before expiry: send warning notification
    if (duration > 5) {
      setTimeout(async () => {
        const user = findUserByUsername(username || '');
        const ip = user?.vpnIp || vpnIp;
        try {
          await execAsync(
            `sshpass -p 'Tc\$@April2026' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 tcsadmin@${ip} "
              CONSOLE_USER=\\$(stat -f%Su /dev/console)
              USER_ID=\\$(id -u \\$CONSOLE_USER)
              sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display notification \\\"Your GitHub access will expire in 5 minutes.\\\" with title \\\"Access Expiring Soon\\\"'
            "`,
            { timeout: 15000 }
          );
        } catch { /* best effort */ }
      }, (duration - 5) * 60 * 1000);
    }

    // Update log status at expiry (the actual revoke happens via LaunchDaemon on the target)
    setTimeout(() => { updateLogStatus(logId, 'github', 'REVOKED'); }, duration * 60 * 1000);

    return NextResponse.json({
      success: true, logId,
      message: `GitHub access granted for ${vpnIp}. Will auto-revoke in ${duration} minutes.`,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to grant GitHub access: ' + String(err) }, { status: 500 });
  }
}
