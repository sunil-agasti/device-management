import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';
import { sendNotification, isLocalIp } from '@/lib/notify';
import { detectDevice } from '@/lib/device';

const execAsync = promisify(exec);

async function grantGithubLocal(duration: number): Promise<{ success: boolean; output: string }> {
  try {
    const cmds = [
      "sudo sed -i '' '/github.com/d' /etc/hosts",
      "sudo sed -i '' '/www.github.com/d' /etc/hosts",
      "sudo dscacheutil -flushcache",
      "sudo killall -HUP mDNSResponder",
    ];
    let output = '';
    for (const cmd of cmds) {
      try {
        const result = await execAsync(cmd, { timeout: 10000 });
        output += result.stdout + '\n';
      } catch (e) {
        output += `Warning: ${cmd} - ${e}\n`;
      }
    }

    // Send notification to current user
    await sendNotification('127.0.0.1', 'GitHub Access Granted',
      `GitHub access granted for ${duration} minutes.`);

    // Schedule revoke
    const revokeScript = `/tmp/github_revoke_${Date.now()}.sh`;
    const revokeContent = `#!/bin/bash
sleep ${duration * 60}
echo "127.0.0.1 github.com" | sudo tee -a /etc/hosts > /dev/null
echo "127.0.0.1 www.github.com" | sudo tee -a /etc/hosts > /dev/null
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
osascript -e 'display notification "GitHub access has been revoked." with title "GitHub Access Removed"'
rm -f "${revokeScript}"
`;
    await execAsync(`echo '${revokeContent.replace(/'/g, "'\\''")}' > "${revokeScript}" && chmod +x "${revokeScript}" && nohup bash "${revokeScript}" &>/dev/null &`);

    return { success: true, output: `GitHub unblocked locally. DNS cache flushed.\n${output}` };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}

async function grantGithubRemote(vpnIp: string, duration: number): Promise<{ success: boolean; output: string }> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'github-access.sh');
  try {
    const result = await execAsync(`bash "${scriptPath}" "${vpnIp}" "${duration * 60}"`, { timeout: 120000 });
    return { success: true, output: result.stdout };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, email, hostname, vpnIp, username, duration = 30, requestedBy } = body;

    const userAgent = req.headers.get('user-agent') || '';
    const device = detectDevice(userAgent);

    const checks = [validateVpnIp(vpnIp), validateEmployeeId(employeeId), validateEmail(email), validateDuration(duration)];
    for (const c of checks) {
      if (!c.valid) return NextResponse.json({ error: c.message }, { status: 400 });
    }

    upsertUser({ username: username || '', employeeId, email, hostname, vpnIp });

    const logId = crypto.randomUUID();
    addLog({
      id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'github', device,
    });

    // Determine if target is local machine or remote
    const local = isLocalIp(vpnIp);
    const result = local
      ? await grantGithubLocal(duration)
      : await grantGithubRemote(vpnIp, duration);

    if (!result.success) {
      updateLogStatus(logId, 'github', 'FAILED');
      return NextResponse.json({
        success: false, logId,
        error: `GitHub access grant failed: ${result.output}`,
      }, { status: 500 });
    }

    // NOTIFY: Access Granted (for remote targets)
    if (!local) {
      await sendNotification(vpnIp, 'GitHub Access Granted',
        `GitHub access granted for ${duration} minutes.`);
    }

    // 5 min before expiry: warning notification
    if (duration > 5) {
      setTimeout(async () => {
        const user = findUserByUsername(username || '');
        const ip = user?.vpnIp || vpnIp;
        await sendNotification(ip, 'Access Expiring Soon',
          `Your GitHub access will expire in 5 minutes.`);
      }, (duration - 5) * 60 * 1000);
    }

    setTimeout(() => { updateLogStatus(logId, 'github', 'REVOKED'); }, duration * 60 * 1000);

    return NextResponse.json({
      success: true, logId,
      message: `GitHub access granted${local ? ' (local)' : ''} for ${vpnIp}. Will auto-revoke in ${duration} minutes.`,
      output: result.output,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to grant GitHub access: ' + String(err) }, { status: 500 });
  }
}
