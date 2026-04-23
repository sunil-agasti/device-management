import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';
import { sendNotification, isLocalIp } from '@/lib/notify';
import { detectDevice } from '@/lib/device';
import { sshRunCommand, getSshCredentials } from '@/lib/ssh';
import { formatSSHError } from '@/lib/errors';

const execAsync = promisify(exec);

interface StepResult {
  id: string;
  label: string;
  success: boolean;
  log: string;
}

async function grantGithubLocal(duration: number): Promise<{ success: boolean; steps: StepResult[] }> {
  const steps: StepResult[] = [];

  try {
    const cmds = [
      "sudo sed -i '' '/github.com/d' /etc/hosts",
      "sudo sed -i '' '/www.github.com/d' /etc/hosts",
      "sudo dscacheutil -flushcache",
      "sudo killall -HUP mDNSResponder",
    ];
    let log = '';
    for (const cmd of cmds) {
      try {
        await execAsync(cmd, { timeout: 10000 });
        log += `${cmd} ✓\n`;
      } catch { log += `${cmd} (skipped)\n`; }
    }
    steps.push({ id: 'unblock', label: 'Unblocking GitHub', success: true, log });
  } catch (e) {
    steps.push({ id: 'unblock', label: 'Unblocking GitHub', success: false, log: String(e) });
    return { success: false, steps };
  }

  try {
    await execAsync('sudo /usr/local/bin/jamf manage', { timeout: 60000 });
    await execAsync('sudo /usr/local/bin/jamf policy', { timeout: 60000 });
    await execAsync('sudo /usr/local/bin/jamf recon', { timeout: 60000 });
    steps.push({ id: 'jamf', label: 'Running JAMF Commands', success: true, log: 'jamf manage ✓\njamf policy ✓\njamf recon ✓' });
  } catch {
    steps.push({ id: 'jamf', label: 'Running JAMF Commands', success: true, log: 'JAMF not available (skipped)' });
  }

  const revokeScript = `/tmp/github_revoke_${Date.now()}.sh`;
  try {
    const content = `#!/bin/bash\nsleep ${duration * 60}\necho "127.0.0.1 github.com" | sudo tee -a /etc/hosts > /dev/null\necho "127.0.0.1 www.github.com" | sudo tee -a /etc/hosts > /dev/null\nsudo dscacheutil -flushcache\nsudo killall -HUP mDNSResponder\nosascript -e 'display notification "GitHub access revoked." with title "GitHub Access Removed" sound name "Glass"'\nrm -f "${revokeScript}"`;
    await execAsync(`echo '${content.replace(/'/g, "'\\''")}' > "${revokeScript}" && chmod +x "${revokeScript}" && nohup bash "${revokeScript}" &>/dev/null &`);
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: true, log: `Revoke scheduled in ${duration} minutes\n> echo "127.0.0.1 github.com" >> /etc/hosts\n> dscacheutil -flushcache` });
  } catch (e) {
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: false, log: String(e) });
  }

  return { success: true, steps };
}

