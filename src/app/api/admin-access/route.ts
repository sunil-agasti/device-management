import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateHostname, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';
import { sendNotification, isLocalIp } from '@/lib/notify';

const execAsync = promisify(exec);

function getLocalIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = ['127.0.0.1', '::1'];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      ips.push(iface.address);
    }
  }
  return ips;
}

async function grantAdminLocal(username: string, duration: number): Promise<{ success: boolean; output: string }> {
  try {
    let output = '';
    // Grant admin locally
    try {
      const r = await execAsync(`dseditgroup -o edit -a ${username} -t user admin`, { timeout: 10000 });
      output += r.stdout;
    } catch (e) {
      // Try with sudo
      try {
        const r = await execAsync(`sudo dseditgroup -o edit -a ${username} -t user admin`, { timeout: 10000 });
        output += r.stdout;
      } catch (e2) {
        return { success: false, output: `Failed to grant admin: ${e2}` };
      }
    }

    // Run JAMF
    try {
      await execAsync('sudo /usr/local/bin/jamf manage', { timeout: 60000 });
      await execAsync('sudo /usr/local/bin/jamf recon', { timeout: 60000 });
      output += 'JAMF manage+recon completed\n';
    } catch { output += 'JAMF skipped (not available)\n'; }

    // Schedule local revoke
    const revokeScript = `/tmp/admin_revoke_${Date.now()}.sh`;
    const revokeContent = `#!/bin/bash
sleep ${duration * 60}
/usr/sbin/dseditgroup -o edit -d ${username} -t user admin 2>/dev/null || sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin
osascript -e 'display notification "Your admin access has been revoked." with title "Admin Access Removed" sound name "Glass"'
rm -f "${revokeScript}"
`;
    await execAsync(`cat > "${revokeScript}" << 'SCRIPT'\n${revokeContent}\nSCRIPT\nchmod +x "${revokeScript}" && nohup bash "${revokeScript}" &>/dev/null &`);

    return { success: true, output };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}

async function revokeAdminAccess(username: string, logId: string, originalIp: string) {
  const user = findUserByUsername(username);
  const currentIp = user?.vpnIp || originalIp;

  if (isLocalIp(currentIp) || isLocalIp(originalIp)) {
    try {
      await execAsync(`sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin`, { timeout: 10000 });
      updateLogStatus(logId, 'admin', 'REVOKED');
      await sendNotification(currentIp, 'Admin Access Removed', 'Your admin access has been revoked.');
      return;
    } catch { /* fall through to SSH */ }
  }

  const passwords = ["Tc$@April2026", "tcs123"];
  for (const password of passwords) {
    try {
      await execAsync(
        `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${currentIp} "
          CONSOLE_USER=\\$(stat -f%Su /dev/console)
          echo '${password}' | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin
        "`, { timeout: 30000 });
      updateLogStatus(logId, 'admin', 'REVOKED');
      await sendNotification(currentIp, 'Admin Access Removed', 'Your admin access has been revoked.');
      return;
    } catch {
      if (currentIp !== originalIp) {
        try {
          await execAsync(
            `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 tcsadmin@${originalIp} "
              CONSOLE_USER=\\$(stat -f%Su /dev/console)
              echo '${password}' | sudo -S /usr/sbin/dseditgroup -o edit -d \\$CONSOLE_USER -t user admin
            "`, { timeout: 30000 });
          updateLogStatus(logId, 'admin', 'REVOKED');
          await sendNotification(originalIp, 'Admin Access Removed', 'Your admin access has been revoked.');
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

    const local = isLocalIp(vpnIp);

    if (local) {
      const result = await grantAdminLocal(username, duration);
      if (!result.success) {
        updateLogStatus(logId, 'admin', 'FAILED');
        return NextResponse.json({ success: false, logId, error: result.output }, { status: 500 });
      }
    } else {
      const scriptPath = path.join(process.cwd(), 'scripts', 'user-admin.sh');
      execAsync(`bash "${scriptPath}" "${vpnIp}" "${duration}"`, { timeout: 120000 }).catch(() => {});
    }

    // NOTIFY: Access Granted
    await sendNotification(vpnIp, 'Admin Access Granted',
      `You have been granted temporary admin access for ${duration} minutes.`);

    // 5 min before expiry: warning notification
    if (duration > 5) {
      setTimeout(async () => {
        const user = findUserByUsername(username);
        const ip = user?.vpnIp || vpnIp;
        await sendNotification(ip, 'Access Expiring Soon',
          `Your admin access will expire in 5 minutes.`);
      }, (duration - 5) * 60 * 1000);
    }

    // At expiry: revoke + notification
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
