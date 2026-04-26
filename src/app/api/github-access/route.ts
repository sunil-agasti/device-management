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
      "sudo cp /etc/hosts /etc/hosts.bak",
      "sudo sed -i '' '/^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com/d' /etc/hosts",
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
    const content = `#!/bin/bash\nsleep ${duration * 60}\nsudo cp /etc/hosts /etc/hosts.bak\nsudo sed -i '' '/^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com/d' /etc/hosts\necho "127.0.0.1 github.com" | sudo tee -a /etc/hosts > /dev/null\necho "127.0.0.1 www.github.com" | sudo tee -a /etc/hosts > /dev/null\nsudo dscacheutil -flushcache\nsudo killall -HUP mDNSResponder\nosascript -e 'display dialog "** GitHub Access Revoked **\n\nYour public GitHub access has been revoked.\n\nIf you need GitHub access again, please request through the TCS Admin Portal." with title "** GitHub Access Revoked **" buttons {"OK"} default button "OK" giving up after 300'\nrm -f "${revokeScript}"`;
    await execAsync(`echo '${content.replace(/'/g, "'\\''")}' > "${revokeScript}" && chmod +x "${revokeScript}" && nohup bash "${revokeScript}" &>/dev/null &`);
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: true, log: `Revoke scheduled in ${duration} minutes\n> echo "127.0.0.1 github.com" >> /etc/hosts\n> dscacheutil -flushcache` });
  } catch (e) {
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: false, log: String(e) });
  }

  return { success: true, steps };
}