function grantGithubRemote(vpnIp: string, duration: number): { success: boolean; steps: StepResult[] } {
  const steps: StepResult[] = [];
  const durationSec = duration * 60;
  const { passwords } = getSshCredentials();
  const pass = passwords[0] || '';
  const safePass = pass.replace(/'/g, "'\\''");

  const unblockCmd = `echo '${safePass}' | sudo -S sed -i '' '/github.com/d' /etc/hosts; echo '${safePass}' | sudo -S sed -i '' '/www.github.com/d' /etc/hosts; echo '${safePass}' | sudo -S dscacheutil -flushcache; echo '${safePass}' | sudo -S killall -HUP mDNSResponder && echo "UNBLOCK_OK" || echo "UNBLOCK_FAIL"`;
  const unblockResult = sshRunCommand(vpnIp, unblockCmd);
  const unblockOk = unblockResult.success && unblockResult.output.includes('UNBLOCK_OK');
  steps.push({
    id: 'unblock', label: 'Unblocking GitHub', success: unblockOk,
    log: `ssh tcsadmin@${vpnIp}\n> Remove github.com from /etc/hosts\n> Flush DNS cache\n${unblockResult.output}`,
  });
  if (!unblockOk) return { success: false, steps };

  // JAMF runs in background via script
  const scriptPath = path.join(process.cwd(), 'scripts', 'jamf-policies.sh');
  execAsync(`bash "${scriptPath}" "${vpnIp}"`, { timeout: 120000 }).catch(() => {});
  steps.push({
    id: 'jamf', label: 'Running JAMF Commands', success: true,
    log: `JAMF policies running in background\n> jamf manage\n> jamf policy\n> jamf recon`,
  });

  // Schedule revoke on remote machine
  const revokeCmd = `sudo tee /usr/local/bin/github_revoke.sh > /dev/null <<'REVOKE'
#!/bin/bash
sleep ${durationSec}
echo "127.0.0.1 github.com" | sudo tee -a /etc/hosts > /dev/null
echo "127.0.0.1 www.github.com" | sudo tee -a /etc/hosts > /dev/null
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
CONSOLE_USER=$(stat -f%Su /dev/console)
USER_ID=$(id -u $CONSOLE_USER)
sudo launchctl asuser $USER_ID sudo -u $CONSOLE_USER osascript -e 'display notification "GitHub access revoked." with title "GitHub Access Removed"'
rm -f /usr/local/bin/github_revoke.sh
REVOKE
sudo chmod +x /usr/local/bin/github_revoke.sh && nohup sudo /usr/local/bin/github_revoke.sh &>/dev/null & echo "SCHEDULE_OK"`;

  const schedResult = sshRunCommand(vpnIp, revokeCmd);
  steps.push({
    id: 'schedule', label: 'Scheduling auto-revoke', success: schedResult.success,
    log: `Auto-revoke in ${duration} minutes on remote machine\n> Block github.com in /etc/hosts\n> Flush DNS\n> Send revoke notification\n${schedResult.output}`,
  });

  return { success: true, steps };
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
    const local = isLocalIp(vpnIp);
    let result: { success: boolean; steps: StepResult[] };

    if (local) {
      result = await grantGithubLocal(duration);
    } else {
      result = grantGithubRemote(vpnIp, duration);
    }

    if (!result.success) {
      addLog({
        id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
        grantedAt: new Date().toISOString(), duration, revokedAt: null,
        status: 'FAILED', requestedBy: requestedBy || 'system', type: 'github', device,
      });
      return NextResponse.json({
        success: false, logId, steps: result.steps,
        error: result.steps.find(s => !s.success)?.log || 'Failed to grant access',
      }, { status: 500 });
    }

    addLog({
      id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'github', device,
    });

    // Notification
    const notified = await sendNotification(vpnIp, 'GitHub Access Granted',
      `GitHub access granted for ${duration} minutes.`);
    result.steps.push({
      id: 'notify', label: 'Sending notification', success: notified,
      log: notified ? `Notification sent to ${vpnIp}` : 'Notification failed (device may be unreachable)',
    });

    if (duration > 5) {
      setTimeout(async () => {
        const user = findUserByUsername(username || '');
        await sendNotification(user?.vpnIp || vpnIp, 'Access Expiring Soon',
          'Your GitHub access will expire in 5 minutes.');
      }, (duration - 5) * 60 * 1000);
    }

    setTimeout(() => { updateLogStatus(logId, 'github', 'REVOKED'); }, duration * 60 * 1000);

    return NextResponse.json({
      success: true, logId, steps: result.steps,
      message: `GitHub access granted${local ? ' (local)' : ''} for ${vpnIp}. Will auto-revoke in ${duration} minutes.`,
    });
  } catch (err) {
    return NextResponse.json({ error: formatSSHError('target', String(err)) }, { status: 500 });
  }
}
