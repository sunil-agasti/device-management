import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { addLog, updateLogStatus, upsertUser, findUserByUsername } from '@/lib/db';
import { validateVpnIp, validateHostname, validateEmployeeId, validateEmail, validateDuration } from '@/lib/validation';
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

async function grantAdminLocal(username: string, duration: number): Promise<{ success: boolean; steps: StepResult[] }> {
  const steps: StepResult[] = [];

  try {
    const r = await execAsync(`dseditgroup -o edit -a ${username} -t user admin`, { timeout: 10000 });
    steps.push({ id: 'grant', label: 'Granting admin access', success: true, log: `dseditgroup -o edit -a ${username} -t user admin\n${r.stdout || 'OK'}` });
  } catch {
    try {
      const r = await execAsync(`sudo dseditgroup -o edit -a ${username} -t user admin`, { timeout: 10000 });
      steps.push({ id: 'grant', label: 'Granting admin access', success: true, log: `sudo dseditgroup -o edit -a ${username} -t user admin\n${r.stdout || 'OK'}` });
    } catch (e2) {
      steps.push({ id: 'grant', label: 'Granting admin access', success: false, log: `Failed: ${e2}` });
      return { success: false, steps };
    }
  }

  try {
    await execAsync('sudo /usr/local/bin/jamf manage', { timeout: 60000 });
    await execAsync('sudo /usr/local/bin/jamf policy', { timeout: 60000 });
    await execAsync('sudo /usr/local/bin/jamf recon', { timeout: 60000 });
    steps.push({ id: 'jamf', label: 'Running JAMF Commands', success: true, log: 'jamf manage ✓\njamf policy ✓\njamf recon ✓' });
  } catch {
    steps.push({ id: 'jamf', label: 'Running JAMF Commands', success: true, log: 'JAMF not available on this machine (skipped)' });
  }

  const revokeScript = `/tmp/admin_revoke_${Date.now()}.sh`;
  const revokeContent = `#!/bin/bash\nsleep ${duration * 60}\n/usr/sbin/dseditgroup -o edit -d ${username} -t user admin 2>/dev/null || sudo /usr/sbin/dseditgroup -o edit -d ${username} -t user admin\nosascript -e 'display notification "Your admin access has been revoked." with title "Admin Access Removed" sound name "Glass"'\nrm -f "${revokeScript}"`;
  try {
    await execAsync(`cat > "${revokeScript}" << 'SCRIPT'\n${revokeContent}\nSCRIPT\nchmod +x "${revokeScript}" && nohup bash "${revokeScript}" &>/dev/null &`);
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: true, log: `Revoke scheduled in ${duration} minutes\nScript: ${revokeScript}` });
  } catch (e) {
    steps.push({ id: 'schedule', label: 'Scheduling auto-revoke', success: false, log: String(e) });
  }

  return { success: true, steps };
}