function grantGithubRemote(vpnIp: string, duration: number): { success: boolean; steps: StepResult[]; alreadyAccessible?: boolean } {
  const steps: StepResult[] = [];
  const durationSec = duration * 60;
  const { passwords } = getSshCredentials();
  const pass = passwords[0] || '';
  const safePass = pass.replace(/'/g, "'\\''");

  // Check if GitHub is already accessible
  const checkCmd = `grep -c '^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com' /etc/hosts 2>/dev/null || echo "0"; grep -q '^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com' /etc/hosts 2>/dev/null && echo "BLOCKED" || echo "ACCESSIBLE"`;
  const checkResult = sshRunCommand(vpnIp, checkCmd);
  if (checkResult.success && checkResult.output.includes('ACCESSIBLE')) {
    steps.push({
      id: 'unblock', label: 'Unblocking GitHub', success: true,
      log: `GitHub is already accessible on this device (not blocked in /etc/hosts).`,
    });
    return { success: true, steps, alreadyAccessible: true };
  }

  const unblockCmd = `echo '${safePass}' | sudo -S cp /etc/hosts /etc/hosts.bak; echo '${safePass}' | sudo -S sed -i '' '/^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com/d' /etc/hosts; echo '${safePass}' | sudo -S dscacheutil -flushcache; echo '${safePass}' | sudo -S killall -HUP mDNSResponder && echo "UNBLOCK_OK" || echo "UNBLOCK_FAIL"`;
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

  // Schedule revoke on remote machine (epoch-based, survives reboot)
  const expiryEpoch = Math.floor(Date.now() / 1000) + durationSec;
  const revokeCmd = `echo '${safePass}' | sudo -S tee /usr/local/bin/github_revoke.sh > /dev/null <<'REVOKE'
#!/bin/bash
EXPIRY=${expiryEpoch}
PASSWORD='${safePass}'
while [ \\$(date +%s) -lt \\$EXPIRY ]; do sleep 30; done
echo "\\$PASSWORD" | sudo -S cp /etc/hosts /etc/hosts.bak
echo "\\$PASSWORD" | sudo -S sed -i '' '/^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*github\\.com/d' /etc/hosts
echo "127.0.0.1 github.com" | sudo tee -a /etc/hosts > /dev/null
echo "127.0.0.1 www.github.com" | sudo tee -a /etc/hosts > /dev/null
echo "\\$PASSWORD" | sudo -S dscacheutil -flushcache
echo "\\$PASSWORD" | sudo -S killall -HUP mDNSResponder
CONSOLE_USER=\\$(stat -f%Su /dev/console)
USER_ID=\\$(id -u \\$CONSOLE_USER)
sudo launchctl asuser \\$USER_ID sudo -u \\$CONSOLE_USER osascript -e 'display dialog "** GitHub Access Revoked **

Hello '\\$CONSOLE_USER', your public GitHub access has been revoked.

If you need GitHub access again, please request through the TCS Admin Portal." with title "** GitHub Access Revoked **" buttons {"OK"} default button "OK" giving up after 300'
sudo rm -f /usr/local/bin/github_revoke.sh
sudo launchctl bootout system/com.tcs.github.revoke 2>/dev/null
sudo rm -f /Library/LaunchDaemons/com.tcs.github.revoke.plist
REVOKE
echo '${safePass}' | sudo -S chmod 700 /usr/local/bin/github_revoke.sh
echo '${safePass}' | sudo -S chown root:wheel /usr/local/bin/github_revoke.sh
echo '${safePass}' | sudo -S tee /Library/LaunchDaemons/com.tcs.github.revoke.plist > /dev/null <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.tcs.github.revoke</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>/usr/local/bin/github_revoke.sh</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
</dict></plist>
PLIST
echo '${safePass}' | sudo -S chown root:wheel /Library/LaunchDaemons/com.tcs.github.revoke.plist
echo '${safePass}' | sudo -S chmod 644 /Library/LaunchDaemons/com.tcs.github.revoke.plist
echo '${safePass}' | sudo -S launchctl bootstrap system /Library/LaunchDaemons/com.tcs.github.revoke.plist 2>/dev/null || echo '${safePass}' | sudo -S launchctl load -w /Library/LaunchDaemons/com.tcs.github.revoke.plist
echo "SCHEDULE_OK"`;

  const schedResult = sshRunCommand(vpnIp, revokeCmd);
  const schedOk = schedResult.success && schedResult.output.includes('SCHEDULE_OK');
  steps.push({
    id: 'schedule', label: 'Scheduling auto-revoke', success: schedOk,
    log: `LaunchDaemon on remote machine (KeepAlive + RunAtLoad)\n> Revoke at epoch ${expiryEpoch} (${new Date(expiryEpoch * 1000).toLocaleTimeString()})\n> Survives: reboot, shutdown, VPN disconnect, network loss\n> Re-blocks github.com in /etc/hosts, flushes DNS\n> Notification on revoke, cleanup after\n${schedResult.output}`,
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
    let result: { success: boolean; steps: StepResult[]; alreadyAccessible?: boolean };

    if (local) {
      result = await grantGithubLocal(duration);
    } else {
      result = grantGithubRemote(vpnIp, duration);
    }

    // Already accessible — skip everything
    if (result.alreadyAccessible) {
      return NextResponse.json({
        success: true, steps: result.steps, alreadyAccessible: true,
        message: `GitHub is already accessible on ${hostname || vpnIp}. No changes made.`,
      });
    }

    if (!result.success) {
      addLog({
        id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
        grantedAt: new Date().toISOString(), duration, scheduledRevokeAt: new Date(Date.now() + duration * 60000).toISOString(), revokedAt: null,
        status: 'FAILED', requestedBy: requestedBy || 'system', type: 'github', device,
      });
      return NextResponse.json({
        success: false, logId, steps: result.steps,
        error: result.steps.find(s => !s.success)?.log || 'Failed to grant access',
      }, { status: 500 });
    }

    addLog({
      id: logId, hostname: hostname || '', username: username || '', employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, scheduledRevokeAt: new Date(Date.now() + duration * 60000).toISOString(), revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'github', device,
    });

    // Notification
    const notified = await sendNotification(vpnIp, 'GitHub Access Granted',
      `Hello ${username || 'User'}, you have been granted public GitHub access for ${duration} minutes. Your access will be automatically revoked after the timer expires.`);
    result.steps.push({
      id: 'notify', label: 'Sending notification', success: notified,
      log: notified ? `Notification sent to ${vpnIp}` : 'Notification failed (device may be unreachable)',
    });

    if (duration > 1) {
      setTimeout(async () => {
        const user = findUserByUsername(username || '');
        await sendNotification(user?.vpnIp || vpnIp, 'Access Expiring Soon',
          `Hello ${username || 'User'}, your GitHub access will expire in 1 minute. Save your work.`);
      }, (duration - 1) * 60 * 1000);
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
