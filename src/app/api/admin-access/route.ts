import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateHostname, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';

const execAsync = promisify(exec);

async function revokeAdminAccess(username: string, logId: string, originalIp: string) {
  const user = findUserByUsername(username);
  const currentIp = user?.vpnIp || originalIp;

  const passwords = ["Tc$@April2026", "tcs123"];

  for (const password of passwords) {
    try {
      await execAsync(
        `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${currentIp} "
          CONSOLE_USER=\\$(stat -f%Su /dev/console)
          echo '${password}' | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin
          USER_ID=\\$(id -u \\$CONSOLE_USER)
          sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display notification \\\"Your admin access has been revoked.\\\" with title \\\"Admin Access Removed\\\"'
        "`,
        { timeout: 30000 }
      );
      updateLogStatus(logId, 'admin', 'REVOKED');
      return;
    } catch {
      if (currentIp !== originalIp) {
        try {
          await execAsync(
            `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${originalIp} "
              CONSOLE_USER=\\$(stat -f%Su /dev/console)
              echo '${password}' | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin
            "`,
            { timeout: 30000 }
          );
          updateLogStatus(logId, 'admin', 'REVOKED');
          return;
        } catch { continue; }
      }
    }
  }

  updateLogStatus(logId, 'admin', 'FAILED');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, email, hostname, vpnIp, username, duration = 60, requestedBy } = body;

    const checks = [
      validateVpnIp(vpnIp), validateHostname(hostname),
      validateEmployeeId(employeeId), validateEmail(email), validateDuration(duration),
    ];
    for (const c of checks) {
      if (!c.valid) return NextResponse.json({ error: c.message }, { status: 400 });
    }

    upsertUser({ username, employeeId, email, hostname, vpnIp });

    const logId = crypto.randomUUID();
    addLog({
      id: logId, hostname, username, employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'admin',
    });

    const scriptPath = path.join(process.cwd(), 'scripts', 'user-admin.sh');
    execAsync(`bash "${scriptPath}" "${vpnIp}" "${duration}"`, { timeout: 120000 }).catch(() => {});

    // 5 min before expiry: send warning notification to the target machine
    if (duration > 5) {
      setTimeout(async () => {
        const user = findUserByUsername(username);
        const ip = user?.vpnIp || vpnIp;
        try {
          await execAsync(
            `sshpass -p 'Tc\$@April2026' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 tcsadmin@${ip} "
              CONSOLE_USER=\\$(stat -f%Su /dev/console)
              USER_ID=\\$(id -u \\$CONSOLE_USER)
              sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display notification \\\"Your admin access will expire in 5 minutes.\\\" with title \\\"Access Expiring Soon\\\"'
            "`,
            { timeout: 15000 }
          );
        } catch { /* best effort */ }
      }, (duration - 5) * 60 * 1000);
    }

    // At expiry: re-resolve IP from DB and revoke
    setTimeout(() => {
      revokeAdminAccess(username, logId, vpnIp);
    }, duration * 60 * 1000);

    return NextResponse.json({
      success: true, logId,
      message: `Admin access granted to ${username} on ${hostname}. Will auto-revoke in ${duration} minutes.`,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to grant admin access: ' + String(err) }, { status: 500 });
  }
}