function grantAdminRemote(ip: string, username: string, duration: number): { success: boolean; steps: StepResult[] } {
  const steps: StepResult[] = [];
  const { passwords } = getSshCredentials();
  const pass = passwords[0] || '';
  const safePass = pass.replace(/'/g, "'\\''");

  const grantCmd = `CONSOLE_USER=$(stat -f%Su /dev/console); echo "User: $CONSOLE_USER"; echo '${safePass}' | sudo -S dseditgroup -o edit -a $CONSOLE_USER -t user admin 2>/dev/null && echo "GRANT_OK" || echo "GRANT_FAIL"`;
  const grantResult = sshRunCommand(ip, grantCmd);
  const grantOk = grantResult.success && grantResult.output.includes('GRANT_OK');
  steps.push({
    id: 'grant', label: 'Granting admin access', success: grantOk,
    log: `ssh tcsadmin@${ip}\n> sudo dseditgroup -o edit -a ${username} -t user admin\n${grantResult.output}`,
  });
  if (!grantOk) return { success: false, steps };

  const verifyResult = sshRunCommand(ip, `dseditgroup -o checkmember -m $(stat -f%Su /dev/console) admin 2>/dev/null`);
  const isMember = verifyResult.success && verifyResult.output.includes('is a member');
  steps[0].log += `\n> Verify: ${verifyResult.output.trim()}`;
  if (!isMember) {
    steps[0].success = false;
    steps[0].log += '\nUser NOT added to admin group';
    return { success: false, steps };
  }

  const jamfCmd = `echo '${safePass}' | sudo -S /usr/local/bin/jamf manage 2>&1 && echo "MANAGE_OK"; echo '${safePass}' | sudo -S /usr/local/bin/jamf policy 2>&1 && echo "POLICY_OK"; echo '${safePass}' | sudo -S /usr/local/bin/jamf recon 2>&1 && echo "RECON_OK"`;
  const jamfResult = sshRunCommand(ip, jamfCmd);

  // Also run JAMF policies in background via script for reliability
  const scriptPath = path.join(process.cwd(), 'scripts', 'jamf-policies.sh');
  execAsync(`bash "${scriptPath}" "${ip}"`, { timeout: 120000 }).catch(() => {});

  steps.push({
    id: 'jamf', label: 'Running JAMF Commands', success: jamfResult.success,
    log: `ssh tcsadmin@${ip}\n> jamf manage + policy + recon\n${jamfResult.output}`,
  });

  // Install revoke LaunchDaemon on remote machine (survives reboots)
  const revokeSec = duration * 60;
  const revokeCmd = `
CONSOLE_USER=$(stat -f%Su /dev/console)
USER_ID=$(id -u $CONSOLE_USER)

# Create revoke script
sudo tee /usr/local/bin/admin_revoke.sh > /dev/null <<'REVOKESCRIPT'
#!/bin/bash
sleep ${revokeSec}
CONSOLE_USER=$(stat -f%Su /dev/console)
USER_ID=$(id -u $CONSOLE_USER)

# Revoke admin
sudo /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin 2>/dev/null

# Verify
VERIFY=$(dseditgroup -o checkmember -m $CONSOLE_USER admin 2>/dev/null)
if echo "$VERIFY" | grep -q "is a member"; then
  # Force revoke - retry 5 times
  for i in 1 2 3 4 5; do
    sudo /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin 2>/dev/null
    sleep 2
  done
fi

# Notify user
sudo launchctl asuser $USER_ID sudo -u $CONSOLE_USER osascript -e 'display notification "Your admin access has been revoked." with title "Admin Access Removed" sound name "Glass"'

# Cleanup
sudo rm -f /usr/local/bin/admin_revoke.sh
sudo rm -f /Library/LaunchDaemons/com.tcs.admin.revoke.plist
REVOKESCRIPT
sudo chmod +x /usr/local/bin/admin_revoke.sh

# Create LaunchDaemon plist
sudo tee /Library/LaunchDaemons/com.tcs.admin.revoke.plist > /dev/null <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tcs.admin.revoke</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/usr/local/bin/admin_revoke.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLIST
sudo chown root:wheel /Library/LaunchDaemons/com.tcs.admin.revoke.plist
sudo chmod 644 /Library/LaunchDaemons/com.tcs.admin.revoke.plist

# Load the daemon
sudo launchctl bootstrap system /Library/LaunchDaemons/com.tcs.admin.revoke.plist 2>/dev/null || sudo launchctl load -w /Library/LaunchDaemons/com.tcs.admin.revoke.plist
echo "SCHEDULE_OK"
`;
  const schedResult = sshRunCommand(ip, revokeCmd);
  steps.push({
    id: 'schedule', label: 'Scheduling auto-revoke', success: schedResult.success && schedResult.output.includes('SCHEDULE_OK'),
    log: `LaunchDaemon installed on remote machine\n> /Library/LaunchDaemons/com.tcs.admin.revoke.plist\n> /usr/local/bin/admin_revoke.sh\n> Revoke in ${duration} minutes (survives reboot)\n> Force revoke if first attempt fails\n> Notification on revoke\n${schedResult.output}`,
  });

  return { success: true, steps };
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

  const revokeCmd = `CONSOLE_USER=$(stat -f%Su /dev/console); sudo /usr/sbin/dseditgroup -o edit -d $CONSOLE_USER -t user admin; dseditgroup -o checkmember -m $CONSOLE_USER admin 2>/dev/null`;

  for (const ip of [currentIp, originalIp]) {
    const result = sshRunCommand(ip, revokeCmd);
    if (result.success && result.output.includes('not a member')) {
      updateLogStatus(logId, 'admin', 'REVOKED');
      await sendNotification(ip, 'Admin Access Removed', 'Your admin access has been revoked.');
      return;
    }
  }
  updateLogStatus(logId, 'admin', 'FAILED');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, email, hostname, vpnIp, username, duration = 60, requestedBy } = body;

    const userAgent = req.headers.get('user-agent') || '';
    const device = detectDevice(userAgent);

    const checks = [
      validateVpnIp(vpnIp), validateHostname(hostname),
      validateEmployeeId(employeeId), validateEmail(email), validateDuration(duration),
    ];
    for (const c of checks) {
      if (!c.valid) return NextResponse.json({ error: c.message }, { status: 400 });
    }

    upsertUser({ username, employeeId, email, hostname, vpnIp });

    const logId = crypto.randomUUID();
    const local = isLocalIp(vpnIp);
    let result: { success: boolean; steps: StepResult[] };

    if (local) {
      result = await grantAdminLocal(username, duration);
    } else {
      result = grantAdminRemote(vpnIp, username, duration);
    }

    if (!result.success) {
      addLog({
        id: logId, hostname, username, employeeId, email, vpnIp,
        grantedAt: new Date().toISOString(), duration, revokedAt: null,
        status: 'FAILED', requestedBy: requestedBy || 'system', type: 'admin', device,
      });
      return NextResponse.json({
        success: false, logId, steps: result.steps,
        error: result.steps.find(s => !s.success)?.log || 'Failed to grant access',
      }, { status: 500 });
    }

    addLog({
      id: logId, hostname, username, employeeId, email, vpnIp,
      grantedAt: new Date().toISOString(), duration, revokedAt: null,
      status: 'GRANTED', requestedBy: requestedBy || 'system', type: 'admin', device,
    });

    // Send notification
    const notified = await sendNotification(vpnIp, 'Admin Access Granted',
      `You have been granted temporary admin access for ${duration} minutes.`);
    result.steps.push({
      id: 'notify', label: 'Sending notification', success: notified,
      log: notified ? `Notification sent to ${vpnIp}` : 'Notification failed (device may be unreachable)',
    });

    // 5 min before expiry warning
    if (duration > 5) {
      setTimeout(async () => {
        const u = findUserByUsername(username);
        await sendNotification(u?.vpnIp || vpnIp, 'Access Expiring Soon',
          'Your admin access will expire in 5 minutes.');
      }, (duration - 5) * 60 * 1000);
    }

    // Server-side backup revoke (in case LaunchDaemon fails)
    setTimeout(() => revokeAdminAccess(username, logId, vpnIp), (duration + 1) * 60 * 1000);

    return NextResponse.json({
      success: true, logId, steps: result.steps,
      message: `Admin access granted to ${username} on ${hostname}. Will auto-revoke in ${duration} minutes.`,
    });
  } catch (err) {
    return NextResponse.json({ error: formatSSHError('target', String(err)) }, { status: 500 });
  }
}
